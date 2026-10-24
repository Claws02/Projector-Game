// Shadow Volley: shadow pong. With two players, each defends the edge on their
// side of the wall; a ball past your edge scores for the other player. Solo,
// the far edge is a wall and every return scores.

import { bounce, clampSpeed, sampleHits } from '../game/physics.js';
import { versusHud, versusResult } from './common.js';

const R = 0.045;
const SERVE_SPEED = 0.45;
const MAX_SPEED = 1.6;

function serve(s, aspect, rng) {
  Object.assign(s.ball, { x: aspect / 2, y: 0.4, vx: 0, vy: 0, cooldown: 0 });
  s.serveIn = 1;
  s.serveDir = rng() < 0.5 ? -1 : 1;
  s.rally = 0;
}

// Which edge each player defends, from where their body is right now.
function sidesOf(bodies, aspect) {
  const side = [null, null];
  for (const b of bodies) side[b.player] = b.x < aspect / 2 ? 'left' : 'right';
  return side;
}

export default {
  id: 'volley',
  title: 'Shadow Volley',
  icon: 'net',
  blurb: 'Shadow pong! Defend the edge on your side. Solo: keep returning it.',
  pattern: { kind: 'twoTouch', window: 0.8 },
  duration: 60,
  needsHandModel: false,

  create({ aspect, rng }) {
    const s = { ball: { r: R }, scores: [0, 0], rally: 0, bestRally: 0, serveIn: 1, serveDir: 1, lastHitter: -1 };
    serve(s, aspect, rng);
    return s;
  },

  step(s, { dt, aspect, occ, bodies, players, rng }) {
    const events = [];
    const b = s.ball;
    const side = sidesOf(bodies, aspect);

    if (s.serveIn > 0) {
      s.serveIn -= dt;
      if (s.serveIn <= 0) {
        b.vx = SERVE_SPEED * s.serveDir;
        b.vy = (rng() - 0.5) * 0.4;
      }
      return events;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
    if (b.y > 1 - b.r) { b.y = 1 - b.r; b.vy = -Math.abs(b.vy); }

    b.cooldown = Math.max(0, b.cooldown - dt);
    const hit = b.cooldown > 0 ? null : sampleHits(b, occ);
    if (hit) {
      bounce(b, hit, { bounceKick: 0.3, maxSpeed: MAX_SPEED, touchCooldown: 0.3 });
      // Always send it away from the hitter's own edge, a little faster each time.
      const away = side[hit.player] === 'right' ? -1 : 1;
      b.vx = away * Math.max(0.35, Math.abs(b.vx));
      b.vx *= 1.06;
      b.vy *= 1.06;
      clampSpeed(b, MAX_SPEED);
      s.rally += 1;
      s.bestRally = Math.max(s.bestRally, s.rally);
      s.lastHitter = hit.player;
      if (players < 2) s.scores[hit.player] += 1; // solo: every return scores
      events.push({ type: 'bounce', x: b.x, y: b.y, player: hit.player, count: s.rally });
    }

    const out = b.x < -b.r ? 'left' : b.x > aspect + b.r ? 'right' : null;
    // Solo: the edge without a player is a wall.
    const soloSide = players < 2 ? (side[0] ?? side[1]) : null;
    if (soloSide && ((soloSide === 'left' && b.x > aspect - b.r) || (soloSide === 'right' && b.x < b.r))) {
      b.vx = -b.vx;
      b.x = Math.min(aspect - b.r, Math.max(b.r, b.x));
    } else if (out) {
      const defender = side[0] === out ? 0 : side[1] === out ? 1 : -1;
      const scorer = players >= 2 && defender >= 0 ? 1 - defender : -1;
      if (scorer >= 0) {
        s.scores[scorer] += 1;
        events.push({ type: 'score', player: scorer, x: out === 'left' ? 0.1 : aspect - 0.1, y: b.y, text: 'point!' });
      } else {
        events.push({ type: 'miss', x: b.x, y: b.y });
      }
      serve(s, aspect, rng);
    }
    return events;
  },

  draw(s, kit) {
    // Net: a dashed center line.
    for (let y = 0.05; y < 1; y += 0.08) kit.line([[kit.aspect / 2, y], [kit.aspect / 2, y + 0.04]], 0.006, null, 0.25);
    const b = s.ball;
    if (s.serveIn > 0) kit.ring(b.x, b.y, b.r * (1.4 + s.serveIn), b.r * 0.15, kit.COLORS.ink, 0.5);
    kit.disc(b.x, b.y, b.r, 0.92);
  },

  hud(s, players) {
    return versusHud(s.scores, players, `rally ${s.rally}`);
  },

  result(s, players) {
    if (players >= 2) {
      const r = versusResult(s.scores, players);
      r.lines[1] = `longest rally ${s.bestRally}`;
      return r;
    }
    return { headline: `${s.scores[0]} returns`, headlineColor: 0, lines: [`longest rally ${s.bestRally}`], value: s.scores[0] };
  },
};
