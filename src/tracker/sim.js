// Simulated tracker: animated stick-figure silhouettes, no camera needed.
// Used for desktop development (?source=sim) and automated tests.

import { createGrid } from '../shadows.js';

export const SIM_FRAME = { width: 640, height: 480 };
const ASPECT = SIM_FRAME.width / SIM_FRAME.height;

// script: per-player [enterAt, leaveAt] in seconds.
export function createSimTracker({ players = 2, gridW = 64, script } = {}) {
  const gridH = Math.round(gridW / ASPECT);
  const timeline = script ?? [[1, Infinity], [4, Infinity]].slice(0, players);
  const t0 = performance.now() / 1000;

  return {
    name: 'sim',
    frame: SIM_FRAME,

    detect(_video, now = performance.now() / 1000 - t0) {
      const out = [];
      timeline.forEach(([enter, leave], k) => {
        if (now < enter || now >= leave) return;
        const pose = figurePose(k, now - enter);
        out.push({ u: pose.u, v: 0.45, landmarks: pose.landmarks, mask: rasterize(pose, gridW, gridH) });
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
    return [[sx, 0.32], [sx + Math.cos(a) * 0.3 / ASPECT, 0.32 + Math.sin(a) * 0.3]];
  };
  const capsules = [
    [[u, 0.28], [u, 0.6], 0.07],
    [[u - 0.03, 0.6], [u - 0.07, 0.97], 0.04],
    [[u + 0.03, 0.6], [u + 0.07, 0.97], 0.04],
    [...arm(-1), 0.03],
    [...arm(1), 0.03],
  ];
  const head = [u, 0.19, 0.065];
  const [, leftHand] = arm(-1);
  const [, rightHand] = arm(1);
  const landmarks = [];
  landmarks[0] = { x: head[0], y: head[1], visibility: 1 };
  landmarks[15] = { x: leftHand[0], y: leftHand[1], visibility: 1 };
  landmarks[16] = { x: rightHand[0], y: rightHand[1], visibility: 1 };
  return { u, head, capsules, landmarks };
}

function rasterize({ head, capsules }, w, h) {
  const grid = createGrid(w, h);
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      let inside = Math.hypot((u - head[0]) * ASPECT, v - head[1]) <= head[2];
      for (let c = 0; !inside && c < capsules.length; c++) {
        const [a, b, r] = capsules[c];
        inside = segmentDist(u, v, a, b) <= r;
      }
      grid.data[j * w + i] = inside ? 1 : 0;
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
