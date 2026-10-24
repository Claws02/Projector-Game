// Shared physics for round objects (orbs, balloons, balls, ammo) that collide
// with player shadows and can be grabbed and thrown.
//
// A body is { x, y, vx, vy, r, cooldown } plus, for grabbable bodies,
// { heldBy, holder, thrownBy, thrownUntil }. World units: height 1, width aspect.

const SAMPLES = 12;
export const DIRS = Array.from({ length: SAMPLES }, (_, k) => {
  const a = (k / SAMPLES) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});

export function range(rng, [lo, hi]) {
  return lo + rng() * (hi - lo);
}

export function clampSpeed(o, max) {
  const speed = Math.hypot(o.vx, o.vy);
  if (speed > max) {
    o.vx *= max / speed;
    o.vy *= max / speed;
  }
}

// Returns null, or { player, nx, ny } where (nx, ny) points away from the shadow.
export function sampleHits(o, occ) {
  const counts = [0, 0];
  let nx = 0;
  let ny = 0;
  const center = occ(o.x, o.y);
  if (center >= 0) counts[center] += 2;
  for (const [dx, dy] of DIRS) {
    const p = occ(o.x + dx * o.r, o.y + dy * o.r);
    if (p < 0) continue;
    counts[p] += 1;
    nx -= dx;
    ny -= dy;
  }
  if (counts[0] + counts[1] === 0) return null;
  const len = Math.hypot(nx, ny);
  return {
    player: counts[1] > counts[0] ? 1 : 0,
    nx: len > 0 ? nx / len : 0,
    ny: len > 0 ? ny / len : -1,
  };
}

// Reflect off the shadow and kick away from it.
export function bounce(o, { nx, ny }, { bounceKick = 0.35, maxSpeed = 0.9, touchCooldown = 0.25 } = {}) {
  o.x += nx * o.r * 0.5;
  o.y += ny * o.r * 0.5;
  const vn = o.vx * nx + o.vy * ny;
  if (vn < 0) {
    o.vx -= 2 * vn * nx;
    o.vy -= 2 * vn * ny;
  }
  o.vx += nx * bounceKick;
  o.vy += ny * bounceKick;
  clampSpeed(o, maxSpeed);
  o.cooldown = touchCooldown;
}

// Keeps a body inside the wall. floor: false lets it fall out of the bottom.
// Returns which edge it hit ('left' | 'right' | 'top' | 'bottom') or null.
export function wallBounce(o, aspect, { floor = true, restitution = 1 } = {}) {
  let edge = null;
  if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx) * restitution; edge = 'left'; }
  if (o.x > aspect - o.r) { o.x = aspect - o.r; o.vx = -Math.abs(o.vx) * restitution; edge = 'right'; }
  if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy) * restitution; edge = 'top'; }
  if (floor && o.y > 1 - o.r) { o.y = 1 - o.r; o.vy = -Math.abs(o.vy) * restitution; edge = 'bottom'; }
  return edge;
}

export const THROW_DEFAULTS = Object.freeze({
  grabReach: 0.05,   // how far outside a body's edge a fist can grab it
  throwGain: 1.2,
  maxThrow: 2.5,
  thrownFor: 1.5,    // s a thrown body flies undamped
});

// Fists grab the nearest grabbable body in reach; a held body is thrown when its
// hand opens (or disappears). Emits 'grab' and 'throw' events.
export function grabAndRelease(bodies, hands, time, events, canGrab = () => true, cfg = THROW_DEFAULTS) {
  const handByKey = new Map(hands.map((h) => [h.key, h]));
  const holding = new Set();
  for (const o of bodies) {
    if (!o.heldBy) continue;
    const h = handByKey.get(o.heldBy);
    if (h && h.grip) {
      holding.add(o.heldBy);
      continue;
    }
    const src = h ?? o;
    o.vx = src.vx * cfg.throwGain;
    o.vy = src.vy * cfg.throwGain;
    clampSpeed(o, cfg.maxThrow);
    o.heldBy = null;
    o.thrownBy = o.holder;
    o.thrownUntil = time + cfg.thrownFor;
    o.cooldown = 0.4; // don't let the thrower's own arm hit it on release
    events.push({ type: 'throw', player: o.holder, x: o.x, y: o.y, speed: Math.hypot(o.vx, o.vy) });
  }

  for (const h of hands) {
    if (!h.grip || holding.has(h.key)) continue;
    let target = null;
    let bestGap = cfg.grabReach;
    for (const o of bodies) {
      if (o.heldBy || !canGrab(o)) continue;
      const gap = Math.hypot(o.x - h.x, o.y - h.y) - o.r;
      if (gap <= bestGap) {
        target = o;
        bestGap = gap;
      }
    }
    if (!target) continue;
    target.heldBy = h.key;
    target.holder = h.player;
    holding.add(h.key);
    events.push({ type: 'grab', player: h.player, x: target.x, y: target.y });
  }
  return handByKey;
}

// Moves a held body with its hand. Returns false if the hand is gone.
export function followHand(o, h, dt) {
  if (!h) return false;
  const k = Math.min(1, dt * 20);
  o.x += (h.x - o.x) * k;
  o.y += (h.y - o.y) * k;
  o.vx = h.vx;
  o.vy = h.vy;
  return true;
}

export function newBodyFields() {
  return { cooldown: 0, heldBy: null, holder: -1, thrownBy: -1, thrownUntil: -Infinity };
}
