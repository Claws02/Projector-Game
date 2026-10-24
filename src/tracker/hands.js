// Hand tracking: MediaPipe Gesture Recognizer (21 landmarks + 7 canned gestures
// per hand: Closed_Fist, Open_Palm, Pointing_Up, Thumb_Up, Thumb_Down, Victory,
// ILoveYou).
//
// At full-body distance a hand is only ~30-40 px in the camera frame, too small
// for the palm detector. So we crop around each wrist found by the pose model,
// pack up to 4 crops into a 2x2 mosaic, and run the recognizer once on that.
// The model does not support region-of-interest input, hence the manual crop.

import { createWithFallback, loadVision } from './vision.js';

const MODEL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const CELL = 192; // mosaic quadrant size in px
const MAX_HANDS = 4;

// Pose landmark indices per arm side.
const ARM = {
  L: { elbow: 13, wrist: 15, pinky: 17, index: 19 },
  R: { elbow: 14, wrist: 16, pinky: 18, index: 20 },
};
const PALM = [0, 5, 9, 13, 17]; // hand-model landmarks around the palm

// Square crop (in camera pixels) around each visible hand, from pose landmarks.
export function handRois(detections, vw, vh) {
  const rois = [];
  detections.forEach((det, player) => {
    for (const side of ['L', 'R']) {
      const a = ARM[side];
      const lm = det.landmarks;
      const wrist = lm?.[a.wrist];
      if (!wrist || (wrist.visibility ?? 1) < 0.3) continue;
      const tip = lm[a.index] ?? wrist;
      const elbow = lm[a.elbow];
      const cx = (wrist.x + (tip.x - wrist.x) * 0.5) * vw;
      const cy = (wrist.y + (tip.y - wrist.y) * 0.5) * vh;
      const forearm = elbow ? Math.hypot((wrist.x - elbow.x) * vw, (wrist.y - elbow.y) * vh) : 0;
      const size = Math.max(48, forearm * 1.6, 0.12 * Math.min(vw, vh));
      rois.push({ player, side, x: cx - size / 2, y: cy - size / 2, size });
    }
  });
  return rois.slice(0, MAX_HANDS);
}

// Maps a point in mosaic-normalized coords back to camera-normalized coords.
// q forces the quadrant (a hand's fingers can spill past its cell's edge).
export function mosaicToCam(p, rois, vw, vh, q = (p.x >= 0.5 ? 1 : 0) + (p.y >= 0.5 ? 2 : 0)) {
  const r = rois[q];
  if (!r) return null;
  const lx = (p.x - (q % 2) * 0.5) * 2;
  const ly = (p.y - Math.floor(q / 2) * 0.5) * 2;
  return { q, x: (r.x + lx * r.size) / vw, y: (r.y + ly * r.size) / vh };
}

export async function createHandTracker() {
  const { mod, fileset } = await loadVision();
  const { task, delegate } = await createWithFallback((d) =>
    mod.GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: d },
      runningMode: 'VIDEO',
      numHands: MAX_HANDS,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }));

  const mosaic = document.createElement('canvas');
  mosaic.width = mosaic.height = CELL * 2;
  const ctx = mosaic.getContext('2d');
  let lastTs = 0;

  return {
    name: `hands-${delegate}`,
    mosaic,

    // Returns hand observations in camera space:
    // [{ u, v, gesture, score, landmarks: [{x, y}] }]
    detect(video, detections) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const rois = handRois(detections, vw, vh);
      if (rois.length === 0) return [];

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, mosaic.width, mosaic.height);
      rois.forEach((r, q) => {
        ctx.drawImage(video, r.x, r.y, r.size, r.size, (q % 2) * CELL, Math.floor(q / 2) * CELL, CELL, CELL);
      });

      const ts = Math.max(lastTs + 1, performance.now());
      lastTs = ts;
      const res = task.recognizeForVideo(mosaic, ts);

      const out = [];
      res.landmarks.forEach((lms, k) => {
        const palm = PALM.reduce((s, i) => ({ x: s.x + lms[i].x / PALM.length, y: s.y + lms[i].y / PALM.length }), { x: 0, y: 0 });
        const center = mosaicToCam(palm, rois, vw, vh);
        if (!center) return;
        const g = res.gestures[k]?.[0];
        out.push({
          u: center.x,
          v: center.y,
          gesture: g?.categoryName || 'None',
          score: g?.score ?? 0,
          landmarks: lms.map((p) => mosaicToCam(p, rois, vw, vh, center.q)),
        });
      });
      return out;
    },
  };
}
