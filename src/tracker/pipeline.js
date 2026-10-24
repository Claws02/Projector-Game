// Frame pipeline: gets camera frames to the vision models and results back,
// without ever blocking the render loop.
//
// Worker mode (default): each new camera frame becomes an ImageBitmap that is
// transferred to src/tracker/worker.js. Only one frame is in flight; if the
// models are slower than the camera, frames are skipped rather than queued, so
// results are always as fresh as possible.
//
// Main-thread mode (fallback, or ?worker=0): the same engine runs inline when
// a new camera frame arrives.
//
// poll(now) is called every render frame and returns a new sample or null:
//   { seq, time (s, capture time), detections, handObs, inferMs, handMs }

import { createSimHandTracker, createSimTracker } from './sim.js';

const AUTO_LITE_AFTER = 12;   // samples to average before judging the model's speed
const AUTO_LITE_MS = 50;      // average pose inference above this -> switch full -> lite

// Watches the video for new frames (requestVideoFrameCallback where available).
function frameWatcher(video) {
  const w = { fresh: false };
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = () => {
      w.fresh = true;
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    let lastTime = -1;
    w.check = () => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        w.fresh = true;
      }
    };
  }
  return w;
}

export async function createCameraPipeline(video, {
  worker = 'auto', model = 'auto', delegate = 'auto', hands = true, maxPlayers = 2, onStatus,
} = {}) {
  const startModel = model === 'auto' ? 'full' : model;
  const opts = { maxPlayers, model: startModel, hands, delegate };
  const auto = model === 'auto';
  if (worker === 'off') return createMainPipeline(video, opts, auto);

  let impl;
  try {
    impl = await createWorkerPipeline(video, opts, auto, onStatus);
  } catch (err) {
    console.warn('Tracking worker unavailable; running on the main thread', err);
    return createMainPipeline(video, opts, auto);
  }
  // A worker that loads but fails on every frame (e.g. GPU inference unsupported
  // in workers on some browsers) is swapped for the main-thread pipeline.
  let switching = false;
  return {
    get name() { return impl.name; },
    get handName() { return impl.handName; },
    poll(now) {
      if (impl.failing && !switching) {
        switching = true;
        console.warn('Tracking worker keeps failing; switching to the main thread');
        impl.close();
        createMainPipeline(video, opts, auto).then((main) => { impl = main; });
      }
      return switching && impl.failing ? null : impl.poll(now);
    },
  };
}

async function createWorkerPipeline(video, opts, autoModel, onStatus) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const watch = frameWatcher(video);
  const state = { name: '', handName: null, busy: false, latest: null, seq: 0, model: opts.model, samples: [],
    results: 0, errors: 0 };

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker init timed out')), 60000);
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || 'worker failed to load'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        clearTimeout(timer);
        resolve(data);
      } else if (data.type === 'error') {
        clearTimeout(timer);
        reject(new Error(data.message));
      }
    };
  });
  worker.postMessage({ type: 'init', ...opts });
  const info = await ready;
  state.name = info.name;
  state.handName = info.handName;

  worker.onmessage = ({ data }) => {
    if (data.type === 'result') {
      state.busy = false;
      state.results += 1;
      state.latest = { ...data, time: data.ts / 1000 };
      if (autoModel) maybeDowngrade(data.inferMs);
    } else if (data.type === 'ready') {
      state.name = data.name;
      state.busy = false;
    } else if (data.type === 'error') {
      console.warn('tracking error', data.message);
      state.errors += 1;
      state.busy = false;
    }
  };

  function maybeDowngrade(ms) {
    if (state.model !== 'full') return;
    state.samples.push(ms);
    if (state.samples.length < AUTO_LITE_AFTER) return;
    const avg = state.samples.reduce((a, b) => a + b, 0) / state.samples.length;
    state.samples = [];
    if (avg > AUTO_LITE_MS) {
      state.model = 'lite';
      state.busy = true; // no frames until the new model is ready
      onStatus?.(`pose model too slow (${avg.toFixed(0)} ms); switching to lite`);
      worker.postMessage({ type: 'model', model: 'lite' });
    }
  }

  return {
    get name() {
      return `${state.name}@worker`;
    },
    get handName() {
      return state.handName;
    },
    get failing() {
      return state.results === 0 && state.errors >= 5;
    },
    close() {
      worker.terminate();
    },
    poll() {
      watch.check?.();
      if (watch.fresh && !state.busy && video.readyState >= 2) {
        watch.fresh = false;
        state.busy = true;
        const seq = ++state.seq;
        const ts = performance.now();
        createImageBitmap(video).then(
          (bitmap) => worker.postMessage({ type: 'frame', seq, ts, bitmap }, [bitmap]),
          () => { state.busy = false; },
        );
      }
      const out = state.latest;
      state.latest = null;
      return out;
    },
  };
}

async function createMainPipeline(video, opts, autoModel) {
  const { createEngine } = await import('./engine.js');
  const engine = await createEngine(opts);
  const watch = frameWatcher(video);
  let seq = 0;
  let model = opts.model;
  let samples = [];
  let switching = false;

  return {
    get name() {
      return `${engine.name}@main`;
    },
    get handName() {
      return engine.handName;
    },
    poll() {
      watch.check?.();
      if (!watch.fresh || switching || video.readyState < 2) return null;
      watch.fresh = false;
      const ts = performance.now();
      const out = engine.run(video, video.videoWidth, video.videoHeight, ts);
      if (autoModel && model === 'full') {
        samples.push(out.inferMs);
        if (samples.length >= AUTO_LITE_AFTER) {
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          samples = [];
          if (avg > AUTO_LITE_MS) {
            model = 'lite';
            switching = true;
            engine.setModel('lite').finally(() => { switching = false; });
          }
        }
      }
      return { seq: ++seq, ts, time: ts / 1000, ...out };
    },
  };
}

// Simulated players at camera rate (30 Hz), so the smoothing and interpolation
// paths get exercised exactly as with a real camera.
export function createSimPipeline({ players = 2, hands = true, rate = 30 } = {}) {
  const sim = createSimTracker({ players });
  const simHands = hands ? createSimHandTracker(sim) : null;
  const t0 = performance.now() / 1000;
  let next = 0;
  let seq = 0;
  let frames = 0;
  return {
    name: 'sim@30Hz',
    handName: simHands ? 'sim-hands' : null,
    frame: sim.frame,
    poll(now) {
      if (now < next) return null;
      next = Math.max(next + 1 / rate, now);
      const { detections } = sim.detect(null, now - t0);
      const handObs = simHands && frames++ % 2 === 0 ? simHands.detect(null, detections) : null;
      return { seq: ++seq, ts: now * 1000, time: now, detections, handObs, inferMs: 0, handMs: 0 };
    },
  };
}
