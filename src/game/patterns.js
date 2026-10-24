// Interaction patterns that start a game from its home-screen portal.
//
// Patterns read hands (palm position, velocity, grip, gesture), not the body
// shadow, so walking past a portal never starts a game by accident. Every portal
// also accepts a universal fallback: hold a hand on it for FALLBACK_HOLD seconds.

export const FALLBACK_HOLD = 3;

// Pattern specs: { kind, ...params }. text() is the hint shown under the portal
// and in the guide.
export const PATTERNS = Object.freeze({
  dwell: { needsHandModel: false, text: (p) => `Hold a hand on it for ${p.hold} s` },
  punch: { needsHandModel: false, text: () => 'Punch it (fast hand)' },
  bounceUp: { needsHandModel: false, text: (p) => `Bounce it up ${p.count} times` },
  twoTouch: { needsHandModel: false, text: () => 'Two players touch it together' },
  grabThrow: { needsHandModel: true, text: () => 'Grab it with a fist, then throw' },
  gesture: { needsHandModel: true, text: (p) => `${GESTURE_LABEL[p.name]} on it` },
});

export const GESTURE_LABEL = Object.freeze({
  Closed_Fist: 'Fist ✊',
  Open_Palm: 'Open palm 🖐',
  Pointing_Up: 'Point up ☝',
  Thumb_Up: 'Thumbs up 👍',
  Thumb_Down: 'Thumbs down 👎',
  Victory: 'Peace sign ✌',
  ILoveYou: 'Rock on 🤟',
});

export function patternText(pattern, handModel = true) {
  const spec = PATTERNS[pattern.kind];
  if (spec.needsHandModel && !handModel) return `Hold a hand on it for ${FALLBACK_HOLD} s`;
  return spec.text(pattern);
}

const handOn = (h, portal) => Math.hypot(h.x - portal.x, h.y - portal.y) <= portal.r * 1.2 + 0.02;

export function createDetector(pattern, { handModel = true } = {}) {
  const primary = !PATTERNS[pattern.kind].needsHandModel || handModel;
  return {
    pattern,
    primary,
    progress: 0,
    heldKey: null,       // grabThrow: hand currently holding the portal
    hold: 0,             // dwell / gesture timer
    fallback: 0,         // universal fallback timer
    count: 0,            // bounceUp
    firstAt: -Infinity,  // bounceUp window start
    coolUntil: -Infinity,
    touchedAt: [-Infinity, -Infinity],
    speedSeen: 0,
  };
}

// Advances detector d for one frame. Returns true when the pattern completes.
export function stepDetector(d, portal, { dt, time, hands, players }) {
  const p = d.pattern;
  const on = hands.filter((h) => handOn(h, portal));

  d.fallback = on.length ? d.fallback + dt : Math.max(0, d.fallback - dt * 2);
  if (d.fallback >= FALLBACK_HOLD) return finish(d);

  let progress = 0;
  if (d.primary) {
    switch (p.kind) {
      case 'dwell':
        d.hold = on.length ? d.hold + dt : Math.max(0, d.hold - dt * 2);
        if (d.hold >= p.hold) return finish(d);
        progress = d.hold / p.hold;
        break;

      case 'punch': {
        const fastest = Math.max(0, ...on.map((h) => Math.hypot(h.vx, h.vy)));
        if (fastest >= p.speed) return finish(d);
        d.speedSeen = Math.max(fastest, d.speedSeen - dt * 2);
        progress = d.speedSeen / p.speed;
        break;
      }

      case 'bounceUp':
        if (time - d.firstAt > p.window) d.count = 0;
        if (time >= d.coolUntil && on.some((h) => h.vy <= -p.speed)) {
          if (d.count === 0) d.firstAt = time;
          d.count += 1;
          d.coolUntil = time + 0.4;
          if (d.count >= p.count) return finish(d);
        }
        progress = d.count / p.count;
        break;

      case 'twoTouch':
        for (const h of on) d.touchedAt[h.player] = time;
        if (players >= 2 && Math.abs(d.touchedAt[0] - d.touchedAt[1]) <= p.window
          && time - Math.min(d.touchedAt[0], d.touchedAt[1]) <= p.window) return finish(d);
        progress = d.touchedAt.filter((t) => time - t <= p.window).length / 2;
        break;

      case 'grabThrow': {
        const held = d.heldKey && hands.find((h) => h.key === d.heldKey);
        if (held && held.grip) {
          progress = 0.5;
        } else if (d.heldKey) {
          const thrown = held && Math.hypot(held.vx, held.vy) >= p.speed;
          d.heldKey = null;
          if (thrown) return finish(d);
        } else {
          const grabber = on.find((h) => h.grip);
          if (grabber) d.heldKey = grabber.key;
        }
        break;
      }

      case 'gesture': {
        const near = hands.filter((h) => Math.hypot(h.x - portal.x, h.y - portal.y) <= portal.r * 1.8 + 0.03);
        d.hold = near.some((h) => h.gesture === p.name) ? d.hold + dt : Math.max(0, d.hold - dt * 2);
        if (d.hold >= p.hold) return finish(d);
        progress = d.hold / p.hold;
        break;
      }
    }
  }
  d.progress = Math.min(1, Math.max(progress, d.fallback / FALLBACK_HOLD));
  return false;
}

function finish(d) {
  d.progress = 1;
  resetDetector(d);
  return true;
}

export function resetDetector(d) {
  Object.assign(d, {
    hold: 0, fallback: 0, count: 0, firstAt: -Infinity, coolUntil: -Infinity,
    touchedAt: [-Infinity, -Infinity], speedSeen: 0, heldKey: null,
  });
}
