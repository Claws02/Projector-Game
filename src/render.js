// Canvas 2D renderer. Everything on the "wall" is drawn as shadow: dark, crisp
// shapes on a lit background, so a projector shows them as missing light.
//
// Games and the home screen draw through `kit`, a small set of world-unit
// drawing helpers (height = 1, width = aspect), so they never touch pixels.

import { applyH } from './mapping.js';
import { Phase } from './game/flow.js';
import { drawHome } from './home.js';

const COLORS = {
  wallLit: [239, 230, 216],
  wallDim: [74, 68, 62],
  wallLight: 'rgb(239, 230, 216)',
  ink: 'rgba(24, 20, 17, 0.9)',
  inks: ['rgb(16, 58, 58)', 'rgb(84, 36, 12)'],
  players: ['#1f8a8a', '#d0632a'],
  gold: '#e0a526',
  danger: '#b3261e',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [];
  let W = 0;
  let H = 0;
  let time = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(canvas.clientWidth * dpr);
    H = canvas.height = Math.round(canvas.clientHeight * dpr);
  }

  // World units -> device pixels: height is 1 world unit, so the scale is H.
  const px = (v) => v * H;

  // ---- kit: world-unit drawing helpers -----------------------------------

  // HUD text, shrunk on narrow (portrait) screens and haloed in wall color so it
  // stays readable on top of a shadow.
  function text(str, x, y, size, color = COLORS.ink, align = 'center', weight = 800) {
    const sizePx = px(size) * Math.min(1, W / H / 0.9);
    ctx.font = `${weight} ${sizePx}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const onDark = color === COLORS.wallLight;
    ctx.lineWidth = sizePx * 0.14;
    ctx.strokeStyle = onDark ? 'rgba(24,20,17,0.6)' : `rgb(${COLORS.wallLit})`;
    ctx.strokeText(str, px(x), px(y));
    ctx.fillStyle = color ?? COLORS.ink;
    ctx.fillText(str, px(x), px(y));
  }

  // Word-wrapped text block centered (or aligned) at x, starting at y.
  function textBlock(str, x, y, size, maxWidth, color = COLORS.ink, align = 'center', weight = 600) {
    const sizePx = px(size) * Math.min(1, W / H / 0.9);
    ctx.font = `${weight} ${sizePx}px ${FONT}`;
    const lines = [];
    let cur = '';
    for (const word of str.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > px(maxWidth)) {
        lines.push(cur);
        cur = word;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    const step = (sizePx * 1.3) / H;
    lines.forEach((l, k) => text(l, x, y + k * step, size, color, align, weight));
    return lines.length * step;
  }

  function disc(x, y, r, alpha = 1, color = COLORS.ink) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px(x), px(y), px(r), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function ring(x, y, r, width, color = COLORS.ink, alpha = 1, a0 = 0, a1 = TAU) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = px(width);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(px(x), px(y), px(r), a0, a1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function line(points, width, color = COLORS.ink, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color ?? COLORS.ink;
    ctx.lineWidth = px(width);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([x, y], k) => (k ? ctx.lineTo(px(x), px(y)) : ctx.moveTo(px(x), px(y))));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function poly(points, alpha = 1, color = COLORS.ink) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], k) => (k ? ctx.lineTo(px(x), px(y)) : ctx.moveTo(px(x), px(y))));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function star(x, y, r, rot = 0, alpha = 1, color = COLORS.ink) {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = rot - Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    poly(pts, alpha, color);
  }

  function rock(x, y, r, rot = 0, seed = 1, alpha = 1, color = COLORS.ink) {
    const pts = [];
    for (let k = 0; k < 9; k++) {
      const a = rot + (k / 9) * TAU;
      const rr = r * (0.75 + 0.25 * Math.abs(Math.sin(seed * 7.13 + k * 2.7)));
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    poly(pts, alpha, color);
  }

  function panel(x, y, w, h, alpha = 0.9) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(24, 20, 17)';
    const r = px(0.02);
    ctx.beginPath();
    ctx.roundRect(px(x), px(y), px(w), px(h), r);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Portal / guide icons, all drawn as shadow silhouettes.
  function icon(shape, x, y, r, alpha = 1, color = COLORS.ink) {
    switch (shape) {
      case 'orb':
        disc(x, y, r, alpha, color);
        ring(x, y, r * 0.62, r * 0.14, COLORS.gold, alpha);
        break;
      case 'balloon':
        disc(x, y - r * 0.15, r * 0.85, alpha, color);
        poly([[x - r * 0.15, y + r * 0.85], [x + r * 0.15, y + r * 0.85], [x, y + r * 0.65]], alpha, color);
        line([[x, y + r * 0.85], [x + r * 0.1, y + r * 1.3]], r * 0.07, color, alpha);
        break;
      case 'rock':
        rock(x, y, r, 0.3, 3, alpha, color);
        break;
      case 'net':
        disc(x - r * 0.45, y, r * 0.42, alpha, color);
        line([[x + r * 0.25, y - r], [x + r * 0.25, y + r]], r * 0.16, color, alpha);
        disc(x + r * 0.72, y + r * 0.1, r * 0.2, alpha, color);
        break;
      case 'target':
        ring(x, y, r * 0.85, r * 0.2, color, alpha);
        ring(x, y, r * 0.5, r * 0.16, color, alpha);
        disc(x, y, r * 0.22, alpha, COLORS.gold);
        break;
      case 'brush':
        line([[x - r * 0.7, y + r * 0.7], [x + r * 0.3, y - r * 0.3]], r * 0.25, color, alpha);
        poly([[x + r * 0.2, y - r * 0.45], [x + r * 0.45, y - r * 0.2], [x + r * 0.9, y - r * 0.9]], alpha, color);
        break;
      case 'star':
        star(x, y, r, 0, alpha, color);
        break;
      case 'help':
        disc(x, y, r, alpha, color);
        text('?', x, y + r * 0.05, r * 1.3, COLORS.wallLight, 'center', 800);
        break;
      default:
        disc(x, y, r, alpha, color);
    }
  }

  const kit = {
    ctx, px, text, textBlock, disc, ring, line, poly, star, rock, panel, icon, COLORS,
    get aspect() { return W / H; },
    get time() { return time; },
  };

  // ---- event effects -------------------------------------------------------

  function burst(x, y, r, color, n = 10) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.random() * 0.4;
      const sp = 0.25 + Math.random() * 0.45;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: r * (0.15 + Math.random() * 0.2), life: 0.6, age: 0, color });
    }
  }

  function floatText(str, x, y, color, size = 0.06) {
    particles.push({ text: str, x, y, vx: 0, vy: -0.15, life: 0.9, age: 0, color, size });
  }

  function emit(ev) {
    const playerColor = COLORS.players[ev.player] ?? COLORS.ink;
    switch (ev.type) {
      case 'pop': {
        burst(ev.x, ev.y, ev.r ?? 0.05, ev.kind === 'gold' ? COLORS.gold : COLORS.ink, ev.kind === 'gold' ? 18 : 10);
        const label = ev.label || (ev.smash ? 'smash!' : '');
        floatText(`+${ev.coop ? ev.points * 2 : ev.points}${label ? ` ${label}` : ''}`, ev.x, ev.y,
          ev.coop ? COLORS.gold : playerColor);
        break;
      }
      case 'hit':
        burst(ev.x, ev.y, ev.r ?? 0.05, COLORS.danger, 12);
        floatText(String(ev.points), ev.x, ev.y, COLORS.danger);
        break;
      case 'bounce':
        floatText(String(ev.count), ev.x, ev.y - 0.06, playerColor, 0.045);
        break;
      case 'score':
        floatText(ev.text ?? `+${ev.points ?? 1}`, ev.x, ev.y, playerColor, 0.07);
        break;
      case 'miss':
        if (ev.x || ev.y) floatText('miss', ev.x, Math.min(0.92, ev.y), COLORS.ink, 0.045);
        break;
      case 'correct':
      case 'wrong':
        floatText(`${ev.points > 0 ? '+' : ''}${ev.points}`, ev.player === 1 ? W / H * 0.75 : W / H * 0.25, 0.65,
          ev.type === 'wrong' ? COLORS.danger : playerColor, 0.07);
        break;
      case 'select':
        burst(ev.x, ev.y, 0.08, COLORS.gold, 20);
        break;
      case 'expire':
        particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, r: ev.r, grow: true, life: 0.4, age: 0, color: COLORS.ink });
        break;
    }
  }

  function drawParticles(dt) {
    particles = particles.filter((p) => (p.age += dt) < p.life);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      if (p.text) {
        ctx.globalAlpha = k;
        text(p.text, p.x, p.y, p.size ?? 0.06, p.color);
      } else {
        disc(p.x, p.y, p.grow ? p.r * (1 + p.age / p.life) : p.r * k, k * (p.grow ? 0.5 : 1), p.color);
      }
    }
    ctx.globalAlpha = 1;
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
    for (const h of hands) {
      if (h.grip) disc(h.x, h.y, 0.025, 1, COLORS.players[h.player]);
      else ring(h.x, h.y, 0.035, 0.008, COLORS.players[h.player]);
    }
  }

  function drawPlayerMarkers(slots, Hm, aspect) {
    for (const slot of slots) {
      const head = slot.det?.landmarks?.[0];
      if (!head) continue;
      const [s, t] = applyH(Hm, head.x, head.y);
      text(`P${slot.id + 1}`, s * aspect, Math.max(0.04, t - 0.14), 0.045, COLORS.players[slot.id]);
    }
  }

  function drawHud(s) {
    const { flow, aspect } = s;
    if (flow.phase === Phase.COUNTDOWN) {
      const left = flow.countdown - flow.phaseTime;
      const n = Math.ceil(left);
      const frac = n - left;
      ctx.globalAlpha = 1 - frac;
      text(String(n), aspect / 2, 0.45, 0.26 + frac * 0.1);
      ctx.globalAlpha = 1;
      text(s.game.title, aspect / 2, 0.2, 0.07);
      textBlock(s.game.blurb, aspect / 2, 0.66, 0.034, aspect * 0.85);
    } else if (flow.phase === Phase.PLAYING) {
      const hud = s.game.hud(s.gameState, s.players);
      text(String(Math.ceil(flow.timeLeft)), aspect / 2, 0.06, 0.07, flow.timeLeft <= 5 ? COLORS.danger : COLORS.ink);
      if (hud.center) text(hud.center, aspect / 2, 0.12, 0.032, COLORS.ink, 'center', 600);
      if (hud.scores) {
        text(String(hud.scores[0]), 0.04, 0.06, 0.07, COLORS.players[0], 'left');
        if (hud.showP2) text(String(hud.scores[1]), aspect - 0.04, 0.06, 0.07, COLORS.players[1], 'right');
      }
    } else if (flow.phase === Phase.RESULTS) {
      const r = s.result;
      text(r.headline, aspect / 2, 0.28, 0.1, r.headlineColor === null ? COLORS.ink : COLORS.players[r.headlineColor]);
      r.lines.forEach((l, k) => text(l, aspect / 2, 0.4 + k * 0.07, k === 0 ? 0.06 : 0.04, COLORS.ink, 'center', k === 0 ? 800 : 600));
      if (r.value !== null) {
        const bestLine = r.value > s.bestBefore ? '★ new best' : `best ${s.bestBefore}`;
        text(bestLine, aspect / 2, 0.42 + r.lines.length * 0.07, 0.04, COLORS.ink, 'center', 600);
      }
      text(`${s.game.title} · stay for the home screen`, aspect / 2, 0.86, 0.032, COLORS.ink, 'center', 500);
    }
    if (s.exitProgress > 0) {
      ring(aspect / 2, 0.93, 0.03, 0.008, COLORS.danger, 1, -Math.PI / 2, -Math.PI / 2 + TAU * s.exitProgress);
      text('hands up to exit…', aspect / 2, 0.87, 0.03, COLORS.danger, 'center', 600);
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
      `players ${s.players} · ${s.flow.phase}${s.game ? ` · ${s.game.id}` : ''}`,
    ];
    if (s.handTrackerName) lines.push(`${s.handTrackerName} ${s.stats.handMs.toFixed(1)} ms`);
    for (const h of s.hands) lines.push(`P${h.player + 1}${h.side} ${h.gesture}${h.grip ? ' (grip)' : ''}`);
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
    kit,
    get aspect() {
      return W / H;
    },
    draw(s, dt) {
      time = s.time;
      drawWall(s.wake);
      if (s.drawShadows) drawShadows(s.slots, s.invH);
      const { phase } = s.flow;
      if (phase === Phase.ATTRACT || phase === Phase.HOME) {
        drawHome(s.home, kit, { active: phase === Phase.HOME });
      } else if (phase === Phase.COUNTDOWN || phase === Phase.PLAYING) {
        s.game.draw(s.gameState, kit);
      }
      drawParticles(dt);
      if (phase !== Phase.ATTRACT) {
        drawHands(s.hands);
        drawPlayerMarkers(s.slots, s.H, s.aspect);
      }
      drawHud(s);
      if (s.debug) drawDebug(s);
    },
  };
}
