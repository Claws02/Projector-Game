// Keep It Up (co-op): balloons fall slowly; bounce them back up with your
// shadow. More balloons join at 20 s and 40 s. The team scores every bounce.

import { bounce, sampleHits, wallBounce } from '../game/physics.js';
import { near } from './common.js';

const GRAVITY = 0.32;
const R = 0.06;
const ADD_AT = [20, 40];

function balloon(x, y, phase = 0) {
  return { x, y, vx: 0, vy: 0, r: R, cooldown: 0, phase };
}

export default {
  id: 'keepup',
  title: 'Keep It Up',
  icon: 'balloon',
  blurb: "Don't let the balloons touch the floor. Every bounce counts for the team.",
  pattern: { kind: 'bounceUp', count: 2, speed: 0.5, window: 4 },
  duration: 60,
  needsHandModel: false,

  create({ aspect }) {
    return {
      balloons: [balloon(aspect / 2, 0.15)],
      respawns: [],
      added: 0,
      time: 0,
      hits: [0, 0],
      streak: 0,
      bestStreak: 0,
      drops: 0,
    };
  },

  step(s, { dt, aspect, occ, hands, rng }) {
    const events = [];
    s.time += dt;
    if (s.added < ADD_AT.length && s.time >= ADD_AT[s.added]) {
      s.added += 1;
      s.balloons.push(balloon(R + rng() * (aspect - 2 * R), -R, rng() * 6));
    }
    s.respawns = s.respawns.filter((at) => {
      if (s.time < at) return true;
      s.balloons.push(balloon(R + rng() * (aspect - 2 * R), -R, rng() * 6));
      return false;
    });

    s.balloons = s.balloons.filter((b) => {
      b.vy += GRAVITY * dt;
      const drag = 1 - 0.4 * dt;
      b.vx *= drag;
      b.vy *= drag;
      b.vx += Math.sin(s.time * 1.7 + b.phase) * 0.03 * dt; // air drift
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      wallBounce(b, aspect, { floor: false, restitution: 0.8 });
      if (b.y < b.r) b.y = b.r; // top is a soft ceiling

      b.cooldown = Math.max(0, b.cooldown - dt);
      const hit = b.cooldown > 0 ? null : sampleHits(b, occ);
      if (hit) {
        bounce(b, hit, { bounceKick: 0.5, maxSpeed: 1.4, touchCooldown: 0.25 });
        if (hit.ny < 0.5) b.vy = Math.min(b.vy, -0.6); // hits from below or the side lift it
        const h = hands.find((hh) => hh.player === hit.player && near(hh, b, b.r + 0.1));
        if (h) {
          b.vx += h.vx * 0.4;
          b.vy += Math.min(0, h.vy) * 0.4;
        }
        s.hits[hit.player] += 1;
        s.streak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        events.push({ type: 'bounce', x: b.x, y: b.y, player: hit.player, count: s.streak });
      }

      if (b.y - b.r > 1) {
        s.drops += 1;
        s.streak = 0;
        s.respawns.push(s.time + 1.5);
        events.push({ type: 'miss', x: b.x, y: 1 });
        return false;
      }
      return true;
    });
    return events;
  },

  draw(s, kit) {
    for (const b of s.balloons) {
      kit.line([[b.x, b.y + b.r], [b.x + Math.sin(s.time * 3 + b.phase) * 0.01, b.y + b.r + 0.08]], 0.004);
      kit.poly([[b.x - 0.012, b.y + b.r + 0.012], [b.x + 0.012, b.y + b.r + 0.012], [b.x, b.y + b.r - 0.004]], 0.9);
      kit.disc(b.x, b.y, b.r, 0.9);
    }
  },

  hud(s, players) {
    return { scores: s.hits, showP2: players >= 2, center: `streak ${s.streak}` };
  },

  result(s, players) {
    const team = s.hits[0] + s.hits[1];
    const lines = [`best streak ${s.bestStreak}`, `${s.drops} drop${s.drops === 1 ? '' : 's'}`];
    if (players >= 2) lines.unshift(`P1 ${s.hits[0]}  ·  P2 ${s.hits[1]}`);
    return { headline: `${team} bounces`, headlineColor: null, lines, value: team };
  },
};
