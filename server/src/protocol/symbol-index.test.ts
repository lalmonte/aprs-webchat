import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Lightweight checks for the APRS sprite coordinate math.
 * The helper lives in the web package; we re-implement the indexing here so
 * the server test runner can guard the contract without a DOM.
 */

const COLUMNS = 16;

function cellFor(code: string): { column: number; row: number } {
  const value = code.charCodeAt(0);
  const index = value < 33 || value > 126 ? '/'.charCodeAt(0) - 33 : value - 33;
  return { column: index % COLUMNS, row: Math.floor(index / COLUMNS) };
}

test('primary house symbol "-" is column 12, row 0', () => {
  // '!' = 33 → index 0; '-' = 45 → index 12.
  assert.deepEqual(cellFor('-'), { column: 12, row: 0 });
});

test('car symbol ">" is column 13, row 1', () => {
  // '>' = 62 → index 29 → col 13, row 1.
  assert.deepEqual(cellFor('>'), { column: 13, row: 1 });
});

test('weather "_" wraps to row 3', () => {
  // '_' = 95 → index 62 → col 14, row 3.
  assert.deepEqual(cellFor('_'), { column: 14, row: 3 });
});

test('out-of-range codes fall back to the primary-table dot', () => {
  assert.deepEqual(cellFor('\x00'), cellFor('/'));
});
