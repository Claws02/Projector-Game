// Runs the vision models on one camera frame. Used inside the tracking worker,
// or on the main thread as a fallback, so both paths behave identically.

import { createPoseTracker } from './mediapipe.js';
import { createHandTracker } from './hands.js';

export async function createEngine({ maxPlayers = 2, model = 'full', hands = true, delegate = 'auto' } = {}) {
  let pose = await createPoseTracker({ maxPlayers, model, delegate });
  let handTracker = null;
  if (hands) {
    try {
      handTracker = await createHandTracker({ delegate });
    } catch (err) {
      console.warn('Hand tracking unavailable; continuing without it', err);
    }
  }
  let frames = 0;

  return {
    get name() {
      return pose.name;
    },
    get handName() {
      return handTracker?.name ?? null;
    },

    async setModel(name) {
      const next = await createPoseTracker({ maxPlayers, model: name, delegate });
      pose.close();
      pose = next;
    },

    // image: video / ImageBitmap of size w x h; ts: capture time in ms.
    // handObs is null on frames where the hand model didn't run (it runs on
    // every other frame: gestures don't need 30 Hz and it halves the cost).
    run(image, w, h, ts) {
      const t0 = performance.now();
      const detections = pose.detect(image, ts);
      const inferMs = performance.now() - t0;
      let handObs = null;
      let handMs = 0;
      if (handTracker && frames++ % 2 === 0) {
        const t1 = performance.now();
        handObs = handTracker.detect(image, w, h, detections, ts);
        handMs = performance.now() - t1;
      }
      return { detections, handObs, inferMs, handMs };
    },
  };
}
