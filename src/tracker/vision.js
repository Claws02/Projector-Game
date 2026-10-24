// Shared MediaPipe Tasks loader: one WASM runtime for the pose and hand models.

export const MEDIAPIPE_VERSION = '0.10.35';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

let loading = null;
let workerFactory = null;

// In a module worker there is no importScripts(), so MediaPipe must load the
// ES-module build of its WASM glue (forVisionTasks' second argument).
const IN_WORKER = typeof document === 'undefined';

export function loadVision() {
  loading ??= (async () => {
    const mod = await import(`${CDN}/vision_bundle.mjs`);
    const fileset = await mod.FilesetResolver.forVisionTasks(`${CDN}/wasm`, IN_WORKER);
    if (IN_WORKER) {
      // MediaPipe clears self.ModuleFactory after creating each task and expects
      // to re-run its loader script for the next one. An ES module only runs
      // once, so keep the factory and restore it before every task creation.
      workerFactory = (await import(fileset.wasmLoaderPath)).default;
    }
    return { mod, fileset };
  })();
  return loading;
}

// Try the GPU delegate first; fall back to CPU (older phones, headless browsers).
// delegate: 'auto' (GPU, falling back to CPU) or 'cpu'.
export async function createWithFallback(create, delegate = 'auto') {
  const attempt = (delegate) => {
    if (workerFactory) self.ModuleFactory = workerFactory;
    return create(delegate);
  };
  if (delegate === 'cpu') return { task: await attempt('CPU'), delegate: 'cpu' };
  try {
    return { task: await attempt('GPU'), delegate: 'gpu' };
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    return { task: await attempt('CPU'), delegate: 'cpu' };
  }
}

// A scratch canvas that works on the main thread and in workers.
export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
