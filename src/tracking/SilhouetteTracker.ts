import { ImageSegmenter, type FilesetResolver } from "@mediapipe/tasks-vision";
import type { SilhouetteMask } from "./types";
import { INVERT_MASK, MIRROR, SELFIE_SEGMENTER_MODEL } from "./config";

type Vision = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/**
 * Turns a webcam frame into a soft person mask using MediaPipe's selfie
 * segmenter. The output is an offscreen canvas whose ALPHA channel encodes how
 * "person" each pixel is — perfect for drawing as a shadow on the wall.
 */
export class SilhouetteTracker {
  private segmenter: ImageSegmenter | null = null;

  // Reused buffers so we don't allocate a mask canvas every frame.
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private result: SilhouetteMask | null = null;

  async init(vision: Vision): Promise<void> {
    this.segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: SELFIE_SEGMENTER_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  process(video: HTMLVideoElement, timestamp: number): SilhouetteMask | null {
    if (!this.segmenter) return this.result;

    const out = this.segmenter.segmentForVideo(video, timestamp);
    const mask = out.confidenceMasks?.[0];
    if (!mask) {
      out.close();
      return this.result;
    }

    const w = mask.width;
    const h = mask.height;
    const conf = mask.getAsFloat32Array();
    this.ensureBuffers(w, h);

    const pixels = this.imageData!.data;
    for (let y = 0; y < h; y++) {
      // Mirror by reading the row right-to-left when MIRROR is on.
      const srcRow = y * w;
      for (let x = 0; x < w; x++) {
        const src = srcRow + (MIRROR ? w - 1 - x : x);
        let a = conf[src];
        if (INVERT_MASK) a = 1 - a;
        const di = (srcRow + x) * 4;
        pixels[di] = 0;
        pixels[di + 1] = 0;
        pixels[di + 2] = 0;
        pixels[di + 3] = (a * 255) | 0;
      }
    }

    this.maskCtx!.putImageData(this.imageData!, 0, 0);
    out.close();

    this.result = { width: w, height: h, canvas: this.maskCanvas! };
    return this.result;
  }

  private ensureBuffers(w: number, h: number): void {
    if (this.maskCanvas && this.maskCanvas.width === w && this.maskCanvas.height === h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("mask canvas context unavailable");
    this.maskCanvas = canvas;
    this.maskCtx = ctx;
    this.imageData = ctx.createImageData(w, h);
  }
}
