/* The fly's looming-escape circuit, as leaky integrate-and-fire neurons.
 *
 * Wiring, synapse counts and neurotransmitter signs come from the male
 * CNS v1.0 connectome. Nothing here is trained.
 *
 * The two Giant Fibers are read separately. In this dataset DNp01_L
 * receives direct input only from left-eye detectors and DNp01_R only
 * from right-eye ones, so which one fires says which side the threat
 * came from.
 */

(function (global) {
  "use strict";

  function Fly(data, overrides) {
    var i, p = {};

    Object.keys(data.params).forEach(function (k) { p[k] = data.params[k]; });
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });

    this.p = p;
    this.nodes = data.nodes;
    this.n = data.nodes.length;

    // Keep the seeded recruitment order, but split it by eye.
    this.pool = { L: { lc4: [], lplc2: [] }, R: { lc4: [], lplc2: [] } };

    var self = this;
    ["lc4", "lplc2"].forEach(function (kind) {
      data.order[kind].forEach(function (idx) {
        self.pool[data.nodes[idx].side][kind].push(idx);
      });
    });

    // Signed, scaled weights straight from the connectome.
    this.W = new Float32Array(this.n * this.n);

    for (i = 0; i < data.edges.length; i++) {
      var e = data.edges[i];
      var s = this.nodes[e[0]].sign;
      if (s < 0) s *= p.inhibition;
      this.W[e[0] * this.n + e[1]] += e[2] * s * p.w_scale;
    }

    this.gf = { L: -1, R: -1 };
    for (i = 0; i < this.n; i++) {
      if (this.nodes[i].role === "output") this.gf[this.nodes[i].side] = i;
    }

    this.v = new Float32Array(this.n);
    this.spikes = new Float32Array(this.n);
    this.drive = new Float32Array(this.n);
    this.rec = new Float32Array(this.n);
    this.lit = new Float32Array(this.n);

    this.reset();
  }

  Fly.prototype.reset = function () {
    this.v.fill(0);
    this.spikes.fill(0);
    this.lit.fill(0);

    this.rate = { L: 0, R: 0 };
    this.theta = { L: 0, R: 0 };
    this.dtheta = { L: 0, R: 0 };
    this.firing = 0;
  };

  /* One timestep.
   *
   * `view` carries the angular size the left and right eye each see:
   * { L: radians, R: radians }. Everything downstream of that is the
   * connectome.
   */
  Fly.prototype.step = function (view) {
    var p = this.p, n = this.n, i, j, side;

    this.drive.fill(0);

    var self = this;

    function recruit(pool, signal, gain) {
      var k = Math.floor(Math.min(Math.max(signal * gain, 0), 1) * pool.length);
      for (var q = 0; q < k; q++) self.drive[pool[q]] = p.drive;
    }

    for (side in this.pool) {
      var theta = view[side] || 0;
      var raw = theta - this.theta[side];

      this.dtheta[side] = this.dtheta[side] * p.smooth + raw * (1 - p.smooth);
      this.theta[side] = theta;

      // Angular size recruits LPLC2; growth rate recruits LC4.
      recruit(this.pool[side].lplc2, theta, p.theta_gain);
      recruit(this.pool[side].lc4, Math.max(this.dtheta[side], 0), p.dtheta_gain);
    }

    // Recurrent current from last step's spikes.
    this.rec.fill(0);

    for (i = 0; i < n; i++) {
      if (this.spikes[i] === 0) continue;
      var base = i * n;
      for (j = 0; j < n; j++) this.rec[j] += this.W[base + j];
    }

    var firing = 0;

    for (i = 0; i < n; i++) {
      var v = this.v[i] * p.tau + this.drive[i] + this.rec[i];

      if (v >= p.threshold) {
        this.spikes[i] = 1;
        this.lit[i] = 1;
        v = 0;
        firing++;
      } else {
        this.spikes[i] = 0;
        this.lit[i] *= 0.82;
      }

      this.v[i] = v < -2 ? -2 : v;
    }

    this.firing = firing;

    // Read the two Giant Fibers apart, not averaged together.
    for (side in this.rate) {
      var spike = this.spikes[this.gf[side]];
      this.rate[side] = this.rate[side] * p.rate_tau + spike * (1 - p.rate_tau);
    }

    return this.rate;
  };

  /* Escape decision.
   *
   * Firing is the fly's own; the direction is this model's readout of
   * the left/right imbalance. A real fly sets its escape direction with
   * leg posture before takeoff (Card & Dickinson 2008), not with the
   * Giant Fibers.
   */
  Fly.prototype.escape = function () {
    var L = this.rate.L, R = this.rate.R;

    if (Math.max(L, R) < this.p.jump_rate) return null;

    return {
      side: L > R ? "L" : "R",
      away: L > R ? 1 : -1,          // threat on the left -> go right
      strength: Math.max(L, R)
    };
  };

  global.Fly = Fly;

})(typeof window !== "undefined" ? window : global);
