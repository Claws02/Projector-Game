# Living Stories

**An Interactive Storytelling Surface Platform.** Not projector games — *stories
that react to people*. You walk up to a wall, and the wall is alive.

> Design rule: a 4-year-old and a 70-year-old both understand it within 5
> seconds. No instructions, no menus, no controllers. People walk up and the
> room notices them, reacts to them, and changes because of them.

## What's here now

The first vertical slice runs entirely in the browser with a regular webcam:

- **Magical Forest** — the calm, living world the wall shows at rest. The first
  thing a child sees. Fireflies drift toward people; light blooms where hands
  move.
- **Shadow Creatures** *(the first experience)* — step into the forest and your
  silhouette falls across it as a luminous shadow. Move a little and a creature
  steps out of your shadow — a critter, a little dinosaur, a wizard — and starts
  to follow and circle you.

## Running it

```bash
npm install
npm run dev
```

Open the printed URL on the machine wired to the projector, click once to wake
the forest (this grants camera access), and step in front of the camera.

Point the projector at the wall and the webcam at the same area the audience
stands in. For a mirror-like feel the image is flipped horizontally by default
(see `src/tracking/config.ts`).

### Operator controls

Players never see a menu. Operators can switch experiences with number keys:

- `1` — Shadow Creatures (default)
- `2` — Magical Forest

## Architecture

The platform is built **surface-agnostic** on purpose. Today it's one wall and
one projector; the design supports floors, multiple projectors, and full rooms
later without rewriting experiences.

```
webcam ─▶ TrackingSource ─▶ PresenceFrame ─▶ Experience ─▶ Stage ─▶ projector
         (webcam+MediaPipe)  (normalized 0..1)  (a Living Story)  (maps 0..1→px)
```

- `src/tracking/` — turns camera frames into a `PresenceFrame`: tracked **bodies**
  (id, hands, motion, age) and a soft **silhouette** mask. Everything is in
  normalized `0..1` coordinates so it's independent of the surface.
  `WebcamTrackingSource` is the v1 implementation (MediaPipe selfie segmentation
  + pose); a depth-camera source (RealSense / Azure Kinect) would implement the
  same `TrackingSource` interface and drop straight in.
- `src/platform/Stage.ts` — the projection surface. The single place that maps
  normalized coordinates to device pixels. Change this to change the surface.
- `src/experiences/` — the Living Stories. Each gets presence + a canvas and
  reacts. No score, no health, no win state.
- `src/scenes/` — reusable world pieces (the `Forest`, the `ShadowCreature`)
  shared across experiences.

Adding a new experience is one line in `src/app.ts`.

## Tuning for a room

Common setup knobs live in `src/tracking/config.ts`:

- `MIRROR` — flip the camera horizontally (default on).
- `INVERT_MASK` — flip if shadows render inside-out for your segmenter build.
- `MAX_BODIES` — how many people to track at once (cooperation needs ≥ 2).

## Roadmap

Future experiences from the platform vision: Dragon Painter (air-drawn paint
that becomes a dragon), Portal Wall (cooperative portals into other worlds), the
Storybook dragon-egg arc, and the Living Wall that remembers what every visitor
left behind. Hardware path: single wall → multi-projector → floor + wall → full
room.
