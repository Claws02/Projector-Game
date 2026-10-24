# Tracking Pipeline

How a camera frame becomes a smooth shadow on the wall, and the knobs to tune it.

```
camera 30 Hz ──▶ ImageBitmap ──▶ [ Web Worker ]                         (src/tracker/worker.js)
                                  pose model (full → lite if slow)       (mediapipe.js)
                                  hand model on wrist-crop mosaic,       (hands.js)
                                  every other frame
              ◀── sample { detections, masks, hand readings } ──
render 60 Hz ──▶ PlayerTracks: confirm · dedupe · match · coast ·        (src/tracks.js)
                 One Euro filter · extrapolate · blend masks
             ──▶ HandStates: palm from filtered pose · gesture vote ·    (src/handstate.js)
                 grip hysteresis
             ──▶ games / home  ──▶  WebGL shadows + Canvas 2D            (src/shadowgl.js, render.js)
```

## What fixes which glitch

| Glitch | Cause | Fix |
|---|---|---|
| Shadow blinks out | Pose model misses a frame, so the shadow vanished for that frame | A track **coasts** on its last shadow for 0.35 s, then fades over 0.3 s (`coast`, `fade`) |
| Shadow steps / lags | Shadow only changed at camera rate, and inference blocked the render loop | Inference runs **in a worker**; masks are **blended toward each sample at 60 Hz** (`maskTau` 35 ms); landmarks are **extrapolated** to render time (`maxLead` 0.1 s) |
| Ghost players | One-frame false detections | A new person must appear in **3 samples in a row** (`confirmSamples`) with a visible torso (`minVisibility`) and a real mask area (`minArea`) |
| P1/P2 swap | Model returns people in random order | Detections match tracks by **predicted** position; confirmed tracks win ties; one person reported twice is **deduped** (`dedupeDist`) |
| Jumpy hands / false punches | Raw landmark noise, so noisy velocity | **One Euro filter** on every landmark (`minCutoff` 1 Hz, `beta` 12): about 3× less jitter at rest, 6–22 ms of lag in motion |
| Wrong gesture flickers | Single misclassified frames | Gesture = **score-weighted vote of the last 3 readings**; grip adds hysteresis on top |
| Soft or blocky shadow edges | Shadows were drawn on the CPU at a fraction of screen resolution | **WebGL shader**: bicubic B-spline mask sampling + `fwidth` anti-aliasing at full resolution |

## URL switches

| Param | Default | Use when |
|---|---|---|
| `model=lite\|full` | full, auto-switches to lite if average inference > 50 ms | Force a model to compare steadiness against speed |
| `worker=0` | worker on | Compare against main-thread tracking, or if the worker fails on a device (it also falls back automatically) |
| `delegate=cpu` | GPU, falling back to CPU | If GPU inference in the worker feels janky on a device |
| `gpu=0` | WebGL shadows | Compare against the CPU shadow renderer |
| `debug=1` | off | Shows render fps, draw ms, shadow path, pipeline (`pose-full-gpu@worker`), camera Hz, inference ms, per-hand gesture |

## Measured here (headless Chromium, software GPU, fake camera)

Absolute numbers are meaningless on a software GPU. The comparison is what matters:

| Setup | Rendered frames in 10 s | Frames > 100 ms |
|---|---|---|
| lite model, CPU, **worker** | 230 | 1 |
| lite model, CPU, main thread | 83 | 74 |

GPU inference in the worker also loads and runs. Headless Chromium shares one software GPU
between the worker and the page, so it still stutters there; a real phone GPU doesn't have
that limit. **Not verified on an iPhone yet.** Check `?debug=1` on the device.

Tuning constants live in `TRACK_DEFAULTS` (`src/tracks.js`), `OneEuro` defaults
(`src/filters.js`) and `HandStates` (`src/handstate.js`).
