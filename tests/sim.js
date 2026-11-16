// Headless test for Brick Twist. Run: node tests/sim.js
// Loads the pure-logic source files (no DOM) and checks physics, levels, a bot playthrough and save data.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SRC = path.join(__dirname, '..', 'src');
['config.js', 'physics.js', 'bricks.js', 'rules.js', 'bosses.js', 'levels.js', 'game.js', 'save.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });
});
var BT = globalThis.BT, C = BT.CONFIG;

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL: ' + msg); } }
function section(name) { console.log('\n== ' + name); }
var QUICK = process.argv.indexOf('--quick') >= 0;
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
var GRID_BREAKABLE = 'roygcbpmw23TKCL';
(function () {
  ok(BT.LEVELS.length === 15, '15 levels in phase 1');
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
  // portal links (cell of each portal centre)
  var links = {};
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
function Bot(g, rng, clumsy) {
  this.g = g; this.rng = rng; this.offset = 0; this.lastDir = 0; this.wait = 0.4; this.fire = 0;
  this.clumsy = !!clumsy; this.finger = g.paddle.x; this.think = 0; this.goal = g.paddle.x; this.err = 0;
}
Bot.prototype.act = function (dt) {
  var g = this.g, p = g.paddle, i, best = null, bestT = 1e9;
  for (i = 0; i < g.balls.length; i++) {
    var b = g.balls[i];
    if (b.stuck) { this.wait -= dt; if (this.wait <= 0) { g.tap(); this.wait = 0.3 + this.rng() * 0.4; } continue; }
    if (b.vy > 0) {
      var t = (p.y - b.y) / b.vy;
      if (t < bestT) { bestT = t; best = b; }
    }
  }
  var target = p.x;
  if (best) {
    var lx = BT.Physics.predictLandingX(best.x, best.y, best.vx, best.vy, p.y - p.h / 2 - best.r, best.r, C.W - best.r);
    // pick a new aim offset each time a fresh ball approach starts
    if (this.lastDir <= 0) this.offset = (this.rng() * 2 - 1) * p.w * 0.38;
    target = lx - this.offset + (this.rng() - 0.5) * 4;
    this.lastDir = 1;
  } else {
    this.lastDir = -1;
    for (i = 0; i < g.balls.length; i++) if (!g.balls[i].stuck) { target = target * 0.98 + g.balls[i].x * 0.02; break; }
  }
  if (this.clumsy) {
    this.think -= dt;
    if (this.think <= 0) { // re-plan only every ~0.3s, sometimes badly
      this.think = 0.25 + this.rng() * 0.15;
      if (this.lastDir > 0 && this.rng() < 0.5) this.err = (this.rng() * 2 - 1) * p.w * 0.35;
      this.goal = target + this.err;
    }
    var maxMove = 420 * dt; // a slow, careful thumb
    this.finger += Math.max(-maxMove, Math.min(maxMove, this.goal - this.finger));
    target = this.finger;
  }
  if (g.eff.flip > 0) target = C.W - target;
  g.pointTo(target);
  if (g.eff.laser > 0) { this.fire -= dt; if (this.fire <= 0) { g.tap(); this.fire = 0.3; } }
};

function checkBalls(g, report) {
  for (var i = 0; i < g.balls.length; i++) {
    var b = g.balls[i];
    if (b.stuck) continue;
    var sp = Math.hypot(b.vx, b.vy);
    if (sp > C.ball.absMaxSpeed + 1e-6) report.speed++;
    if (b.x < b.r - 0.01 || b.x > C.W - b.r + 0.01 || b.y < C.TOP + b.r - 0.01 || !(b.x === b.x) || !(b.y === b.y)) report.outside++;
  }
}

function playLevel(L, preset, seed, limitSec, clumsy) {
  var rng = BT.mulberry32(seed * 7919 + 13);
  var total = 0, gameOvers = 0, steps = Math.round(limitSec / DT);
  var report = { speed: 0, outside: 0 };
  while (total < steps) {
    var g = new BT.Game(L, preset, { seed: seed + gameOvers * 101 });
    var bot = new Bot(g, rng, clumsy);
    while (total < steps) {
      bot.act(DT);
      g.step(DT);
      total++;
      checkBalls(g, report);
      if (g.state === 'won') return { won: true, time: total * DT, gameOvers: gameOvers, report: report, stars: g.result.stars, lives: g.livesLost };
      if (g.state === 'lost') { gameOvers++; break; }
    }
  }
  return { won: false, time: total * DT, gameOvers: gameOvers, report: report };
}

section('Bot playthrough (Normal' + (QUICK ? ', quick' : '') + ')');
var LIMIT = 600; // game seconds per level, across retries
var seeds = QUICK ? [1] : [1, 2, 3];
var t0 = Date.now();
BT.LEVELS.forEach(function (L) {
  var times = [], go = 0, rep = { speed: 0, outside: 0 }, wins = 0, stars = [];
  seeds.forEach(function (sd) {
    var r = playLevel(L, 'normal', sd, LIMIT);
    if (r.won) { wins++; times.push(r.time); stars.push(r.stars); }
    go += r.gameOvers; rep.speed += r.report.speed; rep.outside += r.report.outside;
  });
  times.sort(function (a, b) { return a - b; });
  var med = times.length ? times[(times.length - 1) >> 1] : NaN;
  console.log('  L' + (L.id < 10 ? ' ' : '') + L.id + ' ' + pad(L.name, 15) + ' cleared ' + wins + '/' + seeds.length +
    '  median ' + (med === med ? med.toFixed(0) + 's' : '-') + '  game-overs ' + go + '  stars ' + stars.join(',') + '  par ' + L.par);
  ok(wins === seeds.length, 'bot clears level ' + L.id + ' within ' + LIMIT + 's');
  ok(rep.speed === 0, 'level ' + L.id + ' ball never exceeds max speed (' + rep.speed + ')');
  ok(rep.outside === 0, 'level ' + L.id + ' ball never leaves the playfield (' + rep.outside + ')');
});

section('Bot on Easy, World 1');
BT.LEVELS.filter(function (L) { return L.world === 1; }).forEach(function (L) {
  var r = playLevel(L, 'easy', 5, LIMIT);
  console.log('  L' + L.id + ' ' + pad(L.name, 15) + (r.won ? ' cleared in ' + r.time.toFixed(0) + 's, lives lost ' + r.lives + ', game-overs ' + r.gameOvers : ' NOT cleared'));
  ok(r.won, 'bot clears level ' + L.id + ' on Easy');
});

section('Clumsy bot (slow reactions, poor aim) on Easy, World 1');
BT.LEVELS.filter(function (L) { return L.world === 1; }).forEach(function (L) {
  var res = [1, 2, 3].map(function (sd) { return playLevel(L, 'easy', sd, LIMIT, true); });
  var won = res.filter(function (r) { return r.won; }).length;
  var go = res.reduce(function (a, r) { return a + r.gameOvers; }, 0);
  console.log('  L' + L.id + ' ' + pad(L.name, 15) + ' cleared ' + won + '/3, game-overs ' + go + ', times ' + res.map(function (r) { return r.time.toFixed(0) + 's'; }).join(' '));
  ok(won === 3, 'clumsy bot clears level ' + L.id + ' on Easy');
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
})();

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

  var bad = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('denied'); } };
  var threw = false;
  try { S.init(bad); S.record(1, 3, 10); S.setMuted(true); } catch (e) { threw = true; }
  ok(!threw, 'throwing storage does not break the game');
  ok(S.levelInfo(1).stars === 3, 'progress kept in memory when storage throws');
  S.init(null); ok(S.isUnlocked(1), 'no storage at all still works');
  var junk = new MemStore(); junk.m[C.saveKey] = '{not json';
  S.init(junk); ok(S.data.v === C.saveVersion, 'corrupt save falls back to defaults');
})();

console.log('\n' + (checks - failures) + '/' + checks + ' checks passed' + (failures ? ', ' + failures + ' FAILED' : ''));
process.exit(failures ? 1 : 0);
