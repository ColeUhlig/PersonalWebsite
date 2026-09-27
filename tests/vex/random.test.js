import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../content/vex/js/core/random.js';

test('same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test('values are in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test('normal() has mean ≈ 0 and standard deviation ≈ 1', () => {
  const rng = createRng(3);
  const n = 20000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i += 1) { const v = rng.normal(); sum += v; sumSq += v * v; }
  const mean = sum / n;
  const sd = Math.sqrt(sumSq / n - mean * mean);
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(sd - 1) < 0.03, `sd ${sd}`);
});
