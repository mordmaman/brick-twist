// Boot, fixed-step loop, scene switching. Wires the pure game to sound, particles, input and UI.
(function (BT) {
  'use strict';

  var C = BT.CONFIG;
  var STEP = 1 / C.physicsHz;

  var App = {
    canvas: null, ctx: null,
    view: { scale: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 },
    scene: 'select',      // select | play
    overlay: null,        // null | banner | pause | won | lost
    game: null, level: null, world: null,
    acc: 0, last: 0, t: 0, overlayT: 0, endT: 0, starSfx: [false, false, false],
    // level select list: scroll offset, fling speed, and the press being tracked (tap fires on release)
    sel: { scroll: 0, vel: 0, press: null },

    boot: function () {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      BT.Save.init();
      BT.Audio.setMuted(BT.Save.data.muted);
      BT.Input.init(this.canvas, this);
      var self = this;
      window.addEventListener('resize', function () { self.resize(); });
      window.addEventListener('orientationchange', function () { setTimeout(function () { self.resize(); }, 120); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { self.autoPause(); BT.Audio.suspend(); }
      });
      this.resize();
      this.sel.scroll = BT.UI.scrollFor(this.furthestUnlocked(), 0);
      this.last = performance.now();
      requestAnimationFrame(function f(now) { self.frame(now); requestAnimationFrame(f); });
    },

    resize: function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var w = window.innerWidth, h = window.innerHeight;
      var v = this.view;
      v.dpr = dpr; v.cw = w; v.ch = h;
      v.scale = Math.min(w / C.W, h / C.H);
      v.ox = (w - C.W * v.scale) / 2;
      v.oy = (h - C.H * v.scale) / 2;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    },

    activeGame: function () {
      return (this.scene === 'play' && !this.overlay && this.game) ? this.game : null;
    },

    label: function () { return this.level ? (this.level.world + '-' + ((this.level.id - 1) % 5 + 1) + '  ' + this.level.name) : ''; },

    // ---------------- scenes ----------------
    startLevel: function (id, fromRestart) {
      var L = BT.levelById(id);
      if (!L) return;
      this.level = L;
      this.world = BT.WORLDS[L.world - 1];
      var self = this;
      this.game = new BT.Game(L, BT.Save.data.difficulty, {
        fx: {
          sound: function (n, a) { BT.Audio.play(n, a); },
          burst: function (x, y, c, n, k) { BT.Particles.burst(x, y, c, n, k); },
          ring: function (x, y, r, c) { BT.Particles.ring(x, y, r, c); },
          text: function (x, y, s, c) { BT.Particles.text(x, y, s, c); },
          shake: function () {}
        }
      });
      BT.Particles.clear();
      this.scene = 'play';
      this.acc = 0; this.endT = 0;
      this.overlay = (!fromRestart && !BT.Save.data.seen[L.twist]) ? 'banner' : null;
      this.overlayT = 0;
      this.canvas.style.cursor = 'none';
    },

    toSelect: function () {
      var from = this.level ? this.level.id : this.furthestUnlocked();
      if (this.overlay === 'won' || this.overlay === 'ending') from = Math.min(BT.LEVELS.length, from + 1);
      this.scene = 'select'; this.overlay = null; this.game = null;
      this.sel.vel = 0; this.sel.press = null;
      this.sel.scroll = BT.UI.scrollFor(from, this.sel.scroll);
      this.canvas.style.cursor = 'default';
    },

    furthestUnlocked: function () {
      var id = 1;
      for (var i = 0; i < BT.LEVELS.length; i++) if (BT.Save.isUnlocked(BT.LEVELS[i].id)) id = BT.LEVELS[i].id;
      return id;
    },

    // ---------------- level select scrolling ----------------
    // A press on the list only becomes a tap when it is released without having dragged, so scrolling
    // can never start a level. A press that catches a moving list just stops it.
    selDown: function (x, y, id) {
      this.sel.press = { id: id, x: x, y: y, moved: 0, stopper: Math.abs(this.sel.vel) > 60, t: performance.now() };
      this.sel.vel = 0;
    },
    selMove: function (dy, dist, id) {
      var p = this.sel.press;
      if (!p || p.id !== id) return;
      p.moved += dist;
      if (p.moved < C.touch.tapMaxMove) return;
      this.scrollBy(-dy);
      var now = performance.now(), dt = Math.max(1, now - p.t) / 1000;
      this.sel.vel = this.sel.vel * 0.3 + (-dy / dt) * 0.7;
      p.t = now;
    },
    selUp: function (x, y, id, cancelled) {
      var p = this.sel.press;
      if (!p || p.id !== id) return;
      this.sel.press = null;
      if (cancelled || p.moved >= C.touch.tapMaxMove) return;
      this.sel.vel = 0;
      if (p.stopper) return;
      var act = BT.UI.hit(x, y);
      if (act) this.doAction(act);
    },
    scrollBy: function (d) {
      var max = BT.UI.maxScroll();
      this.sel.scroll = Math.max(0, Math.min(max, this.sel.scroll + d));
    },
    onWheel: function (dy) {
      if (this.scene !== 'select' || this.overlay) return false;
      this.sel.vel = 0;
      this.scrollBy(dy);
      return true;
    },

    autoPause: function () {
      if (this.scene === 'play' && !this.overlay && this.game && (this.game.state === 'play' || this.game.state === 'serve')) {
        this.overlay = 'pause'; this.overlayT = 0; this.canvas.style.cursor = 'default';
      }
    },
    onBlur: function () { this.autoPause(); },

    // ---------------- input from Input ----------------
    onPress: function (x, y, id) {
      if (this.scene === 'select' && !this.overlay) { this.selDown(x, y, id); return true; }
      var act = null;
      if (this.scene === 'select' || this.overlay) act = BT.UI.hit(x, y);
      else if (this.scene === 'play' && x > C.W - 52 && y < C.TOP) act = 'pause';
      if (this.scene === 'select' || this.overlay) { if (act) this.doAction(act); return true; }
      if (act) { this.doAction(act); return true; }
      return false;
    },

    onAction: function (a) {
      if (a === 'space' || a === 'enter') {
        if (this.overlay === 'banner') return this.doAction('dismissBanner');
        if (this.overlay === 'pause') return this.doAction('resume');
        if (this.overlay === 'won' && a === 'enter') return this.doAction(BT.levelById(this.level.id + 1) ? 'next' : 'levels');
        if (this.overlay === 'ending' && a === 'enter') return this.doAction('levels');
        if (this.overlay === 'lost' && a === 'enter') return this.doAction('restart');
        var g = this.activeGame();
        if (g) g.tap();
        return;
      }
      if (a === 'pause') {
        if (this.overlay === 'pause') this.doAction('resume');
        else if (this.scene === 'play' && !this.overlay) this.doAction('pause');
        return;
      }
      if (a === 'restart' && this.scene === 'play') return this.doAction('restart');
      if (a === 'mute') return this.doAction('mute');
    },

    doAction: function (a) {
      BT.Audio.unlock();
      if (a.indexOf('start:') === 0) {
        var id = +a.slice(6);
        if (BT.Save.isUnlocked(id)) this.startLevel(id);
        else BT.Audio.play('locked');
        return;
      }
      if (a.indexOf('diff:') === 0) { BT.Save.setDifficulty(a.slice(5)); BT.Audio.play('gate'); return; }
      switch (a) {
        case 'mute': BT.Save.setMuted(!BT.Save.data.muted); BT.Audio.setMuted(BT.Save.data.muted); break;
        case 'pause': this.overlay = 'pause'; this.overlayT = 0; this.canvas.style.cursor = 'default'; break;
        case 'resume': this.overlay = null; this.last = performance.now(); this.acc = 0; this.canvas.style.cursor = 'none'; break;
        case 'restart': this.startLevel(this.level.id, true); break;
        case 'levels': this.toSelect(); break;
        case 'next': if (BT.levelById(this.level.id + 1)) this.startLevel(this.level.id + 1); else this.toSelect(); break;
        case 'dismissBanner':
          BT.Save.markSeen(this.level.twist);
          this.overlay = null; this.acc = 0; this.canvas.style.cursor = 'none';
          break;
      }
    },

    // ---------------- loop ----------------
    frame: function (now) {
      var dt = Math.min((now - this.last) / 1000, C.maxFrameDt);
      this.last = now;
      this.t += dt;
      this.overlayT += dt;
      var g = this.game;
      if (this.scene === 'play' && g && !this.overlay) {
        this.acc += dt * g.timeScale;
        var n = 0;
        while (this.acc >= STEP && n < 30) {
          g.step(STEP);
          this.acc -= STEP; n++;
          if (g.state === 'won' || g.state === 'lost') { this.acc = 0; break; }
        }
        BT.Particles.update(dt * g.timeScale);
        if (g.state === 'won' || g.state === 'lost') {
          this.endT += dt;
          if (this.endT > (g.state === 'won' ? C.winDelay : 0.9)) {
            if (g.state === 'won') {
              BT.Save.record(this.level.id, g.result.stars, g.result.score);
              this.starSfx = [false, false, false];
            }
            this.overlay = g.state === 'won' && this.level.final ? 'ending' : g.state;
            this.overlayT = 0; this.canvas.style.cursor = 'default';
          }
        }
      } else {
        BT.Particles.update(dt);
      }
      if (this.scene === 'select' && !this.sel.press && this.sel.vel) { // fling
        this.scrollBy(this.sel.vel * dt);
        this.sel.vel *= Math.pow(0.04, dt);
        var sc = this.sel.scroll;
        if (Math.abs(this.sel.vel) < 8 || sc <= 0 || sc >= BT.UI.maxScroll()) this.sel.vel = 0;
      }
      this.render();
    },

    render: function () {
      var ctx = this.ctx, v = this.view;
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.fillStyle = '#05060d';
      ctx.fillRect(0, 0, v.cw, v.ch);
      ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, C.W, C.H); ctx.clip();
      BT.UI.begin();
      if (this.scene === 'select') {
        BT.UI.drawSelect(ctx, this, this.t);
      } else if (this.game) {
        var g = this.game, seen = BT.Save.data.seen[this.level.twist];
        BT.Render.drawPlay(ctx, g, this.world, v.scale * v.dpr, {
          label: this.label(),
          hint: this.overlay ? null : (g.livesLost === 0 && g.clock === 0 ? 'Tap to launch' : 'Tap to go again'),
          sub: seen && g.clock === 0 && !this.overlay ? this.level.banner : null
        });
        if (this.overlay === 'banner') BT.UI.drawBanner(ctx, this, this.overlayT);
        else if (this.overlay === 'pause') BT.UI.drawPause(ctx, this);
        else if (this.overlay === 'won') BT.UI.drawWon(ctx, this, this.overlayT);
        else if (this.overlay === 'ending') BT.UI.drawEnding(ctx, this, this.overlayT);
        else if (this.overlay === 'lost') BT.UI.drawLost(ctx, this);
      }
      ctx.restore();
    }
  };

  BT.App = App;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.boot(); });
    else App.boot();
  }
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
