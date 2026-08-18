import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fahrenheitToCelsius,
  inchesToMm,
  mphToKmh,
  parseAprsWeather,
  parseWeatherFromPositionComment,
} from './weather.js';

test('position weather from the WB2OSZ example', () => {
  const info =
    '@091842z4256.20N/07049.42W_310/004g015t081r000p033P002h54b10001';
  const weather = parseAprsWeather(info);
  assert.ok(weather);
  assert.equal(weather.format, 'position');
  assert.equal(weather.windDirection, 310);
  assert.equal(weather.windSpeedMph, 4);
  assert.equal(weather.windGustMph, 15);
  assert.equal(weather.temperatureF, 81);
  assert.equal(weather.rainHourIn, 0);
  assert.ok(Math.abs(weather.rain24hIn! - 0.33) < 0.001);
  assert.ok(Math.abs(weather.rainMidnightIn! - 0.02) < 0.001);
  assert.equal(weather.humidity, 54);
  assert.equal(weather.pressureMb, 1000.1);
});

test('weather fields survive after the wind slot is already consumed', () => {
  const weather = parseWeatherFromPositionComment('g015t081r000p033P002h54b10001');
  assert.ok(weather);
  assert.equal(weather.temperatureF, 81);
  assert.equal(weather.windGustMph, 15);
  assert.equal(weather.humidity, 54);
});

test('positionless weather with c/s wind form', () => {
  const weather = parseAprsWeather('_123456c000s000g000t069r000p000P000h00b10130');
  assert.ok(weather);
  assert.equal(weather.format, 'positionless');
  assert.equal(weather.windDirection, 0);
  assert.equal(weather.windSpeedMph, 0);
  assert.equal(weather.temperatureF, 69);
  assert.equal(weather.humidity, 100); // h00 means 100 %
  assert.equal(weather.pressureMb, 1013);
});

test('missing fields encoded with dots are skipped', () => {
  const weather = parseWeatherFromPositionComment('.../...g...t072r...p...P...h..b.....');
  assert.ok(weather);
  assert.equal(weather.temperatureF, 72);
  assert.equal(weather.windDirection, undefined);
  assert.equal(weather.windGustMph, undefined);
});

test('negative temperature is accepted', () => {
  const weather = parseWeatherFromPositionComment('000/000g000t-05r000');
  assert.ok(weather);
  assert.equal(weather.temperatureF, -5);
});

test('unit helpers convert to metric', () => {
  assert.ok(Math.abs(fahrenheitToCelsius(32) - 0) < 0.001);
  assert.ok(Math.abs(mphToKmh(10) - 16.09344) < 0.001);
  assert.ok(Math.abs(inchesToMm(1) - 25.4) < 0.001);
});

test('non-weather packets return null', () => {
  assert.equal(parseAprsWeather('!4903.50N/07201.75W-House'), null);
  assert.equal(parseAprsWeather(':N0CALL   :hello{1'), null);
  assert.equal(parseAprsWeather('T#001,100,200,300,400,500,00000000'), null);
});
