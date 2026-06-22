import { PoseLandmarker, type FilesetResolver } from "@mediapipe/tasks-vision";
import type { Vec2 } from "./types";
import { MAX_BODIES, MIRROR, POSE_LANDMARKER_MODEL } from "./config";

type Vision = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/** A raw pose detection for one person, before id/motion tracking is applied. */
export interface RawPose {
  centroid: Vec2;
  hands: Vec2[];
  landmarks: Vec2[];
}

// BlazePose 33-landmark indices we care about.
const WRIST_LEFT = 15;
const WRIST_RIGHT = 16;
const TORSO = [11, 12, 23, 24]; // shoulders + hips

/** Detects people's skeletons so creatures can attach to hands and read motion. */
export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;

  async init(vision: Vision): Promise<void> {
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: MAX_BODIES,
    });
  }

  process(video: HTMLVideoElement, timestamp: number): RawPose[] {
    if (!this.landmarker) return [];
    const result = this.landmarker.detectForVideo(video, timestamp);

    return result.landmarks.map((pose) => {
      const landmarks: Vec2[] = pose.map((p) => ({
        x: MIRROR ? 1 - p.x : p.x,
        y: p.y,
      }));

      let cx = 0;
      let cy = 0;
      for (const i of TORSO) {
        cx += landmarks[i].x;
        cy += landmarks[i].y;
      }
      const centroid: Vec2 = { x: cx / TORSO.length, y: cy / TORSO.length };

      const hands = [landmarks[WRIST_LEFT], landmarks[WRIST_RIGHT]].filter(Boolean);

      return { centroid, hands, landmarks };
    });
  }
}
