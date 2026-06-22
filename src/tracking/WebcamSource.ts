/**
 * Owns the hidden <video> element and the webcam stream. Tracking models read
 * frames directly from `.video`. Players never see this — they only see the
 * projected surface.
 */
export class WebcamSource {
  readonly video: HTMLVideoElement;
  private streaming = false;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.streaming = true;
  }

  /** True once the video has real pixels to read. */
  get ready(): boolean {
    return this.streaming && this.video.readyState >= 2 && this.video.videoWidth > 0;
  }
}
