import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import type {
  AppSnapshot,
  AppUpdateInfo,
  BulletinEntry,
  ChatMessage,
  ClientToServerEvents,
  ConfigUpdateResult,
  Conversation,
  HeardStation,
  LogEntry,
  PublicConfig,
  SendMessageRequest,
  SendMessageResult,
  ServerToClientEvents,
  StationConfig,
  StationPosition,
  StationTelemetry,
  StationWeather,
  StatusSnapshot,
  TransportId,
} from '../types';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Client-side log history cap; the server keeps its own rolling buffer. */
const MAX_CLIENT_LOGS = 500;

const IDLE_STATUS: StatusSnapshot = {
  rf: {
    state: 'disconnected',
    detail: 'Waiting for the backend…',
    endpoint: '',
    connectedAt: null,
    lastRxAt: null,
    attempts: 0,
  },
  aprsis: {
    state: 'disconnected',
    detail: 'Waiting for the backend…',
    endpoint: '',
    connectedAt: null,
    lastRxAt: null,
    attempts: 0,
  },
};

/**
 * Single source of truth for the dashboard: owns the Socket.io session and
 * mirrors the server state (status, conversations, messages and logs).
 *
 * @param serverUrl Empty string = same origin (browser deploy). Non-empty =
 *   absolute backend URL used by the Android shell / remote clients.
 */
export function useAprsChat(serverUrl = '') {
  const socketRef = useRef<ChatSocket | null>(null);

  const [backendConnected, setBackendConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusSnapshot>(IDLE_STATUS);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [station, setStation] = useState('N0CALL');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [heard, setHeard] = useState<HeardStation[]>([]);
  const [positions, setPositions] = useState<StationPosition[]>([]);
  const [weather, setWeather] = useState<StationWeather[]>([]);
  const [telemetry, setTelemetry] = useState<StationTelemetry[]>([]);
  const [bulletins, setBulletins] = useState<BulletinEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeCallsign, setActiveCallsign] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    const options = {
      path: '/socket.io',
      // Polling first is more reliable from Capacitor WebViews on LAN Wi‑Fi;
      // websocket is negotiated afterwards when the proxy allows it.
      transports: ['polling', 'websocket'] as ('websocket' | 'polling')[],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      timeout: 12_000,
      forceNew: true,
    };
    const socket: ChatSocket = serverUrl ? io(serverUrl, options) : io(options);
    socketRef.current = socket;

    setBackendConnected(false);
    setConnectionError(null);

    socket.on('connect', () => {
      setBackendConnected(true);
      setConnectionError(null);
    });
    socket.on('disconnect', (reason) => {
      setBackendConnected(false);
      setStatus(IDLE_STATUS);
      if (reason !== 'io client disconnect') {
        setConnectionError(`Disconnected (${reason}). Retrying…`);
      }
    });
    socket.on('connect_error', (error) => {
      setBackendConnected(false);
      const hint = serverUrl
        ? `Cannot reach ${serverUrl}. Check Wi‑Fi, that the backend uses HOST=0.0.0.0, and the URL/port.`
        : 'Cannot reach the backend.';
      setConnectionError(`${hint} (${error.message})`);
    });

    socket.on('snapshot', (incoming: AppSnapshot) => {
      setStatus(incoming.status);
      setConfig(incoming.config);
      setStation(incoming.station);
      setConversations(incoming.conversations);
      setHeard(incoming.heard);
      setPositions(incoming.positions);
      setWeather(incoming.weather ?? []);
      setTelemetry(incoming.telemetry ?? []);
      setBulletins(incoming.bulletins ?? []);
      setMessages(incoming.messages);
      setLogs(incoming.logs.slice(-MAX_CLIENT_LOGS));
      setAppVersion(incoming.appVersion ?? null);
      setUpdate(incoming.update ?? null);
      setActiveCallsign((current) => current ?? incoming.conversations[0]?.callsign ?? null);
    });

    socket.on('status', setStatus);
    socket.on('config', (incoming, incomingStation) => {
      setConfig(incoming);
      setStation(incomingStation);
    });
    socket.on('conversations', setConversations);
    socket.on('heard', setHeard);
    socket.on('positions', setPositions);
    socket.on('positions:cleared', () => setPositions([]));
    socket.on('weather', setWeather);
    socket.on('telemetry', setTelemetry);
    socket.on('bulletins', setBulletins);

    socket.on('conversation:deleted', (callsign) => {
      const target = callsign.toUpperCase();
      setMessages((current) =>
        current.filter((message) =>
          message.direction === 'outgoing'
            ? message.to.toUpperCase() !== target
            : message.from.toUpperCase() !== target,
        ),
      );
      setActiveCallsign((current) => (current?.toUpperCase() === target ? null : current));
    });

    socket.on('message', (message) => {
      setMessages((current) =>
        current.some((entry) => entry.id === message.id) ? current : [...current, message],
      );
    });

    socket.on('message:update', (message) => {
      setMessages((current) =>
        current.map((entry) => (entry.id === message.id ? message : entry)),
      );
    });

    socket.on('log', (entry) => {
      setLogs((current) => [...current, entry].slice(-MAX_CLIENT_LOGS));
    });

    socket.on('logs:cleared', () => setLogs([]));
    socket.on('update', setUpdate);

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
    };
  }, [serverUrl]);

  const reconnectBackend = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  const openConversation = useCallback((callsign: string) => {
    setActiveCallsign(callsign);
    socketRef.current?.emit('conversation:open', callsign);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.callsign === callsign ? { ...conversation, unread: 0 } : conversation,
      ),
    );
  }, []);

  const createConversation = useCallback(
    (callsign: string) =>
      new Promise<{ ok: boolean; error?: string; callsign?: string }>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'The backend is not connected.' });
          return;
        }
        socket.emit('conversation:create', callsign, (result) => {
          if (result.ok && result.callsign) setActiveCallsign(result.callsign);
          resolve(result);
        });
      }),
    [],
  );

  const deleteConversation = useCallback(
    (callsign: string) =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'The backend is not connected.' });
          return;
        }
        socket.emit('conversation:delete', callsign, resolve);
      }),
    [],
  );

  const deleteConversations = useCallback(
    (callsigns: string[]) =>
      new Promise<{ ok: boolean; error?: string; deleted?: string[] }>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'The backend is not connected.' });
          return;
        }
        socket.emit('conversations:delete', callsigns, resolve);
      }),
    [],
  );

  const sendMessage = useCallback(
    (request: SendMessageRequest) =>
      new Promise<SendMessageResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'The backend is not connected.' });
          return;
        }
        socket.emit('message:send', request, resolve);
      }),
    [],
  );

  const updateConfig = useCallback(
    (patch: Partial<StationConfig>) =>
      new Promise<ConfigUpdateResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'The backend is not connected.' });
          return;
        }
        socket.emit('config:update', patch, resolve);
      }),
    [],
  );

  const reconnect = useCallback((transport: TransportId) => {
    socketRef.current?.emit('connector:reconnect', transport);
  }, []);

  const clearLogs = useCallback(() => {
    socketRef.current?.emit('logs:clear');
    setLogs([]);
  }, []);

  const clearMapPositions = useCallback(() => {
    socketRef.current?.emit('positions:clear');
    setPositions([]);
  }, []);

  /** Messages belonging to the selected conversation, oldest first. */
  const activeMessages = useMemo<ChatMessage[]>(() => {
    if (!activeCallsign) return [];
    const target = activeCallsign.toUpperCase();
    return messages
      .filter((message) =>
        message.direction === 'outgoing'
          ? message.to.toUpperCase() === target
          : message.from.toUpperCase() === target,
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, activeCallsign]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.callsign === activeCallsign) ?? null,
    [conversations, activeCallsign],
  );

  return {
    backendConnected,
    connectionError,
    status,
    config,
    station,
    conversations,
    heard,
    positions,
    weather,
    telemetry,
    bulletins,
    logs,
    appVersion,
    update,
    activeCallsign,
    activeConversation,
    activeMessages,
    openConversation,
    createConversation,
    deleteConversation,
    deleteConversations,
    sendMessage,
    updateConfig,
    reconnect,
    reconnectBackend,
    clearLogs,
    clearMapPositions,
  };
}

export type AprsChat = ReturnType<typeof useAprsChat>;
