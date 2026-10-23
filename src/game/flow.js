// Session flow, hands-free:
//
//   ATTRACT --someone in frame--> HOME --pattern on a portal--> COUNTDOWN --> PLAYING --> RESULTS
//      ^                           |  ^                            |             |            |
//      +------ everyone left ------+  +--- both hands up 2 s ------+-------------+            |
//      +------ everyone left --------------------------------------+-------------+            |
//                                     +---------------- still here ------------------------- -+
//
// The home screen is where games are picked; see src/home.js.

export const Phase = Object.freeze({
  ATTRACT: 'attract',
  HOME: 'home',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESULTS: 'results',
});

export const FLOW_DEFAULTS = Object.freeze({
  wakeDelay: 0.4,      // s someone must be present before the wall wakes
  countdown: 3,        // s of "3, 2, 1" before play
  leaveDelay: 3,       // s of nobody present before giving up
  resultsSeconds: 6,
  tickFrom: 5,         // emit 'tick' events for the last N seconds
});

export function createFlow(opts = {}) {
  return {
    ...FLOW_DEFAULTS,
    ...opts,
    phase: Phase.ATTRACT,
    phaseTime: 0,
    gameId: null,
    duration: 60,
    timeLeft: 0,
    presentFor: 0,
    absentFor: 0,
  };
}

function goTo(f, phase, events, event) {
  f.phase = phase;
  f.phaseTime = 0;
  if (event) events.push(event);
}

// Starts the countdown for a game. Only valid from HOME (or ATTRACT for ?game=).
export function selectGame(f, gameId, duration) {
  if (f.phase !== Phase.HOME && f.phase !== Phase.ATTRACT) return false;
  f.gameId = gameId;
  f.duration = duration;
  f.phase = Phase.COUNTDOWN;
  f.phaseTime = 0;
  return true;
}

// Abandons the current game and returns to the home screen.
export function exitToHome(f) {
  if (f.phase !== Phase.COUNTDOWN && f.phase !== Phase.PLAYING && f.phase !== Phase.RESULTS) return false;
  f.phase = Phase.HOME;
  f.phaseTime = 0;
  return true;
}

// Advances the flow by dt seconds. Returns a list of event names that occurred.
export function stepFlow(f, { dt, present }) {
  const events = [];
  f.phaseTime += dt;
  if (present) {
    f.presentFor += dt;
    f.absentFor = 0;
  } else {
    f.absentFor += dt;
    f.presentFor = 0;
  }
  const everyoneLeft = f.absentFor >= f.leaveDelay;

  switch (f.phase) {
    case Phase.ATTRACT:
      if (f.presentFor >= f.wakeDelay) goTo(f, Phase.HOME, events, 'wake');
      break;
    case Phase.HOME:
      if (everyoneLeft) goTo(f, Phase.ATTRACT, events, 'sleep');
      break;
    case Phase.COUNTDOWN:
      if (everyoneLeft) goTo(f, Phase.ATTRACT, events, 'sleep');
      else if (f.phaseTime >= f.countdown) {
        f.timeLeft = f.duration;
        goTo(f, Phase.PLAYING, events, 'roundStart');
      }
      break;
    case Phase.PLAYING: {
      const before = Math.ceil(f.timeLeft);
      f.timeLeft = Math.max(0, f.timeLeft - dt);
      const after = Math.ceil(f.timeLeft);
      if (after < before && after <= f.tickFrom && after > 0) events.push('tick');
      if (f.timeLeft <= 0) goTo(f, Phase.RESULTS, events, 'roundEnd');
      else if (everyoneLeft) goTo(f, Phase.ATTRACT, events, 'sleep');
      break;
    }
    case Phase.RESULTS:
      if (f.phaseTime >= f.resultsSeconds) {
        if (f.absentFor > 0.5) goTo(f, Phase.ATTRACT, events, 'sleep');
        else goTo(f, Phase.HOME, events, 'home');
      }
      break;
  }
  return events;
}
