import type { Stage } from "../platform/Stage";
import { approach } from "../platform/util";

export type CreatureType = "critter" | "dino" | "wizard";

const TYPES: CreatureType[] = ["critter", "dino", "wizard"];

/**
 * A shadow that has come alive. It detaches from a person's silhouette, then
 * circles and mimics them — the "the room reacts to me / changes because of me"
 * moment. Rendered as a dark silhouette with a luminous edge and glowing eyes.
 */
export class ShadowCreature {
  readonly bodyId: number;
  readonly type: CreatureType;

  x: number;
  y: number;
  private vx = 0;
  private vy = 0;
  private size: number;
  private facing = 1;
  private legPhase = 0;
  private orbit: number;
  private orbitSpeed: number;
  private seed: number;

  alpha = 0;
  alive = true;

  constructor(bodyId: number, x: number, y: number, size: number) {
    this.bodyId = bodyId;
    this.type = TYPES[bodyId % TYPES.length];
    this.x = x;
    this.y = y;
    this.size = size;
    this.orbit = Math.random() * Math.PI * 2;
    this.orbitSpeed = 0.6 + Math.random() * 0.5;
    this.seed = Math.random() * 1000;
  }

  /** `target` is the person's hand in pixels, or null when they've left. */
  update(dt: number, time: number, target: { x: number; y: number } | null, motion: number, stage: Stage): void {
    this.alpha = approach(this.alpha, this.alive ? 1 : 0, this.alive ? 2.5 : 1.8, dt);

    if (target) {
      // Playfully circle the person's hand.
      this.orbit += dt * this.orbitSpeed;
      const radius = stage.px(0.13);
      const desiredX = target.x + Math.cos(this.orbit) * radius;
      const desiredY = target.y + Math.sin(this.orbit) * radius * 0.7;
      const rate = 2.5 + motion * 4;
      this.vx = (desiredX - this.x) * rate;
      this.vy = (desiredY - this.y) * rate;
    } else {
      // Orphaned: wander and slowly settle.
      this.vx += (Math.cos(time * 0.7 + this.seed) * 40 - this.vx) * dt;
      this.vy += (Math.sin(time * 0.9 + this.seed) * 30 - this.vy) * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const speed = Math.hypot(this.vx, this.vy);
    this.legPhase += speed * dt * 0.05;
    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
  }

  render(stage: Stage): void {
    if (this.alpha <= 0.01) return;
    const { ctx } = stage;
    const s = this.size;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing, 1);
    ctx.globalAlpha = this.alpha;

    // Luminous shadow edge.
    ctx.shadowColor = "rgba(130,245,205,0.8)";
    ctx.shadowBlur = stage.px(0.02);
    ctx.fillStyle = "rgba(4, 12, 14, 0.92)";

    const bob = Math.sin(this.legPhase * 6) * s * 0.05;
    ctx.translate(0, bob);

    switch (this.type) {
      case "critter":
        this.drawCritter(ctx, s);
        break;
      case "dino":
        this.drawDino(ctx, s);
        break;
      case "wizard":
        this.drawWizard(ctx, s);
        break;
    }

    // Glowing eyes (drawn without the shape shadow).
    ctx.shadowBlur = stage.px(0.012);
    ctx.shadowColor = "rgba(180,255,220,0.95)";
    ctx.fillStyle = "rgba(210,255,235,0.95)";
    this.drawEyes(ctx, s);

    ctx.restore();
  }

  private drawCritter(ctx: CanvasRenderingContext2D, s: number): void {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // ears
    for (const dx of [-0.28, 0.28]) {
      ctx.beginPath();
      ctx.ellipse(s * dx, -s * 0.5, s * 0.16, s * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // tail
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.2, s * 0.22, s * 0.12, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDino(ctx: CanvasRenderingContext2D, s: number): void {
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.55, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // neck + head
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.7, -s * 0.6, -s * 0.55, -s * 0.85);
    ctx.lineTo(-s * 0.35, -s * 0.8);
    ctx.quadraticCurveTo(-s * 0.45, -s * 0.5, -s * 0.05, -s * 0.1);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(s * 0.4, s * 0.0);
    ctx.quadraticCurveTo(s * 0.95, s * 0.0, s * 0.85, s * 0.35);
    ctx.lineTo(s * 0.4, s * 0.25);
    ctx.fill();
    // back spikes
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(s * i * 0.18, -s * 0.28);
      ctx.lineTo(s * i * 0.18 - s * 0.06, -s * 0.48);
      ctx.lineTo(s * i * 0.18 + s * 0.06, -s * 0.48);
      ctx.fill();
    }
  }

  private drawWizard(ctx: CanvasRenderingContext2D, s: number): void {
    // robe
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.2);
    ctx.lineTo(-s * 0.45, s * 0.6);
    ctx.lineTo(s * 0.45, s * 0.6);
    ctx.closePath();
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(0, -s * 0.3, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // tall pointed hat
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, -s * 0.45);
    ctx.lineTo(s * 0.05, -s * 1.05);
    ctx.lineTo(s * 0.28, -s * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  private drawEyes(ctx: CanvasRenderingContext2D, s: number): void {
    const ey = this.type === "wizard" ? -s * 0.3 : this.type === "dino" ? -s * 0.78 : -s * 0.08;
    const ex = this.type === "dino" ? -s * 0.45 : s * 0.12;
    for (const sign of this.type === "dino" ? [1] : [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ex + sign * s * 0.1, ey, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
