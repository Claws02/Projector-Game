// Orb Pop: the original game. Touch orbs to pop them; gold orbs need both
// players; fists grab and throw orbs to smash others.

import { beginRound, createOrbField, stepOrbs } from '../game/orbs.js';
import { drawBody, versusHud, versusResult } from './common.js';

export default {
  id: 'orbs',
  title: 'Orb Pop',
  icon: 'orb',
  blurb: 'Pop orbs with your shadow. Gold needs both players. Fist to grab, open to throw.',
  pattern: { kind: 'dwell', hold: 1 },
  duration: 60,
  needsHandModel: false,

  create({ rng }) {
    const field = createOrbField({}, rng);
    beginRound(field);
    return { field };
  },

  step(s, input) {
    return stepOrbs(s.field, { ...input, scoring: true });
  },

  draw(s, kit) {
    for (const o of s.field.orbs) {
      let alpha = Math.min(1, o.age / 0.4);
      const remaining = o.life - o.age;
      if (remaining < 1.2) alpha *= 0.35 + 0.65 * Math.abs(Math.sin(remaining * 9)); // blink before expiring
      drawBody(o, kit, alpha);
      if (o.kind !== 'gold') continue;
      kit.ring(o.x, o.y, o.r * 0.8, o.r * 0.18, kit.COLORS.gold, alpha);
      // Show which player already touched it, so the other knows to go.
      o.touchedAt.forEach((at, p) => {
        if (s.field.time - at > 1.2) return;
        const a0 = p === 0 ? Math.PI / 2 : -Math.PI / 2;
        kit.ring(o.x, o.y, o.r * 1.05, o.r * 0.18, kit.COLORS.players[p], alpha, a0, a0 + Math.PI);
      });
    }
  },

  hud(s, players) {
    return versusHud(s.field.scores, players);
  },

  result(s, players) {
    return versusResult(s.field.scores, players);
  },
};
