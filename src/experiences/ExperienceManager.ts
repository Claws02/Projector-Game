import type { Stage } from "../platform/Stage";
import type { PresenceFrame } from "../tracking/types";
import type { Experience } from "./Experience";

/**
 * Holds the library of Living Stories and runs the active one. Switching is
 * deliberately operator-only (number keys) — players never see a menu. Designed
 * so new experiences are a one-line registration.
 */
export class ExperienceManager {
  private experiences: Experience[];
  private activeIndex = 0;
  private elapsed = 0;

  constructor(private stage: Stage, experiences: Experience[]) {
    if (experiences.length === 0) throw new Error("Need at least one experience");
    this.experiences = experiences;
    this.experiences[0].enter(stage);
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  get active(): Experience {
    return this.experiences[this.activeIndex];
  }

  render(presence: PresenceFrame, dt: number): void {
    this.elapsed += dt;
    this.active.render({ stage: this.stage, presence, dt, time: this.elapsed });
  }

  switchTo(index: number): void {
    if (index < 0 || index >= this.experiences.length || index === this.activeIndex) return;
    this.active.exit();
    this.activeIndex = index;
    this.elapsed = 0;
    this.active.enter(this.stage);
  }

  private onKey(e: KeyboardEvent): void {
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1) this.switchTo(n - 1);
  }
}
