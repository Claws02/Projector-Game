// Player tracking between raw detections and the game.
//
// The pose model runs at camera rate (15-30 Hz) and is noisy: it misses frames,
// occasionally reports a ghost person, sometimes reports one person twice, and
// returns people in arbitrary order. PlayerTracks turns that into stable,
// smooth players at render rate (60 Hz):
//
//   ghosts      a new person must be seen in `confirmSamples` samples in a row
//               (and look like a person: visible torso, real mask area)
//   duplicates  two detections with nearly the same torso keep the better one
//   identity    detections match tracks by *predicted* position, so crossing
//               players don't swap; P1/P2 slots stay with their track
//   dropouts    a missed frame coasts on the last shadow instead of blinking;
//               the shadow only fades after `coast` seconds
//   jitter      every landmark goes through a One Euro filter
//   stepping    landmarks are extrapolated to render time and masks are blended
//               toward each new sample, so shadows and hands move every frame
//
// Everything here is in camera space (u, v in [0, 1]); main.js maps to world.

import { OneEuro2 } from './filters.js';

const TORSO = [11, 12, 23, 24];

export const TRACK_DEFAULTS = Object.freeze({
  max: 2,
  confirmSamples: 3,
  coast: 0.35,        // s a missed track keeps its full shadow
  fade: 0.3,          // s it then takes to fade out
  dropAfter: 0.8,     // s without a match before a confirmed track is dropped
  tentativeDrop: 0.25,
  matchDist: 0.3,     // max predicted-centroid distance to match (cam units)
  dedupeDist: 0.06,   // detections closer than this are the same person
  minVisibility: 0.5, // mean torso landmark visibility to count as a person
  minArea: 0.01,      // min fraction of the frame a person's mask must cover
  maskTau: 0.035,     // s time constant for blending masks between samples
  maxLead: 0.1,       // s max landmark extrapolation
  filter: { minCutoff: 1.0, beta: 12.0, dCutoff: 1.0 },
});

function meanVisibility(lms) {
  const pts = TORSO.map((i) => lms?.[i]).filter(Boolean);
  if (pts.length === 0) return 0;
  return pts.reduce((s, p) => s + (p.visibility ?? 1), 0) / pts.length;
}

function maskArea(grid) {
  if (!grid) return 1; // no mask (e.g. landmarks-only) can't be judged
  let sum = 0;
  for (let k = 0; k < grid.data.length; k++) sum += grid.data[k];
  return sum / grid.data.length;
}

function blendInto(display, target, a) {
  if (!target) return null;
  if (!display || display.w !== target.w || display.h !== target.h) {
    return { w: target.w, h: target.h, data: Float32Array.from(target.data) };
  }
  const d = display.data;
  const t = target.data;
  for (let k = 0; k < d.length; k++) d[k] += (t[k] - d[k]) * a;
  return display;
}

export class PlayerTracks {
  constructor(opts = {}) {
    this.o = { ...TRACK_DEFAULTS, ...opts, filter: { ...TRACK_DEFAULTS.filter, ...opts.filter } };
    this.tracks = [];
    this.nextKey = 1;
  }

  // Feeds one detection sample: { time, detections: [{ u, v, landmarks, mask, shape }] }.
  ingest({ time, detections }) {
    const o = this.o;
    const candidates = dedupe(
      detections.filter((d) => meanVisibility(d.landmarks) >= o.minVisibility && maskArea(d.mask) >= o.minArea),
      o.dedupeDist,
    );

    // Greedy matching on predicted position (confirmed tracks first, nearest first).
    const pairs = [];
    candidates.forEach((d, di) => {
      for (const tr of this.tracks) {
        const [pu, pv] = tr.center.predict(time, 0.3);
        const dist = Math.hypot(d.u - pu, d.v - pv);
        if (dist <= o.matchDist) pairs.push({ dist: dist - (tr.slot !== null ? 0.05 : 0), di, tr });
      }
    });
    pairs.sort((a, b) => a.dist - b.dist);
    const usedDet = new Set();
    const usedTrack = new Set();
    for (const { di, tr } of pairs) {
      if (usedDet.has(di) || usedTrack.has(tr)) continue;
      usedDet.add(di);
      usedTrack.add(tr);
      this.#observe(tr, candidates[di], time);
    }
    candidates.forEach((d, di) => {
      if (usedDet.has(di) || this.tracks.length >= o.max + 2) return;
      const tr = { key: this.nextKey++, slot: null, hits: 0, lastSeen: time, center: new OneEuro2(o.filter),
        lm: [], lmOut: [], maskTarget: null, shapeTarget: null, mask: null, shape: null };
      this.tracks.push(tr);
      this.#observe(tr, d, time);
    });

    // Drop stale tracks; free their slots.
    this.tracks = this.tracks.filter((tr) => time - tr.lastSeen <= (tr.slot === null ? o.tentativeDrop : o.dropAfter));
  }

  #observe(tr, d, time) {
    const o = this.o;
    tr.hits = time - tr.lastSeen > o.coast ? 1 : tr.hits + 1;
    tr.lastSeen = time;
    tr.center.filter(d.u, d.v, time);
    d.landmarks.forEach((p, i) => {
      if (!p) return;
      const f = (tr.lm[i] ??= new OneEuro2(o.filter));
      f.filter(p.x, p.y, time);
      f.visibility = p.visibility ?? 1;
    });
    tr.maskTarget = d.mask ?? tr.maskTarget;
    tr.shapeTarget = d.shape ?? tr.shapeTarget;
    if (tr.slot === null && tr.hits >= o.confirmSamples) {
      const taken = new Set(this.tracks.map((t) => t.slot));
      for (let s = 0; s < o.max; s++) {
        if (!taken.has(s)) {
          tr.slot = s;
          break;
        }
      }
    }
  }

  // Advances smoothing to render time `now`. Returns one entry per slot:
  // { id, active, u, v, det: { landmarks, mask, shape, alpha } | null }.
  update(now, dt) {
    const o = this.o;
    const a = 1 - Math.exp(-Math.max(0, dt) / o.maskTau);
    const slots = Array.from({ length: o.max }, (_, id) => ({ id, active: false, u: 0, v: 0, det: null }));
    for (const tr of this.tracks) {
      if (tr.slot === null) continue;
      const age = now - tr.lastSeen;
      const alpha = age <= o.coast ? 1 : Math.max(0, 1 - (age - o.coast) / o.fade);
      tr.mask = blendInto(tr.mask, tr.maskTarget, a);
      tr.shape = blendInto(tr.shape, tr.shapeTarget, a);
      tr.lm.forEach((f, i) => {
        if (!f) return;
        const [x, y] = f.predict(now, o.maxLead);
        const out = (tr.lmOut[i] ??= { x: 0, y: 0, visibility: 0 });
        out.x = x;
        out.y = y;
        out.visibility = f.visibility;
      });
      const [u, v] = tr.center.predict(now, o.maxLead);
      slots[tr.slot] = {
        id: tr.slot,
        active: alpha > 0,
        u, v,
        det: {
          landmarks: tr.lmOut,
          // Collisions only use a shadow that's actually showing.
          mask: alpha >= 0.5 ? tr.mask : null,
          shape: tr.shape,
          alpha,
        },
      };
    }
    return slots;
  }

  get activeCount() {
    return this.tracks.filter((t) => t.slot !== null).length;
  }
}

// Keeps the more visible of any two detections whose torsos nearly coincide
// (the pose model sometimes reports one person twice).
function dedupe(dets, dist) {
  const sorted = [...dets].sort((a, b) => meanVisibility(b.landmarks) - meanVisibility(a.landmarks));
  const kept = [];
  for (const d of sorted) {
    if (!kept.some((k) => Math.hypot(k.u - d.u, k.v - d.v) < dist)) kept.push(d);
  }
  return kept;
}
