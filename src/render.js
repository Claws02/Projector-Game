// Canvas 2D renderer. Everything on the "wall" is drawn as shadow: dark, soft
// shapes on a lit background, so a projector shows them as missing light.

import { affineOf, applyH } from './mapping.js';
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
  const maskCanvases = [];
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
      particles.push({ text: `+${ev.coop ? ev.points * 2 : ev.points}`, x: ev.x, y: ev.y, vx: 0, vy: -0.15,
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

  function drawShadow(slot, Hm) {
    const m = slot.det?.mask;
    if (!m) return;
    let mc = maskCanvases[slot.id];
    if (!mc || mc.width !== m.w || mc.height !== m.h) {
      mc = document.createElement('canvas');
      mc.width = m.w;
      mc.height = m.h;
      mc.img = mc.getContext('2d').createImageData(m.w, m.h);
      maskCanvases[slot.id] = mc;
    }
    const px4 = mc.img.data;
    for (let k = 0; k < m.data.length; k++) {
      px4[k * 4] = 18;
      px4[k * 4 + 1] = 16;
      px4[k * 4 + 2] = 14;
      px4[k * 4 + 3] = Math.min(255, m.data[k] * 235);
    }
    mc.getContext('2d').putImageData(mc.img, 0, 0);

    // Soften edges on a small 4x canvas: blurring at screen size costs ~3x fps.
    const UP = 4;
    let soft = maskCanvases[`soft${slot.id}`];
    if (!soft || soft.width !== m.w * UP || soft.height !== m.h * UP) {
      soft = document.createElement('canvas');
      soft.width = m.w * UP;
      soft.height = m.h * UP;
      maskCanvases[`soft${slot.id}`] = soft;
    }
    const sctx = soft.getContext('2d');
    sctx.clearRect(0, 0, soft.width, soft.height);
    sctx.filter = 'blur(1.5px)'; // ignored where unsupported; bilinear upscale still softens
    sctx.drawImage(mc, 0, 0, soft.width, soft.height);
    sctx.filter = 'none';

    const { a, b, c, d, e, f } = affineOf(Hm);
    const sw = soft.width;
    const sh = soft.height;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform((W * a) / sw, (H * b) / sw, (W * c) / sh, (H * d) / sh, W * e, H * f);
    ctx.drawImage(soft, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.25);
    g.addColorStop(0, `rgba(20,17,15,${0.92 * alpha})`);
    g.addColorStop(0.75, `rgba(20,17,15,${0.75 * alpha})`);
    g.addColorStop(1, 'rgba(20,17,15,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
    ctx.fill();

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
      `${s.stats.fps.toFixed(0)} fps · ${s.trackerName} ${s.stats.inferMs.toFixed(1)} ms`,
      `players ${s.playerCount} · phase ${s.round.phase} · orbs ${s.field.orbs.length}`,
    ];
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
      if (s.drawShadows) for (const slot of s.slots) drawShadow(slot, s.H);
      for (const o of s.field.orbs) drawOrb(o, s.field.time);
      drawParticles(dt);
      if (s.round.phase !== Phase.ATTRACT) {
        for (const slot of s.slots) drawPlayerMarker(slot, s.H, s.aspect);
      }
      drawHud(s);
      if (s.debug) drawDebug(s);
    },
  };
}
