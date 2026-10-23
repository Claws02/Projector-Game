import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyH, coverFit, homographyFromCorners, invertH, solveHomography } from '../src/mapping.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('solveHomography maps all four source points onto destinations', () => {
  const src = [[0.1, 0.2], [0.9, 0.15], [0.85, 0.95], [0.12, 0.8]];
  const dst = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const H = solveHomography(src, dst);
  src.forEach(([x, y], k) => {
    const [u, v] = applyH(H, x, y);
    close(u, dst[k][0]);
    close(v, dst[k][1]);
  });
});

test('invertH round-trips points', () => {
  const H = homographyFromCorners([[0.2, 0.1], [0.8, 0.12], [0.9, 0.9], [0.1, 0.85]]);
  const inv = invertH(H);
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.5], [0.75, 0.2]]) {
    const [u, v] = applyH(H, x, y);
    const [x2, y2] = applyH(inv, u, v);
    close(x2, x);
    close(y2, y);
  }
});

test('solveHomography rejects collinear points', () => {
  assert.throws(() => homographyFromCorners([[0, 0], [0.5, 0.5], [1, 1], [0.25, 0.25]]));
});

test('coverFit fills a portrait screen from a landscape camera, centered', () => {
  // 640x480 camera into a 400x800 portrait screen: scaled by height, cropped sides.
  const H = coverFit(640, 480, 400, 800, false);
  close(applyH(H, 0.5, 0.5)[0], 0.5);
  close(applyH(H, 0.5, 0)[1], 0);
  close(applyH(H, 0.5, 1)[1], 1);
  assert.ok(applyH(H, 0, 0.5)[0] < 0, 'left edge is cropped off-screen');
});

test('coverFit mirror flips horizontally only', () => {
  const plain = coverFit(640, 480, 640, 480, false);
  const mirror = coverFit(640, 480, 640, 480, true);
  const [s1, t1] = applyH(plain, 0.2, 0.3);
  const [s2, t2] = applyH(mirror, 0.2, 0.3);
  close(s2, 1 - s1);
  close(t2, t1);
});
