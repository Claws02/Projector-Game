// Real tracker: MediaPipe Pose Landmarker (up to 2 people) with per-person
// segmentation masks. Runs fully on-device in the browser (WASM + WebGL).

import { createGrid, downsampleInto } from '../shadows.js';

export const MEDIAPIPE_VERSION = '0.10.35';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Shoulders and hips: a stable body centroid for identity matching.
const TORSO = [11, 12, 23, 24];

export async function createPoseTracker({ maxPlayers = 2, gridW = 64 } = {}) {
  const { FilesetResolver, PoseLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const make = (delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: maxPlayers,
      outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  let landmarker;
  let delegate = 'GPU';
  try {
    landmarker = await make('GPU');
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    delegate = 'CPU';
    landmarker = await make('CPU');
  }

  let lastVideoTime = -1;
  let lastTs = 0;
  let last = [];

  return {
    name: `mediapipe-${delegate.toLowerCase()}`,

    // Returns detections in camera-normalized space:
    // [{ u, v, landmarks: [{x, y, visibility}], mask: MaskGrid }]
    detect(video) {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return last;
      lastVideoTime = video.currentTime;
      const ts = Math.max(lastTs + 1, performance.now()); // must be strictly increasing
      lastTs = ts;

      const result = landmarker.detectForVideo(video, ts);
      try {
        last = result.landmarks.map((lms, k) => {
          const m = result.segmentationMasks?.[k];
          let mask = null;
          if (m) {
            const gridH = Math.max(1, Math.round((gridW * m.height) / m.width));
            mask = downsampleInto(createGrid(gridW, gridH), m.getAsFloat32Array(), m.width, m.height);
          }
          const torso = TORSO.map((i) => lms[i]);
          return {
            u: torso.reduce((s, p) => s + p.x, 0) / torso.length,
            v: torso.reduce((s, p) => s + p.y, 0) / torso.length,
            landmarks: lms,
            mask,
          };
        });
      } finally {
        result.close();
      }
      return last;
    },
  };
}
