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
//   onPaddleHit(g, r, ball)
//   onLaser(g, r, bolt)              return true to absorb a laser bolt.
//   onLifeLost(g, r, reason)
//   render(ctx, g, r, layer, R)      layer is 'back' (under bricks) or 'front' (over balls).
//                                    R is the renderer's helper set.
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

  BT.Rules = { registry: registry, register: register, distToSegment: distToSegment, TAU: TAU };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
