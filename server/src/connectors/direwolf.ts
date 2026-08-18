import type { ConfigStore } from '../config.js';
import { APRS_TOCALL } from '../config.js';
import {
  decodeAx25,
  encodeAx25,
  frameToTnc2,
  isAprsUiFrame,
  parseAddress,
  CONTROL_UI,
  PID_NO_LAYER_3,
  type Ax25Frame,
} from '../protocol/ax25.js';
import { KissCommand, KissDecoder, encodeKissFrame } from '../protocol/kiss.js';
import { probeChannelCount } from './agwpe-probe.js';
import { TcpConnector, type ConnectorHooks } from './base.js';

export interface DirewolfHooks extends ConnectorHooks {
  /** Delivers every decoded APRS frame received from the radio. */
  onFrame(frame: Ax25Frame, raw: string): void;
}

/**
 * KISS over TCP client for a local Direwolf instance (default 127.0.0.1:8001).
 * Direwolf exposes each radio channel as a KISS port on the same socket.
 */
/**
 * KISS frames are a few hundred bytes at most. Far more than that arriving
 * without a single complete frame means the framing itself is not being found.
 */
const UNFRAMED_BYTES_LIMIT = 4096;

export class DirewolfConnector extends TcpConnector {
  private readonly decoder = new KissDecoder();
  private probing = false;
  private bytesSinceFrame = 0;
  private reportedUnframed = false;

  constructor(
    private readonly config: ConfigStore,
    private readonly direwolfHooks: DirewolfHooks,
  ) {
    super('KISS', direwolfHooks);
  }

  protected endpoint(): { host: string; port: number } {
    const { direwolfHost, direwolfPort } = this.config.get();
    return { host: direwolfHost, port: direwolfPort };
  }

  protected handleConnect(): void {
    this.decoder.reset();
    this.bytesSinceFrame = 0;
    this.reportedUnframed = false;
    this.setStatus({ detail: `KISS TNC ready on ${this.status.endpoint}` });
    this.verifyTransmitChannel();
  }

  /**
   * Warns when the configured transmit channel does not exist on the TNC.
   * Silent when AGWPE is unavailable, since the check is only a diagnostic.
   */
  private verifyTransmitChannel(): void {
    if (this.probing) return;
    this.probing = true;

    const { direwolfHost, direwolfChannel } = this.config.get();

    probeChannelCount(direwolfHost)
      .then((channels) => {
        if (channels === null) return;

        if (direwolfChannel < channels) {
          this.direwolfHooks.onLog(
            'system',
            'KISS',
            `Direwolf reports ${channels} radio channel(s); transmitting on channel ${direwolfChannel}.`,
          );
          return;
        }

        const detail =
          `Channel ${direwolfChannel} does not exist on this TNC ` +
          `(Direwolf has ${channels}: 0-${channels - 1}). Every transmission will be discarded.`;
        this.direwolfHooks.onLog('error', 'KISS', `${detail} Change it in Configuration.`);
        this.setStatus({ detail });
      })
      .finally(() => {
        this.probing = false;
      });
  }

  protected override handleDisconnect(): void {
    this.decoder.reset();
  }

  /**
   * Direwolf serves a small fixed number of KISS clients and only accepts a new
   * one when a slot is free. A client that dies abruptly can leave its slot
   * occupied, and Direwolf then stops answering on the KISS port entirely while
   * the rest of the program keeps running.
   */
  protected override handleReconnectAttempt(attempts: number): void {
    if (attempts !== 3) return;

    this.direwolfHooks.onLog(
      'error',
      'KISS',
      'Three failed attempts. If Direwolf is running but its KISS port never answers, ' +
        'its client slots may be held by connections that were closed abruptly. ' +
        'Restarting Direwolf releases them.',
    );
  }

  protected handleData(chunk: Buffer): void {
    const frames = this.decoder.push(chunk);

    // Any complete frame proves the framing works, even a malformed or
    // non-APRS one; the counter only tracks bytes that never delimit a frame.
    if (frames.length > 0) {
      this.bytesSinceFrame = 0;
      this.reportedUnframed = false;
    } else {
      this.bytesSinceFrame += chunk.length;
      if (this.bytesSinceFrame > UNFRAMED_BYTES_LIMIT && !this.reportedUnframed) {
        this.reportedUnframed = true;
        this.direwolfHooks.onLog(
          'error',
          'KISS',
          `${this.bytesSinceFrame} bytes received without a single complete KISS frame. ` +
            'The peer on this port may not be speaking KISS. First bytes: ' +
            chunk.subarray(0, 16).toString('hex'),
        );
      }
    }

    for (const kissFrame of frames) {
      if (kissFrame.command !== KissCommand.DataFrame) {
        this.direwolfHooks.onLog(
          'system',
          'KISS',
          `Control frame received (command 0x${kissFrame.command.toString(16)}).`,
        );
        continue;
      }

      const frame = decodeAx25(kissFrame.payload);
      if (!frame) {
        this.direwolfHooks.onLog(
          'error',
          'KISS',
          `Malformed AX.25 frame (${kissFrame.payload.length} bytes): ${kissFrame.payload.toString('hex')}`,
        );
        continue;
      }

      if (!isAprsUiFrame(frame)) {
        this.direwolfHooks.onLog(
          'system',
          'KISS',
          `Non-APRS frame ignored (control 0x${frame.control.toString(16)}, PID 0x${frame.pid.toString(16)}).`,
        );
        continue;
      }

      const raw = frameToTnc2(frame);
      this.direwolfHooks.onLog('rf-rx', `RF ch${kissFrame.port} RX`, raw);
      this.direwolfHooks.onFrame(frame, raw);
    }
  }

  /**
   * Builds a UI frame from our station towards the configured tocall and
   * transmits it through the KISS socket. Returns the TNC2 line that was sent.
   */
  transmit(info: string): { ok: boolean; raw: string; error?: string } {
    const { callsign, ssid, digipeaterPath, direwolfChannel } = this.config.get();

    const frame: Ax25Frame = {
      destination: parseAddress(APRS_TOCALL),
      source: { callsign, ssid },
      path: digipeaterPath
        .split(',')
        .map((hop) => hop.trim())
        .filter(Boolean)
        .map(parseAddress),
      control: CONTROL_UI,
      pid: PID_NO_LAYER_3,
      info: Buffer.from(info, 'latin1'),
    };

    const raw = frameToTnc2(frame);

    if (!this.isConnected) {
      return { ok: false, raw, error: 'Direwolf TNC is not connected.' };
    }

    const written = this.write(encodeKissFrame(encodeAx25(frame), direwolfChannel));
    if (!written) {
      // A false return only means the kernel buffer is full; the data is queued.
      this.direwolfHooks.onLog('system', 'KISS', 'Socket backpressure while transmitting.');
    }

    // The direction belongs in the label: piped stdout has no colour to rely on.
    this.direwolfHooks.onLog('rf-tx', `RF ch${direwolfChannel} TX`, raw);
    return { ok: true, raw };
  }
}
