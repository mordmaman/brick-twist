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

      // worlds 1-3 playable
      var y = 162;
      for (var w = 0; w < BT.WORLDS.length; w++) {
        var W = BT.WORLDS[w];
        if (W.soon) continue;
        ctx.textAlign = 'left'; ctx.fillStyle = W.accent; ctx.font = 'bold 13px ' + R.FONT;
        ctx.fillText('WORLD ' + W.n, 20, y + 6);
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '13px ' + R.FONT;
        ctx.fillText(W.name, 90, y + 6);
        for (i = 0; i < 5; i++) {
          var id = (W.n - 1) * 5 + i + 1, L = BT.levelById(id);
          this.tile(ctx, 20 + i * 66, y + 16, L, W, S, t);
        }
        y += 94;
      }
      // worlds 4-6: coming soon
      for (w = 0; w < BT.WORLDS.length; w++) {
        W = BT.WORLDS[w];
        if (!W.soon) continue;
        R.roundRect(ctx, 20, y, C.W - 40, 30, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();
        ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 12px ' + R.FONT;
        ctx.fillText('WORLD ' + W.n, 32, y + 16);
        ctx.font = '12px ' + R.FONT; ctx.fillText(W.name, 98, y + 16);
        ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,211,90,0.55)'; ctx.font = 'italic 12px ' + R.FONT;
        ctx.fillText('coming soon', C.W - 32, y + 16);
        y += 36;
      }
      // footer
      var total = S.totalStars(), max = BT.LEVELS.length * 3;
      R.drawStar(ctx, C.W / 2 - 40, y + 20, 8, true);
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px ' + R.FONT;
      ctx.fillText(total + ' / ' + max, C.W / 2 - 26, y + 21);
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '11px ' + R.FONT;
      ctx.fillText('Drag anywhere to steer · tap to launch · keys: arrows + space', C.W / 2, y + 46);
      if (!S.ok) { ctx.fillStyle = 'rgba(255,160,120,0.6)'; ctx.fillText('Progress is not being saved on this device', C.W / 2, y + 62); }
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
      var R = BT.Render.R, w = 56, h = 62;
      var unlocked = S.isUnlocked(L.id), info = S.levelInfo(L.id);
      R.roundRect(ctx, x, y, w, h, 10);
      ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'; ctx.fill();
      ctx.strokeStyle = unlocked ? W.accent : 'rgba(255,255,255,0.1)'; ctx.lineWidth = unlocked && !info.cleared ? 2 : 1; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!unlocked) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x + w / 2 - 7, y + 26, 14, 11);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + w / 2, y + 26, 5, Math.PI, 0); ctx.stroke();
        return;
      }
      if (L.boss) { // crown
        ctx.fillStyle = W.accent;
        ctx.beginPath(); ctx.moveTo(x + 18, y + 14); ctx.lineTo(x + 22, y + 6); ctx.lineTo(x + 28, y + 11); ctx.lineTo(x + 34, y + 6); ctx.lineTo(x + 38, y + 14); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px ' + R.FONT;
      ctx.fillText(String(L.id), x + w / 2, y + (L.boss ? 28 : 24));
      for (var s = 0; s < 3; s++) R.drawStar(ctx, x + 14 + s * 14, y + 48, 5.5, s < info.stars);
      this.add(x - 2, y - 2, w + 4, h + 4, 'start:' + L.id);
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
        ctx.fillText('World 4 is coming soon!', C.W / 2, 364);
      }
      this.button(ctx, 60, 400, (C.W - 132) / 2, 46, 'Replay', 'restart');
      this.button(ctx, 72 + (C.W - 132) / 2, 400, (C.W - 132) / 2, 46, 'Levels', 'levels');
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
