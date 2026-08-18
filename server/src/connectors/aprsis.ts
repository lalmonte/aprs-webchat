import { APP_NAME, APP_VERSION, APRS_TOCALL, type ConfigStore } from '../config.js';
import { frameToTnc2, tnc2ToFrame, type Ax25Frame } from '../protocol/ax25.js';
import { TcpConnector, type ConnectorHooks } from './base.js';

/** APRS-IS servers send a comment line every ~20s; we allow three misses. */
const RX_WATCHDOG_MS = 90_000;
/** Comment line we send periodically so the server keeps the session open. */
const KEEPALIVE_INTERVAL_MS = 60_000;
/** Longest tolerated line; real APRS-IS packets stay well under 600 bytes. */
const MAX_LINE_LENGTH = 8_192;

export interface AprsIsHooks extends ConnectorHooks {
  onFrame(frame: Ax25Frame, raw: string): void;
}

/**
 * APRS-IS client (e.g. rotate.aprs2.net:14580).
 *
 * The protocol is line oriented and CRLF terminated: after the mandatory login
 * line the server streams TNC2 formatted packets plus comment lines starting
 * with '#'. Transmitting only requires writing a TNC2 line whose source is our
 * verified callsign.
 */
export class AprsIsConnector extends TcpConnector {
  private lineBuffer = '';
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private verified = false;
  private serverBanner = '';

  constructor(
    private readonly config: ConfigStore,
    private readonly aprsIsHooks: AprsIsHooks,
  ) {
    super('APRS-IS', aprsIsHooks);
  }

  /** True once the server answered "verified", which is required to transmit. */
  get isVerified(): boolean {
    return this.verified;
  }

  protected endpoint(): { host: string; port: number } {
    const { aprsisHost, aprsisPort } = this.config.get();
    return { host: aprsisHost, port: aprsisPort };
  }

  protected handleConnect(): void {
    this.lineBuffer = '';
    this.verified = false;
    this.sendLogin();
    this.startTimers();
  }

  protected override handleDisconnect(): void {
    this.stopTimers();
    this.lineBuffer = '';
    this.verified = false;
  }

  protected handleData(chunk: Buffer): void {
    // APRS-IS is byte oriented latin1; UTF-8 would corrupt weather symbols.
    this.lineBuffer += chunk.toString('latin1');

    // Guard against a peer that never sends a line terminator.
    if (this.lineBuffer.length > MAX_LINE_LENGTH) {
      this.aprsIsHooks.onLog('error', 'APRS-IS', 'Oversized line discarded.');
      this.lineBuffer = '';
      return;
    }

    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      if (trimmed.startsWith('#')) this.handleServerComment(trimmed);
      else this.handlePacketLine(trimmed);
    }
  }

  /**
   * Sends a packet through the internet gateway. `TCPIP*` marks the packet as
   * already delivered by the internet so digipeaters do not loop it back.
   */
  transmit(info: string): { ok: boolean; raw: string; error?: string } {
    const station = this.config.station;
    const raw = `${station}>${APRS_TOCALL},TCPIP*:${info}`;

    if (!this.isConnected) {
      return { ok: false, raw, error: 'APRS-IS is not connected.' };
    }
    if (!this.verified) {
      return {
        ok: false,
        raw,
        error: 'APRS-IS login is not verified; a valid passcode is required to transmit.',
      };
    }

    this.write(`${raw}\r\n`);
    this.aprsIsHooks.onLog('aprsis', 'IS TX', raw);
    return { ok: true, raw };
  }

  private sendLogin(): void {
    const { passcode, aprsisFilter } = this.config.get();
    const filter = aprsisFilter.trim();
    const login =
      `user ${this.config.station} pass ${passcode || '-1'} ` +
      `vers ${APP_NAME} ${APP_VERSION}` +
      (filter ? ` filter ${filter}` : '');

    this.write(`${login}\r\n`);
    // Never log the passcode verbatim.
    this.aprsIsHooks.onLog(
      'aprsis',
      'IS TX',
      login.replace(/pass \S+/, 'pass ****'),
    );
    this.setStatus({ detail: 'Login sent, waiting for server response…' });
  }

  private handleServerComment(line: string): void {
    this.aprsIsHooks.onLog('aprsis', 'IS', line);

    if (/^#\s*logresp/i.test(line)) {
      this.verified = /verified/i.test(line) && !/unverified/i.test(line);
      const server = /server\s+(\S+)/i.exec(line)?.[1];
      this.setStatus({
        detail: this.verified
          ? `Logged in as ${this.config.station}${server ? ` on ${server}` : ''}`
          : 'Logged in unverified (receive only)',
      });
      if (!this.verified) {
        this.aprsIsHooks.onLog(
          'error',
          'APRS-IS',
          'Unverified login: transmitting over APRS-IS is disabled until a valid passcode is set.',
        );
      }
      return;
    }

    if (this.serverBanner === '' && /aprsc|javAPRSSrvr/i.test(line)) {
      this.serverBanner = line.replace(/^#\s*/, '');
    }
  }

  private handlePacketLine(line: string): void {
    const frame = tnc2ToFrame(line);
    if (!frame) {
      this.aprsIsHooks.onLog('error', 'APRS-IS', `Unparsable line: ${line}`);
      return;
    }

    this.aprsIsHooks.onLog('aprsis', 'IS RX', frameToTnc2(frame));
    this.aprsIsHooks.onFrame(frame, line);
  }

  private startTimers(): void {
    this.stopTimers();

    this.keepaliveTimer = setInterval(() => {
      if (this.isConnected) this.write(`# ${APP_NAME} ${APP_VERSION} keepalive\r\n`);
    }, KEEPALIVE_INTERVAL_MS);

    this.watchdogTimer = setInterval(() => {
      const lastRx = this.status.lastRxAt ?? this.status.connectedAt ?? 0;
      if (Date.now() - lastRx <= RX_WATCHDOG_MS) return;

      this.aprsIsHooks.onLog(
        'error',
        'APRS-IS',
        'No data received within the watchdog window; restarting the session.',
      );
      this.restart();
    }, RX_WATCHDOG_MS / 3);
  }

  private stopTimers(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.keepaliveTimer = null;
    this.watchdogTimer = null;
  }
}
