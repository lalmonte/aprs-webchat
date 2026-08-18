import net from 'node:net';
import type { ConnectionState, ConnectorStatus, LogLevel } from '../types.js';

const BASE_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

export interface ConnectorHooks {
  /** Called whenever any status field changes. */
  onStatus(status: ConnectorStatus): void;
  /** Feeds the real-time log console. */
  onLog(level: LogLevel, source: string, text: string): void;
}

/**
 * Shared plumbing for the two TCP clients: connection lifecycle, exponential
 * backoff reconnection and status reporting. Subclasses only deal with their
 * own wire protocol.
 */
export abstract class TcpConnector {
  protected socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = true;

  protected readonly status: ConnectorStatus = {
    state: 'disconnected',
    detail: 'Idle',
    endpoint: '',
    connectedAt: null,
    lastRxAt: null,
    attempts: 0,
  };

  protected constructor(
    protected readonly name: string,
    protected readonly hooks: ConnectorHooks,
  ) {}

  /** Current endpoint, resolved lazily so config edits are picked up. */
  protected abstract endpoint(): { host: string; port: number };

  /** Called once the TCP session is established (send login lines here). */
  protected abstract handleConnect(): void;

  /** Called for every chunk of inbound data. */
  protected abstract handleData(chunk: Buffer): void;

  /**
   * Called whenever the session ends, so subclasses can reset their parsers and
   * clear their timers. Must be idempotent.
   */
  protected handleDisconnect(): void {}

  /** Hook for subclasses to comment on repeated connection failures. */
  protected handleReconnectAttempt(_attempts: number): void {}

  getStatus(): ConnectorStatus {
    return { ...this.status };
  }

  get isConnected(): boolean {
    return this.status.state === 'connected' && this.socket !== null && !this.socket.destroyed;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(detail = 'Disabled'): void {
    this.stopped = true;
    this.clearReconnect();
    this.destroySocket();
    this.setStatus({ state: 'disconnected', detail, connectedAt: null, attempts: 0 });
  }

  /** Drops the current session and connects again immediately. */
  restart(): void {
    this.clearReconnect();
    this.destroySocket();
    this.status.attempts = 0;
    this.stopped = false;
    this.connect();
  }

  protected write(data: Buffer | string): boolean {
    if (!this.socket || this.socket.destroyed) {
      this.hooks.onLog('error', this.name, 'Transmission dropped: socket is not connected.');
      return false;
    }
    return this.socket.write(data);
  }

  protected setStatus(patch: Partial<ConnectorStatus>): void {
    Object.assign(this.status, patch);
    this.hooks.onStatus(this.getStatus());
  }

  protected touchRx(): void {
    this.status.lastRxAt = Date.now();
  }

  private connect(): void {
    if (this.stopped) return;
    this.destroySocket();

    const { host, port } = this.endpoint();
    const endpoint = `${host}:${port}`;
    this.setStatus({ state: 'connecting', detail: `Connecting to ${endpoint}…`, endpoint });
    this.hooks.onLog('system', this.name, `Connecting to ${endpoint}…`);

    const socket = net.createConnection({ host, port });
    this.socket = socket;
    socket.setKeepAlive(true, 30_000);
    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.once('connect', () => {
      socket.setTimeout(0);
      this.status.attempts = 0;
      this.setStatus({
        state: 'connected',
        detail: `Connected to ${endpoint}`,
        connectedAt: Date.now(),
      });
      this.hooks.onLog('system', this.name, `Connected to ${endpoint}.`);
      this.handleConnect();
    });

    socket.on('data', (chunk: Buffer) => {
      this.touchRx();
      this.handleData(chunk);
    });

    socket.on('timeout', () => {
      // Only armed while connecting; a live session disables the timeout.
      this.hooks.onLog('error', this.name, `Connection to ${endpoint} timed out.`);
      socket.destroy();
    });

    socket.on('error', (error: Error) => {
      this.setStatus({ state: 'error', detail: error.message });
      this.hooks.onLog('error', this.name, `Socket error: ${error.message}`);
    });

    socket.once('close', () => {
      if (this.socket === socket) this.socket = null;
      this.handleDisconnect();
      if (this.stopped) return;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.status.attempts += 1;
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** (this.status.attempts - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    const state: ConnectionState = this.status.state === 'error' ? 'error' : 'disconnected';

    this.setStatus({
      state,
      detail: `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.status.attempts})`,
      connectedAt: null,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    this.handleReconnectAttempt(this.status.attempts);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Tears the socket down. Stripping the listeners means the 'close' handler
   * will not run, so subclass cleanup is invoked here: otherwise timers survive
   * the session and keep the Node event loop alive forever.
   */
  private destroySocket(): void {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.removeAllListeners();
    // A socket without an 'error' listener throws when destroy() races a reset.
    socket.on('error', () => {});
    socket.destroy();
    this.handleDisconnect();
  }
}
