/**
 * Contract shared between the backend and the browser client.
 * Keep this file in sync with `web/src/types.ts`.
 */

export type TransportId = 'rf' | 'aprsis';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectorStatus {
  state: ConnectionState;
  /** Short human readable detail, e.g. "Logged in, server T2SPAIN". */
  detail: string;
  /** Endpoint currently in use, e.g. "127.0.0.1:8001". */
  endpoint: string;
  /** Epoch millis of the last successful connection. */
  connectedAt: number | null;
  /** Epoch millis of the last received byte. */
  lastRxAt: number | null;
  /** Number of consecutive reconnect attempts. */
  attempts: number;
}

export interface StatusSnapshot {
  rf: ConnectorStatus;
  aprsis: ConnectorStatus;
}

export interface StationConfig {
  /** Base callsign without SSID, e.g. "K6KJZ". */
  callsign: string;
  /** SSID 0-15 appended to the callsign on air. */
  ssid: number;
  /** APRS-IS passcode for the base callsign; -1 means receive-only. */
  passcode: string;
  direwolfHost: string;
  direwolfPort: number;
  /** Direwolf radio channel used for transmit (KISS port). */
  direwolfChannel: number;
  aprsisHost: string;
  aprsisPort: number;
  /** APRS-IS server-side filter, e.g. "m/100". */
  aprsisFilter: string;
  /** Digipeater path used for RF transmissions. */
  digipeaterPath: string;
  /** Default transport pre-selected in the composer. */
  defaultTransport: TransportId;
  /** Automatically answer received messages that request an ACK. */
  autoAck: boolean;
  enableRf: boolean;
  enableAprsIs: boolean;
  /** Periodically transmit a position beacon with a free-form comment. */
  beaconEnabled: boolean;
  /** Minutes between beacons; clamped to 1–120. */
  beaconIntervalMinutes: number;
  beaconLatitude: number;
  beaconLongitude: number;
  /** Free-form comment after the symbol, max 43 characters. */
  beaconComment: string;
  /** '/' primary table or '\' alternate. */
  beaconSymbolTable: string;
  /** Single APRS symbol character, e.g. '-' for a house. */
  beaconSymbolCode: string;
  /** Transport used for the beacon. */
  beaconTransport: TransportId;
}

/** Config as sent to the browser: the passcode is never exposed. */
export type PublicConfig = Omit<StationConfig, 'passcode'> & {
  /** Indicates whether a passcode is stored, without revealing it. */
  hasPasscode: boolean;
};

export type AckState = 'pending' | 'sent' | 'acked' | 'rejected' | 'failed';

export interface ChatMessage {
  id: string;
  /** Callsign-SSID of the sender. */
  from: string;
  /** Callsign-SSID of the addressee. */
  to: string;
  text: string;
  direction: 'outgoing' | 'incoming';
  transport: TransportId;
  /** Epoch millis when the packet was sent or received. */
  timestamp: number;
  /** APRS sequence number, when the message carries one. */
  messageId?: string;
  ackState?: AckState;
  /** Transmission attempts already performed for outgoing messages. */
  attempts?: number;
  /** Raw TNC2 representation, shown on hover in the UI. */
  raw?: string;
}

export interface Conversation {
  /** Callsign-SSID acting as the conversation key. */
  callsign: string;
  lastActivity: number;
  lastMessage: string;
  unread: number;
  /** Last transport the station was heard on. */
  heardOn: TransportId | null;
}

export type PositionFormat = 'uncompressed' | 'compressed' | 'mic-e' | 'object' | 'item';

/** Last known position of a station, object or item. */
export interface StationPosition {
  /** Station that sent the packet. */
  callsign: string;
  /** Object or item name, when the position is not the sender's own. */
  name?: string;
  latitude: number;
  longitude: number;
  symbolTable: string;
  symbolCode: string;
  /** Degrees true. */
  course?: number;
  /** Knots. */
  speed?: number;
  /** Metres. */
  altitude?: number;
  comment: string;
  format: PositionFormat;
  transport: TransportId;
  timestamp: number;
}

/** Station seen on any packet, used to start a chat from the sidebar. */
export interface HeardStation {
  callsign: string;
  lastHeard: number;
  transport: TransportId;
  /** Label of the last APRS data type received, e.g. "Position". */
  dataType: string;
}

/** Latest weather report decoded from a `_` / `*` / weather-symbol packet. */
export interface StationWeather {
  callsign: string;
  /** Wind direction, degrees true. */
  windDirection?: number;
  /** Sustained wind speed, mph. */
  windSpeedMph?: number;
  /** Peak gust in the last 5 minutes, mph. */
  windGustMph?: number;
  /** Temperature, degrees Fahrenheit. */
  temperatureF?: number;
  /** Rain in the last hour, inches. */
  rainHourIn?: number;
  /** Rain in the last 24 hours, inches. */
  rain24hIn?: number;
  /** Rain since midnight, inches. */
  rainMidnightIn?: number;
  /** Snow in the last 24 hours, inches. */
  snow24hIn?: number;
  /** Relative humidity, 0–100 %. */
  humidity?: number;
  /** Barometric pressure, millibars (hPa). */
  pressureMb?: number;
  /** Luminosity, W/m². */
  luminosity?: number;
  comment: string;
  format: 'position' | 'positionless' | 'peet';
  transport: TransportId;
  timestamp: number;
}

/** One `T#…` telemetry reading. */
export interface TelemetrySample {
  sequence: number;
  /** Up to five raw analog channels. */
  analog: number[];
  /** Eight digital bits, when present. */
  digital?: boolean[];
  timestamp: number;
}

export interface TelemetryEquations {
  a: number;
  b: number;
  c: number;
}

/** PARM / UNIT / EQNS / BITS metadata for a telemetry station. */
export interface TelemetryDefinitions {
  names: string[];
  units: string[];
  equations: TelemetryEquations[];
  bitSense: boolean[];
  projectTitle?: string;
}

/** Rolling telemetry history for one station. */
export interface StationTelemetry {
  callsign: string;
  definitions: TelemetryDefinitions;
  /** Oldest first; capped on the server. */
  samples: TelemetrySample[];
  transport: TransportId;
  updatedAt: number;
}

/**
 * One APRS bulletin / announcement line (message addressed to BLN…).
 * General boards use line ids BLN0–BLN9 / BLNA–BLNZ; longer addressees are
 * group announcements.
 */
export interface BulletinEntry {
  id: string;
  /** Station that originated the bulletin. */
  from: string;
  /** Full addressee, e.g. BLN0 or BLNGATE. */
  addressee: string;
  /** GENERAL, or the group name after BLN. */
  group: string;
  /** Single-character line id for general bulletins. */
  lineId: string | null;
  text: string;
  transport: TransportId;
  timestamp: number;
  raw?: string;
}

export type LogLevel = 'rf-tx' | 'rf-rx' | 'aprsis' | 'error' | 'system';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  /** Origin tag rendered before the text, e.g. "KISS" or "APRS-IS". */
  source: string;
  text: string;
}

/** Newer GitHub Release than the running build, when one exists. */
export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseName?: string;
  publishedAt?: string;
}

export interface AppSnapshot {
  config: PublicConfig;
  status: StatusSnapshot;
  conversations: Conversation[];
  messages: ChatMessage[];
  heard: HeardStation[];
  positions: StationPosition[];
  weather: StationWeather[];
  telemetry: StationTelemetry[];
  bulletins: BulletinEntry[];
  logs: LogEntry[];
  /** Full station callsign including SSID, e.g. "K6KJZ-9". */
  station: string;
  /** Running application version (same as the packaged binary / APRS-IS vers). */
  appVersion: string;
  /** Present when GitHub has a newer tagged release than `appVersion`. */
  update: AppUpdateInfo | null;
}

export interface SendMessageRequest {
  to: string;
  text: string;
  transport: TransportId;
  /** Request an ACK from the remote station. */
  requestAck: boolean;
}

export interface SendMessageResult {
  ok: boolean;
  error?: string;
  message?: ChatMessage;
}

/** Events emitted by the server towards the browser. */
export interface ServerToClientEvents {
  snapshot: (snapshot: AppSnapshot) => void;
  status: (status: StatusSnapshot) => void;
  config: (config: PublicConfig, station: string) => void;
  message: (message: ChatMessage) => void;
  'message:update': (message: ChatMessage) => void;
  conversations: (conversations: Conversation[]) => void;
  /** A conversation and its history were discarded; drop them locally too. */
  'conversation:deleted': (callsign: string) => void;
  heard: (stations: HeardStation[]) => void;
  positions: (positions: StationPosition[]) => void;
  /** All plotted stations were removed from the map. */
  'positions:cleared': () => void;
  weather: (reports: StationWeather[]) => void;
  telemetry: (stations: StationTelemetry[]) => void;
  bulletins: (entries: BulletinEntry[]) => void;
  log: (entry: LogEntry) => void;
  'logs:cleared': () => void;
  /** GitHub has a newer release, or null after catching up. */
  update: (info: AppUpdateInfo | null) => void;
}

/** Events the browser can send to the server. */
export interface ClientToServerEvents {
  'message:send': (
    request: SendMessageRequest,
    callback: (result: SendMessageResult) => void,
  ) => void;
  'config:update': (
    patch: Partial<StationConfig>,
    callback: (result: { ok: boolean; error?: string; config?: PublicConfig }) => void,
  ) => void;
  'connector:reconnect': (transport: TransportId) => void;
  'conversation:open': (callsign: string) => void;
  'conversation:create': (
    callsign: string,
    callback: (result: { ok: boolean; error?: string; callsign?: string }) => void,
  ) => void;
  'conversation:delete': (
    callsign: string,
    callback: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  /** Deletes several conversations in one go (selected callsigns). */
  'conversations:delete': (
    callsigns: string[],
    callback: (result: { ok: boolean; error?: string; deleted?: string[] }) => void,
  ) => void;
  'positions:clear': () => void;
  'logs:clear': () => void;
}
