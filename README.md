# Shadow Wall (Projector-Game)

A wall that wakes up when you walk past. Floating shadow orbs drift on the wall. Touch them
with your shadow to pop them, compete with a second player, and team up on gold orbs that need
both of you.

Version 1 runs on **just a phone** (camera + screen). The same code drives a projector later:
see [docs/HARDWARE.md](docs/HARDWARE.md).

## How it plays

- **Asleep:** the wall is dim and a few orbs drift. If your shadow touches one, it bounces away with a soft thump.
- **Someone steps in:** the wall brightens, then a 3-2-1 countdown starts. No buttons.
- **60 s round:** pop orbs for points. Chaining pops quickly climbs a musical scale.
  - With 2 players, gold orbs only pop when **both** players touch them within about a second. That's worth 3 points each.
  - Solo, a gold orb pops on one touch for 3 points.
- **Results:** the winner, the team total, and the best team score (stored on the device).
  If you stay, the next round starts. Walk away and the wall goes back to sleep.

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
| `debug=1` | Shows fps, inference time and landmarks |
| `autostart=1` | Skips the Start tap (kiosk) |
| `round=60` | Round length in seconds |
| `mirror=0\|1`, `shadows=0\|1`, `cam=user\|environment` | Override the mode defaults |

## Code map

```
index.html              page shell + start overlay
src/main.js             frame loop: camera → tracker → players → game → render/audio
src/config.js           URL options
src/tracker/mediapipe.js  MediaPipe Pose Landmarker (2 people + segmentation masks)
src/tracker/sim.js      animated stick-figure players for dev/tests
src/mapping.js          camera↔wall homography (phone cover-fit, projector 4-corner)
src/shadows.js          mask grids → occ(x, y): "whose shadow is here?"
src/players.js          stable P1/P2 identity across frames
src/game/round.js       attract → waking → playing → results state machine
src/game/orbs.js        orb spawning, movement, shadow collisions, scoring
src/render.js           Canvas 2D drawing (everything is drawn as shadow)
src/audio.js            synthesized Web Audio effects (no asset files)
test/                   node:test unit tests
docs/                   research notes and hardware plan
```
