import { Stage } from "./platform/Stage";
import { clamp } from "./platform/util";
import { WebcamTrackingSource } from "./tracking/WebcamTrackingSource";
import { EMPTY_FRAME, type TrackingSource } from "./tracking/types";
import { ExperienceManager } from "./experiences/ExperienceManager";
import { ShadowCreatures } from "./experiences/ShadowCreatures";
import { MagicalForest } from "./experiences/MagicalForest";

/**
 * Wires the platform together and runs the frame loop:
 *   webcam -> presence -> active experience -> projector surface
 *
 * The forest renders immediately; tracking models load in the background, so the
 * wall is alive within a second and shadows/creatures join as soon as the models
 * are ready.
 */
export class App {
  private stage: Stage;
  private tracking: TrackingSource;
  private manager: ExperienceManager;
  private lastTs = 0;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.stage = new Stage(canvas);
    this.tracking = new WebcamTrackingSource(video);
    // Experience 1 (default) = Shadow Creatures; 2 = Magical Forest. Operator
    // switches with number keys.
    this.manager = new ExperienceManager(this.stage, [
      new ShadowCreatures(),
      new MagicalForest(),
    ]);
  }

  async start(): Promise<void> {
    // Begin rendering right away (forest appears), load tracking in parallel.
    requestAnimationFrame((t) => this.loop(t));
    try {
      await this.tracking.init();
    } catch (err) {
      console.error("Tracking failed to start:", err);
    }
  }

  private loop(ts: number): void {
    const dt = this.lastTs ? clamp((ts - this.lastTs) / 1000, 0, 0.1) : 0;
    this.lastTs = ts;

    const presence = this.tracking.ready ? this.tracking.update(ts) : EMPTY_FRAME;
    this.manager.render(presence, dt);

    requestAnimationFrame((t) => this.loop(t));
  }
}
