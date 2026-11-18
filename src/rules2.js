// Act two rule modules (Worlds 9-11). Same hook interface as rules.js, plus (all optional):
//   power: true, kind: 'timed' | 'free' | 'passive'   a player power (it calls g.addPower(r) in init)
//   onTap(g, r) -> true if it used the tap            (see G.tapPowers in game.js for the order taps go in)
//   renderHUD(ctx, g, r, R)                           drawn in screen space over the HUD (never rotated or scrolled)
//   onRemove(g, r)                                    a boss took the rule out again (tidy up ball / view state)
// No DOM. Everything here is off unless a level (or Endless round) lists the rule.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, P = BT.Physics, HIT = BT.Physics.HIT, TAU = Math.PI * 2;
  var register = BT.Rules.register;
  function easy(g) { return g.presetName === 'easy'; }
  function pick(g, p, key) { return easy(g) && p[key + 'Easy'] != null ? p[key + 'Easy'] : p[key]; }

  // ---------------------------------------------------------------- the power HUD
  // One chip per power, right-aligned under the HUD bar (a row lower when a boss bar is showing). Each chip has an
  // icon, a name and a meter, and its state in words (READY / ON / x2), so nothing relies on colour alone.
  var CHIP_W = 100, CHIP_H = 21, CHIP_GAP = 8;
  function chipPos(g, r) { // centred in the strip under the HUD (see G.powerStrip)
    var n = g.powers.length, i = g.powers.indexOf(r), total = n * CHIP_W + (n - 1) * CHIP_GAP;
    return { x: Math.round((C.W - total) / 2) + i * (CHIP_W + CHIP_GAP), y: C.TOP + 3 };
  }
  function drawChip(ctx, g, r, R, opts) {
    var q = chipPos(g, r), x = q.x, y = q.y;
    ctx.save();
    R.roundRect(ctx, x, y, CHIP_W, CHIP_H, 6);
    ctx.fillStyle = opts.on ? 'rgba(40,30,0,0.88)' : 'rgba(5,7,16,0.82)'; ctx.fill();
    ctx.strokeStyle = opts.ready || opts.on ? opts.color : 'rgba(255,255,255,0.22)'; ctx.lineWidth = opts.ready || opts.on ? 1.6 : 1; ctx.stroke();
    if (opts.flash > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(1, opts.flash * 3).toFixed(3) + ')'; ctx.lineWidth = 2.5; ctx.stroke(); }
    ctx.fillStyle = opts.color; ctx.strokeStyle = opts.color;
    opts.icon(ctx, x + 11, y + CHIP_H / 2, 12);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px ' + R.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.label, x + 21, y + 6.5);
    if (opts.pips != null) { // charges as pips (and the number)
      for (var i = 0; i < opts.pipMax; i++) {
        ctx.beginPath(); ctx.arc(x + 25 + i * 8, y + 15, 2.8, 0, TAU);
        if (i < opts.pips) { ctx.fillStyle = opts.color; ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
    } else {
      R.roundRect(ctx, x + 21, y + 13, 38, 4, 2); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
      var fr = Math.max(0, Math.min(1, opts.frac));
      if (fr > 0.02) { R.roundRect(ctx, x + 21, y + 13, 38 * fr, 4, 2); ctx.fillStyle = opts.color; ctx.fill(); }
    }
    if (opts.state) { // the state in words, right of the meter
      ctx.textAlign = 'right'; ctx.font = 'bold 8px ' + R.FONT;
      ctx.fillStyle = opts.ready || opts.on ? '#ffffff' : 'rgba(255,255,255,0.55)';
      ctx.fillText(opts.state, x + CHIP_W - 5, y + 15.5);
    }
    ctx.restore();
  }
  // power icons (drawn in the current colour)
  var ICON = {
    shot: function (ctx, x, y, s) { // a lightning bolt
      var h = s / 2; ctx.beginPath();
      ctx.moveTo(x + h * 0.25, y - h); ctx.lineTo(x - h * 0.55, y + h * 0.15); ctx.lineTo(x - h * 0.02, y + h * 0.15);
      ctx.lineTo(x - h * 0.3, y + h); ctx.lineTo(x + h * 0.6, y - h * 0.2); ctx.lineTo(x + h * 0.05, y - h * 0.2); ctx.closePath(); ctx.fill();
    },
    slow: function (ctx, x, y, s) { // an hourglass
      var h = s / 2; ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(x - h * 0.6, y - h); ctx.lineTo(x + h * 0.6, y - h); ctx.lineTo(x - h * 0.6, y + h); ctx.lineTo(x + h * 0.6, y + h); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - h * 0.3, y + h * 0.8); ctx.lineTo(x + h * 0.3, y + h * 0.8); ctx.lineTo(x, y + h * 0.3); ctx.closePath(); ctx.fill();
    },
    curve: function (ctx, x, y, s) { // a curved arrow
      var h = s / 2; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(x - h * 0.7, y + h * 0.9); ctx.quadraticCurveTo(x - h * 0.6, y - h * 0.8, x + h * 0.6, y - h * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + h * 0.9, y - h * 0.55); ctx.lineTo(x + h * 0.2, y - h * 1.05); ctx.lineTo(x + h * 0.3, y - h * 0.1); ctx.closePath(); ctx.fill();
    },
    wall: function (ctx, x, y, s) { // a shield
      var h = s / 2; ctx.beginPath();
      ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.8, y - h * 0.6); ctx.lineTo(x + h * 0.7, y + h * 0.2); ctx.quadraticCurveTo(x + h * 0.4, y + h * 0.8, x, y + h);
      ctx.quadraticCurveTo(x - h * 0.4, y + h * 0.8, x - h * 0.7, y + h * 0.2); ctx.lineTo(x - h * 0.8, y - h * 0.6); ctx.closePath(); ctx.fill();
    }
  };
  BT.POWER_ICON = ICON;

  // the descending ball that reaches the paddle first, and when (world seconds) and where
  var NEXT = { b: null, t: 0, x: 0 };
  function nextToPaddle(g) {
    var pd = g.paddle, best = null, bt = 1e9, lx = 0;
    for (var i = 0; i < g.balls.length; i++) {
      var b = g.balls[i];
      if (b.stuck || b.dead || b.vy <= 0) continue;
      var ty = pd.y - pd.h / 2 - b.r;
      if (b.y > ty + 2) continue;
      var t = (ty - b.y) / b.vy;
      if (t < bt) { bt = t; best = b; }
    }
    NEXT.b = best; NEXT.t = bt;
    if (best) {
      var ty2 = pd.y - pd.h / 2 - best.r;
      lx = g.wrapX ? g.wrapPos(best.x + best.vx * bt) : P.predictLandingX(best.x, best.y, best.vx, best.vy, ty2, g.wallL + best.r, g.wallR - best.r);
      NEXT.x = lx;
    }
    return NEXT;
  }

  // ======================================================================================
  // World 9 - New powers
  // ======================================================================================

  // ---------------- Power Shot: tap as the ball reaches the paddle to smash it ----------------
  // A ring closes on the spot where the ball will land; tap while it is bright (a little before the bounce, or
  // just after it) and the ball leaves faster, punching through `pierce` bricks (steel still stops it). A tap at any
  // other moment does nothing at all. After a shot it recharges for a couple of seconds (shown on the chip).
  register('powershot', {
    power: true, kind: 'timed', label: 'POWER SHOT',
    init: function (g, r) {
      var s = r.s, p = r.p;
      g.addPower(r);
      s.window = pick(g, p, 'window'); s.late = pick(g, p, 'late'); s.pierce = pick(g, p, 'pierce'); s.recharge = pick(g, p, 'recharge');
      s.charge = 1; s.armT = 0; s.armBall = null; s.t = 0; s.lastBall = null; s.lastHitT = -99; s.flash = 0; s.shots = 0;
      s.nx = 0; s.nt = 99; s.nb = null;
    },
    update: function (g, r, dt) {
      var s = r.s;
      s.t += dt;
      if (s.charge < 1) s.charge = Math.min(1, s.charge + dt / s.recharge);
      if (s.armT > 0) s.armT -= dt;
      if (s.flash > 0) s.flash -= g.realDt;
      var n = nextToPaddle(g);
      s.nb = n.b; s.nt = n.b ? n.t : 99; s.nx = n.x;
      for (var i = 0; i < g.balls.length; i++) { // a powered ball is spent once it is on its way back down
        var b = g.balls[i];
        if (b.powered && b.vy > 0 && b.pierce <= 0) b.powered = false;
      }
    },
    inWindow: function (r) { return r.s.nb && r.s.nt <= r.s.window; },
    onTap: function (g, r) {
      var s = r.s;
      if (s.charge < 1) return false;
      var lb = s.lastBall;
      if (lb && !lb.dead && !lb.stuck && lb.vy < 0 && s.t - s.lastHitT <= s.late && !lb.powered) { this.fire(g, r, lb); return true; }
      if (this.inWindow(r)) { s.armT = s.window + 0.06; s.armBall = s.nb; return true; }
      return false;
    },
    onPaddleHit: function (g, r, ball, xp) {
      if (xp) return;
      var s = r.s;
      s.lastBall = ball; s.lastHitT = s.t;
      if (ball.powered) { ball.powered = false; ball.pierce = 0; }
      if (s.armT > 0 && s.charge >= 1 && (!s.armBall || s.armBall === ball || s.armBall.dead)) this.fire(g, r, ball);
    },
    fire: function (g, r, ball) {
      var s = r.s;
      ball.powered = true; ball.pierce = s.pierce; ball.boost = Math.max(ball.boost, r.p.boost);
      s.charge = 0; s.armT = 0; s.armBall = null; s.flash = 0.5; s.shots++;
      g.sinceHit = 0;
      g.fx.sound('powershot');
      g.fx.text(ball.x, ball.y - 18, 'POWER SHOT!', '#ffe27a');
      g.fx.burst(ball.x, ball.y, '#ffe27a', 16, 'spark');
      g.fx.shake(2);
    },
    onLifeLost: function (g, r) { r.s.charge = 1; r.s.armT = 0; },
    onRemove: function (g) { for (var i = 0; i < g.balls.length; i++) { g.balls[i].powered = false; } },
    render: function (ctx, g, r, layer, R) {
      if (layer !== 'front') return;
      var s = r.s, p = r.p, pd = g.paddle, i;
      ctx.save();
      // powered balls: a bright jagged halo and a long streak
      for (i = 0; i < g.balls.length; i++) {
        var b = g.balls[i];
        if (!b.powered) continue;
        var sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
        ctx.strokeStyle = 'rgba(255,226,122,0.55)'; ctx.lineWidth = b.r * 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * 34, b.y - uy * 34); ctx.stroke();
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath();
        for (var k = 0; k <= 16; k++) {
          var a = k / 16 * TAU + g.t * 9, rr = k % 2 ? b.r + 3 : b.r + 7;
          if (k === 0) ctx.moveTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); else ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      }
      // the timing ring: closes on the landing spot; bright (and TAP!) while a tap would count
      if (s.charge >= 1 && s.nb && s.nt < p.ringTime && g.state === 'play') {
        var f = Math.max(0, s.nt / p.ringTime), hot = s.nt <= s.window;
        var cx = s.nx, cy = pd.y - pd.h / 2 - 2, rad = 9 + 46 * f;
        ctx.strokeStyle = hot ? '#ffe27a' : 'rgba(255,226,122,0.4)'; ctx.lineWidth = hot ? 3.5 : 2;
        ctx.beginPath(); ctx.arc(cx, cy, rad, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 9, Math.PI * 1.05, Math.PI * 1.95); ctx.strokeStyle = hot ? '#ffffff' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
        if (hot) {
          ctx.fillStyle = '#ffe27a'; ctx.font = '900 13px ' + R.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('TAP!', cx, cy - rad - 9);
        }
      }
      if (s.armT > 0) { // armed: the paddle crackles
        ctx.strokeStyle = 'rgba(255,240,150,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (i = 0; i <= 8; i++) { var zx = pd.x - pd.w / 2 + pd.w * i / 8, zy = pd.y - pd.h / 2 - 3 + ((i + (g.t * 30 | 0)) % 2 ? -3 : 0); if (i === 0) ctx.moveTo(zx, zy); else ctx.lineTo(zx, zy); }
        ctx.stroke();
      }
      ctx.restore();
    },
    renderHUD: function (ctx, g, r, R) {
      var s = r.s;
      drawChip(ctx, g, r, R, { label: 'POWER SHOT', icon: ICON.shot, color: '#ffe27a', frac: s.charge, ready: s.charge >= 1, flash: s.flash, state: s.charge >= 1 ? 'READY' : '' });
    }
  });

  // ---------------- Slow-Mo: tap to slow the world; a meter drains and refills ----------------
  // The world (ball, bricks, hazards) runs at `scale`; the paddle keeps its full speed, so you have time to get
  // there. Tap again to stop early. The meter drains in real seconds and refills when it is off.
  register('slowmo', {
    power: true, kind: 'free', label: 'SLOW-MO',
    init: function (g, r) {
      var s = r.s;
      g.addPower(r);
      s.meter = 1; s.on = false; s.cur = 1; s.flash = 0; s.uses = 0; s.t = 0;
      s.scale = pick(g, r.p, 'scale'); s.recharge = pick(g, r.p, 'recharge');
    },
    update: function (g, r) {
      var s = r.s, p = r.p, rdt = g.realDt;
      s.t += rdt;
      if (s.flash > 0) s.flash -= rdt;
      if (s.on) {
        s.meter -= rdt / p.drain;
        if (s.meter <= 0 || g.state !== 'play') { s.meter = Math.max(0, s.meter); this.stop(g, r); }
      } else if (s.meter < 1) s.meter = Math.min(1, s.meter + rdt / s.recharge);
      var want = s.on ? s.scale : 1;
      s.cur += (want - s.cur) * Math.min(1, rdt * 14); // eases in and out over a moment, never a jolt
      if (Math.abs(s.cur - want) < 0.002) s.cur = want;
      g.setWarp('slowmo', s.cur);
    },
    onTap: function (g, r) {
      var s = r.s;
      if (s.on) { this.stop(g, r); return true; }
      if (s.meter < r.p.minStart) return false;
      s.on = true; s.flash = 0.4; s.uses++;
      g.fx.sound('slowon');
      return true;
    },
    stop: function (g, r) { if (r.s.on) { r.s.on = false; g.fx.sound('slowoff'); } },
    onLifeLost: function (g, r) { this.stop(g, r); r.s.cur = 1; g.setWarp('slowmo', 1); },
    onRemove: function (g, r) { r.s.on = false; g.setWarp('slowmo', 1); },
    render: function (ctx, g, r, layer) {
      if (layer !== 'front') return;
      var s = r.s, k = (1 - s.cur) / (1 - s.scale);
      if (k <= 0.01) return;
      ctx.save();
      // a soft blue frame and slow ripples round each ball, so slowed time reads at a glance
      ctx.strokeStyle = 'rgba(120,200,255,' + (0.35 * k).toFixed(3) + ')'; ctx.lineWidth = 10;
      ctx.strokeRect(g.wallL + 5, g.topY + 5, g.wallR - g.wallL - 10, C.H - g.topY - 10);
      for (var i = 0; i < g.balls.length; i++) {
        var b = g.balls[i], ph = (s.t * 1.2) % 1;
        ctx.strokeStyle = 'rgba(160,220,255,' + (0.5 * k * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4 + ph * 14, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    },
    renderHUD: function (ctx, g, r, R) {
      var s = r.s;
      drawChip(ctx, g, r, R, { label: 'SLOW-MO', icon: ICON.slow, color: '#7fd4ff', frac: s.meter, on: s.on, ready: !s.on && s.meter >= r.p.minStart, flash: s.flash, state: s.on ? 'ON' : (s.meter >= 1 ? 'READY' : '') });
    }
  });

  // ---------------- Curveball: moving the paddle while the ball rises bends its path the same way ----------------
  // Gentle and bounded: the bend is a sideways push the game turns into a change of direction (the ball's speed
  // never changes, and the usual minimum vertical speed still holds, so it can neither hover nor run sideways). It
  // only works while the ball is going up and above `lowY`, and each flight has a budget of bend (refilled by the paddle).
  register('curve', {
    power: true, kind: 'passive', label: 'CURVE',
    init: function (g, r) {
      g.addPower(r);
      r.s.accel = pick(g, r.p, 'accel'); r.s.budget = pick(g, r.p, 'budget'); r.s.t = 0; r.s.used = 0;
      r.s.flat = Math.tan(r.p.maxDeg * P.DEG);
      for (var i = 0; i < g.balls.length; i++) g.balls[i].spin = r.s.budget;
    },
    onServeBall: function (g, r, b) { b.spin = r.s.budget; },
    onPaddleHit: function (g, r, b, xp) { if (!xp) b.spin = r.s.budget; },
    update: function (g, r, dt) {
      r.s.t += dt;
      for (var i = 0; i < g.balls.length; i++) { var b = g.balls[i]; if (b.spin == null) b.spin = r.s.budget; if (b.curving > 0) b.curving -= dt; }
    },
    onBallStep: function (g, r, b, dt) {
      if (b.stuck || !(b.spin > 0) || b.vy >= 0 || b.y > r.p.lowY || g.state !== 'play') return;
      var f = P.clamp(g.paddle.vx / r.p.fullAt, -1, 1);
      if (Math.abs(f) < 0.1) return;
      var nvx = b.vx + r.s.accel * f * dt, lim = Math.abs(b.vy) * r.s.flat;
      if (Math.abs(nvx) > lim && Math.abs(nvx) > Math.abs(b.vx)) nvx = (nvx < 0 ? -1 : 1) * Math.max(Math.abs(b.vx), lim); // never flatter than maxDeg
      b.vx = nvx;
      b.spin -= Math.abs(f) * dt; r.s.used += Math.abs(f) * dt;
      b.curving = 0.12; b.curveDir = f > 0 ? 1 : -1;
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'front') return;
      ctx.save();
      for (var i = 0; i < g.balls.length; i++) {
        var b = g.balls[i];
        if (!(b.curving > 0)) continue;
        var d = b.curveDir; // a little swoosh on the side it is bending towards
        ctx.strokeStyle = 'rgba(160,255,190,0.85)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        var a0 = d > 0 ? -0.9 : Math.PI - 0.9;
        ctx.beginPath(); ctx.arc(b.x - d * 4, b.y + 2, b.r + 6, a0, a0 + 1.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x + d * (b.r + 8), b.y - 6); ctx.lineTo(b.x + d * (b.r + 11), b.y + 1); ctx.lineTo(b.x + d * (b.r + 4), b.y - 1); ctx.closePath();
        ctx.fillStyle = 'rgba(160,255,190,0.85)'; ctx.fill();
      }
      ctx.restore();
    },
    renderHUD: function (ctx, g, r, R) {
      var best = 0, up = false;
      for (var i = 0; i < g.balls.length; i++) { var b = g.balls[i]; if (!b.stuck && b.vy < 0) { up = true; best = Math.max(best, b.spin || 0); } else if (b.stuck) best = Math.max(best, b.spin || 0); }
      if (!up && !g.balls.some(function (q) { return q.stuck; })) best = r.s.budget; // falling: it refills at the paddle
      var bending = g.balls.some(function (q) { return q.curving > 0; });
      drawChip(ctx, g, r, R, { label: 'CURVE', icon: ICON.curve, color: '#a0ffbe', frac: best / r.s.budget, on: bending, ready: up && best > 0.05, state: bending ? 'BEND' : (up && best > 0.05 ? 'MOVE' : '') });
    }
  });

  // ---------------- Safety Wall: tap to raise a floor under the paddle for a moment ----------------
  // Limited charges (pips on the chip), refilled by breaking the shield bricks (grid F). Every `splitEvery` bricks
  // the level splits the ball into three on purpose. It sits above the Easy safety net: the wall saves a ball first,
  // and the net is still there (once per life) if the wall is down.
  register('safetywall', {
    power: true, kind: 'free', label: 'SAFETY WALL',
    init: function (g, r) {
      var s = r.s;
      g.addPower(r);
      s.start = pick(g, r.p, 'charges'); s.charges = s.start; s.up = 0; s.time = pick(g, r.p, 'time');
      s.flash = 0; s.broken = 0; s.saves = 0; s.uses = 0; s.hitFlash = 0; s.splits = 0;
    },
    onTap: function (g, r) {
      var s = r.s;
      if (s.up > 0 || s.charges <= 0) return false;
      s.charges--; s.up = s.time; s.flash = 0.4; s.uses++;
      g.fx.sound('wallup');
      return true;
    },
    update: function (g, r, dt) {
      var s = r.s;
      if (s.up > 0) s.up = Math.max(0, s.up - dt);
      if (s.flash > 0) s.flash -= g.realDt;
      if (s.hitFlash > 0) s.hitFlash -= dt;
    },
    onBallStep: function (g, r, b) {
      var s = r.s, y = r.p.y;
      if (s.up <= 0 || b.vy <= 0 || b.y + b.r < y || b.y - b.r > y + 12) return;
      b.y = y - b.r; b.vy = -Math.abs(b.vy);
      s.saves++; s.hitFlash = 0.25;
      g.combo = 0;
      g.fx.sound('net'); g.fx.burst(b.x, y, '#7cf5ff', 10, 'spark');
    },
    onBrickDestroyed: function (g, r, k) {
      var s = r.s;
      if (k.type === 'shield') {
        if (s.charges < r.p.max) { s.charges++; s.flash = 0.4; }
        g.fx.sound('unlock'); g.fx.text(k.x + k.w / 2, k.y - 6, '+1 wall', '#7cf5ff');
      }
      s.broken++;
      if (r.p.splitEvery && s.broken % r.p.splitEvery === 0 && g.state === 'play') {
        s.splits++;
        g.splitBalls();
        g.fx.sound('split'); g.fx.text(C.W / 2, 420, 'Multi-ball!', '#ffd35a');
      }
    },
    onLifeLost: function (g, r) { r.s.up = 0; r.s.charges = Math.max(r.s.charges, r.s.start); },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var s = r.s, y = r.p.y, i;
      ctx.save();
      if (s.up > 0) { // the wall: a bright bar with a hex pattern; it fades out over its last half second
        var a = Math.min(1, s.up / 0.5);
        ctx.fillStyle = 'rgba(124,245,255,' + (0.22 * a).toFixed(3) + ')'; ctx.fillRect(g.wallL, y, g.wallR - g.wallL, 10);
        ctx.fillStyle = 'rgba(124,245,255,' + (0.95 * a).toFixed(3) + ')'; ctx.fillRect(g.wallL, y - 1, g.wallR - g.wallL, 3);
        ctx.strokeStyle = 'rgba(200,250,255,' + (0.5 * a).toFixed(3) + ')'; ctx.lineWidth = 1;
        for (var x = g.wallL + 6; x < g.wallR; x += 14) { ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + 5, y + 8); ctx.lineTo(x + 10, y + 2); ctx.stroke(); }
        if (s.hitFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (s.hitFlash * 3).toFixed(3) + ')'; ctx.fillRect(g.wallL, y - 2, g.wallR - g.wallL, 5); }
      } else if (s.charges > 0) { // where it will come up
        ctx.strokeStyle = 'rgba(124,245,255,0.22)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(g.wallL, y); ctx.lineTo(g.wallR, y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    },
    renderHUD: function (ctx, g, r, R) {
      var s = r.s;
      drawChip(ctx, g, r, R, { label: 'SAFETY WALL', icon: ICON.wall, color: '#7cf5ff', pips: s.charges, pipMax: r.p.max, on: s.up > 0, ready: s.charges > 0 && s.up <= 0, flash: s.flash, state: s.up > 0 ? 'UP' : 'x' + s.charges });
    }
  });

  // ======================================================================================
  // World 10 - Living bricks
  // ======================================================================================

  // ---------------- Hatchlings: eggs (grid E) crack and hatch into critters that wander down ----------------
  // Each egg wobbles and cracks for `warn` seconds first. A critter walks slowly down towards the paddle; the ball
  // (or a laser) pops it. One that lands on the paddle shrinks it for a while, then hops off; one that misses waddles
  // away off the bottom. The level is not cleared while critters are still walking. The Queen lays eggs with lay().
  var CRIT_COLS = ['#ffb3d9', '#b3f0ff', '#d9ffb3', '#ffe0a3', '#d6c2ff'];
  register('hatch', {
    init: function (g, r) {
      var s = r.s, p = r.p, i;
      s.crits = []; s.t = 0; s.slow = easy(g) ? p.slowEasy : 1 / Math.sqrt(g.preset.hazardScale); s.popped = 0; s.landed = 0; s.hatched = 0; s.n = 0;
      if (p.auto === false) return;
      var eggs = g.bricks.filter(function (b) { return b.type === 'egg'; });
      for (i = eggs.length - 1; i > 0; i--) { var j = Math.floor(g.rng() * (i + 1)), tmp = eggs[i]; eggs[i] = eggs[j]; eggs[j] = tmp; }
      for (i = 0; i < eggs.length; i++) eggs[i].hatchAt = (p.first + i * p.every + g.rng() * p.jitter) * s.slow;
    },
    lay: function (g, r, b, after) { b.hatchAt = r.s.t + after; b.wobble = 0; },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, pd = g.paddle, i;
      if (g.hazardsActive(0)) s.t += dt;
      for (i = 0; i < g.bricks.length; i++) {
        var e = g.bricks[i];
        if (!e.alive || e.type !== 'egg' || e.hatchAt == null) continue;
        var left = e.hatchAt - s.t, w = p.warn * s.slow;
        e.wobble = left < w ? 1 - left / w : 0;
        if (left <= 0) this.hatch(g, r, e);
      }
      var j = 0, walk = p.walk / s.slow;
      for (i = 0; i < s.crits.length; i++) {
        var c = s.crits[i];
        c.age += dt;
        if (c.state === 'walk') {
          c.y += walk * dt;
          c.x = P.clamp(c.x0 + Math.sin(c.ph + c.age * 1.4) * p.sway, g.wallL + p.radius, g.wallR - p.radius);
          var top = pd.y - pd.h / 2 - p.radius;
          if (c.y >= top && c.y < top + 8 && !pd.off && Math.abs(c.x - pd.x) < pd.w / 2 + p.radius * 0.5) { // landed on the paddle
            c.state = 'ride'; c.t = 0.8; c.y = top; c.rx = c.x - pd.x; s.landed++;
            g.eff.shrink = Math.max(g.eff.shrink, pick(g, p, 'shrink')); g.eff.long = 0;
            g.fx.sound('powerdown'); g.fx.text(pd.x, pd.y - 26, 'Shrunk!', '#ffb3d9');
          } else if (c.y > C.H + 20) c.state = 'gone';
        } else if (c.state === 'ride') {
          c.t -= dt; c.x = pd.x + c.rx; c.y = pd.y - pd.h / 2 - p.radius - Math.abs(Math.sin(c.t * 9)) * 3;
          if (c.t <= 0) { c.state = 'hop'; c.vx = c.x < C.W / 2 ? -140 : 140; c.vy = -220; }
        } else if (c.state === 'hop' || c.state === 'pop') {
          c.vy += 700 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.spin += dt * 10;
          if (c.y > C.H + 30) c.state = 'gone';
        }
        if (c.state !== 'gone') s.crits[j++] = c;
      }
      s.crits.length = j;
    },
    hatch: function (g, r, e) {
      var s = r.s;
      e.alive = false; e.hatchAt = null;
      s.hatched++;
      var c = { x: e.x + e.w / 2, y: e.y + e.h / 2, x0: e.x + e.w / 2, ph: g.rng() * TAU, age: 0, state: 'walk', vx: 0, vy: 0, spin: 0, col: CRIT_COLS[s.n++ % CRIT_COLS.length], t: 0, rx: 0 };
      s.crits.push(c);
      g.fx.sound('hatch'); g.fx.burst(c.x, c.y, '#fff3d6', 10, 'chip');
      g.fx.text(c.x, c.y - 12, 'Hatched!', '#ffe9b0');
    },
    pop: function (g, r, c, dir) {
      c.state = 'pop'; c.vx = dir * 160; c.vy = -260; r.s.popped++;
      g.score += 30; g.sinceHit = 0;
      g.fx.sound('pop'); g.fx.burst(c.x, c.y, c.col, 10, 'spark'); g.fx.text(c.x, c.y - 14, 'Boing!', '#ffffff');
    },
    onBallStep: function (g, r, b) {
      var cs = r.s.crits, rad = r.p.radius;
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        if (c.state !== 'walk') continue;
        var dx = c.x - b.x, dy = c.y - b.y;
        if (dx * dx + dy * dy < (rad + b.r) * (rad + b.r)) this.pop(g, r, c, dx >= 0 ? 1 : -1);
      }
    },
    onLaser: function (g, r, L) {
      var cs = r.s.crits, rad = r.p.radius;
      for (var i = 0; i < cs.length; i++) if (cs[i].state === 'walk' && Math.abs(cs[i].x - L.x) < rad && Math.abs(cs[i].y - L.y) < rad + 6) { this.pop(g, r, cs[i], 1); return true; }
      return false;
    },
    walking: function (r) { var n = 0; for (var i = 0; i < r.s.crits.length; i++) if (r.s.crits[i].state === 'walk' || r.s.crits[i].state === 'ride') n++; return n; },
    holdClear: function (g, r) { return this.walking(r) > 0; },
    onLifeLost: function (g, r) { // a fresh ball: every walking critter pops (nobody is punished twice)
      for (var i = 0; i < r.s.crits.length; i++) if (r.s.crits[i].state === 'walk') { r.s.crits[i].state = 'pop'; r.s.crits[i].vx = 0; r.s.crits[i].vy = -200; }
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'front') return;
      var cs = r.s.crits, rad = r.p.radius;
      ctx.save();
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i], x = c.x, y = c.y, hop = c.state === 'walk' ? Math.abs(Math.sin(c.age * 7)) * 2 : 0;
        ctx.save(); ctx.translate(x, y - hop);
        if (c.state === 'pop' || c.state === 'hop') ctx.rotate(c.spin);
        // body: a round blob with little feet
        ctx.fillStyle = c.col;
        ctx.beginPath(); ctx.ellipse(-4, rad - 1, 3, 2, 0, 0, TAU); ctx.ellipse(4, rad - 1, 3, 2, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(40,20,40,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        // egg-shell hat for the first moments
        if (c.age < 3 && c.state === 'walk') { ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.moveTo(-6, -rad + 3); ctx.lineTo(-3, -rad - 3); ctx.lineTo(0, -rad + 1); ctx.lineTo(3, -rad - 3); ctx.lineTo(6, -rad + 3); ctx.closePath(); ctx.fill(); }
        // eyes and a smile (dizzy crosses when popped)
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-3.4, -1.5, 2.8, 0, TAU); ctx.arc(3.4, -1.5, 2.8, 0, TAU); ctx.fill();
        if (c.state === 'pop') {
          ctx.strokeStyle = '#2a1030'; ctx.lineWidth = 1.2; ctx.beginPath();
          ctx.moveTo(-5, -3.5); ctx.lineTo(-2, 0.5); ctx.moveTo(-2, -3.5); ctx.lineTo(-5, 0.5); ctx.moveTo(2, -3.5); ctx.lineTo(5, 0.5); ctx.moveTo(5, -3.5); ctx.lineTo(2, 0.5); ctx.stroke();
        } else {
          ctx.fillStyle = '#2a1030'; ctx.beginPath(); ctx.arc(-3.2, -1, 1.4, 0, TAU); ctx.arc(3.6, -1, 1.4, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#2a1030'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 2.2, 2.6, 0.3, Math.PI - 0.3); ctx.stroke();
          ctx.fillStyle = 'rgba(255,120,150,0.6)'; ctx.beginPath(); ctx.arc(-6, 2.5, 1.5, 0, TAU); ctx.arc(6, 2.5, 1.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
        // a falling critter shows a soft shadow where it is heading, at paddle height
        if (c.state === 'walk' && c.y > 330) {
          ctx.fillStyle = 'rgba(255,180,220,' + Math.min(0.35, (c.y - 330) / 600).toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(c.x, g.paddle.y + 10, 10, 3, 0, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  });

  // ---------------- Puppet Strings: a block of bricks slides as the paddle moves, in mirror image ----------------
  // params: rows (grid rows that make the block). The block's offset follows -(paddle.x - centre) * mirror, but it
  // only ever moves where it overlaps no ball and no other brick, so it can never push into or trap the ball (it waits).
  register('puppet', {
    init: function (g, r) {
      var s = r.s, p = r.p, rows = p.rows || [];
      s.off = 0; s.list = []; s.blocked = 0;
      var minX = 1e9, maxX = -1e9;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.grid || rows.indexOf(b.row) < 0) continue;
        b.puppet = r; s.list.push(b);
        minX = Math.min(minX, b.bx); maxX = Math.max(maxX, b.bx + b.w);
      }
      s.lo = Math.max(-p.range, 2 - minX); s.hi = Math.min(p.range, C.W - 2 - maxX);
      s.minY = 1e9; s.maxY = -1e9;
      for (i = 0; i < s.list.length; i++) { s.minY = Math.min(s.minY, s.list[i].by); s.maxY = Math.max(s.maxY, s.list[i].by + s.list[i].h); }
    },
    target: function (g, r) { return P.clamp(-(g.paddle.x - C.W / 2) * r.p.mirror, r.s.lo, r.s.hi); },
    fits: function (g, r, off) {
      var list = r.s.list, m = r.p.ballMargin;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (!b.alive || !b.solid) continue;
        var x = b.bx + off, y = b.by + b.dy;
        if (g.ballNear(x, y, b.w, b.h, m)) return false;
        for (var j = 0; j < g.bricks.length; j++) {
          var k = g.bricks[j];
          if (k.puppet === r || !k.alive || !k.solid) continue;
          if (k.x < x + b.w && k.x + k.w > x && k.y < y + b.h && k.y + k.h > y) return false;
        }
      }
      return true;
    },
    update: function (g, r, dt) {
      var s = r.s, want = this.target(g, r) - s.off, mv = P.clamp(want, -r.p.speed * dt, r.p.speed * dt);
      if (Math.abs(mv) > 1e-4) {
        var moved = false;
        for (var k = 0; k < 4 && !moved; k++) { // try the whole step, then smaller ones
          if (this.fits(g, r, s.off + mv)) { s.off += mv; moved = true; } else mv /= 2;
        }
        if (!moved) s.blocked += dt;
      }
      for (var i = 0; i < s.list.length; i++) s.list[i].dx += s.off;
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var s = r.s, i, any = false, x0 = 1e9, x1 = -1e9;
      for (i = 0; i < s.list.length; i++) if (s.list[i].alive) { any = true; x0 = Math.min(x0, s.list[i].x); x1 = Math.max(x1, s.list[i].x + s.list[i].w); }
      if (!any) return;
      ctx.save();
      // the control bar at the top tilts the other way to the paddle; strings run down to the block
      var cx = C.W / 2 + s.off * 0.5, cy = g.topY + 8, tilt = P.clamp(s.off / 400, -0.35, 0.35);
      var ex = Math.cos(tilt) * 46, ey = Math.sin(tilt) * 46;
      ctx.strokeStyle = 'rgba(230,200,150,0.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - ex, cy - ey); ctx.lineTo(cx + ex, cy + ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(235,235,255,0.45)'; ctx.lineWidth = 1;
      var tops = [x0 + 4, (x0 + x1) / 2, x1 - 4];
      for (i = 0; i < 3; i++) {
        var hx = cx + (i - 1) * ex, hy = cy + (i - 1) * ey;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tops[i], s.minY + (s.list[0] ? s.list[0].dy : 0)); ctx.stroke();
      }
      // mirror arrows under the block: it goes the other way to you
      var ay = s.maxY + 9, dir = s.off > 0.5 ? 1 : (s.off < -0.5 ? -1 : 0);
      ctx.fillStyle = 'rgba(235,220,180,0.55)';
      for (var k = -1; k <= 1; k += 2) {
        var ax = (x0 + x1) / 2 + k * 22;
        ctx.beginPath(); ctx.moveTo(ax + k * 7, ay); ctx.lineTo(ax - k * 2, ay - 5); ctx.lineTo(ax - k * 2, ay + 5); ctx.closePath(); ctx.fill();
      }
      if (dir) { ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.beginPath(); ctx.arc((x0 + x1) / 2 + dir * 22, ay, 2, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  });

  // ---------------- Builder Bots: little robots on rails rebuild broken bricks ----------------
  // params: bots [{ row (rail grid row), c0, c1 (columns it patrols), rows: [r0, r1] (rows it looks after) }].
  // A bot drives along its rail; under a broken brick it stops and builds it back over `build` seconds (shown as a
  // scaffold filling up). A brick is never finished with a ball near it (the bot waits), and bots never drive into
  // a ball. Bots take two hits; knock them out first and the rest of the wall stays broken.
  register('builders', {
    init: function (g, r) {
      var s = r.s, p = r.p, gr = C.grid;
      s.bots = []; s.t = 0; s.built = 0; s.build = pick(g, p, 'build') / Math.sqrt(g.preset.hazardScale);
      var specs = p.bots || [];
      for (var i = 0; i < specs.length; i++) {
        var sp = specs[i], y = (sp.y != null ? sp.y : gr.top + sp.row * gr.cellH) + 1;
        var bot = BT.Bricks.make('bot', sp.c0 * gr.cellW + 2, y, 26, 14);
        bot.hp = bot.maxHp = p.botHp; bot.color = '#9aa7c4'; bot.owner = r; bot.customDraw = true; bot.noPierce = false;
        bot.x0 = sp.c0 * gr.cellW + 2; bot.x1 = (sp.c1 + 1) * gr.cellW - 28; bot.dir = i % 2 ? -1 : 1;
        bot.plans = []; bot.job = null; bot.jobT = 0; bot.wait = 0; bot.wheel = 0;
        if (bot.dir < 0) bot.bx = bot.x1;
        bot.x = bot.bx; bot.y = bot.by;
        var r0 = sp.rows ? sp.rows[0] : 0, r1 = sp.rows ? sp.rows[1] : 99;
        for (var j = 0; j < g.bricks.length; j++) {
          var b = g.bricks[j];
          if (!b.alive || !b.grid || !b.breakable || b.type === 'bot' || b.row < r0 || b.row > r1) continue;
          var cx = b.bx + b.w / 2;
          if (cx < sp.c0 * gr.cellW || cx > (sp.c1 + 1) * gr.cellW) continue;
          b.keepDead = true; // stays in the list when broken, so it can be rebuilt
          bot.plans.push(b);
        }
        g.addBrick(bot);
        s.bots.push(bot);
      }
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, active = g.hazardsActive(p.firstDelay);
      s.t += dt;
      for (var i = 0; i < s.bots.length; i++) {
        var bot = s.bots[i];
        if (!bot.alive) continue;
        if (bot.wait > 0) bot.wait -= dt;
        if (bot.job) {
          var k = bot.job;
          if (k.alive) { bot.job = null; continue; }
          if (g.ballNear(k.bx + k.dx, k.by + k.dy, k.w, k.h, p.ballMargin)) { k.pendingBuild = true; continue; } // wait for the ball to go
          k.pendingBuild = false;
          bot.jobT -= dt;
          k.buildF = 1 - bot.jobT / s.build;
          if (bot.jobT <= 0) {
            k.alive = true; k.hp = 1; k.flash = 0.3; k.buildF = 0; k.x = k.bx + k.dx; k.y = k.by + k.dy;
            bot.job = null; bot.wait = 0.6; s.built++;
            g.fx.sound('build'); g.fx.burst(k.x + k.w / 2, k.y + k.h / 2, '#ffd35a', 6, 'spark');
            g.fx.text(k.x + k.w / 2, k.y - 6, 'Rebuilt!', '#ffd35a');
          }
          continue;
        }
        if (!active || bot.wait > 0) continue;
        // a broken brick right above? start building it
        var cxb = bot.bx + bot.w / 2;
        for (var j = 0; j < bot.plans.length; j++) {
          var pl = bot.plans[j];
          if (pl.alive || Math.abs(pl.bx + pl.w / 2 - cxb) > 3) continue;
          bot.job = pl; bot.jobT = s.build; pl.buildF = 0;
          g.fx.sound('robot');
          break;
        }
        if (bot.job) continue;
        // drive along the rail (never into a ball)
        var nx = bot.bx + bot.dir * p.speed * Math.sqrt(g.preset.hazardScale) * dt;
        if (nx < bot.x0) { nx = bot.x0; bot.dir = 1; } else if (nx > bot.x1) { nx = bot.x1; bot.dir = -1; }
        if (!g.ballNear(nx, bot.by, bot.w, bot.h, 2)) { bot.bx = nx; bot.wheel += dt * 12 * bot.dir; }
      }
    },
    onBrickHit: function (g, r, b) {
      if (b.type !== 'bot' || b.owner !== r) return false;
      if (b.hp > 1) { g.fx.sound('armour'); g.fx.text(b.x + b.w / 2, b.y - 6, 'Bonk!', '#c9d6ee'); }
      return false;
    },
    onBrickDestroyed: function (g, r, b) {
      if (b.type === 'bot' && b.owner === r) {
        if (b.job) { b.job.buildF = 0; b.job.pendingBuild = false; b.job = null; }
        g.fx.sound('bossdown'); g.fx.text(b.x + b.w / 2, b.y - 8, 'Bot down!', '#ffe27a');
        g.fx.burst(b.x + b.w / 2, b.y + b.h / 2, '#c9d6ee', 14, 'chip');
      }
    },
    onRemove: function (g, r) { for (var i = 0; i < r.s.bots.length; i++) if (r.s.bots[i].alive) g.destroyBrick(r.s.bots[i], 'boss'); },
    render: function (ctx, g, r, layer, R) {
      var s = r.s, i, b;
      ctx.save();
      if (layer === 'back') {
        // rails, and scaffolds where a brick is being rebuilt
        var drawn = {};
        for (i = 0; i < s.bots.length; i++) {
          b = s.bots[i];
          var key = (b.by | 0) + ':' + (b.x0 | 0); if (drawn[key]) continue; drawn[key] = true;
          var y = b.by + b.h + 2;
          ctx.strokeStyle = 'rgba(160,170,200,0.45)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(b.x0 - 2, y); ctx.lineTo(b.x1 + 28, y); ctx.stroke();
          ctx.lineWidth = 1;
          for (var x = b.x0; x < b.x1 + 28; x += 10) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 3); ctx.stroke(); }
        }
        for (i = 0; i < s.bots.length; i++) {
          var k = s.bots[i].alive && s.bots[i].job;
          if (!k) continue;
          var kx = k.bx + k.dx, ky = k.by + k.dy, f = k.buildF || 0;
          ctx.setLineDash([3, 3]); ctx.strokeStyle = k.pendingBuild ? 'rgba(255,255,255,' + (0.5 + 0.5 * Math.sin(g.t * 30)).toFixed(3) + ')' : 'rgba(255,211,90,0.8)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(kx + 0.5, ky + 0.5, k.w - 1, k.h - 1); ctx.setLineDash([]);
          ctx.globalAlpha = 0.55; ctx.fillStyle = k.color; ctx.fillRect(kx + 1, ky + k.h * (1 - f), k.w - 2, k.h * f); ctx.globalAlpha = 1;
          // the beam from the bot up to it
          var bt = s.bots[i];
          ctx.strokeStyle = 'rgba(255,211,90,' + (0.4 + 0.3 * Math.sin(g.t * 20)).toFixed(3) + ')'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(bt.x + bt.w / 2, bt.y); ctx.lineTo(kx + k.w / 2, ky + k.h); ctx.stroke();
        }
      } else {
        for (i = 0; i < s.bots.length; i++) {
          b = s.bots[i];
          if (!b.alive) continue;
          var bx = b.x, by = b.y, busy = !!b.job;
          R.roundRect(ctx, bx, by + 1, b.w, b.h - 3, 4);
          ctx.fillStyle = b.flash > 0 ? '#ffffff' : (b.hp < b.maxHp ? '#c98a8a' : '#9aa7c4'); ctx.fill();
          ctx.strokeStyle = '#3a4258'; ctx.lineWidth = 1.2; ctx.stroke();
          // wheels
          ctx.fillStyle = '#2a3042';
          for (var w = 0; w < 2; w++) { var wx = bx + 6 + w * 14; ctx.beginPath(); ctx.arc(wx, by + b.h - 1, 3, 0, TAU); ctx.fill(); ctx.strokeStyle = '#8890a8'; ctx.beginPath(); ctx.moveTo(wx, by + b.h - 1); ctx.lineTo(wx + Math.cos(b.wheel) * 3, by + b.h - 1 + Math.sin(b.wheel) * 3); ctx.stroke(); }
          // visor eyes, looking the way it drives
          ctx.fillStyle = '#10141f'; R.roundRect(ctx, bx + 5, by + 3, b.w - 10, 5, 2); ctx.fill();
          ctx.fillStyle = busy ? '#ffd35a' : '#7cf5ff';
          ctx.beginPath(); ctx.arc(bx + b.w / 2 - 4 + b.dir * 2, by + 5.5, 1.6, 0, TAU); ctx.arc(bx + b.w / 2 + 4 + b.dir * 2, by + 5.5, 1.6, 0, TAU); ctx.fill();
          // antenna, and a little hammer that bangs while it builds
          ctx.strokeStyle = '#3a4258'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx + b.w / 2, by + 1); ctx.lineTo(bx + b.w / 2, by - 4); ctx.stroke();
          ctx.fillStyle = busy ? '#ffd35a' : '#ff6b6b'; ctx.beginPath(); ctx.arc(bx + b.w / 2, by - 5, 1.8, 0, TAU); ctx.fill();
          if (busy) {
            var ha = Math.sin(g.t * 18) * 0.8;
            ctx.save(); ctx.translate(bx + b.w - 3, by + 2); ctx.rotate(-0.6 + ha);
            ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke();
            ctx.fillStyle = '#d8dcea'; ctx.fillRect(-3, -10, 6, 3); ctx.restore();
          }
          for (var h = 0; h < b.hp; h++) { ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(bx + 3 + h * 4, by - 2, 1.4, 0, TAU); ctx.fill(); }
        }
      }
      ctx.restore();
    }
  });

  // ---------------- Paint Job: the ball takes its colour from paint gates and breaks only that colour ----------------
  // params: gates [{ x, y, w, color }], start. Bricks with a group (R red dot, B blue square, Y yellow triangle) only
  // break for a ball of the same colour; others bounce it. Plain bricks break for any ball. Gates are fixed and
  // open, and every colour a level uses has a gate, so it can never dead-end.
  var PAINT = { red: { c: '#ff4d5e', mark: 'dot', name: 'RED' }, blue: { c: '#3d8bff', mark: 'square', name: 'BLUE' }, yellow: { c: '#ffd23d', mark: 'tri', name: 'YELLOW' } };
  BT.PAINT = PAINT;
  function paintMark(ctx, mark, x, y, s) {
    ctx.beginPath();
    if (mark === 'dot') ctx.arc(x, y, s, 0, TAU);
    else if (mark === 'square') ctx.rect(x - s, y - s, s * 2, s * 2);
    else { ctx.moveTo(x, y - s * 1.15); ctx.lineTo(x + s * 1.1, y + s * 0.85); ctx.lineTo(x - s * 1.1, y + s * 0.85); ctx.closePath(); }
    ctx.fill();
  }
  BT.paintMark = paintMark;
  register('paint', {
    init: function (g, r) {
      r.s.t = 0; r.s.wrong = 0; r.s.changes = 0;
      r.s.start = r.p.start || (r.p.gates && r.p.gates[0] ? r.p.gates[0].color : 'red');
      for (var i = 0; i < g.balls.length; i++) if (!g.balls[i].paint) g.balls[i].paint = r.s.start;
      r.s.gf = []; for (i = 0; i < (r.p.gates || []).length; i++) r.s.gf.push(0);
    },
    onServeBall: function (g, r, b) { b.paint = r.s.start; },
    update: function (g, r, dt) {
      r.s.t += dt;
      var fallback = null, i;
      for (i = 0; i < g.balls.length; i++) if (g.balls[i].paint) { fallback = g.balls[i].paint; break; }
      for (i = 0; i < g.balls.length; i++) if (!g.balls[i].paint) g.balls[i].paint = fallback || r.s.start; // copies keep the colour
      for (i = 0; i < r.s.gf.length; i++) if (r.s.gf[i] > 0) r.s.gf[i] -= dt;
      for (i = 0; i < g.bricks.length; i++) if (g.bricks[i].wrongT > 0) g.bricks[i].wrongT -= dt;
    },
    onBallStep: function (g, r, b) {
      var gates = r.p.gates || [], hh = r.p.gateH / 2 + 2;
      if (b.vy >= 0) return; // gates paint a ball on its way up (the colour you send up is the colour you chose)
      for (var i = 0; i < gates.length; i++) {
        var q = gates[i];
        if (b.x < q.x || b.x > q.x + q.w || Math.abs(b.y - q.y) > hh) continue;
        if (b.paint !== q.color) {
          b.paint = q.color; r.s.gf[i] = 0.3; r.s.changes++;
          g.fx.sound('paint', ['red', 'blue', 'yellow'].indexOf(q.color));
          g.fx.burst(b.x, b.y, PAINT[q.color].c, 12, 'spark');
        }
      }
    },
    onBrickHit: function (g, r, k, ball, cause) {
      if (!k.group || !PAINT[k.group] || !ball || (cause !== 'ball' && cause !== 'pierce')) return false;
      if (ball.paint === k.group) return false;
      k.flash = 0.12; k.wrongT = 0.6; r.s.wrong++;
      g.fx.sound('gate');
      return true;
    },
    onRemove: function (g) { for (var i = 0; i < g.balls.length; i++) g.balls[i].paint = null; },
    // what a sensible player aims at (the test bot uses it): the lowest coloured brick if the ball is already its
    // colour, otherwise the gate of that colour
    botTarget: function (g, r) {
      var low = null, i;
      for (i = 0; i < g.bricks.length; i++) { var k = g.bricks[i]; if (k.alive && k.group && PAINT[k.group] && (!low || k.y > low.y)) low = k; }
      if (!low) return null;
      var b = g.balls[0];
      if (b && b.paint === low.group) return { x: low.x + low.w / 2, y: low.y + low.h / 2 };
      var gates = r.p.gates || [];
      for (i = 0; i < gates.length; i++) if (gates[i].color === low.group) return { x: gates[i].x + gates[i].w / 2, y: gates[i].y };
      return null;
    },
    render: function (ctx, g, r, layer, R) {
      var gates = r.p.gates || [], i;
      ctx.save();
      if (layer === 'back') {
        for (i = 0; i < gates.length; i++) {
          var q = gates[i], st = PAINT[q.color], h = r.p.gateH, fl = r.s.gf[i] > 0;
          var grd = ctx.createLinearGradient(0, q.y - 16, 0, q.y + 16);
          grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, st.c); grd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = fl ? 0.55 : 0.28; ctx.fillStyle = grd; ctx.fillRect(q.x, q.y - 16, q.w, 32); ctx.globalAlpha = 1;
          R.roundRect(ctx, q.x, q.y - h / 2, q.w, h, h / 2);
          ctx.fillStyle = fl ? '#ffffff' : st.c; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = 'rgba(10,12,30,0.75)';
          for (var x = q.x + 10; x < q.x + q.w - 4; x += 16) paintMark(ctx, st.mark, x, q.y, 2.6);
          // little up arrows: fly up through it
          ctx.fillStyle = st.c; ctx.globalAlpha = 0.7;
          for (var ax = q.x + q.w * 0.25; ax < q.x + q.w; ax += q.w * 0.5) {
            var bob = Math.sin(g.t * 4 + ax) * 1.5;
            ctx.beginPath(); ctx.moveTo(ax, q.y - 18 + bob); ctx.lineTo(ax - 5, q.y - 11 + bob); ctx.lineTo(ax + 5, q.y - 11 + bob); ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
          // posts at each end
          ctx.fillStyle = '#d8dcea'; ctx.fillRect(q.x - 2, q.y - 9, 3, 18); ctx.fillRect(q.x + q.w - 1, q.y - 9, 3, 18);
        }
        // bricks that just bounced a wrong-coloured ball show a cross
        for (i = 0; i < g.bricks.length; i++) {
          var k = g.bricks[i];
          if (!(k.wrongT > 0) || !k.alive) continue;
          ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(1, k.wrongT * 2).toFixed(3) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(k.x + k.w / 2 - 5, k.y - 9); ctx.lineTo(k.x + k.w / 2 + 5, k.y - 1); ctx.moveTo(k.x + k.w / 2 + 5, k.y - 9); ctx.lineTo(k.x + k.w / 2 - 5, k.y - 1); ctx.stroke();
        }
      } else {
        // the ball wears its paint: filled in the colour, a white rim, and the colour's symbol in the middle
        for (i = 0; i < g.balls.length; i++) {
          var b = g.balls[i], st2 = PAINT[b.paint];
          if (!st2) continue;
          ctx.fillStyle = st2.c; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.5, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.strokeStyle = st2.c; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(10,12,30,0.85)'; paintMark(ctx, st2.mark, b.x, b.y, 2.8);
        }
      }
      ctx.restore();
    },
    renderHUD: function (ctx, g, r, R) {
      // legend under the HUD: the ball's colour, with its symbol and its name
      var b = g.balls[0], st = b && PAINT[b.paint];
      if (!st) return;
      var x = C.W / 2, y = g.topY + 12;
      ctx.save();
      R.roundRect(ctx, x - 64, y - 9, 128, 18, 9); ctx.fillStyle = 'rgba(5,7,16,0.8)'; ctx.fill();
      ctx.strokeStyle = st.c; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = st.c; paintMark(ctx, st.mark, x - 48, y, 4.5);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px ' + R.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('BALL: ' + st.name, x - 38, y + 0.5);
      ctx.restore();
    }
  });

  // ======================================================================================
  // World 11 - Topsy-turvy
  // ======================================================================================

  // ---------------- Cannonball: the ball has weight and is lobbed ----------------
  // Gravity bends the ball downward and it is a little slower high up (zoneMul), so shots arc. The paddle sends it
  // out at a narrower angle (angleMul) so every shot still climbs; a shot from the middle of the paddle goes straight
  // up to the top bricks. Its minimum vertical speed is lower (minVy) so an arc can turn over, and at the top of an
  // arc it always turns over and comes down: it can never hover. A faint aiming arc shows after each paddle hit.
  register('cannon', {
    init: function (g, r) {
      var p = r.p;
      r.s.g = pick(g, p, 'gravity') * Math.sqrt(g.preset.forceScale > 1 ? g.preset.forceScale : 1);
      r.s.since = 99; r.s.ball = null; r.s.apexes = 0;
      for (var i = 0; i < g.balls.length; i++) g.balls[i].minVy = p.minVy;
    },
    onServeBall: function (g, r, b) { b.minVy = r.p.minVy; },
    update: function (g, r, dt) {
      r.s.since += dt;
      for (var i = 0; i < g.balls.length; i++) if (g.balls[i].minVy == null) g.balls[i].minVy = r.p.minVy;
    },
    heightMul: function (g, r, y) {
      var h = P.clamp((y - g.topY) / (g.paddle.y - g.topY), 0, 1);
      return r.p.topMul + (1 - r.p.topMul) * h;
    },
    onBallStep: function (g, r, b, dt) {
      if (b.stuck || (g.state !== 'play' && g.state !== 'clearing')) return;
      b.zoneMul = this.heightMul(g, r, b.y);
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      b.vy += r.s.g * dt;
      var lim = r.p.minVy * sp;
      if (b.vy < 0 && b.vy > -lim * 1.05) { b.vy = lim * 1.05; r.s.apexes++; } // the top of the arc: over it goes
    },
    onPaddleHit: function (g, r, b, xp) {
      if (xp) return;
      var a = Math.atan2(b.vx, -b.vy) * r.p.angleMul, sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
      r.s.since = 0; r.s.ball = b;
    },
    onRemove: function (g) { for (var i = 0; i < g.balls.length; i++) { g.balls[i].minVy = null; g.balls[i].zoneMul = 1; } },
    render: function (ctx, g, r, layer) {
      if (layer !== 'front') return;
      var s = r.s, b = s.ball, ps = r.p.predictSeconds;
      if (!b || b.dead || s.since > ps || g.state !== 'play' || b.vy >= 0 && s.since > 0.2) return;
      // the aiming arc: the same gravity, stepped forward
      var x = b.x, y = b.y, vx = b.vx, vy = b.vy, dt = 1 / 60, a = 0.75 * (1 - s.since / ps);
      ctx.save(); ctx.fillStyle = 'rgba(255,236,190,' + a.toFixed(3) + ')';
      for (var st = 0; st < 90; st++) {
        var sp = Math.sqrt(vx * vx + vy * vy), want = g.speed() * this.heightMul(g, r, y);
        vy += s.g * dt;
        var lim = r.p.minVy * sp;
        if (vy < 0 && vy > -lim * 1.05) vy = lim * 1.05;
        var n = Math.sqrt(vx * vx + vy * vy); vx = vx / n * want; vy = vy / n * want;
        x += vx * dt; y += vy * dt;
        if (x < g.wallL + b.r) { x = g.wallL + b.r; vx = -vx; } else if (x > g.wallR - b.r) { x = g.wallR - b.r; vx = -vx; }
        if (y < g.topY + b.r) { y = g.topY + b.r; vy = -vy; }
        var hit = false;
        for (var j = 0; j < g.bricks.length && !hit; j++) { var k = g.bricks[j]; if (k.alive && k.solid && x > k.x - 2 && x < k.x + k.w + 2 && y > k.y - 2 && y < k.y + k.h + 2) hit = true; }
        if (hit || y > g.paddle.y) break;
        if (st % 3 === 0) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  });

  // ---------------- Skyscraper: the level is several screens tall; the view follows the ball ----------------
  // params: floors { towerRow: line } (row 0 is the top of the tower), screens. The top wall moves up off the screen
  // (g.topY) and the camera (g.cam) follows the lowest ball, keeping it between `high` and `low` on screen: once a
  // ball is back down near the paddle the camera is back at the bottom, so ball and paddle are both in view. While
  // the paddle is off the bottom of the screen a marker shows where it is, and a strip at the side maps the tower.
  register('skyscraper', {
    init: function (g, r) {
      var s = r.s, p = r.p, gr = C.grid, span = C.H - C.TOP;
      g.topY = C.TOP - (p.screens - 1) * span;
      s.top0 = g.topY + 20; s.cam = 0; s.rows = 0; s.maxSpeed = 0;
      var floors = p.floors || {};
      for (var key in floors) {
        var row = +key, line = floors[key];
        s.rows = Math.max(s.rows, row + 1);
        for (var col = 0; col < line.length; col++) {
          var b = BT.Bricks.fromChar(line[col], col * gr.cellW + 1, s.top0 + row * gr.cellH + 1, gr.brickW, gr.brickH);
          if (!b) continue;
          b.row = row; b.col = col; b.tower = true;
          g.addBrick(b);
        }
      }
      g.cam = 0;
    },
    follow: function (g) {
      var best = null;
      for (var i = 0; i < g.balls.length; i++) { var b = g.balls[i]; if (!b.dead && (!best || b.y > best.y)) best = b; }
      return best;
    },
    update: function (g, r) {
      var s = r.s, p = r.p, rdt = g.realDt || 0, b = this.follow(g), minCam = g.topY - C.TOP;
      var want = 0;
      if (b && !b.stuck) {
        want = P.clamp(s.cam, b.y - p.low, b.y - p.high);
        want = P.clamp(want, minCam, 0);
      }
      var old = s.cam;
      s.cam += (want - s.cam) * Math.min(1, p.follow * rdt);
      if (b && !b.stuck) { // hard limits: the ball is always on screen, and never left far behind on its way down
        if (b.vy > 0) s.cam = Math.max(s.cam, Math.min(0, b.y - p.low - 30));
        s.cam = P.clamp(s.cam, b.y - (C.H - 24), b.y - (C.TOP + 14));
      }
      s.cam = P.clamp(s.cam, minCam, 0);
      if (rdt > 0) s.maxSpeed = Math.max(s.maxSpeed, Math.abs(s.cam - old) / rdt);
      g.cam = s.cam;
    },
    onRemove: function (g) { g.topY = C.TOP; g.cam = 0; },
    botTarget: function (g) { // the nearest floor first
      var low = null;
      for (var i = 0; i < g.bricks.length; i++) { var k = g.bricks[i]; if (k.alive && k.required && (!low || k.y > low.y)) low = k; }
      return low ? { x: low.x + low.w / 2, y: low.y + low.h / 2 } : null;
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var s = r.s, y0 = g.topY, i;
      ctx.save();
      // the tower: floor lines and lit windows, drawn in the world so they scroll with the view
      var vis0 = g.cam + C.TOP - 20, vis1 = g.cam + C.H + 20;
      for (var y = y0; y < C.H; y += 96) {
        if (y < vis0 - 96 || y > vis1) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, y, C.W, 2);
        for (i = 0; i < 6; i++) {
          var lit = ((y / 96 | 0) * 7 + i * 3) % 5 === 0;
          ctx.fillStyle = lit ? 'rgba(255,220,140,0.10)' : 'rgba(150,180,255,0.05)';
          ctx.fillRect(18 + i * 58, y + 30, 26, 34);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = 'bold 10px ' + (BT.Render ? BT.Render.R.FONT : 'sans-serif'); ctx.textAlign = 'left';
        ctx.fillText('FLOOR ' + Math.round((C.H - y) / 96), 6, y + 14);
      }
      // the roof
      ctx.fillStyle = 'rgba(255,211,90,0.5)'; ctx.fillRect(0, y0 - 3, C.W, 3);
      ctx.restore();
    },
    renderHUD: function (ctx, g, r, R) {
      var s = r.s, p = r.p, pd = g.paddle, i;
      ctx.save();
      // mini-map strip on the right: the whole tower, the part on screen, the bricks, the balls and the paddle
      var mx = C.W - p.mapW - 3, my0 = C.TOP + 6, my1 = C.H - 6, wy0 = g.topY, wy1 = C.H;
      var k = (my1 - my0) / (wy1 - wy0);
      R.roundRect(ctx, mx, my0, p.mapW, my1 - my0, 3); ctx.fillStyle = 'rgba(5,7,16,0.7)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      for (i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.alive || !b.solid) continue;
        ctx.fillStyle = b.breakable ? 'rgba(255,255,255,0.55)' : 'rgba(150,160,180,0.55)';
        ctx.fillRect(mx + 1 + (b.x / C.W) * (p.mapW - 2), my0 + (b.y - wy0) * k, Math.max(1, b.w / C.W * (p.mapW - 2)), 1.2);
      }
      var vy0 = my0 + (g.cam + C.TOP - wy0) * k, vy1 = my0 + (g.cam + C.H - wy0) * k;
      ctx.strokeStyle = 'rgba(255,211,90,0.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(mx - 1, vy0, p.mapW + 2, vy1 - vy0);
      ctx.fillStyle = '#4fd8ff'; ctx.fillRect(mx, my0 + (pd.y - wy0) * k - 1, p.mapW, 2);
      for (i = 0; i < g.balls.length; i++) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx + p.mapW / 2, my0 + (g.balls[i].y - wy0) * k, 2.4, 0, TAU); ctx.fill(); }
      // the paddle, when the view has gone up and left it below the screen
      var py = pd.y - g.cam;
      if (py > C.H - 4) {
        var a = 0.6 + 0.3 * Math.sin(g.t * 6);
        ctx.fillStyle = 'rgba(79,216,255,' + a.toFixed(3) + ')';
        R.roundRect(ctx, pd.x - pd.w / 2, C.H - 7, pd.w, 5, 2.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(pd.x - 7, C.H - 18); ctx.lineTo(pd.x + 7, C.H - 18); ctx.lineTo(pd.x, C.H - 10); ctx.closePath(); ctx.fill(); // points down to it
      }
      // other balls off the top or bottom of the screen
      for (i = 0; i < g.balls.length; i++) {
        var bb = g.balls[i], sy = bb.y - g.cam;
        if (sy < C.TOP + 4) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(bb.x - 5, C.TOP + 14); ctx.lineTo(bb.x + 5, C.TOP + 14); ctx.lineTo(bb.x, C.TOP + 6); ctx.closePath(); ctx.fill(); }
        else if (sy > C.H) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(bb.x - 5, C.H - 26); ctx.lineTo(bb.x + 5, C.H - 26); ctx.lineTo(bb.x, C.H - 18); ctx.closePath(); ctx.fill(); }
      }
      ctx.restore();
    }
  });

  // ---------------- By the Numbers: numbered bricks (grid N) must be broken in order ----------------
  // params: order [[row, col], ...] (else reading order). Only the next number breaks; the others are solid and just
  // bounce the ball. The next one glows with a NEXT tag; after a while without it, a dotted line points to it.
  register('numbers', {
    init: function (g, r) {
      var s = r.s, i, list = [], nums = g.bricks.filter(function (b) { return b.type === 'num'; });
      (r.p.order || []).forEach(function (rc) {
        for (var j = 0; j < nums.length; j++) if (nums[j].row === rc[0] && nums[j].col === rc[1] && list.indexOf(nums[j]) < 0) list.push(nums[j]);
      });
      nums.sort(function (a, b) { return a.row - b.row || a.col - b.col; });
      for (i = 0; i < nums.length; i++) if (list.indexOf(nums[i]) < 0) list.push(nums[i]);
      for (i = 0; i < list.length; i++) list[i].num = i + 1;
      s.list = list; s.next = 0; s.since = 0; s.nope = 0; s.wrong = 0;
      this.mark(r);
    },
    mark: function (r) {
      var s = r.s;
      for (var i = 0; i < s.list.length; i++) { var b = s.list[i]; b.isNext = i === s.next; b.color = i === s.next ? '#ffd35a' : (i < s.next ? '#ffffff' : '#9aa3bb'); }
    },
    nextBrick: function (r) { return r.s.list[r.s.next] || null; },
    botTarget: function (g, r) { var b = this.nextBrick(r); return b && b.alive ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; },
    update: function (g, r, dt) {
      var s = r.s;
      if (g.state === 'play') s.since += dt;
      if (s.nope > 0) s.nope -= dt;
      while (s.next < s.list.length && !s.list[s.next].alive) { s.next++; this.mark(r); }
    },
    onBrickHit: function (g, r, k) {
      if (k.type !== 'num' || k === this.nextBrick(r)) return false;
      k.flash = 0.12; k.shake = 0.15; r.s.wrong++;
      g.fx.sound('gate');
      if (r.s.nope <= 0) { var nb = this.nextBrick(r); r.s.nope = 1.2; g.fx.text(k.x + k.w / 2, k.y - 8, nb ? 'Find ' + nb.num + ' first!' : 'Not yet!', '#ffe9a8'); }
      return true;
    },
    onBrickDestroyed: function (g, r, k) {
      if (k.type !== 'num') return;
      var s = r.s;
      if (k === s.list[s.next]) { s.next++; s.since = 0; this.mark(r); g.fx.sound('numok', s.next); }
    },
    renderOverBricks: function (ctx, g, r, R) {
      var s = r.s, b = this.nextBrick(r);
      if (!b || !b.alive) return;
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2, pu = 0.5 + 0.5 * Math.sin(g.t * 6);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,211,90,' + (0.5 + 0.5 * pu).toFixed(3) + ')'; ctx.lineWidth = 2.5;
      R.roundRect(ctx, b.x - 3 - pu * 2, b.y - 3 - pu * 2, b.w + 6 + pu * 4, b.h + 6 + pu * 4, 6); ctx.stroke();
      // NEXT tag above it
      R.roundRect(ctx, cx - 17, b.y - 17, 34, 11, 5); ctx.fillStyle = '#ffd35a'; ctx.fill();
      ctx.fillStyle = '#2b1d00'; ctx.font = 'bold 8px ' + R.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('NEXT', cx, b.y - 11.5);
      // a hint line from the ball (or the paddle) after a while
      if (s.since > r.p.hintAfter) {
        var src = g.balls[0] || g.paddle, a = Math.min(0.6, (s.since - r.p.hintAfter) / 4);
        ctx.strokeStyle = 'rgba(255,211,90,' + a.toFixed(3) + ')'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); ctx.lineDashOffset = -g.t * 30;
        ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
  });

  // ---------------- Flip: every so often the whole field turns upside down ----------------
  // A long warning (a countdown and turning arrows), then a slow half-turn of the drawn field while the world all
  // but stops and the paddle waits. Upside down, the paddle is at the top of the screen and the controls follow the
  // screen (drag left, it goes left). The HUD never turns. Sun bricks (grid U) are solid only the right way up and
  // moon bricks (D) only upside down, so both ways up are needed to clear the level.
  register('flip', {
    init: function (g, r) {
      var s = r.s, p = r.p;
      s.phase = 'idle'; s.timer = p.first; s.down = false; s.wt = 0; s.tt = 0; s.flips = 0; s.from = 0; s.to = 0; s.tick = 0;
      s.every = easy(g) ? p.everyEasy : p.every / g.preset.hazardScale; s.warn = pick(g, p, 'warn');
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.side) continue;
        g.makeGhostable(b);
        if (b.side === 'down') { b.solid = false; b.ghost = 1; }
      }
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, rdt = g.realDt || dt;
      if (s.phase === 'turn') {
        s.tt += rdt;
        var f = Math.min(1, s.tt / p.turn), e = f * f * (3 - 2 * f);
        g.viewAngle = s.from + (s.to - s.from) * e;
        g.viewFlip = s.to > s.from ? e >= 0.5 : e < 0.5; // controls follow the screen from halfway through the turn
        if (f >= 1) {
          s.phase = 'idle'; s.timer = s.every; s.down = s.to > 0.5; s.flips++;
          g.viewAngle = s.to; g.viewFlip = s.down; g.inputLock = false; g.setWarp('flip', 1);
          g.paddle.targetX = g.paddle.x;
          g.fx.sound('land');
        }
      } else if (!g.hazardsActive(0)) {
        if (s.phase === 'warn') { s.phase = 'idle'; s.timer = Math.max(s.timer, 3); }
      } else if (s.phase === 'idle') {
        s.timer -= rdt;
        if (s.timer <= 0) { s.phase = 'warn'; s.wt = s.warn; s.tick = Math.ceil(s.wt); g.fx.sound('windwarn'); }
      } else if (s.phase === 'warn') {
        s.wt -= rdt;
        if (Math.ceil(s.wt) < s.tick) { s.tick = Math.ceil(s.wt); if (s.tick > 0) g.fx.sound('tick', s.tick); }
        if (s.wt <= 0) {
          s.phase = 'turn'; s.tt = 0; s.from = s.down ? Math.PI : 0; s.to = s.down ? 0 : Math.PI;
          g.inputLock = true; g.setWarp('flip', p.worldScale);
          g.fx.sound('flipturn');
        }
      }
      // sun / moon bricks follow the way up the field is (from halfway through a turn)
      var down = g.viewFlip;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.side || !b.alive) continue;
        if ((b.side === 'up') === down) b.wantGhost = true;
        b.warn = s.phase === 'warn' && ((b.side === 'down') !== s.down) ? 1 - s.wt / s.warn : 0;
      }
    },
    turning: function (r) { return r.s.phase === 'turn'; },
    onRemove: function (g) { g.viewAngle = 0; g.viewFlip = false; g.inputLock = false; g.setWarp('flip', 1); },
    renderHUD: function (ctx, g, r, R) {
      var s = r.s;
      ctx.save();
      // which way up: a small badge (sun or moon), so the bricks that count right now are named too
      var bx = 8, by = Math.max(C.TOP, g.topY) + 6;
      R.roundRect(ctx, bx, by, 96, 18, 9); ctx.fillStyle = 'rgba(5,7,16,0.8)'; ctx.fill();
      ctx.strokeStyle = s.down ? BT.Bricks.MOON_COLOR : BT.Bricks.SUN_COLOR; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = s.down ? BT.Bricks.MOON_COLOR : BT.Bricks.SUN_COLOR;
      if (s.down) { ctx.beginPath(); ctx.arc(bx + 12, by + 9, 5, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(5,7,16,1)'; ctx.beginPath(); ctx.arc(bx + 14.5, by + 7.5, 4.2, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(bx + 12, by + 9, 3.5, 0, TAU); ctx.fill(); ctx.strokeStyle = BT.Bricks.SUN_COLOR; ctx.lineWidth = 1.2; ctx.beginPath(); for (var k = 0; k < 8; k++) { var a = k * TAU / 8; ctx.moveTo(bx + 12 + Math.cos(a) * 5, by + 9 + Math.sin(a) * 5); ctx.lineTo(bx + 12 + Math.cos(a) * 7, by + 9 + Math.sin(a) * 7); } ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px ' + R.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(s.down ? 'UPSIDE DOWN' : 'RIGHT WAY UP', bx + 22, by + 9.5);
      if (s.phase === 'warn' || s.phase === 'turn') {
        var cy = 300, warn = s.phase === 'warn', n = Math.max(1, Math.ceil(s.wt));
        var pop = warn ? 1 + 0.25 * Math.max(0, (s.wt % 1) - 0.75) * 4 : 1;
        ctx.globalAlpha = warn ? 0.95 : Math.max(0, 1 - s.tt / 0.5);
        R.roundRect(ctx, C.W / 2 - 118, cy - 34, 236, 68, 16); ctx.fillStyle = 'rgba(10,12,24,0.82)'; ctx.fill();
        ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 2; ctx.stroke();
        // two turning arrows round the word
        ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        var rot = g.t * 3;
        for (var q = 0; q < 2; q++) {
          var a0 = rot + q * Math.PI;
          ctx.beginPath(); ctx.arc(C.W / 2 - 96, cy, 12, a0, a0 + 2.2); ctx.stroke();
          ctx.beginPath(); ctx.arc(C.W / 2 + 96, cy, 12, a0, a0 + 2.2); ctx.stroke();
        }
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '900 ' + Math.round(22 * pop) + 'px ' + R.FONT;
        ctx.fillText(warn ? 'FLIP IN ' + n : 'FLIP!', C.W / 2, cy - 6);
        ctx.font = '11px ' + R.FONT; ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(s.down ? 'Back the right way up' : 'Your paddle goes to the top', C.W / 2, cy + 16);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  });

  BT.Rules2 = { drawChip: drawChip, ICON: ICON, PAINT: PAINT, nextToPaddle: nextToPaddle };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
