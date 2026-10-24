// Helpers shared by game modules.
//
// A game module is a plain object:
//   id, title, icon (portal shape), blurb (how to play, shown in the countdown),
//   pattern (how to start it from home, see src/game/patterns.js),
//   duration (s), needsHandModel (hidden from home when hand tracking is off),
//   create(env) -> state                env: { aspect, rng, players, handModel }
//   step(state, input) -> events[]      input: { dt, time, aspect, occ, hands, bodies, players }
//   draw(state, kit)                    kit: drawing helpers from src/render.js
//   hud(state, players) -> { scores, showP2, center }
//   result(state, players) -> { headline, headlineColor, lines, value }  (value: best-score metric or null)

// Standard HUD for games scored per player.
export function versusHud(scores, players, center = '') {
  const showP2 = players >= 2 || scores[1] !== 0;
  return { scores, showP2, center: center || (showP2 ? `team ${scores[0] + scores[1]}` : '') };
}

// Standard results: winner + score line with 2 players, the score alone solo.
// The best-score metric is the team total, so co-op and versus both count.
export function versusResult(scores, players, unit = '') {
  const [a, b] = scores;
  if (players >= 2 || b !== 0) {
    return {
      headline: a === b ? 'tie!' : `P${a > b ? 1 : 2} wins`,
      headlineColor: a === b ? null : a > b ? 0 : 1,
      lines: [`${a}  –  ${b}`, `team ${a + b}${unit}`],
      value: a + b,
    };
  }
  return { headline: `${a}${unit}`, headlineColor: 0, lines: [], value: a };
}

// A round body (orb, ball, ammo): a crisp shadow disc with a motion trail while
// thrown and a player-colored ring while held.
export function drawBody(o, kit, alpha = 1) {
  if (kit.time < o.thrownUntil) {
    for (let k = 3; k >= 1; k--) {
      kit.disc(o.x - o.vx * 0.03 * k, o.y - o.vy * 0.03 * k, o.r * (1 - k * 0.12), 0.12 * alpha * (4 - k));
    }
  }
  kit.disc(o.x, o.y, o.r, 0.9 * alpha);
  if (o.heldBy) kit.ring(o.x, o.y, o.r * 1.15, o.r * 0.15, kit.COLORS.players[o.holder]);
}

export const near = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
