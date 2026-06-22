// Tracking configuration. These are the knobs an operator most often tunes when
// setting up a new room, kept in one place on purpose.

// MediaPipe assets are fetched from a CDN at runtime (no build-time download).
const MP_VERSION = "0.10.18";
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

export const SELFIE_SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export const POSE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

/**
 * Mirror the camera horizontally. When the projector and the audience face the
 * same wall, a mirrored image makes movement feel natural (raise your right
 * hand, the shadow's right hand raises). Flip to false for see-through setups.
 */
export const MIRROR = true;

/**
 * Some segmenter builds report foreground confidence, others report background.
 * If shadows appear as a full rectangle with a person-shaped hole, flip this.
 */
export const INVERT_MASK = false;

/** How many people we attempt to track at once (cooperation needs >= 2). */
export const MAX_BODIES = 4;
