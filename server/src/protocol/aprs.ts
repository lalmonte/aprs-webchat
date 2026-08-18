/**
 * APRS application layer helpers: text messaging (data type ':'), ACK/REJ
 * handling and a small packet classifier used by the log console.
 *
 * Message payload layout (APRS 1.0.1, chapter 14):
 *   :ADDRESSEE:Message text{SEQ
 * The addressee field is always nine characters, padded with spaces. The
 * trailing "{SEQ" is optional and requests an acknowledgement.
 */

/** Maximum characters allowed in the message text field. */
export const APRS_MAX_MESSAGE_LENGTH = 67;

/** Length of the fixed-width addressee field. */
const ADDRESSEE_LENGTH = 9;

export type AprsMessageKind = 'message' | 'ack' | 'rej';

export interface ParsedAprsMessage {
  kind: AprsMessageKind;
  /** Callsign the message is addressed to, trimmed. */
  addressee: string;
  /** Message body; empty for ACK/REJ packets. */
  text: string;
  /** Sequence number requested for acknowledgement, when present. */
  messageId?: string;
  /** Piggybacked ack from the APRS 1.2 reply-ack convention. */
  replyAck?: string;
}

/**
 * Parses an APRS information field as a message packet.
 * Returns null when the payload is not a message (any other data type).
 */
export function parseAprsMessage(info: string): ParsedAprsMessage | null {
  if (!info.startsWith(':') || info.length < ADDRESSEE_LENGTH + 2) return null;

  // Telemetry parameter packets (:N0CALL   :PARM.…) share the message format
  // but are not chat traffic; they are still returned so callers can filter.
  const addressee = info.slice(1, 1 + ADDRESSEE_LENGTH).trim().toUpperCase();
  if (info[1 + ADDRESSEE_LENGTH] !== ':') return null;

  const body = info.slice(2 + ADDRESSEE_LENGTH);

  // ACK/REJ: ":N0CALL   :ack27" or the 1.2 form ":N0CALL   :ack}27".
  const receipt = /^(ack|rej)\}?([A-Za-z0-9]{1,5})\s*$/i.exec(body);
  if (receipt) {
    return {
      kind: receipt[1]!.toLowerCase() === 'ack' ? 'ack' : 'rej',
      addressee,
      text: '',
      messageId: receipt[2]!,
    };
  }

  // Optional "{SEQ" suffix, plus the optional reply-ack "}SEQ" of APRS 1.2.
  const withId = /^(.*?)\{([A-Za-z0-9]{1,5})(?:\}([A-Za-z0-9]{1,5})?)?$/s.exec(body);
  if (withId) {
    return {
      kind: 'message',
      addressee,
      text: withId[1]!,
      messageId: withId[2]!,
      replyAck: withId[3],
    };
  }

  return { kind: 'message', addressee, text: body };
}

/** Pads a callsign into the fixed-width addressee field. */
function formatAddressee(callsign: string): string {
  return callsign.toUpperCase().slice(0, ADDRESSEE_LENGTH).padEnd(ADDRESSEE_LENGTH, ' ');
}

/**
 * Strips characters forbidden in the message text field ('|', '~', '{' and
 * control codes) and clamps the result to the 67 character limit.
 */
export function sanitizeMessageText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\x00-\x1f\x7f|~{]/g, '')
    .slice(0, APRS_MAX_MESSAGE_LENGTH);
}

/** Builds ":ADDRESSEE:text{id" ready to be placed in the information field. */
export function buildMessagePayload(
  addressee: string,
  text: string,
  messageId?: string,
): string {
  const body = sanitizeMessageText(text);
  return `:${formatAddressee(addressee)}:${body}${messageId ? `{${messageId}` : ''}`;
}

/** Builds the acknowledgement packet for a received message id. */
export function buildAckPayload(addressee: string, messageId: string): string {
  return `:${formatAddressee(addressee)}:ack${messageId}`;
}

/** Builds a rejection packet for a received message id. */
export function buildRejPayload(addressee: string, messageId: string): string {
  return `:${formatAddressee(addressee)}:rej${messageId}`;
}

/**
 * Message ids cycle through a compact base-36 counter so they stay within the
 * five characters allowed by the specification.
 */
let messageIdCounter = Math.floor(Math.random() * 1000);
export function nextMessageId(): string {
  messageIdCounter = (messageIdCounter + 1) % 46656; // 36^3
  return messageIdCounter.toString(36).toUpperCase().padStart(3, '0');
}

/**
 * Bulletins and announcements are messages addressed to "BLN…"; group
 * messages use identifiers that are not our callsign at all.
 */
export function isBulletin(addressee: string): boolean {
  return /^BLN/i.test(addressee.trim());
}

/**
 * Classifies a BLN… addressee.
 *
 * General bulletin lines use a single character after BLN (`BLN0`…`BLN9`,
 * `BLNA`…`BLNZ`). Longer suffixes are group / announcement identifiers
 * (`BLNGATE`, `BLNWX`, …).
 */
export function parseBulletinAddress(addressee: string): {
  /** Normalized addressee, e.g. BLN0. */
  addressee: string;
  /** GENERAL for single-line IDs, otherwise the group name. */
  group: string;
  /** Line id within a general bulletin, when present. */
  lineId: string | null;
} | null {
  const normalized = addressee.trim().toUpperCase();
  if (!normalized.startsWith('BLN')) return null;

  const suffix = normalized.slice(3);
  if (suffix.length === 1 && /[0-9A-Z]/.test(suffix)) {
    return { addressee: normalized, group: 'GENERAL', lineId: suffix };
  }
  if (suffix.length > 0) {
    return { addressee: normalized, group: suffix, lineId: null };
  }
  return { addressee: normalized, group: 'GENERAL', lineId: null };
}

/** Case-insensitive comparison of two callsign-SSID strings. */
export function callsignEquals(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * Contents of a third-party packet (data type '}').
 * Igates use this form when they gate an internet packet onto RF:
 *   }HI3LAG-5>APDR16,TCPIP,HI4R*::HI3LAG-15:Hello{13
 */
export interface ThirdPartyPacket {
  /** Station that originated the enclosed packet. */
  source: string;
  /** Tocall / destination of the enclosed packet. */
  destination: string;
  /** Enclosed information field (starts with the real data-type byte). */
  info: string;
}

/**
 * Unwraps one level of third-party traffic.
 * Returns null when the field is not a well-formed `}SOURCE>DEST[,VIA…]:info`.
 */
export function unwrapThirdParty(info: string): ThirdPartyPacket | null {
  if (!info.startsWith('}') || info.length < 5) return null;

  const body = info.slice(1);
  const colon = body.indexOf(':');
  if (colon < 1) return null;

  const header = body.slice(0, colon);
  const payload = body.slice(colon + 1);
  const gt = header.indexOf('>');
  if (gt < 1) return null;

  const source = header.slice(0, gt).trim().toUpperCase();
  const rest = header.slice(gt + 1);
  const destination = (rest.split(',')[0] ?? '').trim().toUpperCase();
  if (!source || !destination) return null;

  return { source, destination, info: payload };
}

/**
 * Makes packet bytes safe and legible for a log. APRS information fields
 * legitimately carry control characters — Mic-E encodes speed and course in the
 * 0x1c range — which a terminal either swallows, leaving a line that looks
 * corrupt, or acts upon: anyone can transmit an escape sequence on the air, and
 * the log is written straight to the operator's terminal. The `<0xNN>` notation
 * matches Direwolf's monitor output so both logs can be compared side by side.
 */
// eslint-disable-next-line no-control-regex -- matching control bytes is the point
const CONTROL_BYTES = /[\u0000-\u001f\u007f]/g;
export function escapeNonPrintable(text: string): string {
  return text.replace(
    CONTROL_BYTES,
    (character) => `<0x${character.charCodeAt(0).toString(16).padStart(2, '0')}>`,
  );
}

const DATA_TYPE_LABELS: Record<string, string> = {
  '!': 'Position (no timestamp)',
  '=': 'Position (with messaging)',
  '/': 'Position (with timestamp)',
  '@': 'Position (timestamp + messaging)',
  ':': 'Message',
  '>': 'Status',
  ';': 'Object',
  ')': 'Item',
  '?': 'Query',
  '<': 'Station capabilities',
  'T': 'Telemetry',
  '`': 'Mic-E (current)',
  "'": 'Mic-E (old)',
  '$': 'Raw NMEA',
  '_': 'Weather report',
  '#': 'Raw weather (Peet)',
  '*': 'Complete weather',
  '{': 'User defined',
  '}': 'Third-party traffic',
};

/** Human readable label for the APRS data type identifier, used in the logs. */
export function describeDataType(info: string): string {
  if (info.length === 0) return 'Empty';
  return DATA_TYPE_LABELS[info[0]!] ?? `Unknown (${info[0]})`;
}
