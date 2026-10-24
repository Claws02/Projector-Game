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

// Box-filtered downsample: averages every source pixel in each cell, which keeps
// edge values fractional so the renderer can draw a smooth contour from them.
export function downsampleBoxInto(grid, src, srcW, srcH) {
  const { w, h, data } = grid;
  for (let j = 0; j < h; j++) {
    const y0 = Math.floor((j / h) * srcH);
    const y1 = Math.max(y0 + 1, Math.floor(((j + 1) / h) * srcH));
    for (let i = 0; i < w; i++) {
      const x0 = Math.floor((i / w) * srcW);
      const x1 = Math.max(x0 + 1, Math.floor(((i + 1) / w) * srcW));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * srcW;
        for (let x = x0; x < x1; x++) sum += src[row + x];
      }
      data[j * w + i] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return grid;
}

// Bilinear sample with cell centers at ((i + 0.5) / w, (j + 0.5) / h); 0 outside.
export function sampleBilinear(grid, u, v) {
  const { w, h, data } = grid;
  const x = u * w - 0.5;
  const y = v * h - 0.5;
  if (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5) return 0;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const top = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
  const bottom = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
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
