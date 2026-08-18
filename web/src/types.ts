/**
 * Contract shared with the backend.
 * Keep this file in sync with `server/src/types.ts`.
 */

export type TransportId = 'rf' | 'aprsis';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectorStatus {
  state: ConnectionState;
  detail: string;
  endpoint: string;
  connectedAt: number | null;
  lastRxAt: number | null;
  attempts: number;
}

export interface StatusSnapshot {
  rf: ConnectorStatus;
  aprsis: ConnectorStatus;
}

export interface StationConfig {
  callsign: string;
  ssid: number;
  passcode: string;
  direwolfHost: string;
  direwolfPort: number;
  direwolfChannel: number;
  aprsisHost: string;
  aprsisPort: number;
  aprsisFilter: string;
  digipeaterPath: string;
  defaultTransport: TransportId;
  autoAck: boolean;
  enableRf: boolean;
  enableAprsIs: boolean;
  beaconEnabled: boolean;
  beaconIntervalMinutes: number;
  beaconLatitude: number;
  beaconLongitude: number;
  beaconComment: string;
  beaconSymbolTable: string;
  beaconSymbolCode: string;
  beaconTransport: TransportId;
}

export type PublicConfig = Omit<StationConfig, 'passcode'> & { hasPasscode: boolean };

export type AckState = 'pending' | 'sent' | 'acked' | 'rejected' | 'failed';

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  direction: 'outgoing' | 'incoming';
  transport: TransportId;
  timestamp: number;
  messageId?: string;
  ackState?: AckState;
  attempts?: number;
  raw?: string;
}

export interface Conversation {
  callsign: string;
  lastActivity: number;
  lastMessage: string;
  unread: number;
  heardOn: TransportId | null;
}

export type PositionFormat = 'uncompressed' | 'compressed' | 'mic-e' | 'object' | 'item';

export interface StationPosition {
  callsign: string;
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

export interface HeardStation {
  callsign: string;
  lastHeard: number;
  transport: TransportId;
  dataType: string;
}

export interface StationWeather {
  callsign: string;
  windDirection?: number;
  windSpeedMph?: number;
  windGustMph?: number;
  temperatureF?: number;
  rainHourIn?: number;
  rain24hIn?: number;
  rainMidnightIn?: number;
  snow24hIn?: number;
  humidity?: number;
  pressureMb?: number;
  luminosity?: number;
  comment: string;
  format: 'position' | 'positionless' | 'peet';
  transport: TransportId;
  timestamp: number;
}

export interface TelemetrySample {
  sequence: number;
  analog: number[];
  digital?: boolean[];
  timestamp: number;
}

export interface TelemetryEquations {
  a: number;
  b: number;
  c: number;
}

export interface TelemetryDefinitions {
  names: string[];
  units: string[];
  equations: TelemetryEquations[];
  bitSense: boolean[];
  projectTitle?: string;
}

export interface StationTelemetry {
  callsign: string;
  definitions: TelemetryDefinitions;
  samples: TelemetrySample[];
  transport: TransportId;
  updatedAt: number;
}

export interface BulletinEntry {
  id: string;
  from: string;
  addressee: string;
  group: string;
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
  source: string;
  text: string;
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
  station: string;
}

export interface SendMessageRequest {
  to: string;
  text: string;
  transport: TransportId;
  requestAck: boolean;
}

export interface SendMessageResult {
  ok: boolean;
  error?: string;
  message?: ChatMessage;
}

export interface ConfigUpdateResult {
  ok: boolean;
  error?: string;
  config?: PublicConfig;
}

export interface ServerToClientEvents {
  snapshot: (snapshot: AppSnapshot) => void;
  status: (status: StatusSnapshot) => void;
  config: (config: PublicConfig, station: string) => void;
  message: (message: ChatMessage) => void;
  'message:update': (message: ChatMessage) => void;
  conversations: (conversations: Conversation[]) => void;
  'conversation:deleted': (callsign: string) => void;
  heard: (stations: HeardStation[]) => void;
  positions: (positions: StationPosition[]) => void;
  'positions:cleared': () => void;
  weather: (reports: StationWeather[]) => void;
  telemetry: (stations: StationTelemetry[]) => void;
  bulletins: (entries: BulletinEntry[]) => void;
  log: (entry: LogEntry) => void;
  'logs:cleared': () => void;
}

export interface ClientToServerEvents {
  'message:send': (
    request: SendMessageRequest,
    callback: (result: SendMessageResult) => void,
  ) => void;
  'config:update': (
    patch: Partial<StationConfig>,
    callback: (result: ConfigUpdateResult) => void,
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
  'conversations:delete': (
    callsigns: string[],
    callback: (result: { ok: boolean; error?: string; deleted?: string[] }) => void,
  ) => void;
  'positions:clear': () => void;
  'logs:clear': () => void;
}
