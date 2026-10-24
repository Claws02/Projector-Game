// Home screen: one shadow "portal" per game, plus a "?" portal for the guide.
//
// Portals sit in two columns at the wall's left and right edges, where hands
// reach while the body stays in the middle. Each portal starts its game when a
// hand performs that game's pattern on it (src/game/patterns.js). Portals
// float, spring back to place, and get nudged by shadows, so the wall feels alive.

import { FALLBACK_HOLD, createDetector, patternText, resetDetector, stepDetector } from './game/patterns.js';
import { sampleHits } from './game/physics.js';

const HELP = { id: 'help', title: 'How to play', icon: 'help', pattern: { kind: 'dwell', hold: 1 } };
const GUIDE_SECONDS = 12;
const HINT_SECONDS = 4;

export function createHome(games, { handModel = true } = {}) {
  const portals = [...games, HELP].map((g) => ({
    id: g.id,
    game: g === HELP ? null : g,
    title: g.title,
    icon: g.icon,
    hint: patternText(g.pattern, handModel),
    det: createDetector(g.pattern, { handModel }),
    x: 0, y: 0, hx: 0, hy: 0, r: 0.05, vx: 0, vy: 0, cooldown: 0,
  }));
  return { portals, handModel, time: 0, guideUntil: -Infinity, layoutAspect: null };
}

// Two columns at the edges; left column fills first. Recomputed on resize.
export function layoutHome(home, aspect) {
  const n = home.portals.length;
  const leftCount = Math.ceil(n / 2);
  const rows = leftCount;
  const top = 0.12;
  const bottom = 0.8;
  const spacing = rows > 1 ? (bottom - top) / (rows - 1) : 0;
  const r = Math.min(0.055, spacing * 0.28, aspect * 0.08);
  const margin = Math.max(r * 1.5, aspect * 0.09);
  home.portals.forEach((p, k) => {
    const left = k < leftCount;
    const row = left ? k : k - leftCount;
    p.column = left ? 'left' : 'right';
    p.hx = left ? margin : aspect - margin;
    p.hy = top + row * spacing;
    p.r = r;
    if (home.layoutAspect === null) {
      p.x = p.hx;
      p.y = p.hy;
    }
  });
  home.layoutAspect = aspect;
}

// active: false in ATTRACT (portals drift and react, but nothing can start).
// Returns events: { type: 'select', id } | { type: 'guide' } | { type: 'nudge', ... }.
export function stepHome(home, input, { active }) {
  const { dt, aspect, occ, hands } = input;
  if (home.layoutAspect !== aspect) layoutHome(home, aspect);
  home.time += dt;
  const events = [];

  for (const p of home.portals) {
    const held = p.det.heldKey && hands.find((h) => h.key === p.det.heldKey);
    if (held) {
      p.x += (held.x - p.x) * Math.min(1, dt * 20);
      p.y += (held.y - p.y) * Math.min(1, dt * 20);
      p.vx = 0;
      p.vy = 0;
    } else {
      // Spring home with damping, plus a slow idle bob.
      const bob = Math.sin(home.time * 1.3 + p.hy * 20) * 0.006;
      p.vx += ((p.hx - p.x) * 30 - p.vx * 6) * dt;
      p.vy += ((p.hy + bob - p.y) * 30 - p.vy * 6) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    p.cooldown = Math.max(0, p.cooldown - dt);
    const hit = p.cooldown > 0 || held ? null : sampleHits(p, occ);
    if (hit) {
      p.vx += hit.nx * 0.6;
      p.vy += hit.ny * 0.6;
      p.cooldown = 0.3;
      events.push({ type: 'nudge', x: p.x, y: p.y, player: hit.player });
    }

    if (!active) {
      resetDetector(p.det);
      p.det.progress = 0;
      continue;
    }
    // Detectors measure against the portal's resting spot so nudges don't move the goalposts.
    const spot = { x: held ? p.x : p.hx, y: held ? p.y : p.hy, r: p.r };
    if (stepDetector(p.det, spot, input)) {
      if (p.game) {
        events.push({ type: 'select', id: p.id, x: p.x, y: p.y });
      } else {
        openGuide(home);
        events.push({ type: 'guide' });
      }
    }
  }
  return events;
}

export const guideOpen = (home) => home.time < home.guideUntil;

export function openGuide(home) {
  home.guideUntil = home.time + GUIDE_SECONDS;
}

// For the attract screen: which portal's hint to show now.
export const currentHint = (home) => {
  const games = home.portals.filter((p) => p.game);
  return games[Math.floor(home.time / HINT_SECONDS) % games.length];
};

export function drawHome(home, kit, { active }) {
  const { COLORS } = kit;
  for (const p of home.portals) {
    const alpha = active ? 0.92 : 0.5;
    kit.icon(p.icon, p.x, p.y, p.r, alpha);
    if (!active) continue;
    if (p.det.progress > 0.02) {
      kit.ring(p.hx, p.hy, p.r * 1.35, p.r * 0.14, COLORS.gold, 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.det.progress);
    }
    const lx = p.column === 'left' ? p.hx - p.r : p.hx + p.r;
    const align = p.column === 'left' ? 'left' : 'right';
    kit.text(p.title, lx, p.hy + p.r * 1.7, 0.032, COLORS.ink, align, 800);
    kit.text(p.hint, lx, p.hy + p.r * 1.7 + 0.034, 0.022, COLORS.ink, align, 500);
  }

  if (!active) {
    const hint = currentHint(home);
    kit.text('step into the light', kit.aspect / 2, 0.88, 0.05, COLORS.wallLight, 'center', 600);
    kit.text(`${hint.title}: ${hint.hint.toLowerCase()}`, kit.aspect / 2, 0.94, 0.03, COLORS.wallLight, 'center', 500);
    return;
  }

  if (guideOpen(home)) drawGuide(home, kit);
  else kit.text(`hold a hand on any shape for ${FALLBACK_HOLD} s  ·  ? = guide`, kit.aspect / 2, 0.95, 0.024, COLORS.ink, 'center', 500);
}

function drawGuide(home, kit) {
  const games = home.portals.filter((p) => p.game);
  const w = Math.min(kit.aspect * 0.9, 1.2);
  const lineH = 0.075;
  const h = 0.16 + games.length * lineH;
  const x0 = (kit.aspect - w) / 2;
  const y0 = Math.max(0.03, (1 - h) / 2);
  kit.panel(x0, y0, w, h, 0.94);
  kit.text('How to start a game', kit.aspect / 2, y0 + 0.05, 0.04, kit.COLORS.wallLight);
  games.forEach((p, k) => {
    const y = y0 + 0.11 + k * lineH;
    kit.icon(p.icon, x0 + 0.05, y + 0.012, 0.022, 1, kit.COLORS.wallLight);
    kit.text(p.title, x0 + 0.09, y, 0.028, kit.COLORS.wallLight, 'left', 800);
    kit.text(p.hint, x0 + 0.09, y + 0.03, 0.022, kit.COLORS.wallLight, 'left', 500);
  });
  kit.text(`any game: hold a hand on its shape for ${FALLBACK_HOLD} s  ·  exit: both hands up for 2 s`,
    kit.aspect / 2, y0 + h - 0.025, 0.02, kit.COLORS.wallLight, 'center', 500);
}
