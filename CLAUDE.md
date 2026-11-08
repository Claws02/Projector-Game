# Shadow Wall (Projector-Game) — context for Claude

A wall game driven by your shadow: phone camera + screen today, projector later
(`docs/HARDWARE.md`). Pose/hand tracking → shadow mask → 7 games of 60 s
rounds. Plain ES modules, no build, no dependencies.

## Run / verify

```
npm test                                   # node --test test/*.test.js (Node 20+)
npm run serve   → http://localhost:8000/?source=sim&debug=1   # no camera needed
```

Camera needs HTTPS: test on a phone through GitHub Pages. `?source=sim&players=2`
simulates players. `?debug=1` shows fps, inference/draw time, landmarks, gestures.

## Map

`src/main.js` boot + URL options · `src/tracker/` pipeline (camera → model →
landmarks; `sim.js` fake players) · `src/handstate.js` gestures · `src/shadows.js`,
`src/shadowgl.js` shadow mask/render · `src/mapping.js` projector corner calibration ·
`src/home.js` idle/home screen + pattern-to-start · `src/games/` the 7 games ·
`src/game/` shared orbs/physics/patterns · `src/render.js` drawing · `src/audio.js`.

## Rules

- Every game and pattern must be playable in `?source=sim`, so tests and desk work don't need a camera.
- Projector mode draws no shadows (the real shadow is the input). Keep both modes in mind for any render change.
- Game rules and patterns: `docs/GAMES.md` is the source of truth. Update it with the code.
- Tracking switches and costs: `docs/TRACKING.md`. Hold frame time on a phone; check `?debug=1`.
