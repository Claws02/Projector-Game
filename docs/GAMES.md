# Games & How to Start Them

Step in front of the wall and the **home screen** wakes up. It shows one shadow shape per
game in two columns at the edges, where your hands can reach. Do the shape's **pattern** with a
hand and that game starts after a 3-2-1 countdown. Patterns read your *hands*, not your body, so
walking past a shape never starts anything.

**Can't remember a pattern?**
- Every shape has its pattern written underneath it.
- Hold a hand on the **?** shape for 1 s to open the full guide on the wall.
- **Universal fallback:** hold a hand on *any* shape for 3 s.
- `?guide=1` in the URL opens the guide every time the home screen wakes.
- When nobody's there, the idle wall cycles through the hints.

**Leaving a game early:** hold **both hands above your head**, still, for 2 s.

| Shape | Game | Start pattern | Players | How to play | Needs hand model |
|---|---|---|---|---|---|
| Orb with gold ring | **Orb Pop** | Hold a hand on it for 1 s | 1–2, versus + co-op | Touch orbs to pop them (+1). Gold orbs need both players within ~1 s (+3 each). Fist grabs an orb, open hand throws it; thrown orbs smash others (+2). | No (grab/throw: yes) |
| Balloon | **Keep It Up** | Bounce it up 2 times (two quick upward swipes) | 1–2, co-op | Balloons fall slowly; bounce them up with your shadow. More balloons arrive at 20 s and 40 s. Team scores every bounce; a drop resets the streak. | No |
| Rock | **Shadow Storm** | Punch it (fast hand) | 1–2, versus | Stars and rocks fall, faster over time. Catch stars (+1), dodge rocks (−2). | No |
| Ball + net | **Shadow Volley** | Two players touch it together | 2 versus / 1 solo | Shadow pong. Each player defends the edge on their side; a ball past your edge scores for the other player. Solo: the far edge is a wall and every return scores. | No |
| Target | **Target Smash** | Grab it with a fist, then throw | 1–2, versus | Grab a ball (fist), throw it at a target (open hand), or bat balls with your shadow. Bullseye 3, ring 1. | No (throwing: yes) |
| Brush | **Shadow Paint** | Open palm 🖐 on it for 1 s | 1–2, free play | Your hands paint shadow ink. An open palm erases. Ink fades after 25 s. | No (erasing: yes) |
| Star | **Gesture Says** | Thumbs up 👍 on it | 1–2, versus | Copy the hand sign on the wall: first to match +2, second +1. "DON'T" prompts: keep still to score, copying costs 1. | **Yes**, hidden when `?hands=0` |

With `?hands=0`, patterns that need gestures or a fist (Target Smash, Shadow Paint) fall back to
"hold a hand on it for 3 s". Gesture Says is hidden.

Each game keeps its own best score on the device: the team total for versus and co-op games,
your score solo. Paint has no score.

## Developer shortcuts

| URL | Effect |
|---|---|
| `?game=<id>` | Skip the home screen and loop one game. ids: `orbs keepup storm volley smash paint simon` |
| `?round=20` | Override every game's round length |
| `?source=sim&players=1\|2` | Simulated players with fake hand signs, no camera |
| `?debug=1` | fps, timings, each hand's gesture and grip |

## Adding a game

1. Create `src/games/<id>.js` exporting the module shape documented in `src/games/common.js`
   (`create`, `step`, `draw`, `hud`, `result`, plus `pattern`, `icon`, `blurb`, `duration`).
2. Add it to `GAMES` in `src/games/index.js`.
3. Give it a **distinct** start pattern. `test/patterns.test.js` fails if two games share one.
   If it needs a new portal shape, add it to `icon()` in `src/render.js`.
4. `test/games.test.js` automatically plays every registered game for 30 s with simulated players.
