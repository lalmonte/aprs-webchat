import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyTelemetryMetadata,
  emptyTelemetryDefinitions,
  isTelemetryMetadata,
  parseTelemetryData,
  scaleTelemetryValue,
} from './telemetry.js';

test('classic T# packet with five analogs and digital bits', () => {
  const sample = parseTelemetryData('T#196,174,000,000,000,000,00000000');
  assert.ok(sample);
  assert.equal(sample.sequence, 196);
  assert.deepEqual(sample.analog, [174, 0, 0, 0, 0]);
  assert.deepEqual(sample.digital, [false, false, false, false, false, false, false, false]);
});

test('modern floating-point telemetry values', () => {
  const sample = parseTelemetryData('T#300,38.8,0.0,176.0,55.0,0.0,00000000');
  assert.ok(sample);
  assert.equal(sample.sequence, 300);
  assert.deepEqual(sample.analog, [38.8, 0, 176, 55, 0]);
});

test('fewer than five analog channels is accepted', () => {
  const sample = parseTelemetryData('T#12,100,50');
  assert.ok(sample);
  assert.equal(sample.sequence, 12);
  assert.deepEqual(sample.analog, [100, 50]);
  assert.equal(sample.digital, undefined);
});

test('EQNS scaling matches the WB2OSZ volt example', () => {
  const defs = emptyTelemetryDefinitions();
  const updated = applyTelemetryMetadata(defs, 'EQNS.0,0.075,0,0,0,0,0,0,0,0,0,0,0,0,0');
  assert.ok(updated);
  assert.equal(updated.equations[0]!.b, 0.075);
  assert.ok(Math.abs(scaleTelemetryValue(174, updated.equations[0]!) - 13.05) < 0.001);
});

test('PARM UNIT and BITS update definitions', () => {
  let defs = emptyTelemetryDefinitions();
  defs = applyTelemetryMetadata(defs, 'PARM.Battery,Temp,A3,A4,A5,B1,B2,B3,B4,B5,B6,B7,B8')!;
  defs = applyTelemetryMetadata(defs, 'UNIT.Volt,degC,,,,On,On,On,On,Hi,Hi,Hi,Hi')!;
  defs = applyTelemetryMetadata(defs, 'BITS.11110000,Solar farm')!;

  assert.equal(defs.names[0], 'Battery');
  assert.equal(defs.names[1], 'Temp');
  assert.equal(defs.units[0], 'Volt');
  assert.equal(defs.units[1], 'degC');
  assert.deepEqual(defs.bitSense.slice(0, 8), [
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
  ]);
  assert.equal(defs.projectTitle, 'Solar farm');
});

test('isTelemetryMetadata recognises the four prefixes', () => {
  assert.equal(isTelemetryMetadata('PARM.A1,A2'), true);
  assert.equal(isTelemetryMetadata('unit.Volt'), true);
  assert.equal(isTelemetryMetadata('hello'), false);
  assert.equal(isTelemetryMetadata('ack1'), false);
});

test('non-telemetry packets return null', () => {
  assert.equal(parseTelemetryData('!4903.50N/07201.75W-'), null);
  assert.equal(parseTelemetryData('T'), null);
  assert.equal(parseTelemetryData('T#abc,1'), null);
});
