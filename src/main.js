// Entry point. Every render frame (60 Hz):
//   pipeline.poll -> new tracking sample? -> PlayerTracks (filter, coast, blend)
//   -> hands -> flow/home/game -> renderer + audio
// Tracking samples arrive at camera rate from a worker; everything the player
// sees is smoothed and extrapolated to render time.

import { parseConfig } from './config.js';
import { IDENTITY, applyH, coverFit, homographyFromCorners, invertH } from './mapping.js';
import { PlayerTracks } from './tracks.js';
import { occupancyFn } from './shadows.js';
import { Phase, createFlow, exitToHome, selectGame, stepFlow } from './game/flow.js';
import { availableGames, gameById } from './games/index.js';
import { createHome, openGuide, stepHome } from './home.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { HandStates, palmsFromPose } from './handstate.js';
import { createCameraPipeline, createSimPipeline } from './tracker/pipeline.js';

const STORE = { corners: 'projector-game.corners', best: (id) => `projector-game.best.${id}` };
const EXIT_HOLD = 2;

const cfg = parseConfig(location.search);
const canvas = document.getElementById('stage');
const video = document.getElementById('cam');
const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('start');

const renderer = createRenderer(canvas, cfg.gpu ? document.getElementById('wallgl') : null);
const audio = createAudio();

const setStatus = (msg) => { statusEl.textContent = msg; };

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: not persisted */ }
}

async function startCamera() {
  if (!window.isSecureContext) throw new Error('Camera needs HTTPS (or localhost). Open the GitHub Pages URL.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: cfg.facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
  });
  video.srcObject = stream;
  await video.play();
}

// Read live: phones swap the video's width/height when rotated.
const cameraFrame = () => ({ width: video.videoWidth, height: video.videoHeight });

async function createPipeline() {
  if (cfg.source === 'sim') return createSimPipeline({ players: cfg.simPlayers, hands: cfg.hands });
  setStatus('Loading vision models…');
  return createCameraPipeline(video, {
    worker: cfg.worker, model: cfg.model, delegate: cfg.delegate, hands: cfg.hands, maxPlayers: cfg.maxPlayers,
    onStatus: (msg) => console.info(msg),
  });
}

// cam -> world homography for the current screen size.
function computeMapping(frame) {
  if (cfg.mode === 'projector') {
    const corners = load(STORE.corners);
    return corners ? homographyFromCorners(corners) : IDENTITY;
  }
  return coverFit(frame.width, frame.height, canvas.width, canvas.height, cfg.mirror);
}

async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* not fatal */ }
}

async function enterFullscreen() {
  try { await document.documentElement.requestFullscreen?.(); } catch { /* not fatal */ }
}

async function start() {
  startBtn.disabled = true;
  audio.unlock();
  enterFullscreen();
  keepAwake();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') keepAwake();
  });
  try {
    if (cfg.source === 'camera') await startCamera();
    if (cfg.calibrate && cfg.source === 'camera') return runCalibration(cameraFrame());
    const pipeline = await createPipeline();
    overlay.hidden = true;
    runGame(pipeline, cfg.source === 'sim' ? () => pipeline.frame : cameraFrame);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't start: ${err.message}`);
    startBtn.disabled = false;
  }
}

function runGame(pipeline, frameSize) {
  const handModel = Boolean(pipeline.handName);
  const tracks = new PlayerTracks({ max: cfg.maxPlayers });
  let slots = [];
  let players = 0;
  const handStates = new HandStates();
  const flow = createFlow();
  const home = createHome(availableGames(handModel), { handModel });
  const rng = Math.random;
  const stats = { fps: 60, camFps: 0, inferMs: 0, handMs: 0, renderMs: 0 };
  let lastSampleAt = 0;
  const exitHold = [0, 0];
  let H = IDENTITY;
  let invH = IDENTITY;
  let wake = 0;
  let game = null;
  let gameState = null;
  let result = null;
  let bestBefore = 0;
  let lastCount = 0;
  let last = performance.now() / 1000;

  // Debug hook for automated browser checks (?debug=1 only).
  if (cfg.debug) {
    window.__shadowWall = {
      stats, shadowPath: renderer.shadowPath,
      get pipeline() { return pipeline.name; },
      get hands() { return pipeline.handName; },
      get players() { return players; },
      get phase() { return flow.phase; },
    };
  }

  const remap = () => {
    renderer.resize();
    H = computeMapping(frameSize());
    invH = invertH(H);
  };
  remap();
  window.addEventListener('resize', remap);
  video.addEventListener('resize', remap);

  function startGame(id) {
    const g = gameById(id);
    if (!g || !selectGame(flow, id, cfg.roundSeconds || g.duration)) return;
    game = g;
    gameState = g.create({ aspect: renderer.aspect, rng, players, handModel });
    audio.select();
  }

  function onFlowEvent(ev) {
    if (ev === 'wake' || ev === 'home') {
      if (ev === 'wake') audio.wake();
      game = null;
      if (cfg.game) startGame(cfg.game); // ?game=<id>: skip the home screen
      else if (cfg.guide) openGuide(home);
    } else if (ev === 'sleep') {
      audio.sleep();
      game = null;
    } else if (ev === 'tick') {
      audio.tick();
    } else if (ev === 'roundStart') {
      audio.countdown(0);
    } else if (ev === 'roundEnd') {
      result = game.result(gameState, players);
      bestBefore = load(STORE.best(game.id)) ?? 0;
      if (result.value !== null && result.value > bestBefore) save(STORE.best(game.id), result.value);
      audio.roundEnd();
    }
  }

  function onEvent(ev) {
    renderer.emit(ev);
    switch (ev.type) {
      case 'pop': ev.kind === 'gold' ? audio.goldPop() : audio.pop(ev.player, ev.combo); break;
      case 'goldTouch': audio.goldTouch(ev.player); break;
      case 'nudge': audio.nudge(); break;
      case 'grab': audio.grab(ev.player); break;
      case 'throw': audio.throw(ev.speed); break;
      case 'bounce': audio.bounce(ev.count); break;
      case 'hit': audio.hit(); break;
      case 'miss': audio.miss(); break;
      case 'score': audio.score(ev.player); break;
      case 'prompt': audio.prompt(); break;
      case 'correct': audio.correct(ev.player); break;
      case 'wrong': audio.wrong(); break;
      case 'guide': audio.guide(); break;
      case 'select': startGame(ev.id); break;
    }
  }

  // Both hands held still above the head for EXIT_HOLD seconds leaves the game.
  function checkExit(hands, toWorld, dt) {
    let progress = 0;
    for (const slot of slots) {
      const head = slot.det?.landmarks?.[0];
      const mine = hands.filter((h) => h.player === slot.id);
      const up = head && mine.length === 2 && mine.every((h) =>
        h.y < toWorld(head.x, head.y).y - 0.03 && Math.hypot(h.vx, h.vy) < 0.4);
      exitHold[slot.id] = up ? exitHold[slot.id] + dt : 0;
      progress = Math.max(progress, exitHold[slot.id] / EXIT_HOLD);
    }
    if (progress >= 1 && exitToHome(flow)) {
      exitHold.fill(0);
      game = null;
      audio.exit();
      return 0;
    }
    return progress;
  }

  function frameLoop(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    if (dt > 0) stats.fps += (1 / dt - stats.fps) * 0.05;

    // New tracking sample (camera rate)? Feed the tracks.
    let handObs = [];
    const sample = pipeline.poll(now);
    if (sample) {
      tracks.ingest(sample);
      if (sample.handObs) handObs = sample.handObs;
      stats.inferMs += (sample.inferMs - stats.inferMs) * 0.1;
      if (sample.handObs) stats.handMs += (sample.handMs - stats.handMs) * 0.2;
      if (lastSampleAt) stats.camFps += (1 / Math.max(1e-3, sample.time - lastSampleAt) - stats.camFps) * 0.1;
      lastSampleAt = sample.time;
    }

    // Smoothed, extrapolated players at render time, mapped to the wall.
    const aspect = renderer.aspect;
    const toWorld = (u, v) => {
      const [s, t] = applyH(H, u, v);
      return { x: s * aspect, y: t };
    };
    slots = tracks.update(now, dt).map((sl) => (sl.active ? { ...sl, ...toWorld(sl.u, sl.v) } : sl));
    players = slots.filter((sl) => sl.active).length;
    const hands = handStates.update(
      palmsFromPose(slots).map((p) => ({ ...p, ...toWorld(p.u, p.v) })),
      handObs.map((o) => ({ ...o, ...toWorld(o.u, o.v) })),
      now, dt);
    const bodies = slots.filter((sl) => sl.active).map((sl) => ({ player: sl.id, x: sl.x, y: sl.y }));
    const occ = occupancyFn(slots, invH, aspect);
    const input = { dt, time: now, aspect, occ, hands, bodies, players, rng };

    stepFlow(flow, { dt, present: players > 0 }).forEach(onFlowEvent);
    if (flow.phase === Phase.COUNTDOWN) {
      const n = Math.ceil(flow.countdown - flow.phaseTime);
      if (n !== lastCount && n > 0) audio.countdown(n);
      lastCount = n;
    }

    if (flow.phase === Phase.ATTRACT || flow.phase === Phase.HOME) {
      stepHome(home, input, { active: flow.phase === Phase.HOME }).forEach(onEvent);
    } else if (flow.phase === Phase.PLAYING) {
      game.step(gameState, input).forEach(onEvent);
    }
    const inGame = flow.phase === Phase.COUNTDOWN || flow.phase === Phase.PLAYING || flow.phase === Phase.RESULTS;
    const exitProgress = inGame ? checkExit(hands, toWorld, dt) : 0;

    wake += ((flow.phase === Phase.ATTRACT ? 0 : 1) - wake) * Math.min(1, dt * 2.5);

    const t2 = performance.now();
    renderer.draw({
      flow, home, game, gameState, result, bestBefore, players, slots, hands,
      H, invH, aspect, wake, time: now, exitProgress,
      drawShadows: cfg.drawShadows, debug: cfg.debug, stats,
      trackerName: pipeline.name, handTrackerName: pipeline.handName,
    }, dt);
    stats.renderMs += (performance.now() - t2 - stats.renderMs) * 0.1;
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);
}

// Projector calibration: show the camera feed, tap where the projected image's
// corners appear (TL, TR, BR, BL). Saved per device in localStorage.
function runCalibration(frame) {
  overlay.hidden = true;
  const ctx = canvas.getContext('2d');
  const labels = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  const corners = [];
  renderer.resize();
  const fit = coverFit(frame.width, frame.height, canvas.width, canvas.height, false);
  const toCam = invertH(fit);

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    corners.push(applyH(toCam, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
    if (corners.length === 4) {
      save(STORE.corners, corners);
      const url = new URL(location.href);
      url.searchParams.delete('calibrate');
      location.replace(url);
    }
  });

  (function draw() {
    const W = canvas.width;
    const Hh = canvas.height;
    const { a, d, e, f } = { a: fit[0], d: fit[4], e: fit[2], f: fit[5] };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(video, e * W, f * Hh, a * W, d * Hh);
    ctx.fillStyle = '#e0a526';
    for (const [u, v] of corners) {
      const [s, t] = applyH(fit, u, v);
      ctx.beginPath();
      ctx.arc(s * W, t * Hh, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    if (corners.length < 4) {
      ctx.font = `700 ${Math.round(Hh * 0.04)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, Hh * 0.08);
      ctx.fillStyle = '#fff';
      ctx.fillText(`Tap the projected image's ${labels[corners.length]} corner`, W / 2, Hh * 0.055);
      requestAnimationFrame(draw);
    }
  })();
}

startBtn.addEventListener('click', start);
if (cfg.autostart) start();
