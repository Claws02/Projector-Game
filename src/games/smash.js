// Target Smash: grab a ball with a fist and throw it at the targets (or bat
// balls with your shadow). Bullseye 3, ring 1.

import {
  bounce, followHand, grabAndRelease, newBodyFields, sampleHits, wallBounce,
} from '../game/physics.js';
import { drawBody, versusHud, versusResult } from './common.js';

const AMMO_R = 0.04;
const MAX_AMMO = 4;
const TARGET_R = 0.075;

export default {
  id: 'smash',
  title: 'Target Smash',
  icon: 'target',
  blurb: 'Grab a ball (fist), throw it at a target (open hand). Bullseye = 3.',
  pattern: { kind: 'grabThrow', speed: 0.7 },
  duration: 60,
  needsHandModel: false, // batting with your shadow works without hand tracking

  create() {
    return { ammo: [], targets: [], scores: [0, 0], time: 0, ammoIn: 0, targetIn: 0.3 };
  },

  step(s, { dt, aspect, occ, hands, rng }) {
    const events = [];
    s.time += dt;

    s.ammoIn -= dt;
    if (s.ammoIn <= 0 && s.ammo.filter((a) => !a.heldBy).length < MAX_AMMO) {
      s.ammoIn = 1.2;
      s.ammo.push({ x: AMMO_R + rng() * (aspect - 2 * AMMO_R), y: 0.55 + rng() * 0.3, vx: 0, vy: 0,
        r: AMMO_R, age: 0, ...newBodyFields() });
    }
    s.targetIn -= dt;
    if (s.targetIn <= 0 && s.targets.length < (s.time > 30 ? 3 : 2)) {
      s.targetIn = 1.5;
      s.targets.push({ x: TARGET_R + rng() * (aspect - 2 * TARGET_R), y: 0.1 + rng() * 0.4, r: TARGET_R, age: 0, life: 7 });
    }

    const handByKey = grabAndRelease(s.ammo, hands, s.time, events);
    s.ammo = s.ammo.filter((a) => {
      a.age += dt;
      a.cooldown = Math.max(0, a.cooldown - dt);
      if (a.heldBy) {
        followHand(a, handByKey.get(a.heldBy), dt);
        return true;
      }
      if (!(s.time < a.thrownUntil)) {
        const k = 1 - 1.2 * dt; // resting balls slow down and wait to be picked up
        a.vx *= k;
        a.vy *= k;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      wallBounce(a, aspect, { restitution: 0.8 });
      const hit = a.cooldown > 0 ? null : sampleHits(a, occ);
      if (hit) {
        bounce(a, hit, { bounceKick: 0.6, maxSpeed: 1.6, touchCooldown: 0.3 });
        a.thrownBy = hit.player; // batting counts as a throw
        a.thrownUntil = s.time + 1;
        events.push({ type: 'nudge', x: a.x, y: a.y, player: hit.player });
      }
      return a.age < 14;
    });

    s.targets = s.targets.filter((t) => {
      t.age += dt;
      for (const a of s.ammo) {
        if (a.heldBy || !(s.time < a.thrownUntil) || a.thrownBy < 0) continue;
        const d = Math.hypot(a.x - t.x, a.y - t.y);
        if (d >= t.r + a.r) continue;
        const points = d < t.r * 0.4 + a.r * 0.5 ? 3 : 1;
        s.scores[a.thrownBy] += points;
        events.push({ type: 'pop', kind: points === 3 ? 'gold' : 'normal', x: t.x, y: t.y, r: t.r,
          player: a.thrownBy, points, combo: points === 3 ? 4 : 0, label: points === 3 ? 'bullseye!' : '' });
        return false;
      }
      if (t.age >= t.life) {
        events.push({ type: 'expire', x: t.x, y: t.y, r: t.r });
        return false;
      }
      return true;
    });
    return events;
  },

  draw(s, kit) {
    for (const t of s.targets) {
      const alpha = Math.min(1, t.age / 0.3) * (t.life - t.age < 1.2 ? 0.4 + 0.6 * Math.abs(Math.sin(t.age * 9)) : 1);
      kit.ring(t.x, t.y, t.r * 0.9, t.r * 0.2, kit.COLORS.ink, alpha);
      kit.ring(t.x, t.y, t.r * 0.55, t.r * 0.15, kit.COLORS.ink, alpha);
      kit.disc(t.x, t.y, t.r * 0.28, alpha, kit.COLORS.gold);
    }
    for (const a of s.ammo) drawBody(a, kit, Math.min(1, a.age / 0.3) * (a.age > 12 ? 0.5 : 1));
  },

  hud(s, players) {
    return versusHud(s.scores, players);
  },

  result(s, players) {
    return versusResult(s.scores, players);
  },
};
