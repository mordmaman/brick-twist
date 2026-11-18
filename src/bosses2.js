// Act two bosses: The Keeper (World 9), The Queen (World 10), The Architect (World 11, the final boss).
// Same hook interface as rules plus boss: true and s.hp / s.maxHp / s.defeated (HUD bar, 'boss' clear). No DOM.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, P = BT.Physics, HIT = BT.Physics.HIT, TAU = Math.PI * 2;
  var register = BT.Rules.register;

  function bossDefeated(g, r, x, y) {
    r.s.defeated = true; r.s.hp = 0;
    g.score += 1000;
    g.fx.sound('bossdown');
    g.fx.shake(C.shake.boss * 1.5); g.shakeAmt = C.shake.boss * 1.5;
    g.fx.ring(x, y, 180, '#ffffff');
    g.fx.burst(x, y, '#ffffff', 30, 'spark');
  }
  function shatterOwned(g, r) {
    for (var i = 0; i < g.bricks.length; i++) { var k = g.bricks[i]; if (k.alive && k.owner === r) g.destroyBrick(k, 'boss'); }
  }

  // ======================= The Keeper =======================
  // A goalkeeper guards a goal mouth in the top wall: score goals past it. It reads straight shots: once the ball
  // is above commitY it works out where a straight ball would arrive and dives there, and it does not look again.
  // So a Curveball bent after it has committed beats it, and a Power Shot knocks it flying. Slow-Mo gives you the
  // time to line both up. Tells: it raises a "!" and a marker shows where it is diving.
  var KEEPER_SAVE = ['Saved!', 'Mine!', 'Too straight!', 'Nope!'];
  var KEEPER_GOAL = ['GOAL!', 'GOAL!', 'What a shot!', 'GOAL!'];
  register('keeper', {
    boss: true, bossName: 'The Keeper',
    init: function (g, r) {
      var s = r.s, p = r.p;
      s.hp = s.maxHp = Math.max(2, Math.round(p.goals * g.preset.bossHpScale)); s.defeated = false;
      s.gx0 = (C.W - p.mouth) / 2; s.gx1 = s.gx0 + p.mouth;
      for (var k = 0; k < 2; k++) { // goal posts (steel)
        var post = BT.Bricks.make('steel', k ? s.gx1 : s.gx0 - 8, g.topY, 8, 30);
        post.breakable = false; post.required = false; post.noBlast = true; post.owner = r; post.customDraw = true; post.color = '#e8ecf4';
        g.addBrick(post);
      }
      s.xp = g.addXPaddle({ x: C.W / 2, y: g.topY + p.y, w: p.w, face: 1, counts: false, owner: r, kind: 'keeper', color: '#ffb347' });
      s.xmin = s.gx0 + p.w / 2 - 22; s.xmax = s.gx1 - p.w / 2 + 22;
      s.track = null; s.react = 0; s.commit = false; s.tx = C.W / 2; s.daze = 0; s.saves = 0; s.goals = 0; s.knocks = 0;
      s.goalFlash = 0; s.t = 0; s.lookX = C.W / 2; s.lookY = 400; s.mood = 0; s.spin = 0; s.err = 0;
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, q = s.xp, i;
      s.t += dt;
      if (s.goalFlash > 0) s.goalFlash -= dt;
      if (s.mood > 0) s.mood -= dt;
      if (q.squash > 0) q.squash -= dt;
      if (q.hitFlash > 0) q.hitFlash -= dt;
      for (i = 0; i < g.balls.length; i++) if (g.balls[i].goalCd > 0) g.balls[i].goalCd -= dt;
      if (s.defeated) { q.off = true; return; }
      if (s.daze > 0) {
        s.daze -= dt; s.spin += dt * 9; q.off = true;
        if (s.daze <= 0) { q.off = false; s.track = null; s.commit = false; }
        return;
      }
      var best = null, by = 1e9;
      for (i = 0; i < g.balls.length; i++) {
        var b = g.balls[i];
        if (b.stuck || b.vy >= 0 || b.y < q.y || b.y > p.commitY) continue;
        if (b.y < by) { by = b.y; best = b; }
      }
      if (s.track && (s.track.dead || s.track.vy >= 0 || s.track.y < q.y - 12)) { s.track = null; s.commit = false; }
      if (best && !s.track) {
        s.track = best; s.commit = false;
        s.react = p.react * (0.8 + 0.4 * g.rng()) / Math.sqrt(g.preset.hazardScale);
        s.err = (g.rng() * 2 - 1) * 6;
      }
      var target, speed;
      if (s.track) {
        var tb = s.track;
        s.lookX = tb.x; s.lookY = tb.y;
        if (s.react > 0) { s.react -= dt; target = q.x; speed = p.idleSpeed; }
        else {
          if (!s.commit) { // read the shot once, as if it flies straight
            s.commit = true;
            var hitY = q.y + q.h / 2 + tb.r;
            s.tx = P.clamp(P.predictLandingX(tb.x, -tb.y, tb.vx, -tb.vy, -hitY, g.wallL + tb.r, g.wallR - tb.r) + s.err, s.xmin, s.xmax);
          }
          target = s.tx; speed = p.speed;
        }
      } else {
        var bx = g.balls.length ? g.balls[0].x : C.W / 2;
        if (g.balls.length) { s.lookX = g.balls[0].x; s.lookY = g.balls[0].y; }
        target = P.clamp(C.W / 2 + (bx - C.W / 2) * 0.3, s.xmin, s.xmax); speed = p.idleSpeed;
      }
      speed *= 0.65 + 0.35 * g.preset.hazardScale;
      var nx = q.x + P.clamp(target - q.x, -speed * dt, speed * dt);
      nx = P.clamp(nx, s.xmin, s.xmax);
      q.vx = (nx - q.x) / dt; q.x = nx;
    },
    onBallStep: function (g, r, b) {
      var s = r.s, q = s.xp;
      if (s.defeated) return;
      // a Power Shot coming at it: knocked clean out of the way
      if (b.powered && b.vy < 0 && !q.off && b.y > q.y && b.y - q.y < 90 && Math.abs(b.x - q.x) < q.w / 2 + 30) {
        s.daze = r.p.dazed; s.spin = 0; s.knocks++; q.off = true; s.track = null; s.commit = false;
        g.fx.sound('daze'); g.fx.text(q.x, q.y + 24, 'Whoa!', '#ffe27a'); g.fx.burst(q.x, q.y, '#ffb347', 12, 'spark');
      }
      // a goal: the ball has just bounced off the top wall inside the goal mouth
      if (b.vy > 0 && b.y <= g.topY + b.r + 1.5 && b.x > s.gx0 && b.x < s.gx1 && !(b.goalCd > 0)) this.goal(g, r, b);
    },
    goal: function (g, r, b) {
      var s = r.s;
      b.goalCd = 0.6;
      s.hp--; s.goals++; s.goalFlash = 0.9; s.mood = -1.5;
      g.sinceHit = 0; g.score += C.score.bossHit * 2;
      g.fx.sound('goal'); g.fx.shake(4); g.shakeAmt = Math.max(g.shakeAmt, 4);
      g.fx.ring(b.x, g.topY + 14, 90, '#ffd35a'); g.fx.burst(b.x, g.topY + 10, '#ffd35a', 18, 'spark');
      g.fx.text(C.W / 2, g.topY + 72, KEEPER_GOAL[s.goals % KEEPER_GOAL.length], '#ffd35a');
      if (s.hp <= 0) { bossDefeated(g, r, C.W / 2, g.topY + 40); s.xp.off = true; shatterOwned(g, r); }
    },
    onPaddleHit: function (g, r, b, xp) {
      var s = r.s;
      if (!xp || xp !== s.xp) return;
      s.saves++; s.track = null; s.commit = false; s.mood = 1.2;
      if (g.rng() < 0.5) g.fx.text(xp.x, xp.y + 24, KEEPER_SAVE[s.saves % KEEPER_SAVE.length], '#ffd59a');
    },
    onLaser: function (g, r, L) {
      var q = r.s.xp;
      return !q.off && Math.abs(L.x - q.x) < q.w / 2 && Math.abs(L.y - q.y) < 10;
    },
    // where a sensible player bends a rising ball (the test bot's Curveball uses it): into the goal mouth, on the
    // side away from where the keeper has dived
    botCurve: function (g, r, b) {
      var s = r.s, q = s.xp, y = g.topY + b.r;
      if (s.defeated || b.y < q.y) return null;
      var x = (s.gx0 + s.gx1) / 2;
      if (s.commit && !q.off) x = s.tx > x ? s.gx0 + 16 : s.gx1 - 16;
      return { x: x, y: y };
    },
    render: function (ctx, g, r, layer, R) {
      var s = r.s, p = r.p, q = s.xp, i;
      ctx.save();
      if (layer === 'back') {
        // the goal: a net in the top wall between the posts, flashing gold on a goal
        var x0 = s.gx0, x1 = s.gx1, y0 = g.topY, y1 = g.topY + 28;
        ctx.fillStyle = s.goalFlash > 0 ? 'rgba(255,211,90,' + (0.3 * s.goalFlash).toFixed(3) + ')' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeStyle = 'rgba(230,236,250,0.35)'; ctx.lineWidth = 1;
        var wob = s.goalFlash > 0 ? Math.sin(g.t * 40) * 2 * s.goalFlash : 0;
        for (var x = x0; x <= x1; x += 10) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + wob, y1); ctx.stroke(); }
        for (var y = y0 + 6; y <= y1; y += 7) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y + wob * 0.5); ctx.stroke(); }
        ctx.fillStyle = '#e8ecf4'; ctx.fillRect(x0 - 8, y0, 8, 30); ctx.fillRect(x1, y0, 8, 30);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 - 3, y0, 2, 30); ctx.fillRect(x1 + 5, y0, 2, 30);
        // the box line on the grass, and the score
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 40, y0, x1 - x0 + 80, p.y + 26);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = 'bold 11px ' + R.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('GOALS ' + s.goals + ' / ' + s.maxHp, C.W / 2, y0 + p.y + 40);
        ctx.restore(); return;
      }
      if (s.defeated) { ctx.restore(); return; }
      if (s.commit && !q.off) { // where it is diving to
        ctx.strokeStyle = 'rgba(255,179,71,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(s.tx - 12, q.y + 12); ctx.lineTo(s.tx + 12, q.y + 12); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#ffb347'; ctx.font = '900 14px ' + R.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', q.x, q.y - 15);
      }
      var kx = q.x, ky = q.y;
      if (q.off) { // knocked flying: tumbling over by the post, then back up
        kx = q.x + Math.sin(s.spin * 0.7) * 10; ky = q.y - 6;
        ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(s.spin) * 0.9);
        ctx.globalAlpha = 0.75; R.roundRect(ctx, -q.w / 2, -6, q.w, 12, 6); ctx.fillStyle = '#ffb347'; ctx.fill(); ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle = '#ffe27a';
        for (i = 0; i < 3; i++) { var a = g.t * 6 + i * TAU / 3; ctx.beginPath(); ctx.arc(kx + Math.cos(a) * 20, ky - 12 + Math.sin(a) * 4, 2, 0, TAU); ctx.fill(); }
        ctx.restore(); return;
      }
      // gloves at the ends and a face that watches the ball
      ctx.fillStyle = '#ffffff';
      for (var k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.arc(kx + k * (q.w / 2 + 2), ky, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c0782a'; ctx.lineWidth = 1.5; ctx.stroke(); }
      var dx = s.lookX - kx, dy = s.lookY - ky, d = Math.sqrt(dx * dx + dy * dy) || 1;
      for (k = -1; k <= 1; k += 2) {
        var ex = kx + k * 8;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex, ky - 1, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a1405'; ctx.beginPath(); ctx.arc(ex + dx / d * 1.8, ky - 1 + dy / d * 1.8, 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2a1405'; ctx.lineWidth = 1.5; ctx.beginPath();
        var tilt = s.mood > 0 ? -2 : (s.mood < 0 ? 2 : 0);
        ctx.moveTo(ex - 4, ky - 7 + tilt * k); ctx.lineTo(ex + 4, ky - 7 - tilt * k); ctx.stroke();
      }
      ctx.restore();
    }
  });

  // ======================= The Queen =======================
  // A hive queen in the upper middle, ringed by her eggs (two rings of slots). The eggs stay shut while she broods,
  // and that is when she can be hit: break a way in. When the brood ends the eggs hatch into critters (the Hatchlings
  // rule) and she closes her shell; then she lays a fresh ring, each egg shown as a glowing outline first, never on
  // top of the ball.
  register('queen', {
    boss: true, bossName: 'The Queen',
    init: function (g, r) {
      var s = r.s, p = r.p, i;
      s.hatch = g.addRule({ id: 'hatch', auto: false });
      s.cx = p.cx || C.W / 2; s.cy0 = p.cy || 200; s.cy = s.cy0;
      s.hp = s.maxHp = Math.max(3, Math.round(p.hp * g.preset.bossHpScale)); s.defeated = false;
      s.brood = g.presetName === 'easy' ? p.broodEasy : p.brood / Math.sqrt(g.preset.hazardScale);
      s.t = 0; s.flash = 0; s.hitCd = 0; s.clang = 0; s.wing = 0; s.layQ = []; s.layT = 0;
      s.slots = [];
      for (i = 0; i < p.slots; i++) s.slots.push({ a: i / p.slots * TAU, rad: p.ring, egg: null, tell: 0 });
      for (i = 0; i < p.outerSlots; i++) s.slots.push({ a: (i + 0.5) / p.outerSlots * TAU, rad: p.outer, egg: null, tell: 0 });
      // she starts brooding a full clutch (a little longer the first time)
      s.mode = 'brood'; s.timer = s.brood + 3;
      for (i = 0; i < s.slots.length; i++) this.layEgg(g, r, s.slots[i], s.timer + g.rng() * 0.5);
    },
    slotPos: function (r, sl) { return { x: r.s.cx + Math.cos(sl.a) * sl.rad, y: r.s.cy0 + Math.sin(sl.a) * sl.rad * 0.9 }; },
    layEgg: function (g, r, sl, after) {
      var q = this.slotPos(r, sl), b = BT.Bricks.make('egg', q.x - 10, q.y - 8, 20, 16);
      b.owner = r; b.required = false; b.slot = sl; b.queenEgg = true;
      b.x = b.bx; b.y = b.by;
      sl.egg = b; sl.tell = 0;
      g.addBrick(b);
      r.s.hatch.mod.lay(g, r.s.hatch, b, after);
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, i;
      s.t += dt; s.wing += dt * (s.mode === 'shut' ? 4 : 22);
      if (s.flash > 0) s.flash -= dt;
      if (s.hitCd > 0) s.hitCd -= dt;
      if (s.clang > 0) s.clang -= dt;
      s.cy = s.cy0 + Math.sin(s.t * 1.3) * 3;
      for (i = 0; i < s.slots.length; i++) if (s.slots[i].egg && !s.slots[i].egg.alive) s.slots[i].egg = null;
      if (s.defeated || !g.hazardsActive(0)) return;
      s.timer -= dt;
      if (s.mode === 'brood' && s.timer <= 0) {
        s.mode = 'shut'; s.timer = p.shut;
        g.fx.sound('lay'); g.fx.text(s.cx, s.cy - 40, 'They hatch!', '#ffe9b0');
      } else if (s.mode === 'shut' && s.timer <= 0) {
        s.mode = 'lay'; s.timer = p.lay; s.layQ = [];
        for (i = 0; i < s.slots.length; i++) if (!s.slots[i].egg) s.layQ.push(s.slots[i]);
        for (i = s.layQ.length - 1; i > 0; i--) { var j = Math.floor(g.rng() * (i + 1)), t = s.layQ[i]; s.layQ[i] = s.layQ[j]; s.layQ[j] = t; }
        if (s.layQ.length > p.clutch) s.layQ.length = p.clutch;
        s.layT = 0;
      } else if (s.mode === 'lay') {
        // each egg glows as an outline for a moment first; it appears only when no ball is near the slot
        s.layT -= dt;
        if (s.layT <= 0) { // the next slot in the queue that is not already showing its outline
          for (i = 0; i < s.layQ.length; i++) if (!(s.layQ[i].tell > 0)) { s.layQ[i].tell = 0.55; break; }
          s.layT = Math.max(0.06, (p.lay - 0.6) / Math.max(1, s.layQ.length + 2));
        }
        for (i = 0; i < s.slots.length; i++) {
          var sl = s.slots[i];
          if (!(sl.tell > 0)) continue;
          sl.tell -= dt;
          if (sl.tell <= 0) {
            var q = this.slotPos(r, sl), qi = s.layQ.indexOf(sl);
            if (qi >= 0) s.layQ.splice(qi, 1);
            if (g.ballNear(q.x - 10, q.y - 8, 20, 16, 8)) { // the ball is there: try that slot again later
              sl.tell = 0;
              if (s.timer > -2) s.layQ.push(sl);
              continue;
            }
            this.layEgg(g, r, sl, Math.max(0.5, s.timer) + s.brood + g.rng() * 0.5);
            g.fx.sound('grow');
          }
        }
        if (s.timer <= 0 && !s.layQ.length && !s.slots.some(function (x) { return x.tell > 0; })) { s.mode = 'brood'; s.timer = s.brood; }
      }
    },
    vulnerable: function (r) { return !r.s.defeated && r.s.mode !== 'shut'; },
    onBallStep: function (g, r, b) {
      var s = r.s;
      if (s.defeated) return;
      if (P.circleCircle(b.x, b.y, b.r, s.cx, s.cy, r.p.bodyRadius) > 0) {
        b.x += HIT.nx * HIT.depth; b.y += HIT.ny * HIT.depth;
        P.reflect(b, HIT.nx, HIT.ny);
        this.hit(g, r);
      }
    },
    onLaser: function (g, r, L) {
      var s = r.s, dx = L.x - s.cx, dy = L.y - s.cy;
      if (s.defeated || dx * dx + dy * dy > r.p.bodyRadius * r.p.bodyRadius) return false;
      this.hit(g, r); return true;
    },
    hit: function (g, r) {
      var s = r.s;
      if (s.hitCd > 0) return;
      s.hitCd = 0.35;
      if (!this.vulnerable(r)) { if (s.clang <= 0) { g.fx.sound('steel'); g.fx.text(s.cx, s.cy - 34, 'Shell shut!', '#c9d6ee'); s.clang = 1.5; } return; }
      s.hp--; s.flash = 0.3;
      g.sinceHit = 0; g.score += C.score.bossHit;
      g.fx.sound('bosshit'); g.fx.shake(3); g.shakeAmt = Math.max(g.shakeAmt, 3);
      g.fx.burst(s.cx, s.cy, '#ffd35a', 14, 'spark');
      if (s.hp <= 0) {
        bossDefeated(g, r, s.cx, s.cy);
        shatterOwned(g, r);
        var cs = s.hatch.s.crits;
        for (var i = 0; i < cs.length; i++) if (cs[i].state === 'walk') s.hatch.mod.pop(g, s.hatch, cs[i], cs[i].x < C.W / 2 ? -1 : 1);
      }
    },
    render: function (ctx, g, r, layer, R) {
      var s = r.s, p = r.p, i;
      if (s.defeated) return;
      ctx.save();
      if (layer === 'back') {
        // the comb: faint hexagons round her, and the egg slots being laid
        ctx.strokeStyle = 'rgba(255,211,90,0.10)'; ctx.lineWidth = 1;
        for (var hy = -3; hy <= 3; hy++) for (var hx = -4; hx <= 4; hx++) {
          var cx = s.cx + hx * 26 + (hy % 2 ? 13 : 0), cy = s.cy0 + hy * 22;
          ctx.beginPath(); for (var k = 0; k < 6; k++) { var a = k * TAU / 6 + Math.PI / 6; ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); } ctx.closePath(); ctx.stroke();
        }
        for (i = 0; i < s.slots.length; i++) {
          var sl = s.slots[i];
          if (sl.tell <= 0) continue;
          var q = this.slotPos(r, sl), pu = 0.5 + 0.5 * Math.sin(g.t * 24);
          ctx.strokeStyle = 'rgba(255,233,176,' + (0.5 + 0.5 * pu).toFixed(3) + ')'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(q.x, q.y, 9, 7.5, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.restore(); return;
      }
      // the queen: wings, a striped body, a crown, eyes that follow the ball; her shell closes while eggs hatch
      var x = s.cx, y = s.cy, rad = p.bodyRadius, shut = s.mode === 'shut', vul = this.vulnerable(r);
      var wa = Math.sin(s.wing) * 0.35;
      ctx.fillStyle = 'rgba(220,240,255,0.55)';
      for (var w = -1; w <= 1; w += 2) { ctx.save(); ctx.translate(x + w * rad * 0.6, y - rad * 0.5); ctx.rotate(w * (0.5 + wa)); ctx.beginPath(); ctx.ellipse(w * 12, -6, 14, 8, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      var grd = ctx.createRadialGradient(x - 5, y - 6, 3, x, y, rad);
      grd.addColorStop(0, s.flash > 0 ? '#ffffff' : '#ffe27a'); grd.addColorStop(1, '#d08a12');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.clip();
      ctx.fillStyle = 'rgba(60,30,0,0.75)'; for (var st = -1; st <= 1; st++) ctx.fillRect(x - rad, y + 4 + st * 9, rad * 2, 4);
      ctx.restore();
      ctx.strokeStyle = vul ? '#fff2b0' : '#9aa3b5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.stroke();
      // crown
      ctx.fillStyle = '#ffd35a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 11, y - rad + 2); ctx.lineTo(x - 13, y - rad - 9); ctx.lineTo(x - 5, y - rad - 3); ctx.lineTo(x, y - rad - 11); ctx.lineTo(x + 5, y - rad - 3); ctx.lineTo(x + 13, y - rad - 9); ctx.lineTo(x + 11, y - rad + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      var tx = g.balls.length ? g.balls[0].x : g.paddle.x, ty = g.balls.length ? g.balls[0].y : g.paddle.y;
      var dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      for (var e = -1; e <= 1; e += 2) {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + e * 7, y - 6, 4.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a1405'; ctx.beginPath(); ctx.arc(x + e * 7 + dx / d * 2, y - 6 + dy / d * 2, 2.2, 0, TAU); ctx.fill();
      }
      if (shut) { // shell plates over her
        ctx.fillStyle = 'rgba(120,130,150,0.92)';
        for (var pl = 0; pl < 4; pl++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, rad + 3, pl * TAU / 4 + 0.08, (pl + 1) * TAU / 4 - 0.08); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = '#d8dcea'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, TAU); ctx.stroke();
      }
      for (i = 0; i < s.hp; i++) { ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x - (s.hp - 1) * 3.5 + i * 7, y + rad + 9, 2, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  });

  // ======================= The Architect (final boss) =======================
  // A drafting machine at the top with a core under its plate. It rebuilds the arena four times, each time around a
  // rule from act two (borrowed with g.addRule for the phase and taken out after it, as The Machine does): a puppet
  // wall that mirrors you, a painted shield with gates, a wall that builder bots keep rebuilding, and a cannonball
  // finale. Your three powers (listed in the level) work throughout. Between phases the core shutters close (no
  // damage), a blueprint sweeps down the field, the old parts crumble and the new ones fade in as ghosts that only
  // turn solid where no ball is touching them.
  var ARCH_PHASES = [
    { title: 'PHASE 1: PUPPET STRINGS', sub: 'Its wall copies your paddle. Slide it aside!', rule: { id: 'puppet', rows: [8, 9], range: 120 },
      rows: { 8: '....2222....', 9: '...cccccc...' } },
    { title: 'PHASE 2: PAINT JOB', sub: 'Match the colours to break the shield', rule: { id: 'paint', start: 'red', gates: [{ x: 30, y: 400, w: 70, color: 'red' }, { x: 145, y: 436, w: 70, color: 'yellow' }, { x: 260, y: 400, w: 70, color: 'blue' }] },
      rows: { 5: '...B....Y...', 6: '...R....B...', 7: '...YRRBBY...', 8: '...BBYYRR...' } },
    { title: 'PHASE 3: BUILDER BOTS', sub: 'Knock out the bots, then the core', rule: { id: 'builders', bots: [{ row: 10, c0: 1, c1: 5, rows: [7, 8] }, { row: 10, c0: 6, c1: 10, rows: [7, 8] }] },
      rows: { 7: '..rrrrrrrr..', 8: '..oooooooo..' } },
    { title: 'PHASE 4: CANNONBALL', sub: 'Lob it over the plate!', rule: { id: 'cannon' },
      rows: { 7: '.....##.....', 11: '.2...22...2.' } }
  ];
  register('architect', {
    boss: true, bossName: 'The Architect',
    init: function (g, r) {
      var s = r.s, p = r.p;
      s.hps = [];
      for (var i = 0; i < ARCH_PHASES.length; i++) s.hps.push(Math.max(2, Math.round(p.hp[i] * g.preset.bossHpScale)));
      s.maxHp = s.hps.reduce(function (a, b) { return a + b; }, 0); s.hp = s.maxHp;
      s.phase = 0; s.phaseHp = s.hps[0]; s.trans = 0; s.t = 0; s.flash = 0; s.hitCd = 0; s.clang = 0; s.off = 0; s.title = 0;
      s.cx = C.W / 2; s.defeated = false; s.parts = []; s.sub = null; s.arm = 0; s.finale = 0; s.top = g.topY;
      this.body(r);
      this.buildPhase(g, r, 0, true);
    },
    body: function (r) {
      var s = r.s;
      s.bx = s.cx + s.off - 130; s.by = s.top + 6; s.bw = 260; s.bh = 46;
      s.coreX = s.cx + s.off; s.coreY = s.by + s.bh + 14;
    },
    buildPhase: function (g, r, n, first) {
      var s = r.s, ph = ARCH_PHASES[n], gr = C.grid;
      s.parts.length = 0;
      for (var key in ph.rows) {
        var row = +key, line = ph.rows[key];
        for (var col = 0; col < line.length; col++) {
          var b = BT.Bricks.fromChar(line[col], col * gr.cellW + 1, gr.top + row * gr.cellH + 1, gr.brickW, gr.brickH);
          if (!b) continue;
          b.row = row; b.col = col; b.grid = true; b.required = false; b.owner = r; b.archPart = true;
          b.x = b.bx; b.y = b.by;
          if (!first) { g.makeGhostable(b); b.solid = false; b.ghost = 1; b.assembling = true; }
          g.addBrick(b); s.parts.push(b);
        }
      }
      s.sub = g.addRule(ph.rule);
      s.title = first ? 0 : 1.4;
    },
    endPhase: function (g, r) {
      var s = r.s;
      if (s.sub) { var sub = s.sub; s.sub = null; g.removeRule(sub); }
      for (var i = 0; i < s.parts.length; i++) if (s.parts[i].alive) g.destroyBrick(s.parts[i], 'boss');
      s.parts.length = 0;
    },
    update: function (g, r, dt) {
      var s = r.s, p = r.p, i;
      s.t += dt; s.arm += dt;
      if (s.flash > 0) s.flash -= dt;
      if (s.hitCd > 0) s.hitCd -= dt;
      if (s.clang > 0) s.clang -= dt;
      if (s.title > 0) s.title -= dt;
      if (s.finale > 0) s.finale -= dt;
      if (s.defeated) return;
      if (s.phase === 3) s.off = Math.sin(s.t * TAU / p.swayPeriod) * p.sway * (0.7 + 0.3 * g.preset.hazardScale);
      else s.off *= Math.max(0, 1 - dt * 2);
      this.body(r);
      for (i = 0; i < s.parts.length; i++) {
        var b = s.parts[i];
        if (b.assembling && b.solid && b.ghost < 0.05) { b.assembling = false; b.ghost = 0; if (!b.side) b.ghostable = false; }
      }
      if (s.trans > 0) {
        s.trans -= dt;
        if (s.trans <= 0) {
          s.phase++; s.phaseHp = s.hps[s.phase];
          this.buildPhase(g, r, s.phase, false);
          g.fx.sound('unlock');
        }
      }
    },
    vulnerable: function (r) { return !r.s.defeated && r.s.trans <= 0; },
    onBallStep: function (g, r, b) {
      var s = r.s;
      if (s.defeated) return;
      if (P.circleRect(b.x, b.y, b.r, s.bx, s.by, s.bw, s.bh) > 0) {
        b.x += HIT.nx * HIT.depth; b.y += HIT.ny * HIT.depth;
        if (P.reflect(b, HIT.nx, HIT.ny) && s.clang <= 0) { s.clang = 0.1; g.fx.sound('steel'); }
      }
      if (P.circleCircle(b.x, b.y, b.r, s.coreX, s.coreY, r.p.coreRadius) > 0) {
        b.x += HIT.nx * HIT.depth; b.y += HIT.ny * HIT.depth;
        P.reflect(b, HIT.nx, HIT.ny);
        this.hitCore(g, r);
      }
    },
    onLaser: function (g, r, L) {
      var s = r.s;
      if (s.defeated) return false;
      var dx = L.x - s.coreX, dy = L.y - s.coreY;
      if (dx * dx + dy * dy < r.p.coreRadius * r.p.coreRadius) { this.hitCore(g, r); return true; }
      return L.x > s.bx && L.x < s.bx + s.bw && L.y < s.by + s.bh;
    },
    hitCore: function (g, r) {
      var s = r.s;
      if (s.hitCd > 0) return;
      s.hitCd = 0.35;
      if (!this.vulnerable(r)) { g.fx.sound('steel'); return; }
      s.phaseHp--; s.hp--; s.flash = 0.25;
      g.sinceHit = 0; g.score += C.score.bossHit;
      g.fx.sound('bosshit'); g.fx.shake(3); g.shakeAmt = Math.max(g.shakeAmt, 3);
      g.fx.burst(s.coreX, s.coreY, '#7cf5ff', 14, 'spark');
      if (s.phaseHp > 0) return;
      this.endPhase(g, r);
      if (s.phase >= ARCH_PHASES.length - 1) {
        bossDefeated(g, r, s.coreX, s.coreY);
        shatterOwned(g, r);
        s.finale = 1.2;
        for (var k = 0; k < 4; k++) { g.fx.ring(40 + k * 93, 80 + (k % 2) * 40, 120, k % 2 ? '#7cf5ff' : '#ffd35a'); g.fx.burst(40 + k * 93, 80, '#ffffff', 16, 'spark'); }
        return;
      }
      s.trans = r.p.transition;
      g.score += 300;
      g.fx.sound('bossdown');
      g.fx.ring(s.coreX, s.coreY, 160, '#7cf5ff');
      g.fx.shake(C.shake.boss); g.shakeAmt = Math.max(g.shakeAmt, C.shake.boss);
    },
    render: function (ctx, g, r, layer, R) {
      var s = r.s, p = r.p, i;
      if (s.defeated) return;
      ctx.save();
      if (layer === 'back') {
        // blueprint grid, stronger while it redraws the arena; a scan line sweeps down during a change-over
        var k = s.trans > 0 ? 1 - s.trans / p.transition : 0;
        ctx.strokeStyle = 'rgba(124,200,255,' + (0.05 + (s.trans > 0 ? 0.12 : 0)).toFixed(3) + ')'; ctx.lineWidth = 1;
        for (var gx = 0; gx <= C.W; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, g.topY); ctx.lineTo(gx, 470); ctx.stroke(); }
        for (var gy = g.topY; gy <= 470; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(C.W, gy); ctx.stroke(); }
        if (s.trans > 0) {
          var sy = g.topY + (470 - g.topY) * k;
          var grd = ctx.createLinearGradient(0, sy - 30, 0, sy);
          grd.addColorStop(0, 'rgba(124,245,255,0)'); grd.addColorStop(1, 'rgba(124,245,255,0.35)');
          ctx.fillStyle = grd; ctx.fillRect(0, sy - 30, C.W, 30);
          ctx.fillStyle = 'rgba(200,250,255,0.9)'; ctx.fillRect(0, sy, C.W, 2);
          // the next layout drawn as blueprint outlines above the scan line
          var nx = ARCH_PHASES[s.phase + 1];
          if (nx) for (var key in nx.rows) {
            var row = +key, line = nx.rows[key], y = C.grid.top + row * C.grid.cellH + 1;
            if (y > sy) continue;
            for (var c = 0; c < line.length; c++) if (line[c] !== '.') { ctx.strokeStyle = 'rgba(180,240,255,0.7)'; ctx.setLineDash([3, 2]); ctx.strokeRect(c * C.grid.cellW + 1.5, y + 0.5, C.grid.brickW - 1, C.grid.brickH - 1); ctx.setLineDash([]); }
          }
        }
        ctx.restore(); return;
      }
      // the drafting machine: a blueprint plate, a swinging compass arm, gears, and one lamp per phase
      R.roundRect(ctx, s.bx, s.by, s.bw, s.bh, 10);
      var pg = ctx.createLinearGradient(0, s.by, 0, s.by + s.bh);
      pg.addColorStop(0, '#2d5d9a'); pg.addColorStop(1, '#173257');
      ctx.fillStyle = pg; ctx.fill();
      ctx.strokeStyle = '#a9d4ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(200,230,255,0.25)'; ctx.lineWidth = 1;
      for (i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(s.bx + i * s.bw / 8, s.by + 4); ctx.lineTo(s.bx + i * s.bw / 8, s.by + s.bh - 4); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(s.bx + 4, s.by + s.bh / 2); ctx.lineTo(s.bx + s.bw - 4, s.by + s.bh / 2); ctx.stroke();
      for (i = 0; i < ARCH_PHASES.length; i++) {
        var lx = s.coreX - 36 + i * 24, ly = s.by + 12, done = i < s.phase || (i === s.phase && s.trans > 0);
        ctx.fillStyle = done ? '#1a2840' : (i === s.phase ? '#7cf5ff' : '#ffd35a');
        ctx.beginPath(); ctx.arc(lx, ly, 5, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      }
      for (var side = -1; side <= 1; side += 2) { // two gears
        var gxp = s.coreX + side * 100, gyp = s.by + s.bh / 2, rot = s.t * side * 1.5;
        ctx.fillStyle = '#5b7fae';
        ctx.beginPath(); for (var t = 0; t < 16; t++) { var a = rot + t * TAU / 16, rr = t % 2 ? 11 : 14; ctx[t ? 'lineTo' : 'moveTo'](gxp + Math.cos(a) * rr, gyp + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#173257'; ctx.beginPath(); ctx.arc(gxp, gyp, 4, 0, TAU); ctx.fill();
      }
      // compass arm drawing arcs
      var aa = Math.sin(s.arm * 1.2) * 0.9, ax = s.coreX + 56, ay = s.by + s.bh;
      ctx.strokeStyle = '#d8dcea'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay - 6); ctx.lineTo(ax + Math.sin(aa) * 24, ay + Math.cos(aa) * 24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, ay - 6); ctx.lineTo(ax - Math.sin(aa) * 18, ay + Math.cos(aa) * 18); ctx.stroke();
      // the core eye (shutters closed between phases)
      var vul = this.vulnerable(r), cr = p.coreRadius;
      ctx.fillStyle = '#0d1626'; ctx.beginPath(); ctx.arc(s.coreX, s.coreY, cr + 4, 0, TAU); ctx.fill();
      if (vul) {
        var pu = 0.5 + 0.5 * Math.sin(g.t * 6);
        var cg = ctx.createRadialGradient(s.coreX, s.coreY, 2, s.coreX, s.coreY, cr);
        cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, s.flash > 0 ? '#ffffff' : '#9ff0ff'); cg.addColorStop(1, '#1b6fb0');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(s.coreX, s.coreY, cr, 0, TAU); ctx.fill();
        var tx = g.balls.length ? g.balls[0].x : g.paddle.x, ty = g.balls.length ? g.balls[0].y : g.paddle.y;
        var dx = tx - s.coreX, dy = ty - s.coreY, dd = Math.sqrt(dx * dx + dy * dy) || 1;
        ctx.fillStyle = '#04223a'; ctx.beginPath(); ctx.arc(s.coreX + dx / dd * 6, s.coreY + dy / dd * 6, 5.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,120,' + (0.5 + 0.5 * pu).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.coreX, s.coreY, cr + 4, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffe27a';
        for (i = 0; i < s.phaseHp; i++) { ctx.beginPath(); ctx.arc(s.coreX - (s.phaseHp - 1) * 3.5 + i * 7, s.coreY + cr + 10, 2, 0, TAU); ctx.fill(); }
      } else {
        ctx.fillStyle = '#4a6a92'; ctx.beginPath(); ctx.arc(s.coreX, s.coreY, cr, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#173257'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.coreX - cr, s.coreY); ctx.lineTo(s.coreX + cr, s.coreY); ctx.moveTo(s.coreX, s.coreY - cr); ctx.lineTo(s.coreX, s.coreY + cr); ctx.stroke();
      }
      var show = s.trans > 0 ? ARCH_PHASES[s.phase + 1] : (s.title > 0 ? ARCH_PHASES[s.phase] : null);
      if (show) {
        var al = s.trans > 0 ? Math.min(1, (p.transition - s.trans) * 3) : Math.min(1, s.title * 1.5);
        ctx.globalAlpha = al;
        R.roundRect(ctx, 26, 292, C.W - 52, 66, 14);
        ctx.fillStyle = 'rgba(8,16,32,0.9)'; ctx.fill();
        ctx.strokeStyle = '#7cf5ff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#bff6ff'; ctx.font = '900 17px ' + R.FONT; ctx.fillText(show.title, C.W / 2, 314);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '13px ' + R.FONT; ctx.fillText(show.sub, C.W / 2, 339);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  });
  BT.ARCH_PHASES = ARCH_PHASES;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
