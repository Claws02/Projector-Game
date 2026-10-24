import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Phase, createFlow, exitToHome, selectGame, stepFlow } from '../src/game/flow.js';

function run(f, seconds, present, dt = 0.05) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...stepFlow(f, { dt, present }));
  return events;
}

test('stays asleep with nobody present', () => {
  const f = createFlow();
  run(f, 10, false);
  assert.equal(f.phase, Phase.ATTRACT);
});

test('someone stepping in wakes the home screen, and it waits there', () => {
  const f = createFlow();
  assert.deepEqual(run(f, 0.5, true), ['wake']);
  assert.equal(f.phase, Phase.HOME);
  run(f, 30, true);
  assert.equal(f.phase, Phase.HOME, 'home never auto-starts a game');
});

test('full cycle: select, countdown, round, results, back home', () => {
  const f = createFlow();
  run(f, 0.5, true);
  assert.ok(selectGame(f, 'orbs', 60));
  assert.equal(f.phase, Phase.COUNTDOWN);
  assert.deepEqual(run(f, 3.05, true), ['roundStart']);
  assert.equal(f.phase, Phase.PLAYING);

  const playEvents = run(f, 60.1, true);
  assert.equal(playEvents.filter((e) => e === 'tick').length, 5);
  assert.equal(playEvents.at(-1), 'roundEnd');
  assert.equal(f.phase, Phase.RESULTS);

  assert.deepEqual(run(f, 6.05, true), ['home']);
  assert.equal(f.phase, Phase.HOME);
});

test('the round length comes from the selected game', () => {
  const f = createFlow();
  run(f, 0.5, true);
  selectGame(f, 'paint', 10);
  run(f, 3.05, true);
  run(f, 10.1, true);
  assert.equal(f.phase, Phase.RESULTS);
});

test('nobody left after results goes back to sleep', () => {
  const f = createFlow();
  run(f, 0.5, true);
  selectGame(f, 'orbs', 5);
  run(f, 3.05 + 5.1, true);
  run(f, 7, false);
  assert.equal(f.phase, Phase.ATTRACT);
});

test('a brief dropout does not end the round, walking away does', () => {
  const f = createFlow();
  run(f, 0.5, true);
  selectGame(f, 'orbs', 60);
  run(f, 4, true);
  run(f, 1, false);
  assert.equal(f.phase, Phase.PLAYING);
  run(f, 2.5, false);
  assert.equal(f.phase, Phase.ATTRACT);
});

test('exit returns home mid-game; selecting is ignored outside home', () => {
  const f = createFlow();
  run(f, 0.5, true);
  selectGame(f, 'orbs', 60);
  run(f, 5, true);
  assert.equal(selectGame(f, 'paint', 60), false);
  assert.ok(exitToHome(f));
  assert.equal(f.phase, Phase.HOME);
  assert.equal(exitToHome(f), false);
});
