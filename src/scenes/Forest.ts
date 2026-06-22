import type { Stage } from "../platform/Stage";
import type { PresenceFrame } from "../tracking/types";
import { clamp, mulberry32 } from "../platform/util";

interface Tree {
  x: number; // normalized
  height: number; // normalized
  width: number;
  shade: number; // depth tint 0 (near) .. 1 (far)
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
}

/**
 * The magical forest the wall shows at rest. This is the first thing a child
 * sees — calm, alive, and inviting. It is a reusable background so multiple
 * experiences (Shadow Creatures, and future stories) share the same world.
 *
 * It reacts subtly even before anyone "plays": fireflies drift toward people.
 */
export class Forest {
  private trees: Tree[] = [];
  private fireflies: Firefly[] = [];
  private built = false;

  build(seed = 1337): void {
    const rng = mulberry32(seed);

    this.trees = [];
    // Three depth layers of trees for a sense of a deep forest.
    const layers = [
      { count: 7, shade: 0.85, minH: 0.45, maxH: 0.7 },
      { count: 6, shade: 0.55, minH: 0.6, maxH: 0.85 },
      { count: 5, shade: 0.25, minH: 0.75, maxH: 1.05 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        this.trees.push({
          x: rng(),
          height: layer.minH + rng() * (layer.maxH - layer.minH),
          width: 0.04 + rng() * 0.05,
          shade: layer.shade,
        });
      }
    }
    this.trees.sort((a, b) => b.shade - a.shade); // far first

    this.fireflies = [];
    for (let i = 0; i < 60; i++) {
      this.fireflies.push({
        x: rng(),
        y: 0.2 + rng() * 0.7,
        vx: 0,
        vy: 0,
        phase: rng() * Math.PI * 2,
        speed: 0.4 + rng() * 0.8,
      });
    }
    this.built = true;
  }

  renderBackground(stage: Stage, time: number): void {
    if (!this.built) this.build();
    const { ctx, width, height } = stage;

    // Dusk sky — purples into deep teal, with a soft moon glow.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0a0f23");
    sky.addColorStop(0.45, "#13213f");
    sky.addColorStop(0.8, "#13322f");
    sky.addColorStop(1, "#0a1a17");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const moonX = width * 0.78;
    const moonY = height * 0.22;
    const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, height * 0.5);
    glow.addColorStop(0, "rgba(150,210,190,0.22)");
    glow.addColorStop(1, "rgba(150,210,190,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(moonX, moonY, height * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(220,240,225,0.9)";
    ctx.fill();

    // Trees as soft silhouettes, far (lighter) to near (darker).
    for (const tree of this.trees) {
      this.drawTree(stage, tree, time);
    }

    // Ground fog band.
    const fog = ctx.createLinearGradient(0, height * 0.7, 0, height);
    fog.addColorStop(0, "rgba(120,180,160,0)");
    fog.addColorStop(1, "rgba(120,180,160,0.12)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
  }

  private drawTree(stage: Stage, tree: Tree, time: number): void {
    const { ctx, width, height } = stage;
    const x = tree.x * width;
    const baseY = height * 1.02;
    const topY = baseY - tree.height * height;
    const sway = Math.sin(time * 0.6 + tree.x * 10) * (1 - tree.shade) * 6;
    const w = tree.width * width;

    // Tint trees by depth: far trees lift toward the sky color.
    const dark = Math.round(8 + tree.shade * 6);
    const g = Math.round(18 + tree.shade * 22);
    ctx.fillStyle = `rgb(${dark}, ${g}, ${Math.round(g * 0.9)})`;

    // Simple conifer: stacked triangles.
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const tierTop = topY + (tree.height * height) * (t / tiers) * 0.9;
      const tierW = w * (0.5 + (t / tiers) * 0.7);
      const tierH = (tree.height * height) / tiers + (tree.height * height) * 0.12;
      ctx.beginPath();
      ctx.moveTo(x + sway, tierTop);
      ctx.lineTo(x - tierW + sway * 0.5, tierTop + tierH);
      ctx.lineTo(x + tierW + sway * 0.5, tierTop + tierH);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Fireflies drift gently and are drawn toward people who are present. */
  renderFireflies(stage: Stage, presence: PresenceFrame, dt: number, time: number): void {
    const { ctx, width, height } = stage;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const f of this.fireflies) {
      // Wander.
      f.phase += dt * f.speed;
      f.vx += (Math.cos(f.phase * 1.3) * 0.02 - f.vx) * dt;
      f.vy += (Math.sin(f.phase) * 0.02 - f.vy) * dt;

      // Attract toward nearest person, gently.
      let nearest = null as null | { x: number; y: number };
      let nd = 0.3;
      for (const b of presence.bodies) {
        const d = Math.hypot(b.centroid.x - f.x, b.centroid.y - f.y);
        if (d < nd) {
          nd = d;
          nearest = b.centroid;
        }
      }
      if (nearest) {
        f.vx += (nearest.x - f.x) * 0.6 * dt;
        f.vy += (nearest.y - f.y) * 0.6 * dt;
      }

      f.x = clamp(f.x + f.vx * dt, 0, 1);
      f.y = clamp(f.y + f.vy * dt, 0.1, 0.95);

      const flicker = 0.5 + 0.5 * Math.sin(time * 3 + f.phase * 4);
      const r = (1.5 + flicker * 2.5) * (stage.px(0.004) / 2 + 1);
      const px = f.x * width;
      const py = f.y * height;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
      grad.addColorStop(0, `rgba(190,255,180,${0.5 + flicker * 0.4})`);
      grad.addColorStop(1, "rgba(190,255,180,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
