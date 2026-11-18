// Headless test for Brick Twist. Run: node tests/sim.js
// Loads the pure-logic source files (no DOM) and checks physics, levels, a bot playthrough, Endless and save data.
// Flags: --quick (fewer seeds), --endless (only the Endless sections, after the physics and level checks).
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SRC = path.join(__dirname, '..', 'src');
['config.js', 'physics.js', 'bricks.js', 'rules.js', 'rules2.js', 'bosses.js', 'bosses2.js', 'levels.js', 'endless.js', 'game.js', 'save.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });
});
var BT = globalThis.BT, C = BT.CONFIG;

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL: ' + msg); } }
function section(name) { console.log('\n== ' + name); }
var QUICK = process.argv.indexOf('--quick') >= 0;
var ENDLESS_ONLY = process.argv.indexOf('--endless') >= 0;
var DT = 1 / C.physicsHz;

// ------------------------------------------------------------------ physics
section('Physics');
(function () {
  // Paddle angles
  var cb = C.ball;
  var a0 = BT.Physics.paddleAngle(180, 180, 38, 0, cb);
  var a1 = BT.Physics.paddleAngle(180 + 38, 180, 38, 0, cb);
  ok(Math.abs(a0) < 1e-9, 'centre of paddle sends the ball straight up');
  ok(Math.abs(a1 / BT.Physics.DEG - cb.maxAngleDeg) < 1e-6, 'paddle edge gives max angle');
  var a2 = BT.Physics.paddleAngle(180, 180, 38, 2000, cb);
  ok(Math.abs(a2 / BT.Physics.DEG - cb.englishMaxDeg) < 1e-6, 'english is capped');

  // Minimum vertical speed
  var b = { vx: 300, vy: 0 };
  BT.Physics.normalizeVel(b, 300, cb.minVyFrac);
  ok(Math.abs(b.vy) >= 300 * cb.minVyFrac - 1e-6 && Math.abs(Math.hypot(b.vx, b.vy) - 300) < 1e-6, 'horizontal ball gets a minimum vertical speed');

  // Tunnelling: fire at a single steel brick and a single normal brick at max speed from many angles
  var lvl = { id: 900, grid: [] };
  var passes = 0, misses = 0, hits = 0, tries = 0;
  for (var deg = -60; deg <= 60; deg += 2) {
    for (var t = 0; t < 2; t++) {
      var g = new BT.Game(lvl, 'normal', { seed: 1 });
      var brick = BT.Bricks.fromChar(t ? '#' : 'r', 166, 200, 28, 14);
      g.addBrick(brick);
      g.ballSpeed = 5000; // capped at absMaxSpeed by normalizeBall
      g.state = 'play';
      var ball = g.balls[0];
      ball.stuck = false; ball.serve = false;
      var rad = deg * Math.PI / 180;
      // aim at brick centre from 160px below
      ball.x = 180 - Math.sin(rad) * 160; ball.y = 207 + Math.cos(rad) * 160;
      ball.vx = Math.sin(rad); ball.vy = -Math.cos(rad);
      var crossed = false, wasHit = false;
      for (var s = 0; s < 120; s++) {
        var sp0 = Math.hypot(ball.vx, ball.vy);
        g.step(DT);
        if (!g.balls.length) break;
        ball = g.balls[0];
        if (ball.y < 200 - ball.r && ball.x > 166 && ball.x < 194 && brick.alive) crossed = true;
        if (!brick.alive || brick.flash > 0) wasHit = true;
        if (ball.vy > 0) break;
      }
      tries++;
      if (crossed) passes++;
      if (wasHit) hits++; else misses++;
      ok(Math.hypot(ball.vx, ball.vy) <= C.ball.absMaxSpeed + 1e-6, 'speed capped');
    }
  }
  ok(passes === 0, 'no tunnelling through a brick at max speed (' + passes + ' of ' + tries + ' passed through)');
  // the same for a big (r 12) and a small (r 4.2) ball, as in Big and Small
  [C.rules.bigsmall.bigR, C.rules.bigsmall.smallR].forEach(function (rad) {
    var through = 0, n = 0;
    for (var dg = -60; dg <= 60; dg += 4) {
      var gb = new BT.Game(lvl, 'normal', { seed: 1 }), bk = gb.addBrick(BT.Bricks.fromChar('#', 166, 200, 28, 14));
      gb.ballSpeed = 5000; gb.state = 'play';
      var bb = gb.balls[0]; bb.stuck = false; bb.serve = false; bb.r = rad;
      var rd = dg * Math.PI / 180;
      bb.x = 180 - Math.sin(rd) * 160; bb.y = 207 + Math.cos(rd) * 160; bb.vx = Math.sin(rd); bb.vy = -Math.cos(rd);
      for (var st = 0; st < 120 && gb.balls.length; st++) {
        gb.step(DT); bb = gb.balls[0];
        if (bb.y < 200 - bb.r && bb.x > 166 && bb.x < 194) { through++; break; }
        if (bb.vy > 0) break;
      }
      n++;
    }
    ok(through === 0, 'a ' + rad + 'px ball never tunnels through steel at max speed (' + through + ' of ' + n + ')');
  });
  ok(misses === 0, 'every direct shot registers a hit (' + misses + ' missed)');

  // Paddle: fast ball dropping onto the paddle at many offsets always bounces
  var bounced = 0, total = 0;
  for (var off = -40; off <= 40; off += 4) {
    var g2 = new BT.Game(lvl, 'normal', { seed: 2 });
    g2.ballSpeed = 5000; g2.state = 'play';
    var b2 = g2.balls[0]; b2.stuck = false; b2.serve = false;
    b2.x = 180 + off; b2.y = 450; b2.vx = 0; b2.vy = 1;
    var up = false;
    for (var k = 0; k < 120 && g2.balls.length; k++) { g2.step(DT); if (g2.balls[0] && g2.balls[0].vy < 0) { up = true; break; } }
    if (Math.abs(off) <= g2.paddle.w / 2) total++;
    if (Math.abs(off) <= g2.paddle.w / 2 && up) bounced++;
    if (Math.abs(off) <= g2.paddle.w / 2 && !up) console.log('    paddle miss at offset', off);
  }
  ok(bounced === total, 'paddle never tunnels at max speed (' + bounced + '/' + total + ')');

  // A ball bouncing straight up and down between a still paddle and steel gets nudged out of the loop
  var gl = new BT.Game({ id: 903, grid: ['rr........rr', '.....#......'] }, 'normal', { seed: 6 });
  gl.state = 'play';
  var bl = gl.balls[0]; bl.stuck = false; bl.serve = false;
  bl.x = gl.paddle.x = gl.paddle.targetX = 165; bl.y = 400; bl.vx = 0; bl.vy = -1;
  var escaped = false;
  for (var kl = 0; kl < 120 * 30 && gl.balls.length; kl++) {
    gl.step(DT);
    if (gl.balls[0] && Math.abs(gl.balls[0].x - 165) > 20) { escaped = true; break; }
    if (gl.balls[0] && gl.balls[0].vy > 0) gl.pointTo(gl.balls[0].x);
  }
  ok(escaped, 'steel/paddle vertical loop is broken by the no-hit nudge');

  // A fast thumb flick sweeping the paddle under a falling ball catches it
  var g3 = new BT.Game(lvl, 'normal', { seed: 4 });
  g3.state = 'play';
  g3.paddle.x = g3.paddle.targetX = 300;
  var b3 = g3.balls[0]; b3.stuck = false; b3.serve = false;
  b3.x = 80; b3.y = 560; b3.vx = 0; b3.vy = 1;
  g3.pointTo(80);
  var up3 = false;
  for (var k3 = 0; k3 < 60 && g3.balls.length; k3++) { g3.step(DT); if (g3.balls[0] && g3.balls[0].vy < 0) { up3 = true; break; } }
  ok(up3, 'paddle flicked under a falling ball bounces it');
})();

// ------------------------------------------------------------------ level data
section('Level data');
var GRID_BREAKABLE = 'roygcbpmw23TKCLGRBVOIFEYNUD';
(function () {
  ok(BT.LEVELS.length === 55, '55 levels (acts one and two)');
  ok(BT.WORLDS.length === 11 && BT.WORLDS.every(function (W) { return !W.soon; }), 'eleven worlds, none left as coming soon');
  BT.WORLDS.forEach(function (W) {
    var ls = BT.LEVELS.filter(function (L) { return L.world === W.n; });
    ok(ls.length === 5 && ls[4].boss && ls.slice(0, 4).every(function (L) { return !L.boss; }), 'world ' + W.n + ' has four levels and a boss');
  });
  ok(BT.LEVELS.filter(function (L) { return L.final; }).length === 1 && BT.levelById(55).final, 'level 55 is the final boss (the full ending)');
  ok(BT.LEVELS.filter(function (L) { return L.actEnd; }).length === 1 && BT.levelById(40).actEnd && !BT.levelById(40).final, 'level 40 ends act one (its own card, not the ending)');
  // act two: every level that grants a power leaves out the capsules that also use a tap; banners name the twist
  BT.LEVELS.filter(function (L) { return L.world >= 9; }).forEach(function (L) {
    var powers = (L.rules || []).filter(function (r) { return BT.Rules.registry[r.id].power; });
    if (powers.length) ok(L.noCapsules && L.noCapsules.indexOf('laser') >= 0 && L.noCapsules.indexOf('catch') >= 0, 'level ' + L.id + ': no Laser or Catch capsules where a tap is a power');
    var g = new BT.Game(L, 'normal', { seed: 1 }), under = 0;
    g.bricks.forEach(function (b) { if (b.alive && b.y < g.topY) under++; });
    ok(under === 0, 'level ' + L.id + ': nothing starts above the top wall (under the power strip)');
  });
  BT.LEVELS.forEach(function (L, idx) {
    ok(L.id === idx + 1, 'level ids in order (' + L.id + ')');
    ok(!!L.banner && !!L.name && !!L.twist, 'level ' + L.id + ' has name, twist and banner');
    (L.grid || []).forEach(function (row, r) {
      ok(row.length === C.grid.cols, 'level ' + L.id + ' row ' + r + ' is ' + C.grid.cols + ' wide');
      for (var i = 0; i < row.length; i++) ok(BT.Bricks.LEGEND.indexOf(row[i]) >= 0, 'level ' + L.id + ' known char ' + row[i]);
    });
    var twists = {};
    BT.LEVELS.forEach(function (o) { twists[o.twist] = (twists[o.twist] || 0) + 1; });
    ok(twists[L.twist] === 1, 'level ' + L.id + ' introduces its own twist');
    var g = new BT.Game(L, 'normal', { seed: 1 });
    var breakable = 0;
    g.bricks.forEach(function (b) { if (b.alive && (b.breakable || b.type === 'locked')) breakable++; });
    ok(breakable > 0, 'level ' + L.id + ' has at least one breakable brick');
    // Clear condition never needs steel / anchors
    g.bricks.forEach(function (b) {
      if (b.type === 'steel' || b.type === 'anchor') ok(!b.required, 'level ' + L.id + ' steel is not required');
    });
    ok(!g.isCleared(), 'level ' + L.id + ' is not cleared at start');
    // Completable when steel is ignored: every required grid brick is reachable from the open play area
    if (L.grid && L.grid.length) ok(reachable(L), 'level ' + L.id + ' every required brick reachable around steel');
  });
})();

function reachable(L) {
  var grid = L.grid, rows = grid.length, cols = C.grid.cols;
  var blast = {};
  for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) if (grid[r][c] === 'T') {
    for (var dr = -2; dr <= 2; dr++) for (var dc = -1; dc <= 1; dc++) blast[(r + dr) + ',' + (c + dc)] = true;
  }
  function passable(r, c) {
    if (r >= rows) return true;
    var ch = grid[r][c];
    if (ch === '.' || GRID_BREAKABLE.indexOf(ch) >= 0) return true;
    if (ch === '#' && blast[r + ',' + c]) return true;
    return false;
  }
  // portal links (cell of each portal centre); with no side walls the two edge columns join up
  var links = {}, wraps = (L.rules || []).some(function (ru) { return ru.id === 'wrap'; });
  (L.rules || []).forEach(function (ru) {
    if (ru.id !== 'portals') return;
    ru.pairs.forEach(function (pr) {
      var a = cellOf(pr[0]), b = cellOf(pr[1]);
      links[a] = b; links[b] = a;
    });
  });
  function cellOf(p) { return Math.floor((p.y - C.grid.top) / C.grid.cellH) + ',' + Math.floor(p.x / C.grid.cellW); }
  var maxR = rows + 12; // open area below the grid
  var seen = {}, stack = [];
  for (var c0 = 0; c0 < cols; c0++) { stack.push([maxR - 1, c0]); }
  while (stack.length) {
    var cur = stack.pop(), rr = cur[0], cc = cur[1], key = rr + ',' + cc;
    if (rr < 0 || cc < 0 || cc >= cols || rr >= maxR || seen[key]) continue;
    if (rr < rows && !passable(rr, cc)) continue;
    seen[key] = true;
    stack.push([rr + 1, cc], [rr - 1, cc], [rr, cc + 1], [rr, cc - 1]);
    if (wraps && cc === 0) stack.push([rr, cols - 1]);
    if (wraps && cc === cols - 1) stack.push([rr, 0]);
    if (links[key]) { var p = links[key].split(','); stack.push([+p[0], +p[1]]); }
  }
  for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
    var ch = grid[r2][c2];
    var required = GRID_BREAKABLE.indexOf(ch) >= 0;
    if (required && !seen[r2 + ',' + c2]) { console.log('    unreachable brick', L.id, r2, c2, ch); return false; }
  }
  return true;
}

// ------------------------------------------------------------------ bot playthrough
// clumsy: a rough stand-in for a young child - slow paddle, late reactions, poor aim.
// Act two: the bot uses the powers the way a player would (see Bot.prototype.powers), aims at what a rule says
// matters where one does (botTarget: the next number, the gate it needs), and thinks in screen terms when Flip has
// turned the field over. On levels 1-40 none of that applies and it plays exactly as before.
function Bot(g, rng, clumsy) {
  this.g = g; this.rng = rng; this.offset = 0; this.lastDir = 0; this.wait = 0.4; this.fire = 0;
  this.clumsy = !!clumsy; this.finger = g.paddle.x; this.think = 0; this.goal = g.paddle.x; this.err = 0;
  this.pw = { tapped: null, slowT: 0, sweep: 0, aimT: 0 };
}
Bot.prototype.act = function (dt) {
  var g = this.g, p = g.paddle, i, best = null, bestT = 1e9, bestTop = false;
  var top = null;
  for (i = 0; i < g.xpaddles.length; i++) if (g.xpaddles[i].counts && g.xpaddles[i].face > 0) top = g.xpaddles[i];
  for (i = 0; i < g.balls.length; i++) {
    var b = g.balls[i];
    if (b.stuck) { this.wait -= dt; if (this.wait <= 0) { g.tap(); this.wait = 0.3 + this.rng() * 0.4; } continue; }
    if (b.vy > 0) {
      var t = (p.y - b.y) / b.vy;
      if (t < bestT) { bestT = t; best = b; bestTop = false; }
    } else if (top && b.vy < 0 && b.y > top.y) {
      var t2 = (b.y - top.y) / -b.vy;
      if (t2 < bestT) { bestT = t2; best = b; bestTop = true; }
    }
  }
  var target = p.x;
  if (best) {
    var lx, ty, w = p.w;
    if (bestTop) { ty = top.y + top.h / 2 + best.r; w = top.w; } else ty = p.y - p.h / 2 - best.r;
    if (g.wrapX) lx = g.wrapPos(best.x + best.vx * (ty - best.y) / best.vy);
    else if (bestTop) lx = BT.Physics.predictLandingX(best.x, -best.y, best.vx, -best.vy, -ty, g.wallL + best.r, g.wallR - best.r);
    else lx = BT.Physics.predictLandingX(best.x, best.y, best.vx, best.vy, ty, g.wallL + best.r, g.wallR - best.r);
    var dir = bestTop ? 2 : 1;
    if (this.lastDir !== dir) this.offset = this.aimOffset(lx, w, bestTop);
    target = lx - this.offset + (this.rng() - 0.5) * 4;
    this.lastDir = dir;
  } else {
    this.lastDir = -1;
    for (i = 0; i < g.balls.length; i++) if (!g.balls[i].stuck) { target = target * 0.98 + g.balls[i].x * 0.02; break; }
  }
  if (this.clumsy) {
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.25 + this.rng() * 0.15;
      if (this.lastDir > 0 && this.rng() < 0.5) this.err = (this.rng() * 2 - 1) * p.w * 0.35;
      this.goal = target + this.err;
    }
    var maxMove = 420 * dt;
    var togo = g.wrapX ? g.wrapDelta(this.goal - this.finger) : this.goal - this.finger;
    this.finger += Math.max(-maxMove, Math.min(maxMove, togo));
    target = this.finger;
  }
  if (g.powers && g.powers.length) target = this.powers(dt, target);
  if (g.eff.flip > 0) target = C.W - target;
  if (g.viewFlip) target = C.W - target; // it thinks in field terms; the screen is upside down
  g.pointTo(target);
  if (g.eff.laser > 0) { this.fire -= dt; if (this.fire <= 0) { g.tap(); this.fire = 0.3; } }
};
// Where on the paddle to take the ball. Normally a random spot; where a rule names a target (By the Numbers),
// most of the time the spot that sends the ball at it.
Bot.prototype.aimOffset = function (lx, w, top) {
  var g = this.g, tg = null, careful = this.pw && this.pw.careful;
  for (var i = 0; i < g.rules.length && !tg; i++) if (g.rules[i].mod.botTarget) tg = g.rules[i].mod.botTarget(g, g.rules[i]);
  if (!tg && careful) { // in slow motion: aim at the nearest wanted brick it can see (nothing in the way)
    var bd = 1e9;
    for (i = 0; i < g.bricks.length; i++) {
      var k = g.bricks[i];
      if (!k.alive || !k.required || !k.solid) continue;
      var d = Math.abs(k.x + k.w / 2 - lx) + (g.paddle.y - k.y) * 0.2;
      if (d < bd && this.clearLine(lx, g.paddle.y - 14, k)) { bd = d; tg = { x: k.x + k.w / 2, y: k.y + k.h / 2 }; }
    }
  }
  if (careful) this.pw.careful = false;
  if (tg && (careful || this.rng() < 0.75) && !this.clumsy) {
    var py = g.paddle.y, a = Math.atan2(tg.x - lx, py - tg.y) / BT.Physics.DEG;
    var f = Math.max(-0.95, Math.min(0.95, a / C.ball.maxAngleDeg));
    return f * w / 2 + (this.rng() - 0.5) * 6;
  }
  return (this.rng() * 2 - 1) * w * (top ? 0.3 : 0.38);
};
Bot.prototype.clearLine = function (x0, y0, k) {
  var g = this.g, x1 = k.x + k.w / 2, y1 = k.y + k.h / 2, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5);
  for (var s = 1; s < n; s++) {
    var x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n;
    for (var j = 0; j < g.bricks.length; j++) { var o = g.bricks[j]; if (o !== k && o.alive && o.solid && x > o.x - 6 && x < o.x + o.w + 6 && y > o.y - 6 && y < o.y + o.h + 6) return false; }
  }
  return true;
};
// Powers, used the way a player would: Power Shot when the ring is bright, Slow-Mo when a ball is about to be
// missed, Safety Wall likewise, Curveball by sweeping the paddle while the ball climbs, towards what it wants to hit.
Bot.prototype.powers = function (dt, target) {
  var g = this.g, p = g.paddle, st = this.pw, i;
  var nx = BT.Rules2.nextToPaddle(g), nb = nx.b, nt = nb ? nx.t : 99, lx = nx.x;
  var reach = p.w / 2 + (this.clumsy ? 2 : 6) + (this.clumsy ? 0 : 900 * nt);
  var miss = nb && Math.abs(lx - (this.clumsy ? this.finger : target)) > p.w / 2 - 2 && nt < (this.clumsy ? 0.5 : 0.35);
  var ps = g.powerOf('powershot'), sm = g.powerOf('slowmo'), sw = g.powerOf('safetywall'), cv = g.powerOf('curve');
  if (ps && ps.s.charge >= 1 && nb && nt <= ps.s.window * (this.clumsy ? 0.9 : 0.6) && st.tapped !== nb) {
    if (!this.clumsy || this.rng() < 0.08) { st.tapped = nb; g.tap(); }
  }
  if (nb && nt > 0.8) st.tapped = null;
  if (sm) {
    if (!sm.s.on && miss && sm.s.meter >= sm.p.minStart) g.tap();
    else if (!sm.s.on && !this.clumsy && nb && nt > 0.38 && nt < 0.6 && sm.s.meter >= 0.95) { g.tap(); this.lastDir = 0; st.careful = true; } // time to line up an aimed shot
    else if (sm.s.on && (!nb || nt > 1.4) && !(ps && ps.s.charge >= 1 && nb && nt <= ps.s.window)) { st.slowT += dt; if (st.slowT > 0.4) { g.tap(); st.slowT = 0; } }
    else st.slowT = 0;
  }
  if (sw && sw.s.up <= 0 && sw.s.charges > 0) {
    for (i = 0; i < g.balls.length; i++) {
      var b = g.balls[i];
      if (b.stuck || b.vy <= 0 || b.y < 560) continue;
      var mx = this.clumsy ? this.finger : p.x;
      if (Math.abs(b.x - mx) > p.w / 2 + 4) { g.tap(); break; }
    }
  }
  if (cv && !this.clumsy) target = this.curve(cv, target);
  return target;
};
Bot.prototype.curve = function (cv, target) {
  var g = this.g, p = g.paddle, b = null, i;
  for (i = 0; i < g.balls.length; i++) if (!g.balls[i].stuck && g.balls[i].vy < 0 && g.balls[i].spin > 0.05 && g.balls[i].y < cv.p.lowY) { b = g.balls[i]; break; }
  if (!b) return target;
  // something better than straight on: the boss's hint, else the nearest wanted brick above the ball
  var want = null;
  for (i = 0; i < g.rules.length && !want; i++) if (g.rules[i].mod.botCurve) want = g.rules[i].mod.botCurve(g, g.rules[i], b);
  if (!want) {
    var bd = 1e9;
    for (i = 0; i < g.bricks.length; i++) {
      var k = g.bricks[i];
      if (!k.alive || !k.required || !k.solid || k.y > b.y - 20) continue;
      var d = Math.abs(k.x + k.w / 2 - b.x) + (b.y - k.y) * 0.3;
      if (d < bd) { bd = d; want = { x: k.x + k.w / 2, y: k.y + k.h / 2 }; }
    }
  }
  if (!want) return target;
  var tt = (b.y - want.y) / -b.vy, px = BT.Physics.predictLandingX(b.x, -b.y, b.vx, -b.vy, -want.y, g.wallL + b.r, g.wallR - b.r);
  if (Math.abs(px - want.x) < 18 || tt <= 0) return target;
  var dir = px < want.x ? 1 : -1;
  return p.x + dir * 4; // sweep the paddle that way (about 480 px/s, a steady thumb)
};
function checkBalls(g, report) {
  var minX = g.wrapX ? 0 : null, maxX = g.wrapX ? C.W : null;
  for (var i = 0; i < g.balls.length; i++) {
    var b = g.balls[i];
    if (b.stuck) continue;
    var sp = Math.hypot(b.vx, b.vy);
    if (sp > C.ball.absMaxSpeed + 1e-6) report.speed++;
    var lo = minX === null ? g.wallL + b.r : minX, hi = maxX === null ? g.wallR - b.r : maxX;
    var top = g.topOpen ? g.topY - b.r : g.topY + b.r;
    if (b.x < lo - 0.01 || b.x > hi + 0.01 || b.y < top - 0.01 || !(b.x === b.x) || !(b.y === b.y)) report.outside++;
    if (report.inside != null) {
      for (var j = 0; j < g.bricks.length; j++) {
        var k = g.bricks[j];
        if (k.alive && k.solid && BT.Physics.circleRect(b.x, b.y, b.r, k.x, k.y, k.w, k.h) > 2.5) { report.inside++; break; }
      }
    }
  }
}
function playLevel(L, preset, seed, limitSec, clumsy) {
  var rng = BT.mulberry32(seed * 7919 + 13);
  var total = 0, gameOvers = 0, steps = Math.round(limitSec / DT);
  var report = { speed: 0, outside: 0, inside: L.id > 15 ? 0 : null, rival: null, attempts: 0 };
  while (total < steps) {
    var g = new BT.Game(L, preset, { seed: seed + gameOvers * 101 });
    var bot = new Bot(g, rng, clumsy);
    while (total < steps) {
      bot.act(DT);
      g.step(DT);
      total++;
      checkBalls(g, report);
      if (g.paddle.x - g.paddle.w / 2 < g.wallL - 0.01 || g.paddle.x + g.paddle.w / 2 > g.wallR + 0.01) { if (!g.wrapX) report.outside++; }
      if (g.state === 'won') {
        if (g.boss && g.boss.id === 'rival') report.rival = { hits: g.boss.s.hits, misses: g.boss.s.misses };
        report.attempts = g.attempts;
        report.powers = powerUse(g);
        return { won: true, time: total * DT, gameOvers: gameOvers, report: report, stars: g.result.stars, lives: g.livesLost };
      }
      if (g.state === 'lost') { gameOvers++; break; }
    }
  }
  return { won: false, time: total * DT, gameOvers: gameOvers, report: report };
}
// how much the bot used each power in its winning game (shown with the times)
function powerUse(g) {
  var out = [];
  g.powers.forEach(function (r) {
    if (r.id === 'powershot') out.push('shots ' + r.s.shots);
    if (r.id === 'slowmo') out.push('slow-mos ' + r.s.uses);
    if (r.id === 'curve') out.push('curve ' + r.s.used.toFixed(1) + 's');
    if (r.id === 'safetywall') out.push('walls ' + r.s.uses + ' saved ' + r.s.saves);
  });
  return out.join(', ');
}

if (ENDLESS_ONLY) { endlessSection(); return finish(); }

section('Bot playthrough (Normal' + (QUICK ? ', quick' : '') + ')');
var LIMIT = 600; // game seconds per level, across retries
var seeds = QUICK ? [1] : [1, 2, 3];
var t0 = Date.now();
var RIVAL = { hits: 0, misses: 0 };
var ACT2_TIMES = {};
BT.LEVELS.forEach(function (L) {
  var times = [], go = 0, rep = { speed: 0, outside: 0, inside: 0 }, wins = 0, stars = [], extra = '';
  var sds = L.world >= 9 ? (QUICK ? [1, 2] : [1, 2, 3, 4, 5, 6]) : seeds; // act two: more seeds
  sds.forEach(function (sd) {
    var r = playLevel(L, 'normal', sd, LIMIT);
    if (r.won) { wins++; times.push(r.time); stars.push(r.stars); }
    if (r.won && r.report.powers && sd === 1) extra += '  (' + r.report.powers + ')';
    go += r.gameOvers; rep.speed += r.report.speed; rep.outside += r.report.outside; rep.inside += r.report.inside || 0;
    if (r.report.rival) {
      var h = r.report.rival.hits, m = r.report.rival.misses;
      RIVAL.hits += h; RIVAL.misses += m;
      extra += ' rival ' + h + '/' + (h + m);
    }
    if (L.id === 24) extra += ' tries ' + (r.report.attempts + 1);
  });
  times.sort(function (a, b) { return a - b; });
  var med = times.length ? times[(times.length - 1) >> 1] : NaN;
  if (L.world >= 9) ACT2_TIMES[L.id] = times.slice();
  console.log('  L' + (L.id < 10 ? ' ' : '') + L.id + ' ' + pad(L.name, 15) + ' cleared ' + wins + '/' + sds.length +
    '  median ' + (med === med ? med.toFixed(0) + 's' : '-') + '  game-overs ' + go + '  stars ' + stars.join(',') + '  par ' + L.par +
    (L.id > 15 ? '  times ' + times.map(function (x) { return x.toFixed(0) + 's'; }).join(' ') : '') + extra);
  ok(wins === sds.length, 'bot clears level ' + L.id + ' within ' + LIMIT + 's');
  if (L.id > 15) ok(rep.inside === 0, 'level ' + L.id + ' ball never left inside a solid brick (' + rep.inside + ')');
  ok(rep.speed === 0, 'level ' + L.id + ' ball never exceeds max speed (' + rep.speed + ')');
  ok(rep.outside === 0, 'level ' + L.id + ' ball never leaves the playfield (' + rep.outside + ')');
});

section('Bot on Easy, Worlds 1 and 4');
BT.LEVELS.filter(function (L) { return L.world === 1 || L.world === 4; }).forEach(function (L) {
  var r = playLevel(L, 'easy', 5, LIMIT);
  console.log('  L' + (L.id < 10 ? ' ' : '') + L.id + ' ' + pad(L.name, 15) + (r.won ? ' cleared in ' + r.time.toFixed(0) + 's, lives lost ' + r.lives + ', game-overs ' + r.gameOvers : ' NOT cleared'));
  ok(r.won, 'bot clears level ' + L.id + ' on Easy');
});

section('Clumsy bot (slow reactions, poor aim) on Easy, Worlds 1 and 4');
BT.LEVELS.filter(function (L) { return L.world === 1 || L.world === 4; }).forEach(function (L) {
  var res = [1, 2, 3].map(function (sd) { return playLevel(L, 'easy', sd, LIMIT, true); });
  var won = res.filter(function (r) { return r.won; }).length;
  var go = res.reduce(function (a, r) { return a + r.gameOvers; }, 0);
  console.log('  L' + (L.id < 10 ? ' ' : '') + L.id + ' ' + pad(L.name, 15) + ' cleared ' + won + '/3, game-overs ' + go + ', times ' + res.map(function (r) { return r.time.toFixed(0) + 's'; }).join(' '));
  ok(won === 3, 'clumsy bot clears level ' + L.id + ' on Easy');
});
section('Bot on Easy, Worlds 6 to 8');
BT.LEVELS.filter(function (L) { return L.world >= 6 && L.world <= 8; }).forEach(function (L) {
  var r = playLevel(L, 'easy', 5, LIMIT);
  console.log('  L' + L.id + ' ' + pad(L.name, 16) + (r.won ? ' cleared in ' + r.time.toFixed(0) + 's, lives lost ' + r.lives + ', game-overs ' + r.gameOvers : ' NOT cleared'));
  ok(r.won, 'bot clears level ' + L.id + ' on Easy');
});
section('Clumsy bot on Easy, Worlds 6 to 8 (a younger player, with persistence: game-overs allowed)');
BT.LEVELS.filter(function (L) { return L.world >= 6 && L.world <= 8; }).forEach(function (L) {
  var res = [1, 2, 3].map(function (sd) { return playLevel(L, 'easy', sd, LIMIT, true); });
  var won = res.filter(function (r) { return r.won; }).length;
  var go = res.reduce(function (a, r) { return a + r.gameOvers; }, 0);
  console.log('  L' + L.id + ' ' + pad(L.name, 16) + ' cleared ' + won + '/3, game-overs ' + go + ', times ' + res.map(function (r) { return r.time.toFixed(0) + 's'; }).join(' '));
  ok(won === 3, 'clumsy bot clears level ' + L.id + ' on Easy');
});
section('Bot on Hard, Worlds 7 and 8 (information only)');
BT.LEVELS.filter(function (L) { return L.world >= 7 && L.world <= 8; }).forEach(function (L) {
  var r = playLevel(L, 'hard', 2, LIMIT);
  console.log('  L' + L.id + ' ' + pad(L.name, 16) + (r.won ? ' cleared in ' + r.time.toFixed(0) + 's, game-overs ' + r.gameOvers : ' not cleared') + ', lives lost ' + (r.lives == null ? '-' : r.lives));
});

// ---- act two (Worlds 9-11)
section('Bot on Easy, Worlds 9 to 11');
BT.LEVELS.filter(function (L) { return L.world >= 9; }).forEach(function (L) {
  var r = playLevel(L, 'easy', 5, LIMIT);
  console.log('  L' + L.id + ' ' + pad(L.name, 16) + (r.won ? ' cleared in ' + r.time.toFixed(0) + 's, lives lost ' + r.lives + ', game-overs ' + r.gameOvers : ' NOT cleared'));
  ok(r.won, 'bot clears level ' + L.id + ' on Easy');
  ok(r.report.speed === 0 && r.report.outside === 0 && r.report.inside === 0, 'level ' + L.id + ' on Easy: ball legal ' + JSON.stringify(r.report));
});
section('Clumsy bot on Easy, Worlds 9 to 11 (a younger player, with persistence: game-overs allowed)');
BT.LEVELS.filter(function (L) { return L.world >= 9; }).forEach(function (L) {
  var res = [1, 2, 3].map(function (sd) { return playLevel(L, 'easy', sd, LIMIT, true); });
  var won = res.filter(function (r) { return r.won; }).length;
  var go = res.reduce(function (a, r) { return a + r.gameOvers; }, 0);
  console.log('  L' + L.id + ' ' + pad(L.name, 16) + ' cleared ' + won + '/3, game-overs ' + go + ', times ' + res.map(function (r) { return r.time.toFixed(0) + 's'; }).join(' '));
  ok(won === 3, 'clumsy bot clears level ' + L.id + ' on Easy');
});
section('Bot on Hard, Worlds 9 to 11 (information only)');
BT.LEVELS.filter(function (L) { return L.world >= 9; }).forEach(function (L) {
  var res = [2, 3].map(function (sd) { return playLevel(L, 'hard', sd, LIMIT); });
  console.log('  L' + L.id + ' ' + pad(L.name, 16) + res.map(function (r) { return r.won ? ' cleared in ' + r.time.toFixed(0) + 's (lives lost ' + r.lives + ', game-overs ' + r.gameOvers + ')' : ' not cleared'; }).join(','));
});
section('The bosses with and without powers (Normal; information: the powers are how you win)');
[45, 55].forEach(function (id) {
  var L = BT.levelById(id), withP = [], without = [];
  [1, 2, 3].forEach(function (sd) {
    withP.push(playLevel(L, 'normal', sd, LIMIT));
    var bare = JSON.parse(JSON.stringify(L)); bare.rules = bare.rules.filter(function (r) { return !BT.Rules.registry[r.id].power; });
    without.push(playLevel(bare, 'normal', sd, LIMIT));
  });
  function sum(list) { return list.map(function (r) { return r.won ? r.time.toFixed(0) + 's' : 'not cleared'; }).join(' '); }
  console.log('  L' + id + ' ' + pad(L.name, 16) + ' with powers: ' + sum(withP) + '   without: ' + sum(without));
});

section('Clumsy bot on Normal (information only)');
BT.LEVELS.forEach(function (L) {
  var r = playLevel(L, 'normal', 1, LIMIT, true);
  console.log('  L' + (L.id < 10 ? ' ' : '') + L.id + ' ' + pad(L.name, 15) + (r.won ? ' cleared in ' + r.time.toFixed(0) + 's' : ' not cleared') + ', game-overs ' + r.gameOvers);
});
console.log('  (bot time ' + ((Date.now() - t0) / 1000).toFixed(1) + 's real)');

function pad(s, n) { while (s.length < n) s += ' '; return s; }

// ------------------------------------------------------------------ lives and the Easy net
section('Lives, game over, Easy safety net');
(function () {
  function dropBall(g) { // launch, then park the paddle far away so the ball falls
    g.tap();
    var b = g.balls[0]; b.x = 30; b.y = 400; b.vx = 0; b.vy = 1;
    g.pointTo(C.W - 10);
    for (var i = 0; i < 120 * 4 && g.state === 'play'; i++) { g.step(DT); if (g.balls[0]) g.balls[0].x = 30; }
  }
  var L = { id: 902, grid: ['rrrrrrrrrrrr'] };
  var g = new BT.Game(L, 'normal', { seed: 5 });
  ok(g.lives === 3, 'Normal starts with 3 lives');
  dropBall(g);
  ok(g.lives === 2 && g.state === 'serve' && g.balls.length === 1 && g.balls[0].stuck, 'losing the last ball costs a life and re-serves');
  dropBall(g); dropBall(g);
  ok(g.lives === 0 && g.state === 'lost', 'game over after the last life');

  var e = new BT.Game(L, 'easy', { seed: 5 });
  ok(e.lives === 5 && e.netActive, 'Easy starts with 5 lives and the safety net');
  e.tap();
  var b = e.balls[0]; b.x = 30; b.y = 560; b.vx = 0; b.vy = 1; e.pointTo(C.W - 10);
  var saved = false;
  for (var i = 0; i < 120 && e.state === 'play'; i++) { e.step(DT); if (e.balls[0]) { e.balls[0].x = 30; if (e.balls[0].vy < 0) { saved = true; break; } } }
  ok(saved && e.lives === 5 && !e.netActive, 'the net saves the ball once');
  for (i = 0; i < 120 * 4 && e.state === 'play'; i++) { e.step(DT); if (e.balls[0]) { e.balls[0].x = 30; e.balls[0].vy = Math.abs(e.balls[0].vy); } }
  ok(e.lives === 4 && e.netActive, 'second fall costs a life and the net comes back');
  ok(new BT.Game(L, 'hard', { seed: 5 }).lives === 2, 'Hard starts with 2 lives');
})();

// ------------------------------------------------------------------ rules compose
section('Rules compose');
(function () {
  var L = {
    id: 901, grid: ['rrrrrrrrrrrr', 'cccAcccccccc'],
    rules: [{ id: 'conveyor', rows: { 0: 40 } }, { id: 'squeeze', speed: 20, grace: 0 }, { id: 'portals', pairs: [[{ x: 40, y: 400 }, { x: 320, y: 300 }]] },
      { id: 'wells', planets: [{ x: 180, y: 350, mass: 1 }] }, { id: 'gusts', firstDelay: 0.5 }, { id: 'pinball', bumpers: [{ x: 100, y: 300 }], gates: [] }]
  };
  var g = new BT.Game(L, 'normal', { seed: 3 });
  var b0 = g.bricks[0], x0 = b0.x, y0 = b0.y;
  g.tap();
  var rep = { speed: 0, outside: 0 }, movedX = false, movedY = false;
  var bot = new Bot(g, BT.mulberry32(9));
  for (var i = 0; i < 120 * 5; i++) {
    bot.act(DT); g.step(DT); checkBalls(g, rep);
    if (Math.abs(b0.x - x0) > 1) movedX = true;
    if (b0.y > y0 + 1) movedY = true;
  }
  ok(movedX && movedY, 'conveyor and squeeze both move the same brick');
  ok(rep.speed === 0 && rep.outside === 0, 'six rules together keep the ball legal');

  // phase-2 rules combined (World 6 and the Level Maker will pair them up)
  var combos = [
    { grid: ['.RRRRBBBBRR.', 'S.VVOVV....S', '..BBBBRRRR..', '....VVV.....'], rules: [{ id: 'wrap' }, { id: 'double' }, { id: 'redblue' }, { id: 'overgrown' }, { id: 'lightsout' }] },
    { grid: ['............', '............', 'rrrrrrrrrrrr', 'oooooooooooo'], rules: [{ id: 'beat' }, { id: 'conveyor', rows: { 2: 40 } }, { id: 'gusts', firstDelay: 0.5 }, { id: 'squeeze', speed: 4 }] },
    { grid: ['RRRRRRRRRRRR', 'S..........S', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............', 'gggggggggggg', 'BBBBBBBBBBBB'], rules: [{ id: 'brickfall', pieces: 4 }, { id: 'wrap' }, { id: 'redblue' }] },
    { grid: ['TTTT....TTTT'], rules: [{ id: 'bounces' }, { id: 'double' }, { id: 'wells', planets: [{ x: 180, y: 300, mass: 1 }] }] }
  ];
  combos.forEach(function (cb, ci) {
    var gc = new BT.Game({ id: 960 + ci, grid: cb.grid, rules: cb.rules, capsuleChance: 0.3 }, 'normal', { seed: 5 + ci });
    var bc = new Bot(gc, BT.mulberry32(77 + ci)), rc = { speed: 0, outside: 0, inside: 0 }, threw = null;
    try { for (var s2 = 0; s2 < 120 * 60 && gc.state !== 'won' && gc.state !== 'lost'; s2++) { bc.act(DT); gc.step(DT); checkBalls(gc, rc); } } catch (e) { threw = e; }
    ok(!threw && rc.speed === 0 && rc.outside === 0 && rc.inside === 0, 'phase-2 combo ' + (ci + 1) + ' (' + cb.rules.map(function (q) { return q.id; }).join('+') + ') runs legally' + (threw ? ': ' + threw.message : '') + ' ' + JSON.stringify(rc));
  });
})();

// ------------------------------------------------------------------ phase 2 twists
section('World 4 and 5 twists');
(function () {
  var P = BT.Physics;
  function launched(L, preset, seed) {
    var g = new BT.Game(L, preset || 'normal', { seed: seed || 1 });
    g.tap();
    var b = g.balls[0]; b.stuck = false; b.serve = false;
    return g;
  }
  function park(g, b, x, y, vx, vy) { b.x = x; b.y = y; b.prevX = x; b.prevY = y; b.vx = vx; b.vy = vy; }
  function overlapsSolid(g, b) {
    for (var i = 0; i < g.bricks.length; i++) {
      var k = g.bricks[i];
      if (k.alive && k.solid && P.circleRect(b.x, b.y, b.r, k.x, k.y, k.w, k.h) > 0.5) return k;
    }
    return null;
  }

  // Lights Out: ball, paddle and every falling capsule are always lit; glow bricks leave a lantern
  var L16 = BT.levelById(16), g = launched(L16), lo = g.rules[0];
  g.spawnCapsule(100, 300, 'long', true);
  var n = lo.mod.collectLights(g, lo), list = lo.s.list, hasBall = false, hasPaddle = false, hasCap = false;
  for (var i = 0; i < n; i++) {
    var x = list[i * 4], y = list[i * 4 + 1];
    if (Math.abs(x - g.balls[0].x) < 0.01 && Math.abs(y - g.balls[0].y) < 0.01 && list[i * 4 + 3] === 1) hasBall = true;
    if (Math.abs(x - g.paddle.x) < 0.01 && Math.abs(y - g.paddle.y) < 10 && list[i * 4 + 2] >= g.paddle.w / 2) hasPaddle = true;
    if (Math.abs(x - 100) < 0.01 && Math.abs(y - 300) < 0.01) hasCap = true;
  }
  ok(hasBall && hasPaddle && hasCap, 'Lights Out: ball, paddle and falling capsules are always lit');
  var glow = g.bricks.filter(function (b) { return b.type === 'glow'; })[0];
  g.destroyBrick(glow, 'test');
  var n2 = lo.mod.collectLights(g, lo), big = false;
  for (i = 0; i < n2; i++) if (list[i * 4 + 2] >= C.rules.lightsout.lanternLight * 0.9) big = true;
  ok(big, 'Lights Out: a broken glow brick leaves a lantern');

  // Red / Blue: a brick never turns solid on top of the ball
  var L17 = BT.levelById(17);
  g = launched(L17);
  var blue = g.bricks.filter(function (b) { return b.group === 'blue' && !b.solid; })[0];
  var sw = g.bricks.filter(function (b) { return b.type === 'switch'; })[0];
  var ball = g.balls[0];
  park(g, ball, blue.x + blue.w / 2, blue.y + blue.h / 2, 0, 0.0001);
  g.hitBrick(sw, null, 'test'); // swap: blue should be solid now
  var held = 0;
  for (i = 0; i < 30; i++) { park(g, ball, blue.x + blue.w / 2, blue.y + blue.h / 2, 30, 40); g.balls[0].boost = 1; g.step(DT); park(g, ball, blue.x + blue.w / 2, blue.y + blue.h / 2, 30, 40); if (!blue.solid && blue.pending) held++; }
  ok(held === 30, 'Red/Blue: a brick waits (pending) while the ball is inside it (' + held + '/30)');
  park(g, ball, 180, 520, 0, 300);
  g.step(DT); g.step(DT);
  ok(blue.solid && !blue.pending, 'Red/Blue: it turns solid once the ball has moved away');
  var other = g.bricks.filter(function (b) { return b.group === 'blue' && b !== blue && b.alive; })[0];
  ok(other.solid, 'Red/Blue: the switch made the other colour solid');

  // On the Beat: same rule for the pulse
  var L18 = BT.levelById(18);
  g = launched(L18);
  var beat = g.rules[0], ghostB = g.bricks.filter(function (b) { return b.beat === 1; })[0];
  ball = g.balls[0];
  var half = beat.mod.period(g, beat) / 2, stuckSolid = 0, flipped = false;
  for (i = 0; i < Math.ceil(half * 1.5 / DT); i++) {
    park(g, ball, ghostB.x + ghostB.w / 2, ghostB.y + ghostB.h / 2, 30, -40);
    g.step(DT);
    if (beat.s.active === 1) flipped = true;
    if (ghostB.solid && P.circleRect(ball.x, ball.y, ball.r, ghostB.x, ghostB.y, ghostB.w, ghostB.h) > 0.5) stuckSolid++;
  }
  ok(flipped && stuckSolid === 0 && ghostB.pending, 'On the Beat: a brick never turns solid on the ball (waits instead)');
  park(g, ball, 180, 520, 0, 300); g.step(DT); g.step(DT);
  ok(ghostB.solid, 'On the Beat: and turns solid when the ball has gone');
  // warning before it turns solid
  g = new BT.Game(L18, 'normal', { seed: 1 });
  var warned = false; beat = g.rules[0];
  for (i = 0; i < Math.ceil(half / DT) - 2; i++) { g.step(DT); }
  g.bricks.forEach(function (b) { if (b.beat === 1 && b.warn > 0.5) warned = true; });
  ok(warned, 'On the Beat: bricks about to turn solid show a warning first');

  // Overgrown: regrowth is slow, never onto a ball, and killing a root withers its vines
  var L19 = BT.levelById(19);
  g = launched(L19);
  var og = g.rules[0], vines0 = g.bricks.filter(function (b) { return b.alive && b.type === 'vine'; }).length;
  ball = g.balls[0];
  for (i = 0; i < 120 * 30; i++) { park(g, ball, 180, 560, 0, -300); g.step(DT); }
  var vines1 = g.bricks.filter(function (b) { return b.alive && b.type === 'vine'; }).length;
  var maxGrow = og.s.roots.length * Math.ceil(30 / C.rules.overgrown.growEvery);
  ok(vines1 > vines0 && vines1 - vines0 <= maxGrow, 'Overgrown: vines regrow, at most one per root every ' + C.rules.overgrown.growEvery + 's (' + vines0 + ' -> ' + vines1 + ')');
  g = launched(L19); og = g.rules[0]; ball = g.balls[0];
  g.sinceLaunch = 2; og.s.timer = 0.001;
  park(g, ball, 180, 560, 0, -300);
  g.step(DT);
  var sp = og.s.sprouts[0], gr = C.grid;
  var sx = sp.col * gr.cellW + 15, sy = gr.top + sp.row * gr.cellH + 8, grewOnBall = false;
  for (i = 0; i < 120 * 3; i++) {
    park(g, ball, sx, sy, 40, 40); g.step(DT); park(g, ball, sx, sy, 40, 40);
    if (overlapsSolid(g, ball)) grewOnBall = true;
  }
  ok(!grewOnBall && og.s.sprouts.length > 0, 'Overgrown: a shoot never grows into a vine on top of the ball');
  park(g, ball, 180, 560, 0, -300);
  for (i = 0; i < 10; i++) g.step(DT);
  ok(og.s.sprouts.indexOf(sp) < 0, 'Overgrown: it grows once the ball has gone');
  var root = og.s.roots[0], mine = g.bricks.filter(function (b) { return b.alive && b.type === 'vine' && b.root === root; }).length;
  g.destroyBrick(root, 'test');
  for (i = 0; i < 120 * 2; i++) { park(g, ball, 180, 560, 0, -300); g.step(DT); }
  var left = g.bricks.filter(function (b) { return b.alive && b.type === 'vine' && b.root === root; }).length;
  ok(mine > 0 && left === 0, 'Overgrown: killing a root withers all ' + mine + ' of its vines');

  // Lighthouse: only bricks in the beam are solid, and the beam never solidifies a brick on the ball
  var L20 = BT.levelById(20);
  g = launched(L20); ball = g.balls[0];
  var lh = g.boss, solidN = 0, ghostN = 0;
  g.step(DT);
  var wrongLit = 0, half20 = C.bosses.lighthouse.beamHalfDeg * P.DEG;
  lh.s.ring.forEach(function (b) {
    var inBeam = lh.mod.beamDist(lh, b.ang) <= half20 + b.angHalf;
    if (b.solid) solidN++; else ghostN++;
    if (b.solid !== inBeam) wrongLit++;
  });
  ok(solidN > 0 && ghostN > 0 && wrongLit === 0, 'Lighthouse: bricks are solid exactly when inside the beam (' + solidN + ' solid, ' + ghostN + ' ghost)');
  var bad = 0;
  for (i = 0; i < 120 * 12; i++) {
    var tgt = lh.s.ring[(i / 120 | 0) % lh.s.ring.length];
    park(g, ball, tgt.x + tgt.w / 2, tgt.y + tgt.h / 2, 30, 40);
    g.step(DT);
    if (tgt.solid && P.circleRect(ball.x, ball.y, ball.r, tgt.x, tgt.y, tgt.w, tgt.h) > 0.5) bad++;
    park(g, ball, tgt.x + tgt.w / 2, tgt.y + tgt.h / 2, 30, 40);
  }
  ok(bad === 0, 'Lighthouse: the beam never makes a brick solid on top of the ball');

  // Double Trouble: the top is an exit (costs a life on Normal); Easy has a top safety net too
  var L21 = BT.levelById(21);
  g = launched(L21); ball = g.balls[0];
  g.xpaddles[0].off = true;
  park(g, ball, 30, 200, 0, -400);
  for (i = 0; i < 120 && g.state === 'play'; i++) { g.step(DT); if (g.balls[0]) g.balls[0].x = 30; }
  ok(g.lives === 2 && g.state === 'serve', 'Double Trouble: a ball out of the top costs a life');
  g = launched(L21, 'easy'); ball = g.balls[0];
  g.xpaddles[0].off = true;
  park(g, ball, 30, 200, 0, -300);
  var savedTop = false;
  for (i = 0; i < 120 && g.state === 'play'; i++) { g.step(DT); if (g.balls[0]) { g.balls[0].x = 30; if (g.balls[0].vy > 0) { savedTop = true; break; } } }
  ok(savedTop && g.lives === 5, 'Double Trouble: on Easy a top net saves the ball once');
  g = launched(L21); ball = g.balls[0];
  var q = g.xpaddles[0];
  g.pointTo(120); for (i = 0; i < 30; i++) g.step(DT);
  park(g, ball, q.x + 10, 150, 0, -350);
  var bounced = false;
  for (i = 0; i < 120 && g.balls.length; i++) { g.step(DT); if (g.balls[0].vy > 0) { bounced = true; break; } }
  ok(bounced && Math.abs(q.x - g.paddle.x) <= C.rules.double.assist + 0.5, 'Double Trouble: the top paddle follows yours and bats the ball back down');

  // Wraparound: ball and paddle wrap; a brick across the seam is hit by the ball's other half
  var L22 = BT.levelById(22);
  g = launched(L22); ball = g.balls[0];
  park(g, ball, 4, 450, -300, -60);
  for (i = 0; i < 4; i++) g.step(DT);
  ok(g.balls[0].x > C.W - 10 && g.balls[0].vx < 0, 'Wraparound: the ball leaves the left edge and appears on the right');
  g.dragBy(-200); for (i = 0; i < 20; i++) g.step(DT);
  ok(g.paddle.x > C.W / 2 && g.paddle.x < C.W, 'Wraparound: dragging off the left edge brings the paddle in from the right (' + g.paddle.x.toFixed(0) + ')');
  var g2 = new BT.Game({ id: 950, grid: [], rules: [{ id: 'wrap' }] }, 'normal', { seed: 1 });
  g2.tap(); var wb = g2.balls[0];
  var seamBrick = g2.addBrick(BT.Bricks.fromChar('r', C.W - 29, 300, 28, 14)); g2.finalizeBricks();
  park(g2, wb, 3, 330, 0, -300);
  for (i = 0; i < 30; i++) g2.step(DT);
  ok(!seamBrick.alive, 'Wraparound: a ball straddling the edge hits a brick on the other side');
  var wr = { speed: 0, outside: 0 };
  var g3 = launched(L22, 'normal', 4), bot3 = new Bot(g3, BT.mulberry32(4));
  for (i = 0; i < 120 * 60; i++) { bot3.act(DT); g3.step(DT); checkBalls(g3, wr); }
  ok(wr.outside === 0 && wr.speed === 0, 'Wraparound: ball stays within the wrapped field');

  // Brickfall: pieces are telegraphed, never move into the ball, and the stack never has holes
  var L23 = BT.levelById(23);
  g = launched(L23); var bf = g.rules[0];
  var sawNext = 0, spawned = 0, prevLeft = bf.s.left, holes = 0, crush = 0, warnOk = true, nextSince = 0;
  var bot = new Bot(g, BT.mulberry32(23));
  for (i = 0; i < 120 * 90 && g.state !== 'won'; i++) {
    bot.act(DT);
    var nextBefore = bf.s.next;
    g.step(DT);
    if (bf.s.next === nextBefore && g.state === 'play') nextSince += DT;
    if (bf.s.left < prevLeft) { spawned++; if (nextSince < C.rules.brickfall.telegraph * 0.9) warnOk = false; nextSince = 0; prevLeft = bf.s.left; }
    if (i % 30 === 0) { // every column is a solid run resting on the floor
      for (var c = 0; c < C.grid.cols; c++) {
        var col = bf.s.cols[c].filter(function (b) { return b.alive && !b.piece; }).sort(function (a, b) { return b.sy - a.sy; });
        var expect = bf.s.floorY - C.grid.cellH;
        for (var k = 0; k < col.length; k++) { if (col[k].sy < expect - C.grid.cellH * 0.5 && k === 0) holes += 0; expect = col[k].sy - C.grid.cellH; }
      }
    }
    for (var bi = 0; bi < g.balls.length; bi++) if (overlapsSolid(g, g.balls[bi])) crush++;
  }
  ok(spawned >= 3 && warnOk, 'Brickfall: each piece is shown for at least ' + C.rules.brickfall.telegraph + 's before it drops (' + spawned + ' pieces)');
  ok(crush === 0, 'Brickfall: falling and settling bricks never move into the ball (' + crush + ')');
  // forced: a piece falling straight onto a ball parked under it waits
  g = launched(L23); bf = g.rules[0]; ball = g.balls[0];
  bf.s.timer = 0.001; g.step(DT);
  var pc = bf.s.pieces[0], low = pc.bricks.reduce(function (a, b) { return b.sy > a.sy ? b : a; });
  for (i = 0; i < 120 * 3; i++) { park(g, ball, low.x + 14, low.y + 30, 50, 50); g.step(DT); }
  var gap = (ball.y - ball.r) - (low.y + low.h);
  ok(gap > 0 && pc.bricks.every(function (b) { return b.piece === pc; }), 'Brickfall: a piece stops above a ball in its way (gap ' + gap.toFixed(1) + 'px)');
  park(g, ball, 180, 560, 0, -300);
  // stack: no holes after lots of play
  g = launched(L23, 'normal', 7); bf = g.rules[0]; bot = new Bot(g, BT.mulberry32(7));
  for (i = 0; i < 120 * 70 && g.state === 'play'; i++) { bot.act(DT); g.step(DT); }
  for (i = 0; i < 120; i++) g.step(DT); // let everything settle
  bf.mod.rebuildCols(g, bf);
  for (c = 0; c < C.grid.cols; c++) {
    var support = bf.s.floorY;
    bf.s.cols[c].forEach(function (b) { if (!b.piece) { if (Math.abs(b.sy - (support - C.grid.cellH)) > 0.5) holes++; support = b.sy; } else support = b.sy; });
  }
  ok(holes === 0, 'Brickfall: settled stack has no holes or overhangs (' + holes + ')');
  ok(!new BT.Game(L23, 'normal', { seed: 1 }).isCleared(), 'Brickfall: not cleared while pieces are still to come');

  // Twelve Bounces: a miss restarts the puzzle with no life lost; 12 bounces then the paddle switches off
  var L24 = BT.levelById(24);
  g = launched(L24); ball = g.balls[0];
  var req0 = g.requiredLeft();
  g.bricks.filter(function (b) { return b.type === 'normal'; }).slice(0, 5).forEach(function (b) { g.destroyBrick(b, 'test'); });
  g.pointTo(330);
  park(g, ball, 30, 500, 0, 300);
  for (i = 0; i < 120 * 2 && g.attempts === 0; i++) { g.step(DT); if (g.balls[0]) g.balls[0].x = 30; }
  ok(g.attempts === 1 && g.lives === C.presets.normal.lives && g.livesLost === 0 && g.requiredLeft() === req0 && g.state === 'serve',
    'Twelve Bounces: a miss restarts the puzzle in under a second, bricks back, no life lost');
  var bnc = g.rules[0];
  g.tap();
  for (i = 0; i < 12; i++) g.paddleBounce(g.balls[0]);
  ok(bnc.s.left === 0 && g.paddle.off, 'Twelve Bounces: after 12 bounces the paddle switches off');
  // solvable with bounces to spare: a greedy search over where on the paddle each bounce lands
  var sol = solveBounces(L24);
  console.log('    greedy solver clears Twelve Bounces in ' + sol + ' bounces');
  ok(sol > 0 && sol <= 8, 'Twelve Bounces: solvable with bounces to spare (' + sol + ' of 12)');

  // The Rival: it returns some shots and misses others (beatable, not perfect)
  ok(RIVAL.hits > 0 && RIVAL.misses > 0 && RIVAL.hits / (RIVAL.hits + RIVAL.misses) < 0.75,
    'The Rival: bats back ' + RIVAL.hits + ' of ' + (RIVAL.hits + RIVAL.misses) + ' shots in the bot runs (not perfect)');
})();

// ------------------------------------------------------------------ phase 3 twists
section('World 6, 7 and 8 twists');
(function () {
  var P = BT.Physics, i, k;
  function launched(L, preset, seed) {
    var g = new BT.Game(L, preset || 'normal', { seed: seed || 1 });
    g.tap();
    var b = g.balls[0]; b.stuck = false; b.serve = false;
    return g;
  }
  function park(b, x, y, vx, vy) { b.x = x; b.y = y; b.prevX = x; b.prevY = y; b.vx = vx; b.vy = vy; }
  function ruleOf(g, id) { for (var q = 0; q < g.rules.length; q++) if (g.rules[q].id === id) return g.rules[q]; return null; }

  // ---- World 6: each mash-up really uses both rules together
  var g = launched(BT.levelById(26)), po = ruleOf(g, 'portals'), x0 = po.s.pos[1].x;
  for (i = 0; i < 120; i++) g.step(DT);
  var x1 = po.s.pos[1].x, ball = g.balls[0];
  park(ball, 52, 420, 0, -300); ball.portalLock = -1;
  for (i = 0; i < 30 && Math.abs(ball.y - 136) > 1; i++) g.step(DT);
  ok(ruleOf(g, 'conveyor') && Math.abs(x1 - x0) > 20 && Math.abs(ball.x - po.s.pos[1].x) < 8 && ball.y < 150,
    'Express Delivery: the top portal rides the belt and the ball comes out wherever it has got to (' + x0.toFixed(0) + ' -> ' + x1.toFixed(0) + ')');
  g = launched(BT.levelById(27));
  var lo = ruleOf(g, 'lightsout'), orb = ruleOf(g, 'orbit'), core = orb.s.core, n = lo.mod.collectLights(g, lo), litCore = false;
  for (i = 0; i < n; i++) if (Math.abs(lo.s.list[i * 4] - (core.x + core.w / 2)) < 0.5 && Math.abs(lo.s.list[i * 4 + 1] - (core.y + core.h / 2)) < 0.5) litCore = true;
  var glow = g.bricks.filter(function (b) { return b.type === 'glow' && b.orbit; })[0], gx0 = glow.x;
  for (i = 0; i < 60; i++) g.step(DT);
  ok(litCore && Math.abs(glow.x - gx0) > 2, 'Night Sky: the core always glows in the dark and the glow bricks ride round with the rings');
  g = launched(BT.levelById(28));
  var wl = ruleOf(g, 'wells'), acc = { ax: 0, ay: 0 };
  wl.mod.accel(g, wl, 352, 330, acc);
  ok(g.wrapX && acc.ax > 0, 'Slingshot: a planet near the left edge pulls a ball on the far right across the edge (ax ' + acc.ax.toFixed(0) + ')');
  g = launched(BT.levelById(29));
  var sq = ruleOf(g, 'squeeze'), rb = ruleOf(g, 'redblue');
  g.sinceLaunch = 10;
  var ghostB = g.bricks.filter(function (b) { return b.group && !b.solid; })[0], gy0 = ghostB.y;
  ball = g.balls[0];
  for (i = 0; i < 120 * 3; i++) { park(ball, 180, 520, 0, -300); g.step(DT); }
  var anchor = g.bricks.filter(function (b) { return b.type === 'anchor'; })[0], off0 = sq.s.offset, gy1 = ghostB.y;
  g.hitBrick(anchor, null, 'test'); for (i = 0; i < 60; i++) { park(ball, 180, 520, 0, -300); g.step(DT); }
  ok(gy1 > gy0 + 5 && ghostB.y < gy1 - 5 && sq.s.offset < off0 && rb.s.solid === 'red', 'Pressure Switch: see-through bricks come down with the wall too, and the arrow bricks still shove it up');
  // the shield row hides two of the four arrow bricks from below at any time; swapping colours opens the others
  var shieldRow = anchor.row + 1, shield = g.bricks.filter(function (b) { return b.row === shieldRow && b.group; });
  function openUnder(a) { return shield.filter(function (b) { return b.col === a.col; }).every(function (b) { return !b.solid; }); }
  var anchors = g.bricks.filter(function (b) { return b.type === 'anchor'; }), before = anchors.map(openUnder);
  rb.mod.swap(g, rb, 180, 300); for (i = 0; i < 10; i++) { park(ball, 180, 520, 0, -300); g.step(DT); }
  var after = anchors.map(openUnder);
  ok(before.filter(Boolean).length >= 1 && after.filter(Boolean).length >= 1 && before.every(function (v, j) { return v !== after[j]; }),
    'Pressure Switch: swapping colours changes which arrow bricks can be reached');

  // ---- The Twins: only the awake one can be hurt; knock one out, then the other before it gets back up
  g = launched(BT.levelById(30)); var tw = g.boss;
  var sleeper = 1 - tw.s.awake, hp0 = tw.s.cores[sleeper].hp;
  tw.mod.hit(g, tw, sleeper);
  ok(tw.s.cores[sleeper].hp === hp0, 'The Twins: a sleeping twin is not hurt');
  var a = tw.s.awake;
  for (i = 0; i < 20; i++) { tw.s.cores[a].cd = 0; tw.mod.hit(g, tw, a); }
  ok(tw.s.cores[a].down && tw.mod.vulnerable(tw, 1 - a) && !tw.s.defeated, 'The Twins: knocking one out wakes the other up for good');
  for (i = 0; i < Math.ceil((tw.mod.reviveTime(g, tw) + 0.5) / DT); i++) { park(g.balls[0], 180, 520, 0, -300); g.step(DT); }
  ok(!tw.s.cores[a].down && tw.s.cores[a].hp > 0 && !tw.s.defeated, 'The Twins: if the other is not beaten in time, the first one gets back up');
  g = launched(BT.levelById(30)); tw = g.boss; a = tw.s.awake;
  for (i = 0; i < 20; i++) { tw.s.cores[a].cd = 0; tw.mod.hit(g, tw, a); }
  for (i = 0; i < 20; i++) { tw.s.cores[1 - a].cd = 0; tw.mod.hit(g, tw, 1 - a); }
  ok(tw.s.defeated, 'The Twins: both knocked out together beats them');
  g = launched(BT.levelById(30)); tw = g.boss;
  var swaps = 0, warned = false, prevAwake = tw.s.awake;
  for (i = 0; i < 120 * 20; i++) { park(g.balls[0], 180, 520, 0, -300); g.step(DT); if (tw.s.swapT < C.bosses.twins.warn) warned = true; if (tw.s.awake !== prevAwake) { swaps++; prevAwake = tw.s.awake; } }
  ok(swaps >= 2 && warned, 'The Twins: they take turns being awake, with a warning before each swap (' + swaps + ' swaps in 20s)');

  // ---- Ice Rink: the paddle slides past and comes back; milder on Easy; frozen bricks thaw, then break
  function overshoot(preset) {
    var gi = new BT.Game(BT.levelById(31), preset, { seed: 1 }), pd = gi.paddle, start = pd.x, maxX = 0, settled = -1;
    gi.pointTo(start + 100);
    for (var s2 = 0; s2 < 120 * 3; s2++) { gi.step(DT); maxX = Math.max(maxX, pd.x - start); if (settled < 0 && s2 > 30 && Math.abs(pd.x - start - 100) < 1 && Math.abs(pd.iv) < 10) settled = s2 * DT; }
    return { over: maxX - 100, settled: settled };
  }
  var oN = overshoot('normal'), oE = overshoot('easy');
  ok(oN.over > 8 && oN.over < 45 && oN.settled > 0 && oN.settled < 2.2, 'Ice Rink: the paddle slides ' + oN.over.toFixed(0) + 'px past where you stop and settles in ' + oN.settled.toFixed(2) + 's');
  ok(oE.over < oN.over * 0.6 && oE.settled > 0, 'Ice Rink: much milder on Easy (' + oE.over.toFixed(0) + 'px past)');
  g = launched(BT.levelById(31));
  var ice = g.bricks.filter(function (b) { return b.type === 'ice'; })[0];
  g.hitBrick(ice, g.balls[0], 'ball'); var thawed = ice.alive && ice.hp === 1;
  g.hitBrick(ice, g.balls[0], 'ball');
  ok(thawed && !ice.alive, 'Ice Rink: a frozen brick thaws on the first hit and breaks on the second');
  var p2 = new BT.Game(BT.levelById(1), 'normal', { seed: 1 }).paddle, iceP = new BT.Game(BT.levelById(31), 'normal', { seed: 1 });
  ok(iceP.paddleIce && !new BT.Game(BT.levelById(1), 'normal', { seed: 1 }).paddleIce && p2.iv === 0, 'Ice Rink: the slide is switched on only by the ice rule');

  // ---- High Tide: a fixed, smooth cycle between low and high; slower under water, both ways
  g = launched(BT.levelById(32)); var td = ruleOf(g, 'tide'), tp = td.p;
  var lvMin = 1e9, lvMax = -1e9, jump = 0, prev = td.s.level, startLow = Math.abs(td.s.level - tp.low) < 0.5;
  ball = g.balls[0];
  for (i = 0; i < Math.ceil(tp.period * 1.5 / DT); i++) {
    park(ball, 180, 200, 0, -300); g.step(DT);
    lvMin = Math.min(lvMin, td.s.level); lvMax = Math.max(lvMax, td.s.level);
    jump = Math.max(jump, Math.abs(td.s.level - prev)); prev = td.s.level;
  }
  ok(startLow && Math.abs(lvMin - tp.high) < 1 && Math.abs(lvMax - tp.low) < 1 && jump < 1, 'High Tide: starts at low tide, rises to the high-tide mark and falls again smoothly (max ' + jump.toFixed(2) + 'px a step)');
  ok(Math.abs(td.mod.levelAt(td, 3.7) - td.mod.levelAt(td, 3.7 + tp.period)) < 1e-9, 'High Tide: the cycle repeats exactly (predictable)');
  g = launched(BT.levelById(32)); td = ruleOf(g, 'tide'); td.s.t = tp.period / 2; ball = g.balls[0];
  park(ball, 180, 500, 0, -300); for (i = 0; i < 60; i++) { g.step(DT); if (ball.y < 420) park(ball, 180, 500, 30, -300); }
  var spWet = Math.hypot(ball.vx, ball.vy);
  park(ball, 180, 200, 30, -300); for (i = 0; i < 60; i++) { g.step(DT); if (ball.y < 120) park(ball, 180, 200, 30, -300); }
  var spDry = Math.hypot(ball.vx, ball.vy);
  ok(spWet < spDry * 0.7 && g.paddle.speedCap > 0 && g.paddle.speedCap < C.paddle.maxSpeed, 'High Tide: under water the ball (' + spWet.toFixed(0) + ' vs ' + spDry.toFixed(0) + ' px/s) and the paddle (' + g.paddle.speedCap.toFixed(0) + ' px/s) are slower');

  // ---- Red Hot: heats with a combo, burns straight through bricks, never through steel, cools on the paddle
  var hotL = { id: 970, grid: ['............', '............', '.rrrrrrrrrr.', '.rrrrrrrrrr.', '.rrrrrrrrrr.', '............', '############'], rules: [{ id: 'redhot' }] };
  g = launched(hotL); ball = g.balls[0]; var rh = ruleOf(g, 'redhot');
  var bricks3 = g.bricks.filter(function (b) { return b.type === 'normal'; }).slice(0, rh.s.hotAt);
  bricks3.forEach(function (b) { g.hitBrick(b, ball, 'ball'); });
  ok(ball.hot && ball.pierce === C.rules.redhot.burns, 'Red Hot: ' + rh.s.hotAt + ' bricks without touching the paddle make the ball red hot');
  park(ball, 180, 152, 0, -300); // under the bricks, above the steel floor
  var burned = 0, left0 = g.requiredLeft();
  for (i = 0; i < 120 && ball.vy < 0; i++) g.step(DT);
  burned = left0 - g.requiredLeft();
  ok(burned === C.rules.redhot.burns + 1 && !ball.hot && ball.vy > 0, 'Red Hot: it burns straight through ' + C.rules.redhot.burns + ' bricks without bouncing, fizzles out, and the next brick bounces it (' + burned + ' broken)');
  g = launched(hotL); ball = g.balls[0]; ball.hot = true; ball.heat = 5; ball.pierce = 3;
  park(ball, 180, 151, 0, 300);
  var bounced = false;
  for (i = 0; i < 60; i++) { g.step(DT); if (ball.vy < 0) { bounced = true; break; } }
  ok(bounced && ball.y < 162 && ball.pierce === 3, 'Red Hot: a red-hot ball still bounces off steel');
  g.paddleBounce(ball);
  ok(!ball.hot && ball.pierce === 0 && !ball.heat, 'Red Hot: the paddle cools it');

  // ---- Thunderstorm: every strike is shown first; a frozen paddle is brief; Easy never loses a ball to it
  g = launched(BT.levelById(34)); var th = ruleOf(g, 'thunder'), bot = new Bot(g, BT.mulberry32(34));
  var warnT = 0, strikes = 0, okWarn = true, frozenMax = 0, fr = 0, lastPhase = th.s.phase;
  for (i = 0; i < 120 * 90 && g.state !== 'won' && g.state !== 'lost'; i++) {
    bot.act(DT); g.step(DT);
    if (th.s.phase === 'warn') warnT += DT;
    if (lastPhase === 'warn' && th.s.phase === 'calm' && th.s.flash > 0) { strikes++; if (warnT < C.rules.thunder.telegraph - 0.02) okWarn = false; }
    if (th.s.phase !== 'warn') warnT = 0;
    lastPhase = th.s.phase;
    if (g.paddle.frozen > 0) fr += DT; else { frozenMax = Math.max(frozenMax, fr); fr = 0; }
  }
  ok(strikes >= 5 && okWarn, 'Thunderstorm: every strike is telegraphed for ' + C.rules.thunder.telegraph + 's first (' + strikes + ' strikes)');
  ok(frozenMax <= C.rules.thunder.freeze + 0.05, 'Thunderstorm: a zapped paddle is frozen at most ' + frozenMax.toFixed(2) + 's');
  // Easy: the paddle is zapped while the ball falls on the far side; it still gets there
  var saved = 0, tries = 0;
  for (var side = 0; side < 6; side++) {
    g = launched(BT.levelById(34), 'easy', side + 1); th = ruleOf(g, 'thunder'); ball = g.balls[0];
    g.netActive = false; // no safety net: the thaw alone must save it
    var px = side % 2 ? 60 : 300; g.paddle.x = g.paddle.targetX = px;
    park(ball, C.W - px, 330, 0, 260);
    th.mod.strike(g, th, px);
    var caught = false;
    for (i = 0; i < 120 * 3 && g.state === 'play'; i++) {
      var bb = g.balls[0];
      if (bb) g.pointTo(P.predictLandingX(bb.x, bb.y, bb.vx, bb.vy, g.paddle.y - 12, bb.r, C.W - bb.r));
      g.step(DT);
      if (g.balls[0] && g.balls[0].vy < 0 && g.balls[0].y > 500) { caught = true; break; }
    }
    tries++; if (caught && g.livesLost === 0) saved++;
  }
  ok(saved === tries, 'Thunderstorm: on Easy a zapped paddle thaws in time to reach the ball (' + saved + '/' + tries + ')');

  // ---- Storm Cloud: only hurt just after its flash; its drops shrink the paddle
  g = launched(BT.levelById(35)); var sc = g.boss; var hpS = sc.s.hp;
  sc.s.mode = 'rain'; sc.s.hitCd = 0; sc.mod.hit(g, sc);
  sc.s.mode = 'charge'; sc.s.hitCd = 0; sc.mod.hit(g, sc);
  var noHurt = sc.s.hp === hpS;
  sc.s.mode = 'open'; sc.s.hitCd = 0; sc.mod.hit(g, sc);
  ok(noHurt && sc.s.hp === hpS - 1, 'The Storm Cloud: can only be hurt while it is open after the flash');
  g = launched(BT.levelById(35)); sc = g.boss;
  var seq = [], last = sc.s.mode;
  for (i = 0; i < 120 * 30; i++) { park(g.balls[0], 20, 520, 0, -300); g.step(DT); if (sc.s.mode !== last) { seq.push(sc.s.mode); last = sc.s.mode; } }
  ok(seq.join(',').indexOf('charge,open,rain') >= 0 && seq.every(function (m, j) { return m !== 'open' || seq[j - 1] === 'charge'; }), 'The Storm Cloud: it always charges (the tell) before it opens (' + seq.slice(0, 6).join(' > ') + ')');
  var drop = sc.s.drops[0]; drop.alive = true; drop.x = g.paddle.x; drop.y = g.paddle.y - 20;
  for (i = 0; i < 60; i++) g.step(DT);
  ok(g.eff.shrink > 0, 'The Storm Cloud: a drop on the paddle shrinks it for a while');

  // ---- Runaways: they run, but never off the field, into each other, into steel or into the ball, and they tire
  g = launched(BT.levelById(36)); bot = new Bot(g, BT.mulberry32(36));
  var bad = { out: 0, overlap: 0, onBall: 0 }, moved = 0, rw = ruleOf(g, 'runaway');
  var startPos = g.bricks.filter(function (b) { return b.runner; }).map(function (b) { return b.x + ',' + b.y; });
  for (i = 0; i < 120 * 120 && g.state === 'play' || i < 2; i++) {
    bot.act(DT); g.step(DT);
    var rs = g.bricks.filter(function (b) { return b.alive && b.runner; });
    for (var j = 0; j < rs.length; j++) {
      var r1 = rs[j];
      if (r1.x < g.wallL || r1.x + r1.w > g.wallR || r1.y < C.TOP || r1.y + r1.h > rw.p.maxY + 0.01) bad.out++;
      if (g.rectBlocked(r1.x, r1.y, r1.w, r1.h, r1, -0.01)) bad.overlap++;
      for (k = 0; k < g.balls.length; k++) if (P.circleRect(g.balls[k].x, g.balls[k].y, g.balls[k].r, r1.x, r1.y, r1.w, r1.h) > 2.5) bad.onBall++;
    }
  }
  g.bricks.forEach(function (b) { if (b.runner && startPos.indexOf(b.x + ',' + b.y) < 0) moved++; });
  ok(moved > 0 && bad.out === 0 && bad.overlap === 0 && bad.onBall === 0, 'Runaways: bricks run, but never leave the field, overlap each other or steel, or move into the ball ' + JSON.stringify(bad));
  g = launched(BT.levelById(36)); rw = ruleOf(g, 'runaway'); ball = g.balls[0];
  var target = g.bricks.filter(function (b) { return b.runner; })[0], tx0 = target.x, ty0 = target.y;
  for (i = 0; i < 120 * 60; i++) { park(ball, target.x + target.w / 2 + 30, target.y + target.h / 2 + 30, 1, 1); g.step(DT); }
  var still = target.x, stillY = target.y;
  for (i = 0; i < 120; i++) { park(ball, target.x + target.w / 2 + 30, target.y + target.h / 2 + 30, 1, 1); g.step(DT); }
  ok((tx0 !== target.x || ty0 !== target.y) && target.stamina <= 0 && still === target.x && stillY === target.y, 'Runaways: a brick runs from a ball, then tires and stops (it cannot run for ever)');
  g = launched(BT.levelById(36)); rw = ruleOf(g, 'runaway'); rw.s.idle = rw.p.giveUpAfter + 1; g.step(DT);
  ok(g.bricks.filter(function (b) { return b.runner && b.alive; }).every(function (b) { return b.stamina <= 0; }), 'Runaways: if nothing is caught for ' + rw.p.giveUpAfter + 's they all give up');

  // ---- Big and Small: big serve ball, a splitter makes small fast balls, the last small ball grows back
  g = new BT.Game(BT.levelById(37), 'normal', { seed: 1 }); ball = g.balls[0];
  ok(ball.r === C.rules.bigsmall.bigR && ball.sizeMul < 1 && ball.pierce > 0, 'Big and Small: the ball starts big and slow');
  g.tap(); ball = g.balls[0];
  var spl = g.bricks.filter(function (b) { return b.type === 'splitter'; })[0];
  park(ball, spl.x + spl.w / 2, spl.y + spl.h + 30, 0, -200);
  for (i = 0; i < 60 && g.balls.length < 2; i++) g.step(DT);
  var smalls = g.balls.filter(function (b) { return b.kind === 'small'; });
  ok(g.balls.length === C.rules.bigsmall.split && smalls.length === g.balls.length && smalls.every(function (b) { return b.r < 6 && Math.hypot(b.vx, b.vy) <= C.ball.absMaxSpeed; }),
    'Big and Small: hitting a splitter breaks it into ' + g.balls.length + ' small fast balls');
  ok(Math.hypot(smalls[0].vx, smalls[0].vy) > g.speed() * 1.1, 'Big and Small: the small balls are faster than a normal ball');
  g.balls.length = 1; ball = g.balls[0]; g.paddleBounce(ball);
  ok(ball.kind === 'big' && ball.r === C.rules.bigsmall.bigR && ball.y + ball.r <= g.paddle.y - g.paddle.h / 2 + 0.01, 'Big and Small: the last small ball grows big again on the paddle');
  g = launched(BT.levelById(37)); ball = g.balls[0];
  var arm = g.bricks.filter(function (b) { return b.maxHp > 1; })[0];
  park(ball, arm.x + arm.w / 2, arm.y + arm.h + 40, 0, -200);
  for (i = 0; i < 60 && ball.vy < 0; i++) g.step(DT);
  ok(arm.alive && ball.vy > 0, 'Big and Small: armour stops the big ball (it bounces off)');

  // ---- Closing Walls: they come in, stop short of the bricks, keep ball and paddle inside; pushers shove them back
  g = launched(BT.levelById(38)); var wa = ruleOf(g, 'walls'); bot = new Bot(g, BT.mulberry32(38));
  var minGap = 1e9, inMax = 0, outside = 0;
  for (i = 0; i < 120 * 100 && g.state !== 'won' && g.state !== 'lost'; i++) {
    bot.act(DT); g.step(DT);
    inMax = Math.max(inMax, g.wallL);
    g.bricks.forEach(function (b) { if (b.alive && b.solid) minGap = Math.min(minGap, b.x - g.wallL, g.wallR - b.x - b.w); });
    if (g.paddle.x - g.paddle.w / 2 < g.wallL - 0.01 || g.paddle.x + g.paddle.w / 2 > g.wallR + 0.01) outside++;
    g.balls.forEach(function (b) { if (b.x - b.r < g.wallL - 0.01 || b.x + b.r > g.wallR + 0.01) outside++; });
  }
  ok(inMax > 20 && minGap >= C.rules.walls.gap - 0.01 && outside === 0, 'Closing Walls: walls come in (' + inMax.toFixed(0) + 'px) but stop ' + minGap.toFixed(0) + 'px from any brick; ball and paddle always inside');
  ok(C.W - 2 * C.rules.walls.maxIn > C.presets.easy.paddleW * C.capsule.longMult + 2 * C.ball.radius, 'Closing Walls: even fully closed, the field is wider than the biggest paddle');
  g = launched(BT.levelById(38)); wa = ruleOf(g, 'walls'); wa.s.inset = 50; g.step(DT);
  var push = g.bricks.filter(function (b) { return b.type === 'pusher'; })[0];
  g.hitBrick(push, g.balls[0], 'ball'); for (i = 0; i < 60; i++) { park(g.balls[0], 180, 520, 0, -300); g.step(DT); }
  ok(wa.s.inset < 50 - C.rules.walls.shove * 0.8, 'Closing Walls: a pusher shoves the walls back out (' + wa.s.inset.toFixed(0) + 'px)');
  g = launched(BT.levelById(38)); wa = ruleOf(g, 'walls'); wa.s.inset = 40; ball = g.balls[0];
  park(ball, 3, 500, -100, -300); g.paddle.x = g.paddle.targetX = 10; g.step(DT);
  ok(ball.x - ball.r >= g.wallL - 0.01 && g.paddle.x - g.paddle.w / 2 >= g.wallL - 0.01, 'Closing Walls: a wall moving in pushes the ball and the paddle along, never through');

  // ---- Hall of Mirrors: a clean ninety-degree turn shown by the panel; panels flip; no endless loops
  g = launched(BT.levelById(39)); var mi = ruleOf(g, 'mirrors'), d0 = mi.s.list[0]; ball = g.balls[0];
  park(ball, d0.x + 4, d0.y + 60, -60, -280);
  for (i = 0; i < 60 && ball.vy < 0 && Math.abs(ball.vx) < 200; i++) g.step(DT);
  ok(d0.dir === -1 || ball.vx > 0 && Math.abs(ball.vx) > Math.abs(ball.vy) * 2, 'Hall of Mirrors: a ball going up into "/" turns right (' + ball.vx.toFixed(0) + ',' + ball.vy.toFixed(0) + ')');
  for (i = 0; i < 40; i++) g.step(DT);
  ok(d0.dir === -1, 'Hall of Mirrors: the panel flips once the ball has left it');
  park(ball, d0.x - 4, d0.y + 60, 60, -280);
  for (i = 0; i < 60 && Math.abs(ball.vx) < 200; i++) g.step(DT);
  ok(ball.vx < 0, 'Hall of Mirrors: the flipped panel sends the next ball the other way');
  // two panels facing each other in an empty box: the chain limit stops a ball bouncing between them for ever
  var loopL = { id: 971, grid: [], rules: [{ id: 'mirrors', mirrors: [{ x: 100, y: 300, dir: 1 }, { x: 260, y: 300, dir: -1 }, { x: 100, y: 200, dir: -1 }, { x: 260, y: 200, dir: 1 }] }] };
  g = launched(loopL); ball = g.balls[0]; park(ball, 100, 380, 0, -300);
  var chainMax = 0, defl = 0, od = g.rules[0].mod.onDeflect;
  for (i = 0; i < 120 * 30; i++) { g.step(DT); if (!g.balls.length) break; chainMax = Math.max(chainMax, g.balls[0].deflectChain); if (g.balls[0].vy > 0 && g.balls[0].y > 500) break; }
  ok(chainMax <= C.rules.mirrors.maxChain, 'Hall of Mirrors: a ball turns off at most ' + C.rules.mirrors.maxChain + ' panels in a row before passing through (' + chainMax + ')');

  // ---- The Machine: three phases in order, each borrowing an earlier rule, safe change-overs
  g = launched(BT.levelById(40)); var mc = g.boss; ball = g.balls[0];
  var seen = [], hurtInTrans = false, ghostOnBall = 0;
  for (var ph = 0; ph < 3; ph++) {
    seen.push(mc.s.sub ? mc.s.sub.id : '-');
    var guard = 0;
    while (mc.s.phase === ph && !mc.s.defeated && guard++ < 50) { mc.s.hitCd = 0; mc.mod.hitCore(g, mc); }
    if (mc.s.defeated) break;
    var hpT = mc.s.hp; mc.s.hitCd = 0; mc.mod.hitCore(g, mc); if (mc.s.hp !== hpT) hurtInTrans = true;
    var borrowedGone = seen[ph] && !ruleOf(g, seen[ph]);
    // park the ball where the next parts appear while they fade in: they must wait for it
    var row7 = C.grid.top + 7 * C.grid.cellH + 8;
    for (i = 0; i < Math.ceil((C.bosses.machine.transition + 1) / DT); i++) {
      park(ball, 75, row7, 1, 1); g.step(DT); park(ball, 75, row7, 1, 1);
      g.bricks.forEach(function (b) { if (b.alive && b.solid && b.machinePart && P.circleRect(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h) > 0.5) ghostOnBall++; });
    }
    if (!borrowedGone) seen.push('NOT REMOVED');
  }
  ok(seen.join(',') === 'conveyor,redblue,thunder' && mc.s.defeated, 'The Machine: phases borrow conveyor, red/blue and thunder in turn, each taken out after its phase (' + seen.join(',') + ')');
  ok(!hurtInTrans, 'The Machine: the core cannot be hurt during a change-over');
  ok(ghostOnBall === 0, 'The Machine: new parts never turn solid on top of the ball');
})();

// ------------------------------------------------------------------ phase 3 rules compose
section('Phase 3 rules compose');
(function () {
  var combos = [
    { grid: ['IIII....IIII', '..rrrrrrrr..', '.H........H.'], rules: [{ id: 'ice' }, { id: 'tide' }, { id: 'thunder', first: 1 }, { id: 'walls' }] },
    { grid: ['.r.o.y.g.c..', '....##......', '..X.....X...'], rules: [{ id: 'runaway' }, { id: 'bigsmall' }, { id: 'mirrors', mirrors: [{ x: 180, y: 250, dir: 1 }] }, { id: 'wells', planets: [{ x: 90, y: 320, mass: 0.6 }] }] },
    { grid: ['222222222222', 'rrRRBBrrRRBB', 'S..........S'], rules: [{ id: 'redhot' }, { id: 'redblue' }, { id: 'wrap' }, { id: 'tide' }, { id: 'conveyor', rows: { 1: 30 } }] },
    { grid: ['cccc....cccc', 'IIIIIIIIIIII', 'A..........A'], rules: [{ id: 'squeeze', speed: 4 }, { id: 'walls' }, { id: 'redhot' }, { id: 'lightsout' }, { id: 'gusts', firstDelay: 1 }] },
    { grid: ['rrrrrrrrrrrr'], rules: [{ id: 'twins' }, { id: 'tide' }] }
  ];
  combos.forEach(function (cb, ci) {
    var gc = new BT.Game({ id: 980 + ci, grid: cb.grid, rules: cb.rules, capsuleChance: 0.3, clear: cb.rules[0].id === 'twins' ? 'boss' : undefined }, 'normal', { seed: 9 + ci });
    var bc = new Bot(gc, BT.mulberry32(91 + ci)), rc = { speed: 0, outside: 0, inside: 0 }, threw = null;
    try { for (var s2 = 0; s2 < 120 * 60 && gc.state !== 'won' && gc.state !== 'lost'; s2++) { bc.act(DT); gc.step(DT); checkBalls(gc, rc); } } catch (e) { threw = e; }
    ok(!threw && rc.speed === 0 && rc.outside === 0 && rc.inside === 0, 'phase-3 combo ' + (ci + 1) + ' (' + cb.rules.map(function (q) { return q.id; }).join('+') + ') runs legally' + (threw ? ': ' + threw.message : '') + ' ' + JSON.stringify(rc));
  });
  // act-two rules mixed with each other and with older ones (Endless and the bosses combine them)
  var combos2 = [
    { grid: ['.EE....EE...', 'rrFrrrrFrrrr', '....##......'], rules: [{ id: 'hatch', first: 2 }, { id: 'cannon' }, { id: 'safetywall' }, { id: 'conveyor', rows: { 1: 30 } }] },
    { grid: ['..RRYYBB....', '.ww....ww...', '............', '..pppp......'], rules: [{ id: 'paint', gates: [{ x: 20, y: 360, w: 70, color: 'red' }, { x: 145, y: 390, w: 70, color: 'yellow' }, { x: 270, y: 360, w: 70, color: 'blue' }] }, { id: 'puppet', rows: [3] }, { id: 'powershot' }, { id: 'curve' }] },
    { grid: ['oooooooooooo', '.UU....DD...', '............'], rules: [{ id: 'flip', first: 2, every: 6 }, { id: 'slowmo' }, { id: 'wrap' }, { id: 'redhot' }] },
    { grid: ['.yyyyyyyyyy.', '.gggggggggg.'], rules: [{ id: 'builders', bots: [{ row: 4, c0: 0, c1: 11, rows: [0, 1] }] }, { id: 'tide' }, { id: 'pinball', bumpers: [{ x: 180, y: 300 }], gates: [] }] },
    { grid: ['N.N.N.N.N...', '............', '#..........#'], rules: [{ id: 'numbers' }, { id: 'cannon' }, { id: 'powershot' }, { id: 'slowmo' }, { id: 'curve' }, { id: 'safetywall' }] }
  ];
  combos2.forEach(function (cb, ci) {
    var gc = new BT.Game({ id: 985 + ci, grid: cb.grid, rules: cb.rules, capsuleChance: 0.3 }, 'normal', { seed: 19 + ci });
    var bc = new Bot(gc, BT.mulberry32(191 + ci)), rc = { speed: 0, outside: 0, inside: 0 }, threw = null;
    try { for (var s2 = 0; s2 < 120 * 60 && gc.state !== 'won' && gc.state !== 'lost'; s2++) { bc.act(DT); gc.step(DT); checkBalls(gc, rc); } } catch (e) { threw = e; }
    ok(!threw && rc.speed === 0 && rc.outside === 0 && rc.inside === 0, 'act-two combo ' + (ci + 1) + ' (' + cb.rules.map(function (q) { return q.id; }).join('+') + ') runs legally' + (threw ? ': ' + threw.message : '') + ' ' + JSON.stringify(rc));
  });

  // engine extension points stay off unless a rule switches them on
  var g0 = new BT.Game(BT.levelById(1), 'normal', { seed: 1 });
  ok(g0.wallL === 0 && g0.wallR === C.W && !g0.paddleIce && g0.deflectors.length === 0 && g0.balls[0].pierce === 0 && g0.balls[0].sizeMul === 1 && g0.balls[0].zoneMul === 1 && g0.paddle.speedCap === 0,
    'phase-3 engine extension points are all off by default');
})();

// ------------------------------------------------------------------ act two twists
section('World 9, 10 and 11 twists');
(function () {
  var P = BT.Physics, i, k, g, ball, r;
  function launched(L, preset, seed) {
    var gg = new BT.Game(L, preset || 'normal', { seed: seed || 1 });
    gg.tap();
    var b = gg.balls[0]; b.stuck = false; b.serve = false;
    return gg;
  }
  function park(b, x, y, vx, vy) { b.x = x; b.y = y; b.prevX = x; b.prevY = y; b.vx = vx; b.vy = vy; }
  function ruleOf(gg, id) { for (var q = 0; q < gg.rules.length; q++) if (gg.rules[q].id === id) return gg.rules[q]; return null; }
  function steps(gg, n, fn) { for (var q = 0; q < n; q++) { if (fn) fn(q); gg.step(DT); } }
  function onPaddleY(gg, b) { return gg.paddle.y - gg.paddle.h / 2 - b.r; }

  // ---------------- Power Shot
  var L41 = BT.levelById(41);
  g = launched(L41); r = ruleOf(g, 'powershot'); ball = g.balls[0];
  park(ball, 180, 300, 0, -300); g.step(DT);
  g.tap();
  ok(r.s.armT <= 0 && r.s.charge === 1 && !ball.powered, 'Power Shot: a tap at the wrong moment does nothing at all (no penalty, still ready)');
  g = launched(L41); r = ruleOf(g, 'powershot'); ball = g.balls[0];
  park(ball, g.paddle.x, onPaddleY(g, ball) - 40, 0, 300); g.step(DT);
  ok(r.mod.inWindow(r), 'Power Shot: the ring is bright just before the ball lands');
  g.tap();
  for (i = 0; i < 60 && ball.vy > 0; i++) g.step(DT);
  ok(ball.powered && ball.pierce === C.rules.powershot.pierce && ball.boost > 1.3 && r.s.charge === 0, 'Power Shot: a tap as the ball lands sends it back powered (pierce ' + ball.pierce + ', boost ' + ball.boost.toFixed(2) + ')');
  var maxSp = 0; for (i = 0; i < 120; i++) { g.step(DT); if (g.balls[0]) maxSp = Math.max(maxSp, Math.hypot(g.balls[0].vx, g.balls[0].vy)); }
  ok(maxSp <= C.ball.absMaxSpeed + 1e-6, 'Power Shot: the boost is bounded (max ' + maxSp.toFixed(0) + ' px/s)');
  g = launched(L41); r = ruleOf(g, 'powershot'); ball = g.balls[0];
  park(ball, g.paddle.x, onPaddleY(g, ball) - 10, 0, 300);
  for (i = 0; i < 30 && ball.vy > 0; i++) g.step(DT);
  steps(g, Math.round(0.1 / DT));
  g.tap();
  ok(ball.powered, 'Power Shot: a tap just after the bounce (' + (C.rules.powershot.late * 1000) + 'ms grace) still counts');
  ok(C.rules.powershot.windowEasy > C.rules.powershot.window && C.rules.powershot.lateEasy > C.rules.powershot.late, 'Power Shot: the timing window is wider on Easy');
  var armL = { id: 990, grid: ['............', '....3333....', '....3333....', '....3333....', '............', '############'], rules: [{ id: 'powershot' }] };
  g = launched(armL); r = ruleOf(g, 'powershot'); ball = g.balls[0];
  var left0 = g.requiredLeft();
  park(ball, 4 * 30 + 45, 150, 0, -300); r.mod.fire(g, r, ball);
  for (i = 0; i < 120 && ball.vy < 0; i++) g.step(DT);
  ok(left0 - g.requiredLeft() >= C.rules.powershot.pierce, 'Power Shot: a powered ball punches straight through ' + (left0 - g.requiredLeft()) + ' three-hit bricks in one go');
  g = launched(L41); r = ruleOf(g, 'powershot'); ball = g.balls[0]; r.s.charge = 0.5;
  park(ball, g.paddle.x, onPaddleY(g, ball) - 40, 0, 300); g.step(DT); g.tap();
  ok(r.s.armT <= 0, 'Power Shot: while it recharges a tap is simply ignored');

  // ---------------- tap precedence (launch > timed power > lasers > free power)
  var precL = { id: 991, grid: ['rrrrrrrrrrrr'], rules: [{ id: 'powershot' }, { id: 'slowmo' }] };
  g = new BT.Game(precL, 'normal', { seed: 1 }); var ps = ruleOf(g, 'powershot'), sm = ruleOf(g, 'slowmo');
  g.tap();
  ok(g.state === 'play' && !sm.s.on && ps.s.armT <= 0, 'Taps: at the serve a tap only launches');
  ball = g.balls[0]; park(ball, g.paddle.x, onPaddleY(g, ball) - 40, 0, 300); g.step(DT); g.tap();
  ok(ps.s.armT > 0 && !sm.s.on, 'Taps: with the ring bright a tap arms the Power Shot (not Slow-Mo)');
  g = launched(precL); ps = ruleOf(g, 'powershot'); sm = ruleOf(g, 'slowmo'); ball = g.balls[0];
  park(ball, 180, 300, 0, -300); g.step(DT); g.tap();
  ok(sm.s.on && ps.s.armT <= 0, 'Taps: otherwise a tap starts Slow-Mo, and a second tap stops it');
  g.tap(); ok(!sm.s.on, 'Taps: (stopped)');
  g.eff.laser = 5; g.laserCd = 0; var live0 = g.lasers.filter(function (L) { return L.alive; }).length; g.tap();
  ok(!sm.s.on && g.lasers.filter(function (L) { return L.alive; }).length > live0, 'Taps: with the Laser on, a tap fires lasers before a free power');
  g.eff.laser = 0;
  ball.stuck = true; ball.stuckTimer = 0; g.tap();
  ok(!ball.stuck && !sm.s.on, 'Taps: a caught ball is released and the tap does nothing else');

  // ---------------- Slow-Mo: the world slows, the paddle does not
  var slowL = { id: 992, grid: ['r..........r'], rules: [{ id: 'slowmo' }] };
  function paddleTime(slow) {
    var gg = launched(slowL), q = ruleOf(gg, 'slowmo'), b = gg.balls[0];
    park(b, 180, 300, 0, -280);
    if (slow) { gg.tap(); steps(gg, 40, function () { park(b, 180, 300, 0, -280); }); }
    var y0 = b.y; steps(gg, 10); var dy = y0 - b.y;
    gg.pointTo(gg.paddle.x - 120); var n = 0;
    while (Math.abs(gg.paddle.x - gg.paddle.targetX) > 1 && n < 200) { gg.step(DT); n++; }
    return { dy: dy, n: n, on: q.s.on };
  }
  var fast = paddleTime(false), slow = paddleTime(true);
  ok(slow.on && Math.abs(slow.dy / fast.dy - C.rules.slowmo.scale) < 0.03, 'Slow-Mo: the ball moves at ' + (slow.dy / fast.dy).toFixed(2) + ' of its speed');
  ok(slow.n === fast.n, 'Slow-Mo: the paddle is just as quick (' + slow.n + ' vs ' + fast.n + ' steps to cross)');
  g = launched(slowL); sm = ruleOf(g, 'slowmo'); ball = g.balls[0]; g.tap();
  var onFor = 0; for (i = 0; i < 120 * 6 && sm.s.on; i++) { park(ball, 180, 300, 0, -280); g.step(DT); onFor += DT; }
  ok(Math.abs(onFor - C.rules.slowmo.drain) < 0.1, 'Slow-Mo: a full meter lasts ' + onFor.toFixed(2) + 's of real time, then it stops by itself');
  g.tap(); ok(!sm.s.on, 'Slow-Mo: an empty meter cannot be started');
  for (i = 0; i < Math.round(C.rules.slowmo.recharge / DT) + 2; i++) { park(ball, 180, 300, 0, -280); g.step(DT); }
  ok(sm.s.meter >= 0.999, 'Slow-Mo: it refills in ' + C.rules.slowmo.recharge + 's');

  // ---------------- Curveball: gentle, bounded, never stalls
  var curveL = { id: 993, grid: ['r..........r'], rules: [{ id: 'curve' }] };
  g = launched(curveL); var cv = ruleOf(g, 'curve'); ball = g.balls[0];
  park(ball, 180, 440, 0, -300); ball.spin = cv.s.budget; g.paddle.x = g.paddle.targetX = 60;
  var minFrac = 1, spd = [], bent = 0;
  for (i = 0; i < 120 && ball.vy < 0; i++) {
    g.pointTo(g.paddle.x + 9); g.step(DT);
    var sp = Math.hypot(ball.vx, ball.vy); spd.push(sp); minFrac = Math.min(minFrac, Math.abs(ball.vy) / sp);
  }
  ok(ball.vx > 50, 'Curveball: sweeping the paddle right bends a rising ball right (vx ' + ball.vx.toFixed(0) + ')');
  ok(Math.max.apply(null, spd) - Math.min.apply(null, spd) < 1e-6, 'Curveball: the ball\'s speed never changes');
  ok(minFrac >= C.ball.minVyFrac - 1e-9, 'Curveball: the minimum vertical speed still holds (' + minFrac.toFixed(3) + ')');
  ok(cv.s.used <= cv.s.budget + DT, 'Curveball: a flight has a limited budget of bend (' + cv.s.used.toFixed(2) + 's of ' + cv.s.budget + 's)');
  g = launched(curveL); cv = ruleOf(g, 'curve'); ball = g.balls[0]; park(ball, 180, 300, 0, 300); ball.spin = cv.s.budget;
  for (i = 0; i < 30; i++) { g.pointTo(g.paddle.x + 9); g.step(DT); }
  ok(Math.abs(ball.vx) < 1e-6, 'Curveball: a falling ball cannot be bent (no steering it onto the paddle)');
  // a wiggling paddle for a long time: the ball always keeps coming back to the paddle (no hovering)
  g = launched(curveL); ball = g.balls[0]; var lastHit = 0, longest = 0, tt = 0, ph = 0;
  for (i = 0; i < 120 * 90; i++) {
    var b = g.balls[0]; if (!b) break;
    if (b.stuck) { g.tap(); lastHit = tt; continue; } // a missed ball: start timing again from the serve
    tt += DT; ph += DT * 9;
    if (b.vy > 0 && b.y > 380) g.pointTo(P.predictLandingX(b.x, b.y, b.vx, b.vy, g.paddle.y - 12, b.r, C.W - b.r) + Math.sin(ph) * 20);
    else g.pointTo(180 + Math.sin(ph) * 150);
    var vy0 = b.vy; g.step(DT);
    if (g.balls[0] && vy0 > 0 && g.balls[0].vy < 0 && g.balls[0].y > 500) { longest = Math.max(longest, tt - lastHit); lastHit = tt; }
  }
  // (bound: a plain shot off the paddle's very edge, no bending at all, up and back at the starting speed)
  var edgeTrip = 2 * (C.paddle.y - C.TOP) / (C.presets.normal.speedStart * Math.cos(C.ball.maxAngleDeg * P.DEG)) + 1;
  ok(longest > 0 && longest < edgeTrip, 'Curveball: with the paddle wiggling non-stop the ball still comes back every ' + longest.toFixed(1) + 's at most (a plain edge shot: ' + edgeTrip.toFixed(1) + 's)');
  g = launched(curveL); cv = ruleOf(g, 'curve'); ball = g.balls[0]; var flattest = 0;
  park(ball, 180, 460, 0, -300); ball.spin = 5; g.paddle.x = g.paddle.targetX = 30;
  for (i = 0; i < 120 && ball.vy < 0; i++) { g.pointTo(g.paddle.x + 9); g.step(DT); flattest = Math.max(flattest, Math.atan2(Math.abs(ball.vx), Math.abs(ball.vy)) / P.DEG); }
  ok(flattest <= C.rules.curve.maxDeg + 0.5, 'Curveball: however hard you bend, the path is never flatter than ' + C.rules.curve.maxDeg + ' degrees from vertical (' + flattest.toFixed(1) + ')');

  // ---------------- Safety Wall
  var L44 = BT.levelById(44);
  g = launched(L44); var sw = ruleOf(g, 'safetywall'); ball = g.balls[0];
  g.paddle.x = g.paddle.targetX = 320; park(ball, 40, 520, 0, 300); g.tap();
  ok(sw.s.up > 0 && sw.s.charges === C.rules.safetywall.charges - 1, 'Safety Wall: a tap raises it and uses a charge');
  var c0 = sw.s.charges; g.tap(); ok(sw.s.charges === c0, 'Safety Wall: a tap while it is up does nothing');
  var saved = false; for (i = 0; i < 120 && g.balls.length; i++) { g.step(DT); if (g.balls[0] && g.balls[0].vy < 0) { saved = true; break; } }
  ok(saved && g.lives === 3, 'Safety Wall: it bounces a ball the paddle missed');
  sw.s.up = 0; sw.s.charges = 0; g.tap(); ok(sw.s.up === 0, 'Safety Wall: with no charges a tap does nothing');
  var shield = g.bricks.filter(function (q) { return q.type === 'shield' && q.alive; })[0]; g.destroyBrick(shield, 'test');
  ok(sw.s.charges === 1, 'Safety Wall: breaking a shield brick gives a charge');
  sw.s.charges = C.rules.safetywall.max; g.destroyBrick(g.bricks.filter(function (q) { return q.type === 'shield' && q.alive; })[0], 'test');
  ok(sw.s.charges === C.rules.safetywall.max, 'Safety Wall: never more than ' + C.rules.safetywall.max + ' charges');
  g = launched(L44, 'easy'); sw = ruleOf(g, 'safetywall'); ball = g.balls[0];
  ok(sw.s.charges === C.rules.safetywall.chargesEasy && g.netActive, 'Safety Wall: on Easy it starts with ' + sw.s.charges + ' charges, and the safety net is there too');
  g.paddle.x = g.paddle.targetX = 320; park(ball, 40, 520, 0, 260); g.tap();
  for (i = 0; i < 120 && ball.vy > 0; i++) g.step(DT);
  var netAfterWall = g.netActive;
  sw.s.up = 0; park(ball, 40, 560, 0, 260); var netSaved = false;
  for (i = 0; i < 120; i++) { g.step(DT); if (g.balls[0] && g.balls[0].vy < 0) { netSaved = true; break; } }
  ok(netAfterWall && netSaved && g.lives === 5, 'Safety Wall: on Easy a wall save leaves the net for later, and the net still saves the next miss');
  g = launched(L44); sw = ruleOf(g, 'safetywall');
  var nb0 = g.balls.length; g.bricks.filter(function (q) { return q.alive && q.required; }).slice(0, C.rules.safetywall.splitEvery).forEach(function (q) { g.destroyBrick(q, 'test'); });
  ok(g.balls.length === nb0 + 2, 'Safety Wall: the level splits the ball into three every ' + C.rules.safetywall.splitEvery + ' bricks');

  // ---------------- Hatchlings
  var L46 = BT.levelById(46);
  g = launched(L46); var ht = ruleOf(g, 'hatch'); ball = g.balls[0];
  var eggs = g.bricks.filter(function (q) { return q.type === 'egg'; }), warnStart = {}, hatchT = {}, firstHatch = 1e9, critTimes = [], shrunk = false;
  for (i = 0; i < 120 * 50; i++) {
    park(ball, 340, 300, 0, -300); g.step(DT);
    eggs.forEach(function (e, j) { if (e.wobble > 0 && warnStart[j] == null) warnStart[j] = ht.s.t; if (!e.alive && hatchT[j] == null) { hatchT[j] = ht.s.t; firstHatch = Math.min(firstHatch, ht.s.t); } });
    ht.s.crits.forEach(function (c) { if (c.state === 'ride' && c.tRide == null) { c.tRide = c.age; critTimes.push(c.age); } });
    if (g.eff.shrink > 0) shrunk = true;
  }
  var warnOk = Object.keys(hatchT).every(function (j) { return warnStart[j] != null && hatchT[j] - warnStart[j] >= C.rules.hatch.warn * 0.97; });
  ok(Object.keys(hatchT).length === eggs.length && warnOk, 'Hatchlings: every egg wobbles for at least ' + C.rules.hatch.warn + 's before it hatches');
  ok(firstHatch >= C.rules.hatch.first * 0.95, 'Hatchlings: the first egg hatches after ' + firstHatch.toFixed(1) + 's of play');
  var minWalk = Math.min.apply(null, critTimes.length ? critTimes : [99]);
  ok(critTimes.length > 0 && minWalk > 8 && shrunk && g.lives === 3, 'Hatchlings: a critter takes ' + minWalk.toFixed(1) + 's to reach the paddle, and only shrinks it (no life lost)');
  g = launched(L46); ht = ruleOf(g, 'hatch'); ball = g.balls[0];
  var egg = g.bricks.filter(function (q) { return q.type === 'egg'; })[0]; ht.mod.hatch(g, ht, egg);
  var cr = ht.s.crits[0]; park(ball, cr.x, cr.y, 0, -200); var sc0 = g.score; g.step(DT);
  ok(cr.state === 'pop' && g.score > sc0, 'Hatchlings: the ball pops a critter');
  g = launched(L46); ht = ruleOf(g, 'hatch'); egg = g.bricks.filter(function (q) { return q.type === 'egg'; })[0]; ht.mod.hatch(g, ht, egg);
  g.bricks.forEach(function (q) { if (q.alive && q.required) q.alive = false; });
  ok(!g.isCleared(), 'Hatchlings: the level is not cleared while a critter is still walking');

  // ---------------- Puppet Strings
  var L47 = BT.levelById(47);
  g = launched(L47); var pu = ruleOf(g, 'puppet'); ball = g.balls[0];
  g.pointTo(60); for (i = 0; i < 60; i++) { park(ball, 340, 500, 0, -300); g.step(DT); }
  ok(pu.s.off > 50, 'Puppet Strings: paddle left, the block slides right (' + pu.s.off.toFixed(0) + 'px)');
  var pb = pu.s.list[0];
  g.pointTo(300); var into = 0, stopped = pu.s.off;
  for (i = 0; i < 60; i++) { park(ball, pb.x - ball.r - 1, pb.y + pb.h / 2, 0, 0.001); g.step(DT); park(ball, pb.x - ball.r - 1, pb.y + pb.h / 2, 0, 0.001); if (P.circleRect(ball.x, ball.y, ball.r, pb.x, pb.y, pb.w, pb.h) > 0.5) into++; }
  ok(into === 0 && pu.s.off >= stopped - 1, 'Puppet Strings: it waits rather than slide into a ball in its way');
  g = launched(L47); pu = ruleOf(g, 'puppet'); var bot = new Bot(g, BT.mulberry32(47)), bad = 0, overl = 0;
  for (i = 0; i < 120 * 120 && g.state === 'play'; i++) {
    bot.act(DT); g.step(DT);
    for (k = 0; k < pu.s.list.length; k++) {
      var q = pu.s.list[k]; if (!q.alive) continue;
      g.balls.forEach(function (bb) { if (P.circleRect(bb.x, bb.y, bb.r, q.x, q.y, q.w, q.h) > 2.5) bad++; });
      if (g.rectBlocked(q.x, q.y, q.w, q.h, q, -0.01) && g.bricks.some(function (o) { return o !== q && !o.puppet && o.alive && o.solid && o.x < q.x + q.w && o.x + o.w > q.x && o.y < q.y + q.h && o.y + o.h > q.y; })) overl++;
    }
  }
  ok(bad === 0 && overl === 0, 'Puppet Strings: in a long game the block never pushes into the ball or another brick (' + bad + ', ' + overl + ')');

  // ---------------- Builder Bots
  var L48 = BT.levelById(48);
  g = launched(L48); var bd = ruleOf(g, 'builders'); ball = g.balls[0];
  var bot0 = bd.s.bots[0], plan = bot0.plans[2], gone = 0, back = -1;
  g.sinceLaunch = 10; g.destroyBrick(plan, 'test');
  for (i = 0; i < 120 * 40 && back < 0; i++) { park(ball, 340, 520, 0, -300); g.step(DT); if (plan.alive) back = i * DT; }
  ok(back > C.rules.builders.build * 0.95, 'Builder Bots: a broken brick is rebuilt, slowly (' + back.toFixed(1) + 's, ' + C.rules.builders.build + 's of building)');
  g = launched(L48); bd = ruleOf(g, 'builders'); ball = g.balls[0]; bot0 = bd.s.bots[0]; plan = bot0.plans[1];
  g.sinceLaunch = 10; g.destroyBrick(plan, 'test');
  var onBall = 0;
  for (i = 0; i < 120 * 30; i++) { park(ball, plan.x + plan.w / 2, plan.y + plan.h / 2, 0.001, 0.001); g.step(DT); if (plan.alive && P.circleRect(ball.x, ball.y, ball.r, plan.x, plan.y, plan.w, plan.h) > 0) onBall++; }
  ok(onBall === 0 && !plan.alive, 'Builder Bots: a brick is never rebuilt on top of the ball (it waits)');
  park(ball, 340, 520, 0, -300); for (i = 0; i < 120 * 12 && !plan.alive; i++) { park(ball, 340, 520, 0, -300); g.step(DT); }
  ok(plan.alive, 'Builder Bots: ... and builds it once the ball has gone');
  g = launched(L48); bd = ruleOf(g, 'builders'); ball = g.balls[0];
  bd.s.bots.forEach(function (bt) { for (var h = 0; h < C.rules.builders.botHp; h++) g.hitBrick(bt, ball, 'ball'); });
  ok(bd.s.bots.every(function (bt) { return !bt.alive; }), 'Builder Bots: a bot is knocked out in ' + C.rules.builders.botHp + ' hits');
  plan = bd.s.bots[0].plans[0]; g.sinceLaunch = 10; g.destroyBrick(plan, 'test');
  for (i = 0; i < 120 * 30; i++) { park(ball, 340, 520, 0, -300); g.step(DT); }
  ok(!plan.alive, 'Builder Bots: with the bots gone nothing is rebuilt');

  // ---------------- Paint Job
  var L49 = BT.levelById(49);
  g = launched(L49); var pt = ruleOf(g, 'paint'); ball = g.balls[0];
  var red = g.bricks.filter(function (q) { return q.group === 'red'; })[0], yel = g.bricks.filter(function (q) { return q.group === 'yellow'; })[0];
  ok(ball.paint === 'yellow', 'Paint Job: the ball starts with a colour');
  g.hitBrick(red, ball, 'ball'); g.hitBrick(yel, ball, 'ball');
  ok(red.alive && red.hp === 1 && !yel.alive, 'Paint Job: a yellow ball bounces off red and breaks yellow');
  var gate = pt.p.gates[0];
  park(ball, gate.x + gate.w / 2, gate.y - 20, 0, 300); for (i = 0; i < 20; i++) g.step(DT);
  var keptDown = ball.paint === 'yellow';
  park(ball, gate.x + gate.w / 2, gate.y + 20, 0, -300); for (i = 0; i < 20; i++) g.step(DT);
  ok(keptDown && ball.paint === gate.color, 'Paint Job: a gate paints a ball going up through it (not one falling through)');
  function paintNoDeadEnd(grid, gates, top) {
    var cols = {}, okAll = true;
    (grid || []).forEach(function (row) { for (var c = 0; c < row.length; c++) { var ch = row[c]; if (ch === 'R') cols.red = 1; if (ch === 'B') cols.blue = 1; if (ch === 'Y') cols.yellow = 1; } });
    Object.keys(cols).forEach(function (c) { if (!gates.some(function (q) { return q.color === c; })) okAll = false; });
    gates.forEach(function (q) { if (q.y < (top || C.TOP) + 60 || q.y > 470 || q.x < 0 || q.x + q.w > C.W) okAll = false; });
    return okAll;
  }
  var arch2 = BT.ARCH_PHASES[1], archGrid = [];
  for (var rk in arch2.rows) archGrid.push(arch2.rows[rk]);
  ok(paintNoDeadEnd(L49.grid, pt.p.gates) && paintNoDeadEnd(archGrid, arch2.rule.gates), 'Paint Job: every colour in the level (and in The Architect\'s paint phase) has an open gate, so it can never dead-end');
  g.splitBalls(); g.step(DT);
  ok(g.balls.every(function (q) { return !!q.paint; }), 'Paint Job: multi-ball copies have a colour too');

  // ---------------- Cannonball
  var L51 = BT.levelById(51);
  g = launched(L51); bot = new Bot(g, BT.mulberry32(51));
  var rising = 0, maxRise = 0, sinceTouch = 0, maxAir = 0, prevVy = 0, apex = 0;
  for (i = 0; i < 120 * 120 && g.state !== 'won' && g.state !== 'lost'; i++) {
    bot.act(DT); g.step(DT);
    var cb = g.balls[0]; if (!cb || cb.stuck) { rising = 0; sinceTouch = 0; continue; }
    if (cb.vy < 0) { rising += DT; maxRise = Math.max(maxRise, rising); } else { if (rising > 0) apex++; rising = 0; }
    sinceTouch += DT; if (prevVy > 0 && cb.vy < 0 && cb.y > 520) { maxAir = Math.max(maxAir, sinceTouch); sinceTouch = 0; }
    prevVy = cb.vy;
  }
  ok(maxRise < 4 && apex > 5, 'Cannonball: the ball always turns over and comes back down (longest climb ' + maxRise.toFixed(1) + 's)');
  ok(maxAir < 12, 'Cannonball: it is back at the paddle within ' + maxAir.toFixed(1) + 's at most (no hovering)');
  g = launched(L51); ball = g.balls[0];
  var topRow = g.bricks.filter(function (q) { return q.alive && q.required; }).reduce(function (a, q) { return Math.min(a, q.y); }, 1e9);
  var reachTop = 0;
  for (var off = -0.3; off <= 0.31; off += 0.15) {
    g = launched(L51); ball = g.balls[0];
    g.bricks.forEach(function (q) { q.solid = false; }); // out of the way (but the level is not cleared)
    park(ball, g.paddle.x + off * g.paddle.w / 2, onPaddleY(g, ball) - 1, 0, 10); g.step(DT);
    var minY = 1e9; for (i = 0; i < 120 * 6 && g.balls.length; i++) { g.step(DT); if (g.balls[0]) minY = Math.min(minY, g.balls[0].y); }
    if (minY < topRow) reachTop++;
  }
  ok(reachTop === 5, 'Cannonball: a shot from the middle part of the paddle always climbs above the top bricks (' + reachTop + '/5)');

  // ---------------- Skyscraper: the camera keeps ball and paddle findable, and moves smoothly
  var L52 = BT.levelById(52);
  g = launched(L52); bot = new Bot(g, BT.mulberry32(52)); var sk = ruleOf(g, 'skyscraper');
  var off1 = 0, padOff = 0, jump = 0, prevCam = 0, topSeen = 0;
  for (i = 0; i < 120 * 240 && g.state !== 'won' && g.state !== 'lost'; i++) {
    bot.act(DT); g.realDt = DT; g.step(DT);
    var low = sk.mod.follow(g);
    if (low && !low.stuck) {
      var sy = low.y - g.cam;
      if (sy < C.TOP - 0.5 || sy > C.H + 0.5) off1++;
      if (low.y > 380 && low.vy > 0 && g.paddle.y - g.paddle.h / 2 - g.cam > C.H) padOff++;
    }
    jump = Math.max(jump, Math.abs(g.cam - prevCam)); prevCam = g.cam;
    if (g.cam < g.topY - C.TOP + 60) topSeen++;
  }
  ok(off1 === 0, 'Skyscraper: the ball the camera follows is always on screen');
  ok(padOff === 0, 'Skyscraper: whenever the ball is coming down near the paddle, the paddle is on screen too');
  ok(jump < 9 && sk.s.maxSpeed < 1100, 'Skyscraper: the camera moves smoothly (at most ' + jump.toFixed(1) + 'px a step, ' + sk.s.maxSpeed.toFixed(0) + 'px/s)');
  ok(topSeen > 0, 'Skyscraper: the view goes all the way up the tower');
  var tower = []; var fl = L52.rules[0].floors, maxRow = 0;
  for (var fk in fl) maxRow = Math.max(maxRow, +fk);
  for (i = 0; i <= maxRow; i++) tower.push(fl[i] || '............');
  ok(reachable({ id: 52, grid: tower }), 'Skyscraper: every brick in the tower can be reached around the steel');

  // ---------------- By the Numbers
  var L53 = BT.levelById(53);
  g = launched(L53); var nm = ruleOf(g, 'numbers'); ball = g.balls[0];
  var later = nm.s.list[3], first = nm.s.list[0];
  g.hitBrick(later, ball, 'ball');
  ok(later.alive && first.isNext && nm.s.wrong === 1, 'By the Numbers: a later number just bounces the ball');
  g.hitBrick(first, ball, 'ball'); g.step(DT);
  ok(!first.alive && nm.s.next === 1 && nm.s.list[1].isNext, 'By the Numbers: the next one breaks and the glow moves on');
  // always reachable: each next brick has an open side reachable from below, with all the others solid
  var allReach = true;
  for (var st = 0; st < nm.s.list.length; st++) {
    var grid = L53.grid.map(function (row) { return row.split(''); });
    nm.s.list.forEach(function (q, j) { if (j < st) grid[q.row][q.col] = '.'; else if (j > st) grid[q.row][q.col] = '#'; });
    var tgt = nm.s.list[st]; grid[tgt.row][tgt.col] = 'r';
    if (!reachable({ id: 53, grid: grid.map(function (rw) { return rw.join(''); }) })) allReach = false;
  }
  ok(allReach, 'By the Numbers: every next number can be reached with all the others still standing');

  // ---------------- Flip
  var L54 = BT.levelById(54);
  g = launched(L54); var fp = ruleOf(g, 'flip'); bot = new Bot(g, BT.mulberry32(54));
  var warnLen = 0, warnOkF = true, turns = 0, slowTurn = true, locked = true, onBallF = 0, sideOk = true, last = 'idle';
  for (i = 0; i < 120 * 120 && g.state !== 'won' && g.state !== 'lost'; i++) {
    bot.act(DT); g.step(DT);
    if (fp.s.phase === 'warn') warnLen += DT;
    if (last !== 'turn' && fp.s.phase === 'turn') { turns++; if (warnLen < C.rules.flip.warn - 0.02) warnOkF = false; warnLen = 0; }
    if (fp.s.phase === 'turn') { if (!g.warp || Math.abs(g.warp.flip - C.rules.flip.worldScale) > 1e-9) slowTurn = false; if (!g.inputLock) locked = false; }
    if (fp.s.phase === 'idle') warnLen = 0;
    last = fp.s.phase;
    g.bricks.forEach(function (q) {
      if (!q.side || !q.alive) return;
      g.balls.forEach(function (bb) { if (q.solid && P.circleRect(bb.x, bb.y, bb.r, q.x, q.y, q.w, q.h) > 2.5) onBallF++; });
      if (fp.s.phase === 'idle' && !q.pending && q.solid !== ((q.side === 'down') === fp.s.down)) sideOk = false;
    });
  }
  ok(turns >= 2 && warnOkF, 'Flip: every turn has a ' + C.rules.flip.warn + 's countdown first (' + turns + ' turns)');
  ok(slowTurn && locked, 'Flip: during the turn the world runs at ' + C.rules.flip.worldScale + ' and the paddle waits');
  ok(sideOk && onBallF === 0, 'Flip: sun bricks are solid the right way up, moon bricks upside down, and never turn solid on the ball');
  g = launched(L54); fp = ruleOf(g, 'flip'); fp.s.down = true; g.viewFlip = true;
  var tx0 = g.paddle.targetX; g.dragBy(-20);
  var dragRight = g.paddle.targetX > tx0;
  g.pointTo(50);
  ok(dragRight && Math.abs(g.paddle.targetX - (C.W - 50)) < 1e-9, 'Flip: upside down, a drag to the left still moves the paddle left on screen, and a mouse puts it under the pointer');
  ok(new BT.Game(L54, 'easy', { seed: 1 }).rules[0].s.every > new BT.Game(L54, 'normal', { seed: 1 }).rules[0].s.every, 'Flip: rarer on Easy');

  // ---------------- The Keeper: reads straight shots; a curve after it commits or a Power Shot beats it
  var L45 = BT.levelById(45);
  function shot(kind, sd) {
    var gg = launched(L45, 'normal', sd), kp = gg.boss, b = gg.balls[0], q = kp.s.xp, rr = BT.mulberry32(sd);
    var x = 90 + rr() * 180, aim = kp.s.gx0 + 20 + rr() * (kp.s.gx1 - kp.s.gx0 - 40);
    var ang = Math.atan2(aim - x, 440 - (gg.topY + 10)), spd = gg.speed();
    park(b, x, 440, Math.sin(ang) * spd, -Math.cos(ang) * spd); b.spin = C.rules.curve.budget;
    if (kind === 'power') { b.powered = true; b.pierce = 3; }
    gg.paddle.x = gg.paddle.targetX = 180;
    var dir = 0;
    for (var s2 = 0; s2 < 400; s2++) {
      if (kind === 'curve' && kp.s.commit && b.vy < 0) { // once it has dived: bend the ball away from it, until it would go past
        var lx = P.predictLandingX(b.x, -b.y, b.vx, -b.vy, -(gg.topY + b.r), b.r, C.W - b.r);
        if (!dir) dir = kp.s.tx < b.x ? 1 : -1;
        if (Math.abs(lx - kp.s.tx) < q.w / 2 + 16) gg.pointTo(gg.paddle.x + dir * 4); // a steady sweep, about 480 px/s
      }
      var g0 = kp.s.goals; gg.step(DT);
      if (kp.s.goals > g0) return 'goal';
      if (b.vy > 0 && b.y > q.y + 20) return 'save';
    }
    return 'none';
  }
  var res = { straight: 0, curve: 0, power: 0 }, nShots = 24;
  ['straight', 'curve', 'power'].forEach(function (kd) { for (var sd = 1; sd <= nShots; sd++) if (shot(kd, sd) === 'goal') res[kd]++; });
  ok(res.straight <= nShots * 0.35, 'The Keeper: it saves most straight shots (' + res.straight + '/' + nShots + ' go in)');
  ok(res.curve >= nShots * 0.6 && res.power >= nShots * 0.75, 'The Keeper: curved shots (' + res.curve + '/' + nShots + ') and Power Shots (' + res.power + '/' + nShots + ') beat it');

  // ---------------- The Queen
  var L50 = BT.levelById(50);
  g = launched(L50); var qn = g.boss; var hp0 = qn.s.hp;
  qn.s.mode = 'shut'; qn.s.hitCd = 0; qn.mod.hit(g, qn);
  var noHurt = qn.s.hp === hp0;
  qn.s.mode = 'brood'; qn.s.hitCd = 0; qn.mod.hit(g, qn);
  ok(noHurt && qn.s.hp === hp0 - 1, 'The Queen: she can be hit while her eggs are shut, not while her shell is closed');
  g = launched(L50); qn = g.boss; ball = g.balls[0];
  qn.s.slots.forEach(function (sl) { if (sl.egg) { sl.egg.alive = false; sl.egg = null; } });
  qn.s.mode = 'shut'; qn.s.timer = 0.01; var target = qn.s.slots[0], tq = qn.mod.slotPos(qn, target), laidOnBall = 0;
  for (i = 0; i < 120 * 4; i++) { park(ball, tq.x, tq.y, 0.001, 0.001); g.step(DT); if (target.egg && target.egg.alive && P.circleRect(ball.x, ball.y, ball.r, target.egg.x, target.egg.y, target.egg.w, target.egg.h) > 0) laidOnBall++; }
  var others = qn.s.slots.filter(function (sl) { return sl.egg; }).length;
  ok(laidOnBall === 0 && !target.egg && others > 10, 'The Queen: she lays a fresh clutch, but never an egg on top of the ball');
  g = launched(L50); qn = g.boss; var hatched0 = qn.s.hatch.s.hatched, nBrood = Math.round((qn.s.timer + 1.5) / DT);
  for (i = 0; i < nBrood; i++) { park(g.balls[0], 340, 520, 0, -300); g.step(DT); }
  ok(qn.s.hatch.s.hatched > hatched0 + 10, 'The Queen: when the brood ends her eggs hatch (' + (qn.s.hatch.s.hatched - hatched0) + ')');

  // ---------------- The Architect: four phases borrowing act-two rules, clean change-overs
  g = launched(BT.levelById(55)); var ar = g.boss; ball = g.balls[0];
  var seenA = [], hurt = false, ghostHit = 0;
  for (var phz = 0; phz < 4; phz++) {
    seenA.push(ar.s.sub ? ar.s.sub.id : '-');
    var guard = 0;
    while (ar.s.phase === phz && !ar.s.defeated && guard++ < 50) { ar.s.hitCd = 0; ar.mod.hitCore(g, ar); }
    if (ar.s.defeated) break;
    var hpA = ar.s.hp; ar.s.hitCd = 0; ar.mod.hitCore(g, ar); if (ar.s.hp !== hpA) hurt = true;
    if (seenA[phz] && ruleOf(g, seenA[phz])) seenA.push('NOT REMOVED');
    var rowY = C.grid.top + 8 * C.grid.cellH + 8;
    for (i = 0; i < Math.ceil((C.bosses.architect.transition + 1) / DT); i++) {
      park(ball, 135, rowY, 1, 1); g.step(DT); park(ball, 135, rowY, 1, 1);
      g.bricks.forEach(function (q) { if (q.alive && q.solid && q.archPart && P.circleRect(ball.x, ball.y, ball.r, q.x, q.y, q.w, q.h) > 0.5) ghostHit++; });
    }
  }
  ok(seenA.join(',') === 'puppet,paint,builders,cannon' && ar.s.defeated, 'The Architect: four phases borrow Puppet Strings, Paint Job, Builder Bots and Cannonball in turn, each taken out after (' + seenA.join(',') + ')');
  ok(!hurt, 'The Architect: the core cannot be hurt during a change-over');
  ok(ghostHit === 0, 'The Architect: new parts never turn solid on top of the ball');
  ok(ball.minVy == null && !ball.paint && g.powers.length === 3, 'The Architect: borrowed rules tidy up after themselves; the three powers stay for the whole fight');
  ok(C.bosses.architect.hp.length === 4 && C.bosses.architect.hp.reduce(function (a, b) { return a + b; }, 0) > C.bosses.machine.hp.reduce(function (a, b) { return a + b; }, 0), 'The Architect: a bigger finale than The Machine (four phases, more hits)');

  // ---------------- act-two engine extension points stay off unless a rule switches them on
  var g0 = new BT.Game(BT.levelById(1), 'normal', { seed: 1 });
  ok(g0.powers.length === 0 && g0.warp === null && g0.topY === C.TOP && g0.cam === 0 && !g0.viewFlip && g0.viewAngle === 0 && !g0.inputLock && g0.balls[0].minVy === null,
    'act-two engine extension points are all off by default');
})();

// Greedy solver for Twelve Bounces: for each bounce try 13 landing points on the paddle, keep the one that
// leaves the fewest bricks, replaying from the start each time (the game is deterministic for a seed).
function solveBounces(L) {
  var offs = [], k;
  for (k = -6; k <= 6; k++) offs.push(k / 6 * 0.85);
  function run(seq) {
    var g = new BT.Game(L, 'normal', { seed: 11 });
    g.tap();
    var used = 0;
    for (var s = 0; s < 120 * 60; s++) {
      var b = g.balls[0];
      if (!b || g.attempts > 0) return { left: 999, won: false };
      used = C.rules.bounces.count - g.rules[0].s.left;
      if (b.vy > 0) {
        if (used >= seq.length && b.y > 480 && !g.blasts.length) break;
        var lx = BT.Physics.predictLandingX(b.x, b.y, b.vx, b.vy, g.paddle.y - g.paddle.h / 2 - b.r, b.r, C.W - b.r);
        g.pointTo(lx - (seq[used] || 0) * g.paddle.w / 2);
      }
      g.step(DT);
      if (g.state === 'clearing' || g.state === 'won') return { left: 0, won: true, used: used };
    }
    return { left: g.requiredLeft(), won: false };
  }
  var seq = [];
  for (var n = 0; n < C.rules.bounces.count; n++) {
    var best = null, bestLeft = 1e9;
    for (k = 0; k < offs.length; k++) {
      var r = run(seq.concat([offs[k]]));
      if (r.won) return n + 1;
      if (r.left < bestLeft) { bestLeft = r.left; best = offs[k]; }
    }
    seq.push(best);
  }
  return -1;
}

// ------------------------------------------------------------------ save
section('Save data');
(function () {
  function MemStore(init) { this.m = init || {}; }
  MemStore.prototype.getItem = function (k) { return this.m.hasOwnProperty(k) ? this.m[k] : null; };
  MemStore.prototype.setItem = function (k, v) { this.m[k] = String(v); };
  var v1 = { version: 1, stars: { 1: 3, 2: 2, 3: 1 }, best: { 1: 1234 }, diff: 'easy', sound: false };
  var st = new MemStore(); st.m[C.saveKey] = JSON.stringify(v1);
  var S = BT.Save;
  S.init(st);
  ok(S.data.v === C.saveVersion, 'v1 save migrated to current version');
  ok(S.levelInfo(1).stars === 3 && S.levelInfo(2).stars === 2 && S.levelInfo(1).best === 1234, 'stars and best scores survive the version bump');
  ok(S.isUnlocked(4) && !S.isUnlocked(5), 'unlocks follow cleared levels after migration');
  ok(S.data.difficulty === 'easy' && S.data.muted === true, 'settings survive the version bump');
  S.record(4, 2, 500);
  var again = new MemStore(st.m); S.init(again);
  ok(S.levelInfo(4).stars === 2 && S.levelInfo(1).stars === 3, 'migrated save round-trips');
  S.record(4, 1, 100);
  ok(S.levelInfo(4).stars === 2 && S.levelInfo(4).best === 500, 'record keeps the best stars and score');
  // a phase-1 player who has finished World 3 carries straight on into World 4 with stars untouched
  var p1 = { v: 2, progress: {}, difficulty: 'normal', muted: false, seen: { capsules: true } };
  for (var li = 1; li <= 15; li++) p1.progress[li] = { stars: (li % 3) + 1, best: li * 100, cleared: true };
  var st2 = new MemStore(); st2.m[C.saveKey] = JSON.stringify(p1);
  S.init(st2);
  ok(S.isUnlocked(16) && !S.isUnlocked(17) && S.levelInfo(7).stars === 2 && S.levelInfo(15).best === 1500 && S.totalStars() === 30,
    'phase-1 save: level 16 unlocks after 15, 17 stays locked, stars and scores untouched');
  S.record(16, 3, 900);
  ok(S.isUnlocked(17) && !S.isUnlocked(18) && S.levelInfo(16).stars === 3, 'clearing 16 unlocks 17 (in order)');
  // a phase-2 player who has finished World 5 carries straight on into World 6 with stars untouched
  var p2 = { v: 2, progress: {}, difficulty: 'easy', muted: true, seen: { capsules: true, 'boss-rival': true } };
  for (li = 1; li <= 25; li++) p2.progress[li] = { stars: (li % 3) + 1, best: li * 100, cleared: true };
  var st3 = new MemStore(); st3.m[C.saveKey] = JSON.stringify(p2);
  S.init(st3);
  ok(S.isUnlocked(26) && !S.isUnlocked(27) && S.totalStars() === 50 && S.levelInfo(25).best === 2500 && S.data.difficulty === 'easy' && S.data.seen['boss-rival'],
    'phase-2 save: level 26 unlocks after 25, 27 stays locked, stars, scores and settings untouched');
  for (li = 26; li <= 39; li++) S.record(li, 1, 10);
  ok(S.isUnlocked(40) && S.totalStars() === 64, 'clearing up to 39 opens the final boss');

  // a phase-4 player who has finished the whole of act one (and played Endless) finds World 9 open, nothing lost
  var p4 = { v: 2, progress: {}, difficulty: 'normal', muted: false, seen: { capsules: true, 'boss-machine': true }, endless: { normal: { round: 9, score: 12345 } } };
  for (li = 1; li <= 40; li++) p4.progress[li] = { stars: (li % 3) + 1, best: li * 100, cleared: true };
  var st4 = new MemStore(); st4.m[C.saveKey] = JSON.stringify(p4);
  S.init(st4);
  var same4 = true, tot4 = 0;
  for (li = 1; li <= 40; li++) { var in4 = S.levelInfo(li); tot4 += (li % 3) + 1; if (in4.stars !== (li % 3) + 1 || in4.best !== li * 100 || !in4.cleared) same4 = false; }
  ok(same4 && S.isUnlocked(41) && !S.isUnlocked(42) && S.totalStars() === tot4 && S.endlessBest('normal').round === 9 && S.endlessBest('normal').score === 12345 && S.data.seen['boss-machine'],
    'phase-4 save: every star, score, setting and Endless best kept; level 41 (World 9) unlocked, 42 still locked');
  S.record(41, 3, 500);
  ok(S.isUnlocked(42) && !S.isUnlocked(43), 'clearing 41 unlocks 42 (in order)');

  var bad = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('denied'); } };
  var threw = false;
  try { S.init(bad); S.record(1, 3, 10); S.setMuted(true); } catch (e) { threw = true; }
  ok(!threw, 'throwing storage does not break the game');
  ok(S.levelInfo(1).stars === 3, 'progress kept in memory when storage throws');
  S.init(null); ok(S.isUnlocked(1), 'no storage at all still works');
  var junk = new MemStore(); junk.m[C.saveKey] = '{not json';
  S.init(junk); ok(S.data.v === C.saveVersion, 'corrupt save falls back to defaults');
})();

endlessSection();
finish();

function finish() {
  console.log('\n' + (checks - failures) + '/' + checks + ' checks passed' + (failures ? ', ' + failures + ' FAILED' : ''));
  process.exit(failures ? 1 : 0);
}


// ------------------------------------------------------------------ Endless
function endlessSection() {
  var E = BT.Endless, ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ALL8 = [1, 2, 3, 4, 5, 6, 7, 8], PRESETS = ['easy', 'normal', 'hard'], reg = BT.Rules.registry;
  var SAFE_Y = 470; // nothing but the paddle and the serve ball below here at the start of a round

  section('Endless: twists and what may mix');
  Object.keys(reg).forEach(function (id) {
    if (reg[id].boss) return;
    ok(!!(E.TWISTS[id] || E.EXCLUDED[id]), 'rule ' + id + ' is either in the Endless pool or excluded with a reason');
  });
  var taughtBy = { fuse: 'tnt', lockkey: 'key' };
  E.ORDER.forEach(function (id) {
    var T = E.TWISTS[id], L = BT.LEVELS.filter(function (l) { return l.twist === (taughtBy[id] || id); })[0];
    ok(!!T && L && L.world === T.world, 'twist ' + id + ' belongs to the world that teaches it (world ' + (T && T.world) + ', level ' + (L && L.id) + ')');
    if (!T.layout) ok(!!reg[id] && !reg[id].boss, 'twist ' + id + ' is a real rule module');
  });
  var ids = E.ORDER, pairs = 0, legal2 = 0, legal3 = 0, asym = 0;
  for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
    pairs++;
    if (!E.conflictReason(ids[i], ids[j]) !== !E.conflictReason(ids[j], ids[i])) asym++;
    if (E.legalSet([ids[i], ids[j]])) legal2++;
    for (var k = j + 1; k < ids.length; k++) if (E.legalSet([ids[i], ids[j], ids[k]])) legal3++;
  }
  ok(asym === 0, 'compatibility is symmetric');
  console.log('    ' + ids.length + ' twists, ' + legal2 + ' of ' + pairs + ' pairs and ' + legal3 + ' triples may share a round');
  [['redhot', 'bigsmall'], ['wrap', 'walls'], ['redblue', 'beat'], ['ice', 'thunder'], ['conveyor', 'walls'], ['orbit', 'brickfall'],
    ['lightsout', 'mirrors'], ['lightsout', 'portals'], ['double', 'squeeze'], ['runaway', 'conveyor'], ['brickfall', 'lockkey'], ['gusts', 'wells']].forEach(function (p) {
    ok(!E.compatible(p[0], p[1]), p[0] + ' and ' + p[1] + ' never share a round (' + E.conflictReason(p[0], p[1]) + ')');
  });
  ids.forEach(function (a) {
    var n = ids.filter(function (b) { return b !== a && E.compatible(a, b); }).length;
    ok(n >= 3, 'twist ' + a + ' has partners (' + n + ')');
  });

  section('Endless: players who have not finished act two get exactly the rounds they got before');
  (function () {
    // hashes of the rounds the phase-4 build generated for the same inputs (seeds 1-12, rounds 1-12)
    var WANT = { 1: 'bfdf93aa', 4: 'bf874b39', 7: '3d556c71', 8: '2bbdc4de' };
    function fnv(str, h) { h = h >>> 0; for (var q = 0; q < str.length; q++) { h ^= str.charCodeAt(q); h = Math.imul(h, 16777619) >>> 0; } return h; }
    [[1], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7], ALL8].forEach(function (ws) {
      var h = 2166136261;
      for (var sd = 1; sd <= 12; sd++) for (var rd = 1; rd <= 12; rd++) h = fnv(JSON.stringify(E.generate({ seed: sd * 7919 + 3, round: rd, preset: PRESETS[(sd + rd) % 3], worlds: ws })), h);
      ok(h.toString(16) === WANT[ws.length], 'Endless with Worlds 1-' + ws.length + ' finished: the same rounds as before act two (' + h.toString(16) + ')');
    });
    ok(E.pool(ALL8).every(function (id) { return E.TWISTS[id].world <= 8; }) && E.pool(ALL8).length === 25, 'the act-one pool is unchanged (25 twists)');
  })();

  section('Endless: generated rounds (fair, reachable, deterministic)');
  var t0 = Date.now(), WSETS = [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7], ALL8, [1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ALL];
  var NSEED = QUICK ? 12 : 50, NROUND = 30, n = 0, bad = {}, seenTw = {}, maxAtt = 0, sumAtt = 0;
  function fail(why, L) { bad[why] = (bad[why] || 0) + 1; if (bad[why] <= 2) console.log('    ' + why + ': seed ' + L.seed + ' round ' + L.round + ' ' + L.twists.join('+')); }
  WSETS.forEach(function (ws) {
    var allowed = E.pool(ws);
    for (var sd = 1; sd <= NSEED; sd++) for (var rd = 1; rd <= NROUND; rd++) {
      var preset = PRESETS[(sd + rd) % 3], seed = (sd * 2654435761 + ws.length) >>> 0;
      var L = E.generate({ seed: seed, round: rd, preset: preset, worlds: ws });
      n++; sumAtt += L.attempts; maxAtt = Math.max(maxAtt, L.attempts);
      if ((sd + rd) % 4 === 0 && JSON.stringify(L) !== JSON.stringify(E.generate({ seed: seed, round: rd, preset: preset, worlds: ws }))) fail('not deterministic', L);
      if (L.fallback) fail('fell back to the plain wall', L);
      L.twists.forEach(function (t) { seenTw[t] = true; if (allowed.indexOf(t) < 0) fail('twist from an unfinished world', L); });
      if (!E.legalSet(L.twists)) fail('illegal twist set', L);
      var want = rd >= C.endless.threeFrom ? 3 : 2;
      if (L.twists.length > want || (ws.length >= 8 && L.twists.length !== want) || L.twists.length < Math.min(2, allowed.length)) fail('wrong number of twists', L);
      if (L.twists.some(function (t) { return reg[t] && reg[t].power; }) && !(L.noCapsules && L.noCapsules.indexOf('laser') >= 0)) fail('a power round with lasers', L);
      var why = endlessReach(L);
      if (why) fail('unreachable: ' + why, L);
      why = endlessPlacement(L, preset, rd);
      if (why) fail(why, L);
    }
  });
  var badN = Object.keys(bad).reduce(function (a, k) { return a + bad[k]; }, 0);
  console.log('    ' + n + ' rounds in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, layout attempts avg ' + (sumAtt / n).toFixed(2) + ' max ' + maxAtt + (badN ? ', problems ' + JSON.stringify(bad) : ''));
  ok(badN === 0, 'every generated round is legal, reachable, deterministic and keeps the ball and paddle clear (' + n + ' rounds)');
  ok(ids.every(function (id) { return seenTw[id]; }), 'every twist in the pool turns up in some round (' + ids.filter(function (id) { return !seenTw[id]; }).join(',') + ')');
  // only finished worlds: World 1 alone gives only Fuse / Lock and Key; nothing from World 5+ with Worlds 1-4
  var only1 = true, upTo4 = true;
  for (var s1 = 1; s1 <= 40; s1++) for (var r1 = 1; r1 <= 12; r1++) {
    E.generate({ seed: s1, round: r1, worlds: [1] }).twists.forEach(function (t) { if (E.TWISTS[t].world !== 1) only1 = false; });
    E.generate({ seed: s1, round: r1, worlds: [1, 2, 3, 4] }).twists.forEach(function (t) { if (E.TWISTS[t].world > 4) upTo4 = false; });
  }
  ok(only1 && upTo4, 'Endless only draws twists from worlds finished on this device');
  ok(JSON.stringify(E.generate({ seed: 5, round: 3, worlds: ALL })) !== JSON.stringify(E.generate({ seed: 6, round: 3, worlds: ALL })), 'different seeds give different rounds');

  // it gets harder: more armour, more bricks, a faster ball, a third twist
  function stats(rd) {
    var hp = 0, bricks = 0, tw = 0;
    for (var sd = 1; sd <= 40; sd++) {
      var L = E.generate({ seed: sd, round: rd, preset: 'normal', worlds: ALL }), g = new BT.Game(L, 'normal', { seed: 1, preset: E.roundPreset('normal', rd) });
      g.bricks.forEach(function (b) { if (b.alive && b.required && b.breakable) { bricks++; hp += b.hp; } });
      tw += L.twists.length;
    }
    return { hpPer: hp / bricks, bricks: bricks / 40, tw: tw / 40, speed: E.roundPreset('normal', rd).speedStart, max: E.roundPreset('normal', rd).speedMax };
  }
  var st1 = stats(1), st8 = stats(8), st16 = stats(16);
  console.log('    round 1: ' + st1.bricks.toFixed(0) + ' bricks, ' + st1.hpPer.toFixed(2) + ' hits each, ball ' + st1.speed + '-' + st1.max + '; round 8: ' + st8.bricks.toFixed(0) + ', ' + st8.hpPer.toFixed(2) + ', ' + st8.speed + '-' + st8.max + ', ' + st8.tw.toFixed(1) + ' twists; round 16: ' + st16.bricks.toFixed(0) + ', ' + st16.hpPer.toFixed(2) + ', ' + st16.speed + '-' + st16.max);
  ok(st16.hpPer > st1.hpPer + 0.15 && st16.speed > st1.speed && st16.max > st1.max && st8.tw === 3 && st1.tw === 2 && st16.max <= C.ball.absMaxSpeed, 'rounds get harder: more armour, a faster ball, three twists from round ' + C.endless.threeFrom);
  var presetsOk = PRESETS.every(function (p) { var a = E.roundPreset(p, 1); return a.speedStart === C.presets[p].speedStart && a.lives === C.presets[p].lives && a.paddleW === C.presets[p].paddleW; });
  ok(presetsOk, 'round 1 uses the chosen difficulty preset unchanged');

  section('Endless: a safe opening');
  (function () {
    var bad2 = {}, nn = 0;
    for (var sd = 1; sd <= (QUICK ? 40 : 160); sd++) {
      var rd = 1 + (sd * 7) % 24, preset = PRESETS[sd % 3], L = E.generate({ seed: sd * 31, round: rd, preset: preset, worlds: ALL });
      var g = new BT.Game(L, preset, { seed: sd, preset: E.roundPreset(preset, rd) }), bot = new Bot(g, BT.mulberry32(sd));
      var lives0 = g.lives, frozen = 0, moved = 0, strikes = 0, crushed = 0;
      var origLose = g.loseLife; g.loseLife = function (why) { if (why === 'crushed') crushed++; return origLose.call(this, why); };
      g.tap();
      for (var st = 0; st < Math.round(3 / DT) - 1; st++) { // the first 3 seconds of play
        bot.act(DT); g.step(DT);
        if (g.paddle.frozen > 0) frozen++;
        if (g.wallL > 0 || g.wallR < C.W) moved++;
        g.rules.forEach(function (r) {
          if (r.id === 'squeeze' && r.s.offset > 0) moved++;
          if (r.id === 'thunder' && r.s.flash > 0) strikes++;
          if (r.id === 'gusts' && r.s.phase === 'gust') moved++;
          if (r.id === 'brickfall' && r.s.left < r.p.pieces) moved++;
          if (r.id === 'overgrown' && r.s.sprouts.length) moved++;
          if (r.id === 'hatch' && r.s.hatched) moved++;
          if (r.id === 'flip' && r.s.phase !== 'idle') moved++;
        });
      }
      nn++;
      if (frozen) bad2.frozen = (bad2.frozen || 0) + 1;
      if (moved) { bad2.hazard = (bad2.hazard || 0) + 1; console.log('    hazard early: ' + L.twists.join('+') + ' ' + preset + ' round ' + rd); }
      if (strikes) bad2.strike = (bad2.strike || 0) + 1;
      if (crushed) bad2.crushed = (bad2.crushed || 0) + 1;
      if (g.lives < lives0 && !g.state) bad2.lost = (bad2.lost || 0) + 1;
    }
    ok(!Object.keys(bad2).length, 'no hazard acts in the first 3 seconds after launch (' + nn + ' rounds) ' + JSON.stringify(bad2));
  })();

  section('Endless: bot runs (rounds reached, clear times)');
  function runEndless(seed, preset, worlds, maxRound, clumsy) {
    var rng = BT.mulberry32(seed * 977 + 3), lives = C.presets[preset].lives, score = 0, round = 1, times = [], stuck = 0;
    var rep = { speed: 0, outside: 0, inside: 0 };
    while (round <= maxRound) {
      var L = E.generate({ seed: seed, round: round, preset: preset, worlds: worlds });
      var g = new BT.Game(L, preset, { seed: seed * 1000 + round, preset: E.roundPreset(preset, round) });
      g.lives = lives; g.score = score;
      var bot = new Bot(g, rng, clumsy), steps = 0, limit = Math.round(600 / DT);
      while (g.state !== 'won' && g.state !== 'lost' && steps < limit) {
        bot.act(DT); g.step(DT); steps++;
        checkBalls(g, rep);
        if (!g.wrapX && (g.paddle.x - g.paddle.w / 2 < g.wallL - 0.01 || g.paddle.x + g.paddle.w / 2 > g.wallR + 0.01)) rep.outside++;
      }
      if (g.state !== 'won') { if (g.state !== 'lost') stuck++; break; }
      times.push(steps * DT);
      lives = Math.min(C.endless.maxLives, g.lives + (round % C.endless.lifeEvery === 0 ? 1 : 0)); score = g.score;
      round++;
    }
    return { reached: round, cleared: times.length, times: times, rep: rep, stuck: stuck, score: score };
  }
  var runs = [];
  // the act-one runs, exactly as before (all eight act-one worlds), then the same with act two finished
  [1, 2, 3, 4, 5, 6].slice(0, QUICK ? 3 : 6).forEach(function (sd) { runs.push({ label: 'Normal, Worlds 1-8, seed ' + sd, need: 10, r: runEndless(sd, 'normal', ALL8, 12) }); });
  [21, 22, 23, 24, 25, 26].slice(0, QUICK ? 2 : 6).forEach(function (sd) { runs.push({ label: 'Normal, all 11 worlds, seed ' + sd, need: 10, r: runEndless(sd, 'normal', ALL, 12) }); });
  if (!QUICK) {
    runs.push({ label: 'Easy, Worlds 1-8, seed 7', need: 10, r: runEndless(7, 'easy', ALL8, 12) });
    runs.push({ label: 'Hard, Worlds 1-8, seed 8', need: 10, r: runEndless(8, 'hard', ALL8, 12) });
    runs.push({ label: 'Easy, all 11 worlds, seed 27', need: 10, r: runEndless(27, 'easy', ALL, 12) });
    runs.push({ label: 'Hard, all 11 worlds, seed 28 (info)', need: 0, r: runEndless(28, 'hard', ALL, 12) });
    runs.push({ label: 'Normal, World 1 only, seed 9', need: 10, r: runEndless(9, 'normal', [1], 11) });
    runs.push({ label: 'Normal, Worlds 1-4, seed 10', need: 10, r: runEndless(10, 'normal', [1, 2, 3, 4], 11) });
    runs.push({ label: 'Clumsy bot on Easy, seed 11 (info)', need: 0, r: runEndless(11, 'easy', ALL, 12, true) });
    runs.push({ label: 'Clumsy bot on Normal, seed 12 (info)', need: 0, r: runEndless(12, 'normal', ALL, 12, true) });
  }
  var allTimes = [];
  runs.forEach(function (x) {
    var r = x.r, ts = r.times.slice().sort(function (a, b) { return a - b; });
    allTimes = allTimes.concat(x.need ? r.times : []);
    console.log('  ' + pad(x.label, 38) + ' cleared ' + r.cleared + ' rounds, reached round ' + r.reached + ', score ' + r.score +
      ', clear median ' + (ts.length ? ts[(ts.length - 1) >> 1].toFixed(0) : '-') + 's max ' + (ts.length ? ts[ts.length - 1].toFixed(0) : '-') + 's');
    if (x.need) ok(r.cleared >= x.need, x.label + ': the bot clears at least ' + x.need + ' rounds (' + r.cleared + ')');
    ok(r.stuck === 0, x.label + ': no round is ever stuck (every round ends within 600s)');
    ok(r.rep.speed === 0 && r.rep.outside === 0 && r.rep.inside === 0, x.label + ': no tunnelling, ball always inside the field, never over max speed ' + JSON.stringify(r.rep));
  });
  allTimes.sort(function (a, b) { return a - b; });
  if (allTimes.length) console.log('    clear times over ' + allTimes.length + ' rounds: median ' + allTimes[(allTimes.length - 1) >> 1].toFixed(0) + 's, 90% under ' + allTimes[Math.floor(allTimes.length * 0.9)].toFixed(0) + 's, slowest ' + allTimes[allTimes.length - 1].toFixed(0) + 's');
  // the same seed plays out the same way
  var a1 = runEndless(3, 'normal', ALL, 3), a2 = runEndless(3, 'normal', ALL, 3);
  ok(JSON.stringify(a1) === JSON.stringify(a2), 'an Endless run is deterministic for a seed');

  section('Endless: unlocking and save');
  (function () {
    var cleared = function (n) { return function (id) { return id <= n; }; };
    ok(!E.unlocked(cleared(4)) && E.unlocked(cleared(5)), 'Endless is locked until World 1 is finished (level 5 cleared)');
    ok(JSON.stringify(E.completedWorlds(cleared(5))) === '[1]' && JSON.stringify(E.completedWorlds(cleared(24))) === '[1,2,3,4]' && E.completedWorlds(cleared(40)).length === 8, 'finished worlds follow the cleared boss levels');
    C.endless.unlockAll = true;
    ok(E.unlocked(cleared(0)) && E.completedWorlds(cleared(0)).length === 11, 'the CONFIG flag unlocks Endless and every twist for testing');
    C.endless.unlockAll = false;
    ok(JSON.stringify(E.completedWorlds(cleared(45))) === '[1,2,3,4,5,6,7,8,9]' && E.completedWorlds(cleared(55)).length === 11, 'finishing a world of act two adds its twists');

    function MemStore(init) { this.m = init || {}; }
    MemStore.prototype.getItem = function (k) { return this.m.hasOwnProperty(k) ? this.m[k] : null; };
    MemStore.prototype.setItem = function (k, v) { this.m[k] = String(v); };
    var S = BT.Save;
    // a phase-3 save (the whole campaign played, no Endless yet) loads untouched
    var p3 = { v: 2, progress: {}, difficulty: 'hard', muted: true, seen: { capsules: true, 'boss-machine': true } };
    for (var li = 1; li <= 40; li++) p3.progress[li] = { stars: (li % 3) + 1, best: li * 100, cleared: true };
    var st = new MemStore(); st.m[C.saveKey] = JSON.stringify(p3);
    S.init(st);
    var same = true;
    for (li = 1; li <= 40; li++) { var inf = S.levelInfo(li); if (inf.stars !== (li % 3) + 1 || inf.best !== li * 100 || !inf.cleared) same = false; }
    ok(same && S.data.difficulty === 'hard' && S.data.muted && S.data.seen['boss-machine'] && S.data.v === C.saveVersion, 'a phase-3 save loads with every level, star, score and setting untouched');
    ok(S.endlessBest('normal').round === 0 && S.endlessBest('hard').score === 0, 'and starts with no Endless bests');
    var nb = S.recordEndless('hard', 7, 4321);
    ok(nb.round && nb.score && S.endlessBest('hard').round === 7, 'a first Endless run sets both bests');
    var again = new MemStore(st.m); S.init(again);
    ok(S.endlessBest('hard').round === 7 && S.endlessBest('hard').score === 4321 && S.levelInfo(40).stars === 2 && S.totalStars() === p3Total(), 'Endless bests persist and the campaign is still untouched');
    nb = S.recordEndless('hard', 5, 9000);
    ok(!nb.round && nb.score && S.endlessBest('hard').round === 7 && S.endlessBest('hard').score === 9000, 'bests only go up (round and score kept separately)');
    S.recordEndless('easy', 12, 100);
    ok(S.endlessBest('easy').round === 12 && S.endlessBest('normal').round === 0 && S.endlessBest('hard').round === 7, 'separate bests per difficulty');
    var junk = { v: 2, progress: { 1: { stars: 1, best: 5, cleared: true } }, endless: { normal: { round: 'x', score: -4 }, bogus: { round: 3 }, hard: 'no' } };
    var st2 = new MemStore(); st2.m[C.saveKey] = JSON.stringify(junk);
    S.init(st2);
    ok(S.endlessBest('normal').round === 0 && !S.data.endless.bogus && S.endlessBest('hard').round === 0 && S.levelInfo(1).stars === 1, 'broken Endless entries are dropped without touching progress');
    var v1 = { version: 1, stars: { 1: 2 }, best: { 1: 50 } }, st3 = new MemStore(); st3.m[C.saveKey] = JSON.stringify(v1);
    S.init(st3);
    ok(S.levelInfo(1).stars === 2 && S.endlessBest('normal').round === 0, 'a v1 save still migrates (no Endless bests)');
    S.init(null);
    function p3Total() { var t = 0; for (var q = 1; q <= 40; q++) t += (q % 3) + 1; return t; }
  })();
}

// Independent reachability check for an Endless round (not the generator's own): every required brick can be
// reached from the open area; the key while the padlocks are still shut; every unbreakable brick that has to be
// hit (anchor, switch, splitter, pusher) has an open side. Sliding rows count as open; edges join with no side
// walls; portals link their two cells.
function endlessReach(L) {
  var grid = L.grid, rows = grid.length, cols = C.grid.cols, conv = {}, wrap = false, links = {};
  (L.rules || []).forEach(function (ru) {
    if (ru.id === 'conveyor') for (var k in ru.rows) conv[k] = true;
    if (ru.id === 'wrap') wrap = true;
    if (ru.id === 'portals') ru.pairs.forEach(function (pr) { var a = cell(pr[0]), b = cell(pr[1]); links[a] = b; links[b] = a; });
  });
  function cell(p) { return Math.floor((p.y - C.grid.top) / C.grid.cellH) + ',' + Math.floor(p.x / C.grid.cellW); }
  function flood(lockedOpen) {
    var seen = {}, q = [], maxR = Math.max(rows, 21) + 8;
    for (var c = 0; c < cols; c++) q.push([maxR - 1, c]);
    while (q.length) {
      var cur = q.shift(), r = cur[0], c2 = cur[1];
      if (wrap) c2 = (c2 + cols) % cols;
      var key = r + ',' + c2;
      if (r < 0 || r >= maxR || c2 < 0 || c2 >= cols || seen[key]) continue;
      if (r < rows && !conv[r]) {
        var ch = grid[r][c2];
        var open = ch === '.' || GRID_BREAKABLE.indexOf(ch) >= 0 && ch !== 'L' || (ch === 'L' && lockedOpen);
        if (!open) continue;
      }
      seen[key] = true;
      q.push([r + 1, c2], [r - 1, c2], [r, c2 + 1], [r, c2 - 1]);
      if (links[key]) q.push(links[key].split(',').map(Number));
    }
    return seen;
  }
  var shut = flood(false), opened = flood(true), required = 0;
  for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
    var ch = grid[r][c], key = r + ',' + c;
    if (ch === 'K' && !shut[key]) return 'key ' + key;
    if (GRID_BREAKABLE.indexOf(ch) >= 0) { required++; if (!opened[key]) return 'brick ' + ch + ' ' + key; }
    if ('ASXH'.indexOf(ch) >= 0 && !conv[r] && !(shut[(r + 1) + ',' + c] || shut[(r - 1) + ',' + c] || shut[r + ',' + (c + 1)] || shut[r + ',' + (c - 1)])) return ch + ' cannot be hit ' + key;
  }
  if (grid.join('').indexOf('L') >= 0 && grid.join('').indexOf('K') < 0) return 'padlocks without a key';
  if (!required && !(L.rules || []).some(function (ru) { return ru.id === 'orbit' || ru.id === 'pendulum'; })) return 'nothing to break';
  return null;
}

// Build the round as a game and check what is where at the start: bricks clear of the serve ball and paddle,
// rule elements (bumpers, planets, portals, mirrors) clear of bricks, of each other and of the paddle zone.
function endlessPlacement(L, preset, round) {
  var g = new BT.Game(L, preset, { seed: 1, preset: BT.Endless.roundPreset(preset, round) }), P = BT.Physics, b0 = g.balls[0], i;
  var need = 0;
  g.bricks.forEach(function (b) { if (b.alive && (b.required || b.type === 'core')) need++; });
  if (!need) return 'nothing required';
  if (g.isCleared()) return 'cleared at the start';
  for (i = 0; i < g.bricks.length; i++) {
    var b = g.bricks[i];
    if (!b.alive) continue;
    if (b.y + b.h > 470) return 'brick in the paddle zone';
    if (P.circleRect(b0.x, b0.y, b0.r + 8, b.x, b.y, b.w, b.h) > 0) return 'brick on the serve ball';
    if (b.x < -0.5 || b.x + b.w > C.W + 0.5 || b.y < C.TOP) return 'brick outside the field';
  }
  var els = [];
  g.rules.forEach(function (r) {
    if (r.id === 'pinball') r.p.bumpers.forEach(function (q) { els.push({ x: q.x, y: q.y, r: r.p.bumperRadius }); });
    if (r.id === 'wells') r.p.planets.forEach(function (q) { els.push({ x: q.x, y: q.y, r: r.p.planetRadius }); });
    if (r.id === 'portals') r.s.pos.forEach(function (q) { els.push({ x: q.x, y: q.y, r: r.p.radius }); });
  });
  g.deflectors.forEach(function (d) { els.push({ x: d.x, y: d.y, r: d.len / 2 + d.thick }); });
  for (i = 0; i < els.length; i++) {
    var e = els[i];
    if (e.y + e.r > 470 || e.y - e.r < C.TOP || e.x - e.r < 0 || e.x + e.r > C.W) return 'element out of place';
    for (var j = i + 1; j < els.length; j++) if (Math.hypot(els[j].x - e.x, els[j].y - e.y) < e.r + els[j].r + 2 * C.ball.radius) return 'elements touching';
    for (var k = 0; k < g.bricks.length; k++) { var bk = g.bricks[k]; if (bk.alive && P.circleRect(e.x, e.y, e.r + C.ball.radius, bk.x, bk.y, bk.w, bk.h) > 0) return 'element on a brick'; }
    if (Math.hypot(e.x - b0.x, e.y - b0.y) < e.r + 60) return 'element on the serve ball';
  }
  if (g.wallL !== 0 || g.wallR !== C.W) return 'walls start moved in';
  return null;
}
