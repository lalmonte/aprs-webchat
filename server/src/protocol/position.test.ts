import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPositionPayload, formatAprsCoordinate, parseAprsPosition } from './position.js';

/** Coordinates are compared to roughly one metre. */
function assertClose(actual: number | undefined, expected: number, message: string): void {
  assert.ok(actual !== undefined, `${message}: value is missing`);
  assert.ok(
    Math.abs(actual - expected) < 0.00002,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

test('uncompressed position without timestamp', () => {
  const position = parseAprsPosition('!4903.50N/07201.75W-Test station');
  assert.ok(position);
  assertClose(position.latitude, 49 + 3.5 / 60, 'latitude');
  assertClose(position.longitude, -(72 + 1.75 / 60), 'longitude');
  assert.equal(position.symbolTable, '/');
  assert.equal(position.symbolCode, '-');
  assert.equal(position.comment, 'Test station');
  assert.equal(position.format, 'uncompressed');
});

test('southern and eastern hemispheres are signed correctly', () => {
  const position = parseAprsPosition('=3345.60S/15112.30E-Sydney');
  assert.ok(position);
  assertClose(position.latitude, -(33 + 45.6 / 60), 'latitude');
  assertClose(position.longitude, 151 + 12.3 / 60, 'longitude');
});

test('a timestamp is skipped before the position', () => {
  const position = parseAprsPosition('@092345z4903.50N/07201.75W>Mobile');
  assert.ok(position);
  assertClose(position.latitude, 49 + 3.5 / 60, 'latitude');
  assert.equal(position.symbolCode, '>');
  assert.equal(position.comment, 'Mobile');
});

test('course, speed and altitude extensions are pulled from the comment', () => {
  const position = parseAprsPosition('!4903.50N/07201.75W>088/036/A=001280Heading home');
  assert.ok(position);
  assert.equal(position.course, 88);
  assert.equal(position.speed, 36);
  assertClose(position.altitude, 1280 * 0.3048, 'altitude');
  assert.equal(position.comment, 'Heading home');
});

test('position ambiguity expressed with spaces is tolerated', () => {
  const position = parseAprsPosition('!4903.  N/07201.  W-Vague');
  assert.ok(position);
  assertClose(position.latitude, 49 + 3 / 60, 'latitude');
  assertClose(position.longitude, -(72 + 1 / 60), 'longitude');
});

test('compressed position, the example from the specification', () => {
  // "/5L!!<*e7> sT" decodes to 49.5 N, 72.75 W with a car symbol.
  const position = parseAprsPosition('!/5L!!<*e7> sT');
  assert.ok(position);
  assertClose(position.latitude, 49.5, 'latitude');
  assertClose(position.longitude, -72.75, 'longitude');
  assert.equal(position.symbolTable, '/');
  assert.equal(position.symbolCode, '>');
  assert.equal(position.format, 'compressed');
});

test('Mic-E, the example from the specification', () => {
  // Destination "S32U6T" carries 33 25.64 N; the info field carries 12 07.74 W,
  // 20 knots and a course of 251 degrees.
  const position = parseAprsPosition('`(_fn"Oj/', 'S32U6T');
  assert.ok(position);
  assertClose(position.latitude, 33 + 25.64 / 60, 'latitude');
  assertClose(position.longitude, -(12 + 7.74 / 60), 'longitude');
  assert.equal(position.speed, 20);
  assert.equal(position.course, 251);
  assert.equal(position.symbolCode, 'j');
  assert.equal(position.symbolTable, '/');
  assert.equal(position.format, 'mic-e');
});

test('Mic-E honours the south and east flags', () => {
  // Digits 0-9 in the flag positions mean south and east.
  const position = parseAprsPosition('`(_fn"Oj/', 'S32160');
  assert.ok(position);
  assert.ok(position.latitude < 0, 'latitude should be south');
  assert.ok(position.longitude > 0, 'longitude should be east');
});

test('objects and items expose their name', () => {
  const object = parseAprsPosition(';LEADER   *092345z4903.50N/07201.75W>Net control');
  assert.ok(object);
  assert.equal(object.name, 'LEADER');
  assert.equal(object.format, 'object');
  assertClose(object.latitude, 49 + 3.5 / 60, 'latitude');

  const item = parseAprsPosition(')AID!4903.50N/07201.75WAFirst aid');
  assert.ok(item);
  assert.equal(item.name, 'AID');
  assert.equal(item.format, 'item');
});

test('packets without a position are rejected', () => {
  assert.equal(parseAprsPosition(':N0CALL   :Hello{01'), null, 'message');
  assert.equal(parseAprsPosition('>Just a status'), null, 'status');
  assert.equal(parseAprsPosition('T#005,199,000,255,073,123,01101001', ''), null, 'telemetry');
  assert.equal(parseAprsPosition('!not a position'), null, 'malformed');
  assert.equal(parseAprsPosition(''), null, 'empty');
});

test('implausible coordinates are discarded', () => {
  assert.equal(parseAprsPosition('!9903.50N/07201.75W-'), null, 'latitude beyond the pole');
  assert.equal(parseAprsPosition('!0000.00N/00000.00W-'), null, 'null island placeholder');
});

test('uncompressed coordinates round-trip through the beacon builder', () => {
  assert.equal(formatAprsCoordinate(49 + 3.5 / 60, 'latitude'), '4903.50N');
  assert.equal(formatAprsCoordinate(-(72 + 1.75 / 60), 'longitude'), '07201.75W');
  assert.equal(formatAprsCoordinate(19.474, 'latitude'), '1928.44N');
  assert.equal(formatAprsCoordinate(-70.66367, 'longitude'), '07039.82W');

  const payload = buildPositionPayload({
    latitude: 19.474,
    longitude: -70.66367,
    symbolTable: '/',
    symbolCode: '-',
    comment: 'QTH Santiago',
  });
  assert.equal(payload, '=1928.44N/07039.82W-QTH Santiago');

  const decoded = parseAprsPosition(payload);
  assert.ok(decoded);
  assertClose(decoded.latitude, 19.474, 'latitude');
  assertClose(decoded.longitude, -70.66367, 'longitude');
  assert.equal(decoded.symbolCode, '-');
  assert.equal(decoded.comment, 'QTH Santiago');
});

test('beacon builder rejects the null-island placeholder', () => {
  assert.throws(() =>
    buildPositionPayload({
      latitude: 0,
      longitude: 0,
      symbolTable: '/',
      symbolCode: '-',
    }),
  );
});
