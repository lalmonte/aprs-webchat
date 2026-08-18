import net from 'node:net';

/**
 * Direwolf discards KISS data frames addressed to a radio channel it does not
 * have, and reports "Invalid transmit channel N from KISS client app" only on
 * its own console — the KISS client is never told. That makes a channel
 * mismatch look exactly like a working connection that transmits nothing.
 *
 * Direwolf's AGWPE port answers a 'G' request with its radio port list, so we
 * use it to detect the mismatch and report it in the dashboard instead.
 */

/** AGWPE frames start with a fixed 36 byte header. */
const AGW_HEADER_LENGTH = 36;
const DATA_KIND_OFFSET = 4;
const DATA_LENGTH_OFFSET = 28;

/** Direwolf's default AGWPORT. Only used for this diagnostic. */
export const DIREWOLF_AGW_PORT = Number.parseInt(process.env.DIREWOLF_AGW_PORT ?? '8000', 10);

/**
 * Asks Direwolf how many radio channels it has.
 * Resolves null when AGWPE is unreachable or answers something unexpected, in
 * which case the caller simply skips the check.
 */
export function probeChannelCount(
  host: string,
  port: number = DIREWOLF_AGW_PORT,
  timeoutMs = 4_000,
): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(null));
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));

    socket.on('connect', () => {
      const request = Buffer.alloc(AGW_HEADER_LENGTH);
      request[DATA_KIND_OFFSET] = 'G'.charCodeAt(0); // "Ask about radio ports"
      socket.write(request);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Walk complete frames until the port list shows up.
      while (buffer.length >= AGW_HEADER_LENGTH) {
        const dataLength = buffer.readUInt32LE(DATA_LENGTH_OFFSET);
        const frameLength = AGW_HEADER_LENGTH + dataLength;
        if (buffer.length < frameLength) return;

        const kind = String.fromCharCode(buffer[DATA_KIND_OFFSET]!);
        const payload = buffer.subarray(AGW_HEADER_LENGTH, frameLength).toString('latin1');
        buffer = buffer.subarray(frameLength);

        if (kind !== 'G') continue;

        // Payload looks like "1;Port1 first soundcard mono;".
        const count = Number.parseInt(payload.split(';')[0] ?? '', 10);
        finish(Number.isInteger(count) && count > 0 ? count : null);
        return;
      }
    });
  });
}
