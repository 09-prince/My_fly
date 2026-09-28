/* Simulation constants for the arena.
 *
 * The circuit ships with the constants tuned for the T-Rex runner, where
 * an obstacle sweeps past sideways. A thrown object approaches head-on,
 * so the detectors need a different gain to fire with useful warning.
 *
 * Chosen by grid search for the longest escape lead subject to four hard
 * constraints: never hit at any throw speed, the Giant Fiber matching the
 * side the throw came from, no flinch at a near miss, and no firing when
 * nothing is there. See test_reflex.js.
 *
 * Gain matters for more than timing. Push it higher and the fly dodges
 * earlier but toward the wrong side: crossed two-hop paths through the
 * interneurons excite the opposite Giant Fiber, and they beat the direct
 * ipsilateral input before it reaches threshold.
 *
 * Several objects in the air at once raise the drive the same way, so the
 * gain here is lower than a single-object arena would need. That costs
 * some warning time, which the higher takeoff speed makes up.
 */
(function (global) {
  "use strict";

  global.ARENA_PARAMS = {
    theta_gain: 0.55,
    dtheta_gain: 6,
    jump_rate: 0.08,

    // Takeoff speed in px per step. Part of the arena, not the circuit.
    escape_speed: 28
  };

})(typeof window !== "undefined" ? window : global);
