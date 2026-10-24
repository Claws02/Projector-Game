// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): an adaptive low-pass
// filter for noisy interactive signals. The cutoff rises with speed, so it is
// rock-steady when you hold still and still snappy when you move fast.
//
//   minCutoff  Hz, smoothing at rest (lower = steadier, more lag when slow)
//   beta       how quickly the cutoff opens up with speed (higher = less lag)
//   dCutoff    Hz, smoothing of the speed estimate itself

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuro {
  constructor({ minCutoff = 1.0, beta = 12.0, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;   // filtered value
    this.dx = 0;     // filtered derivative (units per second)
    this.raw = null; // previous raw sample
    this.t = null;
  }

  // Feeds sample x taken at time t (seconds). Returns the filtered value.
  filter(x, t) {
    if (this.x === null || this.t === null || t <= this.t) {
      if (this.x === null) this.x = x;
      this.raw = x;
      this.t = t;
      return this.x;
    }
    const dt = t - this.t;
    this.t = t;
    // Derivative from raw samples (not the lagging filtered value), so it's an
    // unbiased speed estimate for prediction.
    const rawDx = (x - this.raw) / dt;
    this.raw = x;
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }

  // Filtered value extrapolated to time t using the smoothed derivative.
  // Used to render between camera frames (latency compensation); capped so a
  // stale track never flies off.
  predict(t, maxLead = 0.1) {
    if (this.x === null) return 0;
    const lead = Math.min(maxLead, Math.max(0, t - this.t));
    return this.x + this.dx * lead;
  }
}

// A 2D point filter: one OneEuro per axis.
export class OneEuro2 {
  constructor(opts) {
    this.fx = new OneEuro(opts);
    this.fy = new OneEuro(opts);
  }

  filter(x, y, t) {
    return [this.fx.filter(x, t), this.fy.filter(y, t)];
  }

  predict(t, maxLead) {
    return [this.fx.predict(t, maxLead), this.fy.predict(t, maxLead)];
  }

  get velocity() {
    return [this.fx.dx, this.fy.dx];
  }
}
