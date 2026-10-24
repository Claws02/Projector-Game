// Real tracker: MediaPipe Pose Landmarker (up to 2 people) with per-person
// segmentation masks. Runs fully on-device in the browser (WASM + WebGL).

import { createGrid, downsampleBoxInto, downsampleInto } from '../shadows.js';
import { createWithFallback, loadVision } from './vision.js';

// lite: fastest. full: noticeably steadier landmarks and masks, ~1.5-2x the cost.
export const POSE_MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

// Shoulders and hips: a stable body centroid for identity matching.
const TORSO = [11, 12, 23, 24];

// gridW: collision grid width. shapeW: render grid width (sharp shadow outline).
export async function createPoseTracker({ maxPlayers = 2, gridW = 64, shapeW = 160, model = 'full', delegate = 'auto' } = {}) {
  const { mod, fileset } = await loadVision();
  const { task: landmarker, delegate: used } = await createWithFallback((d) =>
    mod.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODELS[model] ?? POSE_MODELS.full, delegate: d },
      runningMode: 'VIDEO',
      numPoses: maxPlayers,
      outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.6,
    }), delegate);

  let lastTs = 0;

  return {
    name: `pose-${model}-${used}`,
    model,
    close: () => landmarker.close(),

    // image: video, ImageBitmap or canvas; ts: ms, strictly increasing.
    // Returns detections in camera-normalized space:
    // [{ u, v, landmarks: [{x, y, visibility}], mask: MaskGrid, shape: MaskGrid }]
    detect(image, ts) {
      lastTs = Math.max(lastTs + 1, ts);
      const result = landmarker.detectForVideo(image, lastTs);
      try {
        return result.landmarks.map((lms, k) => {
          const m = result.segmentationMasks?.[k];
          let mask = null;
          let shape = null;
          if (m) {
            const px = m.getAsFloat32Array();
            const rows = (w) => Math.max(1, Math.round((w * m.height) / m.width));
            mask = downsampleInto(createGrid(gridW, rows(gridW)), px, m.width, m.height);
            shape = downsampleBoxInto(createGrid(shapeW, rows(shapeW)), px, m.width, m.height);
          }
          const torso = TORSO.map((i) => lms[i]);
          return {
            u: torso.reduce((s, p) => s + p.x, 0) / torso.length,
            v: torso.reduce((s, p) => s + p.y, 0) / torso.length,
            landmarks: lms.map(({ x, y, visibility }) => ({ x, y, visibility })),
            mask,
            shape,
          };
        });
      } finally {
        result.close();
      }
    },
  };
}
