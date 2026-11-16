// Level state: paddle, balls, bricks, capsules, lasers, lives, score, combo, rules. No DOM.
// Outside code (main.js) plugs sound/particles in through game.fx.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, P = BT.Physics, HIT = BT.Physics.HIT;
  var NOOP = function () {};

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Game(level, presetName, opts) {
    opts = opts || {};
    this.cfg = C;
    this.level = level;
    this.presetName = presetName;
    // opts.preset: a full preset object to use instead (Endless passes one with its round's ball speeds)
    this.preset = opts.preset || C.presets[presetName] || C.presets.normal;
    this.rng = mulberry32(opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0));
    this.fx = {
      sound: NOOP, burst: NOOP, ring: NOOP, text: NOOP, shake: NOOP
    };
    if (opts.fx) for (var k in opts.fx) this.fx[k] = opts.fx[k];

    this.t = 0;              // level time (animations)
    this.clock = 0;          // play time for par (only while a ball is in play)
    this.sinceLaunch = 0;
    this.sinceHit = 0;
    this.state = 'serve';    // serve | play | clearing | won | lost
    this.lives = this.preset.lives;
    this.livesLost = 0;
    this.score = 0;
    this.combo = 0;
    this.paddleHits = 0;
    this.ballSpeed = this.preset.speedStart;
    this.timeScale = 1;
    this.clearTimer = 0;
    this.result = null;
    this.keyDir = 0;
    this.netActive = !!this.preset.net;
    this.netFlash = 0;
    this.shakeAmt = 0;
    this.bomb = false;
    this.laserCd = 0;
    this.autoFireT = 0;
    this.eff = { long: 0, slow: 0, 'catch': 0, laser: 0, shrink: 0, flip: 0, daze: 0 };
    this.blasts = [];
    this.balls = [];
    this.bricks = [];
    this.capsules = [];
    this.lasers = [];
    for (var i = 0; i < 24; i++) this.lasers.push({ x: 0, y: 0, alive: false });

    var pw = this.preset.paddleW;
    this.paddle = {
      x: C.W / 2, y: C.paddle.y, w: pw, h: C.paddle.h, targetX: C.W / 2,
      prevX: C.W / 2, vx: 0, kv: 0, squash: 0, hitFlash: 0,
      off: false,             // a rule can switch the paddle off (the ball falls straight through)
      frozen: 0,              // seconds the paddle cannot move (the finger can still aim: it catches up after)
      speedCap: 0,            // px/s cap on paddle movement this step (0 = CONFIG.paddle.maxSpeed)
      iv: 0                   // ice velocity (only used while g.paddleIce is set)
    };

    // Engine extension points that rules switch on in init (all off by default):
    this.xpaddles = [];       // extra paddles, see addXPaddle (mirror paddle at the top, a computer rival)
    this.wrapX = false;       // no side walls: ball and paddle wrap across the left/right edges
    this.topOpen = false;     // no top wall: a ball that leaves through the top is lost
    this.ghosting = false;    // some bricks can turn non-solid (see makeGhostable / resolveSolidity)
    this.attempts = 0;        // retries of this level without a restart (see retry)
    this.resetExtensions();

    this.buildGrid(level.grid || []);
    this.rules = [];
    this.boss = null;
    var rl = level.rules || [];
    for (var r = 0; r < rl.length; r++) this.addRule(rl[r]);
    this.finalizeBricks();
    this.newServeBall();
  }

  var G = Game.prototype;

  // ---------- setup ----------
  G.buildGrid = function (grid) {
    var g = C.grid;
    var ox = (g.cellW - g.brickW) / 2, oy = (g.cellH - g.brickH) / 2;
    for (var row = 0; row < grid.length; row++) {
      var line = grid[row];
      for (var col = 0; col < line.length; col++) {
        var b = BT.Bricks.fromChar(line[col], col * g.cellW + ox, g.top + row * g.cellH + oy, g.brickW, g.brickH);
        if (!b) continue;
        b.row = row; b.col = col; b.grid = true;
        this.bricks.push(b);
      }
    }
  };

  G.addBrick = function (b) { this.bricks.push(b); return b; };

  G.addRule = function (spec) {
    var mod = BT.Rules.registry[spec.id];
    if (!mod) throw new Error('Unknown rule: ' + spec.id);
    var defaults = (mod.boss ? C.bosses[spec.id] : C.rules[spec.id]) || {};
    var p = {};
    var k;
    for (k in defaults) p[k] = defaults[k];
    for (k in spec) if (k !== 'id') p[k] = spec[k];
    var inst = { id: spec.id, mod: mod, p: p, s: {} };
    this.rules.push(inst);
    if (mod.init) mod.init(this, inst);
    if (mod.boss && !this.boss) this.boss = inst;
    return inst;
  };

  G.finalizeBricks = function () {
    var bs = this.bricks;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      b.x = b.bx + b.dx; b.y = b.by + b.dy;
    }
  };

  // Phase-3 extension points, all off by default (see the notes at the end of this file).
  G.resetExtensions = function () {
    this.wallL = 0;           // side walls: the playfield is wallL..wallR (a rule may move them inward)
    this.wallR = C.W;
    this.paddleIce = null;    // { follow, grip, bounce }: paddle slides with momentum instead of following directly
    this.deflectors = [];     // angled panels the ball bounces off, see addDeflector
  };

  G.newBall = function (x, y, vx, vy) {
    var n = C.ball.trailLength;
    var ball = {
      x: x, y: y, vx: vx || 0, vy: vy || 0, r: C.ball.radius, prevX: x, prevY: y,
      stuck: false, stuckOffset: 0, stuckTimer: 0, boost: 1, dead: false,
      portalLock: -1, trail: new Float32Array(n * 2), trailN: 0, trailI: 0, id: 0,
      pierce: 0,              // bricks it may still burn straight through without bouncing
      sizeMul: 1,             // speed factor for this kind of ball (rules set it: e.g. a big slow ball)
      zoneMul: 1,             // speed factor from where the ball is (rules set it: e.g. under water)
      kind: null, deflectChain: 0
    };
    this.balls.push(ball);
    return ball;
  };

  G.newServeBall = function () {
    this.balls.length = 0;
    var p = this.paddle;
    var b = this.newBall(p.x, p.y - p.h / 2 - C.ball.radius, 0, 0);
    b.stuck = true; b.stuckOffset = 0; b.serve = true;
    for (var i = 0; i < this.rules.length; i++) { // e.g. serve a big ball
      var r = this.rules[i];
      if (r.mod.onServeBall) r.mod.onServeBall(this, r, b);
    }
    return b;
  };

  G.hazardsActive = function (grace) {
    return this.state === 'play' && this.sinceLaunch >= (grace || 0);
  };

  G.speed = function () {
    return this.ballSpeed * (this.eff.slow > 0 ? C.capsule.slowMult : 1);
  };

  G.normalizeBall = function (ball) {
    var s = Math.min(this.speed() * ball.boost * ball.sizeMul * ball.zoneMul, C.ball.absMaxSpeed);
    P.normalizeVel(ball, s, C.ball.minVyFrac);
  };

  // ---------- input API ----------
  G.dragBy = function (dx) {
    var s = C.paddle.touchSensitivity * (this.eff.flip > 0 ? -1 : 1);
    this.paddle.targetX += dx * s;
    this.clampTarget();
  };
  G.pointTo = function (x) {
    this.paddle.targetX = this.eff.flip > 0 ? C.W - x : x;
    if (this.wrapX) this.paddle.targetX = this.paddle.x + this.wrapDelta(this.paddle.targetX - this.paddle.x);
    this.clampTarget();
  };
  G.clampTarget = function () {
    if (this.wrapX) return;
    var hw = this.paddle.w / 2 + C.paddle.edgeMargin;
    this.paddle.targetX = P.clamp(this.paddle.targetX, this.wallL + hw, this.wallR - hw);
  };

  // Tap / click / Space: launch, release a caught ball, fire lasers.
  G.tap = function () {
    if (this.state !== 'serve' && this.state !== 'play') return;
    var released = false;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.stuck) { this.releaseBall(b); released = true; }
    }
    if (this.state === 'serve' && released) {
      this.state = 'play';
      this.sinceLaunch = 0;
    }
    if (this.eff.laser > 0) this.fireLaser();
  };

  G.releaseBall = function (b) {
    var p = this.paddle;
    var a;
    if (b.serve) {
      var spread = C.ball.launchSpreadDeg;
      a = (this.rng() * 2 - 1) * spread * P.DEG;
      a += P.clamp(p.vx * C.ball.englishPerSpeed, -C.ball.englishMaxDeg, C.ball.englishMaxDeg) * P.DEG;
    } else {
      a = P.paddleAngle(b.x, p.x, p.w / 2, p.vx, C.ball);
    }
    var s = this.speed() * b.sizeMul * b.zoneMul;
    b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
    b.stuck = false; b.serve = false;
    this.fx.sound('launch');
  };

  G.fireLaser = function () {
    if (this.laserCd > 0) return;
    this.laserCd = C.laser.cooldown;
    var p = this.paddle, n = 0;
    for (var i = 0; i < this.lasers.length && n < 2; i++) {
      var L = this.lasers[i];
      if (L.alive) continue;
      L.alive = true; L.x = n === 0 ? p.x - p.w / 2 + 6 : p.x + p.w / 2 - 6; L.y = p.y - p.h / 2;
      if (this.wrapX) L.x = this.wrapPos(L.x);
      n++;
    }
    this.fx.sound('laser');
  };

  // ---------- main step ----------
  G.step = function (dt) {
    if (this.state === 'won' || this.state === 'lost') { this.t += dt; return; }
    this.t += dt;
    if (this.state === 'play' || this.state === 'clearing') { this.clock += dt; this.sinceLaunch += dt; }
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - C.shake.decay * dt);
    if (this.netFlash > 0) this.netFlash -= dt;

    this.updateEffects(dt);
    this.updatePaddle(dt);

    // rules move bricks: reset offsets, let rules write base positions / offsets, then finalize
    var bs = this.bricks, i;
    for (i = 0; i < bs.length; i++) { bs[i].dx = 0; bs[i].dy = 0; if (bs[i].flash > 0) bs[i].flash -= dt; }
    for (i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.mod.update) r.mod.update(this, r, dt);
      if (this.state === 'lost') return;
    }
    this.finalizeBricks();
    if (this.ghosting) this.resolveSolidity(dt);

    this.updateBlasts(dt);
    this.updateBalls(dt);
    this.updateCapsules(dt);
    this.updateLasers(dt);

    if (this.state === 'play') {
      this.sinceHit += dt;
      if (this.sinceHit > C.ball.stuckSeconds) this.nudgeBalls();
    }

    // prune occasionally (dead bricks are skipped everywhere, compaction keeps loops short)
    if ((this.t * 4 | 0) !== ((this.t - dt) * 4 | 0)) this.compact();

    if (this.state === 'play' && this.isCleared()) this.beginClear();
    if (this.state === 'clearing') {
      this.clearTimer += dt;
      this.timeScale = C.slowmo.scale;
      if (this.clearTimer >= C.slowmo.duration * C.slowmo.scale) this.finishWin();
    }
  };

  G.compact = function () {
    var bs = this.bricks, j = 0;
    for (var i = 0; i < bs.length; i++) if (bs[i].alive || bs[i].keepDead) bs[j++] = bs[i];
    bs.length = j;
  };

  G.updateEffects = function (dt) {
    var e = this.eff;
    for (var k in e) if (e[k] > 0) { e[k] -= dt; if (e[k] < 0) e[k] = 0; }
    if (this.laserCd > 0) this.laserCd -= dt;
    if (e.laser > 0 && this.presetName === 'easy' && C.laser.autoFireOnEasy && this.state === 'play') {
      this.autoFireT -= dt;
      if (this.autoFireT <= 0) { this.autoFireT = C.laser.autoInterval; this.fireLaser(); }
    }
  };

  G.updatePaddle = function (dt) {
    var p = this.paddle, cp = C.paddle;
    var e = this.eff;
    var tw = this.preset.paddleW;
    if (e.long > 0) tw *= C.capsule.longMult;
    if (e.shrink > 0) tw *= C.capsule.shrinkMult;
    if (e.daze > 0) tw *= C.bosses.gatekeeper.dazeMult;
    p.w += (tw - p.w) * Math.min(1, cp.widthLerp * dt);

    var kd = this.keyDir * (e.flip > 0 ? -1 : 1);
    if (kd !== 0) {
      var want = kd * cp.keySpeed;
      var dv = want - p.kv, maxDv = cp.keyAccel * dt;
      p.kv += P.clamp(dv, -maxDv, maxDv);
      p.targetX = p.x + p.kv * dt;
    } else {
      p.kv = 0;
    }
    this.clampTarget();
    p.prevX = p.x;
    var cap = p.speedCap || cp.maxSpeed;
    var dx = p.targetX - p.x, maxStep = cap * dt;
    var inst;
    if (p.frozen > 0) { // frozen in place; the target keeps following the finger
      p.frozen -= dt; if (p.frozen < 0) p.frozen = 0;
      p.iv = 0; inst = 0;
    } else if (this.paddleIce) inst = this.slidePaddle(dt, dx, kd, cap);
    else if (this.wrapX) { // no walls: move freely, then wrap position and target together
      var mv = P.clamp(dx, -maxStep, maxStep);
      p.x += mv;
      if (p.x >= C.W) { p.x -= C.W; p.targetX -= C.W; } else if (p.x < 0) { p.x += C.W; p.targetX += C.W; }
      inst = mv / dt;
    } else {
      p.x += P.clamp(dx, -maxStep, maxStep);
      var hw = p.w / 2;
      p.x = P.clamp(p.x, this.wallL + hw, this.wallR - hw);
      inst = (p.x - p.prevX) / dt;
    }
    p.vx += (inst - p.vx) * 0.5;
    if (p.squash > 0) p.squash -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
  };

  // Ice: the paddle has momentum. It accelerates towards the finger and takes a moment to stop, so it
  // overshoots a little and slides back. follow: how hard it chases (1/s), grip: how quickly its speed
  // changes (1/s; lower = more slippery), bounce: how much speed it keeps when it hits a wall.
  G.slidePaddle = function (dt, dx, kd, cap) {
    var p = this.paddle, ice = this.paddleIce;
    var want = kd !== 0 ? p.kv : P.clamp(dx * ice.follow, -cap, cap);
    p.iv += (want - p.iv) * Math.min(1, ice.grip * dt);
    p.iv = P.clamp(p.iv, -cap, cap);
    var mv = p.iv * dt;
    p.x += mv;
    if (this.wrapX) {
      if (p.x >= C.W) { p.x -= C.W; p.targetX -= C.W; } else if (p.x < 0) { p.x += C.W; p.targetX += C.W; }
      return mv / dt;
    }
    var hw = p.w / 2, lo = this.wallL + hw, hi = this.wallR - hw;
    if (p.x < lo) { p.x = lo; if (p.iv < 0) p.iv = -p.iv * ice.bounce; }
    else if (p.x > hi) { p.x = hi; if (p.iv > 0) p.iv = -p.iv * ice.bounce; }
    return (p.x - p.prevX) / dt;
  };

  // ---------- balls ----------
  G.updateBalls = function (dt) {
    var balls = this.balls, p = this.paddle, i;
    for (i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.dead) continue;
      if (b.stuck) {
        b.x = this.wrapX ? this.wrapPos(p.x + b.stuckOffset) : P.clamp(p.x + b.stuckOffset, this.wallL + b.r, this.wallR - b.r);
        b.y = p.y - p.h / 2 - b.r;
        b.prevX = b.x; b.prevY = b.y;
        if (!b.serve) {
          b.stuckTimer += dt;
          if (b.stuckTimer > C.ball.catchHoldSeconds) this.releaseBall(b);
        }
        this.pushTrail(b);
        continue;
      }
      if (b.boost > 1) b.boost = Math.max(1, b.boost - C.ball.boostDecay * dt);
      this.moveBall(b, dt);
      if (!b.dead) {
        for (var r = 0; r < this.rules.length; r++) {
          var ru = this.rules[r];
          if (ru.mod.onBallStep) ru.mod.onBallStep(this, ru, b, dt);
        }
        this.normalizeBall(b);
        this.keepInside(b);
      }
      this.pushTrail(b);
    }
    // remove dead balls
    var j = 0;
    for (i = 0; i < balls.length; i++) if (!balls[i].dead) balls[j++] = balls[i];
    balls.length = j;
    if (j === 0 && (this.state === 'play' || this.state === 'serve')) this.loseLife('fell');
    if (j === 0 && this.state === 'clearing') this.newServeBall();
  };

  G.pushTrail = function (b) {
    var n = b.trail.length / 2;
    b.trail[b.trailI * 2] = b.x; b.trail[b.trailI * 2 + 1] = b.y;
    b.trailI = (b.trailI + 1) % n;
    if (b.trailN < n) b.trailN++;
  };

  G.keepInside = function (b) {
    if (this.wrapX) b.x = this.wrapPos(b.x);
    else {
      if (b.x < this.wallL + b.r) { b.x = this.wallL + b.r; if (b.vx < 0) b.vx = -b.vx; }
      if (b.x > this.wallR - b.r) { b.x = this.wallR - b.r; if (b.vx > 0) b.vx = -b.vx; }
    }
    if (b.y < C.TOP + b.r && !this.topOpen) { b.y = C.TOP + b.r; if (b.vy < 0) b.vy = -b.vy; }
    if (!(b.x === b.x) || !(b.y === b.y)) { // NaN guard
      b.x = this.paddle.x; b.y = 400; b.vx = 0; b.vy = -1; this.normalizeBall(b);
    }
  };

  G.moveBall = function (b, dt) {
    this.normalizeBall(b);
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var n = Math.max(1, Math.ceil(speed * dt / (b.r * 0.5)));
    var sdt = dt / n;
    b.prevX = b.x; b.prevY = b.y;
    var damaged = false;
    var p = this.paddle;
    for (var s = 0; s < n; s++) {
      b.x += b.vx * sdt; b.y += b.vy * sdt;

      // walls
      if (this.wrapX) {
        if (b.x < 0) b.x += C.W; else if (b.x >= C.W) b.x -= C.W;
      }
      else if (b.x < this.wallL + b.r) { b.x = this.wallL + b.r; if (b.vx < 0) { b.vx = -b.vx; this.fx.sound('wall'); } }
      else if (b.x > this.wallR - b.r) { b.x = this.wallR - b.r; if (b.vx > 0) { b.vx = -b.vx; this.fx.sound('wall'); } }
      if (this.topOpen) {
        if (b.y + b.r < C.TOP) { b.dead = true; b.exitTop = true; return; }
      }
      else if (b.y < C.TOP + b.r) { b.y = C.TOP + b.r; if (b.vy < 0) { b.vy = -b.vy; this.fx.sound('wall'); } }

      // paddle
      if (b.vy > 0 && !p.off) {
        var hw = p.w / 2, ph = p.h / 2, pxx = this.wrapX ? this.wrapNear(p.x, b.x) : p.x;
        if (P.circleRect(b.x, b.y, b.r, pxx - hw, p.y - ph, p.w, p.h) > 0) {
          if (b.y <= p.y + 1) this.paddleBounce(b, pxx);
          else { // clipped the side of the paddle: knock sideways, it is on its way out
            b.x = b.x < pxx ? pxx - hw - b.r : pxx + hw + b.r;
            b.vx = (b.x < pxx ? -1 : 1) * Math.abs(b.vx);
          }
        }
      }
      if (this.xpaddles.length) this.xpaddleCollide(b);

      // Easy safety net
      if (this.netActive && b.vy > 0 && b.y + b.r >= C.net.y && this.state !== 'clearing') {
        b.y = C.net.y - b.r; b.vy = -Math.abs(b.vy);
        this.netActive = false; this.netFlash = 0.6;
        this.fx.sound('net'); this.fx.text(b.x, C.net.y - 20, 'Saved!', '#7cf5ff');
        this.fx.burst(b.x, C.net.y, '#7cf5ff', 14, 'spark');
        this.combo = 0;
      }

      if (this.deflectors.length) this.deflectorCollide(b);

      // bricks (resolve up to two contacts: seams and inside corners)
      for (var pass = 0; pass < 2; pass++) {
        var hitB = this.deepestBrick(b);
        if (!hitB) break;
        if (b.pierce > 0 && hitB.breakable && !hitB.noPierce && this.pierceBrick(hitB, b)) continue;
        b.x += HIT.nx * HIT.depth; b.y += HIT.ny * HIT.depth;
        var nx = HIT.nx, ny = HIT.ny;
        var reflected = P.reflect(b, nx, ny);
        if (reflected) P.normalizeVel(b, speed, C.ball.minVyFrac);
        if (!damaged && reflected) {
          damaged = true;
          this.hitBrick(hitB, b, 'ball');
        }
      }

      if (b.y - b.r > C.H) { b.dead = true; return; }
    }
  };

  var bestN = { nx: 0, ny: 0, d: 0 };
  G.deepestBrick = function (b) {
    var bs = this.bricks, best = null, bestD = 0;
    var r = b.r, x = b.x, y = b.y;
    for (var i = 0; i < bs.length; i++) {
      var k = bs[i];
      if (!k.alive || !k.solid) continue;
      var d = 0;
      if (x + r > k.x && x - r < k.x + k.w && y + r > k.y && y - r < k.y + k.h) {
        d = P.circleRect(x, y, r, k.x, k.y, k.w, k.h);
      } else if (k.wrap) {
        var gx = k.x + k.w > C.W ? k.x - C.W : (k.x < 0 ? k.x + C.W : null);
        if (gx !== null) d = P.circleRect(x, y, r, gx, k.y, k.w, k.h);
      }
      if (d > bestD) { bestD = d; best = k; bestN.nx = HIT.nx; bestN.ny = HIT.ny; }
    }
    if (this.wrapX && (x < r || x > C.W - r)) { // the part of the ball showing on the other side
      var wx = x < r ? x + C.W : x - C.W;
      for (i = 0; i < bs.length; i++) {
        k = bs[i];
        if (!k.alive || !k.solid) continue;
        d = P.circleRect(wx, y, r, k.x, k.y, k.w, k.h);
        if (d > bestD) { bestD = d; best = k; bestN.nx = HIT.nx; bestN.ny = HIT.ny; }
      }
    }
    if (best) { HIT.nx = bestN.nx; HIT.ny = bestN.ny; HIT.depth = bestD; }
    return best;
  };

  G.paddleBounce = function (b, px) {
    var p = this.paddle;
    if (px === undefined) px = p.x;
    b.y = p.y - p.h / 2 - b.r;
    var a = P.paddleAngle(b.x, px, p.w / 2, p.vx, C.ball);
    var s = Math.min(this.speed() * b.boost * b.sizeMul * b.zoneMul, C.ball.absMaxSpeed);
    b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
    p.squash = C.paddle.squashTime;
    p.hitFlash = 0.1;
    this.combo = 0;
    this.paddleHits++;
    if (this.paddleHits % C.ball.speedUpEvery === 0) {
      this.ballSpeed = Math.min(this.preset.speedMax, this.ballSpeed + C.ball.speedUpStep);
    }
    this.fx.sound('paddle', a);
    if (this.eff['catch'] > 0 && this.state === 'play') {
      b.stuck = true; b.stuckOffset = b.x - px; b.stuckTimer = 0;
      b.vx = 0; b.vy = 0;
    }
    for (var i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.mod.onPaddleHit) r.mod.onPaddleHit(this, r, b);
    }
  };

  G.nudgeBalls = function () {
    var done = false;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.stuck || b.y > C.H * 0.62) continue;
      var deg = C.ball.nudgeMinDeg + this.rng() * (C.ball.nudgeMaxDeg - C.ball.nudgeMinDeg);
      P.rotateVel(b, (this.rng() < 0.5 ? -1 : 1) * deg * P.DEG);
      this.normalizeBall(b);
      done = true;
    }
    if (done) this.sinceHit = 0;
  };

  // ---------- bricks ----------
  G.hitBrick = function (k, ball, cause) {
    // note: only real progress (damage, rule effects) resets the no-hit timer, not steel clangs
    for (var i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.mod.onBrickHit && r.mod.onBrickHit(this, r, k, ball, cause)) return;
    }
    if (ball && this.bomb && cause === 'ball') {
      this.bomb = false;
      this.explode(k.x + k.w / 2, k.y + k.h / 2, C.bomb.radius, 'bomb');
      if (k.alive) this.damageBrick(k, ball, cause);
      return;
    }
    this.damageBrick(k, ball, cause);
  };

  G.damageBrick = function (k, ball, cause) {
    k.flash = 0.12;
    if (!k.breakable) {
      k.shake = 0.15;
      this.fx.sound(k.type === 'locked' ? 'locked' : 'steel');
      return;
    }
    this.sinceHit = 0;
    k.hp--;
    if (k.hp <= 0) this.destroyBrick(k, cause);
    else if (k.type === 'ice') { // a frozen brick thaws on its first hit
      this.fx.sound('thaw', this.combo);
      this.fx.burst(k.x + k.w / 2, k.y + k.h / 2, '#e6f7ff', 8, 'chip');
    } else {
      this.fx.sound('armour', this.combo);
      this.fx.burst(k.x + k.w / 2, k.y + k.h / 2, '#c9d6ee', 4, 'chip');
    }
  };

  G.destroyBrick = function (k, cause) {
    if (!k.alive) return;
    k.alive = false;
    this.sinceHit = 0;
    this.combo++;
    var mult = Math.min(this.combo, C.combo.maxMult);
    var pts = (C.score.brick + (k.maxHp - 1) * C.score.armourExtra) * mult;
    var cx = k.x + k.w / 2, cy = k.y + k.h / 2;
    this.score += pts;
    this.fx.burst(cx, cy, k.color, 10, 'chip');
    this.fx.sound('break', this.combo);
    if (this.combo >= 3) this.fx.text(cx, cy, 'x' + mult, '#ffffff');

    if (k.type === 'key') this.unlockAll(cx, cy);
    if (k.type === 'tnt') this.blasts.push({ x: cx, y: cy, r: C.tnt.radius, t: C.tnt.chainDelay });

    if (k.type === 'capsule' || k.cap) this.spawnCapsule(cx, cy, k.cap || null, true);
    else if (k.type === 'normal' || k.type === 'armour') {
      var ch = (this.level.capsuleChance != null ? this.level.capsuleChance : C.capsule.chance) * this.preset.capsuleMult;
      if (this.rng() < ch) this.spawnCapsule(cx, cy, null, false);
    }
    for (var i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.mod.onBrickDestroyed) r.mod.onBrickDestroyed(this, r, k, cause);
    }
  };

  G.unlockAll = function (x, y) {
    var bs = this.bricks;
    for (var i = 0; i < bs.length; i++) {
      var k = bs[i];
      if (k.alive && k.type === 'locked') {
        k.type = 'normal'; k.breakable = true; k.color = BT.Bricks.KEY_COLOR; k.flash = 0.4;
        this.fx.burst(k.x + k.w / 2, k.y + k.h / 2, '#ffe680', 4, 'spark');
      }
    }
    this.fx.sound('unlock');
    this.fx.text(x, y, 'Unlocked!', '#ffe680');
  };

  G.explode = function (x, y, radius, cause) {
    this.fx.sound('boom');
    this.fx.ring(x, y, radius, '#ffb347');
    this.fx.burst(x, y, '#ffb347', 18, 'spark');
    this.shakeAmt = Math.max(this.shakeAmt, C.shake.tnt);
    this.fx.shake(C.shake.tnt);
    var bs = this.bricks;
    for (var i = 0; i < bs.length; i++) {
      var k = bs[i];
      if (!k.alive || k.noBlast) continue;
      var d = P.circleRect(x, y, radius, k.x, k.y, k.w, k.h);
      if (d <= 2) continue;
      if (k.blastDamage) { this.hitBrick(k, null, 'blast'); continue; }
      this.destroyBrick(k, cause);
    }
  };

  G.updateBlasts = function (dt) {
    var q = this.blasts;
    if (!q.length) return;
    // only process blasts queued before this step; explode() appends chained ones at the end
    var n = q.length, j = 0, i;
    for (i = 0; i < n; i++) {
      var e = q[i];
      e.t -= dt;
      if (e.t <= 0) this.explode(e.x, e.y, e.r, 'tnt');
      else q[j++] = e;
    }
    for (i = n; i < q.length; i++) q[j++] = q[i];
    q.length = j;
  };

  // ---------- capsules ----------
  G.pickCapsule = function (goodOnly) {
    var w = C.capsule.weights, total = 0, k;
    var allowBad = this.preset.badCapsules && !goodOnly;
    for (k in w) if (this.capsuleAllowed(k, allowBad)) total += w[k];
    var r = this.rng() * total;
    for (k in w) {
      if (!this.capsuleAllowed(k, allowBad)) continue;
      r -= w[k];
      if (r <= 0) return k;
    }
    return 'long';
  };
  G.capsuleAllowed = function (k, allowBad) {
    if (C.capsule.bad.indexOf(k) >= 0 && !allowBad) return false;
    if (k === 'flip' && !C.capsule.flipEnabled) return false;
    if (k === 'life' && this.lives >= 9) return false;
    return true;
  };

  G.spawnCapsule = function (x, y, type, force) {
    var n = 0;
    for (var i = 0; i < this.capsules.length; i++) if (this.capsules[i].alive) n++;
    if (n >= C.capsule.maxOnScreen && !force) return;
    if (this.state === 'clearing') return;
    type = type || this.pickCapsule(force);
    // reuse a dead slot
    for (i = 0; i < this.capsules.length; i++) {
      var c = this.capsules[i];
      if (!c.alive) { c.alive = true; c.type = type; c.x = x; c.y = y; c.t = 0; return c; }
    }
    c = { alive: true, type: type, x: x, y: y, t: 0, vx: 0 };
    this.capsules.push(c);
    return c;
  };

  G.updateCapsules = function (dt) {
    var p = this.paddle, cw = C.capsule.w, chh = C.capsule.h;
    for (var i = 0; i < this.capsules.length; i++) {
      var c = this.capsules[i];
      if (!c.alive) continue;
      c.t += dt;
      c.y += C.capsule.fallSpeed * dt;
      c.x += (c.vx || 0) * dt;
      c.x = P.clamp(c.x, this.wallL + cw / 2, this.wallR - cw / 2);
      if (c.y - chh / 2 > C.H) { c.alive = false; continue; }
      var cdx = this.wrapX ? this.wrapDelta(c.x - p.x) : c.x - p.x;
      if (Math.abs(cdx) < (p.w + cw) / 2 && Math.abs(c.y - p.y) < (p.h + chh) / 2) {
        c.alive = false;
        this.applyCapsule(c.type, c.x, c.y);
      }
    }
  };

  var CAPSULE_TEXT = {
    long: 'Long paddle', slow: 'Slow ball', multi: 'Multi ball', 'catch': 'Catch', laser: 'Lasers!',
    bomb: 'Bomb ball', life: 'Extra life', shrink: 'Shrink!', flip: 'Flipped!'
  };
  BT.CAPSULE_TEXT = CAPSULE_TEXT;

  G.applyCapsule = function (type, x, y) {
    var d = C.capsule.durations, e = this.eff;
    var bad = C.capsule.bad.indexOf(type) >= 0;
    switch (type) {
      case 'long': e.long = d.long; e.shrink = 0; break;
      case 'shrink': e.shrink = d.shrink; e.long = 0; break;
      case 'slow': e.slow = d.slow; break;
      case 'catch': e['catch'] = d['catch']; break;
      case 'laser': e.laser = d.laser; this.autoFireT = 0; break;
      case 'flip': e.flip = d.flip; this.paddle.targetX = this.paddle.x; break;
      case 'bomb': this.bomb = true; break;
      case 'life': this.lives = Math.min(9, this.lives + 1); break;
      case 'multi': this.splitBalls(); break;
    }
    this.score += 25;
    this.fx.sound(bad ? 'powerdown' : 'powerup');
    this.fx.text(x, y - 18, CAPSULE_TEXT[type] || type, bad ? '#ff8080' : '#9dffb0');
  };

  G.splitBalls = function () {
    var src = null, i;
    for (i = 0; i < this.balls.length; i++) if (!this.balls[i].dead) { src = this.balls[i]; break; }
    if (!src) return;
    if (src.stuck) { // launch the stuck one first so the copies have a direction
      this.releaseBall(src);
      if (this.state === 'serve') { this.state = 'play'; this.sinceLaunch = 0; }
    }
    for (var k = -1; k <= 1; k += 2) {
      if (this.balls.length >= C.ball.maxBalls) break;
      var nb = this.newBall(src.x, src.y, src.vx, src.vy);
      nb.r = src.r; nb.sizeMul = src.sizeMul; nb.zoneMul = src.zoneMul; nb.kind = src.kind;
      P.rotateVel(nb, k * 25 * P.DEG);
      if (nb.vy > 0 && src.vy < 0) nb.vy = -nb.vy;
      this.normalizeBall(nb);
    }
  };

  // ---------- lasers ----------
  G.updateLasers = function (dt) {
    var bs = this.bricks;
    for (var i = 0; i < this.lasers.length; i++) {
      var L = this.lasers[i];
      if (!L.alive) continue;
      L.y -= C.laser.speed * dt;
      if (L.y < C.TOP) { L.alive = false; continue; }
      var consumed = false;
      for (var r = 0; r < this.rules.length && !consumed; r++) {
        var ru = this.rules[r];
        if (ru.mod.onLaser && ru.mod.onLaser(this, ru, L)) consumed = true;
      }
      if (consumed) { L.alive = false; continue; }
      for (var j = 0; j < bs.length; j++) {
        var k = bs[j];
        if (!k.alive || !k.solid) continue;
        if (L.x > k.x - 1 && L.x < k.x + k.w + 1 && L.y > k.y && L.y < k.y + k.h + 8) {
          L.alive = false;
          this.hitBrick(k, null, 'laser');
          break;
        }
      }
    }
  };

  // ---------- lives / win ----------
  G.loseLife = function (reason) {
    if (this.state !== 'play' && this.state !== 'serve') return;
    for (var q = 0; q < this.rules.length; q++) { // a rule may handle the miss itself (e.g. a free retry)
      var rq = this.rules[q];
      if (rq.mod.beforeLifeLost && rq.mod.beforeLifeLost(this, rq, reason)) return;
    }
    this.lives--;
    this.livesLost++;
    this.combo = 0;
    this.bomb = false;
    for (var k in this.eff) this.eff[k] = 0;
    for (var i = 0; i < this.capsules.length; i++) this.capsules[i].alive = false;
    for (i = 0; i < this.lasers.length; i++) this.lasers[i].alive = false;
    this.fx.sound('lose');
    this.fx.shake(C.shake.life);
    this.shakeAmt = Math.max(this.shakeAmt, C.shake.life);
    for (i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.mod.onLifeLost) r.mod.onLifeLost(this, r, reason);
    }
    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'lost';
      this.balls.length = 0;
      this.fx.sound('gameover');
      return;
    }
    this.netActive = !!this.preset.net;
    this.state = 'serve';
    this.newServeBall();
  };

  G.isCleared = function () {
    var mode = this.level.clear || 'bricks';
    if (mode === 'boss') return !!(this.boss && this.boss.s.defeated);
    for (var q = 0; q < this.rules.length; q++) { // e.g. more bricks still to arrive
      var rq = this.rules[q];
      if (rq.mod.holdClear && rq.mod.holdClear(this, rq)) return false;
    }
    var bs = this.bricks;
    for (var i = 0; i < bs.length; i++) {
      var k = bs[i];
      if (!k.alive) continue;
      if (mode === 'core') { if (k.type === 'core') return false; }
      else if (k.required) return false;
    }
    return true;
  };

  G.beginClear = function () {
    this.state = 'clearing';
    this.clearTimer = 0;
    for (var i = 0; i < this.capsules.length; i++) this.capsules[i].alive = false;
    this.fx.sound('lastbrick');
  };

  G.finishWin = function () {
    this.state = 'won';
    this.timeScale = 1;
    var par = (this.level.par || 120) * this.preset.parScale;
    var stars = 1;
    if (this.livesLost === 0) { stars = 2; if (this.clock <= par) stars = 3; }
    this.result = { stars: stars, time: this.clock, par: par, score: this.score, livesLost: this.livesLost };
    this.fx.sound('win');
  };

  // ---------- engine extension points used by rules ----------
  // Wrapping helpers (only meaningful when wrapX is on).
  G.wrapPos = function (x) { x %= C.W; return x < 0 ? x + C.W : x; };
  G.wrapDelta = function (d) { d = ((d % C.W) + C.W * 1.5) % C.W - C.W / 2; return d; };
  G.wrapNear = function (x, ref) { return ref + this.wrapDelta(x - ref); };

  // True if any live ball is within margin of the rect: rules use it so a brick never appears,
  // turns solid, lands or grows on top of a ball.
  G.ballNear = function (x, y, w, h, margin) {
    var m = margin || 0;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.dead) continue;
      var bx = b.x;
      if (this.wrapX) bx = this.wrapNear(bx, x + w / 2);
      if (bx + b.r + m > x && bx - b.r - m < x + w && b.y + b.r + m > y && b.y - b.r - m < y + h) return true;
    }
    return false;
  };

  // Ghost bricks. A rule marks bricks ghostable once, then each step sets b.wantGhost = true on the ones it
  // wants see-through (several rules can vote; any vote makes it a ghost). The engine then applies it:
  // a brick only turns solid when no ball is touching it (b.pending shows it is waiting), and b.ghost
  // animates 0 (solid look) .. 1 (ghost look) for the renderer.
  G.makeGhostable = function (b) {
    b.ghostable = true; b.wantGhost = false; b.pending = false; b.warn = 0;
    if (b.ghost == null) b.ghost = b.solid ? 0 : 1;
    this.ghosting = true;
  };
  G.resolveSolidity = function (dt) {
    var bs = this.bricks, k = Math.min(1, dt * 14);
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!b.ghostable || !b.alive) continue;
      if (b.wantGhost) { b.solid = false; b.pending = false; }
      else if (!b.solid) {
        if (this.ballNear(b.x, b.y, b.w, b.h, 2)) b.pending = true;
        else { b.solid = true; b.pending = false; }
      }
      b.ghost += ((b.solid ? 0 : 1) - b.ghost) * k;
      b.wantGhost = false;
    }
  };

  // Extra paddles. face: +1 bounces the ball downward (paddle at the top), -1 upward. They are one-way:
  // only a ball travelling towards the face is hit. counts: true makes a hit count as the player's own
  // paddle hit (combo reset, speed-up). Rules move them by writing x / w / vx each step.
  G.addXPaddle = function (opts) {
    var xp = { x: C.W / 2, y: 100, w: 70, h: C.paddle.h, vx: 0, face: 1, counts: false, owner: null,
      kind: 'mirror', color: '#4fd8ff', squash: 0, hitFlash: 0, off: false };
    for (var k in opts) xp[k] = opts[k];
    this.xpaddles.push(xp);
    return xp;
  };
  G.xpaddleCollide = function (b) {
    for (var i = 0; i < this.xpaddles.length; i++) {
      var q = this.xpaddles[i];
      if (q.off || (q.face > 0 ? b.vy >= 0 : b.vy <= 0)) continue;
      var hw = q.w / 2, qx = this.wrapX ? this.wrapNear(q.x, b.x) : q.x;
      if (P.circleRect(b.x, b.y, b.r, qx - hw, q.y - q.h / 2, q.w, q.h) <= 0) continue;
      if (q.face > 0 ? b.y >= q.y - 1 : b.y <= q.y + 1) this.xpaddleBounce(b, q, qx);
      else {
        b.x = b.x < qx ? qx - hw - b.r : qx + hw + b.r;
        b.vx = (b.x < qx ? -1 : 1) * Math.abs(b.vx);
      }
    }
  };
  G.xpaddleBounce = function (b, q, qx) {
    b.y = q.y + q.face * (q.h / 2 + b.r);
    var a = P.paddleAngle(b.x, qx, q.w / 2, q.vx, C.ball) + (q.aim || 0);
    a = P.clamp(a, -C.ball.maxAngleDeg * P.DEG, C.ball.maxAngleDeg * P.DEG);
    var s = Math.min(this.speed() * b.boost * b.sizeMul * b.zoneMul, C.ball.absMaxSpeed);
    b.vx = Math.sin(a) * s; b.vy = q.face * Math.cos(a) * s;
    q.squash = C.paddle.squashTime; q.hitFlash = 0.1;
    if (q.counts) {
      this.combo = 0;
      this.paddleHits++;
      if (this.paddleHits % C.ball.speedUpEvery === 0) this.ballSpeed = Math.min(this.preset.speedMax, this.ballSpeed + C.ball.speedUpStep);
    }
    this.fx.sound('paddle', a);
    for (var i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.mod.onPaddleHit) r.mod.onPaddleHit(this, r, b, q);
    }
  };

  // Start the level again in place without costing a life (rules that offer free retries use this).
  // Lives, time played and the attempt count carry over; bricks, rules, balls and score start afresh.
  G.retry = function () {
    this.attempts++;
    this.state = 'serve';
    this.score = 0; this.combo = 0; this.paddleHits = 0;
    this.ballSpeed = this.preset.speedStart;
    this.timeScale = 1; this.sinceLaunch = 0; this.sinceHit = 0;
    this.bomb = false; this.netActive = !!this.preset.net;
    for (var k in this.eff) this.eff[k] = 0;
    this.blasts.length = 0;
    var i;
    for (i = 0; i < this.capsules.length; i++) this.capsules[i].alive = false;
    for (i = 0; i < this.lasers.length; i++) this.lasers[i].alive = false;
    this.paddle.off = false;
    this.xpaddles.length = 0; this.wrapX = false; this.topOpen = false; this.ghosting = false;
    this.paddle.frozen = 0; this.paddle.speedCap = 0; this.paddle.iv = 0;
    this.resetExtensions();
    this.bricks.length = 0;
    this.buildGrid(this.level.grid || []);
    this.rules = []; this.boss = null;
    var rl = this.level.rules || [];
    for (i = 0; i < rl.length; i++) this.addRule(rl[i]);
    this.finalizeBricks();
    this.newServeBall();
  };

  // ---------- phase-3 extension points ----------
  // Burning ball: a ball with b.pierce > 0 goes straight through a breakable brick (destroying it) without
  // bouncing, using up one pierce. Bricks with noPierce, unbreakable bricks and hits a rule consumes still
  // bounce it normally, so it can never pass steel or walls.
  G.pierceBrick = function (k, b) {
    for (var i = 0; i < 4 && k.alive; i++) {
      var hp = k.hp;
      this.hitBrick(k, b, 'pierce');
      if (k.alive && k.hp === hp) break; // a rule consumed the hit: bounce instead
    }
    if (k.alive) return false;
    b.pierce--;
    return true;
  };

  // Deflector panels: straight two-sided panels (x, y = centre, len, ang = angle in radians, thick) that the
  // ball bounces off like a mirror. The owner rule may define canDeflect(g, r, ball, d) -> false to let a ball
  // through, and onDeflect(g, r, ball, d, inVx, inVy) to react (it may change the outgoing velocity). Checked every sub-step, so a fast ball cannot skip one.
  G.addDeflector = function (opts) {
    var d = { x: 0, y: 0, len: 30, ang: Math.PI / 4, thick: 4, on: true, owner: null };
    for (var k in opts) d[k] = opts[k];
    this.deflectors.push(d);
    return d;
  };
  G.deflectorCollide = function (b) {
    for (var i = 0; i < this.deflectors.length; i++) {
      var d = this.deflectors[i];
      if (!d.on) continue;
      var c = Math.cos(d.ang), s = Math.sin(d.ang);
      var rx = b.x - d.x, ry = b.y - d.y, half = d.len / 2;
      var along = P.clamp(rx * c + ry * s, -half, half);
      var px = rx - along * c, py = ry - along * s;
      var dist = Math.sqrt(px * px + py * py), lim = b.r + d.thick / 2;
      if (dist >= lim) continue;
      var o = d.owner;
      if (o && o.mod.canDeflect && !o.mod.canDeflect(this, o, b, d)) continue;
      var nx, ny;
      if (dist > 1e-6) { nx = px / dist; ny = py / dist; }
      else { nx = -s; ny = c; if (b.vx * nx + b.vy * ny > 0) { nx = -nx; ny = -ny; } }
      b.x += nx * (lim - dist); b.y += ny * (lim - dist);
      var ivx = b.vx, ivy = b.vy;
      if (P.reflect(b, nx, ny) && o && o.mod.onDeflect) o.mod.onDeflect(this, o, b, d, ivx, ivy);
    }
  };

  // True if the rect overlaps any live solid brick other than `except` (rules that move bricks use it so
  // bricks never overlap each other or steel).
  G.rectBlocked = function (x, y, w, h, except, margin) {
    var m = margin || 0, bs = this.bricks;
    for (var i = 0; i < bs.length; i++) {
      var k = bs[i];
      if (k === except || !k.alive || !k.solid) continue;
      if (k.x < x + w + m && k.x + k.w + m > x && k.y < y + h + m && k.y + k.h + m > y) return true;
    }
    return false;
  };

  // Take a rule out again (a boss that borrows a rule for one phase). Its bricks are left to the caller.
  G.removeRule = function (inst) {
    var i = this.rules.indexOf(inst);
    if (i >= 0) this.rules.splice(i, 1);
  };

  // Count of bricks the level needs destroyed (for HUD/tests).
  G.requiredLeft = function () {
    var n = 0, bs = this.bricks;
    for (var i = 0; i < bs.length; i++) if (bs[i].alive && bs[i].required) n++;
    return n;
  };

  BT.Game = Game;
  BT.mulberry32 = mulberry32;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
