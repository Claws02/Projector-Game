// Surface-agnostic presence model.
//
// Everything tracking produces is expressed in NORMALIZED coordinates (0..1)
// across the active surface. This is deliberate: today the surface is one wall
// driven by one projector, but tomorrow it may be a floor, two walls, or a full
// room. Experiences only ever see normalized presence, so the same story runs
// on any surface — the Stage is solely responsible for mapping 0..1 to pixels.

export interface Vec2 {
  x: number;
  y: number;
}

/** A tracked person on the surface. */
export interface Body {
  /** Stable-ish id maintained frame to frame so experiences can remember people. */
  id: number;
  /** Center of mass, normalized. */
  centroid: Vec2;
  /** Wrist/hand anchor points, normalized. Usually length 2. */
  hands: Vec2[];
  /** Full pose landmarks, normalized. May be empty if only a silhouette is known. */
  landmarks: Vec2[];
  /** Recent movement energy, 0 (still) .. 1 (waving wildly). */
  motion: number;
  /** Seconds this body has been continuously present. */
  age: number;
}

/** Soft person mask, alpha-encoded, ready to be drawn as a shadow. */
export interface SilhouetteMask {
  width: number;
  height: number;
  /** Offscreen canvas whose alpha channel is the person coverage (already mirrored). */
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

/** One frame of "who is on the surface and what are they doing." */
export interface PresenceFrame {
  bodies: Body[];
  silhouette: SilhouetteMask | null;
  timestamp: number;
}

export const EMPTY_FRAME: PresenceFrame = {
  bodies: [],
  silhouette: null,
  timestamp: 0,
};

/**
 * A source of presence data. Webcam + MediaPipe is the v1 implementation, but a
 * depth camera (RealSense / Azure Kinect) source would implement this same
 * interface and drop straight in without touching any experience.
 */
export interface TrackingSource {
  init(): Promise<void>;
  /** Run inference for this frame and return current presence. Cheap if already ready. */
  update(timestamp: number): PresenceFrame;
  readonly ready: boolean;
}
