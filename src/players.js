// Stable player identity across frames.
//
// The pose model returns people in arbitrary order each frame. PlayerSlots keeps
// slot 0 = P1 and slot 1 = P2 attached to the same person by matching each new
// detection to the nearest slot's last centroid (world coordinates).

export class PlayerSlots {
  constructor({ max = 2, matchDist = 0.45, dropAfter = 0.8 } = {}) {
    this.matchDist = matchDist;
    this.dropAfter = dropAfter;
    this.slots = Array.from({ length: max }, (_, id) => ({
      id, active: false, lastSeen: -Infinity, x: 0, y: 0, det: null,
    }));
  }

  // detections: [{ x, y, ...payload }] with x, y the body centroid in world units.
  // now: seconds. Returns the slots; slot.det is null when not seen this frame.
  update(detections, now) {
    for (const s of this.slots) {
      s.det = null;
      if (s.active && now - s.lastSeen > this.dropAfter) s.active = false;
    }

    // Greedy nearest-pair matching; N <= 2 so this is optimal enough.
    const pairs = [];
    detections.forEach((d, di) => {
      for (const s of this.slots) {
        if (!s.active) continue;
        const dist = Math.hypot(d.x - s.x, d.y - s.y);
        if (dist <= this.matchDist) pairs.push({ dist, di, s });
      }
    });
    pairs.sort((p, q) => p.dist - q.dist);
    const used = new Set();
    for (const { di, s } of pairs) {
      if (used.has(di) || s.det) continue;
      this.#assign(s, detections[di], now);
      used.add(di);
    }

    detections.forEach((d, di) => {
      if (used.has(di)) return;
      const free = this.slots.find((s) => !s.active);
      if (free) this.#assign(free, d, now);
    });
    return this.slots;
  }

  get activeCount() {
    return this.slots.filter((s) => s.active).length;
  }

  #assign(slot, det, now) {
    slot.active = true;
    slot.lastSeen = now;
    slot.x = det.x;
    slot.y = det.y;
    slot.det = det;
  }
}
