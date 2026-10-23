// Canvas 2D renderer. Everything on the "wall" is drawn as shadow: dark, soft
// shapes on a lit background, so a projector shows them as missing light.

import { applyH } from './mapping.js';
import { Phase } from './game/round.js';

const COLORS = {
  wallLit: [239, 230, 216],
  wallDim: [74, 68, 62],
  ink: 'rgba(24, 20, 17, 0.88)',
  players: ['#1f8a8a', '#d0632a'],
  gold: '#e0a526',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
    let particles = [];
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(canvas.clientWidth * dpr);
    H = canvas.height = Math.round(canvas.clientHeight * dpr);
  }

  // World units -> device pixels: height is 1 world unit, so the scale is H.
  const px = (v) => v * H;

  function emit(ev) {
    const color = ev.kind === 'gold' ? COLORS.gold : 'rgba(24,20,17,1)';
    if (ev.type === 'pop') {
      const n = ev.kind === 'gold' ? 18 : 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
        const sp = 0.25 + Math.random() * 0.45;
        particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: ev.r * (0.15 + Math.random() * 0.2), life: 0.6, age: 0, color });
      }
      particles.push({ text: `+${ev.coop ? ev.points * 2 : ev.points}${ev.smash ? ' smash!' : ''}`, x: ev.x, y: ev.y, vx: 0, vy: -0.15,
        life: 0.9, age: 0, color: ev.coop ? COLORS.gold : COLORS.players[ev.player] });
    } else if (ev.type === 'expire') {
      particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, r: ev.r, grow: true, life: 0.4, age: 0, color });
    }
  }

  function drawWall(wake) {
    const c = COLORS.wallDim.map((d, i) => Math.round(d + (COLORS.wallLit[i] - d) * wake));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgb(${c})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Sharp shadows: resample every player's soft mask into one buffer at
  // 1/k screen resolution, bilinear-interpolating the mask and thresholding with
  // a narrow smoothstep. The edge follows the mask's sub-cell contour (no
  // blockiness) and stays crisp at any scale. ~150k px per frame on a phone.
  const SHADOW_RGB = (14 << 16) | (16 << 8) | 18; // little-endian ABGR: rgb(18,16,14)
  let shadowCanvas = null;
  let shadowImg = null;

  // Camera-space bounding box of a grid's occupied cells (plus one cell of margin),
  // so the resampler can skip the empty parts of the screen.
  function withBounds(g) {
    let i0 = g.w;
    let i1 = -1;
    let j0 = g.h;
    let j1 = -1;
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (g.data[j * g.w + i] <= 0.42) continue;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
    }
    return { ...g, u0: (i0 - 1) / g.w, u1: (i1 + 2) / g.w, v0: (j0 - 1) / g.h, v1: (j1 + 2) / g.h };
  }

  function drawShadows(slots, invH) {
    const shapes = slots.map((s) => s.det?.shape ?? s.det?.mask).filter(Boolean).map(withBounds);
    if (shapes.length === 0) return;
    const k = Math.max(2, Math.ceil(Math.sqrt((W * H) / 150000)));
    const w = Math.ceil(W / k);
    const h = Math.ceil(H / k);
    if (!shadowCanvas || shadowCanvas.width !== w || shadowCanvas.height !== h) {
      shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = w;
      shadowCanvas.height = h;
      shadowImg = shadowCanvas.getContext('2d').createImageData(w, h);
    }
    const out = new Uint32Array(shadowImg.data.buffer);
    out.fill(0);
    // world-normalized (s, t) -> cam (u, v); affine in phone mode.
    const n = invH[8];
    const [ua, ub, uc, va, vb, vc] = [invH[0] / n, invH[1] / n, invH[2] / n, invH[3] / n, invH[4] / n, invH[5] / n];
    for (let j = 0; j < h; j++) {
      const t = (j + 0.5) / h;
      for (let i = 0; i < w; i++) {
        const s = (i + 0.5) / w;
        const u = ua * s + ub * t + uc;
        const v = va * s + vb * t + vc;
        let val = 0;
        for (const g of shapes) {
          if (u < g.u0 || u > g.u1 || v < g.v0 || v > g.v1) continue;
          // Inlined bilinear sample (see sampleBilinear in shadows.js).
          const x = Math.min(g.w - 1, Math.max(0, u * g.w - 0.5));
          const y = Math.min(g.h - 1, Math.max(0, v * g.h - 0.5));
          const x0 = x | 0;
          const y0 = y | 0;
          const x1 = x0 + 1 < g.w ? x0 + 1 : x0;
          const r0 = y0 * g.w;
          const r1 = (y0 + 1 < g.h ? y0 + 1 : y0) * g.w;
          const fx = x - x0;
          const fy = y - y0;
          const d = g.data;
          const top = d[r0 + x0] + (d[r0 + x1] - d[r0 + x0]) * fx;
          const bot = d[r1 + x0] + (d[r1 + x1] - d[r1 + x0]) * fx;
          const sample = top + (bot - top) * fy;
          if (sample > val) val = sample;
        }
        if (val <= 0.42) continue;
        // smoothstep(0.42, 0.58, val): about one output pixel of anti-aliasing.
        const e = val >= 0.58 ? 1 : (val - 0.42) / 0.16;
        out[j * w + i] = (Math.round(e * e * (3 - 2 * e) * 235) << 24) | SHADOW_RGB;
      }
    }
    shadowCanvas.getContext('2d').putImageData(shadowImg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadowCanvas, 0, 0, W, H);
  }

  // Hand cursors: a ring at each palm in the player's color, filled while gripping.
  function drawHands(hands) {
    for (const hnd of hands) {
      ctx.strokeStyle = COLORS.players[hnd.player];
      ctx.fillStyle = COLORS.players[hnd.player];
      ctx.lineWidth = px(0.008);
      ctx.beginPath();
      ctx.arc(px(hnd.x), px(hnd.y), px(hnd.grip ? 0.025 : 0.035), 0, Math.PI * 2);
      if (hnd.grip) ctx.fill();
      else ctx.stroke();
    }
  }

  function drawPlayerMarker(slot, Hm, aspect) {
    const head = slot.det?.landmarks?.[0];
    if (!head) return;
    const [s, t] = applyH(Hm, head.x, head.y);
    const x = s * aspect;
    const y = t - 0.14;
    ctx.fillStyle = COLORS.players[slot.id];
    ctx.font = `700 ${px(0.05)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${slot.id + 1}`, px(x), px(Math.max(0.04, y)));
  }

  function drawOrb(o, time) {
    let alpha = Math.min(1, o.age / 0.4);
    const remaining = o.life - o.age;
    if (remaining < 1.2) alpha *= 0.35 + 0.65 * Math.abs(Math.sin(remaining * 9)); // blink before expiring
    const x = px(o.x);
    const y = px(o.y);
    const r = px(o.r) * (1 + 0.04 * Math.sin(time * 3 + o.phase));
    // Motion trail while a thrown orb is in flight.
    if (time < o.thrownUntil) {
      for (let k = 3; k >= 1; k--) {
        ctx.fillStyle = `rgba(20,17,15,${0.12 * alpha * (4 - k)})`;
        ctx.beginPath();
        ctx.arc(x - px(o.vx) * 0.03 * k, y - px(o.vy) * 0.03 * k, r * (1 - k * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = `rgba(20,17,15,${0.9 * alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (o.heldBy) {
      ctx.strokeStyle = COLORS.players[o.holder];
      ctx.lineWidth = r * 0.15;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (o.kind === 'gold') {
      ctx.lineWidth = r * 0.18;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = COLORS.gold;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      // Show which player has already touched it, so the other knows to go.
      o.touchedAt.forEach((at, p) => {
        if (time - at > 1.2) return;
        ctx.strokeStyle = COLORS.players[p];
        ctx.beginPath();
        ctx.arc(x, y, r * 1.05, p === 0 ? Math.PI / 2 : -Math.PI / 2, p === 0 ? Math.PI * 1.5 : Math.PI / 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles(dt) {
    particles = particles.filter((p) => (p.age += dt) < p.life);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = `800 ${px(0.06)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, px(p.x), px(p.y));
      } else {
        const r = p.grow ? px(p.r) * (1 + p.age / p.life) : px(p.r) * k;
        ctx.beginPath();
        ctx.arc(px(p.x), px(p.y), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // HUD text, shrunk on narrow (portrait) screens and haloed in wall color so it
  // stays readable when it lands on top of a shadow.
  function text(str, x, y, size, color = COLORS.ink, align = 'center', weight = 800) {
    const sizePx = px(size) * Math.min(1, W / H / 0.9);
    ctx.font = `${weight} ${sizePx}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = sizePx * 0.14;
    ctx.strokeStyle = `rgb(${COLORS.wallLit})`;
    ctx.strokeText(str, px(x), px(y));
    ctx.fillStyle = color;
    ctx.fillText(str, px(x), px(y));
  }

  function drawHud(s) {
    const { round, field, aspect, time } = s;
    const twoUp = s.playerCount >= 2 || field.scores[1] > 0;
    if (round.phase === Phase.ATTRACT) {
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 2);
      text('step into the light', aspect / 2, 0.92, 0.05, 'rgba(239,230,216,0.9)', 'center', 600);
      ctx.globalAlpha = 1;
    } else if (round.phase === Phase.WAKING) {
      const n = Math.ceil(round.countdown - round.phaseTime);
      const frac = n - (round.countdown - round.phaseTime);
      ctx.globalAlpha = 1 - frac;
      text(String(n), aspect / 2, 0.45, 0.28 + frac * 0.1);
      ctx.globalAlpha = 1;
      text(twoUp ? 'pop orbs • gold needs both of you' : 'pop the shadow orbs', aspect / 2, 0.68, 0.045, COLORS.ink, 'center', 600);
    } else if (round.phase === Phase.PLAYING) {
      text(String(Math.ceil(round.timeLeft)), aspect / 2, 0.07, 0.08, round.timeLeft <= 5 ? '#b3261e' : COLORS.ink);
      text(String(field.scores[0]), 0.05, 0.07, 0.08, COLORS.players[0], 'left');
      if (twoUp) {
        text(String(field.scores[1]), aspect - 0.05, 0.07, 0.08, COLORS.players[1], 'right');
        text(`team ${field.scores[0] + field.scores[1]}`, aspect / 2, 0.14, 0.035, COLORS.ink, 'center', 600);
      }
    } else if (round.phase === Phase.RESULTS) {
      const [a, b] = field.scores;
      const team = a + b;
      if (twoUp) {
        const headline = a === b ? 'tie!' : `P${a > b ? 1 : 2} wins`;
        text(headline, aspect / 2, 0.3, 0.12, a === b ? COLORS.ink : COLORS.players[a > b ? 0 : 1]);
        text(`${a}  –  ${b}`, aspect / 2, 0.45, 0.08);
        text(`team ${team}${team > s.best ? '  ★ new best' : `  · best ${s.best}`}`, aspect / 2, 0.58, 0.05, COLORS.ink, 'center', 600);
      } else {
        text(String(a), aspect / 2, 0.35, 0.16, COLORS.players[0]);
        text(a > s.best ? '★ new best' : `best ${s.best}`, aspect / 2, 0.52, 0.05, COLORS.ink, 'center', 600);
      }
      text('stay to play again', aspect / 2, 0.85, 0.04, COLORS.ink, 'center', 500);
    }
  }

  function drawDebug(s) {
    for (const slot of s.slots) {
      for (const lm of slot.det?.landmarks ?? []) {
        if (!lm) continue;
        const [sx, sy] = applyH(s.H, lm.x, lm.y);
        ctx.fillStyle = COLORS.players[slot.id];
        ctx.fillRect(sx * W - 3, sy * H - 3, 6, 6);
      }
    }
    const lines = [
      `${s.stats.fps.toFixed(0)} fps · ${s.trackerName} ${s.stats.inferMs.toFixed(1)} ms · draw ${s.stats.renderMs.toFixed(1)} ms`,
      `players ${s.playerCount} · phase ${s.round.phase} · orbs ${s.field.orbs.length}`,
    ];
    if (s.hands) {
      lines.push(`${s.handTrackerName} ${s.stats.handMs.toFixed(1)} ms`);
      for (const hnd of s.hands) lines.push(`P${hnd.player + 1}${hnd.side} ${hnd.gesture}${hnd.grip ? ' (grip)' : ''}`);
    }
    ctx.font = `500 ${Math.max(12, px(0.022))}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, k) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(4, 4 + k * px(0.03), ctx.measureText(l).width + 8, px(0.028));
      ctx.fillStyle = '#9ef0c0';
      ctx.fillText(l, 8, 6 + k * px(0.03));
    });
  }

  return {
    resize,
    emit,
    get aspect() {
      return W / H;
    },
    draw(s, dt) {
      drawWall(s.wake);
      if (s.drawShadows) drawShadows(s.slots, s.invH);
      for (const o of s.field.orbs) drawOrb(o, s.field.time);
      drawParticles(dt);
      if (s.hands) drawHands(s.hands);
      if (s.round.phase !== Phase.ATTRACT) {
        for (const slot of s.slots) drawPlayerMarker(slot, s.H, s.aspect);
      }
      drawHud(s);
      if (s.debug) drawDebug(s);
    },
  };
}
