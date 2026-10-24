import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, gameById } from '../src/games/index.js';
import { createSimHandTracker, createSimTracker } from '../src/tracker/sim.js';
import { occupancyFn } from '../src/shadows.js';
import { IDENTITY } from '../src/mapping.js';
import { HandStates, palmsFromPose } from '../src/handstate.js';
import { PlayerTracks } from '../src/tracks.js';

function seeded(seed = 3) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// Plays a game for `seconds` with simulated players and hands, the same way main.js does.
// Low-res masks keep the suite fast; results are cached per game and length.
const cache = new Map();
function simulate(game, opts = {}) {
  const key = `${game.id}:${opts.seconds ?? 30}`;
  if (!cache.has(key)) cache.set(key, run(game, opts));
  return cache.get(key);
}

function run(game, { players = 2, seconds = 30 } = {}) {
  const aspect = 640 / 480;
  const rng = seeded();
  const sim = createSimTracker({ players, gridW: 32, shapeW: 32, script: [[0, Infinity], [0, Infinity]].slice(0, players) });
  const simHands = createSimHandTracker(sim);
  const tracks = new PlayerTracks();
  const handStates = new HandStates();
  const state = game.create({ aspect, rng, players, handModel: true });
  const events = [];
  const dt = 1 / 60; // render rate; the camera (sim) delivers samples at 30 Hz
  const world = (u, v) => ({ x: u * aspect, y: v });
  for (let i = 0; i < seconds * 60; i++) {
    const t = i * dt;
    let obs = [];
    if (i % 2 === 0) {
      const { detections } = sim.detect(null, t);
      tracks.ingest({ time: t, detections });
      if (i % 4 === 0) obs = simHands.detect(null, detections).map((o) => ({ ...o, ...world(o.u, o.v) }));
    }
    const slots = tracks.update(t, dt).map((sl) => (sl.active ? { ...sl, ...world(sl.u, sl.v) } : sl));
    const hands = handStates.update(palmsFromPose(slots).map((p) => ({ ...p, ...world(p.u, p.v) })), obs, t, dt);
    const bodies = slots.filter((s) => s.active).map((s) => ({ player: s.id, x: s.x, y: s.y }));
    const occ = occupancyFn(slots, IDENTITY, aspect);
    const active = slots.filter((s) => s.active).length;
    events.push(...game.step(state, { dt, time: t, aspect, occ, hands, bodies, players: active, rng }));
  }
  return { state, events };
}

for (const game of GAMES) {
  test(`${game.id}: plays 30 s with two simulated players and reports a result`, () => {
    const { state, events } = simulate(game);
    const hud = game.hud(state, 2);
    assert.ok(hud && 'center' in hud);
    const r = game.result(state, 2);
    assert.equal(typeof r.headline, 'string');
    assert.ok(Array.isArray(r.lines));
    assert.ok(r.value === null || Number.isFinite(r.value));
    assert.ok(events.length > 0, 'something happened');
    for (const ev of events) assert.equal(typeof ev.type, 'string');
  });
}

test('orbs: sim players score', () => {
  const { state } = simulate(gameById('orbs'));
  assert.ok(state.field.scores[0] + state.field.scores[1] > 0);
});

test('keepup: balloons get bounced', () => {
  const { events } = simulate(gameById('keepup'));
  assert.ok(events.some((e) => e.type === 'bounce'));
});

test('storm: stars and rocks both land on shadows', () => {
  const { events } = simulate(gameById('storm'), { seconds: 45 });
  assert.ok(events.some((e) => e.type === 'pop'));
  assert.ok(events.some((e) => e.type === 'hit'));
});

test('volley: the ball gets returned', () => {
  const { events } = simulate(gameById('volley'));
  assert.ok(events.some((e) => e.type === 'bounce'));
});

test('smash: balls get thrown or batted', () => {
  const { events } = simulate(gameById('smash'), { seconds: 45 });
  assert.ok(events.some((e) => e.type === 'throw' || e.type === 'nudge'));
});

test('paint: hands leave ink', () => {
  const { state } = simulate(gameById('paint'));
  assert.ok(state.strokes.length > 0);
});

test('simon: prompts appear and matching signs score', () => {
  const { state, events } = simulate(gameById('simon'));
  assert.ok(events.filter((e) => e.type === 'prompt').length >= 5);
  assert.ok(events.some((e) => e.type === 'correct'));
  assert.ok(state.scores[0] + state.scores[1] > 0);
});
