import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server as SocketIoServer, type Socket } from 'socket.io';

import { APP_NAME, APP_VERSION, getClientIdentity } from './client-identity.js';
import { ConfigStore } from './config.js';
import { AprsIsConnector } from './connectors/aprsis.js';
import { DirewolfConnector } from './connectors/direwolf.js';
import {
  APRS_MAX_MESSAGE_LENGTH,
  buildAckPayload,
  buildMessagePayload,
  callsignEquals,
  describeDataType,
  escapeNonPrintable,
  isBulletin,
  nextMessageId,
  parseAprsMessage,
  parseBulletinAddress,
  sanitizeMessageText,
  unwrapThirdParty,
} from './protocol/aprs.js';
import { formatAddress, type Ax25Frame } from './protocol/ax25.js';
import { parseAprsPosition } from './protocol/position.js';
import { isTelemetryMetadata, parseTelemetryData } from './protocol/telemetry.js';
import { parseAprsWeather } from './protocol/weather.js';
import { BeaconScheduler } from './beacon.js';
import { HistoryStore } from './persistence.js';
import { isPackaged, webRoot } from './runtime-paths.js';
import { startUpdateChecker } from './github-release.js';
import { Store } from './store.js';
import type {
  AppSnapshot,
  AppUpdateInfo,
  ChatMessage,
  ClientToServerEvents,
  LogLevel,
  SendMessageRequest,
  SendMessageResult,
  ServerToClientEvents,
  StationConfig,
  StatusSnapshot,
  TransportId,
} from './types.js';

/**
 * Delays between retransmissions of a message awaiting an ACK. The APRS
 * specification recommends increasing intervals; five attempts is the common
 * behaviour of desktop clients.
 */
const ACK_RETRY_DELAYS_MS = [15_000, 25_000, 40_000, 60_000];
/** The heard-stations list is refreshed at most this often on a busy feed. */
const HEARD_BROADCAST_INTERVAL_MS = 2_000;

const HTTP_PORT = Number.parseInt(process.env.PORT ?? '3001', 10);
const HTTP_HOST = process.env.HOST ?? '0.0.0.0';

const config = new ConfigStore();
const store = new Store();
const history = new HistoryStore();
let latestUpdate: AppUpdateInfo | null = null;

const restored = history.load();
if (restored) store.hydrate(restored);

store.setChangeListener(() => history.scheduleSave(() => store.serialize()));

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

const io = new SocketIoServer<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: true },
});

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/** ANSI colours matching the log console: green Tx, cyan Rx, yellow IS, red errors. */
const CONSOLE_COLORS: Record<LogLevel, string> = {
  'rf-tx': '\x1b[32m',
  'rf-rx': '\x1b[36m',
  aprsis: '\x1b[33m',
  error: '\x1b[31m',
  system: '\x1b[90m',
};
const COLOR_RESET = '\x1b[0m';
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function log(level: LogLevel, source: string, text: string): void {
  // Packets arrive from the air and from the internet, so nothing reaching a
  // log is trusted enough to be printed verbatim.
  const safe = escapeNonPrintable(text);
  const entry = store.addLog(level, source, safe);
  io.emit('log', entry);

  // The terminal gets the same stream: without it the backend is a black box.
  const line = `${new Date().toTimeString().slice(0, 8)} [${source}] ${safe}`;
  console.log(useColor ? `${CONSOLE_COLORS[level]}${line}${COLOR_RESET}` : line);
}

let heardBroadcastTimer: NodeJS.Timeout | null = null;
function scheduleHeardBroadcast(): void {
  if (heardBroadcastTimer) return;
  heardBroadcastTimer = setTimeout(() => {
    heardBroadcastTimer = null;
    io.emit('heard', store.getHeardStations());
  }, HEARD_BROADCAST_INTERVAL_MS);
}

let positionBroadcastTimer: NodeJS.Timeout | null = null;
function schedulePositionBroadcast(): void {
  if (positionBroadcastTimer) return;
  positionBroadcastTimer = setTimeout(() => {
    positionBroadcastTimer = null;
    io.emit('positions', store.getPositions());
  }, HEARD_BROADCAST_INTERVAL_MS);
}

let weatherBroadcastTimer: NodeJS.Timeout | null = null;
function scheduleWeatherBroadcast(): void {
  if (weatherBroadcastTimer) return;
  weatherBroadcastTimer = setTimeout(() => {
    weatherBroadcastTimer = null;
    io.emit('weather', store.getWeather());
  }, HEARD_BROADCAST_INTERVAL_MS);
}

let telemetryBroadcastTimer: NodeJS.Timeout | null = null;
function scheduleTelemetryBroadcast(): void {
  if (telemetryBroadcastTimer) return;
  telemetryBroadcastTimer = setTimeout(() => {
    telemetryBroadcastTimer = null;
    io.emit('telemetry', store.getTelemetry());
  }, HEARD_BROADCAST_INTERVAL_MS);
}

let bulletinBroadcastTimer: NodeJS.Timeout | null = null;
function scheduleBulletinBroadcast(): void {
  if (bulletinBroadcastTimer) return;
  bulletinBroadcastTimer = setTimeout(() => {
    bulletinBroadcastTimer = null;
    io.emit('bulletins', store.getBulletins());
  }, HEARD_BROADCAST_INTERVAL_MS);
}

function currentStatus(): StatusSnapshot {
  return { rf: direwolf.getStatus(), aprsis: aprsIs.getStatus() };
}

function broadcastStatus(): void {
  io.emit('status', currentStatus());
}

function snapshot(): AppSnapshot {
  return {
    config: config.toPublic(),
    status: currentStatus(),
    conversations: store.getConversations(),
    messages: store.getMessages(),
    heard: store.getHeardStations(),
    positions: store.getPositions(),
    weather: store.getWeather(),
    telemetry: store.getTelemetry(),
    bulletins: store.getBulletins(),
    logs: store.getLogs(),
    station: config.station,
    appVersion: APP_VERSION,
    clientIdentity: getClientIdentity(),
    update: latestUpdate,
  };
}

// ---------------------------------------------------------------------------
// Network connectors
// ---------------------------------------------------------------------------

const direwolf = new DirewolfConnector(config, {
  onStatus: () => broadcastStatus(),
  onLog: log,
  onFrame: (frame, raw) => handleInboundFrame(frame, raw, 'rf'),
});

const aprsIs = new AprsIsConnector(config, {
  onStatus: () => broadcastStatus(),
  onLog: log,
  onFrame: (frame, raw) => handleInboundFrame(frame, raw, 'aprsis'),
});

function applyConnectorState(settings: StationConfig, restart: TransportId[] = []): void {
  if (settings.enableRf) {
    if (restart.includes('rf') || !direwolf.isConnected) direwolf.restart();
  } else {
    direwolf.stop('Disabled in configuration');
  }

  if (settings.enableAprsIs) {
    if (restart.includes('aprsis') || !aprsIs.isConnected) aprsIs.restart();
  } else {
    aprsIs.stop('Disabled in configuration');
  }
}

// ---------------------------------------------------------------------------
// Inbound packet routing
// ---------------------------------------------------------------------------

function handleInboundFrame(frame: Ax25Frame, raw: string, transport: TransportId): void {
  const outerFrom = formatAddress(frame.source);
  let info = frame.info.toString('latin1');
  let from = outerFrom;
  let destination = formatAddress(frame.destination);
  const station = config.station;

  // Our own digipeated echoes; leave them alone.
  if (callsignEquals(outerFrom, station)) return;

  store.recordHeard(outerFrom, transport, describeDataType(info));

  // Igates gate internet traffic onto RF as third-party packets (data type '}').
  // The enclosed station is the real peer for chat and acknowledgements.
  const thirdParty = unwrapThirdParty(info);
  if (thirdParty) {
    from = thirdParty.source;
    destination = thirdParty.destination;
    info = thirdParty.info;
    if (callsignEquals(from, station)) return;
    store.recordHeard(from, transport, describeDataType(info));
  }

  scheduleHeardBroadcast();

  // Weather may ride on a position with symbol `_`, or arrive as `_` / `*`.
  const weather = parseAprsWeather(info);
  if (weather) {
    store.recordWeather(from, weather, transport);
    scheduleWeatherBroadcast();
  }

  // Position reports are the bulk of APRS traffic and feed the map.
  const position = parseAprsPosition(info, destination);
  if (position) {
    // For weather symbols the CSE/SPD slot is wind, and lettered fields would
    // otherwise linger in the free-form comment — keep the cleaned leftover.
    const comment =
      weather && position.symbolCode === '_' ? weather.comment : position.comment;
    store.recordPosition({
      ...position,
      comment,
      callsign: from,
      transport,
      timestamp: Date.now(),
    });
    schedulePositionBroadcast();
  }

  // Telemetry data (T#…) is not a message; metadata arrives as PARM/UNIT/….
  const telemetrySample = parseTelemetryData(info);
  if (telemetrySample) {
    store.recordTelemetrySample(from, telemetrySample, transport);
    scheduleTelemetryBroadcast();
  }

  const parsed = parseAprsMessage(info);
  if (!parsed) return;

  // Telemetry labels/scaling are self-addressed messages, not chat.
  if (isTelemetryMetadata(parsed.text)) {
    store.applyTelemetryDefinitions(parsed.addressee, parsed.text, transport);
    scheduleTelemetryBroadcast();
    return;
  }

  // Bulletins / announcements (BLN…) are network board traffic, not 1:1 chat.
  const bulletinAddress = parseBulletinAddress(parsed.addressee);
  if (bulletinAddress && parsed.kind === 'message') {
    if (store.isDuplicate(from, info)) {
      log('system', 'Router', `Duplicate packet from ${from} ignored.`);
      return;
    }

    store.recordBulletin({
      from,
      addressee: bulletinAddress.addressee,
      group: bulletinAddress.group,
      lineId: bulletinAddress.lineId,
      text: parsed.text,
      transport,
      timestamp: Date.now(),
      raw,
    });
    scheduleBulletinBroadcast();
    return;
  }

  const addressedToUs = callsignEquals(parsed.addressee, station);
  if (!addressedToUs && !isBulletin(parsed.addressee)) return;

  if (store.isDuplicate(from, info)) {
    log('system', 'Router', `Duplicate packet from ${from} ignored.`);
    return;
  }

  if (parsed.kind === 'ack' || parsed.kind === 'rej') {
    resolveAcknowledgement(from, parsed.messageId, parsed.kind);
    return;
  }

  // A reply-ack piggybacks the acknowledgement of our previous message.
  if (parsed.replyAck) resolveAcknowledgement(from, parsed.replyAck, 'ack');

  const message = store.addMessage({
    from,
    to: parsed.addressee,
    text: parsed.text,
    direction: 'incoming',
    transport,
    timestamp: Date.now(),
    messageId: parsed.messageId,
    raw,
  });

  store.touchConversation(from, {
    lastMessage: parsed.text,
    heardOn: transport,
    incrementUnread: true,
  });

  io.emit('message', message);
  io.emit('conversations', store.getConversations());

  // Bulletins are broadcast traffic and must never be acknowledged.
  const settings = config.get();
  if (settings.autoAck && parsed.messageId && addressedToUs && !isBulletin(parsed.addressee)) {
    sendAck(from, parsed.messageId, transport);
  }
}

function resolveAcknowledgement(
  from: string,
  messageId: string | undefined,
  kind: 'ack' | 'rej',
): void {
  if (!messageId) return;

  const pending = store.findPendingOutgoing(from, messageId);
  if (!pending) {
    log('system', 'Router', `Received ${kind} ${messageId} from ${from} with no message pending.`);
    return;
  }

  cancelRetries(pending.id);
  const updated = store.updateMessage(pending.id, {
    ackState: kind === 'ack' ? 'acked' : 'rejected',
  });

  if (updated) io.emit('message:update', updated);
  log('system', 'Router', `${from} ${kind === 'ack' ? 'acknowledged' : 'rejected'} message ${messageId}.`);
}

function sendAck(to: string, messageId: string, transport: TransportId): void {
  const result = transmit(transport, buildAckPayload(to, messageId));
  if (!result.ok) {
    log('error', 'Router', `Unable to acknowledge ${messageId} to ${to}: ${result.error}`);
  }
}

// ---------------------------------------------------------------------------
// Outbound path
// ---------------------------------------------------------------------------

function transmit(
  transport: TransportId,
  info: string,
): { ok: boolean; raw: string; error?: string } {
  return transport === 'rf' ? direwolf.transmit(info) : aprsIs.transmit(info);
}

const beacon = new BeaconScheduler(
  config,
  (transport, info) => {
    const result = transmit(transport, info);
    return { ok: result.ok, error: result.error };
  },
  log,
);

const retryTimers = new Map<string, NodeJS.Timeout>();

function cancelRetries(messageKey: string): void {
  const timer = retryTimers.get(messageKey);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(messageKey);
  }
}

/** Retransmits an unacknowledged message until the retry budget is spent. */
function scheduleRetry(message: ChatMessage, payload: string, attempt: number): void {
  const delay = ACK_RETRY_DELAYS_MS[attempt];
  if (delay === undefined) {
    const updated = store.updateMessage(message.id, { ackState: 'failed' });
    if (updated) io.emit('message:update', updated);
    log('error', 'Messaging', `No acknowledgement from ${message.to} for message ${message.messageId}.`);
    return;
  }

  const timer = setTimeout(() => {
    retryTimers.delete(message.id);

    const current = store.getMessage(message.id);
    if (!current || current.ackState === 'acked' || current.ackState === 'rejected') return;

    const result = transmit(message.transport, payload);
    const updated = store.updateMessage(message.id, {
      attempts: (current.attempts ?? 1) + 1,
      ackState: result.ok ? 'sent' : 'failed',
    });
    if (updated) io.emit('message:update', updated);

    if (!result.ok) {
      log('error', 'Messaging', `Retry ${attempt + 1} failed: ${result.error}`);
      return;
    }

    log(
      'system',
      'Messaging',
      `Retry ${attempt + 1}/${ACK_RETRY_DELAYS_MS.length} of message ${message.messageId} to ${message.to}.`,
    );
    scheduleRetry(message, payload, attempt + 1);
  }, delay);

  retryTimers.set(message.id, timer);
}

function sendMessage(request: SendMessageRequest): SendMessageResult {
  const to = request.to?.trim().toUpperCase() ?? '';
  if (!/^[A-Z0-9]{1,6}(-[0-9]{1,2})?$/.test(to)) {
    return { ok: false, error: 'Invalid destination callsign.' };
  }

  const text = sanitizeMessageText(request.text ?? '');
  if (text.trim() === '') {
    return { ok: false, error: 'The message is empty.' };
  }
  if ((request.text ?? '').length > APRS_MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `APRS messages are limited to ${APRS_MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  const transport: TransportId = request.transport === 'aprsis' ? 'aprsis' : 'rf';
  const messageId = request.requestAck ? nextMessageId() : undefined;
  const payload = buildMessagePayload(to, text, messageId);

  const message = store.addMessage({
    from: config.station,
    to,
    text,
    direction: 'outgoing',
    transport,
    timestamp: Date.now(),
    messageId,
    ackState: messageId ? 'pending' : undefined,
    attempts: 1,
  });

  const result = transmit(transport, payload);
  const updated =
    store.updateMessage(message.id, {
      raw: result.raw,
      ackState: result.ok ? (messageId ? 'sent' : undefined) : 'failed',
    }) ?? message;

  store.touchConversation(to, { lastMessage: text, heardOn: null });

  io.emit('message', updated);
  io.emit('conversations', store.getConversations());

  if (!result.ok) return { ok: false, error: result.error, message: updated };
  if (messageId) scheduleRetry(updated, payload, 0);

  return { ok: true, message: updated };
}

// ---------------------------------------------------------------------------
// Socket.io API
// ---------------------------------------------------------------------------

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  socket.emit('snapshot', snapshot());

  socket.on('message:send', (request, callback) => {
    const result = sendMessage(request);
    if (typeof callback === 'function') callback(result);
  });

  socket.on('config:update', (patch, callback) => {
    try {
      const { config: updated, restart } = config.update(patch);
      io.emit('config', config.toPublic(), config.station);
      log('system', 'Config', `Configuration updated for station ${config.station}.`);
      applyConnectorState(updated, restart);
      beacon.restart();
      if (typeof callback === 'function') callback({ ok: true, config: config.toPublic() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid configuration.';
      log('error', 'Config', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('connector:reconnect', (transport) => {
    const settings = config.get();
    if (transport === 'rf') {
      if (!settings.enableRf) {
        log('error', 'KISS', 'The RF connector is disabled in the configuration.');
        return;
      }
      log('system', 'KISS', 'Manual reconnection requested.');
      direwolf.restart();
      return;
    }

    if (!settings.enableAprsIs) {
      log('error', 'APRS-IS', 'The APRS-IS connector is disabled in the configuration.');
      return;
    }
    log('system', 'APRS-IS', 'Manual reconnection requested.');
    aprsIs.restart();
  });

  socket.on('conversation:open', (callsign) => {
    const conversation = store.markConversationRead(callsign);
    if (conversation) io.emit('conversations', store.getConversations());
  });

  socket.on('conversation:create', (callsign, callback) => {
    const target = callsign?.trim().toUpperCase() ?? '';
    if (!/^[A-Z0-9]{1,6}(-[0-9]{1,2})?$/.test(target)) {
      if (typeof callback === 'function') callback({ ok: false, error: 'Invalid callsign.' });
      return;
    }
    store.touchConversation(target);
    io.emit('conversations', store.getConversations());
    if (typeof callback === 'function') callback({ ok: true, callsign: target });
  });

  socket.on('conversation:delete', (callsign, callback) => {
    const target = callsign?.trim().toUpperCase() ?? '';
    if (!store.hasConversation(target)) {
      if (typeof callback === 'function') callback({ ok: false, error: 'Unknown conversation.' });
      return;
    }

    const removed = store.deleteConversation(target);
    // Stop retransmitting messages the operator just discarded.
    for (const id of removed) cancelRetries(id);

    io.emit('conversation:deleted', target);
    io.emit('conversations', store.getConversations());
    log('system', 'Router', `Conversation with ${target} deleted (${removed.length} messages).`);

    if (typeof callback === 'function') callback({ ok: true });
  });

  socket.on('conversations:delete', (callsigns, callback) => {
    const targets = [
      ...new Set(
        (Array.isArray(callsigns) ? callsigns : [])
          .map((callsign) => (typeof callsign === 'string' ? callsign.trim().toUpperCase() : ''))
          .filter((callsign) => callsign !== ''),
      ),
    ];

    if (targets.length === 0) {
      if (typeof callback === 'function') {
        callback({ ok: false, error: 'No conversations selected.' });
      }
      return;
    }

    const deleted: string[] = [];
    let messageCount = 0;

    for (const target of targets) {
      if (!store.hasConversation(target)) continue;
      const removed = store.deleteConversation(target);
      for (const id of removed) cancelRetries(id);
      deleted.push(target);
      messageCount += removed.length;
      io.emit('conversation:deleted', target);
    }

    if (deleted.length === 0) {
      if (typeof callback === 'function') {
        callback({ ok: false, error: 'None of those conversations exist.' });
      }
      return;
    }

    io.emit('conversations', store.getConversations());
    log(
      'system',
      'Router',
      `Deleted ${deleted.length} conversation(s) (${messageCount} messages): ${deleted.join(', ')}.`,
    );

    if (typeof callback === 'function') callback({ ok: true, deleted });
  });

  socket.on('logs:clear', () => {
    store.clearLogs();
    io.emit('logs:cleared');
  });

  socket.on('positions:clear', () => {
    store.clearPositions();
    io.emit('positions', store.getPositions());
    io.emit('positions:cleared');
    log('system', 'Router', 'Map positions cleared.');
  });
});

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

app.get('/api/health', async () => ({
  app: APP_NAME,
  version: APP_VERSION,
  station: config.station,
  status: currentStatus(),
}));

app.get('/api/snapshot', async () => snapshot());

// In production / packaged builds the frontend is served from the same port.
const webDist = webRoot();
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}

await app.listen({ port: HTTP_PORT, host: HTTP_HOST });
log('system', 'Server', `${APP_NAME} ${APP_VERSION} listening on ${HTTP_HOST}:${HTTP_PORT}.`);
log('system', 'Server', `Station callsign: ${config.station}.`);
applyConnectorState(config.get());
beacon.restart();

startUpdateChecker({
  currentVersion: APP_VERSION,
  onResult: (update) => {
    latestUpdate = update;
    io.emit('update', update);
  },
  log: (message) => log('system', 'Update', message),
});

openDashboardIfNeeded(HTTP_HOST, HTTP_PORT);

/** Opens the default browser once when running as a packaged desktop binary. */
function openDashboardIfNeeded(host: string, port: number): void {
  if (!isPackaged()) return;
  if (process.env.APRS_OPEN_BROWSER === '0') return;

  const urlHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const url = `http://${urlHost}:${port}/`;
  log('system', 'Server', `Opening dashboard at ${url}`);

  try {
    if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (process.platform === 'win32')
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // Opening a browser is convenience only; the server itself is fine without it.
  }
}

/**
 * A clean exit matters more than it looks: Direwolf only serves a few KISS
 * clients and reclaims a slot when the connection closes properly. Leaving the
 * process to be force-killed on every dev reload can leave Direwolf refusing
 * new KISS connections altogether.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}, shutting down…`);

  beacon.stop();
  direwolf.stop('Shutting down');
  aprsIs.stop('Shutting down');

  for (const timer of retryTimers.values()) clearTimeout(timer);
  retryTimers.clear();
  if (heardBroadcastTimer) clearTimeout(heardBroadcastTimer);
  if (positionBroadcastTimer) clearTimeout(positionBroadcastTimer);

  // Write any history still sitting in the debounce window.
  history.flush();

  // Open WebSocket sessions would otherwise keep the HTTP server listening.
  io.disconnectSockets(true);
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await app.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // Last resort: never let a stray handle stall the exit past two seconds.
    const failsafe = setTimeout(() => process.exit(0), 2_000);
    failsafe.unref();

    shutdown(signal)
      .catch((error) => console.error('Error during shutdown:', error))
      .finally(() => process.exit(0));
  });
}
