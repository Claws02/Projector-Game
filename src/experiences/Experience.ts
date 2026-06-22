import type { Stage } from "../platform/Stage";
import type { PresenceFrame } from "../tracking/types";

/** Everything an experience needs to think and draw for one frame. */
export interface SceneContext {
  stage: Stage;
  presence: PresenceFrame;
  /** Seconds since last frame (clamped). */
  dt: number;
  /** Seconds since this experience was entered. */
  time: number;
}

/**
 * A "Living Story". Experiences are intentionally simple: they receive presence
 * and a canvas, and they react. No menus, no score, no win state — the design
 * rule is that a 4-year-old and a 70-year-old both understand it in 5 seconds.
 */
export interface Experience {
  readonly name: string;
  enter(stage: Stage): void;
  exit(): void;
  render(ctx: SceneContext): void;
}
