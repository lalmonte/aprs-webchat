import type { AckState, TransportId } from '../types';

/** APRS limits the message text field to 67 characters. */
export const APRS_MAX_MESSAGE_LENGTH = 67;

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const preciseFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** "14:32" — used on message bubbles. */
export function formatClock(timestamp: number): string {
  return clockFormatter.format(timestamp);
}

/** "14:32:07" — used on log lines. */
export function formatPreciseClock(timestamp: number): string {
  return preciseFormatter.format(timestamp);
}

/** "just now", "4m", "2h", "3d" — compact form for the sidebar. */
export function formatRelative(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/** Same as `formatRelative` but reads as a sentence: "4m ago", "just now". */
export function formatAge(timestamp: number, now = Date.now()): string {
  const relative = formatRelative(timestamp, now);
  return relative === 'just now' ? relative : `${relative} ago`;
}

export const TRANSPORT_LABELS: Record<TransportId, string> = {
  rf: 'RF',
  aprsis: 'APRS-IS',
};

export const TRANSPORT_DESCRIPTIONS: Record<TransportId, string> = {
  rf: 'Transmit through the local Direwolf TNC over the radio.',
  aprsis: 'Transmit through the APRS-IS internet backbone.',
};

/** Converts knots to km/h. */
export function knotsToKmh(knots: number): number {
  return knots * 1.852;
}

/** mph → km/h (weather wind). */
export function mphToKmh(mph: number): number {
  return mph * 1.609344;
}

/** °F → °C. */
export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

/** Inches → millimetres. */
export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

/** Formats a temperature with both °C and °F. */
export function formatTemperature(f: number): string {
  return `${fahrenheitToCelsius(f).toFixed(1)} °C (${Math.round(f)} °F)`;
}

/** Formats wind with direction and metric speed. */
export function formatWind(direction: number | undefined, mph: number | undefined): string | null {
  if (direction === undefined && mph === undefined) return null;
  const parts: string[] = [];
  if (direction !== undefined) parts.push(`${direction}°`);
  if (mph !== undefined) parts.push(`${Math.round(mphToKmh(mph))} km/h`);
  return parts.join(' · ');
}

/** Formats rain in millimetres from inches. */
export function formatRainInches(inches: number): string {
  return `${inchesToMm(inches).toFixed(1)} mm`;
}

/**
 * Plain-language name for the most common APRS symbols, so a popup does not
 * just show a punctuation character. Unknown codes fall back to the raw pair.
 */
const PRIMARY_SYMBOLS: Record<string, string> = {
  '!': 'Emergency',
  '#': 'Digipeater',
  '$': 'Phone',
  '&': 'Gateway',
  "'": 'Aircraft',
  '-': 'Home station',
  '/': 'Dot',
  '<': 'Motorcycle',
  '>': 'Car',
  'C': 'Canoe',
  'F': 'Tractor',
  'I': 'TCP/IP station',
  'O': 'Balloon',
  'P': 'Police',
  'R': 'Recreational vehicle',
  'U': 'Bus',
  'X': 'Helicopter',
  'Y': 'Yacht',
  '[': 'Person',
  '_': 'Weather station',
  'a': 'Ambulance',
  'b': 'Bicycle',
  'f': 'Fire truck',
  'j': 'Jeep',
  'k': 'Truck',
  'm': 'Repeater',
  'r': 'Antenna',
  's': 'Boat',
  'u': 'Truck (18 wheeler)',
  'v': 'Van',
  'y': 'Yagi at QTH',
};

export function describeSymbol(table: string, code: string): string {
  const name = table === '/' ? PRIMARY_SYMBOLS[code] : undefined;
  const raw = `${table}${code}`;
  if (name) return `${name} (${raw})`;
  return table === '\\' ? `Alternate symbol ${raw}` : `Symbol ${raw}`;
}

/** Short receipt marker rendered next to outgoing bubbles. */
export const ACK_LABELS: Record<AckState, string> = {
  pending: 'Sending',
  sent: 'Waiting for ACK',
  acked: 'Acknowledged',
  rejected: 'Rejected',
  failed: 'No ACK received',
};
