/* The patch of grass the fly is sitting on.
 *
 * Drawn once into an offscreen canvas at startup and blitted each frame.
 * Redrawing thousands of grass blades at 60fps would stutter, and the
 * ground never changes anyway.
 *
 * Everything here is scenery. The blades, clover and soil are not
 * obstacles, and they are never shown to the fly: the circuit only ever
 * sees what is diving at it.
 */

(function (global) {
  "use strict";

  // Seeded so the ground looks the same on every load.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function blade(ctx, x, y, len, lean, width, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - width, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - len * 0.6, x + lean, y - len);
    ctx.quadraticCurveTo(x + lean * 0.4, y - len * 0.6, x + width, y);
    ctx.closePath();
    ctx.fill();
  }

  function clover(ctx, x, y, r, rand) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * 6.2832);

    for (var i = 0; i < 3; i++) {
      ctx.rotate(2.094);
      ctx.fillStyle = "rgba(96,150,72,0.85)";
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.8, r * 0.62, r * 0.8, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = "rgba(140,190,110,0.30)";
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.85, r * 0.34, r * 0.45, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Build the ground. Returns a canvas the arena can blit. */
  function build(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;

    var ctx = c.getContext("2d");
    var rand = rng(11);
    var i;

    // Counts are per unit area, so a wide screen gets denser grass
    // rather than the same blades spread thinner.
    var density = (w * h) / (1200 * 520);

    // --- soil underneath ----------------------------------------------
    var base = ctx.createLinearGradient(0, 0, w * 0.25, h);
    base.addColorStop(0, "#3d5a2a");
    base.addColorStop(0.5, "#33501f");
    base.addColorStop(1, "#28401a");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // A few bare patches, so it is not a flat green field.
    for (i = 0; i < Math.round(22 * density); i++) {
      var px = rand() * w, py = rand() * h;
      var pr = 30 + rand() * 90;

      var soil = ctx.createRadialGradient(px, py, 0, px, py, pr);
      soil.addColorStop(0, "rgba(82,64,40,0.30)");
      soil.addColorStop(1, "rgba(82,64,40,0)");
      ctx.fillStyle = soil;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, 6.2832);
      ctx.fill();
    }

    // --- grass, back to front so the near blades sit on top -------------
    var SHADES = [
      "rgba(44,74,30,0.95)",
      "rgba(58,96,38,0.95)",
      "rgba(74,118,48,0.92)",
      "rgba(92,140,58,0.90)",
      "rgba(112,162,70,0.85)"
    ];

    for (var layer = 0; layer < SHADES.length; layer++) {
      var count = Math.round((1100 - layer * 130) * density);
      var scale = 0.6 + layer * 0.16;

      for (i = 0; i < count; i++) {
        var x = rand() * w;
        var y = rand() * (h + 40);
        var len = (16 + rand() * 38) * scale;
        var lean = (rand() - 0.5) * 26 * scale;

        blade(ctx, x, y, len, lean, 1 + rand() * 1.6 * scale, SHADES[layer]);
      }
    }

    // --- a little clover ------------------------------------------------
    for (i = 0; i < Math.round(26 * density); i++) {
      clover(ctx, 40 + rand() * (w - 80), 40 + rand() * (h - 80), 7 + rand() * 7, rand);
    }

    // --- sunlight from the upper left -----------------------------------
    var sun = ctx.createRadialGradient(w * 0.24, -h * 0.3, 40,
                                       w * 0.24, -h * 0.3, h * 2.2);
    sun.addColorStop(0, "rgba(255,247,198,0.30)");
    sun.addColorStop(0.5, "rgba(240,240,180,0.08)");
    sun.addColorStop(1, "rgba(220,235,170,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    // --- vignette, so the middle reads as the lit patch -------------------
    var vig = ctx.createRadialGradient(w * 0.5, h * 0.48, h * 0.36,
                                       w * 0.5, h * 0.48, h * 1.05);
    vig.addColorStop(0, "rgba(10,24,6,0)");
    vig.addColorStop(1, "rgba(10,24,6,0.46)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    return c;
  }

  global.Scene = { build: build };

})(window);
