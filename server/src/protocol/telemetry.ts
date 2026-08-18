/**
 * APRS telemetry decoding (data type `T` and PARM/UNIT/EQNS/BITS metadata).
 *
 * Data packet:
 *   T#SEQ,a1,a2,a3,a4,a5,bbbbbbbb
 *
 * Metadata arrives as self-addressed messages:
 *   :CALLSIGN :PARM.name1,name2,...
 *   :CALLSIGN :UNIT.unit1,unit2,...
 *   :CALLSIGN :EQNS.a,b,c,a,b,c,...
 *   :CALLSIGN :BITS.xxxxxxxx,project title
 *
 * Scaled value for channel i: a·x² + b·x + c.
 */

import type { TelemetryDefinitions, TelemetryEquations, TelemetrySample } from '../types.js';

const DEFAULT_NAMES = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'];
const DEFAULT_UNITS = ['', '', '', '', '', '', '', '', '', '', '', '', ''];

export function emptyTelemetryDefinitions(): TelemetryDefinitions {
  return {
    names: [...DEFAULT_NAMES],
    units: [...DEFAULT_UNITS],
    equations: Array.from({ length: 5 }, () => ({ a: 0, b: 1, c: 0 })),
    bitSense: Array.from({ length: 8 }, () => true),
  };
}

/** Applies EQNS coefficients to a raw channel reading. */
export function scaleTelemetryValue(raw: number, eq: TelemetryEquations): number {
  return eq.a * raw * raw + eq.b * raw + eq.c;
}

/**
 * Parses a `T#…` information field. Accepts both classic 000–255 integers and
 * the modern floating-point form used by many digis.
 */
export function parseTelemetryData(info: string): Omit<TelemetrySample, 'timestamp'> | null {
  if (!info.startsWith('T#') || info.length < 4) return null;

  const body = info.slice(2);
  const parts = body.split(',');
  if (parts.length < 2) return null;

  const sequence = Number.parseInt(parts[0]!, 10);
  if (!Number.isFinite(sequence)) return null;

  const analog: number[] = [];
  let digital: boolean[] | undefined;

  for (let i = 1; i < parts.length && analog.length < 5; i += 1) {
    const token = parts[i]!.trim();
    // The digital bitmask is eight 0/1 characters and only appears after five analogs.
    if (analog.length === 5 && /^[01]{8}$/.test(token)) {
      digital = [...token].map((bit) => bit === '1');
      break;
    }
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) break;
    analog.push(value);
  }

  // Digital bits may appear after fewer than five analogs.
  if (!digital && parts.length > analog.length + 1) {
    const token = parts[analog.length + 1]!.trim();
    if (/^[01]{8}$/.test(token)) digital = [...token].map((bit) => bit === '1');
  }

  if (analog.length === 0) return null;
  return { sequence, analog, digital };
}

/** True when a message body is telemetry metadata rather than chat. */
export function isTelemetryMetadata(text: string): boolean {
  return /^(PARM|UNIT|EQNS|BITS)\./i.test(text);
}

/**
 * Merges a PARM/UNIT/EQNS/BITS line into existing definitions.
 * Returns null when the text is not telemetry metadata.
 */
export function applyTelemetryMetadata(
  current: TelemetryDefinitions,
  text: string,
): TelemetryDefinitions | null {
  const match = /^(PARM|UNIT|EQNS|BITS)\.(.*)$/is.exec(text);
  if (!match) return null;

  const kind = match[1]!.toUpperCase();
  const payload = match[2]!;
  const next: TelemetryDefinitions = {
    names: [...current.names],
    units: [...current.units],
    equations: current.equations.map((eq) => ({ ...eq })),
    bitSense: [...current.bitSense],
    projectTitle: current.projectTitle,
  };

  if (kind === 'PARM') {
    const names = payload.split(',').map((part) => part.trim());
    for (let i = 0; i < Math.min(names.length, 13); i += 1) {
      if (names[i]) next.names[i] = names[i]!;
    }
    return next;
  }

  if (kind === 'UNIT') {
    const units = payload.split(',').map((part) => part.trim());
    for (let i = 0; i < Math.min(units.length, 13); i += 1) {
      if (units[i] !== undefined) next.units[i] = units[i]!;
    }
    return next;
  }

  if (kind === 'EQNS') {
    const numbers = payload.split(',').map((part) => Number.parseFloat(part.trim()));
    for (let channel = 0; channel < 5; channel += 1) {
      const base = channel * 3;
      const a = numbers[base];
      const b = numbers[base + 1];
      const c = numbers[base + 2];
      if (a === undefined || b === undefined || c === undefined) break;
      if (![a, b, c].every(Number.isFinite)) continue;
      next.equations[channel] = { a, b, c };
    }
    return next;
  }

  // BITS.xxxxxxxx,optional title
  const bitMatch = /^([01.]{8})(?:,(.*))?$/.exec(payload);
  if (!bitMatch) return next;
  next.bitSense = [...bitMatch[1]!].map((bit) => bit !== '0');
  if (bitMatch[2]?.trim()) next.projectTitle = bitMatch[2].trim();
  return next;
}
