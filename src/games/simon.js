// Gesture Says: copy the hand sign on the wall before time runs out. First to
// match scores 2, second 1. Watch out for "DON'T" prompts: hold still and win.
// Needs the hand-tracking model.

import { GESTURE_LABEL } from '../game/patterns.js';
import { versusHud, versusResult } from './common.js';

export const SIGNS = ['Closed_Fist', 'Open_Palm', 'Pointing_Up', 'Thumb_Up', 'Victory', 'ILoveYou'];
const HOLD = 0.25;      // s a sign must be held to count
const GAP = 0.8;        // s between prompts
const DONT_CHANCE = 0.2;

export default {
  id: 'simon',
  title: 'Gesture Says',
  icon: 'star',
  blurb: 'Copy the hand sign fast. "DON\'T" means keep still!',
  pattern: { kind: 'gesture', name: 'Thumb_Up', hold: 0.6 },
  duration: 60,
  needsHandModel: true,

  create() {
    return { prompt: null, gapLeft: 1, round: 0, time: 0, scores: [0, 0] };
  },

  step(s, { dt, hands, players, rng }) {
    const events = [];
    s.time += dt;
    if (!s.prompt) {
      s.gapLeft -= dt;
      if (s.gapLeft > 0) return events;
      let sign = SIGNS[Math.floor(rng() * SIGNS.length)];
      if (sign === s.lastSign) sign = SIGNS[(SIGNS.indexOf(sign) + 1) % SIGNS.length];
      s.lastSign = sign;
      const window = Math.max(1.5, 4 - s.round * 0.15);
      s.prompt = {
        sign, window, left: window,
        dont: s.round >= 3 && rng() < DONT_CHANCE,
        held: [0, 0], done: [false, false], matched: 0,
      };
      events.push({ type: 'prompt', sign });
      return events;
    }

    const pr = s.prompt;
    pr.left -= dt;
    for (const p of [0, 1]) {
      if (pr.done[p]) continue;
      const showing = hands.some((h) => h.player === p && h.gesture === pr.sign);
      pr.held[p] = showing ? pr.held[p] + dt : 0;
      if (pr.held[p] < HOLD) continue;
      pr.done[p] = true;
      if (pr.dont) {
        s.scores[p] = Math.max(0, s.scores[p] - 1);
        events.push({ type: 'wrong', player: p, points: -1 });
      } else {
        const points = pr.matched === 0 ? 2 : 1;
        pr.matched += 1;
        s.scores[p] += points;
        events.push({ type: 'correct', player: p, points });
      }
    }

    const everyoneDone = pr.done.filter(Boolean).length >= Math.max(1, players);
    if (pr.left <= 0 || (!pr.dont && everyoneDone)) {
      if (pr.dont) {
        for (const p of players >= 2 ? [0, 1] : [0]) {
          if (pr.done[p]) continue;
          s.scores[p] += 1;
          events.push({ type: 'correct', player: p, points: 1 });
        }
      } else if (pr.matched === 0) {
        events.push({ type: 'miss', x: 0, y: 0 });
      }
      s.prompt = null;
      s.gapLeft = GAP;
      s.round += 1;
    }
    return events;
  },

  draw(s, kit) {
    const pr = s.prompt;
    const cx = kit.aspect / 2;
    if (!pr) return;
    const [emoji, ...words] = GESTURE_LABEL[pr.sign].split(' ').reverse();
    kit.text(emoji, cx, 0.32, 0.16, null, 'center', 400);
    kit.text(words.reverse().join(' '), cx, 0.45, 0.06);
    if (pr.dont) kit.text("DON'T", cx, 0.2, 0.08, kit.COLORS.danger);
    // Time bar.
    const w = kit.aspect * 0.6 * Math.max(0, pr.left / pr.window);
    kit.line([[cx - w / 2, 0.52], [cx + w / 2, 0.52]], 0.012, pr.dont ? kit.COLORS.danger : null, 0.7);
    pr.done.forEach((d, p) => {
      if (d) kit.text(`P${p + 1} ✓`, p === 0 ? cx - 0.12 : cx + 0.12, 0.58, 0.04, kit.COLORS.players[p]);
    });
  },

  hud(s, players) {
    return versusHud(s.scores, players, `round ${s.round + 1}`);
  },

  result(s, players) {
    return versusResult(s.scores, players);
  },
};
