/**
 * Mock Direwolf TNC.
 *
 * Speaks KISS over TCP exactly like Direwolf so the dashboard can be exercised
 * without a radio: it beacons a few fake stations, answers messages addressed
 * to MOCK_STATION and acknowledges them.
 *
 * Usage: npm run mock:tnc -w server   (listens on 127.0.0.1:8001)
 */

import net from 'node:net';

import {
  buildAckPayload,
  buildMessagePayload,
  nextMessageId,
  parseAprsMessage,
} from '../protocol/aprs.js';
import {
  CONTROL_UI,
  PID_NO_LAYER_3,
  decodeAx25,
  encodeAx25,
  formatAddress,
  frameToTnc2,
  parseAddress,
  type Ax25Frame,
} from '../protocol/ax25.js';
import { KissDecoder, encodeKissFrame } from '../protocol/kiss.js';

const PORT = Number.parseInt(process.env.MOCK_TNC_PORT ?? '8001', 10);
const HOST = process.env.MOCK_TNC_HOST ?? '127.0.0.1';
/** Station that answers the messages we receive. */
const MOCK_STATION = (process.env.MOCK_STATION ?? 'MOCK-1').toUpperCase();
const BEACON_INTERVAL_MS = 20_000;

/** One beacon per position encoding, so the map decoder gets a real workout. */
const BEACONS = [
  // Uncompressed, with course, speed and altitude.
  'K6KJZ-9>APDW17,WIDE1-1:!3751.65N/12225.09W>088/036/A=000210Mobile in the bay area',
  // Uncompressed with a timestamp.
  'EA4XYZ-7>APRS,WIDE2-1:@092345z4025.11N/00341.67W-Madrid QTH',
  // Compressed (base91).
  'W1AW>APRS,WIDE1-1:!/5L!!<*e7> sTCompressed beacon',
  // Mic-E: the latitude travels inside the destination address.
  'HI3ABC-9>S32U6T,WIDE1-1:`(_fn"Oj/Mic-E tracker',
  // An object reported by another station.
  'K6KJZ-9>APDW17,WIDE1-1:;FIELD DAY*092345z3752.00N/12226.00W-Club site',
  // Weather station, no position extensions.
  'N0WX>APRS,WIDE2-1:!4141.00N/07242.00W_Weather station',
  `${MOCK_STATION}>APDW17,WIDE1-1:>Mock TNC online, send me a message`,
];

const REPLIES = [
  'Roger, message received loud and clear',
  '73 de mock station, signal report 5/9',
  'QSL. Standing by on 144.800',
  'Copy that, running Direwolf on a Pi',
];

let beaconIndex = 0;
let replyIndex = 0;

function frameFor(tnc2: string): Ax25Frame | null {
  const separator = tnc2.indexOf(':');
  if (separator < 0) return null;

  const header = tnc2.slice(0, separator);
  const arrow = header.indexOf('>');
  const [destination, ...path] = header.slice(arrow + 1).split(',');

  return {
    source: parseAddress(header.slice(0, arrow)),
    destination: parseAddress(destination ?? 'APRS'),
    path: path.map(parseAddress),
    control: CONTROL_UI,
    pid: PID_NO_LAYER_3,
    info: Buffer.from(tnc2.slice(separator + 1), 'latin1'),
  };
}

const server = net.createServer((socket) => {
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[mock-tnc] KISS client connected from ${peer}`);

  const decoder = new KissDecoder();

  function send(frame: Ax25Frame): void {
    socket.write(encodeKissFrame(encodeAx25(frame)));
    console.log(`[mock-tnc] TX -> ${frameToTnc2(frame)}`);
  }

  function sendTnc2(tnc2: string): void {
    const frame = frameFor(tnc2);
    if (frame) send(frame);
  }

  const beaconTimer = setInterval(() => {
    const beacon = BEACONS[beaconIndex % BEACONS.length]!;
    beaconIndex += 1;
    sendTnc2(beacon);
  }, BEACON_INTERVAL_MS);

  // Send the whole set right away, staggered, so the dashboard and the map have
  // something to show immediately instead of one station every 20 seconds.
  const startupBeacons = BEACONS.map((beacon, index) =>
    setTimeout(() => sendTnc2(beacon), 400 + index * 250),
  );
  socket.once('close', () => startupBeacons.forEach(clearTimeout));

  socket.on('data', (chunk: Buffer) => {
    for (const kissFrame of decoder.push(chunk)) {
      const frame = decodeAx25(kissFrame.payload);
      if (!frame) {
        console.log(`[mock-tnc] RX <- unparsable payload ${kissFrame.payload.toString('hex')}`);
        continue;
      }

      console.log(`[mock-tnc] RX <- ${frameToTnc2(frame)}`);

      const parsed = parseAprsMessage(frame.info.toString('latin1'));
      if (!parsed || parsed.kind !== 'message') continue;
      if (parsed.addressee !== MOCK_STATION) continue;

      const sender = formatAddress(frame.source);

      if (parsed.messageId) {
        setTimeout(() => {
          const ack = frameFor(`${MOCK_STATION}>APDW17,WIDE1-1:${buildAckPayload(sender, parsed.messageId!)}`);
          if (ack) send(ack);
        }, 800);
      }

      const reply = REPLIES[replyIndex % REPLIES.length]!;
      replyIndex += 1;

      setTimeout(() => {
        const answer = frameFor(
          `${MOCK_STATION}>APDW17,WIDE1-1:${buildMessagePayload(sender, reply, nextMessageId())}`,
        );
        if (answer) send(answer);
      }, 2_000);
    }
  });

  socket.on('error', (error) => console.log(`[mock-tnc] socket error: ${error.message}`));
  socket.on('close', () => {
    clearInterval(beaconTimer);
    console.log(`[mock-tnc] client ${peer} disconnected`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-tnc] KISS TCP listening on ${HOST}:${PORT}, answering as ${MOCK_STATION}`);
});
