// Tests for the shared tracking-ID module (BRAND_GUIDE §7). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKING_ALPHABET,
  generateTrackingId,
  normalizeTrackingInput,
  isValidTrackingId,
  parsePieceLabel,
  parseTrackingInput,
  pieceLabel
} from '../src/shared/trackingId.ts';

test('alphabet is the 32 unambiguous characters', () => {
  assert.equal(TRACKING_ALPHABET, '23456789ABCDEFGHJKLMNPQRSTUVWXYZ');
  assert.equal(new Set(TRACKING_ALPHABET).size, 32);
  for (const c of '01OI') assert.ok(!TRACKING_ALPHABET.includes(c), `${c} must be excluded`);
});

test('generateTrackingId: KS + 6 safe characters, 8 in total', () => {
  const seen = new Set<string>();
  const used = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    const id = generateTrackingId();
    assert.equal(id.length, 8);
    assert.match(id, /^KS[2-9A-HJ-NP-Z]{6}$/);
    assert.ok(isValidTrackingId(id));
    seen.add(id);
    for (const c of id.slice(2)) used.add(c);
  }
  // 5000 draws from 1.07 billion: a handful of collisions at most, and every character turns up.
  assert.ok(seen.size > 4990, `too many duplicates: ${5000 - seen.size}`);
  assert.equal(used.size, 32);
});

test('normalizeTrackingInput: trim, uppercase, strip spaces and dashes', () => {
  assert.equal(normalizeTrackingInput('ks 7k2-m9p'), 'KS7K2M9P');
  assert.equal(normalizeTrackingInput('  KS7K2M9P \n'), 'KS7K2M9P');
  assert.equal(normalizeTrackingInput('k-s-7-k-2-m-9-p'), 'KS7K2M9P');
  const enDash = String.fromCharCode(0x2013); // pasted from a document
  assert.equal(normalizeTrackingInput(`KS${enDash}7K2M9P${enDash}01`), 'KS7K2M9P-01');
});

test('normalizeTrackingInput: keeps the -NN piece suffix on a full ID', () => {
  assert.equal(normalizeTrackingInput('ks7k2m9p-01'), 'KS7K2M9P-01');
  assert.equal(normalizeTrackingInput('ks 7k2-m9p - 12'), 'KS7K2M9P-12');
  assert.equal(normalizeTrackingInput('KS7K2M9P--03'), 'KS7K2M9P-03');
  // Not a full ID before the dash, so the dash is just stripped.
  assert.equal(normalizeTrackingInput('KS7K2M-99'), 'KS7K2M99');
});

test('isValidTrackingId: strict ^KS[2-9A-HJ-NP-Z]{6}$', () => {
  for (const ok of ['KS7K2M9P', 'KSQ4X8TA', 'KS222222', 'KSZZZZZZ']) assert.ok(isValidTrackingId(ok), ok);
  for (const bad of [
    '', 'KS7K2M9', 'KS7K2M9PX', 'ks7k2m9p', 'KS7K2M90', 'KS7K2M9O', 'KS7K2M91', 'KS7K2M9I',
    'AB7K2M9P', 'XY7K2M9P', 'KS 7K2M9P', 'KS7K2M9P-01', 'RTO-KS7K2M9P', 'ABC-2026-ABCDEFGH'
  ]) assert.ok(!isValidTrackingId(bad), bad);
});

test('parsePieceLabel: KSXXXXXX-NN resolves to parent and piece number', () => {
  assert.deepEqual(parsePieceLabel('KS7K2M9P-01'), { parentId: 'KS7K2M9P', piece: 1 });
  assert.deepEqual(parsePieceLabel('ks 7k2-m9p-12'), { parentId: 'KS7K2M9P', piece: 12 });
  assert.deepEqual(parsePieceLabel('KS7K2M9P02'), { parentId: 'KS7K2M9P', piece: 2 });
  assert.equal(parsePieceLabel('KS7K2M9P'), null);
  assert.equal(parsePieceLabel('KS7K2M9P-00'), null);
  assert.equal(parsePieceLabel('KS7K2M9P-1'), null);
  assert.equal(parsePieceLabel('KS7K2M9P-001'), null);
  assert.equal(parsePieceLabel('KS7K2M9P-PL01'), null);
  assert.equal(parsePieceLabel('KS7K2M90-01'), null);
});

test('parseTrackingInput: IDs and child labels resolve to the 8-character parent', () => {
  assert.deepEqual(parseTrackingInput('ks 7k2-m9p'), { trackingId: 'KS7K2M9P' });
  assert.deepEqual(parseTrackingInput('KS7K2M9P-03'), { trackingId: 'KS7K2M9P', piece: 3 });
  assert.equal(parseTrackingInput('ABC-2026-ABCD1234'), null);
  assert.equal(parseTrackingInput('hello'), null);
  assert.equal(parseTrackingInput(''), null);
});

test('pieceLabel round-trips through parsePieceLabel', () => {
  const id = generateTrackingId();
  for (const n of [1, 2, 10, 99]) {
    const label = pieceLabel(id, n);
    assert.equal(label, `${id}-${String(n).padStart(2, '0')}`);
    assert.deepEqual(parsePieceLabel(label), { parentId: id, piece: n });
  }
});

test('generateTrackingId uses the random source it is given (server passes crypto.randomInt)', async () => {
  const picks: number[] = [];
  const id = generateTrackingId((max) => { assert.equal(max, 32); picks.push(max); return picks.length - 1; });
  assert.equal(id, 'KS234567');
  assert.equal(picks.length, 6);
  const { randomInt } = await import('node:crypto');
  for (let i = 0; i < 1000; i++) assert.ok(isValidTrackingId(generateTrackingId((max) => randomInt(max))));
});
