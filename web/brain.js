/* The circuit where it actually sits in the head.
 *
 * Every neuron is drawn at its real soma position, seen from the front,
 * at true proportions. The bilateral shape is the fly's: the two optic
 * lobes flanking the central brain, with the pair of Giant Fibers
 * between them.
 *
 * All 12,897 connections are drawn. The dim ones are baked into a
 * backdrop once; the ones carrying a spike this step are drawn live on
 * top, so you can watch the signal cross the head to DNp01.
 *
 * x is mirrored because left-side somata sit at HIGHER x in the volume.
 * Without the flip a threat on the fly's left lights the right of the
 * picture.
 */

(function (global) {
  "use strict";

  function Brain(canvas, colors) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.colors = colors;

    this.nodes = window.CIRCUIT.nodes;
    this.edges = window.CIRCUIT.edges;
    this.n = this.nodes.length;

    // Who each neuron sends to, so a spike can be drawn as it travels.
    this.out = [];
    for (var i = 0; i < this.n; i++) this.out.push([]);
    for (var e = 0; e < this.edges.length; e++) {
      this.out[this.edges[e][0]].push(this.edges[e][1]);
    }

    // Detector banks, for the readouts either side of the head.
    this.banks = [];
    ["L", "R"].forEach(function (side) {
      ["LPLC2", "LC4"].forEach(function (type) {
        var list = [];
        for (var k = 0; k < this.n; k++) {
          if (this.nodes[k].role === "input" &&
              this.nodes[k].side === side &&
              this.nodes[k].type === type) list.push(k);
        }
        this.banks.push({ side: side, type: type, list: list });
      }, this);
    }, this);

    this.gf = {};
    for (var g = 0; g < this.n; g++) {
      if (this.nodes[g].role === "output") this.gf[this.nodes[g].side] = g;
    }

    this.pos = [];
    this.backdrop = null;
  }

  Brain.prototype.colorOf = function (nd) {
    if (nd.role === "output") return nd.side === "L" ? this.colors.gfL : this.colors.gfR;
    if (nd.type === "LC4") return this.colors.LC4;
    if (nd.type === "LPLC2") return this.colors.LPLC2;
    return this.colors.inter;
  };

  Brain.prototype.layout = function () {
    var w = this.canvas.width, h = this.canvas.height;
    var nodes = this.nodes, i;

    var xs = [], ys = [];
    for (i = 0; i < this.n; i++) { xs.push(nodes[i].pos[0]); ys.push(nodes[i].pos[1]); }

    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);

    var aspect = (x1 - x0) / (y1 - y0);      // about 1.39

    // Fit the head at true proportions; never stretch it to fill.
    var bh = h - 40;
    var bw = bh * aspect;

    // The readout columns sit against the head, and the whole group is
    // centred, so the panel reads as one composition rather than an
    // island with two stranded labels.
    this.colW = Math.min(190, Math.max(0, (w - bw) / 2 - 46));

    var avail = w - 2 * (this.colW + 34);
    if (bw > avail) { bw = Math.max(80, avail); bh = bw / aspect; }

    var cx = w / 2, cy = h / 2 + 2;

    this.box = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };

    for (i = 0; i < this.n; i++) {
      var u = 1 - (nodes[i].pos[0] - x0) / (x1 - x0);   // mirror
      var v = (nodes[i].pos[1] - y0) / (y1 - y0);

      this.pos[i] = [this.box.x + u * bw, this.box.y + v * bh];
    }

    this.backdrop = null;
  };

  /* Tissue glow plus every connection, drawn once. */
  Brain.prototype.buildBackdrop = function () {
    var w = this.canvas.width, h = this.canvas.height, i;

    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;

    var ctx = c.getContext("2d");

    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, w, h);

    // A soft blob per soma. Together they trace out the structures the
    // neurons belong to, so the head reads as tissue rather than dots.
    var glow = Math.max(14, this.box.h * 0.09);

    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < this.n; i++) {
      var p = this.pos[i];
      var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], glow);

      g.addColorStop(0, "rgba(46,74,104,0.12)");
      g.addColorStop(1, "rgba(46,74,104,0)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p[0], p[1], glow, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // Every connection, at low contrast.
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.14;

    for (var e = 0; e < this.edges.length; e++) {
      var a = this.pos[this.edges[e][0]];
      var b = this.pos[this.edges[e][1]];
      if (!a || !b) continue;

      ctx.strokeStyle = this.nodes[this.edges[e][1]].role === "output"
        ? "#6b3a52" : "#243244";

      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);

      // Bow each line away from the midline so bundles stay separable.
      var mx = (a[0] + b[0]) / 2;
      var my = (a[1] + b[1]) / 2 - Math.abs(b[0] - a[0]) * 0.10;
      ctx.quadraticCurveTo(mx, my, b[0], b[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Resting neurons.
    for (i = 0; i < this.n; i++) {
      var q = this.pos[i];
      var nd = this.nodes[i];
      var isGF = nd.role === "output";

      ctx.globalAlpha = isGF ? 0.45 : 0.34;
      ctx.fillStyle = this.colorOf(nd);
      ctx.beginPath();
      ctx.arc(q[0], q[1], isGF ? 8 : 2.1, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.backdrop = c;
  };

  /* One detector bank, as a small bar showing how many are firing. */
  Brain.prototype.drawBank = function (bank, x, y, wide, fly) {
    var ctx = this.ctx;
    var color = bank.type === "LC4" ? this.colors.LC4 : this.colors.LPLC2;

    var firing = 0;
    for (var i = 0; i < bank.list.length; i++) {
      if (fly.lit[bank.list[i]] > 0.25) firing++;
    }

    var frac = bank.list.length ? firing / bank.list.length : 0;

    ctx.font = "500 9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(bank.type, x, y);
    ctx.globalAlpha = 1;

    ctx.fillStyle = firing ? color : "#3d4650";
    ctx.textAlign = "right";
    ctx.fillText(firing + " / " + bank.list.length, x + wide, y);

    ctx.fillStyle = "#1a2230";
    ctx.fillRect(x, y + 5, wide, 3);

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5 + frac * 0.5;
    ctx.fillRect(x, y + 5, wide * frac, 3);
    ctx.globalAlpha = 1;

    ctx.textAlign = "left";
  };

  Brain.prototype.draw = function (fly) {
    var ctx = this.ctx;
    var w = this.canvas.width, h = this.canvas.height;
    var i, p, nd;

    if (!this.backdrop || this.backdrop.width !== w || this.backdrop.height !== h) {
      this.layout();
      this.buildBackdrop();
    }

    ctx.drawImage(this.backdrop, 0, 0);

    // --- connections carrying a spike right now ------------------------
    ctx.lineWidth = 0.7;

    for (i = 0; i < this.n; i++) {
      if (fly.spikes[i] === 0) continue;

      p = this.pos[i];
      var targets = this.out[i];
      if (!targets.length) continue;

      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = this.colorOf(this.nodes[i]);
      ctx.beginPath();

      for (var t = 0; t < targets.length; t++) {
        var q = this.pos[targets[t]];
        ctx.moveTo(p[0], p[1]);

        var mx = (p[0] + q[0]) / 2;
        var my = (p[1] + q[1]) / 2 - Math.abs(q[0] - p[0]) * 0.10;
        ctx.quadraticCurveTo(mx, my, q[0], q[1]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // --- neurons that are firing -----------------------------------------
    for (i = 0; i < this.n; i++) {
      var lit = fly.lit[i];
      if (lit <= 0.05) continue;

      p = this.pos[i];
      nd = this.nodes[i];

      var isGF = nd.role === "output";
      var color = this.colorOf(nd);
      var size = isGF ? 8 : 2.1;

      ctx.globalAlpha = lit * 0.28;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[0], p[1], size * 3.4, 0, 6.2832);
      ctx.fill();

      ctx.globalAlpha = Math.min(1, 0.45 + lit);
      ctx.beginPath();
      ctx.arc(p[0], p[1], size + lit * size * 0.6, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- the detector banks, either side of the head -----------------------
    var pad = 22;
    var colW = this.colW;
    var leftX = this.box.x - pad - colW;
    var rightX = this.box.x + this.box.w + pad;

    ctx.font = "500 9px 'IBM Plex Mono', monospace";

    if (colW > 60) {
      var self = this;
      var top = this.box.y + 14;

      [["L", leftX], ["R", rightX]].forEach(function (col) {
        ctx.fillStyle = "#8b96a6";
        ctx.textAlign = "left";
        ctx.fillText(col[0] === "L" ? "LEFT EYE" : "RIGHT EYE", col[1], top - 12);

        var row = 0;
        self.banks.forEach(function (bank) {
          if (bank.side !== col[0]) return;
          self.drawBank(bank, col[1], top + row * 26, colW, fly);
          row++;
        });

        // The Giant Fiber for this side, under its detectors.
        var gi = self.gf[col[0]];
        var rate = fly.rate[col[0]];
        var hot = rate >= fly.p.jump_rate;
        var gc = col[0] === "L" ? self.colors.gfL : self.colors.gfR;

        ctx.fillStyle = gc;
        ctx.textAlign = "left";
        ctx.fillText("DNp01_" + col[0], col[1], top + 2 * 26 + 12);

        ctx.fillStyle = hot ? gc : "#3d4650";
        ctx.textAlign = "right";
        ctx.fillText(hot ? "FIRING" : rate.toFixed(2), col[1] + colW, top + 2 * 26 + 12);
      });
    }

    // --- what the picture is ------------------------------------------------
    ctx.textAlign = "center";
    ctx.fillStyle = "#3d4650";
    ctx.fillText("frontal view · true proportions · soma positions",
                 w / 2, h - 8);

    ctx.textAlign = "left";
  };

  global.Brain = Brain;

})(window);
