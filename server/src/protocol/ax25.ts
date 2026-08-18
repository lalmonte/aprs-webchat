/**
 * Minimal AX.25 encoder/decoder covering the UI (Unnumbered Information)
 * frames that APRS rides on.
 *
 * Wire layout:
 *   [dest 7B][source 7B][0..8 digipeaters, 7B each][control 1B][PID 1B][info]
 *
 * Every address field stores the callsign as six ASCII characters shifted one
 * bit to the left, followed by an SSID byte. The low bit of the SSID byte marks
 * the last address of the chain.
 */

export const CONTROL_UI = 0x03;
export const PID_NO_LAYER_3 = 0xf0;

const ADDRESS_LENGTH = 7;
const MAX_DIGIPEATERS = 8;

export interface Ax25Address {
  callsign: string;
  ssid: number;
  /** Digipeater "has been repeated" (H) bit. Meaningless on source/dest. */
  repeated?: boolean;
}

export interface Ax25Frame {
  destination: Ax25Address;
  source: Ax25Address;
  /** Digipeater path, in order. */
  path: Ax25Address[];
  control: number;
  pid: number;
  info: Buffer;
}

/** "K6KJZ-9" -> { callsign: "K6KJZ", ssid: 9 }. Also understands a trailing "*". */
export function parseAddress(text: string): Ax25Address {
  let value = text.trim().toUpperCase();
  let repeated = false;

  if (value.endsWith('*')) {
    repeated = true;
    value = value.slice(0, -1);
  }

  const [rawCall = '', rawSsid = '0'] = value.split('-');
  const ssid = Number.parseInt(rawSsid, 10);

  return {
    callsign: rawCall.slice(0, 6),
    ssid: Number.isFinite(ssid) ? Math.max(0, Math.min(15, ssid)) : 0,
    repeated,
  };
}

/** { callsign: "K6KJZ", ssid: 9 } -> "K6KJZ-9" (SSID 0 is omitted). */
export function formatAddress(address: Ax25Address): string {
  return address.ssid === 0 ? address.callsign : `${address.callsign}-${address.ssid}`;
}

type AddressRole = 'destination' | 'source' | 'digipeater';

function encodeAddress(address: Ax25Address, role: AddressRole, isLast: boolean): Buffer {
  const bytes = Buffer.alloc(ADDRESS_LENGTH, 0x40); // 0x40 == ' ' << 1 (padding)
  const callsign = address.callsign.toUpperCase().slice(0, 6);

  for (let i = 0; i < callsign.length; i += 1) {
    bytes[i] = (callsign.charCodeAt(i) << 1) & 0xfe;
  }

  // Bits 6-5 are reserved and transmitted as 1. Bit 7 is the C bit on the
  // address pair and the H bit ("already repeated") on digipeaters. APRS frames
  // are commands, which means C=1 on the destination and C=0 on the source.
  let ssidByte = 0x60 | ((address.ssid & 0x0f) << 1);
  if (role === 'destination' || (role === 'digipeater' && address.repeated)) ssidByte |= 0x80;
  if (isLast) ssidByte |= 0x01;

  bytes[6] = ssidByte;
  return bytes;
}

function decodeAddress(bytes: Buffer): { address: Ax25Address; isLast: boolean } {
  let callsign = '';
  for (let i = 0; i < 6; i += 1) {
    callsign += String.fromCharCode(bytes[i]! >> 1);
  }

  const ssidByte = bytes[6]!;
  return {
    address: {
      callsign: callsign.trim(),
      ssid: (ssidByte >> 1) & 0x0f,
      repeated: (ssidByte & 0x80) !== 0,
    },
    isLast: (ssidByte & 0x01) !== 0,
  };
}

export function encodeAx25(frame: Ax25Frame): Buffer {
  const path = frame.path.slice(0, MAX_DIGIPEATERS);
  const chunks: Buffer[] = [
    encodeAddress(frame.destination, 'destination', false),
    encodeAddress(frame.source, 'source', path.length === 0),
  ];

  path.forEach((digipeater, index) => {
    chunks.push(encodeAddress(digipeater, 'digipeater', index === path.length - 1));
  });

  chunks.push(Buffer.from([frame.control, frame.pid]), frame.info);
  return Buffer.concat(chunks);
}

export function decodeAx25(buffer: Buffer): Ax25Frame | null {
  if (buffer.length < ADDRESS_LENGTH * 2 + 2) return null;

  const addresses: Ax25Address[] = [];
  let offset = 0;
  let sawLast = false;

  while (offset + ADDRESS_LENGTH <= buffer.length && addresses.length < MAX_DIGIPEATERS + 2) {
    const { address, isLast } = decodeAddress(buffer.subarray(offset, offset + ADDRESS_LENGTH));
    addresses.push(address);
    offset += ADDRESS_LENGTH;
    if (isLast) {
      sawLast = true;
      break;
    }
  }

  if (!sawLast || addresses.length < 2 || offset + 2 > buffer.length) return null;

  // Bit 7 of the address pair is the C bit, not the digipeater H bit.
  const destination: Ax25Address = { ...addresses[0]!, repeated: false };
  const source: Ax25Address = { ...addresses[1]!, repeated: false };

  return {
    destination,
    source,
    path: addresses.slice(2),
    control: buffer[offset]!,
    pid: buffer[offset + 1]!,
    info: buffer.subarray(offset + 2),
  };
}

/** True for the UI/no-layer-3 frames that carry APRS payloads. */
export function isAprsUiFrame(frame: Ax25Frame): boolean {
  return frame.control === CONTROL_UI && frame.pid === PID_NO_LAYER_3;
}

/** Renders a frame in the human readable TNC2 monitor format. */
export function frameToTnc2(frame: Ax25Frame): string {
  const path = frame.path.map(
    (digipeater) => `${formatAddress(digipeater)}${digipeater.repeated ? '*' : ''}`,
  );
  const header = [formatAddress(frame.destination), ...path].join(',');
  return `${formatAddress(frame.source)}>${header}:${frame.info.toString('latin1')}`;
}

/** Parses a TNC2 line ("SRC>DEST,WIDE1-1:>status") such as those sent by APRS-IS. */
export function tnc2ToFrame(line: string): Ax25Frame | null {
  const separator = line.indexOf(':');
  if (separator < 0) return null;

  const header = line.slice(0, separator);
  const info = line.slice(separator + 1);
  const arrow = header.indexOf('>');
  if (arrow < 0) return null;

  const source = parseAddress(header.slice(0, arrow));
  const [destination, ...path] = header.slice(arrow + 1).split(',');
  if (!destination) return null;

  return {
    destination: parseAddress(destination),
    source,
    path: path.map(parseAddress),
    control: CONTROL_UI,
    pid: PID_NO_LAYER_3,
    info: Buffer.from(info, 'latin1'),
  };
}
