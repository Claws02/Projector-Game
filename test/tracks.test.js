import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerTracks } from '../src/tracks.js';
import { createGrid } from '../src/shadows.js';

// A detection at (u, v) with visible torso landmarks and a filled mask.
function det(u, v, { visibility = 0.9, fill = 1, w = 8 } = {}) {
  const landmarks = [];
  for (let i = 0; i < 33; i++) landmarks[i] = { x: u, y: v, visibility };
  const mask = createGrid(w, w);
  mask.data.fill(fill);
  return { u, v, landmarks, mask, shape: mask };
}

const feed = (tr, t, dets) => tr.ingest({ time: t, detections: dets });
const active = (slots) => slots.filter((s) => s.active);

test('a person is confirmed after 3 samples; a 2-frame ghost never becomes a player', () => {
  const tr = new PlayerTracks();
  feed(tr, 0, [det(0.3, 0.5), det(0.8, 0.5)]);
  feed(tr, 1 / 30, [det(0.3, 0.5), det(0.8, 0.5)]);
  assert.equal(active(tr.update(2 / 30, 1 / 60)).length, 0);
  feed(tr, 2 / 30, [det(0.3, 0.5)]); // ghost at 0.8 gone
  let slots = tr.update(2 / 30, 1 / 60);
  assert.equal(active(slots).length, 1);
  for (let k = 3; k < 30; k++) feed(tr, k / 30, [det(0.3, 0.5)]);
  slots = tr.update(1, 1 / 60);
  assert.equal(active(slots).length, 1, 'ghost was dropped, not promoted later');
});

test('invisible or tiny detections are ignored', () => {
  const tr = new PlayerTracks();
  for (let k = 0; k < 5; k++) feed(tr, k / 30, [det(0.3, 0.5, { visibility: 0.2 }), det(0.7, 0.5, { fill: 0.001 })]);
  assert.equal(active(tr.update(0.2, 1 / 60)).length, 0);
});

test('a missed frame coasts on the last shadow instead of blinking; long absence fades it', () => {
  const tr = new PlayerTracks();
  for (let k = 0; k < 5; k++) feed(tr, k / 30, [det(0.5, 0.5)]);
  const last = 4 / 30;
  feed(tr, last + 2 / 30, []); // two missed frames
  let [p1] = tr.update(last + 0.1, 1 / 60);
  assert.ok(p1.active);
  assert.equal(p1.det.alpha, 1);
  assert.ok(p1.det.mask, 'still collides');
  [p1] = tr.update(last + 0.5, 1 / 60);
  assert.ok(p1.det.alpha < 1 && p1.det.alpha > 0, 'fading');
  feed(tr, last + 1, []);
  [p1] = tr.update(last + 1, 1 / 60);
  assert.equal(p1.active, false);
});

test('players keep their P1/P2 slots when the model swaps their order', () => {
  const tr = new PlayerTracks();
  for (let k = 0; k < 10; k++) {
    const a = det(0.2 + k * 0.01, 0.5);
    const b = det(0.8 - k * 0.01, 0.5);
    feed(tr, k / 30, k % 2 ? [a, b] : [b, a]);
  }
  const slots = tr.update(10 / 30, 1 / 60);
  const p1 = slots.find((s) => s.id === 0);
  const p2 = slots.find((s) => s.id === 1);
  assert.ok(Math.abs(p1.u - p2.u) > 0.3);
  const firstLeft = p1.u < p2.u;
  for (let k = 10; k < 20; k++) feed(tr, k / 30, k % 2 ? [det(0.3, 0.5), det(0.7, 0.5)] : [det(0.7, 0.5), det(0.3, 0.5)]);
  const later = tr.update(20 / 30, 1 / 60);
  assert.equal(later[0].u < later[1].u, firstLeft);
});

test('one person reported twice counts once', () => {
  const tr = new PlayerTracks();
  for (let k = 0; k < 5; k++) feed(tr, k / 30, [det(0.5, 0.5), det(0.51, 0.5, { visibility: 0.7 })]);
  assert.equal(active(tr.update(5 / 30, 1 / 60)).length, 1);
});

test('masks blend toward each new sample at render rate', () => {
  const tr = new PlayerTracks();
  for (let k = 0; k < 4; k++) feed(tr, k / 30, [det(0.5, 0.5, { fill: 1 })]);
  tr.update(4 / 30, 1 / 60);
  feed(tr, 4 / 30, [det(0.5, 0.5, { fill: 0.2 })]);
  const [mid] = tr.update(4 / 30 + 1 / 60, 1 / 60);
  const v1 = mid.det.shape.data[0];
  assert.ok(v1 < 1 && v1 > 0.2, `partway: ${v1}`);
  let p;
  for (let k = 0; k < 20; k++) [p] = tr.update(5 / 30 + k / 60, 1 / 60);
  assert.ok(Math.abs(p.det.shape.data[0] - 0.2) < 0.01, 'converges');
});

test('landmarks are extrapolated to render time', () => {
  const tr = new PlayerTracks();
  for (let k = 0; k < 20; k++) feed(tr, k / 30, [det(0.2 + k / 30, 0.5)]); // 1 unit/s to the right
  const t = 19 / 30;
  const x0 = tr.update(t, 1 / 60)[0].det.landmarks[0].x;
  const x1 = tr.update(t + 0.03, 1 / 60)[0].det.landmarks[0].x;
  assert.ok(x1 > x0 + 0.02, `moved ${(x1 - x0).toFixed(3)} in 30 ms at 1 unit/s`);
});
