/**
 * KISS protocol codec (Keep It Simple, Stupid) as used by Direwolf and most TNCs.
 *
 * A KISS frame looks like:
 *   FEND | <port:4 | command:4> | escaped payload | FEND
 *
 * Because FEND (0xC0) and FESC (0xDB) are reserved they are escaped inside the
 * payload as FESC TFEND and FESC TFESC respectively.
 */

export const FEND = 0xc0;
export const FESC = 0xdb;
export const TFEND = 0xdc;
export const TFESC = 0xdd;

export const KissCommand = {
  DataFrame: 0x00,
  TxDelay: 0x01,
  Persistence: 0x02,
  SlotTime: 0x03,
  TxTail: 0x04,
  FullDuplex: 0x05,
  SetHardware: 0x06,
  Return: 0xff,
} as const;

export interface KissFrame {
  /** TNC radio port (0-15). Direwolf channel 0 is the default. */
  port: number;
  /** KISS command nibble; 0x00 means "this frame carries AX.25 data". */
  command: number;
  /** Un-escaped payload. For data frames this is a raw AX.25 frame. */
  payload: Buffer;
}

/** Wraps an AX.25 frame into a single KISS data frame ready for the TCP socket. */
export function encodeKissFrame(
  payload: Buffer,
  port = 0,
  command: number = KissCommand.DataFrame,
): Buffer {
  const escaped: number[] = [];

  for (const byte of payload) {
    if (byte === FEND) {
      escaped.push(FESC, TFEND);
    } else if (byte === FESC) {
      escaped.push(FESC, TFESC);
    } else {
      escaped.push(byte);
    }
  }

  return Buffer.from([FEND, ((port & 0x0f) << 4) | (command & 0x0f), ...escaped, FEND]);
}

/**
 * Incremental KISS decoder. TCP delivers a byte stream with no respect for
 * frame boundaries, so the decoder keeps partial frames between chunks.
 */
export class KissDecoder {
  private buffer: number[] = [];
  private inFrame = false;
  private escaped = false;

  /** Feeds a chunk of socket data and returns every complete frame found. */
  push(chunk: Buffer): KissFrame[] {
    const frames: KissFrame[] = [];

    for (const byte of chunk) {
      if (byte === FEND) {
        // A FEND both closes the current frame and opens the next one.
        if (this.inFrame && this.buffer.length > 0) {
          const frame = this.toFrame(this.buffer);
          if (frame) frames.push(frame);
        }
        this.buffer = [];
        this.escaped = false;
        this.inFrame = true;
        continue;
      }

      if (!this.inFrame) continue;

      if (this.escaped) {
        this.escaped = false;
        if (byte === TFEND) this.buffer.push(FEND);
        else if (byte === TFESC) this.buffer.push(FESC);
        else this.buffer.push(byte); // Invalid escape: pass the byte through.
        continue;
      }

      if (byte === FESC) {
        this.escaped = true;
        continue;
      }

      this.buffer.push(byte);
    }

    return frames;
  }

  reset(): void {
    this.buffer = [];
    this.inFrame = false;
    this.escaped = false;
  }

  private toFrame(bytes: number[]): KissFrame | null {
    if (bytes.length < 2) return null;
    const header = bytes[0]!;
    return {
      port: (header >> 4) & 0x0f,
      command: header & 0x0f,
      payload: Buffer.from(bytes.slice(1)),
    };
  }
}
