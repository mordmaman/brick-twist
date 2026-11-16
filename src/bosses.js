// Boss modules. Same hook interface as rules (see rules.js) plus boss: true and state
// fields s.hp, s.maxHp, s.defeated, which the HUD and the 'boss' clear condition read. No DOM.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, P = BT.Physics, HIT = BT.Physics.HIT, TAU = Math.PI * 2;
  var register = BT.Rules.register;

  function shatterOwned(g, r) {
    for (var i = 0; i < g.bricks.length; i++) {
      var k = g.bricks[i];
      if (k.alive && k.owner === r) g.destroyBrick(k, 'boss');
    }
  }

  function bossDefeated(g, r, x, y) {
    r.s.defeated = true;
    r.s.hp = 0;
    g.score += 1000;
    g.fx.sound('bossdown');
    g.fx.shake(C.shake.boss * 1.5);
    g.shakeAmt = C.shake.boss * 1.5;
    g.fx.ring(x, y, 180, '#ffffff');
    g.fx.burst(x, y, '#ffffff', 30, 'spark');
  }

  // ======================= The Gatekeeper =======================
  // A face of bricks that sways and spits blocks down; destroy both eyes.
  var FACE = [
    '22222222',
    'pEppppEp',
    'pppppppp',
    'pp#MM#pp',
    '.pppppp.'
  ];
  register('gatekeeper', {
    boss: true, bossName: 'The Gatekeeper',
    init: function (g, r) {
      var s = r.s, p = r.p, gr = C.grid;
      var face = p.face || FACE;
      var cols = face[0].length;
      s.baseX = (C.W - cols * gr.cellW) / 2;
      s.y0 = gr.top + 10;
      s.phase = 0; s.t = 0;
      s.eyes = [];
      s.spitT = p.spitEvery; s.tell = 0;
      s.spits = [];
      for (var i = 0; i < 6; i++) s.spits.push({ x: 0, y: 0, alive: false });
      var eyeHp = Math.max(1, Math.round(p.eyeHp * g.preset.bossHpScale));
      for (var row = 0; row < face.length; row++) {
        for (var col = 0; col < cols; col++) {
          var ch = face[row][col], b;
          if (ch === 'E') {
            b = BT.Bricks.make('eye', 0, 0, gr.brickW, gr.brickH);
            b.hp = b.maxHp = eyeHp; b.color = '#ffffff'; b.blastDamage = true; b.customDraw = true;
            s.eyes.push(b);
          } else if (ch === 'M') {
            b = BT.Bricks.make('mouth', 0, 0, gr.brickW, gr.brickH);
            b.breakable = false; b.noBlast = true; b.color = '#2a0f1f'; b.customDraw = true;
          } else {
            b = BT.Bricks.fromChar(ch === 'p' ? 'p' : ch, 0, 0, gr.brickW, gr.brickH);
            if (!b) continue;
            if (ch === 'p') b.color = '#7f5bd6';
          }
          b.owner = r; b.required = false;
          b.relX = col * gr.cellW + 1; b.relY = row * gr.cellH + 1;
          g.addBrick(b);
        }
      }
      s.mouthRelX = cols * gr.cellW / 2; s.mouthRelY = 4 * gr.cellH;
      s.maxHp = eyeHp * s.eyes.length;
      s.hp = s.maxHp;
      s.defeated = false;
      this.place(g, r);
    },
    eyesLeft: function (r) {
      var n = 0;
      for (var i = 0; i < r.s.eyes.length; i++) if (r.s.eyes[i].alive) n++;
      return n;
    },
    place: function (g, r) {
      var s = r.s;
      s.offX = Math.sin(s.phase) * r.p.sway;
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.owner !== r) continue;
        b.bx = s.baseX + b.relX + s.offX; b.by = s.y0 + b.relY;
      }
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p;
      s.t += dt;
      if (s.defeated) return;
      var lost = s.eyes.length - this.eyesLeft(r);
      s.phase += dt * TAU / p.period * (1 + 0.6 * lost) * (0.6 + 0.4 * g.preset.hazardScale);
      this.place(g, r);
      var hp = 0;
      for (var i = 0; i < s.eyes.length; i++) if (s.eyes[i].alive) hp += s.eyes[i].hp;
      s.hp = hp;

      // spitting
      if (g.hazardsActive(1.5)) {
        s.spitT -= dt * g.preset.hazardScale;
        s.tell = s.spitT < p.spitTell ? 1 : 0;
        if (s.spitT <= 0) {
          s.spitT = p.spitEvery * (lost ? 0.8 : 1);
          for (i = 0; i < s.spits.length; i++) {
            var sp = s.spits[i];
            if (sp.alive) continue;
            sp.alive = true; sp.x = s.baseX + s.mouthRelX + s.offX; sp.y = s.y0 + s.mouthRelY + 6;
            g.fx.sound('spit');
            break;
          }
        }
      } else s.tell = 0;
      var pd = g.paddle;
      for (i = 0; i < s.spits.length; i++) {
        var q = s.spits[i];
        if (!q.alive) continue;
        q.y += p.spitSpeed * dt;
        if (q.y > C.H + 10) { q.alive = false; continue; }
        if (Math.abs(q.x - pd.x) < pd.w / 2 + 8 && Math.abs(q.y - pd.y) < pd.h / 2 + 6) {
          q.alive = false;
          g.eff.daze = p.dazeSeconds;
          g.fx.sound('daze');
          g.fx.text(pd.x, pd.y - 22, 'Ouch!', '#ff8080');
          g.fx.burst(q.x, q.y, '#ff5a64', 10, 'chip');
        }
      }
    },
    onBallStep: function (g, r, ball) {
      var sp = r.s.spits;
      for (var i = 0; i < sp.length; i++) {
        var q = sp[i];
        if (!q.alive) continue;
        if (Math.abs(ball.x - q.x) < 8 + ball.r && Math.abs(ball.y - q.y) < 6 + ball.r) {
          q.alive = false;
          g.score += 20;
          g.fx.sound('break', g.combo);
          g.fx.burst(q.x, q.y, '#ff5a64', 8, 'chip');
        }
      }
    },
    onLaser: function (g, r, L) {
      var sp = r.s.spits;
      for (var i = 0; i < sp.length; i++) {
        var q = sp[i];
        if (q.alive && Math.abs(L.x - q.x) < 9 && Math.abs(L.y - q.y) < 10) {
          q.alive = false; g.score += 20; g.fx.burst(q.x, q.y, '#ff5a64', 8, 'chip');
          return true;
        }
      }
      return false;
    },
    onBrickHit: function (g, r, b) {
      if (b.owner === r && b.type === 'eye') {
        g.fx.sound('bosshit');
        g.fx.shake(2);
        g.score += C.score.bossHit;
      }
      return false;
    },
    onBrickDestroyed: function (g, r, b) {
      if (b.owner !== r || b.type !== 'eye' || r.s.defeated) return;
      if (this.eyesLeft(r) === 0) {
        bossDefeated(g, r, b.x + b.w / 2, b.y);
        shatterOwned(g, r);
        for (var i = 0; i < r.s.spits.length; i++) r.s.spits[i].alive = false;
      }
    },
    render: function (ctx, g, r, layer, R) {
      var s = r.s;
      if (layer === 'back') {
        if (s.defeated) return;
        // mouth glow (tell before a spit)
        var mx = s.baseX + s.mouthRelX + s.offX, my = s.y0 + 3 * C.grid.cellH + 8;
        if (s.tell) {
          ctx.save();
          var a = 0.4 + 0.4 * Math.sin(g.t * 30);
          ctx.fillStyle = 'rgba(255,90,100,' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(mx, my, 34, 12, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
        return;
      }
      // eyes with pupils that follow the ball, mouth, spits
      var tx = g.paddle.x, ty = g.paddle.y;
      if (g.balls.length) { tx = g.balls[0].x; ty = g.balls[0].y; }
      ctx.save();
      for (var i = 0; i < g.bricks.length; i++) {
        var b = g.bricks[i];
        if (b.owner !== r || !b.alive) continue;
        if (b.type === 'mouth') {
          R.roundRect(ctx, b.x, b.y, b.w, b.h, 3);
          ctx.fillStyle = s.tell ? '#ff5a64' : '#2a0f1f'; ctx.fill();
          ctx.fillStyle = '#f2f2f2';
          for (var t = 0; t < 3; t++) { // teeth
            ctx.beginPath(); ctx.moveTo(b.x + 3 + t * 9, b.y); ctx.lineTo(b.x + 7.5 + t * 9, b.y + 6); ctx.lineTo(b.x + 12 + t * 9, b.y); ctx.fill();
          }
        } else if (b.type === 'eye') {
          var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          var hurt = b.hp < b.maxHp;
          ctx.fillStyle = b.flash > 0 ? '#ffd0d0' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(cx, cy, b.w / 2, b.h / 2 + 1, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = hurt ? '#ff5a64' : '#ffcc33'; ctx.lineWidth = 2; ctx.stroke();
          var dx = tx - cx, dy = ty - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
          ctx.fillStyle = '#1a0b2e';
          ctx.beginPath(); ctx.arc(cx + dx / d * 6, cy + dy / d * 3, 4, 0, TAU); ctx.fill();
          if (hurt) { // bloodshot cracks
            ctx.strokeStyle = 'rgba(255,60,80,0.8)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(b.x + 2, cy); ctx.lineTo(b.x + 7, cy - 2); ctx.moveTo(b.x + b.w - 2, cy); ctx.lineTo(b.x + b.w - 7, cy + 2); ctx.stroke();
          }
          // pips: hits left
          ctx.fillStyle = '#ffcc33';
          for (var h = 0; h < b.hp; h++) { ctx.beginPath(); ctx.arc(cx - (b.hp - 1) * 3 + h * 6, b.y - 4, 1.8, 0, TAU); ctx.fill(); }
        }
      }
      for (i = 0; i < s.spits.length; i++) {
        var q = s.spits[i];
        if (!q.alive) continue;
        ctx.fillStyle = '#ff5a64';
        R.roundRect(ctx, q.x - 8, q.y - 6, 16, 12, 3); ctx.fill();
        ctx.fillStyle = '#4a0d18';
        ctx.fillRect(q.x - 4, q.y - 2, 2, 2); ctx.fillRect(q.x + 2, q.y - 2, 2, 2);
      }
      ctx.restore();
    }
  });

  // ======================= The Serpent =======================
  // A snake of bricks crawls the arena. Chop the tail; when it is short the head turns vulnerable.
  register('serpent', {
    boss: true, bossName: 'The Serpent',
    init: function (g, r) {
      var s = r.s, p = r.p;
      s.N = 2048;
      s.hist = new Float32Array(s.N * 2);
      s.hi = 0; s.hn = 0; s.acc = 0;
      s.minX = 24; s.maxX = C.W - 24; s.minY = C.TOP + 26; s.maxY = 330;
      s.hx = 330; s.hy = 112; s.heading = 2.3; s.t = 0;
      s.hp = s.maxHp = Math.max(2, Math.round(p.headHp * g.preset.bossHpScale));
      s.defeated = false;
      s.total = p.segments;
      s.clangT = 0;
      // pre-fill history: the body lies along a line to the left of the head, on screen
      var cnt = Math.ceil(p.segments * p.spacing / 2) + 4, i;
      for (i = 0; i < cnt; i++) this.record(s, s.hx - (cnt - 1 - i) * 2, s.hy);
      var head = BT.Bricks.make('head', 0, 0, 24, 24);
      head.owner = r; head.required = false; head.breakable = false; head.blastDamage = true; head.customDraw = true;
      head.color = '#2ee0a4';
      g.addBrick(head);
      s.head = head;
      s.segs = [];
      for (i = 0; i < p.segments; i++) {
        var b = BT.Bricks.make('segment', 0, 0, p.size, p.size);
        b.owner = r; b.required = false; b.customDraw = true;
        b.color = i % 2 ? '#1fbf87' : '#38e6b0';
        g.addBrick(b);
        s.segs.push(b);
      }
      this.place(g, r);
    },
    record: function (s, x, y) {
      s.hist[s.hi * 2] = x; s.hist[s.hi * 2 + 1] = y;
      s.hi = (s.hi + 1) % s.N; if (s.hn < s.N) s.hn++;
    },
    histAt: function (s, back, out) {
      if (back >= s.hn) back = s.hn - 1;
      var idx = (s.hi - 1 - back + s.N * 2) % s.N;
      out.x = s.hist[idx * 2]; out.y = s.hist[idx * 2 + 1];
    },
    place: function (g, r) {
      var s = r.s, p = r.p, h = s.head;
      h.bx = s.hx - h.w / 2; h.by = s.hy - h.h / 2;
      var step = Math.round(p.spacing / 2);
      for (var i = 0; i < s.segs.length; i++) {
        this.histAt(s, (i + 1) * step, TMP);
        var b = s.segs[i];
        b.bx = TMP.x - b.w / 2; b.by = TMP.y - b.h / 2;
      }
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p;
      s.t += dt;
      if (s.clangT > 0) s.clangT -= dt;
      if (s.defeated) return;
      var frac = 1 - s.segs.length / s.total;
      s.speed = (p.speedMin + (p.speedMax - p.speedMin) * frac) * (0.55 + 0.45 * g.preset.hazardScale);
      if (g.state === 'serve') s.speed *= 0.5;
      var turn = (Math.sin(s.t * 0.9) * 0.7 + Math.sin(s.t * 0.37 + 1.3) * 0.5) * p.turnRate;
      s.heading += turn * dt;
      var vx = Math.cos(s.heading), vy = Math.sin(s.heading);
      // keep inside the arena: steer back when near an edge
      if (s.hx < s.minX && vx < 0) s.heading = Math.PI - s.heading;
      if (s.hx > s.maxX && vx > 0) s.heading = Math.PI - s.heading;
      if (s.hy < s.minY && vy < 0) s.heading = -s.heading;
      if (s.hy > s.maxY && vy > 0) s.heading = -s.heading;
      var d = s.speed * dt;
      s.hx += Math.cos(s.heading) * d; s.hy += Math.sin(s.heading) * d;
      s.acc += d;
      while (s.acc >= 2) { s.acc -= 2; this.record(s, s.hx, s.hy); }
      this.place(g, r);
    },
    vulnerable: function (r) { return r.s.segs.length <= r.p.vulnerableAt; },
    onBrickHit: function (g, r, b, ball, cause) {
      if (b !== r.s.head) return false;
      b.flash = 0.15;
      if (!this.vulnerable(r)) {
        g.fx.sound('steel');
        if (r.s.clangT <= 0) { g.fx.text(b.x + b.w / 2, b.y - 8, 'Tail first!', '#c9d6ee'); r.s.clangT = 2; }
        return true;
      }
      r.s.hp--;
      g.sinceHit = 0;
      g.score += C.score.bossHit;
      g.fx.sound('bosshit');
      g.fx.shake(3); g.shakeAmt = Math.max(g.shakeAmt, 3);
      g.fx.burst(b.x + b.w / 2, b.y + b.h / 2, '#2ee0a4', 8, 'chip');
      if (r.s.hp <= 0) {
        bossDefeated(g, r, b.x + b.w / 2, b.y + b.h / 2);
        b.breakable = true; g.destroyBrick(b, 'boss');
        shatterOwned(g, r);
      }
      return true;
    },
    onBrickDestroyed: function (g, r, b) {
      if (b.owner !== r || b.type !== 'segment') return;
      var j = 0, sg = r.s.segs;
      for (var i = 0; i < sg.length; i++) if (sg[i].alive) sg[j++] = sg[i];
      sg.length = j;
      if (!r.s.defeated && this.vulnerable(r) && !r.s.announced) {
        r.s.announced = true;
        g.fx.text(r.s.hx, r.s.hy - 24, 'Hit the head!', '#ffe27a');
        g.fx.sound('unlock');
      }
    },
    render: function (ctx, g, r, layer, R) {
      if (layer !== 'back') return;
      var s = r.s, sg = s.segs, i;
      ctx.save();
      // spine
      if (s.head.alive && sg.length) {
        ctx.strokeStyle = 'rgba(46,224,164,0.35)'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(s.hx, s.hy);
        for (i = 0; i < sg.length; i++) ctx.lineTo(sg[i].x + sg[i].w / 2, sg[i].y + sg[i].h / 2);
        ctx.stroke();
      }
      for (i = sg.length - 1; i >= 0; i--) {
        var b = sg[i];
        R.roundRect(ctx, b.x, b.y, b.w, b.h, 6);
        ctx.fillStyle = b.flash > 0 ? '#ffffff' : b.color; ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(b.x + 4, b.y + b.h / 2 - 1, b.w - 8, 2);
      }
      var h = s.head;
      if (h.alive) {
        var vul = this.vulnerable(r);
        R.roundRect(ctx, h.x, h.y, h.w, h.h, 8);
        ctx.fillStyle = h.flash > 0 ? '#ffffff' : (vul ? '#ff5a64' : '#7b8aa6');
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = vul ? '#ffe27a' : '#c9d6ee'; ctx.stroke();
        if (!vul) { // armour plates
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(h.x + 4, h.y + 8); ctx.lineTo(h.x + h.w - 4, h.y + 8); ctx.moveTo(h.x + 4, h.y + 16); ctx.lineTo(h.x + h.w - 4, h.y + 16); ctx.stroke();
        }
        var fx = Math.cos(s.heading), fy = Math.sin(s.heading);
        var cx = h.x + h.w / 2, cy = h.y + h.h / 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx + fx * 5 - fy * 5, cy + fy * 5 + fx * 5, 3.5, 0, TAU); ctx.arc(cx + fx * 5 + fy * 5, cy + fy * 5 - fx * 5, 3.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(cx + fx * 6.5 - fy * 5, cy + fy * 6.5 + fx * 5, 1.7, 0, TAU); ctx.arc(cx + fx * 6.5 + fy * 5, cy + fy * 6.5 - fx * 5, 1.7, 0, TAU); ctx.fill();
        if (vul) { // hp pips
          ctx.fillStyle = '#ffe27a';
          for (i = 0; i < s.hp; i++) { ctx.beginPath(); ctx.arc(cx - (s.hp - 1) * 3 + i * 6, h.y - 5, 1.8, 0, TAU); ctx.fill(); }
        }
      }
      ctx.restore();
    }
  });
  var TMP = { x: 0, y: 0 };

  // ======================= The Magnet =======================
  // Pulls the ball in (shielded), then flips and flings it (vulnerable while repelling).
  register('magnet', {
    boss: true, bossName: 'The Magnet',
    init: function (g, r) {
      var s = r.s, p = r.p;
      s.cx = p.cx || C.W / 2; s.cy = p.cy || 210;
      s.hp = s.maxHp = Math.max(3, Math.round(p.hp * g.preset.bossHpScale));
      s.mode = 'pull'; s.timer = p.pull; s.t = 0; s.flash = 0; s.hitCd = 0; s.defeated = false;
      s.ring = [];
      var pat = p.shield || '2c2c2c2c2c2c';
      for (var i = 0; i < pat.length; i++) {
        var b = BT.Bricks.fromChar(pat[i], 0, 0, 18, 14);
        if (!b) continue;
        b.owner = r; b.required = false; b.a0 = i / pat.length * TAU;
        g.addBrick(b);
        s.ring.push(b);
      }
      this.place(g, r);
    },
    place: function (g, r) {
      var s = r.s, rad = r.p.shieldRadius || 62;
      for (var i = 0; i < s.ring.length; i++) {
        var b = s.ring[i], a = b.a0 + s.t * 0.45;
        b.bx = s.cx + Math.cos(a) * rad - b.w / 2; b.by = s.cy + Math.sin(a) * rad - b.h / 2;
      }
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p;
      s.t += dt;
      if (s.flash > 0) s.flash -= dt;
      if (s.hitCd > 0) s.hitCd -= dt;
      this.place(g, r);
      if (s.defeated) return;
      if (g.state !== 'play') { s.mode = 'pull'; s.timer = p.pull; return; }
      s.timer -= dt;
      if (s.timer > 0) return;
      if (s.mode === 'pull') { s.mode = 'warn'; s.timer = p.warn; g.fx.sound('windwarn'); }
      else if (s.mode === 'warn') {
        s.mode = 'repel'; s.timer = p.repel;
        g.fx.sound('flip'); g.fx.ring(s.cx, s.cy, p.flingRadius, '#ff5a64');
        for (var i = 0; i < g.balls.length; i++) { // fling
          var b = g.balls[i];
          if (b.stuck) continue;
          var dx = b.x - s.cx, dy = b.y - s.cy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < p.flingRadius && d > 1) {
            var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            b.vx = dx / d * sp; b.vy = dy / d * sp;
            b.boost = Math.max(b.boost, p.flingBoost);
          }
        }
      } else { s.mode = 'pull'; s.timer = p.pull * (0.7 + 0.3 * s.hp / s.maxHp); }
    },
    onBallStep: function (g, r, ball, dt) {
      var s = r.s, p = r.p;
      if (s.defeated || g.state !== 'play') return;
      var dx = s.cx - ball.x, dy = s.cy - ball.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var f = 0;
      if (s.mode === 'pull') f = p.pullAccel * P.clamp(70 / d, 0.25, 1.4);
      else if (s.mode === 'repel') f = -p.repelAccel * P.clamp(70 / d, 0.2, 1.3);
      f *= g.preset.forceScale;
      ball.vx += dx / d * f * dt; ball.vy += dy / d * f * dt;
      if (P.circleCircle(ball.x, ball.y, ball.r, s.cx, s.cy, p.bodyRadius) > 0) {
        ball.x += HIT.nx * HIT.depth; ball.y += HIT.ny * HIT.depth;
        P.reflect(ball, HIT.nx, HIT.ny);
        this.hitBody(g, r);
      }
    },
    hitBody: function (g, r) {
      var s = r.s;
      if (s.hitCd > 0) return;
      s.hitCd = 0.2;
      if (s.mode !== 'repel') {
        g.fx.sound('steel');
        s.flash = 0.1;
        return;
      }
      s.hp--; s.flash = 0.2;
      g.sinceHit = 0;
      g.score += C.score.bossHit;
      g.fx.sound('bosshit');
      g.fx.shake(3); g.shakeAmt = Math.max(g.shakeAmt, 3);
      g.fx.burst(s.cx, s.cy, '#ff5a64', 12, 'spark');
      if (s.hp <= 0) {
        bossDefeated(g, r, s.cx, s.cy);
        shatterOwned(g, r);
      }
    },
    onLaser: function (g, r, L) {
      var s = r.s;
      if (s.defeated) return false;
      var dx = L.x - s.cx, dy = L.y - s.cy;
      if (dx * dx + dy * dy < r.p.bodyRadius * r.p.bodyRadius) { this.hitBody(g, r); return true; }
      return false;
    },
    render: function (ctx, g, r, layer) {
      if (layer !== 'back') return;
      var s = r.s, p = r.p, R = p.bodyRadius, i;
      if (s.defeated) return;
      ctx.save();
      var pull = s.mode === 'pull', rep = s.mode === 'repel', warn = s.mode === 'warn';
      // field lines
      for (i = 0; i < 4; i++) {
        var ph = ((s.t * (rep ? 0.9 : 0.6) + i / 4) % 1);
        var rr = rep ? R + 120 * ph : R + 120 * (1 - ph);
        var a = rep ? 0.25 * (1 - ph) : 0.22 * ph;
        ctx.strokeStyle = (rep ? 'rgba(255,90,100,' : 'rgba(90,160,255,') + a.toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.cx, s.cy, rr, 0, TAU); ctx.stroke();
      }
      var blink = warn && (Math.floor(s.t * 12) % 2 === 0);
      var body = rep || blink ? '#ff4d5e' : '#3d7bff';
      if (s.flash > 0) body = '#ffffff';
      var grd = ctx.createRadialGradient(s.cx - 8, s.cy - 8, 4, s.cx, s.cy, R);
      grd.addColorStop(0, rep ? '#ffc2c8' : '#cfe0ff'); grd.addColorStop(1, body);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(s.cx, s.cy, R, 0, TAU); ctx.fill();
      // horseshoe mark
      ctx.strokeStyle = 'rgba(20,20,40,0.75)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(s.cx, s.cy + 2, 9, Math.PI, 0, false);
      ctx.moveTo(s.cx - 9, s.cy + 2); ctx.lineTo(s.cx - 9, s.cy + 10); ctx.moveTo(s.cx + 9, s.cy + 2); ctx.lineTo(s.cx + 9, s.cy + 10);
      ctx.stroke();
      if (pull) { // shield hexagon: not vulnerable
        ctx.strokeStyle = 'rgba(160,200,255,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (i = 0; i <= 6; i++) {
          var aa = i / 6 * TAU + s.t;
          var x = s.cx + Math.cos(aa) * (R + 5), y = s.cy + Math.sin(aa) * (R + 5);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (rep) { // vulnerable: pulsing outline + "HIT!"
        ctx.strokeStyle = 'rgba(255,230,120,' + (0.6 + 0.4 * Math.sin(s.t * 14)).toFixed(3) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.cx, s.cy, R + 4, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffe27a'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('HIT ME!', s.cx, s.cy - R - 10);
      }
      ctx.restore();
    }
  });
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
