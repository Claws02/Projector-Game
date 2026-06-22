import { FilesetResolver } from "@mediapipe/tasks-vision";
import { WebcamSource } from "./WebcamSource";
import { SilhouetteTracker } from "./SilhouetteTracker";
import { PoseTracker, type RawPose } from "./PoseTracker";
import { EMPTY_FRAME, type Body, type PresenceFrame, type TrackingSource } from "./types";
import { WASM_URL } from "./config";
import { clamp, dist } from "../platform/util";

interface TrackedBody {
  id: number;
  centroid: { x: number; y: number };
  motion: number;
  age: number;
  prevLandmarks: { x: number; y: number }[];
  lastSeen: number;
}

/**
 * The v1 presence source: webcam + MediaPipe segmentation + pose. Implements the
 * generic TrackingSource interface, so a depth-camera source can replace it
 * later without any experience knowing the difference. This layer adds the two
 * things raw detections lack: stable ids across frames and per-body motion
 * energy.
 */
export class WebcamTrackingSource implements TrackingSource {
  ready = false;

  private webcam: WebcamSource;
  private silhouette = new SilhouetteTracker();
  private pose = new PoseTracker();

  private tracked: TrackedBody[] = [];
  private nextId = 1;
  private lastTime = 0;

  constructor(video: HTMLVideoElement) {
    this.webcam = new WebcamSource(video);
  }

  async init(): Promise<void> {
    await this.webcam.start();
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    await Promise.all([this.silhouette.init(vision), this.pose.init(vision)]);
    this.ready = true;
  }

  update(timestamp: number): PresenceFrame {
    if (!this.ready || !this.webcam.ready) return EMPTY_FRAME;

    const dt = this.lastTime ? clamp((timestamp - this.lastTime) / 1000, 0, 0.1) : 0;
    this.lastTime = timestamp;

    const mask = this.silhouette.process(this.webcam.video, timestamp);
    const poses = this.pose.process(this.webcam.video, timestamp);
    const bodies = this.trackBodies(poses, dt, timestamp);

    return { bodies, silhouette: mask, timestamp };
  }

  /** Greedy nearest-centroid matching to keep ids stable + compute motion. */
  private trackBodies(poses: RawPose[], dt: number, now: number): Body[] {
    const unmatched = new Set(this.tracked);
    const result: Body[] = [];

    for (const pose of poses) {
      // Find the closest existing track within a reasonable radius.
      let best: TrackedBody | null = null;
      let bestD = 0.2;
      for (const t of unmatched) {
        const d = dist(t.centroid.x, t.centroid.y, pose.centroid.x, pose.centroid.y);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }

      let track = best;
      if (track) {
        unmatched.delete(track);
        track.age += dt;
      } else {
        track = {
          id: this.nextId++,
          centroid: { ...pose.centroid },
          motion: 0,
          age: 0,
          prevLandmarks: [],
          lastSeen: now,
        };
        this.tracked.push(track);
      }

      // Motion energy: average landmark displacement since last frame.
      let moved = 0;
      if (track.prevLandmarks.length === pose.landmarks.length && dt > 0) {
        for (let i = 0; i < pose.landmarks.length; i++) {
          moved += dist(
            track.prevLandmarks[i].x,
            track.prevLandmarks[i].y,
            pose.landmarks[i].x,
            pose.landmarks[i].y
          );
        }
        moved /= pose.landmarks.length;
      }
      // Scale displacement-per-second into a friendly 0..1 and smooth it.
      const instant = clamp((moved / Math.max(dt, 0.001)) * 1.5, 0, 1);
      track.motion = track.motion * 0.8 + instant * 0.2;
      track.centroid = { ...pose.centroid };
      track.prevLandmarks = pose.landmarks;
      track.lastSeen = now;

      result.push({
        id: track.id,
        centroid: pose.centroid,
        hands: pose.hands,
        landmarks: pose.landmarks,
        motion: track.motion,
        age: track.age,
      });
    }

    // Retire tracks that have been gone for a moment.
    this.tracked = this.tracked.filter((t) => now - t.lastSeen < 800);
    return result;
  }
}
