import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginRound, createOrbField, stepOrbs } from '../src/game/orbs.js';
import { createGrid, occupancyFn } from '../src/shadows.js';
import { IDENTITY } from '../src/mapping.js';
import { createSimTracker } from '../src/tracker/sim.js';

const nobody = () => -1;

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function orbAt(field, x, y, kind = 'normal') {
  const o = { id: 99, kind, x, y, r: 0.05, vx: 0, vy: 0, age: 1, life: 10, phase: 0, cooldown: 0,
    touchedAt: [-Infinity, -Infinity] };
  field.orbs = [o];
  field.spawnIn = 1e9; // no spawning during the test
  return o;
}

// Player p's shadow covers a disc of radius 0.1 around (cx, cy).
const disc = (p, cx, cy) => (x, y) => (Math.hypot(x - cx, y - cy) < 0.1 ? p : -1);

test('ambient orbs spawn, drift, and stay inside the wall', () => {
  const f = createOrbField({}, seeded());
  for (let k = 0; k < 600; k++) stepOrbs(f, { dt: 1 / 60, aspect: 0.6, occ: nobody, players: 0, scoring: false });
  assert.ok(f.orbs.length > 0);
  for (const o of f.orbs) {
    assert.ok(o.x >= o.r - 1e-9 && o.x <= 0.6 - o.r + 1e-9);
    assert.ok(o.y >= o.r - 1e-9 && o.y <= 1 - o.r + 1e-9);
  }
});

test('outside a round, a shadow pushes an orb away instead of popping it', () => {
  const f = createOrbField({}, seeded());
  const o = orbAt(f, 0.3, 0.5);
  const events = stepOrbs(f, { dt: 1 / 60, aspect: 1, occ: disc(0, 0.22, 0.5), players: 1, scoring: false });
  assert.equal(events[0].type, 'nudge');
  assert.equal(f.orbs.length, 1);
  assert.ok(o.vx > 0, 'pushed to the right, away from the shadow on its left');
});

test('during a round, touching a normal orb pops it and scores for that player', () => {
  const f = createOrbField({}, seeded());
  beginRound(f);
  orbAt(f, 0.3, 0.5);
  const events = stepOrbs(f, { dt: 1 / 60, aspect: 1, occ: disc(1, 0.25, 0.5), players: 2, scoring: true });
  assert.equal(events[0].type, 'pop');
  assert.equal(events[0].player, 1);
  assert.deepEqual(f.scores, [0, 1]);
  assert.equal(f.orbs.length, 0);
});

test('with two players, a gold orb needs both of them', () => {
  const f = createOrbField({}, seeded());
  beginRound(f);
  const o = orbAt(f, 0.5, 0.5, 'gold');
  const step = (occ) => stepOrbs(f, { dt: 0.3, aspect: 1, occ, players: 2, scoring: true });

  assert.equal(step(disc(0, 0.45, 0.5))[0].type, 'goldTouch');
  assert.equal(f.orbs.length, 1);
  o.x = 0.5; o.y = 0.5; o.vx = 0; o.vy = 0; // undo the bounce for a deterministic second touch

  const [ev] = step(disc(1, 0.55, 0.5));
  assert.equal(ev.type, 'pop');
  assert.equal(ev.coop, true);
  assert.deepEqual(f.scores, [3, 3]);
});

test('solo, a gold orb pops on one touch', () => {
  const f = createOrbField({}, seeded());
  beginRound(f);
  orbAt(f, 0.5, 0.5, 'gold');
  const [ev] = stepOrbs(f, { dt: 1 / 60, aspect: 1, occ: disc(0, 0.45, 0.5), players: 1, scoring: true });
  assert.equal(ev.type, 'pop');
  assert.deepEqual(f.scores, [3, 0]);
});

test('round orbs expire', () => {
  const f = createOrbField({}, seeded());
  beginRound(f);
  const o = orbAt(f, 0.5, 0.5);
  o.life = 1.01;
  const events = stepOrbs(f, { dt: 0.05, aspect: 1, occ: nobody, players: 1, scoring: true });
  assert.equal(events[0].type, 'expire');
  assert.equal(f.orbs.length, 0);
});

test('occupancyFn maps world points through the inverse homography into the mask', () => {
  const mask = createGrid(4, 4);
  mask.data[1 * 4 + 2] = 1; // cell (i=2, j=1) -> cam u in [0.5,0.75), v in [0.25,0.5)
  const occ = occupancyFn([{ id: 1, det: { mask } }], IDENTITY, 2);
  assert.equal(occ(2 * 0.6, 0.3), 1);
  assert.equal(occ(2 * 0.3, 0.3), -1);
});

test('end to end: a simulated player scores points in a round', () => {
  const sim = createSimTracker({ players: 1, script: [[0, Infinity]] });
  const f = createOrbField({}, seeded(7));
  beginRound(f);
  const aspect = 640 / 480;
  for (let k = 0; k < 60 * 30; k++) {
    const t = k / 60;
    const slots = sim.detect(null, t).map((det, id) => ({ id, det }));
    const occ = occupancyFn(slots, IDENTITY, aspect);
    stepOrbs(f, { dt: 1 / 60, aspect, occ, players: 1, scoring: true });
  }
  assert.ok(f.scores[0] > 0, `expected some pops in 30 s, got ${f.scores[0]}`);
});
