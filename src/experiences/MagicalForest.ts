import type { Experience, SceneContext } from "./Experience";
import type { Stage } from "../platform/Stage";
import { Forest } from "../scenes/Forest";

/**
 * EXPERIENCE: Magical Forest (gentle / attract mode)
 *
 * The pure forest. Where you stand, the world brightens and warms — a soft aura
 * of life follows each person, and where you raise a hand, blossoms of light
 * bloom. Calmer than Shadow Creatures; good as an idle/lobby state.
 */
export class MagicalForest implements Experience {
  readonly name = "Magical Forest";
  private forest = new Forest();

  enter(_stage: Stage): void {
    this.forest.build(7);
  }

  exit(): void {}

  render({ stage, presence, dt, time }: SceneContext): void {
    const { ctx } = stage;
    this.forest.renderBackground(stage, time);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const body of presence.bodies) {
      // Aura of life around each person.
      const c = stage.toPixels(body.centroid);
      const r = stage.px(0.22);
      const aura = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      aura.addColorStop(0, "rgba(120,230,170,0.16)");
      aura.addColorStop(1, "rgba(120,230,170,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);

      // Blossoms of light at the hands.
      for (const hand of body.hands) {
        const h = stage.toPixels(hand);
        const br = stage.px(0.05) * (0.7 + 0.3 * Math.sin(time * 4 + hand.x * 20));
        const bloom = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, br);
        bloom.addColorStop(0, "rgba(255,225,150,0.5)");
        bloom.addColorStop(1, "rgba(255,225,150,0)");
        ctx.fillStyle = bloom;
        ctx.fillRect(h.x - br, h.y - br, br * 2, br * 2);
      }
    }
    ctx.restore();

    this.forest.renderFireflies(stage, presence, dt, time);
  }
}
