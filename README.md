# Shadow Wall (Projector-Game)

A wall that wakes up when you walk past. Floating shadow orbs drift on the wall. Touch them
with your shadow to pop them, compete with a second player, and team up on gold orbs that need
both of you.

Version 1 runs on **just a phone** (camera + screen). The same code drives a projector later:
see [docs/HARDWARE.md](docs/HARDWARE.md).

## How it plays

- **Asleep:** the wall is dim and the game shapes drift. The idle screen cycles through how to start each game.
- **Someone steps in:** the wall brightens into the **home screen**, with one shadow shape per game.
  Do a shape's pattern with your hand (hold, punch, bounce, grab and throw, a hand sign, or two players together)
  and its game starts. Hold the **?** shape for the full guide, or hold any shape for 3 s.
- **7 games, 60 s rounds:** Orb Pop, Keep It Up, Shadow Storm, Shadow Volley, Target Smash, Shadow Paint and
  Gesture Says. See **[docs/GAMES.md](docs/GAMES.md)** for every pattern and rule.
- **Results:** the winner, the team total and a per-game best. Stay and you're back on the home screen.
  Both hands up for 2 s exits a game early.

## Run it

**On a phone.** The camera needs HTTPS, so use GitHub Pages:
1. Repo **Settings → Pages → Build and deployment → Deploy from a branch**, then pick the branch and `/ (root)`.
2. Open `https://claws02.github.io/projector-game/` on the phone and tap **Start**.

**On a desktop, no camera needed:**
```sh
npm run serve          # python3 -m http.server 8000
# open http://localhost:8000/?source=sim&debug=1
```

**Tests:** `npm test` (Node 20+, no dependencies to install).

## URL options

| Param | Effect |
|---|---|
| `mode=projector` | Uses the rear/USB camera, applies the calibrated corners, and doesn't draw shadows (your real shadow is the input) |
| `calibrate=1` | Tap the 4 corners of the projected image in the camera view (projector mode) |
| `source=sim&players=1\|2` | Simulated players instead of the camera |
| `hands=0` | Turns off hand tracking (saves one model's worth of compute) |
| `debug=1` | Shows fps, inference/draw time, landmarks, and each hand's gesture |
| `autostart=1` | Skips the Start tap (kiosk) |
| `game=<id>` | Skips the home screen and loops one game (`orbs keepup storm volley smash paint simon`) |
| `guide=1` | Opens the pattern guide whenever the home screen wakes |
| `round=20` | Overrides every game's round length |
| `mirror=0\|1`, `shadows=0\|1`, `cam=user\|environment` | Override the mode defaults |

## Code map

```
index.html              page shell + start overlay
src/main.js             frame loop: camera → tracker → players → game → render/audio
src/config.js           URL options
src/tracker/vision.js   shared MediaPipe loader (one WASM runtime for both models)
src/tracker/mediapipe.js  MediaPipe Pose Landmarker (2 people + segmentation masks)
src/tracker/hands.js    MediaPipe Gesture Recognizer on a 2x2 mosaic of wrist crops
src/handstate.js        palm position/velocity per hand, grip with hysteresis
src/tracker/sim.js      animated stick-figure players for dev/tests
src/mapping.js          camera↔wall homography (phone cover-fit, projector 4-corner)
src/shadows.js          mask grids → occ(x, y): "whose shadow is here?"
src/players.js          stable P1/P2 identity across frames
src/game/flow.js        attract → home → countdown → playing → results
src/game/patterns.js    portal start patterns (dwell, punch, bounceUp, twoTouch, grabThrow, gesture)
src/game/physics.js     shared shadow collision, bounce, grab/throw
src/home.js             home screen portals, guide card, attract hints
src/games/*.js          one module per game + registry (index.js)
src/game/orbs.js        orb field used by Orb Pop
src/render.js           Canvas 2D drawing + `kit` helpers for games (everything is drawn as shadow)
src/audio.js            synthesized Web Audio effects (no asset files)
test/                   node:test unit tests
docs/                   research notes and hardware plan
```
