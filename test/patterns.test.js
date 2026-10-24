import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_HOLD, createDetector, patternText, stepDetector } from '../src/game/patterns.js';
import { createHome, stepHome } from '../src/home.js';
import { GAMES, availableGames } from '../src/games/index.js';

const portal = { x: 0.5, y: 0.5, r: 0.05 };
const hand = (o = {}) => ({ key: '0R', player: 0, side: 'R', x: 0.5, y: 0.5, vx: 0, vy: 0, grip: false, gesture: 'None', ...o });
const away = (o = {}) => hand({ x: 0.1, y: 0.9, ...o });

// Runs a detector over frames; frame(i) returns the hands for frame i. Returns the trigger frame or -1.
function run(pattern, frames, frame, { handModel = true, players = 1, dt = 1 / 30 } = {}) {
  const d = createDetector(pattern, { handModel });
  for (let i = 0; i < frames; i++) {
    if (stepDetector(d, portal, { dt, time: i * dt, hands: frame(i), players })) return i;
  }
  return -1;
}

test('dwell triggers after holding a hand on it, not before', () => {
  const at = run({ kind: 'dwell', hold: 1 }, 60, () => [hand()]);
  assert.ok(at >= 29 && at <= 31, `triggered at frame ${at}`);
  assert.equal(run({ kind: 'dwell', hold: 1 }, 60, () => [away()]), -1);
});

test('punch needs a fast hand on the portal', () => {
  assert.equal(run({ kind: 'punch', speed: 1.1 }, 30, () => [hand({ vx: 0.5 })]), -1);
  assert.equal(run({ kind: 'punch', speed: 1.1 }, 30, () => [hand({ vx: 1.5 })]), 0);
  assert.equal(run({ kind: 'punch', speed: 1.1 }, 30, () => [away({ vx: 3 })]), -1, 'fast but elsewhere');
});

test('bounceUp counts separate upward hits within the window', () => {
  const p = { kind: 'bounceUp', count: 2, speed: 0.5, window: 4 };
  // Upward swipe on frames 0-2 and 20-22.
  const at = run(p, 60, (i) => [hand({ vy: i % 20 < 3 ? -0.8 : 0.3 })]);
  assert.equal(at, 20);
  assert.equal(run(p, 60, () => [hand({ vy: 0.8 })]), -1, 'downward does not count');
});

test('twoTouch needs both players on it together', () => {
  const p = { kind: 'twoTouch', window: 0.8 };
  const both = () => [hand(), hand({ key: '1L', player: 1 })];
  assert.equal(run(p, 10, both, { players: 2 }), 0);
  assert.equal(run(p, 30, () => [hand()], { players: 2 }), -1, 'one player only');
});

test('grabThrow: grip on it, then release while moving fast', () => {
  const p = { kind: 'grabThrow', speed: 0.7 };
  const at = run(p, 30, (i) => [hand({ grip: i < 10, vx: i < 10 ? 0 : 1.2, x: 0.5 + Math.max(0, i - 9) * 0.04 })]);
  assert.equal(at, 10);
  assert.equal(run(p, 30, (i) => [hand({ grip: i < 10 })]), -1, 'a slow release is just a drop');
});

test('gesture pattern needs that sign held near the portal', () => {
  const p = { kind: 'gesture', name: 'Thumb_Up', hold: 0.6 };
  assert.ok(run(p, 40, () => [hand({ gesture: 'Thumb_Up' })]) > 0);
  assert.equal(run(p, 40, () => [hand({ gesture: 'Victory' })]), -1);
});

test('every pattern has the universal hold fallback', () => {
  const frames = Math.ceil(FALLBACK_HOLD * 30) + 5;
  for (const g of GAMES) {
    assert.ok(run(g.pattern, frames, () => [hand()], { players: 1 }) >= 0, `${g.id} fallback`);
  }
});

test('hand-model patterns fall back to holding when hand tracking is off', () => {
  const p = { kind: 'gesture', name: 'Thumb_Up', hold: 0.6 };
  assert.equal(run(p, 40, () => [hand({ gesture: 'Thumb_Up' })], { handModel: false }), -1);
  assert.match(patternText(p, false), /Hold a hand on it/);
});

test('every game has a distinct start pattern and hint', () => {
  const texts = GAMES.map((g) => patternText(g.pattern));
  assert.equal(new Set(texts).size, GAMES.length, texts.join(' | '));
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
});

test('home: hand-tracking-only games are hidden without the hand model', () => {
  assert.ok(availableGames(true).some((g) => g.id === 'simon'));
  assert.ok(!availableGames(false).some((g) => g.id === 'simon'));
});

test('home: holding a hand on a portal selects its game; the ? portal opens the guide', () => {
  const home = createHome(GAMES);
  const input = (hands, i) => ({ dt: 1 / 30, time: i / 30, aspect: 0.6, occ: () => -1, hands, players: 1 });
  stepHome(home, input([], 0), { active: true }); // lays out portals
  const orb = home.portals.find((p) => p.id === 'orbs');
  let selected = null;
  for (let i = 1; i < 60 && !selected; i++) {
    selected = stepHome(home, input([hand({ x: orb.hx, y: orb.hy })], i), { active: true }).find((e) => e.type === 'select');
  }
  assert.equal(selected?.id, 'orbs');

  const help = home.portals.find((p) => p.id === 'help');
  let guide = false;
  for (let i = 60; i < 120 && !guide; i++) {
    guide = stepHome(home, input([hand({ x: help.hx, y: help.hy })], i), { active: true }).some((e) => e.type === 'guide');
  }
  assert.ok(guide);
});

test('home: nothing starts while asleep, and portals sit inside the wall', () => {
  const home = createHome(GAMES);
  for (let i = 0; i < 200; i++) {
    const hands = home.portals.map((p, k) => hand({ key: `k${k}`, x: p.hx, y: p.hy, grip: true, gesture: 'Thumb_Up', vx: 2 }));
    const events = stepHome(home, { dt: 1 / 30, time: i / 30, aspect: 0.6, occ: () => -1, hands, players: 2 }, { active: false });
    assert.ok(!events.some((e) => e.type === 'select'));
  }
  for (const p of home.portals) {
    assert.ok(p.hx - p.r >= 0 && p.hx + p.r <= 0.6 && p.hy - p.r >= 0 && p.hy + p.r <= 1, p.id);
  }
});
