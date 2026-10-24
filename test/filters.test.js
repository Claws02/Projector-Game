import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuro } from '../src/filters.js';

function noise(seed = 1) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return () => {
    let u = 0;
    while (!u) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
}

test('cuts jitter at rest by at least 2.5x', () => {
  const g = noise();
  const f = new OneEuro();
  let sq = 0;
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const y = f.filter(0.5 + 0.004 * g(), i / 30);
    if (i > 30) {
      sq += (y - 0.5) ** 2;
      n++;
    }
  }
  assert.ok(Math.sqrt(sq / n) < 0.004 / 2.5);
});

test('follows fast motion with little lag', () => {
  const g = noise(2);
  const f = new OneEuro();
  let lag = 0;
  let n = 0;
  for (let i = 0; i < 90; i++) {
    const t = i / 30;
    const y = f.filter(2 * t + 0.004 * g(), t);
    if (i > 30) {
      lag += (2 * t - y) / 2;
      n++;
    }
  }
  assert.ok(lag / n < 0.02, `lag ${(lag / n * 1000).toFixed(0)} ms`);
});

test('predict extrapolates with the smoothed velocity, capped', () => {
  const f = new OneEuro();
  for (let i = 0; i < 60; i++) f.filter(i / 30, i / 30); // 1 unit/s
  const at = 59 / 30;
  assert.ok(Math.abs(f.predict(at + 0.05) - (f.x + 0.05 * f.dx)) < 1e-9);
  assert.ok(Math.abs(f.dx - 1) < 0.1);
  assert.equal(f.predict(at + 5, 0.1), f.x + 0.1 * f.dx, 'lead is capped');
});
