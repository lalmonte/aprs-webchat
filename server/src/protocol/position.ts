/**
 * APRS position decoding.
 *
 * Four encodings are in daily use on the air and all of them are handled here:
 *
 *   - Uncompressed:  !4903.50N/07201.75W-Comment
 *   - Compressed:    !/5L!!<*e7> sT          (base91, 13 characters)
 *   - Mic-E:         `(_fn"Oj/               (latitude hidden in the AX.25
 *                                             destination address)
 *   - Objects/items: ;LEADER   *092345z...   and  )AID!...
 *
 * References: APRS Protocol Reference 1.0.1, chapters 6, 9, 10 and 11.
 */

export type PositionFormat = 'uncompressed' | 'compressed' | 'mic-e' | 'object' | 'item';

export interface AprsPosition {
  latitude: number;
  longitude: number;
  /** '/' primary table, '\' alternate table, or an overlay character. */
  symbolTable: string;
  symbolCode: string;
  /** Course over ground in degrees, when reported. */
  course?: number;
  /** Speed in knots, when reported. */
  speed?: number;
  /** Altitude in metres, when reported. */
  altitude?: number;
  comment: string;
  /** Name carried by objects and items. */
  name?: string;
  format: PositionFormat;
}

const KNOTS_PER_MPH = 0.868976;
const METRES_PER_FOOT = 0.3048;

/** Latitude/longitude must be plausible; corrupt packets are common on RF. */
function isPlausible(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // 0,0 is the classic "no fix yet" placeholder.
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Pulls course/speed, altitude and PHG out of the free-form comment.
 * The extensions are fixed-width and always sit at the front of the comment,
 * except for altitude which may appear anywhere.
 */
function extractExtensions(comment: string): {
  comment: string;
  course?: number;
  speed?: number;
  altitude?: number;
} {
  let rest = comment;
  let course: number | undefined;
  let speed: number | undefined;
  let altitude: number | undefined;

  // "090/036" = course 90 degrees, speed 36 knots.
  const courseSpeed = /^(\d{3})\/(\d{3})/.exec(rest);
  if (courseSpeed) {
    const parsedCourse = Number.parseInt(courseSpeed[1]!, 10);
    const parsedSpeed = Number.parseInt(courseSpeed[2]!, 10);
    if (parsedCourse > 0 && parsedCourse <= 360) course = parsedCourse % 360;
    if (parsedSpeed >= 0) speed = parsedSpeed;
    rest = rest.slice(7);
  } else if (/^PHG\d{4}/.test(rest) || /^RNG\d{4}/.test(rest)) {
    // Transmitter power/antenna data: not a position, just drop the prefix.
    rest = rest.slice(7);
  }

  // "/A=001234" is altitude in feet, and may appear anywhere in the comment.
  const altitudeMatch = /\/A=(-?\d{6})/.exec(rest);
  if (altitudeMatch) {
    altitude = Number.parseInt(altitudeMatch[1]!, 10) * METRES_PER_FOOT;
    rest = rest.replace(altitudeMatch[0], '');
  }

  return { comment: rest.trim(), course, speed, altitude };
}

/**
 * Uncompressed body: 8 characters of latitude, symbol table, 9 characters of
 * longitude, symbol code. Spaces inside the minutes express position ambiguity.
 */
function parseUncompressed(body: string): AprsPosition | null {
  const match = /^(\d{2})([0-7 ][0-9 ]\.[0-9 ][0-9 ])([NS])(.)(\d{3})([0-7 ][0-9 ]\.[0-9 ][0-9 ])([EW])(.)/.exec(
    body,
  );
  if (!match) return null;

  // Ambiguous digits are transmitted as spaces; treat them as zeroes.
  const latitudeMinutes = Number.parseFloat(match[2]!.replace(/ /g, '0'));
  const longitudeMinutes = Number.parseFloat(match[6]!.replace(/ /g, '0'));
  if (!Number.isFinite(latitudeMinutes) || !Number.isFinite(longitudeMinutes)) return null;

  let latitude = Number.parseInt(match[1]!, 10) + latitudeMinutes / 60;
  let longitude = Number.parseInt(match[5]!, 10) + longitudeMinutes / 60;
  if (match[3] === 'S') latitude = -latitude;
  if (match[7] === 'W') longitude = -longitude;

  if (!isPlausible(latitude, longitude)) return null;

  const extensions = extractExtensions(body.slice(match[0].length));

  return {
    latitude,
    longitude,
    symbolTable: match[4]!,
    symbolCode: match[8]!,
    format: 'uncompressed',
    ...extensions,
  };
}

/** Base91 digit used by the compressed format; printable ASCII from '!'. */
function base91(text: string): number {
  let value = 0;
  for (const character of text) value = value * 91 + (character.charCodeAt(0) - 33);
  return value;
}

/**
 * Compressed body: symbol table, 4 base91 latitude characters, 4 longitude,
 * symbol code, two characters of course/speed or range, and a type byte.
 */
function parseCompressed(body: string): AprsPosition | null {
  if (body.length < 13) return null;

  const symbolTable = body[0]!;
  const latitudeChars = body.slice(1, 5);
  const longitudeChars = body.slice(5, 9);
  const symbolCode = body[9]!;
  const courseSpeed = body.slice(10, 12);

  if (!/^[!-{]{8}$/.test(latitudeChars + longitudeChars)) return null;

  const latitude = 90 - base91(latitudeChars) / 380926;
  const longitude = -180 + base91(longitudeChars) / 190463;
  if (!isPlausible(latitude, longitude)) return null;

  let course: number | undefined;
  let speed: number | undefined;
  let altitude: number | undefined;

  const first = courseSpeed.charCodeAt(0) - 33;
  const second = courseSpeed.charCodeAt(1) - 33;

  if (courseSpeed[0] === ' ') {
    // No course/speed information present.
  } else if (courseSpeed[0] === '{') {
    // Pre-calculated radio range, not a position extension we display.
  } else if (first >= 0 && first <= 89) {
    const typeByte = body.charCodeAt(12) - 33;
    // Bits 4-3 of the type byte select the meaning of the two characters.
    if (((typeByte >> 3) & 0x03) === 0x02) {
      altitude = Math.round(1.002 ** (first * 91 + second) * METRES_PER_FOOT);
    } else {
      course = first * 4;
      if (course === 0) course = 360;
      course %= 360;
      speed = Math.round(1.08 ** second - 1);
    }
  }

  const extensions = extractExtensions(body.slice(13));

  return {
    latitude,
    longitude,
    symbolTable,
    symbolCode,
    course,
    speed,
    altitude: altitude ?? extensions.altitude,
    comment: extensions.comment,
    format: 'compressed',
  };
}

/**
 * Mic-E hides the latitude, the north/south and east/west flags and a
 * longitude offset inside the six characters of the AX.25 destination address.
 */
function parseMicE(info: string, destination: string): AprsPosition | null {
  const address = destination.toUpperCase().split('-')[0] ?? '';
  if (address.length < 6 || info.length < 9) return null;

  let latitudeDigits = '';
  for (let i = 0; i < 6; i += 1) {
    const character = address[i]!;
    if (character >= '0' && character <= '9') latitudeDigits += character;
    else if (character >= 'A' && character <= 'J') latitudeDigits += String.fromCharCode(character.charCodeAt(0) - 'A'.charCodeAt(0) + '0'.charCodeAt(0));
    else if (character >= 'P' && character <= 'Y') latitudeDigits += String.fromCharCode(character.charCodeAt(0) - 'P'.charCodeAt(0) + '0'.charCodeAt(0));
    else if (character === 'K' || character === 'L' || character === 'Z') latitudeDigits += '0';
    else return null;
  }

  const isNorth = /[P-Z]/.test(address[3]!);
  const hasLongitudeOffset = /[P-Z]/.test(address[4]!);
  const isWest = /[P-Z]/.test(address[5]!);

  const latitude =
    (Number.parseInt(latitudeDigits.slice(0, 2), 10) +
      Number.parseFloat(`${latitudeDigits.slice(2, 4)}.${latitudeDigits.slice(4, 6)}`) / 60) *
    (isNorth ? 1 : -1);

  // Longitude lives in the first three bytes of the information field.
  let degrees = info.charCodeAt(1) - 28;
  if (hasLongitudeOffset) degrees += 100;
  if (degrees >= 180 && degrees <= 189) degrees -= 80;
  else if (degrees >= 190 && degrees <= 199) degrees -= 190;

  let minutes = info.charCodeAt(2) - 28;
  if (minutes >= 60) minutes -= 60;

  const hundredths = info.charCodeAt(3) - 28;
  const longitude = (degrees + (minutes + hundredths / 100) / 60) * (isWest ? -1 : 1);

  if (!isPlausible(latitude, longitude)) return null;

  // Speed and course share three bytes.
  let speed = (info.charCodeAt(4) - 28) * 10 + Math.floor((info.charCodeAt(5) - 28) / 10);
  let course = ((info.charCodeAt(5) - 28) % 10) * 100 + (info.charCodeAt(6) - 28);
  if (speed >= 800) speed -= 800;
  if (course >= 400) course -= 400;

  const symbolCode = info[7]!;
  const symbolTable = info[8]!;
  let comment = info.slice(9);
  let altitude: number | undefined;

  // Optional altitude: three base91 characters followed by '}', metres above
  // a datum 10000 m below sea level.
  const altitudeMatch = /^(.{3})\}/.exec(comment);
  if (altitudeMatch) {
    altitude = base91(altitudeMatch[1]!) - 10_000;
    comment = comment.slice(4);
  }

  const extensions = extractExtensions(comment);

  return {
    latitude,
    longitude,
    symbolTable,
    symbolCode,
    course: course > 0 ? course % 360 : undefined,
    speed: speed > 0 ? speed : undefined,
    altitude: altitude ?? extensions.altitude,
    comment: extensions.comment,
    format: 'mic-e',
  };
}

/** Position bodies start with a digit when uncompressed. */
function parseBody(body: string): AprsPosition | null {
  return /^\d/.test(body) ? parseUncompressed(body) : parseCompressed(body);
}

/** Timestamps are seven characters ending in 'z', 'h' or '/'. */
function stripTimestamp(body: string): string {
  return /^\d{6}[zh/]/.test(body) ? body.slice(7) : body;
}

/**
 * Extracts a position from an APRS information field.
 * `destination` is the AX.25 destination address, required to decode Mic-E.
 * Returns null for packets that carry no position.
 */
export function parseAprsPosition(info: string, destination = ''): AprsPosition | null {
  if (info.length < 2) return null;

  const dataType = info[0]!;

  switch (dataType) {
    case '!':
    case '=':
      return parseBody(info.slice(1));

    case '/':
    case '@':
      return parseBody(stripTimestamp(info.slice(1)));

    case '`':
    case "'":
      return parseMicE(info, destination);

    case ';': {
      // ;NAME     *092345z<position>
      const match = /^;(.{9})[*_](.*)$/s.exec(info);
      if (!match) return null;
      const position = parseBody(stripTimestamp(match[2]!));
      return position ? { ...position, name: match[1]!.trim(), format: 'object' } : null;
    }

    case ')': {
      // )NAME!<position>  — the name is 3 to 9 characters.
      const match = /^\)([^!_]{3,9})[!_](.*)$/s.exec(info);
      if (!match) return null;
      const position = parseBody(match[2]!);
      return position ? { ...position, name: match[1]!.trim(), format: 'item' } : null;
    }

    default:
      return null;
  }
}

/** Converts knots to km/h for display. */
export function knotsToKmh(knots: number): number {
  return knots * KNOTS_PER_MPH * 1.609344;
}

/** Practical limit for the free-form comment after the symbol byte. */
export const APRS_POSITION_COMMENT_MAX = 43;

/**
 * Formats a decimal degree into APRS uncompressed form: `DDMM.mmN` or
 * `DDDMM.mmW`. Minutes are truncated to two decimals, matching common practice.
 */
export function formatAprsCoordinate(value: number, axis: 'latitude' | 'longitude'): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  const degreeWidth = axis === 'latitude' ? 2 : 3;
  const degreeText = String(degrees).padStart(degreeWidth, '0');
  // toFixed can produce "60.00" from floating noise; clamp into the minute field.
  let minuteText = minutes.toFixed(2);
  if (Number.parseFloat(minuteText) >= 60) {
    minuteText = '59.99';
  }
  minuteText = minuteText.padStart(5, '0');

  const hemisphere =
    axis === 'latitude' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';

  return `${degreeText}${minuteText}${hemisphere}`;
}

function sanitizePositionComment(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\x00-\x1f\x7f|~{]/g, '')
    .slice(0, APRS_POSITION_COMMENT_MAX);
}

export interface PositionBeaconOptions {
  latitude: number;
  longitude: number;
  /** '/' primary table or '\' alternate. */
  symbolTable: string;
  symbolCode: string;
  comment?: string;
  /** When true, uses '=' so the station is marked as message-capable. */
  messaging?: boolean;
}

/**
 * Builds an uncompressed APRS position information field suitable for a
 * periodic beacon, e.g. `=1928.45N/07039.82W-QTH Santiago`.
 */
export function buildPositionPayload(options: PositionBeaconOptions): string {
  if (!isPlausible(options.latitude, options.longitude)) {
    throw new Error('Beacon coordinates are out of range or are the 0,0 placeholder.');
  }

  const table = options.symbolTable === '\\' ? '\\' : '/';
  const code = (options.symbolCode || '-').slice(0, 1);
  if (!code || code === ' ') {
    throw new Error('Beacon symbol code must be a single non-space character.');
  }

  const dataType = options.messaging === false ? '!' : '=';
  const latitude = formatAprsCoordinate(options.latitude, 'latitude');
  const longitude = formatAprsCoordinate(options.longitude, 'longitude');
  const comment = sanitizePositionComment(options.comment ?? '');

  return `${dataType}${latitude}${table}${longitude}${code}${comment}`;
}
