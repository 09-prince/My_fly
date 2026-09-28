/* Rolling trace of the two Giant Fibers, running down the side.
 *
 * Time is the vertical axis: oldest at the top, now at the bottom. Rate
 * runs across. Everything past the threshold is shaded, so a line
 * entering that band is the fly deciding to jump.
 *
 * The two lines are also labelled, so they are never told apart by
 * colour alone.
 */

(function (global) {
  "use strict";

  var WINDOW = 280;           // steps kept on screen, about 4.5 seconds

  var INK = "#6b7684";
  var FAINT = "#2b3440";
  var SURFACE = "#0d1117";

  function Trace(canvas, colors) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.colors = colors;      // { L: hex, R: hex }

    this.L = [];
    this.R = [];
    this.marks = [];           // step index of each escape
    this.step = 0;
  }

  Trace.prototype.clear = function () {
    this.L.length = 0;
    this.R.length = 0;
    this.marks.length = 0;
    this.step = 0;
  };

  Trace.prototype.push = function (l, r, fired) {
    this.L.push(l);
    this.R.push(r);

    if (fired) this.marks.push(this.step);

    this.step++;

    if (this.L.length > WINDOW) {
      this.L.shift();
      this.R.shift();
    }

    var floor = this.step - WINDOW;
    while (this.marks.length && this.marks[0] < floor) this.marks.shift();
  };

  Trace.prototype.draw = function (threshold) {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;

    var padL = 16, padR = 26, padT = 40, padB = 32;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    // Rate is a firing probability, so the axis is fixed at 0..1 and the
    // line never rescales under the reader.
    var top = 1.0;

    function X(v) { return padL + (v / top) * plotW; }
    function Y(i) { return padT + (i / (WINDOW - 1)) * plotH; }

    ctx.fillStyle = SURFACE;
    ctx.fillRect(0, 0, w, h);

    // --- the firing region ----------------------------------------------
    //
    // The threshold sits low on a 0..1 axis, so crossing it would barely
    // register as a line. Shading everything past it makes entering the
    // firing region obvious without touching the scale.
    var tx = Math.round(X(threshold)) + 0.5;

    ctx.fillStyle = "rgba(196,142,60,0.10)";
    ctx.fillRect(tx, padT, padL + plotW - tx, plotH);

    // --- axis --------------------------------------------------------------
    ctx.lineWidth = 1;
    ctx.font = "500 9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";

    [0, 0.5, 1].forEach(function (v) {
      var x = Math.round(X(v)) + 0.5;

      ctx.strokeStyle = FAINT;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.fillText(v.toFixed(1), x, padT + plotH + 14);
    });

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#8a6d3f";
    ctx.beginPath();
    ctx.moveTo(tx, padT);
    ctx.lineTo(tx, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- escapes -------------------------------------------------------------
    var base = this.step - this.L.length;

    ctx.strokeStyle = "rgba(160,170,190,0.30)";
    for (var m = 0; m < this.marks.length; m++) {
      var my = Math.round(Y(this.marks[m] - base)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, my);
      ctx.lineTo(padL + plotW, my);
      ctx.stroke();
    }

    // --- the two Giant Fibers -------------------------------------------------
    function line(series, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();

      for (var i = 0; i < series.length; i++) {
        var x = X(series[i]), y = Y(i);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (series.length) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(X(series[series.length - 1]), Y(series.length - 1), 3, 0, 6.2832);
        ctx.fill();
      }
    }

    line(this.R, this.colors.R);
    line(this.L, this.colors.L);

    // --- legend, always present, with the live value ---------------------------
    ctx.textAlign = "left";

    var half = Math.max(58, plotW / 2);

    [["L", this.colors.L, this.L], ["R", this.colors.R, this.R]]
      .forEach(function (row, k) {
        var x = padL + k * half;
        var last = row[2].length ? row[2][row[2].length - 1] : 0;

        ctx.fillStyle = row[1];
        ctx.beginPath();
        ctx.arc(x + 4, padT - 23, 3.5, 0, 6.2832);
        ctx.fill();

        ctx.font = "500 9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = INK;
        ctx.fillText("DNp01_" + row[0], x + 12, padT - 20);

        ctx.font = "600 12px 'IBM Plex Mono', monospace";
        ctx.fillStyle = last >= threshold ? row[1] : FAINT;
        ctx.fillText(last.toFixed(2), x + 12, padT - 6);
      });

    // --- time runs downward -----------------------------------------------------
    ctx.font = "500 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = FAINT;

    ctx.save();
    ctx.translate(w - 9, padT + 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "left";
    ctx.fillText(WINDOW + " steps ago", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(w - 9, padT + plotH - 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "right";
    ctx.fillText("now", 0, 0);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = "#c39a52";
    ctx.fillText("threshold " + threshold.toFixed(2), padL, h - 8);
  };

  global.Trace = Trace;
  global.Trace.WINDOW = WINDOW;

})(window);
