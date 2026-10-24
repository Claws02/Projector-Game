// Simulated tracker: animated stick-figure silhouettes, no camera needed.
// Used for desktop development (?source=sim) and automated tests.

import { createGrid, downsampleInto } from '../shadows.js';

export const SIM_FRAME = { width: 640, height: 480 };
const ASPECT = SIM_FRAME.width / SIM_FRAME.height;

// script: per-player [enterAt, leaveAt] in seconds.
export function createSimTracker({ players = 2, gridW = 64, shapeW = 160, script } = {}) {
  const rows = (w) => Math.round(w / ASPECT);
  const timeline = script ?? [[1, Infinity], [4, Infinity]].slice(0, players);
  const t0 = performance.now() / 1000;
  let lastT = 0;

  return {
    name: 'sim',
    frame: SIM_FRAME,
    get time() {
      return lastT;
    },

    detect(_video, now = performance.now() / 1000 - t0) {
      lastT = now;
      const detections = [];
      timeline.forEach(([enter, leave], k) => {
        if (now < enter || now >= leave) return;
        const pose = figurePose(k, now - enter);
        const shape = rasterize(pose, shapeW, rows(shapeW));
        detections.push({
          u: pose.u,
          v: 0.45,
          landmarks: pose.landmarks,
          mask: downsampleInto(createGrid(gridW, rows(gridW)), shape.data, shape.w, shape.h),
          shape,
        });
      });
      return { detections, fresh: true };
    },
  };
}

// Fake hand model: each player's right hand cycles through signs (a fist first,
// so it grabs and then throws as the arm swings); the left hand stays open.
const SIM_SIGNS = [['Closed_Fist', 1.2], ['Open_Palm', 1.2], ['Thumb_Up', 1.2], ['Victory', 1.2], ['Pointing_Up', 1.2]];
const SIM_CYCLE = SIM_SIGNS.reduce((s, [, d]) => s + d, 0);

export function simSign(t) {
  let at = ((t % SIM_CYCLE) + SIM_CYCLE) % SIM_CYCLE;
  for (const [sign, d] of SIM_SIGNS) {
    if (at < d) return sign;
    at -= d;
  }
  return 'None';
}

export function createSimHandTracker(sim) {
  return {
    name: 'sim-hands',
    detect(_video, detections) {
      const out = [];
      detections.forEach((d, k) => {
        for (const [side, wrist] of [['L', 15], ['R', 16]]) {
          const p = d.landmarks[wrist];
          const gesture = side === 'R' ? simSign(sim.time + k * 2) : 'Open_Palm';
          out.push({ u: p.x, v: p.y, gesture, score: 0.9, landmarks: [] });
        }
      });
      return out;
    },
  };
}

function figurePose(k, t) {
  const home = k === 0 ? 0.35 : 0.68;
  const u = home + 0.12 * Math.sin(t * 0.6 + k * 2);
  const swing = (side) => -Math.PI / 2 + side * (0.4 + 0.9 * Math.sin(t * 2.2 + k + side));
  const arm = (side) => {
    const sx = u + side * 0.06;
    const a = swing(side);
    const at = (len) => [sx + (Math.cos(a) * len) / ASPECT, 0.32 + Math.sin(a) * len];
    return { shoulder: [sx, 0.32], elbow: at(0.15), hand: at(0.3) };
  };
  const left = arm(-1);
  const right = arm(1);
  const capsules = [
    [[u, 0.28], [u, 0.6], 0.07],
    [[u - 0.03, 0.6], [u - 0.07, 0.97], 0.04],
    [[u + 0.03, 0.6], [u + 0.07, 0.97], 0.04],
    [left.shoulder, left.hand, 0.03],
    [right.shoulder, right.hand, 0.03],
  ];
  const head = [u, 0.19, 0.065];
  const pt = ([x, y]) => ({ x, y, visibility: 1 });
  const landmarks = [];
  landmarks[0] = pt(head);
  // Torso: shoulders 11/12, hips 23/24.
  [[11, left.shoulder], [12, right.shoulder], [23, [u - 0.03, 0.6]], [24, [u + 0.03, 0.6]]]
    .forEach(([i, p]) => { landmarks[i] = pt(p); });
  // Pose indices: 13/14 elbows, 15/16 wrists, 17-20 pinky/index (at the hand).
  [[13, left.elbow], [14, right.elbow], [15, left.hand], [16, right.hand],
    [17, left.hand], [18, right.hand], [19, left.hand], [20, right.hand]]
    .forEach(([i, p]) => { landmarks[i] = pt(p); });
  return { u, head, capsules, landmarks };
}

// Soft occupancy: 1 inside, 0 outside, with a one-cell linear ramp at the edge
// (like a real segmentation mask), so the sharp-shadow renderer can be tested.
function rasterize({ head, capsules }, w, h) {
  const grid = createGrid(w, h);
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      let depth = head[2] - Math.hypot((u - head[0]) * ASPECT, v - head[1]);
      for (const [a, b, r] of capsules) depth = Math.max(depth, r - segmentDist(u, v, a, b));
      grid.data[j * w + i] = Math.min(1, Math.max(0, 0.5 + depth * h));
    }
  }
  return grid;
}

// Distance from (u, v) to segment ab, measured with the frame's aspect ratio.
function segmentDist(u, v, [ax, ay], [bx, by]) {
  const px = (u - ax) * ASPECT;
  const py = v - ay;
  const dx = (bx - ax) * ASPECT;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
  return Math.hypot(px - t * dx, py - t * dy);
}
