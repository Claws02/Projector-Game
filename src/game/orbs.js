// Shadow orbs: the floating objects players interact with.
//
// World units: x in [0, aspect], y in [0, 1] (height is always 1).
// occ(x, y) returns the id of the player whose shadow covers that point, or -1.
//
// Outside a round, orbs drift forever and bounce off shadows (the wall "reacts").
// During a round, touching a normal orb pops it for 1 point. Gold orbs are the
// co-op mechanic: with two players, both must touch it within coopWindow seconds.
//
// With hand tracking, a closed fist near an orb grabs it; opening the hand throws
// it with the hand's velocity. A thrown orb smashes other orbs it hits (2 points),
// and counts as the thrower's touch on a gold orb.

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
  grabReach: 0.05,     // how far outside an orb's edge a fist can grab it
  throwGain: 1.2,
  maxThrow: 2.5,
  thrownFor: 1.5,      // s a thrown orb flies undamped and can smash others
  smashPoints: 2,
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

export function stepOrbs(f, { dt, aspect, occ, players, scoring, hands = [] }) {
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

  const handByKey = new Map(hands.map((h) => [h.key, h]));
  grabAndRelease(f, hands, handByKey, events);

  const keep = [];
  for (const o of f.orbs) {
    o.age += dt;
    o.cooldown = Math.max(0, o.cooldown - dt);

    if (o.heldBy) {
      const h = handByKey.get(o.heldBy);
      const k = Math.min(1, dt * 20);
      o.x += (h.x - o.x) * k;
      o.y += (h.y - o.y) * k;
      o.vx = h.vx;
      o.vy = h.vy;
      o.life = Math.max(o.life, o.age + 2); // never expires in hand
      keep.push(o);
      continue;
    }

    integrate(o, dt, aspect, cfg, f.time < o.thrownUntil);
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
    } else if (o.kind === 'normal') {
      events.push(popEvent(f, o, hit.player, 1));
    } else if (!touchGold(f, o, hit.player, players, events)) {
      bounce(o, hit, cfg);
      keep.push(o);
    }
  }
  f.orbs = keep;
  smash(f, players, scoring, events);
  return events;
}

// Fists grab the nearest orb in reach; a held orb is thrown when its hand opens
// (or disappears).
function grabAndRelease(f, hands, handByKey, events) {
  const { cfg } = f;
  const holding = new Set();
  for (const o of f.orbs) {
    if (!o.heldBy) continue;
    const h = handByKey.get(o.heldBy);
    if (h && h.grip) {
      holding.add(o.heldBy);
      continue;
    }
    const vx = (h ?? o).vx * cfg.throwGain;
    const vy = (h ?? o).vy * cfg.throwGain;
    const speed = Math.hypot(vx, vy);
    const k = speed > cfg.maxThrow ? cfg.maxThrow / speed : 1;
    o.vx = vx * k;
    o.vy = vy * k;
    o.heldBy = null;
    o.thrownBy = o.holder;
    o.thrownUntil = f.time + cfg.thrownFor;
    o.cooldown = 0.4; // don't let the thrower's own arm pop it on release
    events.push({ type: 'throw', player: o.holder, x: o.x, y: o.y, speed: speed * k });
  }

  for (const h of hands) {
    if (!h.grip || holding.has(h.key)) continue;
    let target = null;
    let bestGap = cfg.grabReach;
    for (const o of f.orbs) {
      if (o.heldBy || o.kind !== 'normal' || o.age < cfg.fadeIn) continue;
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
}

// Thrown orbs pop (or, outside a round, knock) the orbs they hit.
function smash(f, players, scoring, events) {
  const { cfg } = f;
  const gone = new Set();
  for (const a of f.orbs) {
    if (a.heldBy || !(f.time < a.thrownUntil) || gone.has(a)) continue;
    for (const b of f.orbs) {
      if (b === a || b.heldBy || gone.has(b) || b.age < cfg.fadeIn * 0.5) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= a.r + b.r) continue;
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : -1;
      if (scoring && b.kind === 'normal') {
        const ev = popEvent(f, b, a.thrownBy, cfg.smashPoints);
        ev.smash = true;
        events.push(ev);
        gone.add(b);
      } else if (scoring && touchGold(f, b, a.thrownBy, players, events)) {
        gone.add(b);
      } else {
        b.vx += a.vx * 0.6;
        b.vy += a.vy * 0.6;
        b.x = a.x + nx * (a.r + b.r);
        b.y = a.y + ny * (a.r + b.r);
        if (!scoring) events.push({ type: 'nudge', x: b.x, y: b.y, player: a.thrownBy });
      }
    }
  }
  if (gone.size) f.orbs = f.orbs.filter((o) => !gone.has(o));
}

// Registers player p touching gold orb o. Returns true if it popped.
function touchGold(f, o, p, players, events) {
  const { cfg } = f;
  o.touchedAt[p] = f.time;
  const other = 1 - p;
  if (players < 2) {
    events.push(popEvent(f, o, p, cfg.goldPoints));
    return true;
  }
  if (f.time - o.touchedAt[other] <= cfg.coopWindow) {
    const ev = popEvent(f, o, p, cfg.goldPoints);
    f.scores[other] += cfg.goldPoints;
    ev.coop = true;
    events.push(ev);
    return true;
  }
  events.push({ type: 'goldTouch', x: o.x, y: o.y, player: p, id: o.id });
  return false;
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
      heldBy: null,
      holder: -1,
      thrownBy: -1,
      thrownUntil: -Infinity,
    };
  }
  return null;
}

// free: a thrown orb in flight keeps its speed instead of settling to a drift.
function integrate(o, dt, aspect, cfg, free) {
  // Gentle wobble so orbs feel alive instead of ballistic.
  o.vx += Math.cos(o.age * 1.3 + o.phase) * 0.02 * dt;
  o.vy += Math.sin(o.age * 1.1 + o.phase) * 0.02 * dt;

  // Bleed off kick energy back toward cruising speed.
  const speed = Math.hypot(o.vx, o.vy);
  const cruise = cfg.speed[1];
  if (!free && speed > cruise) {
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
