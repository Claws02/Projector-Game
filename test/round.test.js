import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Phase, createRound, stepRound } from '../src/game/round.js';

function run(r, seconds, present, dt = 0.05) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...stepRound(r, { dt, present }));
  return events;
}

test('stays asleep with nobody present', () => {
  const r = createRound();
  run(r, 10, false);
  assert.equal(r.phase, Phase.ATTRACT);
});

test('full hands-free cycle: wake, countdown, 60 s round, results, sleep', () => {
  const r = createRound();
  assert.deepEqual(run(r, 0.5, true), ['wake']);
  assert.equal(r.phase, Phase.WAKING);

  assert.deepEqual(run(r, 3, true), ['roundStart']);
  assert.equal(r.phase, Phase.PLAYING);

  const playEvents = run(r, 60.1, true);
  assert.equal(playEvents.filter((e) => e === 'tick').length, 5);
  assert.equal(playEvents.at(-1), 'roundEnd');
  assert.equal(r.phase, Phase.RESULTS);

  run(r, 7, false);
  assert.equal(r.phase, Phase.ATTRACT);
});

test('staying after results starts another round', () => {
  const r = createRound({ roundSeconds: 5 });
  run(r, 0.5 + 3 + 5.2, true);
  assert.equal(r.phase, Phase.RESULTS);
  assert.deepEqual(run(r, 6.05, true), ['wake']);
});

test('a brief dropout does not end the round, walking away does', () => {
  const r = createRound();
  run(r, 4, true);
  assert.equal(r.phase, Phase.PLAYING);
  run(r, 1, false);
  assert.equal(r.phase, Phase.PLAYING);
  run(r, 2.5, false);
  assert.equal(r.phase, Phase.ATTRACT);
});
