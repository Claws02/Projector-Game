import type { Vec2 } from "../tracking/types";

/**
 * The projection surface. Owns the full-screen canvas, handles DPI/resize, and
 * is the single place that maps normalized presence coordinates (0..1) to
 * device pixels. Swapping to a different surface geometry later means changing
 * only this mapping — experiences are untouched.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  /** Logical size in CSS pixels (what experiences draw against). */
  width = 0;
  height = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Map a normalized point (0..1) to surface pixels. */
  toPixels(n: Vec2): Vec2 {
    return { x: n.x * this.width, y: n.y * this.height };
  }

  px(nx: number): number {
    // Convenience for scaling a normalized length by the shorter axis so things
    // feel the same regardless of aspect ratio.
    return nx * Math.min(this.width, this.height);
  }
}
