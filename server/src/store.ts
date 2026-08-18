import { randomUUID } from 'node:crypto';
import type { DurableState, PersistedState } from './persistence.js';
import type {
  BulletinEntry,
  ChatMessage,
  Conversation,
  HeardStation,
  LogEntry,
  LogLevel,
  StationPosition,
  StationTelemetry,
  StationWeather,
  TelemetrySample,
  TransportId,
} from './types.js';
import {
  applyTelemetryMetadata,
  emptyTelemetryDefinitions,
} from './protocol/telemetry.js';
import type { WeatherReport } from './protocol/weather.js';

/** Rolling history limits; the dashboard only needs recent traffic. */
const MAX_MESSAGES = 1_000;
const MAX_LOGS = 500;
const MAX_HEARD_STATIONS = 60;
const MAX_POSITIONS = 500;
const MAX_WEATHER = 200;
const MAX_TELEMETRY_STATIONS = 80;
const MAX_TELEMETRY_SAMPLES = 120;
const MAX_BULLETINS = 300;
/** A packet heard twice within this window (RF + APRS-IS) counts as one. */
const DEDUPE_WINDOW_MS = 30_000;

export class Store {
  private messages: ChatMessage[] = [];
  private logs: LogEntry[] = [];
  private conversations = new Map<string, Conversation>();
  private heardStations = new Map<string, HeardStation>();
  private positions = new Map<string, StationPosition>();
  private weather = new Map<string, StationWeather>();
  private telemetry = new Map<string, StationTelemetry>();
  /** Keyed by from|addressee so a station can refresh each bulletin line. */
  private bulletins = new Map<string, BulletinEntry>();
  private recentPackets = new Map<string, number>();
  private onChange: (() => void) | null = null;

  /**
   * Registers a listener fired whenever durable state changes, so the caller
   * can persist it. Transient data (logs, heard stations) does not trigger it.
   */
  setChangeListener(listener: () => void): void {
    this.onChange = listener;
  }

  private notifyChange(): void {
    this.onChange?.();
  }

  /** Restores state read from disk. Ignores anything malformed. */
  hydrate(state: PersistedState): void {
    this.messages = state.messages
      .filter((message) => typeof message?.id === 'string' && typeof message.text === 'string')
      // An outgoing message left mid-flight has no retry timer any more.
      .map((message) =>
        message.ackState === 'pending' ? { ...message, ackState: 'failed' as const } : message,
      )
      .slice(-MAX_MESSAGES);

    for (const conversation of state.conversations) {
      if (typeof conversation?.callsign !== 'string') continue;
      this.conversations.set(conversation.callsign.toUpperCase(), conversation);
    }

    for (const position of state.positions) {
      if (typeof position?.callsign !== 'string') continue;
      if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) continue;
      this.positions.set(position.name ?? position.callsign, position);
    }
  }

  /** Durable slice of the state, for the persistence layer. */
  serialize(): DurableState {
    return {
      messages: this.messages,
      conversations: [...this.conversations.values()],
      positions: [...this.positions.values()],
    };
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getConversations(): Conversation[] {
    return [...this.conversations.values()].sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Guards against processing the same packet twice, which happens routinely
   * when a station is heard directly on RF and again through APRS-IS.
   */
  isDuplicate(from: string, info: string): boolean {
    const now = Date.now();
    for (const [key, seenAt] of this.recentPackets) {
      if (now - seenAt > DEDUPE_WINDOW_MS) this.recentPackets.delete(key);
    }

    const key = `${from}|${info}`;
    if (this.recentPackets.has(key)) return true;

    this.recentPackets.set(key, now);
    return false;
  }

  addMessage(message: Omit<ChatMessage, 'id'> & { id?: string }): ChatMessage {
    const stored: ChatMessage = { ...message, id: message.id ?? randomUUID() };
    this.messages.push(stored);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    this.notifyChange();
    return stored;
  }

  getMessage(id: string): ChatMessage | undefined {
    return this.messages.find((message) => message.id === id);
  }

  updateMessage(id: string, patch: Partial<ChatMessage>): ChatMessage | undefined {
    const message = this.messages.find((entry) => entry.id === id);
    if (!message) return undefined;
    Object.assign(message, patch);
    this.notifyChange();
    return { ...message };
  }

  /** Finds the outgoing message a received ACK/REJ refers to. */
  findPendingOutgoing(peer: string, messageId: string): ChatMessage | undefined {
    const normalized = peer.toUpperCase();
    return [...this.messages]
      .reverse()
      .find(
        (message) =>
          message.direction === 'outgoing' &&
          message.to.toUpperCase() === normalized &&
          message.messageId === messageId &&
          (message.ackState === 'pending' || message.ackState === 'sent'),
      );
  }

  /** Creates or refreshes the sidebar entry for a station. */
  touchConversation(
    callsign: string,
    patch: { lastMessage?: string; heardOn?: TransportId | null; incrementUnread?: boolean } = {},
  ): Conversation {
    const key = callsign.toUpperCase();
    const existing = this.conversations.get(key);

    const conversation: Conversation = existing ?? {
      callsign: key,
      lastActivity: Date.now(),
      lastMessage: '',
      unread: 0,
      heardOn: null,
    };

    conversation.lastActivity = Date.now();
    if (patch.lastMessage !== undefined) conversation.lastMessage = patch.lastMessage;
    if (patch.heardOn !== undefined) conversation.heardOn = patch.heardOn;
    if (patch.incrementUnread) conversation.unread += 1;

    this.conversations.set(key, conversation);
    this.notifyChange();
    return { ...conversation };
  }

  hasConversation(callsign: string): boolean {
    return this.conversations.has(callsign.toUpperCase());
  }

  /**
   * Removes a conversation together with its message history.
   * Returns the ids of the discarded messages so the caller can cancel any
   * retransmission still scheduled for them.
   */
  deleteConversation(callsign: string): string[] {
    const key = callsign.toUpperCase();
    const removed: string[] = [];

    this.messages = this.messages.filter((message) => {
      const peer = message.direction === 'outgoing' ? message.to : message.from;
      if (peer.toUpperCase() !== key) return true;
      removed.push(message.id);
      return false;
    });

    this.conversations.delete(key);
    this.notifyChange();
    return removed;
  }

  markConversationRead(callsign: string): Conversation | undefined {
    const conversation = this.conversations.get(callsign.toUpperCase());
    if (!conversation || conversation.unread === 0) return undefined;
    conversation.unread = 0;
    this.notifyChange();
    return { ...conversation };
  }

  getPositions(): StationPosition[] {
    return [...this.positions.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Removes every plotted station/object from the map (persisted). */
  clearPositions(): void {
    if (this.positions.size === 0) return;
    this.positions.clear();
    this.notifyChange();
  }

  /**
   * Stores the latest position for a station. Objects and items are keyed by
   * their own name so one station can report several of them.
   */
  recordPosition(position: StationPosition): void {
    this.positions.set(position.name ?? position.callsign, position);

    if (this.positions.size > MAX_POSITIONS) {
      for (const stale of this.getPositions().slice(MAX_POSITIONS)) {
        this.positions.delete(stale.name ?? stale.callsign);
      }
    }

    this.notifyChange();
  }

  getWeather(): StationWeather[] {
    return [...this.weather.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Stores the latest weather report for a station. */
  recordWeather(
    callsign: string,
    report: WeatherReport,
    transport: TransportId,
    timestamp = Date.now(),
  ): StationWeather {
    const entry: StationWeather = {
      callsign: callsign.toUpperCase(),
      ...report,
      transport,
      timestamp,
    };
    this.weather.set(entry.callsign, entry);

    if (this.weather.size > MAX_WEATHER) {
      for (const stale of this.getWeather().slice(MAX_WEATHER)) {
        this.weather.delete(stale.callsign);
      }
    }

    return entry;
  }

  getTelemetry(): StationTelemetry[] {
    return [...this.telemetry.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private ensureTelemetry(callsign: string, transport: TransportId): StationTelemetry {
    const key = callsign.toUpperCase();
    const existing = this.telemetry.get(key);
    if (existing) return existing;

    const created: StationTelemetry = {
      callsign: key,
      definitions: emptyTelemetryDefinitions(),
      samples: [],
      transport,
      updatedAt: Date.now(),
    };
    this.telemetry.set(key, created);
    return created;
  }

  /** Appends a `T#…` sample to a station's rolling history. */
  recordTelemetrySample(
    callsign: string,
    sample: Omit<TelemetrySample, 'timestamp'> & { timestamp?: number },
    transport: TransportId,
  ): StationTelemetry {
    const entry = this.ensureTelemetry(callsign, transport);
    entry.transport = transport;
    entry.updatedAt = sample.timestamp ?? Date.now();
    entry.samples.push({
      sequence: sample.sequence,
      analog: sample.analog,
      digital: sample.digital,
      timestamp: entry.updatedAt,
    });
    if (entry.samples.length > MAX_TELEMETRY_SAMPLES) {
      entry.samples.splice(0, entry.samples.length - MAX_TELEMETRY_SAMPLES);
    }

    if (this.telemetry.size > MAX_TELEMETRY_STATIONS) {
      for (const stale of this.getTelemetry().slice(MAX_TELEMETRY_STATIONS)) {
        this.telemetry.delete(stale.callsign);
      }
    }

    return { ...entry, samples: [...entry.samples], definitions: { ...entry.definitions } };
  }

  /** Merges PARM/UNIT/EQNS/BITS metadata for a telemetry station. */
  applyTelemetryDefinitions(callsign: string, text: string, transport: TransportId): StationTelemetry | null {
    const entry = this.ensureTelemetry(callsign, transport);
    const next = applyTelemetryMetadata(entry.definitions, text);
    if (!next) return null;
    entry.definitions = next;
    entry.transport = transport;
    entry.updatedAt = Date.now();
    return {
      ...entry,
      samples: [...entry.samples],
      definitions: {
        ...next,
        names: [...next.names],
        units: [...next.units],
        equations: next.equations.map((eq) => ({ ...eq })),
        bitSense: [...next.bitSense],
      },
    };
  }

  getBulletins(): BulletinEntry[] {
    return [...this.bulletins.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Stores or refreshes one bulletin line. The same originator + addressee
   * overwrites the previous text (APRS stations re-transmit the board).
   */
  recordBulletin(
    entry: Omit<BulletinEntry, 'id'> & { id?: string },
  ): BulletinEntry {
    const key = `${entry.from.toUpperCase()}|${entry.addressee.toUpperCase()}`;
    const stored: BulletinEntry = {
      ...entry,
      id: entry.id ?? key,
      from: entry.from.toUpperCase(),
      addressee: entry.addressee.toUpperCase(),
      group: entry.group.toUpperCase(),
    };
    this.bulletins.set(key, stored);

    if (this.bulletins.size > MAX_BULLETINS) {
      for (const stale of this.getBulletins().slice(MAX_BULLETINS)) {
        this.bulletins.delete(`${stale.from}|${stale.addressee}`);
      }
    }

    return { ...stored };
  }

  getHeardStations(): HeardStation[] {
    return [...this.heardStations.values()].sort((a, b) => b.lastHeard - a.lastHeard);
  }

  /** Records any station whose packet reached us, RF or internet. */
  recordHeard(callsign: string, transport: TransportId, dataType: string): void {
    const key = callsign.toUpperCase();
    this.heardStations.set(key, { callsign: key, lastHeard: Date.now(), transport, dataType });

    if (this.heardStations.size > MAX_HEARD_STATIONS) {
      const oldest = this.getHeardStations().slice(MAX_HEARD_STATIONS);
      for (const station of oldest) this.heardStations.delete(station.callsign);
    }
  }

  addLog(level: LogLevel, source: string, text: string): LogEntry {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      level,
      source,
      text,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    return entry;
  }

  clearLogs(): void {
    this.logs = [];
  }
}
