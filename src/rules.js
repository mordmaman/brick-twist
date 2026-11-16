// Level rule modules ("twists"). No DOM: render hooks only draw on the ctx they are given.
//
// A rule module is an object with any of these hooks (all optional):
//   init(g, r)                       build bricks / state. r = { id, mod, p (params), s (state) }
//   update(g, r, dt)                 every physics step, before collision. Move bricks by writing
//                                    b.bx/b.by (bricks the rule owns) or adding to b.dx/b.dy
//                                    (offsets; several rules can add to the same brick).
//   onBallStep(g, r, ball, dt)       after a ball has moved this step (forces, extra colliders).
//                                    The game re-normalises speed afterwards.
//   onBrickHit(g, r, brick, ball, cause)  return true to consume the hit (default damage skipped).
//   onBrickDestroyed(g, r, brick, cause)
//   onPaddleHit(g, r, ball, xp)      xp is the extra paddle that was hit (undefined for yours).
//   onLaser(g, r, bolt)              return true to absorb a laser bolt.
//   onLifeLost(g, r, reason)
//   render(ctx, g, r, layer, R)      layer is 'back' (under bricks) or 'front' (over balls).
//                                    R is the renderer's helper set.
//   renderOverBricks(ctx, g, r, R)   drawn over the bricks but under capsules, paddles and balls.
//   beforeLifeLost(g, r, reason)     return true to handle a lost ball yourself (no life is lost).
//   holdClear(g, r)                  return true while the level must not count as cleared yet.
// Engine extension points a rule can switch on in init (see game.js): g.wrapX, g.topOpen,
// g.addXPaddle(...), g.makeGhostable(brick) + b.wantGhost each step, g.paddle.off, g.retry().
// Rules compose: each only touches its own state, its own bricks, or adds offsets/forces.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, P = BT.Physics, HIT = BT.Physics.HIT;
  var TAU = Math.PI * 2;
  var registry = {};

  function register(id, mod) { mod.id = id; registry[id] = mod; return mod; }

  function distToSegment(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay;
    var l2 = vx * vx + vy * vy;
    var t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var dx = ax + vx * t - px, dy = ay + vy * t - py;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------------- Conveyor: rows slide and wrap ----------------
  // params: rows { rowIndex: speed px/s (sign = direction) }
  register('conveyor', {
    init: function (g, r) {
      var rows = r.p.rows || {};
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.grid || rows[b.row] == null) continue;
        b.wrap = true; b.conv = rows[b.row];
      }
    },
    update: function (g, r, dt) {
      var sc = g.preset.hazardScale;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.alive || !b.conv) continue;
        b.bx += b.conv * sc * dt;
        if (b.bx >= C.W) b.bx -= C.W;
        else if (b.bx + b.w <= 0) b.bx += C.W;
      }
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var rows = r.p.rows || {}, gr = C.grid;
      ctx.save();
      for (var k in rows) {
        var y = gr.top + (+k) * gr.cellH + gr.cellH / 2;
        var dir = rows[k] > 0 ? 1 : -1;
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = gr.cellH;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.W, y); ctx.stroke();
        // moving chevrons show direction
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2;
        var off = ((g.t * rows[k] * g.preset.hazardScale) % 40 + 40) % 40;
        for (var x = -40 + off; x < C.W + 40; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x - 3 * dir, y - 4); ctx.lineTo(x + 3 * dir, y); ctx.lineTo(x - 3 * dir, y + 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  });

  // ---------------- Squeeze: the wall creeps down; anchors shove it back ----------------
  register('squeeze', {
    init: function (g, r) { r.s.offset = 0; r.s.shoveLeft = 0; r.s.cool = 0; r.s.danger = 0; },
    dangerY: function (g, r) { return C.paddle.y - C.paddle.h / 2 - r.p.dangerGap; },
    update: function (g, r, dt) {
      var s = r.s, p = r.p;
      if (s.cool > 0) s.cool -= dt;
      if (g.hazardsActive(p.grace)) s.offset += p.speed * g.preset.hazardScale * dt;
      if (s.shoveLeft > 0) {
        var m = Math.min(s.shoveLeft, 260 * dt);
        s.offset -= m; s.shoveLeft -= m;
      }
      if (s.offset < 0) s.offset = 0;
      var lowest = 0;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.grid) continue;
        b.dy += s.offset;
        if (b.alive && b.by + b.dy + b.h > lowest) lowest = b.by + b.dy + b.h;
      }
      var dy = this.dangerY(g, r);
      s.danger = Math.max(0, Math.min(1, 1 - (dy - lowest) / 120));
      if (lowest >= dy && g.state === 'play') {
        g.fx.text(C.W / 2, dy - 20, 'Squashed!', '#ff8080');
        g.loseLife('crushed');
      }
    },
    onBrickHit: function (g, r, b, ball, cause) {
      if (b.type !== 'anchor') return false;
      b.flash = 0.2;
      if (r.s.cool <= 0) {
        r.s.shoveLeft += r.p.shove;
        r.s.cool = r.p.shoveCooldown;
        g.fx.sound('shove');
        g.fx.text(b.x + b.w / 2, b.y - 6, 'Up!', '#7dfff0');
        g.fx.burst(b.x + b.w / 2, b.y + b.h, '#7dfff0', 8, 'spark');
      }
      g.sinceHit = 0;
      return true;
    },
    onLifeLost: function (g, r) {
      r.s.offset = Math.max(0, r.s.offset - r.p.resetOnLife);
      r.s.shoveLeft = 0;
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var y = this.dangerY(g, r), a = 0.25 + 0.6 * r.s.danger;
      if (r.s.danger > 0.6) a *= 0.75 + 0.25 * Math.sin(g.t * 12);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,80,90,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -g.t * 20;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.W, y); ctx.stroke();
      ctx.restore();
    }
  });

  // ---------------- Orbit: rings rotate round a core; only the core matters ----------------
  // params: cx, cy, rings [{ radius, speed (rad/s), pattern (one char per slot), size }]
  register('orbit', {
    init: function (g, r) {
      var p = r.p;
      r.s.t = 0;
      var core = BT.Bricks.make('core', p.cx - 14, p.cy - 14, 28, 28);
      core.hp = core.maxHp = Math.max(2, Math.round(p.coreHp * (g.preset.bossHpScale > 1 ? 1.25 : 1)));
      core.color = '#ffe27a'; core.owner = r; core.required = true;
      g.addBrick(core);
      r.s.core = core;
      for (var ri = 0; ri < p.rings.length; ri++) {
        var ring = p.rings[ri], pat = ring.pattern, sz = ring.size || 16;
        for (var i = 0; i < pat.length; i++) {
          var b = BT.Bricks.fromChar(pat[i], 0, 0, sz, sz);
          if (!b) continue;
          b.owner = r; b.required = false; b.orbit = ring; b.a0 = i / pat.length * TAU;
          g.addBrick(b);
        }
      }
      this.place(g, r);
    },
    place: function (g, r) {
      var p = r.p, t = r.s.t;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.owner !== r || !b.orbit) continue;
        var a = b.a0 + b.orbit.speed * t;
        b.bx = p.cx + Math.cos(a) * b.orbit.radius - b.w / 2;
        b.by = p.cy + Math.sin(a) * b.orbit.radius - b.h / 2;
      }
    },
    update: function (g, r, dt) {
      r.s.t += dt * g.preset.hazardScale;
      this.place(g, r);
    },
    onBrickDestroyed: function (g, r, b) {
      if (b !== r.s.core) return;
      g.fx.ring(r.p.cx, r.p.cy, 140, '#ffe27a');
      g.fx.shake(C.shake.boss);
      for (var i = 0; i < g.bricks.length; i++) {
        var k = g.bricks[i];
        if (k.alive && k.owner === r) g.destroyBrick(k, 'core');
      }
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var p = r.p;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,226,122,0.10)';
      ctx.lineWidth = 1;
      for (var i = 0; i < p.rings.length; i++) {
        ctx.beginPath(); ctx.arc(p.cx, p.cy, p.rings[i].radius, 0, TAU); ctx.stroke();
      }
      if (r.s.core.alive) {
        var pulse = 0.5 + 0.5 * Math.sin(g.t * 4);
        var grd = ctx.createRadialGradient(p.cx, p.cy, 4, p.cx, p.cy, 40);
        grd.addColorStop(0, 'rgba(255,226,122,' + (0.35 + 0.2 * pulse).toFixed(3) + ')');
        grd.addColorStop(1, 'rgba(255,226,122,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 40, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  });

  // ---------------- Pendulum: brick clusters swing on chains ----------------
  // params: pendulums [{ x, y (pivot), len, amp (deg), period, phase, cluster [strings] }]
  register('pendulum', {
    init: function (g, r) {
      var gr = C.grid;
      r.s.t = 0;
      r.s.list = [];
      for (var pi = 0; pi < r.p.pendulums.length; pi++) {
        var pd = r.p.pendulums[pi], cl = pd.cluster;
        var cols = cl[0].length, wpx = cols * gr.cellW;
        var item = { pd: pd, bricks: [], bobX: pd.x, bobY: pd.y + pd.len };
        for (var row = 0; row < cl.length; row++) {
          for (var col = 0; col < cl[row].length; col++) {
            var b = BT.Bricks.fromChar(cl[row][col], 0, 0, gr.brickW, gr.brickH);
            if (!b) continue;
            b.owner = r;
            b.relX = -wpx / 2 + col * gr.cellW + 1;
            b.relY = row * gr.cellH + 1;
            g.addBrick(b);
            item.bricks.push(b);
          }
        }
        r.s.list.push(item);
      }
      this.place(g, r);
    },
    place: function (g, r) {
      for (var i = 0; i < r.s.list.length; i++) {
        var it = r.s.list[i], pd = it.pd;
        var a = pd.amp * P.DEG * Math.sin(TAU * r.s.t / pd.period + (pd.phase || 0));
        it.bobX = pd.x + Math.sin(a) * pd.len;
        it.bobY = pd.y + Math.cos(a) * pd.len;
        for (var k = 0; k < it.bricks.length; k++) {
          var b = it.bricks[k];
          b.bx = it.bobX + b.relX; b.by = it.bobY + b.relY;
        }
      }
    },
    update: function (g, r, dt) {
      r.s.t += dt * Math.sqrt(g.preset.hazardScale);
      this.place(g, r);
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      ctx.save();
      for (var i = 0; i < r.s.list.length; i++) {
        var it = r.s.list[i], pd = it.pd, any = false;
        for (var k = 0; k < it.bricks.length; k++) if (it.bricks[k].alive) { any = true; break; }
        ctx.fillStyle = '#8a93a8';
        ctx.beginPath(); ctx.arc(pd.x, pd.y, 4, 0, TAU); ctx.fill();
        if (!any) continue;
        // chain: dotted links
        ctx.strokeStyle = 'rgba(190,200,220,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(pd.x, pd.y); ctx.lineTo(it.bobX, it.bobY); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  });

  // ---------------- Portals: paired; in one, out of its twin ----------------
  // params: pairs [[{x,y},{x,y}], ...]
  var PORTAL_COLORS = ['#ff9f43', '#4fd8ff', '#c56bff'];
  register('portals', {
    init: function (g, r) { r.s.t = 0; r.s.flash = [0, 0, 0, 0, 0, 0]; },
    update: function (g, r, dt) {
      r.s.t += dt;
      for (var i = 0; i < r.s.flash.length; i++) if (r.s.flash[i] > 0) r.s.flash[i] -= dt;
    },
    onBallStep: function (g, r, ball) {
      var pairs = r.p.pairs, rad = r.p.radius, cap = rad * r.p.captureFrac;
      for (var pi = 0; pi < pairs.length; pi++) {
        for (var e = 0; e < 2; e++) {
          var id = pi * 2 + e, A = pairs[pi][e], B = pairs[pi][1 - e];
          if (ball.portalLock === id) {
            var dx = ball.x - A.x, dy = ball.y - A.y;
            if (dx * dx + dy * dy > (rad + ball.r) * (rad + ball.r)) ball.portalLock = -1;
            continue;
          }
          if (distToSegment(A.x, A.y, ball.prevX, ball.prevY, ball.x, ball.y) < cap) {
            ball.x = B.x; ball.y = B.y; ball.prevX = B.x; ball.prevY = B.y;
            ball.portalLock = pi * 2 + (1 - e);
            ball.trailN = 0;
            r.s.flash[id] = 0.25; r.s.flash[pi * 2 + 1 - e] = 0.25;
            g.fx.sound('portal');
            g.fx.burst(A.x, A.y, PORTAL_COLORS[pi % 3], 8, 'spark');
            g.fx.burst(B.x, B.y, PORTAL_COLORS[pi % 3], 8, 'spark');
            return;
          }
        }
      }
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var pairs = r.p.pairs, rad = r.p.radius, t = r.s.t;
      ctx.save();
      for (var pi = 0; pi < pairs.length; pi++) {
        var col = PORTAL_COLORS[pi % 3];
        for (var e = 0; e < 2; e++) {
          var A = pairs[pi][e], fl = r.s.flash[pi * 2 + e] > 0 ? 1 : 0;
          ctx.fillStyle = 'rgba(5,6,18,0.9)';
          ctx.beginPath(); ctx.arc(A.x, A.y, rad, 0, TAU); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 3 + fl * 2;
          ctx.beginPath(); ctx.arc(A.x, A.y, rad, 0, TAU); ctx.stroke();
          ctx.lineWidth = 2;
          for (var k = 0; k < 3; k++) {
            var a0 = t * (e ? -3 : 3) + k * TAU / 3;
            ctx.beginPath(); ctx.arc(A.x, A.y, rad * 0.6, a0, a0 + 1.2); ctx.stroke();
          }
          // pair marker: same number of dots on both twins so they read without colour too
          ctx.fillStyle = col;
          for (var d = 0; d <= pi; d++) {
            ctx.beginPath(); ctx.arc(A.x - pi * 4 + d * 8, A.y + rad + 6, 2.2, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  });

  // ---------------- Gravity wells: planets bend the ball ----------------
  // params: planets [{ x, y, mass }]
  register('wells', {
    init: function (g, r) { r.s.t = 0; },
    update: function (g, r, dt) { r.s.t += dt; },
    accel: function (g, r, x, y, out) {
      var pl = r.p.planets, k = r.p.accelAt60 * 3600 * g.preset.forceScale, md2 = r.p.minDist * r.p.minDist;
      out.ax = 0; out.ay = 0;
      for (var i = 0; i < pl.length; i++) {
        var dx = pl[i].x - x, dy = pl[i].y - y;
        var d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
        if (d < 1e-3) continue;
        var a = k * (pl[i].mass || 1) / Math.max(d2, md2);
        out.ax += a * dx / d; out.ay += a * dy / d;
      }
    },
    onBallStep: function (g, r, ball, dt) {
      if (g.state !== 'play' && g.state !== 'clearing') return;
      this.accel(g, r, ball.x, ball.y, ACC);
      ball.vx += ACC.ax * dt; ball.vy += ACC.ay * dt;
      var pl = r.p.planets, pr = r.p.planetRadius;
      for (var i = 0; i < pl.length; i++) {
        if (P.circleCircle(ball.x, ball.y, ball.r, pl[i].x, pl[i].y, pr) > 0) {
          ball.x += HIT.nx * HIT.depth; ball.y += HIT.ny * HIT.depth;
          if (P.reflect(ball, HIT.nx, HIT.ny)) g.fx.sound('bumper', 0);
        }
      }
    },
    render: function (ctx, g, r, layer, R) {
      var pl = r.p.planets, pr = r.p.planetRadius, i;
      if (layer === 'back') {
        ctx.save();
        for (i = 0; i < pl.length; i++) {
          var x = pl[i].x, y = pl[i].y;
          for (var k = 0; k < 3; k++) { // gravity ripples flowing inward
            var ph = ((g.t * 0.6 + k / 3) % 1);
            var rr = pr + 70 * (1 - ph);
            ctx.strokeStyle = 'rgba(140,170,255,' + (0.18 * ph).toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
          }
          var grd = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, pr);
          grd.addColorStop(0, '#d9c7ff'); grd.addColorStop(1, '#6b4fd8');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(220,200,255,0.8)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(x, y, pr * 1.7, pr * 0.5, -0.4, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // front: predicted path for the first second after launch
      var p = r.p;
      for (i = 0; i < g.balls.length; i++) {
        var b = g.balls[i];
        if (b.stuck || g.sinceLaunch > p.predictSeconds || g.state !== 'play') continue;
        var alpha = 1 - g.sinceLaunch / p.predictSeconds;
        this.drawPrediction(ctx, g, r, b, alpha * 0.7);
      }
    },
    drawPrediction: function (ctx, g, r, b, alpha) {
      var x = b.x, y = b.y, vx = b.vx, vy = b.vy, sp = Math.sqrt(vx * vx + vy * vy);
      var dt = 1 / 60, pl = r.p.planets, pr = r.p.planetRadius;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      for (var st = 0; st < 75; st++) {
        this.accel(g, r, x, y, ACC);
        vx += ACC.ax * dt; vy += ACC.ay * dt;
        var s = Math.sqrt(vx * vx + vy * vy); vx = vx / s * sp; vy = vy / s * sp;
        x += vx * dt; y += vy * dt;
        if (x < b.r) { x = b.r; vx = -vx; }
        if (x > C.W - b.r) { x = C.W - b.r; vx = -vx; }
        if (y < C.TOP + b.r) { y = C.TOP + b.r; vy = -vy; }
        var stop = false;
        for (var i = 0; i < pl.length; i++) {
          var dx = x - pl[i].x, dy = y - pl[i].y;
          if (dx * dx + dy * dy < (pr + b.r) * (pr + b.r)) stop = true;
        }
        for (var j = 0; j < g.bricks.length && !stop; j++) {
          var k = g.bricks[j];
          if (k.alive && x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h) stop = true;
        }
        if (stop || y > C.H) break;
        if (st % 3 === 0) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  });
  var ACC = { ax: 0, ay: 0 };

  // ---------------- Gusts: telegraphed sideways wind ----------------
  register('gusts', {
    init: function (g, r) {
      r.s.phase = 'calm'; r.s.timer = r.p.firstDelay; r.s.dir = 1; r.s.t = 0; r.s.k = 0;
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p;
      s.t += dt;
      if (g.state !== 'play') { if (s.phase !== 'calm') { s.phase = 'calm'; s.timer = p.firstDelay; } }
      else {
        s.timer -= dt;
        if (s.timer <= 0) {
          if (s.phase === 'calm') {
            s.phase = 'warn'; s.timer = p.warn;
            s.k++;
            s.dir = (s.k % 2 === 1) ? 1 : -1;
            if (g.rng() < 0.3) s.dir = -s.dir;
            g.fx.sound('windwarn');
          } else if (s.phase === 'warn') {
            s.phase = 'gust'; s.timer = p.gust; g.fx.sound('wind');
          } else {
            s.phase = 'calm'; s.timer = p.calmMin + g.rng() * (p.calmMax - p.calmMin);
          }
        }
      }
      var cv = s.phase === 'gust' ? s.dir * 45 : 0;
      for (var i = 0; i < g.capsules.length; i++) g.capsules[i].vx = cv;
    },
    onBallStep: function (g, r, ball, dt) {
      if (r.s.phase !== 'gust') return;
      ball.vx += r.s.dir * r.p.accel * g.preset.forceScale * dt;
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'front') return;
      var s = r.s;
      if (s.phase === 'calm') return;
      var warn = s.phase === 'warn';
      var a = warn ? 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(s.t * 18)) : 0.38;
      var speed = warn ? 160 : 520, n = warn ? 14 : 28;
      ctx.save();
      ctx.strokeStyle = 'rgba(200,235,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = warn ? 1.5 : 2;
      ctx.lineCap = 'round';
      var span = C.W + 120, h = C.H - C.TOP - 80;
      for (var i = 0; i < n; i++) {
        var y = C.TOP + 10 + ((i * 97.13) % h);
        var len = 20 + (i * 37) % 36;
        var x = ((i * 53.7 + s.t * speed) % span);
        x = s.dir > 0 ? x - 60 : C.W + 60 - x;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.dir * len, y); ctx.stroke();
      }
      // big arrows on the side the wind blows towards
      ctx.fillStyle = 'rgba(200,235,255,' + (warn ? 0.5 + 0.4 * Math.sin(s.t * 18) : 0.7).toFixed(3) + ')';
      var ax = s.dir > 0 ? C.W - 22 : 22;
      for (var k = 0; k < 3; k++) {
        var ay = 200 + k * 120;
        ctx.beginPath();
        ctx.moveTo(ax + s.dir * 12, ay); ctx.lineTo(ax - s.dir * 6, ay - 12); ctx.lineTo(ax - s.dir * 6, ay + 12);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  });

  // ---------------- Pinball: bumpers and one-way gates ----------------
  // params: bumpers [{x,y}], gates [{x1,x2,y}] (gates let the ball through upward only)
  register('pinball', {
    init: function (g, r) {
      r.s.bf = new Float32Array(r.p.bumpers.length);
      r.s.gf = new Float32Array((r.p.gates || []).length);
    },
    update: function (g, r, dt) {
      var i;
      for (i = 0; i < r.s.bf.length; i++) if (r.s.bf[i] > 0) r.s.bf[i] -= dt;
      for (i = 0; i < r.s.gf.length; i++) if (r.s.gf[i] > 0) r.s.gf[i] -= dt;
    },
    onBallStep: function (g, r, ball) {
      var bm = r.p.bumpers, R = r.p.bumperRadius, i;
      for (i = 0; i < bm.length; i++) {
        if (P.circleCircle(ball.x, ball.y, ball.r, bm[i].x, bm[i].y, R) > 0) {
          ball.x += HIT.nx * HIT.depth; ball.y += HIT.ny * HIT.depth;
          P.reflect(ball, HIT.nx, HIT.ny);
          ball.boost = r.p.boost;
          r.s.bf[i] = 0.18;
          g.score += C.score.bumper;
          g.fx.sound('bumper', 1);
          g.fx.burst(bm[i].x + HIT.nx * R, bm[i].y + HIT.ny * R, '#ff6bcb', 6, 'spark');
        }
      }
      var gt = r.p.gates || [];
      for (i = 0; i < gt.length; i++) {
        var q = gt[i];
        if (ball.vy > 0 && ball.prevY + ball.r <= q.y + 0.5 && ball.y + ball.r >= q.y && ball.x >= q.x1 && ball.x <= q.x2) {
          ball.y = q.y - ball.r; ball.vy = -Math.abs(ball.vy);
          r.s.gf[i] = 0.2;
          g.fx.sound('gate');
        }
      }
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var bm = r.p.bumpers, R = r.p.bumperRadius, i;
      ctx.save();
      for (i = 0; i < bm.length; i++) {
        var f = r.s.bf[i] > 0 ? 1 : 0, rr = R + f * 3;
        ctx.fillStyle = f ? '#ffd1f0' : '#ff6bcb';
        ctx.beginPath(); ctx.arc(bm[i].x, bm[i].y, rr, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a1240';
        ctx.beginPath(); ctx.arc(bm[i].x, bm[i].y, rr * 0.55, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffe0f6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bm[i].x, bm[i].y, rr, 0, TAU); ctx.stroke();
      }
      var gt = r.p.gates || [];
      for (i = 0; i < gt.length; i++) {
        var q = gt[i], fl = r.s.gf[i] > 0;
        ctx.strokeStyle = fl ? '#ffffff' : '#45f0a0';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(q.x1, q.y); ctx.lineTo(q.x2, q.y); ctx.stroke();
        // upward arrows: "this way only"
        ctx.fillStyle = 'rgba(69,240,160,0.75)';
        for (var x = q.x1 + 15; x < q.x2 - 5; x += 30) {
          var bob = Math.sin(g.t * 5 + x) * 1.5;
          ctx.beginPath();
          ctx.moveTo(x, q.y - 14 + bob); ctx.lineTo(x - 6, q.y - 5 + bob); ctx.lineTo(x + 6, q.y - 5 + bob);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
  });

  // ======================================================================================
  // World 4 - Lights and switches
  // ======================================================================================

  // ---------------- Lights Out: dark, lit around ball and paddle; glow bricks leave lanterns ----------------
  // Darkness is drawn in the renderOverBricks hook: over the bricks but under capsules, paddle and balls,
  // so those are always fully visible. Every standing brick keeps a faint outline so you can tell where they are.
  var MAX_LIGHTS = 48;
  register('lightsout', {
    init: function (g, r) {
      var s = r.s;
      s.pool = [];
      for (var i = 0; i < 20; i++) s.pool.push({ on: false, x: 0, y: 0, rad: 0, t: 0, max: 0 });
      s.list = new Float32Array(MAX_LIGHTS * 4); // x, y, radius, strength
      s.n = 0;
    },
    addLight: function (r, x, y, rad, time) {
      var pool = r.s.pool, pick = pool[0];
      for (var i = 0; i < pool.length; i++) {
        if (!pool[i].on) { pick = pool[i]; break; }
        if (pool[i].t < pick.t) pick = pool[i];
      }
      pick.on = true; pick.x = x; pick.y = y; pick.rad = rad; pick.t = time; pick.max = time;
    },
    update: function (g, r, dt) {
      var pool = r.s.pool;
      for (var i = 0; i < pool.length; i++) {
        var L = pool[i];
        if (L.on) { L.t -= dt; if (L.t <= 0) L.on = false; }
      }
    },
    onBrickDestroyed: function (g, r, b) {
      var p = r.p, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.type === 'glow') {
        this.addLight(r, cx, cy, p.lanternLight, p.lanternTime);
        g.fx.sound('lantern');
        g.fx.burst(cx, cy, '#ffe27a', 14, 'spark');
      } else this.addLight(r, cx, cy, p.flashLight, p.flashTime);
    },
    // Pure: fills r.s.list with every light this frame and returns the count (used by render and tests).
    collectLights: function (g, r) {
      var s = r.s, p = r.p, out = s.list, n = 0, i;
      var m = g.presetName === 'easy' ? p.easyLightMult : 1;
      function add(x, y, rad, a) {
        if (n >= MAX_LIGHTS) return;
        out[n * 4] = x; out[n * 4 + 1] = y; out[n * 4 + 2] = rad; out[n * 4 + 3] = a; n++;
      }
      for (i = 0; i < g.balls.length; i++) add(g.balls[i].x, g.balls[i].y, p.ballLight * m, 1);
      var pd = g.paddle;
      add(pd.x, pd.y - 6, (pd.w / 2 + p.paddleLight * 0.55) * m, 1);
      for (i = 0; i < g.xpaddles.length; i++) add(g.xpaddles[i].x, g.xpaddles[i].y, (g.xpaddles[i].w / 2 + 30) * m, 1);
      for (i = 0; i < g.capsules.length; i++) if (g.capsules[i].alive) add(g.capsules[i].x, g.capsules[i].y, p.capsuleLight * m, 1);
      for (i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.alive && b.type === 'glow') add(b.x + b.w / 2, b.y + b.h / 2, p.glowLight * m, 0.8);
      }
      for (i = 0; i < s.pool.length; i++) {
        var L = s.pool[i];
        if (!L.on) continue;
        var f = L.max > 1 ? Math.min(1, L.t / 1.5) : L.t / L.max; // lanterns fade over their last 1.5 s
        add(L.x, L.y, L.rad * m * (0.75 + 0.25 * f), f);
      }
      s.n = n;
      return n;
    },
    renderOverBricks: function (ctx, g, r, R) {
      var p = r.p, n = this.collectLights(g, r), out = r.s.list, i;
      var dark = g.presetName === 'easy' ? p.darkEasy : p.dark;
      var lay = R.layer('dark'), x = lay.ctx, spr = R.lightSprite();
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.clearRect(0, 0, C.W, C.H);
      x.fillStyle = 'rgba(2,3,9,' + dark + ')';
      x.fillRect(0, C.TOP, C.W, C.H - C.TOP);
      x.globalCompositeOperation = 'destination-out';
      for (i = 0; i < n; i++) {
        var rad = out[i * 4 + 2];
        x.globalAlpha = out[i * 4 + 3];
        x.drawImage(spr, out[i * 4] - rad, out[i * 4 + 1] - rad, rad * 2, rad * 2);
      }
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      ctx.drawImage(lay.canvas, 0, 0, C.W, C.H);
      // faint outline of every standing brick, and glow bricks shine through the dark
      ctx.save();
      var outline = 'rgba(190,205,255,' + p.outline + ')';
      for (i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.alive || b.customDraw) continue;
        if (b.type === 'glow') {
          var pu = 0.6 + 0.4 * Math.sin(g.t * 3 + b.x);
          ctx.globalAlpha = 0.55 + 0.35 * pu;
          R.drawBrick(ctx, b, g.t);
          ctx.globalAlpha = 1;
          continue;
        }
        ctx.lineWidth = 1; ctx.strokeStyle = outline;
        R.roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 3); ctx.stroke();
      }
      ctx.restore();
    }
  });

  // ---------------- Red / Blue: hit a switch to swap which colour is solid ----------------
  // params: start ('red' | 'blue'). Bricks with b.group (grid chars R and B) take part.
  register('redblue', {
    init: function (g, r) {
      var s = r.s;
      s.solid = r.p.start || 'red'; s.cd = 0; s.flash = 0;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.group) continue;
        g.makeGhostable(b);
        if (b.group !== s.solid) { b.solid = false; b.ghost = 1; }
      }
    },
    update: function (g, r, dt) {
      var s = r.s, solidLeft = 0, ghostLeft = 0;
      if (s.cd > 0) s.cd -= dt;
      if (s.flash > 0) s.flash -= dt;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.alive) continue;
        if (b.group && b.group !== s.solid) { b.wantGhost = true; if (b.required) ghostLeft++; }
        else if (b.required && b.breakable) solidLeft++;
        if (b.type === 'switch') b.showing = s.solid;
      }
      // nothing solid left to aim at: swap by themselves after a moment so nobody gets stuck
      if (ghostLeft && !solidLeft && g.state === 'play') {
        s.idle = (s.idle || 0) + dt;
        if (s.idle > r.p.autoSwap) this.swap(g, r, C.W / 2, 150);
      } else s.idle = 0;
    },
    swap: function (g, r, x, y) {
      var s = r.s;
      s.cd = r.p.swapCooldown; s.idle = 0;
      s.solid = s.solid === 'red' ? 'blue' : 'red';
      s.flash = 0.35;
      g.fx.sound('swap');
      g.fx.text(x, y, s.solid === 'red' ? 'Red is solid!' : 'Blue is solid!', s.solid === 'red' ? '#ff8a94' : '#8ab8ff');
    },
    onBrickHit: function (g, r, b) {
      if (b.type !== 'switch') return false;
      b.flash = 0.2;
      if (r.s.cd <= 0) {
        this.swap(g, r, b.x + b.w / 2, b.y - 8);
        g.fx.burst(b.x + b.w / 2, b.y + b.h / 2, '#ffffff', 8, 'spark');
      } else g.fx.sound('gate');
      return true;
    },
    render: function (ctx, g, r, layer, R) {
      if (layer !== 'front') return;
      // legend under the HUD: which colour is solid right now (shape + word, not just colour)
      var s = r.s, red = s.solid === 'red';
      var x = C.W / 2, y = C.TOP + 10;
      ctx.save();
      R.roundRect(ctx, x - 62, y - 8, 124, 16, 8);
      ctx.fillStyle = 'rgba(5,7,16,0.75)'; ctx.fill();
      if (s.flash > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + (s.flash * 2).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = red ? BT.Bricks.RED_COLOR : BT.Bricks.BLUE_COLOR;
      if (red) { ctx.beginPath(); ctx.arc(x - 48, y, 4, 0, TAU); ctx.fill(); }
      else ctx.fillRect(x - 52, y - 4, 8, 8);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px ' + R.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText((red ? 'RED' : 'BLUE') + ' is solid', x - 38, y + 0.5);
      ctx.restore();
    }
  });

  // ---------------- On the Beat: bricks fade in and out on a steady pulse ----------------
  // params: pattern ('checker' | 'rows' | 'cols'). Two groups take turns being solid.
  register('beat', {
    init: function (g, r) {
      var s = r.s, pat = r.p.pattern || 'checker';
      s.t = 0; s.active = 0; s.ticks = 0;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.grid || !b.breakable) continue;
        b.beat = pat === 'rows' ? b.row % 2 : (pat === 'cols' ? b.col % 2 : (b.row + b.col) % 2);
        g.makeGhostable(b);
        if (b.beat !== 0) { b.solid = false; b.ghost = 1; }
      }
    },
    period: function (g, r) { return r.p.period / Math.sqrt(g.preset.hazardScale); },
    update: function (g, r, dt) {
      var s = r.s, P2 = this.period(g, r), half = P2 / 2;
      s.t += dt;
      var ph = s.t % P2, active = ph < half ? 0 : 1;
      if (active !== s.active) { s.active = active; s.ticks++; g.fx.sound('beat', active); }
      var toFlip = half - (ph % half);
      s.toFlip = toFlip; s.half = half;
      var warn = toFlip < r.p.warn ? 1 - toFlip / r.p.warn : 0;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.beat == null || !b.alive) continue;
        if (b.beat !== active) { b.wantGhost = true; b.warn = warn; }
        else b.warn = 0;
      }
    },
    render: function (ctx, g, r, layer, R) {
      if (layer !== 'front') return;
      // metronome under the HUD: a dot swings from side to side, ticking on each switch
      var s = r.s, f = 1 - s.toFlip / s.half, x0 = C.W / 2 - 60, x1 = C.W / 2 + 60, y = C.TOP + 10;
      var bx = s.active === 0 ? x0 + (x1 - x0) * f : x1 - (x1 - x0) * f;
      ctx.save();
      R.roundRect(ctx, x0 - 10, y - 7, x1 - x0 + 20, 14, 7);
      ctx.fillStyle = 'rgba(5,7,16,0.7)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x0 - 1, y - 4, 2, 8); ctx.fillRect(x1 - 1, y - 4, 2, 8);
      var near = s.toFlip < r.p.warn;
      ctx.fillStyle = near ? '#ffe27a' : '#ffffff';
      ctx.beginPath(); ctx.arc(bx, y, near ? 5 : 4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  });

  // ---------------- Overgrown: vines regrow from their roots; kill the roots ----------------
  // Grid chars: O root (armoured), V vine. Every few seconds each living root sprouts a new vine next to
  // one of its vines (shown as a growing shoot first). Destroying a root withers all of its vines.
  var NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  register('overgrown', {
    init: function (g, r) {
      var s = r.s, i, b;
      s.timer = r.p.growEvery; s.sprouts = []; s.wither = []; s.witherT = 0; s.roots = [];
      var cells = {};
      for (i = 0; i < g.bricks.length; i++) {
        b = g.bricks[i];
        if (!b.grid) continue;
        cells[b.row * 100 + b.col] = b;
        if (b.type === 'root') { b.root = b; b.grown = 0; s.roots.push(b); }
      }
      // each vine belongs to the root it connects to (breadth-first through touching vines)
      var queue = s.roots.slice();
      while (queue.length) {
        var cur = queue.shift();
        for (var k = 0; k < 4; k++) {
          var nb = cells[(cur.row + NB4[k][0]) * 100 + cur.col + NB4[k][1]];
          if (nb && nb.type === 'vine' && !nb.root) { nb.root = cur.root; nb.parent = cur; queue.push(nb); }
        }
      }
      for (i = 0; i < g.bricks.length; i++) { // stray vines: nearest root
        b = g.bricks[i];
        if (b.type !== 'vine' || b.root) continue;
        var best = null, bd = 1e9;
        for (var j = 0; j < s.roots.length; j++) {
          var d = Math.abs(s.roots[j].row - b.row) + Math.abs(s.roots[j].col - b.col);
          if (d < bd) { bd = d; best = s.roots[j]; }
        }
        b.root = best; b.parent = best;
      }
    },
    cellFree: function (g, row, col) {
      var gr = C.grid, x = col * gr.cellW + 1, y = gr.top + row * gr.cellH + 1;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.alive && b.x < x + gr.brickW && b.x + b.w > x && b.y < y + gr.brickH && b.y + b.h > y) return false;
      }
      return true;
    },
    grow: function (g, r, root) {
      var s = r.s, p = r.p, cand = [], i, k;
      for (i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.alive || b.root !== root) continue;
        for (k = 0; k < 4; k++) {
          var rr = b.row + NB4[k][0], cc = b.col + NB4[k][1];
          if (rr < 0 || rr > p.maxRow || cc < 0 || cc >= C.grid.cols) continue;
          var dup = false;
          for (var q = 0; q < s.sprouts.length; q++) if (s.sprouts[q].row === rr && s.sprouts[q].col === cc) dup = true;
          for (q = 0; q < cand.length && !dup; q++) if (cand[q].row === rr && cand[q].col === cc) dup = true;
          if (!dup && this.cellFree(g, rr, cc)) cand.push({ row: rr, col: cc, parent: b });
        }
      }
      if (!cand.length) return;
      var c = cand[Math.floor(g.rng() * cand.length)];
      s.sprouts.push({ row: c.row, col: c.col, parent: c.parent, root: root, t: p.sproutTime });
      root.grown++;
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, gr = C.grid, i;
      if (g.hazardsActive(1.5)) {
        s.timer -= dt * g.preset.hazardScale;
        if (s.timer <= 0) {
          s.timer = p.growEvery;
          for (i = 0; i < s.roots.length; i++) {
            if (s.roots[i].alive && s.roots[i].grown < p.extraPerRoot) this.grow(g, r, s.roots[i]);
          }
        }
      }
      // shoots become vines, but never on top of a ball (they wait until it has gone)
      var j = 0;
      for (i = 0; i < s.sprouts.length; i++) {
        var sp = s.sprouts[i];
        if (!sp.root.alive) continue;
        sp.t -= dt;
        if (sp.t <= 0) {
          var x = sp.col * gr.cellW + 1, y = gr.top + sp.row * gr.cellH + 1;
          if (!g.ballNear(x, y, gr.brickW, gr.brickH, p.ballMargin) && this.cellFree(g, sp.row, sp.col)) {
            var v = BT.Bricks.fromChar('V', x, y, gr.brickW, gr.brickH);
            v.row = sp.row; v.col = sp.col; v.grid = true; v.root = sp.root; v.parent = sp.parent;
            v.flash = 0.25; v.x = v.bx; v.y = v.by;
            g.addBrick(v);
            g.fx.sound('grow');
            continue;
          }
          sp.t = 0;
        }
        s.sprouts[j++] = sp;
      }
      s.sprouts.length = j;
      // withering
      if (s.wither.length) {
        s.witherT -= dt;
        while (s.witherT <= 0 && s.wither.length) {
          s.witherT += p.witherEvery;
          var k = s.wither.shift();
          if (k.alive) g.destroyBrick(k, 'wither');
        }
      }
    },
    onBrickDestroyed: function (g, r, b) {
      if (b.type !== 'root') return;
      var s = r.s, n = 0;
      for (var i = 0; i < g.bricks.length; i++) {
        var k = g.bricks[i];
        if (k.alive && k.type === 'vine' && k.root === b) { k.withering = true; s.wither.push(k); n++; }
      }
      s.witherT = 0.15;
      g.fx.sound('wither');
      g.fx.text(b.x + b.w / 2, b.y - 6, n ? 'Withered!' : 'Root gone!', '#c9f27a');
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var s = r.s, gr = C.grid, i;
      ctx.save();
      // stems: each vine to the brick it grew from
      ctx.strokeStyle = 'rgba(80,150,70,0.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (!b.alive || b.type !== 'vine' || !b.parent || !b.parent.alive) continue;
        ctx.moveTo(b.x + b.w / 2, b.y + b.h / 2); ctx.lineTo(b.parent.x + b.parent.w / 2, b.parent.y + b.parent.h / 2);
      }
      ctx.stroke();
      // growing shoots: dashed cell outline + a sprout that gets bigger
      for (i = 0; i < s.sprouts.length; i++) {
        var sp = s.sprouts[i];
        if (!sp.root.alive) continue;
        var f = 1 - Math.max(0, sp.t) / r.p.sproutTime;
        var x = sp.col * gr.cellW + 1, y = gr.top + sp.row * gr.cellH + 1, cx = x + gr.brickW / 2, cy = y + gr.brickH / 2;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(120,230,120,' + (0.35 + 0.4 * f).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, gr.brickW - 1, gr.brickH - 1);
        ctx.setLineDash([]);
        ctx.strokeStyle = '#6fe07a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 6 - 10 * f); ctx.stroke();
        ctx.fillStyle = '#6fe07a';
        ctx.beginPath(); ctx.ellipse(cx - 3 * f, cy + 2 - 4 * f, 3 * f + 0.5, 1.6 * f + 0.4, -0.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 3 * f, cy + 1 - 4 * f, 3 * f + 0.5, 1.6 * f + 0.4, 0.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  });

  // ======================================================================================
  // World 5 - Flip the rules
  // ======================================================================================

  // ---------------- Double Trouble: a second paddle at the top copies yours ----------------
  // There is no top wall: a ball that gets past the top paddle is lost. The top paddle is wider than yours
  // and leans a little towards a ball coming up at it, so the game feels bigger rather than twice as hard.
  register('double', {
    init: function (g, r) {
      var s = r.s, p = r.p;
      g.topOpen = true;
      s.xp = g.addXPaddle({ y: C.TOP + p.gap, w: g.paddle.w * p.widthMult, x: g.paddle.x, face: 1, counts: true, owner: r, kind: 'mirror', color: '#ffb347' });
      s.assist = 0; s.topNet = !!g.preset.net; s.netFlash = 0;
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, q = s.xp, pd = g.paddle;
      if (s.netFlash > 0) s.netFlash -= dt;
      q.w = pd.w * p.widthMult;
      // lean towards the ball that will arrive first
      var want = 0, bestT = 1e9, hitY = q.y + q.h / 2;
      for (var i = 0; i < g.balls.length; i++) {
        var b = g.balls[i];
        if (b.stuck || b.vy >= 0 || b.y < hitY || b.y > 380) continue;
        var t = (b.y - hitY) / -b.vy;
        if (t >= bestT) continue;
        bestT = t;
        var lx = g.wrapX ? g.wrapPos(b.x + b.vx * t) : P.predictLandingX(b.x, -b.y, b.vx, -b.vy, -(hitY + b.r), b.r, C.W - b.r);
        var d = g.wrapX ? g.wrapDelta(lx - pd.x) : lx - pd.x;
        want = P.clamp(d, -p.assist, p.assist);
      }
      s.assist += (want - s.assist) * Math.min(1, p.assistRate * dt);
      var nx = pd.x + s.assist, ox = q.x;
      if (g.wrapX) nx = g.wrapPos(nx);
      else nx = P.clamp(nx, q.w / 2, C.W - q.w / 2);
      q.vx = (g.wrapX ? g.wrapDelta(nx - ox) : nx - ox) / dt;
      q.x = nx;
      if (q.squash > 0) q.squash -= dt;
      if (q.hitFlash > 0) q.hitFlash -= dt;
    },
    onBallStep: function (g, r, ball) {
      var s = r.s;
      if (!s.topNet || ball.vy >= 0 || ball.y - ball.r > C.TOP + 3 || g.state === 'clearing') return;
      ball.y = C.TOP + 3 + ball.r; ball.vy = Math.abs(ball.vy);
      s.topNet = false; s.netFlash = 0.6;
      g.fx.sound('net'); g.fx.text(ball.x, C.TOP + 26, 'Saved!', '#7cf5ff');
      g.fx.burst(ball.x, C.TOP + 3, '#7cf5ff', 14, 'spark');
    },
    onLifeLost: function (g, r) { r.s.topNet = !!g.preset.net; },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var s = r.s;
      ctx.save();
      // the open top: a dark band with arrows pointing out, so it reads as a hole like the bottom
      var grd = ctx.createLinearGradient(0, C.TOP, 0, C.TOP + 18);
      grd.addColorStop(0, 'rgba(255,90,100,0.28)'); grd.addColorStop(1, 'rgba(255,90,100,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, C.TOP, C.W, 18);
      ctx.strokeStyle = 'rgba(255,120,130,0.5)'; ctx.lineWidth = 1.5;
      for (var x = 30; x < C.W; x += 60) {
        ctx.beginPath(); ctx.moveTo(x - 5, C.TOP + 9); ctx.lineTo(x, C.TOP + 4); ctx.lineTo(x + 5, C.TOP + 9); ctx.stroke();
      }
      if (s.topNet || s.netFlash > 0) {
        var na = s.topNet ? 0.45 + 0.2 * Math.sin(g.t * 3) : s.netFlash;
        ctx.fillStyle = 'rgba(124,245,255,' + na.toFixed(3) + ')';
        ctx.fillRect(0, C.TOP + 1, C.W, 2);
      }
      ctx.restore();
    }
  });

  // ---------------- Wraparound: no side walls; ball and paddle wrap across the edges ----------------
  register('wrap', {
    init: function (g) { g.wrapX = true; },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      ctx.save();
      // open edges: dashed glowing lines with arrows pointing through to the other side
      ctx.strokeStyle = 'rgba(120,255,220,0.45)'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -g.t * 18;
      ctx.beginPath(); ctx.moveTo(1, C.TOP); ctx.lineTo(1, C.H); ctx.moveTo(C.W - 1, C.TOP); ctx.lineTo(C.W - 1, C.H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120,255,220,0.35)';
      for (var y = 150; y < C.H - 60; y += 130) {
        ctx.beginPath(); ctx.moveTo(4, y - 7); ctx.lineTo(4, y + 7); ctx.lineTo(-4, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(C.W - 4, y - 7); ctx.lineTo(C.W - 4, y + 7); ctx.lineTo(C.W + 4, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(10, y - 6); ctx.lineTo(10, y + 6); ctx.lineTo(4, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(C.W - 10, y - 6); ctx.lineTo(C.W - 10, y + 6); ctx.lineTo(C.W - 4, y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  });

  // ---------------- Brickfall: brick shapes drop from the top and stack ----------------
  // Shapes fall as one piece until any part lands, then every brick settles straight down its column, so the
  // stack never has holes or overhangs that could trap the ball. Nothing moves into a ball (it waits instead).
  // Each piece is shown at the top, with a shadow down its columns, before it drops.
  var SHAPES = {
    I: [[0, 0], [0, 1], [0, 2], [0, 3]], O: [[0, 0], [0, 1], [1, 0], [1, 1]], T: [[0, 0], [0, 1], [0, 2], [1, 1]],
    L: [[0, 0], [1, 0], [2, 0], [2, 1]], J: [[0, 1], [1, 1], [2, 1], [2, 0]], S: [[0, 1], [0, 2], [1, 0], [1, 1]],
    Z: [[0, 0], [0, 1], [1, 1], [1, 2]]
  };
  var SHAPE_KEYS = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];
  var SHAPE_COLORS = { I: '#4fd8ff', O: '#ffd35a', T: '#a46bff', L: '#ff9f43', J: '#5b8cff', S: '#2ee0a4', Z: '#ff5a64' };
  register('brickfall', {
    init: function (g, r) {
      var s = r.s, p = r.p, gr = C.grid;
      s.floorY = gr.top + p.floorRow * gr.cellH;
      s.overY = gr.top + p.overflowRow * gr.cellH;
      s.left = p.pieces; s.timer = p.grace + p.telegraph; s.pieces = []; s.next = null; s.danger = 0;
      s.cols = []; for (var c = 0; c < gr.cols; c++) s.cols.push([]);
      for (var i = 0; i < g.bricks.length; i++) { // the starting stack comes from the level grid
        var b = g.bricks[i];
        if (!b.grid || !b.breakable) continue;
        this.adopt(r, b, b.col, gr.top + b.row * gr.cellH, null);
      }
      this.pickNext(g, r);
    },
    adopt: function (r, b, col, sy, piece) {
      b.owner = r; b.fc = col; b.sy = sy; b.piece = piece; b.bf = true;
      b.bx = col * C.grid.cellW + 1; b.by = sy + 1;
    },
    pickNext: function (g, r) {
      var key = SHAPE_KEYS[Math.floor(g.rng() * SHAPE_KEYS.length)], rot = Math.floor(g.rng() * 4);
      var cells = SHAPES[key].map(function (q) { return [q[0], q[1]]; });
      for (var k = 0; k < rot; k++) cells = cells.map(function (q) { return [q[1], -q[0]]; });
      var mr = 1e9, mc = 1e9, Mr = -1e9, Mc = -1e9;
      cells.forEach(function (q) { mr = Math.min(mr, q[0]); mc = Math.min(mc, q[1]); });
      cells = cells.map(function (q) { return [q[0] - mr, q[1] - mc]; });
      cells.forEach(function (q) { Mr = Math.max(Mr, q[0]); Mc = Math.max(Mc, q[1]); });
      // prefer the lowest columns so the stack stays even
      var w = Mc + 1, best = [], bestH = 1e9;
      for (var c0 = 0; c0 + w <= C.grid.cols; c0++) {
        var h = 0;
        for (var c = c0; c < c0 + w; c++) h = Math.max(h, this.colHeight(r, c));
        if (h < bestH - 0.5) { bestH = h; best = [c0]; } else if (Math.abs(h - bestH) <= 0.5 || g.rng() < 0.35) best.push(c0);
      }
      var col = best[Math.floor(g.rng() * best.length)];
      r.s.next = { key: key, cells: cells, rows: Mr + 1, col: col, color: SHAPE_COLORS[key] };
    },
    colHeight: function (r, c) { // stacked bricks in a column
      var n = 0, list = r.s.cols[c];
      for (var i = 0; i < list.length; i++) if (!list[i].piece) n++;
      return n;
    },
    spawn: function (g, r) {
      var s = r.s, nx = s.next, gr = C.grid;
      var piece = { bricks: [], color: nx.color };
      for (var i = 0; i < nx.cells.length; i++) {
        var q = nx.cells[i];
        var b = BT.Bricks.make('normal', 0, 0, gr.brickW, gr.brickH);
        b.color = nx.color;
        this.adopt(r, b, nx.col + q[1], C.TOP - (nx.rows - q[0]) * gr.cellH, piece);
        b.x = b.bx; b.y = b.by;
        g.addBrick(b);
        piece.bricks.push(b);
      }
      s.pieces.push(piece);
      s.left--;
      g.fx.sound('drop');
      if (s.left > 0) this.pickNext(g, r); else s.next = null;
    },
    rebuildCols: function (g, r) {
      var cols = r.s.cols, i;
      for (i = 0; i < cols.length; i++) cols[i].length = 0;
      for (i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.alive && b.bf && b.owner === r) cols[b.fc].push(b);
      }
      for (i = 0; i < cols.length; i++) cols[i].sort(function (a, b) { return b.sy - a.sy; }); // bottom first
    },
    // top of the nearest brick below b in its column that is not part of the same piece (or the floor)
    supportBelow: function (r, b) {
      var list = r.s.cols[b.fc], best = r.s.floorY;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === b || (b.piece && o.piece === b.piece)) continue;
        if (o.sy >= b.sy + 0.01 && o.sy < best) best = o.sy;
      }
      return best;
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, gr = C.grid, ch = gr.cellH, i, j, b;
      var sc = g.preset.hazardScale;
      this.rebuildCols(g, r);
      // spawning (only while the ball is in play)
      if (s.left > 0 && g.hazardsActive(0)) {
        s.timer -= dt * sc;
        if (g.requiredLeft() === 0 && s.timer > p.telegraph) s.timer = p.telegraph; // nothing to hit: hurry up
        if (s.timer <= 0) { this.spawn(g, r); s.timer = p.every; this.rebuildCols(g, r); }
      }
      // falling pieces move as one until any brick lands
      var fall = p.fallSpeed * (0.7 + 0.3 * sc) * dt;
      for (i = 0; i < s.pieces.length; i++) {
        var pc = s.pieces[i], move = fall, any = false;
        for (j = 0; j < pc.bricks.length; j++) {
          b = pc.bricks[j];
          if (!b.alive) continue;
          any = true;
          move = Math.min(move, this.supportBelow(r, b) - (b.sy + ch));
          if (g.ballNear(b.bx, b.by, b.w, b.h + fall + p.ballMargin, 0)) move = Math.min(move, 0); // wait for the ball
        }
        if (!any) { pc.done = true; continue; }
        if (move > 0) for (j = 0; j < pc.bricks.length; j++) { b = pc.bricks[j]; b.sy += move; b.by = b.sy + 1; }
        var landed = false;
        for (j = 0; j < pc.bricks.length && !landed; j++) {
          b = pc.bricks[j];
          if (b.alive && this.supportBelow(r, b) - (b.sy + ch) <= 0.01) landed = true;
        }
        if (landed) {
          pc.done = true;
          for (j = 0; j < pc.bricks.length; j++) pc.bricks[j].piece = null;
          g.fx.sound('land');
        }
      }
      j = 0;
      for (i = 0; i < s.pieces.length; i++) if (!s.pieces[i].done) s.pieces[j++] = s.pieces[i];
      s.pieces.length = j;
      // stacked bricks settle down their column (bottom first) so there are never holes
      this.rebuildCols(g, r);
      var settle = p.settleSpeed * dt, top = s.floorY;
      for (var c = 0; c < s.cols.length; c++) {
        var list = s.cols[c], support = s.floorY;
        for (i = 0; i < list.length; i++) {
          b = list[i];
          if (!b.piece) {
            var rest = support - ch;
            if (b.sy < rest - 0.01) {
              var mv = Math.min(settle, rest - b.sy);
              if (!g.ballNear(b.bx, b.by, b.w, b.h + mv + p.ballMargin, 0)) { b.sy += mv; b.by = b.sy + 1; }
            } else if (b.sy > rest) { b.sy = rest; b.by = b.sy + 1; }
            if (b.sy >= rest - 0.01 && b.sy < top) top = b.sy;
          }
          support = b.sy;
        }
      }
      s.top = top;
      s.danger = Math.max(0, Math.min(1, 1 - (top - s.overY) / (4 * ch)));
      if (top < s.overY - 0.5 && g.state === 'play') {
        g.fx.text(C.W / 2, s.overY + 30, 'Too high!', '#ff8080');
        g.loseLife('crushed');
      }
    },
    holdClear: function (g, r) { return r.s.left > 0; },
    onLifeLost: function (g, r) { // knock the top off the stack
      var s = r.s, lim = s.overY + r.p.clearRowsOnLife * C.grid.cellH;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.alive && b.bf && b.owner === r && !b.piece && b.sy < lim) {
          b.alive = false;
          g.fx.burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 4, 'chip');
        }
      }
      s.timer = Math.max(s.timer, r.p.telegraph + 1);
    },
    render: function (ctx, g, r, layer, R) {
      var s = r.s, p = r.p, gr = C.grid, i;
      if (layer === 'back') {
        ctx.save();
        // glass floor the stack rests on (the ball passes through it)
        ctx.strokeStyle = 'rgba(160,220,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([12, 6]);
        ctx.beginPath(); ctx.moveTo(0, s.floorY + 1); ctx.lineTo(C.W, s.floorY + 1); ctx.stroke();
        // too-high line
        var a = 0.25 + 0.6 * s.danger;
        if (s.danger > 0.6) a *= 0.75 + 0.25 * Math.sin(g.t * 12);
        ctx.strokeStyle = 'rgba(255,80,90,' + a.toFixed(3) + ')'; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -g.t * 20;
        ctx.beginPath(); ctx.moveTo(0, s.overY); ctx.lineTo(C.W, s.overY); ctx.stroke();
        ctx.setLineDash([]);
        // next piece: outline at the top and a shadow down its columns
        var nx = s.next;
        if (nx && s.left > 0) {
          var soon = g.state === 'play' && s.timer < p.telegraph;
          var blink = soon ? 0.55 + 0.45 * Math.sin(g.t * 14) : 0.35;
          for (i = 0; i < nx.cells.length; i++) {
            var q = nx.cells[i], x = (nx.col + q[1]) * gr.cellW + 1;
            if (soon) {
              ctx.fillStyle = 'rgba(255,255,255,0.05)';
              ctx.fillRect(x, C.TOP, gr.brickW, s.floorY - C.TOP);
            }
            ctx.globalAlpha = blink;
            R.roundRect(ctx, x, C.TOP + 3 + q[0] * 8, gr.brickW, 7, 2);
            ctx.fillStyle = nx.color; ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
        return;
      }
      // front: pieces left
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 11px ' + R.FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(s.left > 0 ? s.left + (s.left === 1 ? ' piece to come' : ' pieces to come') : 'Last one!', C.W - 6, s.floorY + 12);
      ctx.restore();
    }
  });

  // ---------------- Twelve Bounces: a puzzle with a fixed number of paddle bounces ----------------
  // Running out (or missing the ball) restarts the puzzle at once without costing a life.
  register('bounces', {
    init: function (g, r) { r.s.left = r.p.count; r.s.fail = 0; r.s.pop = 0; },
    onPaddleHit: function (g, r, ball, xp) {
      if (xp) return;
      var s = r.s;
      s.left = Math.max(0, s.left - 1); s.pop = 0.25;
      if (s.left === 0) {
        g.paddle.off = true;
        g.fx.text(g.paddle.x, g.paddle.y - 24, 'Last bounce!', '#ffd35a');
      }
    },
    beforeLifeLost: function (g, r, reason) {
      var s = r.s;
      if (s.fail <= 0) {
        s.fail = r.p.failDelay;
        g.fx.sound('lose');
        g.fx.text(C.W / 2, 470, s.left === 0 ? 'Out of bounces!' : 'Missed!', '#ffb0b0');
      }
      return true; // no life lost: the puzzle restarts
    },
    update: function (g, r, dt) {
      var s = r.s;
      if (s.pop > 0) s.pop -= dt;
      if (s.fail <= 0 || g.state !== 'play') return;
      if (g.blasts.length) return; // let a chain reaction finish: it might still clear the level
      s.fail -= dt;
      if (s.fail <= 0) {
        g.retry();
        g.fx.sound('retry');
        g.fx.text(C.W / 2, 470, 'Try again!', '#ffffff');
      }
    },
    render: function (ctx, g, r, layer, R) {
      if (layer !== 'back') return;
      var s = r.s, low = s.left <= 3;
      var y = 478, sc = 1 + (s.pop > 0 ? s.pop * 1.2 : 0);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var a = low ? 0.75 + 0.25 * Math.sin(g.t * 8) : 0.7;
      ctx.fillStyle = low ? 'rgba(255,110,120,' + a.toFixed(3) + ')' : 'rgba(255,255,255,' + a + ')';
      ctx.font = '900 ' + Math.round(58 * sc) + 'px ' + R.FONT;
      ctx.fillText(String(s.left), C.W / 2, y);
      ctx.font = 'bold 11px ' + R.FONT; ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(s.left === 1 ? 'BOUNCE LEFT' : 'BOUNCES LEFT', C.W / 2, y + 38);
      // one pip per bounce, used ones hollow
      var n = r.p.count, w = 12;
      for (var i = 0; i < n; i++) {
        var x = C.W / 2 - (n - 1) * w / 2 + i * w;
        ctx.beginPath(); ctx.arc(x, y + 54, 3.6, 0, TAU);
        if (i < s.left) { ctx.fillStyle = low ? '#ff6e78' : '#ffd35a'; ctx.fill(); }
        else { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
      if (g.attempts > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '11px ' + R.FONT;
        ctx.fillText('Try ' + (g.attempts + 1), C.W / 2, y - 40);
      }
      ctx.restore();
    }
  });

  BT.Rules = { registry: registry, register: register, distToSegment: distToSegment, TAU: TAU };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
