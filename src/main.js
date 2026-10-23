// Entry point: camera -> tracker -> players -> game -> renderer/audio, every frame.

import { parseConfig } from './config.js';
import { IDENTITY, applyH, coverFit, homographyFromCorners, invertH } from './mapping.js';
import { PlayerSlots } from './players.js';
import { occupancyFn } from './shadows.js';
import { Phase, createRound, stepRound } from './game/round.js';
import { beginRound, createOrbField, stepOrbs } from './game/orbs.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { HandStates, palmsFromPose } from './handstate.js';
import { createSimHandTracker, createSimTracker } from './tracker/sim.js';

const STORE = { corners: 'projector-game.corners', best: 'projector-game.best' };

const cfg = parseConfig(location.search);
const canvas = document.getElementById('stage');
const video = document.getElementById('cam');
const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('start');

const renderer = createRenderer(canvas);
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
    video: { facingMode: cfg.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  await video.play();
}

// Read live: phones swap the video's width/height when rotated.
const cameraFrame = () => ({ width: video.videoWidth, height: video.videoHeight });

async function createTrackers() {
  if (cfg.source === 'sim') {
    const pose = createSimTracker({ players: cfg.simPlayers });
    return { pose, hands: cfg.hands ? createSimHandTracker(pose) : null };
  }
  setStatus('Loading vision models…');
  const [{ createPoseTracker }, { createHandTracker }] = await Promise.all([
    import('./tracker/mediapipe.js'),
    import('./tracker/hands.js'),
  ]);
  const pose = await createPoseTracker({ maxPlayers: cfg.maxPlayers });
  let hands = null;
  if (cfg.hands) {
    try {
      hands = await createHandTracker();
    } catch (err) {
      console.warn('Hand tracking unavailable; continuing without it', err);
    }
  }
  return { pose, hands };
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
    const trackers = await createTrackers();
    overlay.hidden = true;
    runGame(trackers, cfg.source === 'sim' ? () => trackers.pose.frame : cameraFrame);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't start: ${err.message}`);
    startBtn.disabled = false;
  }
}

function runGame({ pose: tracker, hands: handTracker }, frameSize) {
  const slots = new PlayerSlots({ max: cfg.maxPlayers });
  const handStates = new HandStates();
  const round = createRound({ roundSeconds: cfg.roundSeconds });
  const field = createOrbField();
  const stats = { fps: 60, inferMs: 0, handMs: 0, renderMs: 0 };
  let handObs = [];
  let freshFrames = 0;
  let H = IDENTITY;
  let invH = IDENTITY;
  let wake = 0;
  let best = load(STORE.best) ?? 0;
  let bestBefore = best;
  let lastCount = 0;
  let last = performance.now() / 1000;

  const remap = () => {
    renderer.resize();
    H = computeMapping(frameSize());
    invH = invertH(H);
  };
  remap();
  window.addEventListener('resize', remap);
  video.addEventListener('resize', remap);

  function onRoundEvent(ev) {
    if (ev === 'wake') audio.wake();
    else if (ev === 'sleep') audio.sleep();
    else if (ev === 'tick') audio.tick();
    else if (ev === 'roundStart') {
      beginRound(field);
      audio.countdown(0);
    } else if (ev === 'roundEnd') {
      const team = field.scores[0] + field.scores[1];
      bestBefore = best;
      if (team > best) save(STORE.best, (best = team));
      audio.roundEnd();
    }
  }

  function onOrbEvent(ev) {
    renderer.emit(ev);
    if (ev.type === 'pop') ev.kind === 'gold' ? audio.goldPop() : audio.pop(ev.player, ev.combo);
    else if (ev.type === 'goldTouch') audio.goldTouch(ev.player);
    else if (ev.type === 'nudge') audio.nudge();
    else if (ev.type === 'grab') audio.grab(ev.player);
    else if (ev.type === 'throw') audio.throw(ev.speed);
  }

  function frameLoop(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    if (dt > 0) stats.fps += (1 / dt - stats.fps) * 0.05;

    const t0 = performance.now();
    const { detections, fresh } = tracker.detect(video);
    stats.inferMs += (performance.now() - t0 - stats.inferMs) * 0.1;

    // Hand model on every other new camera frame: gestures don't need 30 Hz,
    // and it halves the extra inference cost. Palm positions come from pose.
    if (handTracker && fresh && freshFrames++ % 2 === 0) {
      const t1 = performance.now();
      handObs = handTracker.detect(video, detections);
      stats.handMs += (performance.now() - t1 - stats.handMs) * 0.1;
    }

    const aspect = renderer.aspect;
    const toWorld = (u, v) => {
      const [s, t] = applyH(H, u, v);
      return { x: s * aspect, y: t };
    };
    slots.update(detections.map((d) => ({ ...d, ...toWorld(d.u, d.v) })), now);
    const playerCount = slots.activeCount;

    const hands = handTracker
      ? handStates.update(
        palmsFromPose(slots.slots).map((p) => ({ ...p, ...toWorld(p.u, p.v) })),
        handObs.map((o) => ({ ...o, ...toWorld(o.u, o.v) })),
        now, dt)
      : [];

    stepRound(round, { dt, present: playerCount > 0 }).forEach(onRoundEvent);
    if (round.phase === Phase.WAKING) {
      const n = Math.ceil(round.countdown - round.phaseTime);
      if (n !== lastCount && n > 0) audio.countdown(n);
      lastCount = n;
    }

    const occ = occupancyFn(slots.slots, invH, aspect);
    stepOrbs(field, { dt, aspect, occ, players: playerCount, scoring: round.phase === Phase.PLAYING, hands })
      .forEach(onOrbEvent);

    wake += ((round.phase === Phase.ATTRACT ? 0 : 1) - wake) * Math.min(1, dt * 2.5);

    const t2 = performance.now();
    renderer.draw({
      round, field, slots: slots.slots, playerCount, H, invH, aspect, wake, time: now,
      hands: handTracker ? hands : null, handTrackerName: handTracker?.name,
      best: round.phase === Phase.RESULTS ? bestBefore : best,
      drawShadows: cfg.drawShadows, debug: cfg.debug, stats, trackerName: tracker.name,
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
