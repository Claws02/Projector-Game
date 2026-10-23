// Round flow, hands-free:
//
//   ATTRACT --someone in frame--> WAKING (countdown) --> PLAYING (60 s) --> RESULTS
//      ^                             |                       |                  |
//      +------- everyone left -------+-----------------------+   still here? -> WAKING
//                                                                 nobody?     -> ATTRACT

export const Phase = Object.freeze({
  ATTRACT: 'attract',
  WAKING: 'waking',
  PLAYING: 'playing',
  RESULTS: 'results',
});

export const ROUND_DEFAULTS = Object.freeze({
  roundSeconds: 60,
  wakeDelay: 0.4,      // s someone must be present before the scene wakes
  countdown: 3,        // s of "3, 2, 1" before play
  leaveDelay: 3,       // s of nobody present before giving up
  resultsSeconds: 6,
  tickFrom: 5,         // emit 'tick' events for the last N seconds
});

export function createRound(opts = {}) {
  return {
    ...ROUND_DEFAULTS,
    ...opts,
    phase: Phase.ATTRACT,
    phaseTime: 0,
    timeLeft: 0,
    presentFor: 0,
    absentFor: 0,
  };
}

// Advances the round by dt seconds. Returns a list of event names that occurred.
export function stepRound(r, { dt, present }) {
  const events = [];
  r.phaseTime += dt;
  if (present) {
    r.presentFor += dt;
    r.absentFor = 0;
  } else {
    r.absentFor += dt;
    r.presentFor = 0;
  }
  const goTo = (phase, event) => {
    r.phase = phase;
    r.phaseTime = 0;
    if (event) events.push(event);
  };
  const everyoneLeft = r.absentFor >= r.leaveDelay;

  switch (r.phase) {
    case Phase.ATTRACT:
      if (r.presentFor >= r.wakeDelay) goTo(Phase.WAKING, 'wake');
      break;
    case Phase.WAKING:
      if (everyoneLeft) goTo(Phase.ATTRACT, 'sleep');
      else if (r.phaseTime >= r.countdown) {
        r.timeLeft = r.roundSeconds;
        goTo(Phase.PLAYING, 'roundStart');
      }
      break;
    case Phase.PLAYING: {
      const before = Math.ceil(r.timeLeft);
      r.timeLeft = Math.max(0, r.timeLeft - dt);
      const after = Math.ceil(r.timeLeft);
      if (after < before && after <= r.tickFrom && after > 0) events.push('tick');
      if (r.timeLeft <= 0) goTo(Phase.RESULTS, 'roundEnd');
      else if (everyoneLeft) goTo(Phase.ATTRACT, 'sleep');
      break;
    }
    case Phase.RESULTS:
      if (r.phaseTime >= r.resultsSeconds) {
        if (r.absentFor > 0.5) goTo(Phase.ATTRACT, 'sleep');
        else goTo(Phase.WAKING, 'wake');
      }
      break;
  }
  return events;
}
