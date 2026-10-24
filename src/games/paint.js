// Shadow Paint (free play): your hands leave shadow-ink trails. With hand
// tracking, an open palm is an eraser. Ink fades after a while.

const FADE_AFTER = 25; // s before a stroke point fades out
const MIN_STEP = 0.008;
const MAX_JUMP = 0.15;  // a bigger jump between frames starts a new stroke
const ERASE_R = 0.07;
const WIDTH = 0.018;

export default {
  id: 'paint',
  title: 'Shadow Paint',
  icon: 'brush',
  blurb: 'Your hands paint with shadow ink. Open palm erases.',
  pattern: { kind: 'gesture', name: 'Open_Palm', hold: 1 },
  duration: 60,
  needsHandModel: false,

  create({ handModel }) {
    return { strokes: [], open: new Map(), time: 0, ink: [0, 0], handModel };
  },

  step(s, { dt, hands }) {
    const events = [];
    s.time += dt;
    const seen = new Set();
    for (const h of hands) {
      seen.add(h.key);
      if (s.handModel && h.gesture === 'Open_Palm') {
        s.open.delete(h.key);
        let erased = 0;
        for (const st of s.strokes) {
          const before = st.pts.length;
          st.pts = st.pts.filter((p) => Math.hypot(p.x - h.x, p.y - h.y) > ERASE_R);
          erased += before - st.pts.length;
        }
        if (erased) events.push({ type: 'nudge', x: h.x, y: h.y, player: h.player });
        continue;
      }
      let st = s.open.get(h.key);
      const last = st?.pts.at(-1);
      const jump = last ? Math.hypot(h.x - last.x, h.y - last.y) : Infinity;
      if (!st || !last || jump > MAX_JUMP) {
        st = { player: h.player, pts: [{ x: h.x, y: h.y, t: s.time }] };
        s.strokes.push(st);
        s.open.set(h.key, st);
      } else if (jump >= MIN_STEP) {
        st.pts.push({ x: h.x, y: h.y, t: s.time });
        s.ink[h.player] += jump;
      }
    }
    for (const key of s.open.keys()) if (!seen.has(key)) s.open.delete(key);
    for (const st of s.strokes) st.pts = st.pts.filter((p) => s.time - p.t < FADE_AFTER);
    s.strokes = s.strokes.filter((st) => st.pts.length > 0);
    return events;
  },

  draw(s, kit) {
    for (const st of s.strokes) {
      if (st.pts.length < 2) {
        const [p] = st.pts;
        kit.disc(p.x, p.y, WIDTH / 2, 0.85, kit.COLORS.inks[st.player]);
        continue;
      }
      const age = s.time - st.pts[0].t;
      const alpha = age > FADE_AFTER - 3 ? Math.max(0.2, (FADE_AFTER - age) / 3) : 0.88;
      kit.line(st.pts.map((p) => [p.x, p.y]), WIDTH, kit.COLORS.inks[st.player], alpha);
    }
  },

  hud(s) {
    return { scores: null, showP2: false, center: s.handModel ? 'paint! open palm erases' : 'paint!' };
  },

  result(s, players) {
    // Ink length in "wall heights", a playful stat rather than a competitive score.
    const total = s.ink[0] + s.ink[1];
    const lines = [`${total.toFixed(1)} wall-heights of ink`];
    if (players >= 2) lines.push(`P1 ${s.ink[0].toFixed(1)}  ·  P2 ${s.ink[1].toFixed(1)}`);
    return { headline: 'masterpiece!', headlineColor: null, lines, value: null };
  },
};
