// Menus and overlays drawn on the canvas: level select, twist banner, pause, results.
// Buttons are registered while drawing and hit-tested on the next press.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, TAU = Math.PI * 2;

  var UI = {
    btns: [], n: 0,
    begin: function () { this.n = 0; },
    add: function (x, y, w, h, action) {
      var b = this.btns[this.n] || (this.btns[this.n] = {});
      b.x = x; b.y = y; b.w = w; b.h = h; b.action = action;
      this.n++;
    },
    hit: function (x, y) {
      for (var i = this.n - 1; i >= 0; i--) {
        var b = this.btns[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.action;
      }
      return null;
    },
    button: function (ctx, x, y, w, h, label, action, primary, disabled) {
      var R = BT.Render.R;
      R.roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.05)' : (primary ? '#4fd8ff' : 'rgba(255,255,255,0.12)');
      ctx.fill();
      if (!primary) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.3)' : (primary ? '#06202c' : '#ffffff');
      ctx.font = 'bold 16px ' + R.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
      if (!disabled) this.add(x, y, w, h, action);
    },

    // ---------------- level select ----------------
    drawSelect: function (ctx, app, t) {
      var R = BT.Render.R, S = BT.Save, i;
      ctx.drawImage(BT.Render.background(BT.WORLDS[0], app.view.scale * app.view.dpr), 0, 0, C.W, C.H);
      this.drawLogo(ctx, t);
      this.muteButton(ctx, app, C.W - 46, 10);

      // difficulty
      var diffs = ['easy', 'normal', 'hard'], cur = S.data.difficulty;
      for (i = 0; i < 3; i++) {
        var x = 20 + i * 108, sel = diffs[i] === cur;
        R.roundRect(ctx, x, 92, 104, 36, 10);
        ctx.fillStyle = sel ? '#ffd35a' : 'rgba(255,255,255,0.08)'; ctx.fill();
        ctx.strokeStyle = sel ? '#fff2b0' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = sel ? '#2b1d00' : '#ffffff'; ctx.font = 'bold 15px ' + R.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(C.presets[diffs[i]].label, x + 52, 111);
        this.add(x, 88, 104, 44, 'diff:' + diffs[i]);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px ' + R.FONT;
      var pr = C.presets[cur];
      ctx.fillText(pr.blurb + ' · ' + pr.lives + ' lives', C.W / 2, 144);

      // worlds: a list that scrolls by touch drag or mouse wheel under the fixed header
      var top = this.LIST_TOP, sc = app.sel.scroll, max = this.maxScroll();
      this.oy = top - sc;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, top, C.W, C.H - top); ctx.clip();
      var y = 0;
      for (var w = 0; w < BT.WORLDS.length; w++) {
        var W = BT.WORLDS[w], ry = this.oy + y;
        if (ry > -80 && ry < C.H) {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = W.accent; ctx.font = 'bold 12px ' + R.FONT;
          ctx.fillText('WORLD ' + W.n, 20, ry + 6);
          ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '12px ' + R.FONT;
          ctx.fillText(W.name, 86, ry + 6);
          for (i = 0; i < 5; i++) {
            var id = (W.n - 1) * 5 + i + 1, L = BT.levelById(id);
            if (L) this.tile(ctx, 20 + i * 66, ry + 14, L, W, S, t);
          }
        }
        y += this.ROW_H;
      }
      // footer
      var fy = this.oy + y;
      var total = S.totalStars(), maxS = BT.LEVELS.length * 3;
      R.drawStar(ctx, C.W / 2 - 40, fy + 10, 8, true);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px ' + R.FONT;
      ctx.fillText(total + ' / ' + maxS, C.W / 2 - 26, fy + 11);
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '11px ' + R.FONT;
      ctx.fillText('Drag anywhere to steer · tap to launch · keys: arrows + space', C.W / 2, fy + 32);
      if (!S.ok) { ctx.fillStyle = 'rgba(255,160,120,0.6)'; ctx.fillText('Progress is not being saved on this device', C.W / 2, fy + 47); }
      ctx.restore();
      // scroll hints: soft fades at the edges that still have more list, and a thin scroll bar
      if (max > 0) {
        var fade;
        if (sc > 1) {
          fade = ctx.createLinearGradient(0, top, 0, top + 18);
          fade.addColorStop(0, 'rgba(5,6,13,0.85)'); fade.addColorStop(1, 'rgba(5,6,13,0)');
          ctx.fillStyle = fade; ctx.fillRect(0, top, C.W, 18);
        }
        if (sc < max - 1) {
          fade = ctx.createLinearGradient(0, C.H - 26, 0, C.H);
          fade.addColorStop(0, 'rgba(5,6,13,0)'); fade.addColorStop(1, 'rgba(5,6,13,0.9)');
          ctx.fillStyle = fade; ctx.fillRect(0, C.H - 26, C.W, 26);
          var a = 0.35 + 0.25 * Math.sin(t * 3);
          ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(C.W / 2 - 8, C.H - 12); ctx.lineTo(C.W / 2 + 8, C.H - 12); ctx.lineTo(C.W / 2, C.H - 5); ctx.closePath(); ctx.fill();
        }
        var trackH = C.H - top - 8, thumbH = Math.max(40, trackH * (C.H - top) / (C.H - top + max));
        var ty = top + 4 + (trackH - thumbH) * (sc / max);
        R.roundRect(ctx, C.W - 6, ty, 3, thumbH, 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      }
    },

    // list geometry (the header above LIST_TOP stays put)
    LIST_TOP: 156, ROW_H: 76, FOOTER_H: 62,
    contentHeight: function () { return BT.WORLDS.length * this.ROW_H + this.FOOTER_H; },
    maxScroll: function () { return Math.max(0, this.contentHeight() - (C.H - this.LIST_TOP)); },
    // scroll that shows the row of level id comfortably (used when opening the list)
    scrollFor: function (id, cur) {
      var L = BT.levelById(id), w = L ? L.world - 1 : 0;
      var rowTop = w * this.ROW_H, rowBot = rowTop + this.ROW_H + 8, view = C.H - this.LIST_TOP;
      var sc = cur;
      if (rowTop - 6 < sc) sc = rowTop - 6;
      if (rowBot > sc + view) sc = rowBot - view;
      return Math.max(0, Math.min(this.maxScroll(), sc));
    },
    // where a level's tile currently is on screen (tests use it), or null if it is scrolled out of view
    tileRect: function (id, scroll) {
      var L = BT.levelById(id);
      if (!L) return null;
      var x = 20 + ((id - 1) % 5) * 66, y = this.LIST_TOP - scroll + (L.world - 1) * this.ROW_H + 14;
      return { x: x, y: y, w: 56, h: 54, visible: y >= this.LIST_TOP - 10 && y + 54 <= C.H + 10 };
    },

    drawLogo: function (ctx, t) {
      var R = BT.Render.R;
      var cols = ['#ff5a64', '#ff9f43', '#ffd35a', '#2ee0a4', '#4fd8ff', '#5b8cff', '#a46bff', '#ff6bcb'];
      for (var i = 0; i < 8; i++) {
        var bob = Math.sin(t * 2 + i * 0.7) * 2;
        R.roundRect(ctx, 64 + i * 29, 66 + bob, 26, 8, 2);
        ctx.fillStyle = cols[i]; ctx.fill();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 34px ' + R.FONT;
      ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b0d1c'; ctx.strokeText('BRICK TWIST', C.W / 2, 42);
      var grd = ctx.createLinearGradient(0, 24, 0, 60);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#9fd8ff');
      ctx.fillStyle = grd; ctx.fillText('BRICK TWIST', C.W / 2, 42);
    },

    muteButton: function (ctx, app, x, y) {
      var R = BT.Render.R, muted = BT.Save.data.muted;
      R.roundRect(ctx, x, y, 36, 30, 8); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 9, y + 12); ctx.lineTo(x + 13, y + 12); ctx.lineTo(x + 19, y + 7); ctx.lineTo(x + 19, y + 23); ctx.lineTo(x + 13, y + 18); ctx.lineTo(x + 9, y + 18); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      if (muted) { ctx.moveTo(x + 23, y + 11); ctx.lineTo(x + 30, y + 19); ctx.moveTo(x + 30, y + 11); ctx.lineTo(x + 23, y + 19); }
      else { ctx.arc(x + 20, y + 15, 6, -0.9, 0.9); ctx.moveTo(x + 26.5, y + 7); ctx.arc(x + 20, y + 15, 10, -0.9, 0.9); }
      ctx.stroke();
      this.add(x - 4, y - 4, 44, 38, 'mute');
    },

    tile: function (ctx, x, y, L, W, S, t) {
      var R = BT.Render.R, w = 56, h = 54;
      var unlocked = S.isUnlocked(L.id), info = S.levelInfo(L.id);
      R.roundRect(ctx, x, y, w, h, 10);
      ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'; ctx.fill();
      ctx.strokeStyle = unlocked ? W.accent : 'rgba(255,255,255,0.1)'; ctx.lineWidth = unlocked && !info.cleared ? 2 : 1; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!unlocked) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x + w / 2 - 7, y + 23, 14, 11);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + w / 2, y + 23, 5, Math.PI, 0); ctx.stroke();
        return;
      }
      if (L.boss) { // crown
        ctx.fillStyle = W.accent;
        ctx.beginPath(); ctx.moveTo(x + 18, y + 12); ctx.lineTo(x + 22, y + 4); ctx.lineTo(x + 28, y + 9); ctx.lineTo(x + 34, y + 4); ctx.lineTo(x + 38, y + 12); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px ' + R.FONT;
      ctx.fillText(String(L.id), x + w / 2, y + (L.boss ? 24 : 21));
      for (var s = 0; s < 3; s++) R.drawStar(ctx, x + 14 + s * 14, y + 42, 5.5, s < info.stars);
      // tappable only where it shows inside the list (never through the header)
      var y0 = Math.max(y - 2, this.LIST_TOP), y1 = Math.min(y + h + 2, C.H);
      if (y1 - y0 > 20) this.add(x - 2, y0, w + 4, y1 - y0, 'start:' + L.id);
    },

    // ---------------- overlays ----------------
    dim: function (ctx, a) { ctx.fillStyle = 'rgba(3,4,12,' + a + ')'; ctx.fillRect(0, 0, C.W, C.H); },
    card: function (ctx, y, h) {
      var R = BT.Render.R;
      R.roundRect(ctx, 24, y, C.W - 48, h, 18);
      ctx.fillStyle = 'rgba(18,22,44,0.96)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke();
    },

    drawBanner: function (ctx, app, t) {
      var R = BT.Render.R, L = app.level;
      this.dim(ctx, 0.55);
      this.card(ctx, 190, 220);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = L.boss ? '#ff5a64' : '#ffd35a'; ctx.font = 'bold 13px ' + R.FONT;
      ctx.fillText(L.boss ? 'BOSS FIGHT' : 'NEW TWIST', C.W / 2, 218);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px ' + R.FONT;
      ctx.fillText(L.name, C.W / 2, 250);
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '16px ' + R.FONT;
      R.wrapText(ctx, L.banner, C.W / 2, 292, C.W - 90, 22);
      var a = 0.5 + 0.4 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(79,216,255,' + a.toFixed(3) + ')'; ctx.font = 'bold 15px ' + R.FONT;
      ctx.fillText('Tap to start', C.W / 2, 384);
      this.add(0, 0, C.W, C.H, 'dismissBanner');
    },

    drawPause: function (ctx, app) {
      var R = BT.Render.R;
      this.dim(ctx, 0.6);
      this.card(ctx, 150, 330);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px ' + R.FONT;
      ctx.fillText('Paused', C.W / 2, 190);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '13px ' + R.FONT;
      ctx.fillText(app.label(), C.W / 2, 218);
      this.button(ctx, 60, 240, C.W - 120, 48, 'Resume', 'resume', true);
      this.button(ctx, 60, 300, C.W - 120, 48, 'Restart level', 'restart');
      this.button(ctx, 60, 360, C.W - 120, 48, 'Levels', 'levels');
      this.button(ctx, 60, 420, C.W - 120, 44, 'Sound: ' + (BT.Save.data.muted ? 'off' : 'on'), 'mute');
    },

    drawWon: function (ctx, app, t) {
      var R = BT.Render.R, res = app.game.result, L = app.level, i;
      this.dim(ctx, 0.55);
      this.card(ctx, 120, 400);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px ' + R.FONT;
      ctx.fillText(L.boss ? 'Boss beaten!' : 'Level clear!', C.W / 2, 160);
      for (i = 0; i < 3; i++) {
        var appear = Math.max(0, Math.min(1, (t - 0.25 - i * 0.3) / 0.25));
        var got = i < res.stars;
        var sc = got ? (appear < 1 ? 0.4 + appear * 0.9 : 1 + 0.06 * Math.sin(t * 3 + i)) : 1;
        if (got && appear <= 0) R.drawStar(ctx, C.W / 2 - 60 + i * 60, 214, 22, false);
        else R.drawStar(ctx, C.W / 2 - 60 + i * 60, 214, 22 * sc, got);
        if (got && appear > 0 && appear < 1 && !app.starSfx[i]) { app.starSfx[i] = true; BT.Audio.play('break', 4 + i * 4); }
      }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px ' + R.FONT;
      ctx.fillText(String(res.score), C.W / 2, 268);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '13px ' + R.FONT;
      ctx.fillText('Time ' + fmt(res.time) + '  ·  par ' + fmt(res.par), C.W / 2, 292);
      var tip = res.stars === 3 ? 'Perfect!' : (res.livesLost > 0 ? 'Clear it without losing a ball for 2 stars' : 'Beat the par time for 3 stars');
      ctx.fillStyle = res.stars === 3 ? '#ffd35a' : 'rgba(255,255,255,0.75)';
      ctx.fillText(tip, C.W / 2, 316);
      var next = BT.levelById(L.id + 1);
      if (next) this.button(ctx, 60, 340, C.W - 120, 48, 'Next level', 'next', true);
      else {
        ctx.fillStyle = '#ffd35a'; ctx.font = 'bold 14px ' + R.FONT;
        var nextW = BT.WORLDS[L.world]; // the world after this one
        ctx.fillText(nextW ? 'World ' + nextW.n + ' is coming soon!' : 'You beat them all!', C.W / 2, 364);
      }
      this.button(ctx, 60, 400, (C.W - 132) / 2, 46, 'Replay', 'restart');
      this.button(ctx, 72 + (C.W - 132) / 2, 400, (C.W - 132) / 2, 46, 'Levels', 'levels');
    },

    // ---------------- ending (after the final boss) ----------------
    drawEnding: function (ctx, app, t) {
      var R = BT.Render.R, S = BT.Save, res = app.game.result, i;
      this.dim(ctx, 0.72);
      // a gentle shower of bricks in every world's colour
      var cols = ['#ff5a64', '#ff9f43', '#ffd35a', '#2ee0a4', '#4fd8ff', '#5b8cff', '#a46bff', '#ff6bcb'];
      for (i = 0; i < 26; i++) {
        var sp = 40 + (i * 37) % 60, x = (i * 97.3 + Math.sin(t + i) * 12) % C.W, y = ((t * sp + i * 71) % (C.H + 40)) - 20;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.5 + i) * 0.6);
        ctx.globalAlpha = 0.55; R.roundRect(ctx, -9, -4, 18, 8, 2); ctx.fillStyle = cols[i % cols.length]; ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      this.card(ctx, 86, 468);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd35a'; ctx.font = 'bold 13px ' + R.FONT;
      ctx.fillText('THE MACHINE IS BEATEN', C.W / 2, 116);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 30px ' + R.FONT;
      ctx.fillText('You did it!', C.W / 2, 150);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '15px ' + R.FONT;
      R.wrapText(ctx, 'All eight worlds and all ' + BT.LEVELS.length + ' levels of Brick Twist are cleared.', C.W / 2, 184, C.W - 90, 20);
      // this fight's stars
      for (i = 0; i < 3; i++) {
        var appear = Math.max(0, Math.min(1, (t - 0.4 - i * 0.3) / 0.25)), got = i < res.stars;
        var s2 = got ? (appear < 1 ? 0.4 + appear * 0.9 : 1 + 0.06 * Math.sin(t * 3 + i)) : 1;
        if (got && appear <= 0) R.drawStar(ctx, C.W / 2 - 50 + i * 50, 244, 18, false);
        else R.drawStar(ctx, C.W / 2 - 50 + i * 50, 244, 18 * s2, got);
        if (got && appear > 0 && appear < 1 && !app.starSfx[i]) { app.starSfx[i] = true; BT.Audio.play('break', 4 + i * 4); }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '13px ' + R.FONT;
      ctx.fillText('Final boss ' + res.score + ' points  ·  ' + fmt(res.time), C.W / 2, 274);
      // all stars so far
      var total = S.totalStars(), max = BT.LEVELS.length * 3, three = 0;
      for (i = 0; i < BT.LEVELS.length; i++) if (S.levelInfo(BT.LEVELS[i].id).stars >= 3) three++;
      R.roundRect(ctx, 48, 296, C.W - 96, 62, 12); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      R.drawStar(ctx, C.W / 2 - 52, 318, 11, true);
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px ' + R.FONT;
      ctx.fillText(total + ' / ' + max + ' stars', C.W / 2 - 34, 319);
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '12px ' + R.FONT;
      ctx.fillText(three + ' of ' + BT.LEVELS.length + ' levels have all 3 stars', C.W / 2, 344);
      ctx.fillStyle = three < BT.LEVELS.length ? '#9dffb0' : '#ffd35a'; ctx.font = '14px ' + R.FONT;
      R.wrapText(ctx, three < BT.LEVELS.length
        ? 'Can you get 3 stars everywhere? Go back and clear levels without losing a ball, inside the par time.'
        : 'Every level has 3 stars. That is perfect!', C.W / 2, 382, C.W - 96, 19);
      this.button(ctx, 60, 446, C.W - 120, 48, 'Back to levels', 'levels', true);
      this.button(ctx, 60, 502, C.W - 120, 40, 'Fight it again', 'restart');
    },

    drawLost: function (ctx, app) {
      var R = BT.Render.R;
      this.dim(ctx, 0.6);
      this.card(ctx, 160, 320);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px ' + R.FONT;
      ctx.fillText('Out of balls!', C.W / 2, 204);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '15px ' + R.FONT;
      ctx.fillText('Score ' + app.game.score, C.W / 2, 236);
      if (app.game.presetName !== 'easy') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px ' + R.FONT;
        R.wrapText(ctx, 'Tip: Easy gives a bigger paddle and a safety net.', C.W / 2, 262, C.W - 100, 16);
      }
      this.button(ctx, 60, 300, C.W - 120, 50, 'Try again', 'restart', true);
      this.button(ctx, 60, 364, C.W - 120, 46, 'Levels', 'levels');
    }
  };

  function fmt(s) {
    s = Math.round(s);
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  UI.fmt = fmt;

  BT.UI = UI;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
