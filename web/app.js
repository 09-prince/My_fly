/* Arena, throwing, and the panels.
 *
 * The fly sits in the grass facing left. Drag anywhere to throw at
 * it; several objects can be in the air at once, and each eye responds
 * to the strongest looming signal it can see.
 *
 * Nothing in here changes what the circuit does. The grass, soil and
 * clover are scenery, and the fly is never shown anything but the birds
 * diving at it.
 */

(function () {
  "use strict";

  var arena = document.getElementById("arena");
  var actx = arena.getContext("2d");
  var brain = document.getElementById("brain");
  var bctx = brain.getContext("2d");

  var COLORS = {
    LC4: "#31d7c9",
    LPLC2: "#f0a33c",
    inter: "#5a6678",
    gfL: "#ff2d6f",
    gfR: "#b06bff"
  };

  var el = {
    escapes: document.getElementById("hud-escapes"),
    hits: document.getElementById("hud-hits"),
    spikes: document.getElementById("hud-spikes"),
    spikes2: document.getElementById("hud-spikes-2"),
    tl: document.getElementById("hud-tl"),
    tr: document.getElementById("hud-tr"),
    state: document.getElementById("hud-state"),
    hint: document.getElementById("hint"),
    speed: document.getElementById("speed"),
    speedOut: document.getElementById("speed-out"),
    pause: document.getElementById("btn-pause"),
    replay: document.getElementById("btn-replay"),
    reset: document.getElementById("btn-reset")
  };

  // r is the collision radius, kept in step with FLY_SCALE below.
  // x and y are set by resize(), which follows the window.
  var HOME = { x: 0, y: 0, r: 9 };

  var OBJ_R = 19;

  // Where the fly points, as a screen angle: 0 up, +PI/2 right, -PI/2
  // left. Facing left means its left eye covers the lower half of the
  // arena and its right eye the upper half.
  var FACING = -Math.PI / 2;

  var fly = new Fly(window.CIRCUIT, window.ARENA_PARAMS);
  var body = { x: HOME.x, y: HOME.y, vx: 0, vy: 0, airborne: 0 };

  var shots = [];
  var aim = null;
  var flash = 0;
  var tally = { escapes: 0, hits: 0 };
  var verdict = null;
  var settle = 0;
  var returning = false;

  var table = null;
  var trace = new Trace(document.getElementById("trace"),
                        { L: COLORS.gfL, R: COLORS.gfR });

  // ------------------------------------------------------------------
  // replay: the simulation is deterministic from resetFly(), so a throw
  // only needs its launch step and velocity to be reproduced exactly.
  // ------------------------------------------------------------------

  var stepNo = 0;
  var log = [];
  var replay = null;
  var paused = false;

  // ------------------------------------------------------------------
  // brain layout: mirror x so the fly's left lands on the screen's left
  // ------------------------------------------------------------------

  var brainView = new Brain(brain, COLORS);

  // ------------------------------------------------------------------
  // fitting the window
  //
  // The canvases are sized in real pixels so the grass stays sharp on a
  // wide screen instead of being stretched from a fixed 1200px.
  // ------------------------------------------------------------------

  function resize() {
    // CSS lays the boxes out; here we only match each canvas's pixel
    // buffer to the box it was given, so nothing is stretched.
    function fit(canvas) {
      var w = Math.max(80, Math.round(canvas.offsetWidth));
      var h = Math.max(80, Math.round(canvas.offsetHeight));
      var changed = canvas.width !== w || canvas.height !== h;

      canvas.width = w;
      canvas.height = h;

      return changed;
    }

    var moved = fit(arena);
    fit(trace.canvas);
    fit(brain);

    if (moved || !table) table = Scene.build(arena.width, arena.height);

    brainView.layout();

    HOME.x = arena.width * 0.74;
    HOME.y = arena.height * 0.50;

    // Only move the fly if it is not mid-escape.
    if (!body.airborne) { body.x = HOME.x; body.y = HOME.y; }
  }

  // ------------------------------------------------------------------
  // throwing
  // ------------------------------------------------------------------

  function pointAt(ev) {
    var box = arena.getBoundingClientRect();
    return {
      x: (ev.clientX - box.left) / box.width * arena.width,
      y: (ev.clientY - box.top) / box.height * arena.height
    };
  }

  function launch(x, y, vx, vy) {
    shots.push({ x: x, y: y, vx: vx, vy: vy, r: OBJ_R, trail: [] });
  }

  arena.addEventListener("pointerdown", function (ev) {
    if (replay) return;
    arena.setPointerCapture(ev.pointerId);
    aim = { from: pointAt(ev), to: pointAt(ev) };
  });

  arena.addEventListener("pointermove", function (ev) {
    if (aim) aim.to = pointAt(ev);
  });

  arena.addEventListener("pointerup", function () {
    if (!aim) return;

    var from = aim.from, to = aim.to;
    var dx = to.x - from.x, dy = to.y - from.y;

    // A tap with no drag is thrown straight at the fly.
    if (Math.hypot(dx, dy) < 12) {
      dx = body.x - from.x;
      dy = body.y - from.y;
    }

    var len = Math.hypot(dx, dy) || 1;
    var speed = Number(el.speed.value);
    var vx = dx / len * speed, vy = dy / len * speed;

    launch(from.x, from.y, vx, vy);
    log.push({ step: stepNo, x: from.x, y: from.y, vx: vx, vy: vy });

    verdict = null;
    settle = 0;
    aim = null;
    paused = false;

    el.hint.hidden = true;
  });

  el.speed.addEventListener("input", function () {
    el.speedOut.value = el.speed.value;
  });

  function resetFly() {
    body.x = HOME.x;
    body.y = HOME.y;
    returning = false;
    body.vx = 0;
    body.vy = 0;
    body.airborne = 0;
    fly.reset();

    stepNo = 0;
    if (!replay) log = [];
  }

  // ------------------------------------------------------------------
  // controls
  // ------------------------------------------------------------------

  function setPaused(on) {
    paused = on;
    el.pause.textContent = on ? "Resume" : "Pause";
    el.pause.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function startReplay() {
    if (!log.length || replay) return;

    replay = { queue: log.slice() };

    shots.length = 0;
    verdict = null;
    settle = 0;
    setPaused(false);
    resetFly();
    trace.clear();
  }

  function endReplay() {
    replay = null;
    shots.length = 0;
    resetFly();
  }

  function resetAll() {
    replay = null;
    shots.length = 0;
    verdict = null;
    settle = 0;
    tally.escapes = 0;
    tally.hits = 0;
    el.escapes.textContent = "0";
    el.hits.textContent = "0";
    setPaused(false);
    resetFly();
    trace.clear();
    el.hint.hidden = false;
  }

  el.pause.addEventListener("click", function () { setPaused(!paused); });
  el.replay.addEventListener("click", startReplay);
  el.reset.addEventListener("click", resetAll);

  document.addEventListener("keydown", function (ev) {
    if (ev.target.tagName === "INPUT") return;

    if (ev.code === "Space") { ev.preventDefault(); setPaused(!paused); }
    if (ev.code === "KeyR") startReplay();
  });

  // ------------------------------------------------------------------
  // one simulation step
  // ------------------------------------------------------------------

  function tick() {
    var i, s;

    // Re-inject a recorded throw at the step it originally happened.
    if (replay) {
      while (replay.queue.length && replay.queue[0].step === stepNo) {
        var t = replay.queue.shift();
        launch(t.x, t.y, t.vx, t.vy);
      }
    }

    stepNo++;

    // --- move everything in flight ------------------------------------
    for (i = shots.length - 1; i >= 0; i--) {
      s = shots[i];

      s.x += s.vx;
      s.y += s.vy;

      s.trail.push([s.x, s.y]);
      if (s.trail.length > 34) s.trail.shift();

      if (s.x < -120 || s.x > arena.width + 120 ||
          s.y < -120 || s.y > arena.height + 120) {
        shots.splice(i, 1);
      }
    }

    // --- what the eyes see --------------------------------------------
    //
    // With several objects in the air each eye takes the strongest
    // looming signal available to it, not the sum: LC4 and LPLC2 respond
    // to the most threatening thing in view.
    var view = { L: 0, R: 0 };
    var nearest = Infinity;
    var closest = null;

    for (i = 0; i < shots.length; i++) {
      var v = Vision.look(body, shots[i], FACING);

      if (v.L > view.L) view.L = v.L;
      if (v.R > view.R) view.R = v.R;

      if (v.dist < nearest) { nearest = v.dist; closest = shots[i]; }
    }

    fly.step(view);

    // --- the escape ----------------------------------------------------
    var fired = false;

    if (!body.airborne && closest) {
      var esc = fly.escape();

      if (esc) {
        var ax = closest.x - body.x, ay = closest.y - body.y;
        var len = Math.hypot(ax, ay) || 1;
        var kick = fly.p.escape_speed;

        // Perpendicular to the incoming line, away from the side that fired.
        body.vx = (-ay / len) * esc.away * kick - (ax / len) * kick * 0.45;
        body.vy = (ax / len) * esc.away * kick - (ay / len) * kick * 0.45;

        body.airborne = 44;
        flash = 1;
        fired = true;

        if (!replay) {
          tally.escapes++;
          el.escapes.textContent = tally.escapes;
        }

        verdict = { text: "DNp01_" + esc.side + " fired", ok: true, age: 0 };
      }
    }

    trace.push(fly.rate.L, fly.rate.R, fired);

    if (body.airborne > 0) {
      body.x += body.vx;
      body.y += body.vy;
      body.vx *= 0.94;
      body.vy *= 0.94;
      body.airborne--;

      // Bounce off the edges rather than leaving the patch.
      var m = 30;
      if (body.x < m) { body.x = m; body.vx = Math.abs(body.vx) * 0.5; }
      if (body.x > arena.width - m) { body.x = arena.width - m; body.vx = -Math.abs(body.vx) * 0.5; }
      if (body.y < m) { body.y = m; body.vy = Math.abs(body.vy) * 0.5; }
      if (body.y > arena.height - m) { body.y = arena.height - m; body.vy = -Math.abs(body.vy) * 0.5; }
    }

    // --- did anything get it -------------------------------------------
    if (!body.airborne) {
      for (i = 0; i < shots.length; i++) {
        var gap = Math.hypot(shots[i].x - body.x, shots[i].y - body.y);

        if (gap < HOME.r + shots[i].r) {
          if (!replay) {
            tally.hits++;
            el.hits.textContent = tally.hits;
          }
          verdict = { text: "hit", ok: false, age: 0 };
          shots.length = 0;
          settle = 34;
          break;
        }
      }
    }

    if (verdict) verdict.age++;

    // Between dodges the fly makes its way back to its spot. Without
    // this it keeps the ground it gained on every escape and ends up
    // pinned against an edge with nowhere left to jump.
    if (!body.airborne) {
      var hx = HOME.x - body.x, hy = HOME.y - body.y;

      if (Math.abs(hx) > 0.4 || Math.abs(hy) > 0.4) {
        body.x += hx * 0.045;
        body.y += hy * 0.045;
        returning = true;
      } else {
        body.x = HOME.x;
        body.y = HOME.y;
        returning = false;
      }
    }

    // A hit ends the round outright.
    if (settle > 0 && --settle === 0) resetFly();

    if (replay && !replay.queue.length && !shots.length && !body.airborne) {
      endReplay();
    }

    flash *= 0.9;
  }

  // ------------------------------------------------------------------
  // drawing
  // ------------------------------------------------------------------

  // A real fruit fly is about 2.5mm. Drawn small so the ground reads as
  // open space rather than a crowded box.
  var FLY_SCALE = 0.62;

  function shadow(ctx, x, y, rx, ry, strength) {
    ctx.globalAlpha = strength;
    ctx.fillStyle = "#0d1a08";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFlyBody(ctx, x, y, lift) {
    // The shadow stays on the ground and slides away as the fly rises.
    shadow(ctx, x + lift * 26 + 3, y + lift * 30 + 4,
           9 + lift * 5, 5 + lift * 3, 0.34 - lift * 0.18);

    // Grass is busy and about as dark as the fly, so give it a small
    // pool of light to sit in. Without this it vanishes into the blades.
    var hx = x - lift * 5, hy = y - lift * 16;
    var halo = ctx.createRadialGradient(hx, hy, 2, hx, hy, 26);
    halo.addColorStop(0, "rgba(255,252,230,0.30)");
    halo.addColorStop(0.55, "rgba(255,250,220,0.12)");
    halo.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(hx, hy, 26, 0, 6.2832);
    ctx.fill();

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(FACING);
    ctx.scale(FLY_SCALE, FLY_SCALE);

    // wings
    ctx.fillStyle = "rgba(250,253,255,0.62)";
    ctx.beginPath(); ctx.ellipse(-10, -2, 11, 5, -0.5, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -2, 11, 5, 0.5, 0, 6.2832); ctx.fill();

    // abdomen and thorax, dark against pale wood
    ctx.fillStyle = "#1a140d";
    ctx.beginPath(); ctx.ellipse(0, 6, 7, 11, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#2e251a";
    ctx.beginPath(); ctx.ellipse(0, -4, 7, 8, 0, 0, 6.2832); ctx.fill();

    // a little sheen, so it sits under the same light as the table
    ctx.fillStyle = "rgba(230,245,210,0.20)";
    ctx.beginPath(); ctx.ellipse(-2.5, -5, 3, 4.5, -0.4, 0, 6.2832); ctx.fill();

    // the two eyes, which are what the circuit is reading
    ctx.fillStyle = "#e8443a";
    ctx.beginPath(); ctx.arc(-5.5, -11, 4.6, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(5.5, -11, 4.6, 0, 6.2832); ctx.fill();

    ctx.restore();
  }

  /* A bird in a stoop: wings swept back, so its outline stays compact.
   *
   * That matters beyond looks. The fly computes its looming signal from
   * the object's radius, so a bird drawn with a wide spread would claim
   * a threat larger than the circuit is actually being shown. A diving
   * bird tucks its wings, which is both what birds do and what keeps the
   * picture honest.
   */
  function drawPredator(ctx, s, angle) {
    var r = s.r;

    shadow(ctx, s.x + 9, s.y + 11, r * 1.0, r * 0.66, 0.34);

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(angle);

    // swept-back wings
    ctx.fillStyle = "#1c1f27";
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.moveTo(r * 0.1, side * r * 0.18);
      ctx.quadraticCurveTo(-r * 0.7, side * r * 0.95, -r * 1.25, side * r * 0.72);
      ctx.quadraticCurveTo(-r * 0.55, side * r * 0.42, r * 0.05, side * r * 0.1);
      ctx.closePath();
      ctx.fill();
    });

    // body and tail
    ctx.fillStyle = "#252932";
    ctx.beginPath();
    ctx.ellipse(-r * 0.12, 0, r * 0.86, r * 0.42, 0, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = "#1c1f27";
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.22);
    ctx.lineTo(-r * 1.35, 0);
    ctx.lineTo(-r * 0.7, r * 0.22);
    ctx.closePath();
    ctx.fill();

    // head and beak, leading the dive
    ctx.fillStyle = "#2c313c";
    ctx.beginPath();
    ctx.arc(r * 0.62, 0, r * 0.3, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = "#c9a13f";
    ctx.beginPath();
    ctx.moveTo(r * 0.84, -r * 0.09);
    ctx.lineTo(r * 1.22, 0);
    ctx.lineTo(r * 0.84, r * 0.09);
    ctx.closePath();
    ctx.fill();

    // sheen along the back, under the same light as the ground
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#cfe0ff";
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.16, r * 0.5, r * 0.14, -0.2, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawArena() {
    var i, j;

    actx.drawImage(table, 0, 0);

    // The two visual fields, as a faint overlay on the grass. Both carry
    // LC4 and LPLC2, so neither gets a cell-type colour: they brighten
    // with how much that eye is seeing.
    actx.save();
    actx.translate(body.x, body.y);
    actx.rotate(FACING);
    ["L", "R"].forEach(function (side) {
      var lit = Math.min(fly.theta[side] * 1.6, 1);
      actx.globalAlpha = 0.04 + lit * 0.17;
      actx.fillStyle = "#0e1f0a";
      actx.beginPath();
      actx.moveTo(0, 0);
      if (side === "L") actx.arc(0, 0, 520, Math.PI, -Math.PI / 2 + Vision.OVERLAP);
      else actx.arc(0, 0, 520, -Math.PI / 2 - Vision.OVERLAP, 0);
      actx.closePath();
      actx.fill();
    });
    actx.restore();
    actx.globalAlpha = 1;

    // everything in flight, trail first
    for (i = 0; i < shots.length; i++) {
      var s = shots[i];

      for (j = 0; j < s.trail.length; j++) {
        actx.globalAlpha = (j / s.trail.length) * 0.16;
        actx.fillStyle = "#16240e";
        actx.beginPath();
        actx.arc(s.trail[j][0], s.trail[j][1], 2.4, 0, 6.2832);
        actx.fill();
      }
      actx.globalAlpha = 1;

      drawPredator(actx, s, Math.atan2(s.vy, s.vx));
    }

    // aim line while dragging, with a ghost of what is about to be thrown
    if (aim) {
      actx.strokeStyle = "rgba(230,245,215,0.45)";
      actx.lineWidth = 1.5;
      actx.setLineDash([6, 6]);
      actx.beginPath();
      actx.moveTo(aim.from.x, aim.from.y);
      actx.lineTo(aim.to.x, aim.to.y);
      actx.stroke();
      actx.setLineDash([]);
      actx.lineWidth = 1;

      actx.globalAlpha = 0.45;
      drawPredator(actx, { x: aim.from.x, y: aim.from.y, r: OBJ_R },
                   Math.atan2(aim.to.y - aim.from.y, aim.to.x - aim.from.x));
      actx.globalAlpha = 1;
    }

    // the Giant Fiber firing, drawn on the fly itself
    if (flash > 0.02) {
      actx.globalAlpha = flash * 0.55;
      actx.strokeStyle = verdict && verdict.ok ? COLORS.gfL : COLORS.gfL;
      actx.lineWidth = 2.5;
      actx.beginPath();
      actx.arc(body.x, body.y, 20 + (1 - flash) * 55, 0, 6.2832);
      actx.stroke();
      actx.globalAlpha = 1;
      actx.lineWidth = 1;
    }

    drawFlyBody(actx, body.x, body.y, body.airborne / 44);

    // Cause and effect reads better next to the fly than in a corner.
    if (verdict && verdict.age < 75) {
      actx.font = "600 12px 'IBM Plex Mono', monospace";
      actx.textAlign = "center";

      var label = verdict.text;
      var tw = actx.measureText(label).width;
      var lx = Math.min(Math.max(body.x, tw / 2 + 14), arena.width - tw / 2 - 14);
      var ly = Math.max(body.y - 34, 22);

      actx.globalAlpha = Math.min(1, (75 - verdict.age) / 20);

      actx.fillStyle = "rgba(8,20,6,0.78)";
      actx.beginPath();
      actx.roundRect(lx - tw / 2 - 8, ly - 14, tw + 16, 20, 4);
      actx.fill();

      actx.fillStyle = verdict.ok ? "#ff7ba4" : "#ffd27a";
      actx.fillText(label, lx, ly);

      actx.globalAlpha = 1;
      actx.textAlign = "left";
    }

    if (replay) {
      actx.font = "600 11px 'IBM Plex Mono', monospace";
      actx.fillStyle = "rgba(8,20,6,0.78)";
      actx.beginPath();
      actx.roundRect(14, 14, 96, 22, 4);
      actx.fill();
      actx.fillStyle = "#ffd27a";
      actx.fillText("REPLAY  ¼×", 24, 29);
    }

    if (shots.length > 1) {
      actx.font = "500 11px 'IBM Plex Mono', monospace";
      actx.fillStyle = "rgba(226,244,212,0.85)";
      actx.textAlign = "right";
      actx.fillText(shots.length + " in the air", arena.width - 16, 28);
      actx.textAlign = "left";
    }
  }

  // ------------------------------------------------------------------
  // loop
  // ------------------------------------------------------------------

  resize();

  // Open with #demo to throw one automatically, #demo=90 to run that many
  // steps first, or #replay to demonstrate the replay. Used for screenshots.
  function demoThrow(prerun) {
    var from = { x: 150, y: arena.height * 0.32 };
    var dx = body.x - from.x, dy = body.y - from.y;
    var len = Math.hypot(dx, dy);
    var speed = Number(el.speed.value);
    var vx = dx / len * speed, vy = dy / len * speed;

    launch(from.x, from.y, vx, vy);
    log.push({ step: stepNo, x: from.x, y: from.y, vx: vx, vy: vy });

    el.hint.hidden = true;

    for (var i = 0; i < (prerun || 0); i++) tick();
  }

  if (location.hash.indexOf("#demo") === 0) {
    demoThrow(Number(location.hash.split("=")[1]) || 0);
  } else if (location.hash === "#replay") {
    demoThrow(110);
    startReplay();
    for (var q = 0; q < 70; q++) tick();
  }

  var acc = 0, last = 0;
  var STEP_MS = 1000 / 60;

  function loop(now) {
    if (!last) last = now;

    var dt = Math.min(now - last, 120);
    last = now;

    if (!paused) acc += dt;

    var step = replay ? STEP_MS * 4 : STEP_MS;
    while (acc >= step) { tick(); acc -= step; }

    drawArena();
    trace.draw(fly.p.jump_rate);
    brainView.draw(fly);

    el.spikes.textContent = fly.firing;
    el.spikes2.textContent = fly.firing;
    el.tl.textContent = fly.theta.L.toFixed(3);
    el.tr.textContent = fly.theta.R.toFixed(3);

    el.state.textContent = paused ? "paused"
      : replay ? "replay"
      : body.airborne ? "escaping"
      : returning ? "returning"
      : shots.length ? "watching"
      : "at rest";

    requestAnimationFrame(loop);
  }

  var resizeTimer = null;

  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  requestAnimationFrame(loop);
})();
