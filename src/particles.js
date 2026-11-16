// Pooled particles, rings and floating text. Fixed-size typed arrays: no allocation per frame.
(function (BT) {
  'use strict';

  var MAX = 700;
  var px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  var life = new Float32Array(MAX), maxLife = new Float32Array(MAX), size = new Float32Array(MAX), rot = new Float32Array(MAX), vr = new Float32Array(MAX);
  var kind = new Uint8Array(MAX); // 0 dead, 1 chip, 2 spark
  var color = new Array(MAX);
  var next = 0;

  var RINGS = [], TEXTS = [];
  for (var i = 0; i < 10; i++) RINGS.push({ alive: false, x: 0, y: 0, r: 0, max: 0, t: 0, color: '#fff' });
  for (i = 0; i < 18; i++) TEXTS.push({ alive: false, x: 0, y: 0, s: '', color: '#fff', t: 0 });

  var rnd = Math.random;

  function spawn(x, y, c, k) {
    var i = next; next = (next + 1) % MAX;
    px[i] = x; py[i] = y; color[i] = c; kind[i] = k;
    var a = rnd() * Math.PI * 2, sp = k === 1 ? 40 + rnd() * 160 : 60 + rnd() * 220;
    vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp - (k === 1 ? 60 : 0);
    maxLife[i] = life[i] = k === 1 ? 0.5 + rnd() * 0.5 : 0.25 + rnd() * 0.35;
    size[i] = k === 1 ? 2 + rnd() * 3.5 : 1.2 + rnd() * 1.6;
    rot[i] = rnd() * 6; vr[i] = (rnd() - 0.5) * 18;
  }

  var Particles = {
    burst: function (x, y, c, n, type) {
      var k = type === 'spark' ? 2 : 1;
      for (var i = 0; i < n; i++) spawn(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 6, c, k);
    },
    ring: function (x, y, r, c) {
      for (var i = 0; i < RINGS.length; i++) {
        var o = RINGS[i];
        if (o.alive) continue;
        o.alive = true; o.x = x; o.y = y; o.r = 4; o.max = r; o.t = 0; o.color = c;
        return;
      }
    },
    text: function (x, y, s, c) {
      var best = TEXTS[0];
      for (var i = 0; i < TEXTS.length; i++) { if (!TEXTS[i].alive) { best = TEXTS[i]; break; } if (TEXTS[i].t > best.t) best = TEXTS[i]; }
      best.alive = true; best.x = x; best.y = y; best.s = s; best.color = c; best.t = 0;
    },
    clear: function () {
      for (var i = 0; i < MAX; i++) kind[i] = 0;
      for (i = 0; i < RINGS.length; i++) RINGS[i].alive = false;
      for (i = 0; i < TEXTS.length; i++) TEXTS[i].alive = false;
    },
    update: function (dt) {
      for (var i = 0; i < MAX; i++) {
        if (!kind[i]) continue;
        life[i] -= dt;
        if (life[i] <= 0) { kind[i] = 0; continue; }
        px[i] += vx[i] * dt; py[i] += vy[i] * dt;
        if (kind[i] === 1) { vy[i] += 520 * dt; rot[i] += vr[i] * dt; }
        else { vx[i] *= 1 - 3 * dt; vy[i] *= 1 - 3 * dt; }
      }
      for (i = 0; i < RINGS.length; i++) {
        var o = RINGS[i];
        if (!o.alive) continue;
        o.t += dt; o.r = 4 + (o.max - 4) * Math.min(1, o.t / 0.35);
        if (o.t > 0.45) o.alive = false;
      }
      for (i = 0; i < TEXTS.length; i++) {
        var t = TEXTS[i];
        if (!t.alive) continue;
        t.t += dt; t.y -= 28 * dt;
        if (t.t > 0.9) t.alive = false;
      }
    },
    draw: function (ctx) {
      ctx.save();
      for (var i = 0; i < MAX; i++) {
        if (!kind[i]) continue;
        var a = life[i] / maxLife[i];
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.fillStyle = color[i];
        var s = size[i];
        if (kind[i] === 1) { // spinning chip: rotated square drawn as a quad
          var c = Math.cos(rot[i]) * s * 0.5, sn = Math.sin(rot[i]) * s * 0.5, x = px[i], y = py[i];
          ctx.beginPath();
          ctx.moveTo(x - c + sn, y - sn - c); ctx.lineTo(x + c + sn, y + sn - c);
          ctx.lineTo(x + c - sn, y + sn + c); ctx.lineTo(x - c - sn, y - sn + c);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
        }
      }
      ctx.restore();
      ctx.save();
      for (i = 0; i < RINGS.length; i++) {
        var o = RINGS[i];
        if (!o.alive) continue;
        ctx.globalAlpha = Math.max(0, 1 - o.t / 0.45);
        ctx.strokeStyle = o.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      for (i = 0; i < TEXTS.length; i++) {
        var t = TEXTS[i];
        if (!t.alive) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, (0.9 - t.t) / 0.3));
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(t.s, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.s, t.x, t.y);
      }
      ctx.restore();
    },
    count: function () { var n = 0; for (var i = 0; i < MAX; i++) if (kind[i]) n++; return n; }
  };

  BT.Particles = Particles;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
