import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APRS_MAX_MESSAGE_LENGTH,
  buildAckPayload,
  buildMessagePayload,
  escapeNonPrintable,
  isBulletin,
  parseAprsMessage,
  parseBulletinAddress,
  sanitizeMessageText,
  unwrapThirdParty,
} from './aprs.js';
import {
  CONTROL_UI,
  PID_NO_LAYER_3,
  decodeAx25,
  encodeAx25,
  formatAddress,
  frameToTnc2,
  parseAddress,
  tnc2ToFrame,
} from './ax25.js';
import { FEND, FESC, KissDecoder, TFEND, TFESC, encodeKissFrame } from './kiss.js';

test('KISS frames are delimited and escaped', () => {
  const encoded = encodeKissFrame(Buffer.from([0x01, FEND, FESC, 0x02]));

  assert.deepEqual(
    [...encoded],
    [FEND, 0x00, 0x01, FESC, TFEND, FESC, TFESC, 0x02, FEND],
    'reserved bytes must be escaped and the frame wrapped in FEND',
  );
});

test('KISS decoder reassembles frames split across TCP chunks', () => {
  const decoder = new KissDecoder();
  const payload = Buffer.from('DATA\xc0\xdb', 'latin1');
  const encoded = encodeKissFrame(payload, 3);

  assert.equal(decoder.push(encoded.subarray(0, 4)).length, 0, 'a partial frame yields nothing');

  const frames = decoder.push(encoded.subarray(4));
  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.port, 3);
  assert.equal(frames[0]?.command, 0x00);
  assert.deepEqual(frames[0]?.payload, payload);
});

test('AX.25 addresses are shifted one bit to the left', () => {
  const frame = {
    destination: parseAddress('APZWCH'),
    source: parseAddress('N0CALL-1'),
    path: [parseAddress('WIDE1-1')],
    control: CONTROL_UI,
    pid: PID_NO_LAYER_3,
    info: Buffer.from(':hello'),
  };

  const encoded = encodeAx25(frame);

  assert.equal(encoded[0], 'A'.charCodeAt(0) << 1, 'callsign characters are shifted left');
  assert.equal(encoded[6], 0xe0, 'destination sets the C bit of a command frame, SSID 0, not last');
  assert.equal(encoded[13], 0x60 | (1 << 1), 'source clears the C bit, carries SSID 1, not last');
  assert.equal(encoded[20]! & 0x01, 0x01, 'the final digipeater sets the end-of-address bit');
  assert.equal(encoded[21], CONTROL_UI);
  assert.equal(encoded[22], PID_NO_LAYER_3);
});

test('AX.25 encode and decode round-trip', () => {
  const info = Buffer.from(':N0CALL-2 :Test message{A01', 'latin1');
  const encoded = encodeAx25({
    destination: parseAddress('APZWCH'),
    source: parseAddress('K6KJZ-9'),
    path: [parseAddress('WIDE1-1'), parseAddress('WIDE2-1')],
    control: CONTROL_UI,
    pid: PID_NO_LAYER_3,
    info,
  });

  const decoded = decodeAx25(encoded);
  assert.ok(decoded);
  assert.equal(formatAddress(decoded.source), 'K6KJZ-9');
  assert.equal(formatAddress(decoded.destination), 'APZWCH');
  assert.equal(decoded.destination.repeated, false, 'the C bit is not a digipeater H bit');
  assert.equal(decoded.source.repeated, false);
  assert.deepEqual(decoded.path.map(formatAddress), ['WIDE1-1', 'WIDE2-1']);
  assert.deepEqual(decoded.info, info);
  assert.equal(frameToTnc2(decoded), `K6KJZ-9>APZWCH,WIDE1-1,WIDE2-1:${info.toString('latin1')}`);
});

test('decoding rejects truncated frames', () => {
  assert.equal(decodeAx25(Buffer.alloc(8)), null);
});

test('digipeater H bit survives a TNC2 round-trip', () => {
  const frame = tnc2ToFrame('K6KJZ-9>APZWCH,WIDE1-1*,WIDE2-1:>Online');
  assert.ok(frame);
  assert.equal(frame.path[0]?.repeated, true);
  assert.equal(frame.path[1]?.repeated, false);

  const decoded = decodeAx25(encodeAx25(frame));
  assert.ok(decoded);
  assert.equal(decoded.path[0]?.repeated, true);
  assert.equal(decoded.path[1]?.repeated, false);
});

test('APRS message payloads pad the addressee to nine characters', () => {
  assert.equal(buildMessagePayload('K6KJZ-9', 'Hello', 'A01'), ':K6KJZ-9  :Hello{A01');
  assert.equal(buildAckPayload('N0CALL', '27'), ':N0CALL   :ack27');
});

test('APRS messages are parsed with their sequence number', () => {
  const parsed = parseAprsMessage(':K6KJZ-9  :Meet on 145.500{A01');
  assert.deepEqual(parsed, {
    kind: 'message',
    addressee: 'K6KJZ-9',
    text: 'Meet on 145.500',
    messageId: 'A01',
    replyAck: undefined,
  });
});

test('ACK and REJ packets are recognised in both spec revisions', () => {
  assert.equal(parseAprsMessage(':K6KJZ-9  :ack27')?.kind, 'ack');
  assert.equal(parseAprsMessage(':K6KJZ-9  :rej27')?.kind, 'rej');
  assert.equal(parseAprsMessage(':K6KJZ-9  :ack}27')?.messageId, '27');
});

test('reply-ack messages expose the piggybacked acknowledgement', () => {
  const parsed = parseAprsMessage(':K6KJZ-9  :Copy that{B2}A01');
  assert.equal(parsed?.text, 'Copy that');
  assert.equal(parsed?.messageId, 'B2');
  assert.equal(parsed?.replyAck, 'A01');
});

test('non-message packets are not treated as chat', () => {
  assert.equal(parseAprsMessage('!4903.50N/07201.75W-Test'), null);
  assert.equal(parseAprsMessage('>Status only'), null);
  assert.equal(parseAprsMessage(':short'), null);
});

test('message text is sanitised and clamped to the APRS limit', () => {
  assert.equal(sanitizeMessageText('bad|chars~{here'), 'badcharshere');
  assert.equal(sanitizeMessageText('line1\nline2'), 'line1 line2');
  assert.equal(sanitizeMessageText('x'.repeat(120)).length, APRS_MAX_MESSAGE_LENGTH);
});

test('third-party packets expose the enclosed station and payload', () => {
  // Real packet gated by HI4R: APRSdroid message carried onto RF.
  const wrapped = unwrapThirdParty(
    '}HI3LAG-5>APDR16,TCPIP,HI4R*::HI3LAG-15:Ahora si si{13',
  );
  assert.ok(wrapped);
  assert.equal(wrapped.source, 'HI3LAG-5');
  assert.equal(wrapped.destination, 'APDR16');
  assert.equal(wrapped.info, ':HI3LAG-15:Ahora si si{13');

  const message = parseAprsMessage(wrapped.info);
  assert.equal(message?.kind, 'message');
  assert.equal(message?.addressee, 'HI3LAG-15');
  assert.equal(message?.text, 'Ahora si si');
  assert.equal(message?.messageId, '13');

  const ack = unwrapThirdParty('}HI3LAG-5>APDR16,TCPIP,HI4R*::HI3LAG-15:ack020');
  assert.equal(parseAprsMessage(ack!.info)?.kind, 'ack');
  assert.equal(parseAprsMessage(ack!.info)?.messageId, '020');

  assert.equal(unwrapThirdParty(':HI3LAG-15:plain message'), null);
  assert.equal(unwrapThirdParty('}broken'), null);
});

test('control bytes are made visible before a packet reaches a log', () => {
  // A real Mic-E packet: a stationary station encodes speed and course as 0x1c,
  // which a terminal swallows, leaving the line looking corrupt.
  assert.equal(
    escapeNonPrintable('`bCn\x1c\x1c\x1c>/"6!}Hello world!'),
    '`bCn<0x1c><0x1c><0x1c>>/"6!}Hello world!',
  );

  // Anyone can transmit an escape sequence, and the log goes to a terminal.
  assert.equal(escapeNonPrintable('\x1b[2J\x1b[31mfake'), '<0x1b>[2J<0x1b>[31mfake');
  assert.equal(escapeNonPrintable('tab\tend\x7f'), 'tab<0x09>end<0x7f>');

  // Ordinary text, including the punctuation APRS relies on, is untouched.
  assert.equal(escapeNonPrintable('K6KJZ-9>APRS:!4903.50N/07201.75W-'), 'K6KJZ-9>APRS:!4903.50N/07201.75W-');
});

test('bulletin addressees are classified as general lines or groups', () => {
  assert.equal(isBulletin('BLN0'), true);
  assert.equal(isBulletin('blngate'), true);
  assert.equal(isBulletin('K6KJZ-9'), false);

  assert.deepEqual(parseBulletinAddress('BLN0'), {
    addressee: 'BLN0',
    group: 'GENERAL',
    lineId: '0',
  });
  assert.deepEqual(parseBulletinAddress('BLNA'), {
    addressee: 'BLNA',
    group: 'GENERAL',
    lineId: 'A',
  });
  assert.deepEqual(parseBulletinAddress('BLNGATE'), {
    addressee: 'BLNGATE',
    group: 'GATE',
    lineId: null,
  });

  const bulletin = parseAprsMessage(':BLN0     :Net tonight 8PM on 145.110');
  assert.equal(bulletin?.kind, 'message');
  assert.equal(bulletin?.addressee, 'BLN0');
  assert.equal(bulletin?.text, 'Net tonight 8PM on 145.110');
});
