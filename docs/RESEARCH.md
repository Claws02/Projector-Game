# Projector-Game: Open-Source Landscape & Build Notes

_Status: research draft, 2026-10-23. Repo state at time of writing: README only (no code yet)._

## TL;DR

- **The projector-camera niche itself has no 1k+ star repos.** The established procam toolkits
  (Microsoft RoomAlive ~712★, YCAM ProCamToolkit, ofxCamaraLucida) are under 1k and mostly
  unmaintained since ~2016–2022. Every repo above 1k★ that helps us is a general building block
  (vision, game engine, physics, audio).
- **The #1 technical risk is the light feedback loop:** the camera sees the projected game on the
  same surface it is trying to track people on. That choice drives the hardware choice
  (see "Sensing options" below).
- **The #2 risk is end-to-end latency** (camera exposure + inference + render + projector input lag,
  realistically 80–150 ms). Game mechanics must tolerate it: big targets, area hits,
  forgiving timing windows. No twitch mechanics.

## Decisions so far

- **Camera budget: $30 max.** That means a plain RGB webcam (e.g. Logitech C270/C310 class).
  A DIY IR mod fits inside the budget only if the webcam's IR-cut filter can be removed by hand.
- **Stack: browser (JS/TS).** MediaPipe Tasks (WASM) for tracking, OpenCV.js for calibration,
  Phaser or Pixi for rendering. Reasons: a $30 webcam has nothing that needs native drivers,
  it runs on one laptop with Chrome, iteration is fastest, and it's easy to share.
- Surface, concept, and audience are open. See the question list in the session.

## Building blocks (>1k★)

Star counts are approximate (rounded, from mid-2026 knowledge plus web snippets). This session's
GitHub access is scoped to `claws02/projector-game` only, so live counts could not be pulled.
**Verify before relying on them.**

### Vision / tracking

| Repo | ~Stars | Use in this project |
|---|---|---|
| [opencv/opencv](https://github.com/opencv/opencv) | 80k+ | Homography (camera→projector mapping), calibration, ArUco/ChArUco, background subtraction, blob tracking. Non-negotiable foundation. |
| [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) | 30k+ | Hand / pose / face landmarks on CPU, runs in-browser (WASM) and in Python. Best fit for "body as controller". |
| [ultralytics/ultralytics](https://github.com/ultralytics/ultralytics) | 40k+ | YOLO detection/pose/segmentation. Use if tracking props (balls, bean bags) or many people. Note **AGPL-3.0**. |
| [roboflow/supervision](https://github.com/roboflow/supervision) | 35k+ | Glue: zones, line-crossing, tracking, annotation. Good for "did a player enter this region" logic. |
| [CMU-Perceptual-Computing-Lab/openpose](https://github.com/CMU-Perceptual-Computing-Lab/openpose) | 30k+ | Multi-person pose. Historically important, heavy, non-commercial license. MediaPipe/YOLO-pose supersede it for us. |
| [tensorflow/tfjs-models](https://github.com/tensorflow/tfjs-models) | 14k | MoveNet / BlazePose in the browser. Alternative to MediaPipe for a web build. |
| [kornia/kornia](https://github.com/kornia/kornia) | 10k | Differentiable CV on GPU (PyTorch). Only if we go deep on warping/calibration. |
| [ifzhang/ByteTrack](https://github.com/ifzhang/ByteTrack) | 5k+ | Multi-object ID tracking (who is player 1 vs 2 across frames). |
| [tryolabs/norfair](https://github.com/tryolabs/norfair) | 2k+ | Lightweight tracker, easier to drop in than ByteTrack. |
| [AprilRobotics/apriltag](https://github.com/AprilRobotics/apriltag) | 1.5k+ | Fiducial markers. Robust auto-calibration and tagged physical game pieces. |
| [victordibia/handtrack.js](https://github.com/victordibia/handtrack.js) | 2.5k+ | Simple hand boxes in browser. Mostly superseded by MediaPipe. |

### Depth / special cameras

| Repo | ~Stars | Use |
|---|---|---|
| [IntelRealSense/librealsense](https://github.com/IntelRealSense/librealsense) | 7k+ | RealSense D4xx depth. Clean "touch the wall/floor" detection via a depth threshold, and it is immune to projected light. |
| [OpenKinect/libfreenect](https://github.com/OpenKinect/libfreenect) | 3.5k | Kinect v1 driver. Cheap used hardware (libfreenect2 for v2). |

### Game engines / rendering

| Repo | ~Stars | Fit |
|---|---|---|
| [phaserjs/phaser](https://github.com/phaserjs/phaser) | 37k+ | 2D browser game framework. Fastest path to a polished 2D projector game. |
| [pixijs/pixijs](https://github.com/pixijs/pixijs) | 40k+ | 2D WebGL renderer. More control, less "game framework". |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | 100k+ | 3D/shaders in browser. Good for visual effects (particles, water, fluid). |
| [processing/p5.js](https://github.com/processing/p5.js) | 20k+ | Fast creative-coding prototypes. Weaker for a full game. |
| [godotengine/godot](https://github.com/godotengine/godot) | 90k+ | Full engine. Best native option if this grows into a real product. Camera/CV would run as a sidecar process. |
| [raysan5/raylib](https://github.com/raysan5/raylib) | 25k+ | Minimal C engine, links OpenCV directly, lowest latency. |
| [pygame/pygame](https://github.com/pygame/pygame) | 7k+ | Simplest Python path (same process as OpenCV). Limited visual polish. |
| [openframeworks/openFrameworks](https://github.com/openframeworks/openFrameworks) | 10k | C++ creative coding. The procam community's historical home (ofxCv, ProCamToolkit). |
| [bevyengine/bevy](https://github.com/bevyengine/bevy) | 35k+ | Rust ECS engine. Strong, but a steep curve for this project. |

### Physics, audio, multiplayer

| Repo | ~Stars | Use |
|---|---|---|
| [liabru/matter-js](https://github.com/liabru/matter-js) | 16k+ | 2D physics for JS (balls bouncing off silhouettes). |
| [erincatto/box2d](https://github.com/erincatto/box2d) | 8k+ | Reference 2D physics (C). Godot and raylib bindings exist. |
| [dimforge/rapier](https://github.com/dimforge/rapier) | 4k+ | Rust/WASM physics, fast in-browser. |
| [goldfire/howler.js](https://github.com/goldfire/howler.js) | 23k+ | Web audio. Juice and sound are half of "amazing". |
| [colyseus/colyseus](https://github.com/colyseus/colyseus) | 6k+ | Multiplayer server, if phones become second-screen controllers or for leaderboards. |

### Niche procam references (<1k★, read for technique, don't depend on)

- [microsoft/RoomAliveToolkit](https://github.com/microsoft/RoomAliveToolkit): multi-projector + Kinect calibration (~712★, last push 2022).
- [YCAMInterlab/ProCamToolkit](https://github.com/YCAMInterlab/ProCamToolkit): mapamok, model-based projection calibration (oF, MIT).
- [ddelago/AR-Projection-Mapping](https://github.com/ddelago/AR-Projection-Mapping): Python + ChArUco procam calibration. Closest to what we'd write.
- [Mari3/IMOVE](https://github.com/Mari3/IMOVE): C++ interactive projector framework with a separate calibration step.
- [Puddin1066/InteractiveProjector-CameraGame](https://github.com/Puddin1066/InteractiveProjector-CameraGame): YOLO + projection balloon-pop game. A direct analogue.

## Sensing options (the decision that matters most)

| Option | Cost | Handles projector glare | Touch detection | Notes |
|---|---|---|---|---|
| Plain RGB webcam + MediaPipe | ~$30 | Partial (pose holds up OK, blob/color tracking breaks) | No (2D only) | Cheapest. Best for "body/silhouette" games, front or overhead. |
| RGB webcam + IR-pass filter + 850 nm IR illuminator | ~$60 | **Yes** (projectors emit little IR) | Approximate | Classic interactive-floor approach. Tracks shadows/blobs, not skeletons. |
| Depth camera (RealSense / Kinect / OAK-D) | $100–400 | **Yes** | **Yes** (depth threshold above surface) | Most robust. Real touch on a wall or table. |

## Architecture sketch (stack-agnostic)

```
Camera ─▶ Vision process ─▶ (camera→projector homography) ─▶ input events ─▶ Game ─▶ Projector
                ▲                                                                │
                └──── calibration: project ArUco/ChArUco grid, detect, solve H ◀─┘
```

1. **Calibrate:** project a known pattern, detect it in the camera, solve the homography.
   Re-run in one click whenever the camera or projector gets bumped.
2. **Sense:** players/hands/blobs in camera space → map through H into game space.
3. **Play:** the game receives normalized events (`hit(x,y)`, `players[]`, `silhouette mask`),
   so you can swap the sensor without touching game code.

## Hand tracking (added 2026-10-23)

**Chosen: [MediaPipe Gesture Recognizer](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer)**
from google-ai-edge/mediapipe (30k+★, Apache-2.0).
- **Output:** 21 landmarks per hand, handedness, and 7 built-in gestures (Closed_Fist, Open_Palm, Pointing_Up, Thumb_Up, Thumb_Down, Victory, ILoveYou).
- **Why:** it ships in the same `@mediapipe/tasks-vision` package as the pose model, so there's no new dependency, it shares one WASM runtime, and it runs on the phone's GPU.

**The distance problem and the workaround:**
- **[inference]** At full-body distance, a hand is about 30–40 px in a 640×480 frame, which is too small for the palm detector.
- **[fact]** The recognizer rejects region-of-interest input.
- So `src/tracker/hands.js` crops a square around each wrist (sized from the forearm length the pose model reports), packs up to 4 crops into a 384×384 2×2 mosaic, and runs one inference per frame.
- It runs on every other camera frame. Palm *position* comes from the pose model every frame; the hand model only supplies the *gesture*.

| Alternative | ~Stars | Why not (yet) |
|---|---|---|
| [open-mmlab/mmpose](https://github.com/open-mmlab/mmpose) RTMPose / RTMW | 6k+ | Whole-body 133 keypoints including hands, likely better at distance **[assumption]**. Needs an ONNX Runtime Web / WebGPU port and is heavier. **First fallback if the crop approach is flaky on device.** |
| [tensorflow/tfjs-models](https://github.com/tensorflow/tfjs-models) hand-pose-detection | 14k | Wraps the same MediaPipe Hands model in an older runtime. No gain. |
| [ultralytics/ultralytics](https://github.com/ultralytics/ultralytics) hand-keypoints | 40k+ | Python-first, and AGPL-3.0 is a problem for a public portfolio or product. |
| [CMU openpose](https://github.com/CMU-Perceptual-Computing-Lab/openpose) hands | 30k+ | Non-commercial license, heavy. |
| [victordibia/handtrack.js](https://github.com/victordibia/handtrack.js) | 2.5k+ | Bounding boxes only, no fingers or gestures. |
| HaMeR / WiLoR (3D hand mesh research) | – | GPU research models, not real-time on a phone. |

### What hands unlock (design backlog)

| Gesture / signal | Mechanic | Status |
|---|---|---|
| Closed_Fist → open | Grab and throw orbs; thrown orbs smash others | **Built** |
| Open_Palm | Force push / shield that repels orbs, or blocks an opponent's throw | Idea |
| Pointing_Up + index tip | Aim reticle: hold it on a target to charge it, or a shadow "laser" | Idea |
| Thumb_Up / Victory | Hands-free menus: choose a game mode, "play again", with no touch or keyboard | Idea, high value |
| Index tip trail | Finger-paint with shadow ink, or draw walls that orbs bounce off | Idea |
| Pinch (thumb–index distance) | Pick up small, precise objects | Idea |
| Custom gestures | Recognize **hand shadow puppets** (dog, bird, rabbit) and bring them to life. MediaPipe Model Maker can train custom gesture classes from a few hundred images. | Stretch |
