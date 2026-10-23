// Synthesized sound effects (Web Audio, no asset files).
// Browsers only allow audio after a user gesture unless the kiosk is launched
// with --autoplay-policy=no-user-gesture-required; call unlock() from a tap.

// Major pentatonic steps (semitones). Each combo pop climbs the scale.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE_HZ = [261.63, 392.0]; // P1 C4, P2 G4: players are distinguishable by ear

export function createAudio() {
  let ctx = null;
  let master = null;
  let lastNudge = 0;

  const ready = () => ctx && ctx.state === 'running';

  function tone(freq, { type = 'sine', dur = 0.18, gain = 0.25, slide = 1, delay = 0 } = {}) {
    if (!ready()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const note = (base, step) => base * 2 ** (PENTA[Math.min(step, PENTA.length - 1)] / 12);

  return {
    unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
      }
      if (ctx.state !== 'running') ctx.resume();
    },

    pop(player, combo) {
      const f = note(BASE_HZ[player] ?? BASE_HZ[0], combo);
      tone(f, { type: 'triangle', dur: 0.16, gain: 0.3, slide: 1.5 });
    },

    goldTouch(player) {
      tone((BASE_HZ[player] ?? BASE_HZ[0]) * 2, { type: 'sine', dur: 0.25, gain: 0.15 });
    },

    goldPop() {
      [0, 4, 7, 12].forEach((s, k) =>
        tone(523.25 * 2 ** (s / 12), { type: 'triangle', dur: 0.35, gain: 0.22, delay: k * 0.06 }));
    },

    nudge() {
      if (!ready() || ctx.currentTime - lastNudge < 0.12) return;
      lastNudge = ctx.currentTime;
      tone(140 + Math.random() * 60, { type: 'sine', dur: 0.12, gain: 0.18, slide: 0.7 });
    },

    grab(player) {
      tone((BASE_HZ[player] ?? BASE_HZ[0]) / 2, { type: 'sine', dur: 0.1, gain: 0.25, slide: 1.3 });
    },

    throw(speed) {
      tone(300 + Math.min(speed, 2.5) * 200, { type: 'sawtooth', dur: 0.22, gain: 0.07, slide: 0.4 });
    },

    wake() {
      tone(110, { type: 'sine', dur: 1.6, gain: 0.25, slide: 4 });
      tone(165, { type: 'triangle', dur: 1.6, gain: 0.1, slide: 4, delay: 0.1 });
    },

    sleep() {
      tone(440, { type: 'sine', dur: 1.2, gain: 0.15, slide: 0.25 });
    },

    countdown(n) {
      tone(n > 0 ? 440 : 880, { type: 'square', dur: n > 0 ? 0.1 : 0.3, gain: 0.08 });
    },

    tick() {
      tone(1200, { type: 'square', dur: 0.05, gain: 0.06 });
    },

    roundEnd() {
      [12, 7, 4, 0].forEach((s, k) =>
        tone(261.63 * 2 ** (s / 12), { type: 'triangle', dur: 0.4, gain: 0.2, delay: k * 0.12 }));
    },
  };
}
