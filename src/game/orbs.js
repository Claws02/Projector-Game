// Shadow orbs: the floating objects players interact with.
//
// World units: x in [0, aspect], y in [0, 1] (height is always 1).
// occ(x, y) returns the id of the player whose shadow covers that point, or -1.
//
// Outside a round, orbs drift forever and bounce off shadows (the wall "reacts").
// During a round, touching a normal orb pops it for 1 point. Gold orbs are the
// co-op mechanic: with two players, both must touch it within coopWindow seconds.

export const ORB_DEFAULTS = Object.freeze({
  spawnEvery: 0.9,
  maxOrbs: 7,
  ambientMax: 5,
  radius: [0.045, 0.07],
  speed: [0.04, 0.12],
  life: [6, 9],
  goldChance: 0.15,
  goldPoints: 3,
  coopWindow: 1.2,
  comboWindow: 1.5,
  fadeIn: 0.4,
  bounceKick: 0.35,
  maxSpeed: 0.9,
  touchCooldown: 0.25,
});

const SAMPLES = 12;
const DIRS = Array.from({ length: SAMPLES }, (_, k) => {
  const a = (k / SAMPLES) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});

export function createOrbField(opts = {}, rng = Math.random) {
  return {
    cfg: { ...ORB_DEFAULTS, ...opts },
    rng,
    orbs: [],
    time: 0,
    spawnIn: 0,
    nextId: 1,
    scores: [0, 0],
    combo: [0, 0],
    lastPopAt: [-Infinity, -Infinity],
  };
}

// Call on round start: reset scores and give existing ambient orbs a lifetime.
export function beginRound(f) {
  f.scores = [0, 0];
  f.combo = [0, 0];
  f.lastPopAt = [-Infinity, -Infinity];
  for (const o of f.orbs) o.life = o.age + range(f.rng, f.cfg.life);
  f.spawnIn = 0;
}

export function stepOrbs(f, { dt, aspect, occ, players, scoring }) {
  const { cfg } = f;
  const events = [];
  f.time += dt;

  f.spawnIn -= dt;
  const cap = scoring ? cfg.maxOrbs : cfg.ambientMax;
  if (f.spawnIn <= 0 && f.orbs.length < cap) {
    const orb = spawnOrb(f, aspect, occ, scoring, players);
    if (orb) f.orbs.push(orb);
    f.spawnIn = cfg.spawnEvery * (scoring ? 1 : 2.5);
  }

  const keep = [];
  for (const o of f.orbs) {
    o.age += dt;
    o.cooldown = Math.max(0, o.cooldown - dt);
    integrate(o, dt, aspect, cfg);
    if (o.age >= o.life) {
      events.push({ type: 'expire', kind: o.kind, x: o.x, y: o.y, r: o.r });
      continue;
    }

    const hit = o.cooldown > 0 || o.age < cfg.fadeIn * 0.5 ? null : sampleHits(o, occ);
    if (!hit) {
      keep.push(o);
      continue;
    }

    if (!scoring) {
      bounce(o, hit, cfg);
      events.push({ type: 'nudge', x: o.x, y: o.y, player: hit.player });
      keep.push(o);
      continue;
    }

    const p = hit.player;
    if (o.kind === 'normal') {
      events.push(popEvent(f, o, p, 1));
      continue;
    }

    // Gold orb.
    o.touchedAt[p] = f.time;
    const other = 1 - p;
    const needsBoth = players >= 2;
    if (!needsBoth) {
      events.push(popEvent(f, o, p, cfg.goldPoints));
    } else if (f.time - o.touchedAt[other] <= cfg.coopWindow) {
      const ev = popEvent(f, o, p, cfg.goldPoints);
      f.scores[other] += cfg.goldPoints;
      ev.coop = true;
      events.push(ev);
    } else {
      bounce(o, hit, cfg);
      events.push({ type: 'goldTouch', x: o.x, y: o.y, player: p, id: o.id });
      keep.push(o);
    }
  }
  f.orbs = keep;
  return events;
}

function popEvent(f, o, p, points) {
  const { cfg } = f;
  f.combo[p] = f.time - f.lastPopAt[p] <= cfg.comboWindow ? f.combo[p] + 1 : 0;
  f.lastPopAt[p] = f.time;
  f.scores[p] += points;
  return { type: 'pop', kind: o.kind, x: o.x, y: o.y, r: o.r, player: p, points, combo: f.combo[p] };
}

function spawnOrb(f, aspect, occ, scoring, players) {
  const { cfg, rng } = f;
  const r = range(rng, cfg.radius);
  for (let attempt = 0; attempt < 6; attempt++) {
    const x = r + rng() * (aspect - 2 * r);
    const y = r + rng() * (0.75 - r); // upper three quarters: reachable by raised hands
    if (occ(x, y) !== -1) continue;
    const angle = rng() * Math.PI * 2;
    const speed = range(rng, cfg.speed);
    return {
      id: f.nextId++,
      kind: scoring && players > 0 && rng() < cfg.goldChance ? 'gold' : 'normal',
      x, y, r,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: scoring ? range(rng, cfg.life) : Infinity,
      phase: rng() * Math.PI * 2,
      cooldown: 0,
      touchedAt: [-Infinity, -Infinity],
    };
  }
  return null;
}

function integrate(o, dt, aspect, cfg) {
  // Gentle wobble so orbs feel alive instead of ballistic.
  o.vx += Math.cos(o.age * 1.3 + o.phase) * 0.02 * dt;
  o.vy += Math.sin(o.age * 1.1 + o.phase) * 0.02 * dt;

  // Bleed off kick energy back toward cruising speed.
  const speed = Math.hypot(o.vx, o.vy);
  const cruise = cfg.speed[1];
  if (speed > cruise) {
    const k = Math.max(cruise / speed, 1 - 1.5 * dt);
    o.vx *= k;
    o.vy *= k;
  }

  o.x += o.vx * dt;
  o.y += o.vy * dt;
  if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx); }
  if (o.x > aspect - o.r) { o.x = aspect - o.r; o.vx = -Math.abs(o.vx); }
  if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy); }
  if (o.y > 1 - o.r) { o.y = 1 - o.r; o.vy = -Math.abs(o.vy); }
}

// Returns null, or { player, nx, ny } where (nx, ny) points away from the shadow.
function sampleHits(o, occ) {
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

function bounce(o, { nx, ny }, cfg) {
  o.x += nx * o.r * 0.5;
  o.y += ny * o.r * 0.5;
  const vn = o.vx * nx + o.vy * ny;
  if (vn < 0) {
    o.vx -= 2 * vn * nx;
    o.vy -= 2 * vn * ny;
  }
  o.vx += nx * cfg.bounceKick;
  o.vy += ny * cfg.bounceKick;
  const speed = Math.hypot(o.vx, o.vy);
  if (speed > cfg.maxSpeed) {
    o.vx *= cfg.maxSpeed / speed;
    o.vy *= cfg.maxSpeed / speed;
  }
  o.cooldown = cfg.touchCooldown;
}

function range(rng, [lo, hi]) {
  return lo + rng() * (hi - lo);
}
