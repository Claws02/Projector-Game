// Shadow Storm: rocks and stars fall faster and faster. Catch stars with your
// shadow (+1), dodge rocks (-2).

import { versusHud, versusResult } from './common.js';
import { sampleHits } from '../game/physics.js';

const STAR_CHANCE = 0.3;
const ROCK_POINTS = -2;

export default {
  id: 'storm',
  title: 'Shadow Storm',
  icon: 'rock',
  blurb: 'Catch the falling stars, dodge the rocks. It speeds up!',
  pattern: { kind: 'punch', speed: 1.1 },
  duration: 60,
  needsHandModel: false,

  create() {
    return { items: [], spawnIn: 0.5, time: 0, scores: [0, 0] };
  },

  step(s, { dt, aspect, occ, rng }) {
    const events = [];
    s.time += dt;
    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      s.spawnIn = Math.max(0.35, 1.1 - s.time * 0.012);
      const star = rng() < STAR_CHANCE;
      const r = star ? 0.04 : 0.04 + rng() * 0.025;
      s.items.push({
        kind: star ? 'star' : 'rock',
        x: r + rng() * (aspect - 2 * r),
        y: -r,
        vx: (rng() - 0.5) * 0.06,
        vy: 0.18 + s.time * 0.004 + rng() * 0.1,
        r,
        spin: (rng() - 0.5) * 3,
        seed: rng() * 1000,
      });
    }

    s.items = s.items.filter((it) => {
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (it.y - it.r > 1) return false;
      const hit = it.y > 0 ? sampleHits(it, occ) : null;
      if (!hit) return true;
      const p = hit.player;
      if (it.kind === 'star') {
        s.scores[p] += 1;
        events.push({ type: 'pop', kind: 'gold', x: it.x, y: it.y, r: it.r, player: p, points: 1, combo: 0 });
      } else {
        s.scores[p] = Math.max(0, s.scores[p] + ROCK_POINTS);
        events.push({ type: 'hit', x: it.x, y: it.y, r: it.r, player: p, points: ROCK_POINTS });
      }
      return false;
    });
    return events;
  },

  draw(s, kit) {
    for (const it of s.items) {
      const rot = s.time * it.spin;
      if (it.kind === 'star') {
        kit.star(it.x, it.y, it.r, rot, 0.85);
        kit.ring(it.x, it.y, it.r * 1.15, it.r * 0.12, kit.COLORS.gold, 0.9);
      } else {
        kit.rock(it.x, it.y, it.r, rot, it.seed, 0.92);
      }
    }
  },

  hud(s, players) {
    return versusHud(s.scores, players);
  },

  result(s, players) {
    return versusResult(s.scores, players, ' ★');
  },
};
