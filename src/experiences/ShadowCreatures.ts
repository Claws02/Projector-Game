import type { Experience, SceneContext } from "./Experience";
import type { Stage } from "../platform/Stage";
import type { Body } from "../tracking/types";
import { Forest } from "../scenes/Forest";
import { ShadowCreature } from "../scenes/ShadowCreature";

/**
 * EXPERIENCE: Shadow Creatures
 *
 * The wall shows a sleeping magical forest. When you step in, your shadow falls
 * across it. Move a little and your shadow comes alive — a creature steps out of
 * it and starts to follow you. No buttons, no instructions: you wave, it reacts.
 *
 * At rest (nobody present) this is simply the magical forest — which is exactly
 * the opening scene a child should walk up to.
 */
export class ShadowCreatures implements Experience {
  readonly name = "Shadow Creatures";

  private forest = new Forest();
  private creatures = new Map<number, ShadowCreature>();

  enter(_stage: Stage): void {
    this.forest.build(2024);
    this.creatures.clear();
  }

  exit(): void {
    this.creatures.clear();
  }

  render({ stage, presence, dt, time }: SceneContext): void {
    this.forest.renderBackground(stage, time);
    this.drawShadows(stage, presence.silhouette);
    this.updateCreatures(stage, presence.bodies, dt, time);
    this.forest.renderFireflies(stage, presence, dt, time);
  }

  /** Paint each person's silhouette as a luminous-edged shadow on the forest. */
  private drawShadows(stage: Stage, silhouette: SceneContext["presence"]["silhouette"]): void {
    if (!silhouette) return;
    const { ctx, width, height } = stage;

    ctx.save();
    // Glowing rim pass.
    ctx.shadowColor = "rgba(120,240,200,0.6)";
    ctx.shadowBlur = stage.px(0.03);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(silhouette.canvas, 0, 0, width, height);
    // Deepen the body so it reads as a true shadow.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(silhouette.canvas, 0, 0, width, height);
    ctx.restore();
  }

  private updateCreatures(stage: Stage, bodies: Body[], dt: number, time: number): void {
    const present = new Set<number>();

    for (const body of bodies) {
      present.add(body.id);

      // A shadow comes alive once a person has settled in and shown some life.
      if (!this.creatures.has(body.id) && body.age > 2 && body.motion > 0.1) {
        const hand = this.pickHand(body);
        const p = stage.toPixels(hand);
        this.creatures.set(body.id, new ShadowCreature(body.id, p.x, p.y, stage.px(0.11)));
      }

      const creature = this.creatures.get(body.id);
      if (creature) {
        const hand = this.pickHand(body);
        creature.update(dt, time, stage.toPixels(hand), body.motion, stage);
      }
    }

    // People who left: let their creature wander off and fade.
    for (const [id, creature] of this.creatures) {
      if (!present.has(id)) {
        creature.alive = false;
        creature.update(dt, time, null, 0, stage);
        if (creature.alpha <= 0.01) {
          this.creatures.delete(id);
          continue;
        }
      }
      creature.render(stage);
    }
  }

  /** Prefer the higher (more raised/active) hand to anchor the creature. */
  private pickHand(body: Body) {
    if (body.hands.length === 0) return body.centroid;
    return body.hands.reduce((a, b) => (b.y < a.y ? b : a));
  }
}
