// Player shadows as low-res occupancy grids.
//
// A MaskGrid is { w, h, data: Float32Array(w*h) } in camera space (values 0..1).
// occupancyFn() turns the current set of player grids into occ(x, y) over world
// units, which is what the game logic collides against.

import { applyH } from './mapping.js';

export const MASK_THRESHOLD = 0.5;

export function createGrid(w, h) {
  return { w, h, data: new Float32Array(w * h) };
}

// Downsample a full-resolution float mask (srcW x srcH) into grid by point sampling.
export function downsampleInto(grid, src, srcW, srcH) {
  const { w, h, data } = grid;
  for (let j = 0; j < h; j++) {
    const sy = Math.min(srcH - 1, Math.floor(((j + 0.5) / h) * srcH)) * srcW;
    for (let i = 0; i < w; i++) {
      data[j * w + i] = src[sy + Math.min(srcW - 1, Math.floor(((i + 0.5) / w) * srcW))];
    }
  }
  return grid;
}

export function sampleGrid(grid, u, v) {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  return grid.data[Math.floor(v * grid.h) * grid.w + Math.floor(u * grid.w)];
}

// slots: [{ id, det: { mask } | null }], invH: world-normalized -> cam homography.
export function occupancyFn(slots, invH, aspect) {
  const live = slots.filter((s) => s.det && s.det.mask);
  if (live.length === 0) return () => -1;
  return (x, y) => {
    const [u, v] = applyH(invH, x / aspect, y);
    for (const s of live) {
      if (sampleGrid(s.det.mask, u, v) >= MASK_THRESHOLD) return s.id;
    }
    return -1;
  };
}
