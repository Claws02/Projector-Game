// Shared MediaPipe Tasks loader: one WASM runtime for the pose and hand models.

export const MEDIAPIPE_VERSION = '0.10.35';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

let loading = null;

export function loadVision() {
  loading ??= (async () => {
    const mod = await import(`${CDN}/vision_bundle.mjs`);
    const fileset = await mod.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    return { mod, fileset };
  })();
  return loading;
}

// Try the GPU delegate first; fall back to CPU (older phones, headless browsers).
export async function createWithFallback(create) {
  try {
    return { task: await create('GPU'), delegate: 'gpu' };
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    return { task: await create('CPU'), delegate: 'cpu' };
  }
}
