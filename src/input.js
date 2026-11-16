// Input: touch (relative drag anywhere, tap to launch), mouse (paddle follows pointer, click to launch),
// keyboard (arrows / A-D, Space, P/Esc). Converts screen coordinates to the 360x640 logical field.
(function (BT) {
  'use strict';

  var C = BT.CONFIG;

  var Input = {
    app: null, canvas: null, ptrs: {}, dragId: null, keys: {}, lx: 0, ly: 0,

    init: function (canvas, app) {
      this.canvas = canvas; this.app = app;
      var self = this;
      var opt = { passive: false };
      canvas.addEventListener('pointerdown', function (e) { self.down(e); }, opt);
      canvas.addEventListener('pointermove', function (e) { self.move(e); }, opt);
      canvas.addEventListener('pointerup', function (e) { self.up(e, false); }, opt);
      canvas.addEventListener('pointercancel', function (e) { self.up(e, true); }, opt);
      canvas.addEventListener('lostpointercapture', function (e) { if (e.pointerId === self.dragId) self.dragId = null; });
      // block scrolling, pull-to-refresh, double-tap zoom, pinch zoom, long-press menus
      var stop = function (e) { if (e.cancelable) e.preventDefault(); };
      ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(function (n) {
        canvas.addEventListener(n, stop, opt);
      });
      document.addEventListener('touchmove', stop, opt);
      document.addEventListener('gesturestart', stop, opt);
      window.addEventListener('keydown', function (e) { self.key(e, true); });
      window.addEventListener('keyup', function (e) { self.key(e, false); });
      window.addEventListener('blur', function () { self.keys = {}; self.dragId = null; self.app.onBlur(); });
    },

    toLogical: function (e) {
      var r = this.canvas.getBoundingClientRect(), v = this.app.view;
      this.lx = (e.clientX - r.left - v.ox) / v.scale;
      this.ly = (e.clientY - r.top - v.oy) / v.scale;
    },

    down: function (e) {
      if (e.cancelable) e.preventDefault();
      BT.Audio.unlock();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
      this.toLogical(e);
      var mouse = e.pointerType === 'mouse';
      var p = { x: this.lx, y: this.ly, lastX: this.lx, lastY: this.ly, t: performance.now(), moved: 0, mouse: mouse, consumed: false };
      this.ptrs[e.pointerId] = p;
      if (mouse && e.button !== 0) { p.consumed = true; return; }
      if (this.app.onPress(this.lx, this.ly)) { p.consumed = true; return; }
      var g = this.app.activeGame();
      if (!g) return;
      if (mouse) { g.pointTo(this.lx); g.tap(); p.consumed = true; return; }
      if (this.dragId === null) this.dragId = e.pointerId;
      if (g.eff.laser > 0) g.fireLaser(); // instant response under a finger
    },

    move: function (e) {
      if (e.cancelable) e.preventDefault();
      this.toLogical(e);
      var g = this.app.activeGame();
      if (e.pointerType === 'mouse') {
        if (g) g.pointTo(this.lx);
        return;
      }
      var p = this.ptrs[e.pointerId];
      if (!p) return;
      var dx = this.lx - p.lastX;
      p.moved += Math.abs(dx) + Math.abs(this.ly - p.lastY);
      p.lastX = this.lx; p.lastY = this.ly;
      if (g && e.pointerId === this.dragId && !p.consumed) g.dragBy(dx);
    },

    up: function (e, cancelled) {
      var p = this.ptrs[e.pointerId];
      delete this.ptrs[e.pointerId];
      if (e.pointerId === this.dragId) {
        this.dragId = null;
        // hand the drag to another finger that is still down, so two-thumb play works
        for (var id in this.ptrs) if (!this.ptrs[id].mouse && !this.ptrs[id].consumed) { this.dragId = +id; break; }
      }
      if (!p || p.consumed || p.mouse || cancelled) return;
      var quick = performance.now() - p.t < C.touch.tapMaxMs;
      var still = p.moved < C.touch.tapMaxMove;
      var g = this.app.activeGame();
      if (g && quick && still) g.tap();
    },

    key: function (e, isDown) {
      var k = e.key;
      var handled = true;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.left = isDown;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.right = isDown;
      else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Enter') {
        if (isDown && !e.repeat) { BT.Audio.unlock(); this.app.onAction(k === 'Enter' ? 'enter' : 'space'); }
      }
      else if (k === 'p' || k === 'P' || k === 'Escape') { if (isDown && !e.repeat) this.app.onAction('pause'); }
      else if (k === 'r' || k === 'R') { if (isDown && !e.repeat) this.app.onAction('restart'); }
      else if (k === 'm' || k === 'M') { if (isDown && !e.repeat) this.app.onAction('mute'); }
      else handled = false;
      if (handled && e.cancelable) e.preventDefault();
      var g = this.app.activeGame();
      if (g) g.keyDir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    }
  };

  BT.Input = Input;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
