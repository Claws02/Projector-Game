// Per-hand game state: where each player's hands are, how fast they move, and
// whether they are gripping.
//
// Position comes from pose landmarks every frame (smooth, always available).
// Gesture comes from the hand model, which may run less often and miss frames,
// so it is matched to the nearest palm and held for a short time-to-live.
// Grip uses hysteresis so a single misclassified frame doesn't drop an orb.

const ARM = {
  L: [15, 17, 19], // wrist, pinky, index
  R: [16, 18, 20],
};

// Palm points (camera space) for each player's hands, from pose landmarks.
export function palmsFromPose(slots) {
  const palms = [];
  for (const slot of slots) {
    const lm = slot.det?.landmarks;
    if (!lm) continue;
    for (const [side, idx] of Object.entries(ARM)) {
      const pts = idx.map((i) => lm[i]).filter((p) => p && (p.visibility ?? 1) >= 0.3);
      if (pts.length === 0) continue;
      palms.push({
        player: slot.id,
        side,
        u: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        v: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      });
    }
  }
  return palms;
}

export class HandStates {
  constructor({ gripOn = 0.08, gripOff = 0.15, matchDist = 0.15, gestureTtl = 0.35 } = {}) {
    Object.assign(this, { gripOn, gripOff, matchDist, gestureTtl });
    this.states = new Map();
  }

  // palms: [{ player, side, x, y }] world units. observations: [{ x, y, gesture, score }].
  // Returns the hands present this frame.
  update(palms, observations, now, dt) {
    const seen = new Set();
    for (const p of palms) {
      const key = `${p.player}${p.side}`;
      seen.add(key);
      let s = this.states.get(key);
      if (!s) {
        s = { key, player: p.player, side: p.side, x: p.x, y: p.y, vx: 0, vy: 0,
          gesture: 'None', gestureAt: -Infinity, grip: false, fistFor: 0, openFor: 0 };
        this.states.set(key, s);
      } else if (dt > 0) {
        const k = 0.5;
        s.vx += ((p.x - s.x) / dt - s.vx) * k;
        s.vy += ((p.y - s.y) / dt - s.vy) * k;
      }
      s.x = p.x;
      s.y = p.y;
      s.present = true;
    }

    // Each observation goes to the nearest palm.
    for (const o of observations) {
      let best = null;
      let bestDist = this.matchDist;
      for (const key of seen) {
        const s = this.states.get(key);
        const d = Math.hypot(o.x - s.x, o.y - s.y);
        if (d < bestDist) {
          best = s;
          bestDist = d;
        }
      }
      if (best) {
        best.gesture = o.gesture;
        best.gestureAt = now;
      }
    }

    const out = [];
    for (const [key, s] of this.states) {
      if (!seen.has(key)) {
        this.states.delete(key);
        continue;
      }
      if (now - s.gestureAt > this.gestureTtl) s.gesture = 'None';
      if (s.gesture === 'Closed_Fist') {
        s.fistFor += dt;
        s.openFor = 0;
      } else {
        s.openFor += dt;
        s.fistFor = 0;
      }
      if (!s.grip && s.fistFor >= this.gripOn) s.grip = true;
      else if (s.grip && s.openFor >= this.gripOff) s.grip = false;
      out.push(s);
    }
    return out;
  }
}
