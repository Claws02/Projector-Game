import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandStates } from '../src/handstate.js';
import { handRois, mosaicToCam } from '../src/tracker/hands.js';
import { createGrid, downsampleBoxInto, sampleBilinear } from '../src/shadows.js';

const palm = (x, y) => ({ player: 0, side: 'R', x, y });
const obs = (x, y, gesture) => ({ x, y, gesture });

test('grip needs a sustained fist and survives a single misread frame', () => {
  const hs = new HandStates({ gripOn: 0.08, gripOff: 0.15 });
  const dt = 1 / 30;
  let t = 0;
  const step = (gesture) => hs.update([palm(0.5, 0.5)], gesture ? [obs(0.5, 0.5, gesture)] : [], (t += dt), dt)[0];
  assert.equal(step('Closed_Fist').grip, false, 'one frame is not enough');
  step('Closed_Fist');
  assert.equal(step('Closed_Fist').grip, true);
  assert.equal(step('Open_Palm').grip, true, 'one open frame does not release');
  step('Open_Palm');
  step('Open_Palm');
  step('Open_Palm');
  assert.equal(step('Open_Palm').grip, false);
});

test('gestures match the nearest palm and expire', () => {
  const hs = new HandStates({ gestureTtl: 0.3 });
  const palms = [palm(0.2, 0.5), { ...palm(0.8, 0.5), side: 'L' }];
  let hands = hs.update(palms, [obs(0.78, 0.52, 'Victory')], 0, 0.03);
  assert.equal(hands.find((h) => h.side === 'L').gesture, 'Victory');
  assert.equal(hands.find((h) => h.side === 'R').gesture, 'None');
  hands = hs.update(palms, [], 0.5, 0.03);
  assert.equal(hands.find((h) => h.side === 'L').gesture, 'None');
});

test('hand velocity tracks palm motion', () => {
  const hs = new HandStates();
  let h;
  for (let k = 0; k <= 10; k++) h = hs.update([palm(0.1 + k * 0.02, 0.5)], [], k / 30, 1 / 30)[0];
  assert.ok(Math.abs(h.vx - 0.6) < 0.05, `vx ${h.vx}`);
});

test('wrist crops go into mosaic quadrants and map back to the camera', () => {
  const lm = [];
  lm[13] = { x: 0.3, y: 0.5, visibility: 1 };
  lm[15] = { x: 0.3, y: 0.3, visibility: 1 };
  lm[19] = { x: 0.3, y: 0.26, visibility: 1 };
  lm[16] = { x: 0.7, y: 0.3, visibility: 0.1 }; // right wrist not visible: skipped
  const rois = handRois([{ landmarks: lm }], 640, 480);
  assert.equal(rois.length, 1);
  const [r] = rois;
  assert.ok(r.size >= 48);
  // The center of quadrant 0 must map to the crop center (the hand).
  const c = mosaicToCam({ x: 0.25, y: 0.25 }, rois, 640, 480);
  assert.ok(Math.abs(c.x * 640 - (r.x + r.size / 2)) < 1e-6);
  assert.ok(Math.abs(c.y * 480 - (r.y + r.size / 2)) < 1e-6);
  assert.equal(mosaicToCam({ x: 0.75, y: 0.25 }, rois, 640, 480), null, 'empty quadrant');
});

test('box downsample keeps fractional edges and bilinear sampling interpolates them', () => {
  const src = new Float32Array(8 * 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) src[y * 8 + x] = 1; // left 3 columns on
  const g = downsampleBoxInto(createGrid(4, 4), src, 8, 8);
  assert.deepEqual([...g.data.slice(0, 4)], [1, 0.5, 0, 0]);
  assert.equal(sampleBilinear(g, 0.25, 0.5), 0.75, 'halfway between cell centers 1 and 0.5');
  assert.equal(sampleBilinear(g, -0.5, 0.5), 0);
});
