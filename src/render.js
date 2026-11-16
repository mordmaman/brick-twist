// Canvas 2D drawing of the play scene and HUD. Vector shapes only, all drawn in code.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, TAU = Math.PI * 2;
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  var CAPSULE_STYLE = {
    long: { c: '#2ee0a4' }, slow: { c: '#4fd8ff' }, multi: { c: '#ffd35a' }, 'catch': { c: '#9b7bff' },
    laser: { c: '#ff9f43' }, bomb: { c: '#6e7891' }, life: { c: '#ff6b9a' },
    shrink: { c: '#ff4d5e', bad: true }, flip: { c: '#e04dff', bad: true }
  };

  function roundRect(ctx, x, y, w, h, r) {
    if (r > h / 2) r = h / 2; if (r > w / 2) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Capsule / effect icon, centred at x,y, roughly s px tall. Drawn in the current fillStyle/strokeStyle.
  function drawIcon(ctx, type, x, y, s) {
    var h = s / 2;
    ctx.lineWidth = Math.max(1.5, s / 7); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (type) {
      case 'long': // <-->
        ctx.moveTo(x - h * 1.3, y); ctx.lineTo(x + h * 1.3, y);
        ctx.moveTo(x - h * 0.7, y - h * 0.6); ctx.lineTo(x - h * 1.3, y); ctx.lineTo(x - h * 0.7, y + h * 0.6);
        ctx.moveTo(x + h * 0.7, y - h * 0.6); ctx.lineTo(x + h * 1.3, y); ctx.lineTo(x + h * 0.7, y + h * 0.6);
        ctx.stroke(); break;
      case 'shrink': // >--<
        ctx.moveTo(x - h * 1.3, y); ctx.lineTo(x - h * 0.3, y); ctx.moveTo(x + h * 0.3, y); ctx.lineTo(x + h * 1.3, y);
        ctx.moveTo(x - h * 0.9, y - h * 0.6); ctx.lineTo(x - h * 0.3, y); ctx.lineTo(x - h * 0.9, y + h * 0.6);
        ctx.moveTo(x + h * 0.9, y - h * 0.6); ctx.lineTo(x + h * 0.3, y); ctx.lineTo(x + h * 0.9, y + h * 0.6);
        ctx.stroke(); break;
      case 'slow': // clock
        ctx.arc(x, y, h * 0.85, 0, TAU); ctx.moveTo(x, y); ctx.lineTo(x, y - h * 0.55); ctx.moveTo(x, y); ctx.lineTo(x + h * 0.4, y);
        ctx.stroke(); break;
      case 'multi': // three balls
        ctx.arc(x - h * 0.9, y + h * 0.3, h * 0.38, 0, TAU); ctx.moveTo(x + h * 0.38, y - h * 0.4);
        ctx.arc(x, y - h * 0.4, h * 0.38, 0, TAU); ctx.moveTo(x + h * 1.28, y + h * 0.3);
        ctx.arc(x + h * 0.9, y + h * 0.3, h * 0.38, 0, TAU); ctx.fill(); break;
      case 'catch': // cup
        ctx.moveTo(x - h, y - h * 0.6); ctx.lineTo(x - h * 0.7, y + h * 0.6); ctx.lineTo(x + h * 0.7, y + h * 0.6); ctx.lineTo(x + h, y - h * 0.6);
        ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - h * 0.15, h * 0.32, 0, TAU); ctx.fill(); break;
      case 'laser': // two bolts
        ctx.moveTo(x - h * 0.6, y + h * 0.8); ctx.lineTo(x - h * 0.6, y - h * 0.8); ctx.moveTo(x + h * 0.6, y + h * 0.8); ctx.lineTo(x + h * 0.6, y - h * 0.8);
        ctx.stroke(); break;
      case 'bomb':
        ctx.arc(x - h * 0.15, y + h * 0.15, h * 0.7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + h * 0.3, y - h * 0.35); ctx.quadraticCurveTo(x + h * 0.7, y - h, x + h * 1.1, y - h * 0.7); ctx.stroke(); break;
      case 'life': // heart
        ctx.moveTo(x, y + h * 0.8);
        ctx.bezierCurveTo(x - h * 1.4, y - h * 0.1, x - h * 0.6, y - h * 1.1, x, y - h * 0.35);
        ctx.bezierCurveTo(x + h * 0.6, y - h * 1.1, x + h * 1.4, y - h * 0.1, x, y + h * 0.8);
        ctx.fill(); break;
      case 'flip': // swap arrows
        ctx.moveTo(x - h * 1.1, y - h * 0.35); ctx.lineTo(x + h * 1.1, y - h * 0.35); ctx.lineTo(x + h * 0.6, y - h * 0.8);
        ctx.moveTo(x + h * 1.1, y + h * 0.35); ctx.lineTo(x - h * 1.1, y + h * 0.35); ctx.lineTo(x - h * 0.6, y + h * 0.8);
        ctx.stroke(); break;
    }
  }

  function drawStar(ctx, x, y, r, filled) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    if (filled) { ctx.fillStyle = '#ffd35a'; ctx.fill(); ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 1.5; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  var R = { roundRect: roundRect, drawIcon: drawIcon, drawStar: drawStar, FONT: FONT, CAPSULE_STYLE: CAPSULE_STYLE };

  // ---------------- cached sprites ----------------
  var bgCache = {}, ballSprite = null;
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function background(world, scale) {
    var key = world.n + '@' + scale;
    if (bgCache[key]) return bgCache[key];
    var c = makeCanvas(Math.ceil(C.W * scale), Math.ceil(C.H * scale)), x = c.getContext('2d');
    x.scale(scale, scale);
    var grd = x.createLinearGradient(0, 0, 0, C.H);
    grd.addColorStop(0, world.tint); grd.addColorStop(1, '#07080f');
    x.fillStyle = grd; x.fillRect(0, 0, C.W, C.H);
    x.fillStyle = 'rgba(255,255,255,0.045)';
    for (var gy = C.TOP + 8; gy < C.H; gy += 24) for (var gx = 12; gx < C.W; gx += 24) x.fillRect(gx, gy, 1.5, 1.5);
    bgCache[key] = c;
    return c;
  }
  function getBallSprite() {
    if (ballSprite) return ballSprite;
    var s = 64, c = makeCanvas(s, s), x = c.getContext('2d');
    var grd = x.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.35, 'rgba(160,220,255,0.22)'); grd.addColorStop(1, 'rgba(120,200,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, s, s);
    ballSprite = c;
    return c;
  }

  // Offscreen layers at playfield resolution (rules use them, e.g. the Lights Out darkness) and a soft light sprite.
  var layers = {}, lightSpr = null;
  R.layer = function (name) {
    var L = layers[name];
    if (!L) { var c = makeCanvas(C.W, C.H); L = layers[name] = { canvas: c, ctx: c.getContext('2d') }; }
    return L;
  };
  R.lightSprite = function () {
    if (lightSpr) return lightSpr;
    var s = 128, c = makeCanvas(s, s), x = c.getContext('2d');
    var grd = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, s, s);
    lightSpr = c;
    return c;
  };

  // ---------------- bricks ----------------
  // Small shape mark in the middle of a brick (so groups never rely on colour alone).
  function drawMark(ctx, b, cx, cy, col) {
    ctx.fillStyle = col;
    if (b.mark === 'dot') { ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill(); }
    else if (b.mark === 'square') ctx.fillRect(cx - 3, cy - 3, 6, 6);
  }

  // A brick that is see-through (or fading): faint fill, dashed outline. b.warn pulses a white outline just
  // before it turns solid; b.pending flickers while it waits for a ball to move out of the way.
  function drawGhost(ctx, b, t, gh) {
    var x = b.x, y = b.y, w = b.w, h = b.h;
    ctx.globalAlpha = 1 - 0.85 * gh;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = b.color; ctx.fill();
    ctx.globalAlpha = 0.45 + 0.55 * gh;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5; ctx.strokeStyle = b.color;
    roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 3); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (b.mark) drawMark(ctx, b, x + w / 2, y + h / 2, b.color);
    var wa = b.pending ? 0.5 + 0.5 * Math.sin(t * 40) : (b.warn > 0 ? b.warn * (0.55 + 0.45 * Math.sin(t * 26)) : 0);
    if (wa > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(1, wa).toFixed(3) + ')'; ctx.lineWidth = 2;
      roundRect(ctx, x - 0.5, y - 0.5, w + 1, h + 1, 3.5); ctx.stroke();
    }
  }

  function drawBrick(ctx, b, t) {
    var gh = b.ghost || 0;
    if (gh > 0.04) { drawGhost(ctx, b, t, gh); return; }
    var x = b.x, y = b.y, w = b.w, h = b.h;
    if (b.shake > 0) { b.shake -= 1 / 60; x += Math.sin(t * 90) * 1.2; }
    roundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = b.color; ctx.fill();
    // bevel
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x + 2, y + 1.5, w - 4, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 2, y + h - 3, w - 4, 2);
    var cx = x + w / 2, cy = y + h / 2;
    switch (b.type) {
      case 'armour':
        ctx.fillStyle = 'rgba(30,40,60,0.55)';
        for (var i = 0; i < b.hp; i++) { ctx.beginPath(); ctx.arc(cx - (b.hp - 1) * 3.5 + i * 7, cy + 1, 1.8, 0, TAU); ctx.fill(); }
        if (b.hp < b.maxHp) { // cracks
          ctx.strokeStyle = 'rgba(20,25,40,0.8)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 10, cy); ctx.lineTo(x + 8, y + h - 1);
          ctx.moveTo(x + 10, cy); ctx.lineTo(x + 16, cy - 2);
          if (b.maxHp - b.hp > 1) { ctx.moveTo(x + w - 5, y + 1); ctx.lineTo(x + w - 10, cy + 2); ctx.lineTo(x + w - 7, y + h - 1); }
          ctx.stroke();
        }
        break;
      case 'steel':
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var k = 6; k + h - 4 < w - 5; k += 6) { ctx.moveTo(x + k, y + h - 2); ctx.lineTo(x + k + h - 4, y + 2); }
        ctx.stroke();
        ctx.fillStyle = '#9aa3b5';
        ctx.beginPath(); ctx.arc(x + 4, cy, 1.5, 0, TAU); ctx.arc(x + w - 4, cy, 1.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3); ctx.stroke();
        break;
      case 'tnt':
        ctx.fillStyle = '#1b0505'; ctx.fillRect(x + 3, y + 2, 3, h - 4); ctx.fillRect(x + w - 6, y + 2, 3, h - 4);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('TNT', cx, cy + 0.5);
        break;
      case 'key':
        ctx.strokeStyle = '#5a3b00'; ctx.fillStyle = '#5a3b00'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx - 5, cy, 3, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 2, cy); ctx.lineTo(cx + 7, cy); ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 4, cy + 3); ctx.moveTo(cx + 7, cy); ctx.lineTo(cx + 7, cy + 3); ctx.stroke();
        var gl = 0.35 + 0.35 * Math.sin(t * 5);
        ctx.strokeStyle = 'rgba(255,255,200,' + gl.toFixed(3) + ')'; ctx.lineWidth = 2; roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 4); ctx.stroke();
        break;
      case 'locked':
        ctx.fillStyle = 'rgba(40,25,0,0.75)';
        ctx.fillRect(cx - 4, cy - 1, 8, 6);
        ctx.strokeStyle = 'rgba(40,25,0,0.75)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy - 1, 3, Math.PI, 0); ctx.stroke();
        break;
      case 'capsule':
        var hue = (t * 120 + x) % 360;
        ctx.strokeStyle = 'hsl(' + hue.toFixed(0) + ',90%,60%)'; ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 3); ctx.stroke();
        ctx.fillStyle = '#6a5acd'; ctx.font = 'bold 10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, cy + 0.5);
        break;
      case 'anchor':
        ctx.fillStyle = '#073b36';
        ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx - 6, cy + 1); ctx.lineTo(cx - 2, cy + 1); ctx.lineTo(cx - 2, y + h - 2);
        ctx.lineTo(cx + 2, y + h - 2); ctx.lineTo(cx + 2, cy + 1); ctx.lineTo(cx + 6, cy + 1); ctx.closePath(); ctx.fill();
        break;
      case 'glow': // a little sun
        var gp = 0.5 + 0.5 * Math.sin(t * 4 + x);
        ctx.fillStyle = '#8a5a00';
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (var ri = 0; ri < 6; ri++) { var ra = ri * TAU / 6 + t; ctx.moveTo(cx + Math.cos(ra) * 4.5, cy + Math.sin(ra) * 4.5); ctx.lineTo(cx + Math.cos(ra) * 6.5, cy + Math.sin(ra) * 6.5); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,240,170,' + (0.4 + 0.5 * gp).toFixed(3) + ')'; ctx.lineWidth = 2;
        roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 4.5); ctx.stroke();
        break;
      case 'switch': // half red, half blue, with swap arrows; the solid colour's half is outlined
        var redOn = b.showing !== 'blue';
        ctx.save(); roundRect(ctx, x, y, w, h, 3); ctx.clip();
        ctx.fillStyle = BT.Bricks.RED_COLOR; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = BT.Bricks.BLUE_COLOR; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - 7, cy - 2); ctx.lineTo(cx + 6, cy - 2); ctx.lineTo(cx + 3, cy - 5);
        ctx.moveTo(cx + 7, cy + 2); ctx.lineTo(cx - 6, cy + 2); ctx.lineTo(cx - 3, cy + 5); ctx.stroke();
        ctx.strokeStyle = redOn ? '#ffb0b8' : '#b0ccff'; ctx.lineWidth = 2;
        roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 4); ctx.stroke();
        break;
      case 'vine':
        ctx.fillStyle = b.withering ? 'rgba(120,90,40,0.8)' : '#1d7a3a';
        ctx.beginPath(); ctx.ellipse(cx - 5, cy, 4.5, 2.2, -0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 5, cy, 4.5, 2.2, 0.5, 0, TAU); ctx.fill();
        ctx.fillRect(cx - 0.75, cy - 4, 1.5, 8);
        break;
      case 'root':
        ctx.strokeStyle = '#3d2410'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx, cy + 1); ctx.lineTo(cx - 7, y + h - 2);
        ctx.moveTo(cx, cy + 1); ctx.lineTo(cx + 7, y + h - 2); ctx.moveTo(cx, cy + 1); ctx.lineTo(cx, y + h - 1); ctx.stroke();
        ctx.fillStyle = '#ffe0b0';
        for (var hi = 0; hi < b.hp; hi++) { ctx.beginPath(); ctx.arc(x + 5 + hi * 4, y + 4, 1.4, 0, TAU); ctx.fill(); }
        if (b.hp < b.maxHp) {
          ctx.strokeStyle = 'rgba(20,10,0,0.8)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x + w - 4, y + 2); ctx.lineTo(x + w - 9, cy); ctx.lineTo(x + w - 6, y + h - 2); ctx.stroke();
        }
        break;
      case 'ice': // frozen: frost facets and a snowflake; once thawed it is a plain brick with drips
        if (b.hp >= b.maxHp) {
          ctx.fillStyle = 'rgba(235,250,255,0.72)'; roundRect(ctx, x, y, w, h, 3); ctx.fill();
          ctx.strokeStyle = 'rgba(120,190,230,0.9)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 3, y + h - 2); ctx.lineTo(x + 9, y + 3); ctx.moveTo(x + w - 4, y + 2); ctx.lineTo(x + w - 9, y + h - 3); ctx.stroke();
          ctx.strokeStyle = '#3a8cc0'; ctx.lineWidth = 1.3; ctx.beginPath();
          for (var si = 0; si < 3; si++) { var sa = si * Math.PI / 3; ctx.moveTo(cx - Math.cos(sa) * 4.5, cy - Math.sin(sa) * 4.5); ctx.lineTo(cx + Math.cos(sa) * 4.5, cy + Math.sin(sa) * 4.5); }
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(220,245,255,0.8)';
          for (var di = 0; di < 3; di++) { var dx2 = x + 6 + di * 8; ctx.beginPath(); ctx.moveTo(dx2 - 2, y + h - 1); ctx.lineTo(dx2 + 2, y + h - 1); ctx.lineTo(dx2, y + h + 2 + (di % 2) * 2); ctx.closePath(); ctx.fill(); }
        }
        break;
      case 'splitter': // a ball breaking into three
        ctx.fillStyle = '#2a1040';
        ctx.beginPath(); ctx.arc(cx - 6, cy, 3.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 3, cy - 3, 1.8, 0, TAU); ctx.arc(cx + 7, cy + 1, 1.8, 0, TAU); ctx.arc(cx + 3, cy + 4, 1.8, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2a1040'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 2, cy); ctx.lineTo(cx + 0.5, cy); ctx.stroke();
        break;
      case 'pusher': // arrows pointing out at both walls
        ctx.fillStyle = '#4a2600';
        ctx.beginPath(); ctx.moveTo(x + 3, cy); ctx.lineTo(x + 9, cy - 4.5); ctx.lineTo(x + 9, cy + 4.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + w - 3, cy); ctx.lineTo(x + w - 9, cy - 4.5); ctx.lineTo(x + w - 9, cy + 4.5); ctx.closePath(); ctx.fill();
        ctx.fillRect(x + 9, cy - 1, w - 18, 2);
        break;
      case 'core':
        var pu = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * pu).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#b8860b';
        for (var j = 0; j < b.hp; j++) { ctx.beginPath(); ctx.arc(cx - (b.hp - 1) * 3 + j * 6, y + h - 4, 1.6, 0, TAU); ctx.fill(); }
        break;
    }
    if (b.mark) drawMark(ctx, b, cx, cy + 0.5, 'rgba(10,12,30,0.45)');
    if (b.ghostable) { // solid and switchable: crisp bright outline, the opposite of the ghost's dashed one
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
      roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 3); ctx.stroke();
    }
    if (b.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, b.flash * 7).toFixed(3) + ')';
      roundRect(ctx, x, y, w, h, 3); ctx.fill();
    }
  }
  R.drawBrick = drawBrick;

  function drawBricks(ctx, g) {
    var bs = g.bricks, t = g.t;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!b.alive || b.customDraw) continue;
      drawBrick(ctx, b, t);
      if (b.wrap) {
        var ox = b.x;
        if (b.x + b.w > C.W) { b.x -= C.W; drawBrick(ctx, b, t); b.x = ox; }
        else if (b.x < 0) { b.x += C.W; drawBrick(ctx, b, t); b.x = ox; }
      }
    }
  }

  // ---------------- paddle, balls, capsules ----------------
  var paddleGrads = {};
  function drawPaddle(ctx, g) {
    var p = g.paddle, e = g.eff;
    if (p.off) { // switched off (e.g. out of bounces): a faint dashed outline the ball falls through
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.h / 2); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    var sq = p.squash > 0 ? p.squash / C.paddle.squashTime : 0;
    var w = p.w * (1 + 0.08 * sq), h = p.h * (1 - 0.35 * sq);
    var x = p.x - w / 2, y = p.y - h / 2 + (p.h - h) / 2;
    if (e.daze > 0) x += Math.sin(g.t * 40) * 1.5;
    var col = e.flip > 0 ? '#e04dff' : (e['catch'] > 0 ? '#9b7bff' : '#4fd8ff');
    // glow
    ctx.fillStyle = 'rgba(79,216,255,0.12)';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, (h + 8) / 2); ctx.fill();
    var grd = paddleGrads[col];
    if (!grd) {
      grd = paddleGrads[col] = ctx.createLinearGradient(0, p.y - p.h / 2, 0, p.y + p.h / 2);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, col); grd.addColorStop(1, '#1b4f7a');
    }
    ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : grd;
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (e.laser > 0) {
      ctx.fillStyle = '#ff9f43';
      ctx.fillRect(x + 3, y - 5, 5, 7); ctx.fillRect(x + w - 8, y - 5, 5, 7);
    }
    if (e['catch'] > 0) {
      ctx.fillStyle = 'rgba(200,255,150,0.8)';
      for (var i = 0; i < 5; i++) ctx.fillRect(x + w * (0.15 + i * 0.175) - 1.5, y - 2, 3, 3 + (i % 2) * 2);
    }
    if (e.flip > 0) {
      ctx.strokeStyle = '#ffffff'; drawIcon(ctx, 'flip', p.x, p.y, 8);
    }
    if (e.daze > 0) {
      ctx.fillStyle = '#ffe27a';
      for (var k = 0; k < 3; k++) { var a = g.t * 6 + k * TAU / 3; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 14, p.y - 12 + Math.sin(a) * 4, 2, 0, TAU); ctx.fill(); }
    }
  }

  function drawBalls(ctx, g) {
    var spr = getBallSprite();
    for (var i = 0; i < g.balls.length; i++) {
      var b = g.balls[i];
      // trail
      var n = b.trailN, len = b.trail.length / 2;
      ctx.fillStyle = g.bomb ? '#ff8c3c' : '#aae1ff';
      for (var k = 0; k < n; k++) {
        var idx = (b.trailI - 1 - k + len * 2) % len;
        ctx.globalAlpha = (1 - k / n) * 0.35;
        var rr = b.r * (1 - k / n * 0.6);
        ctx.beginPath(); ctx.arc(b.trail[idx * 2], b.trail[idx * 2 + 1], rr, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var gs = b.r * 4; // glow scales with the ball (48px for the normal 6px ball)
      ctx.drawImage(spr, b.x - gs, b.y - gs, gs * 2, gs * 2);
      ctx.fillStyle = g.bomb ? '#ff7a3d' : '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      if (g.bomb) {
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath(); ctx.arc(b.x + Math.sin(g.t * 30) * 3, b.y - b.r - 2, 1.8, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(180,220,255,0.9)';
        ctx.beginPath(); ctx.arc(b.x - 1.8, b.y - 1.8, b.r * 0.35, 0, TAU); ctx.fill();
      }
    }
  }

  // Extra paddles (mirror paddle at the top, computer rival). Same look as yours, in their own colour.
  var xpGrads = {};
  function drawXPaddle(ctx, g, q) {
    if (q.off) return;
    var sq = q.squash > 0 ? q.squash / C.paddle.squashTime : 0;
    var w = q.w * (1 + 0.08 * sq), h = q.h * (1 - 0.35 * sq);
    var x = q.x - w / 2, y = q.y - h / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, (h + 8) / 2); ctx.fill();
    var key = q.color + '@' + q.y, grd = xpGrads[key];
    if (!grd) {
      grd = xpGrads[key] = ctx.createLinearGradient(0, q.y + q.h / 2, 0, q.y - q.h / 2); // lit from below: it faces down
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, q.color); grd.addColorStop(1, '#4a1f1f');
    }
    ctx.fillStyle = q.hitFlash > 0 ? '#ffffff' : grd;
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (q.kind === 'mirror') { // small chevrons: "copies you"
      ctx.strokeStyle = 'rgba(60,30,0,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(q.x - 4, q.y - 2); ctx.lineTo(q.x, q.y + 2); ctx.lineTo(q.x + 4, q.y - 2); ctx.stroke();
    }
  }

  // Draw fn at x, plus copies one playfield-width either side when the field wraps (seamless edges).
  function wrapDraw(ctx, g, fn, a) {
    fn(ctx, g, a);
    if (!g.wrapX) return;
    ctx.save(); ctx.translate(C.W, 0); fn(ctx, g, a); ctx.translate(-2 * C.W, 0); fn(ctx, g, a); ctx.restore();
  }

  function drawCapsule(ctx, type, x, y, t, scale) {
    var st = CAPSULE_STYLE[type] || { c: '#fff' };
    var w = C.capsule.w * (scale || 1), h = C.capsule.h * (scale || 1);
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = st.c; ctx.fill();
    if (st.bad) { // warning stripes on bad capsules
      ctx.save(); roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var k = -w; k < w; k += 8) { ctx.beginPath(); ctx.moveTo(x + k, y + h / 2); ctx.lineTo(x + k + 4, y + h / 2); ctx.lineTo(x + k + 4 + h, y - h / 2); ctx.lineTo(x + k + h, y - h / 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = '#10131f'; ctx.strokeStyle = '#10131f';
    drawIcon(ctx, type, x, y, h * 0.75);
  }

  // ---------------- HUD ----------------
  var EFFECT_ORDER = ['long', 'slow', 'catch', 'laser', 'shrink', 'flip'];
  function drawHUD(ctx, g, levelLabel, opts) {
    ctx.fillStyle = 'rgba(5,7,16,0.85)'; ctx.fillRect(0, 0, C.W, C.TOP);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, C.TOP - 1, C.W, 1);
    // lives
    var lx = 12;
    for (var i = 0; i < Math.min(g.lives, 5); i++) {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(lx + i * 14, 22, 5, 0, TAU); ctx.fill();
    }
    if (g.lives > 5) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('+' + (g.lives - 5), lx + 5 * 14, 22); }
    // level + score
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '11px ' + FONT;
    ctx.fillText(levelLabel, C.W / 2, 12);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 17px ' + FONT;
    ctx.fillText(String(g.score), C.W / 2, 29);
    if (g.combo >= 3) {
      ctx.fillStyle = '#ffd35a'; ctx.font = 'bold 11px ' + FONT; ctx.textAlign = 'left';
      ctx.fillText('x' + Math.min(g.combo, C.combo.maxMult) + ' combo', C.W / 2 + 34, 29);
    }
    // pause button
    roundRect(ctx, C.W - 44, 6, 36, 30, 8); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(C.W - 31, 14, 4, 14); ctx.fillRect(C.W - 23, 14, 4, 14);

    // timed effects with draining bars
    var ex = 6, ey = C.TOP + 4, d = C.capsule.durations;
    for (i = 0; i < EFFECT_ORDER.length; i++) {
      var k = EFFECT_ORDER[i], v = g.eff[k];
      if (!(v > 0)) continue;
      var st = CAPSULE_STYLE[k];
      roundRect(ctx, ex, ey, 40, 16, 5); ctx.fillStyle = 'rgba(5,7,16,0.7)'; ctx.fill();
      ctx.fillStyle = st.c; ctx.strokeStyle = st.c; drawIcon(ctx, k, ex + 10, ey + 7, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(ex + 20, ey + 6, 16, 3);
      ctx.fillStyle = st.c; ctx.fillRect(ex + 20, ey + 6, 16 * Math.min(1, v / d[k]), 3);
      ex += 44;
    }
    if (g.bomb) {
      roundRect(ctx, ex, ey, 22, 16, 5); ctx.fillStyle = 'rgba(5,7,16,0.7)'; ctx.fill();
      ctx.fillStyle = '#ff7a3d'; ctx.strokeStyle = '#ff7a3d'; drawIcon(ctx, 'bomb', ex + 11, ey + 8, 10);
    }
    // boss bar
    if (g.boss && !g.boss.s.defeated) {
      var s = g.boss.s, bw = 150, bx = C.W - bw - 8, by = C.TOP + 6;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 9px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(g.boss.mod.bossName.toUpperCase(), bx - 6, by + 4);
      roundRect(ctx, bx, by, bw, 8, 4); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
      var f = s.maxHp ? Math.max(0, s.hp / s.maxHp) : 0;
      if (f > 0) { roundRect(ctx, bx, by, bw * f, 8, 4); ctx.fillStyle = '#ff5a64'; ctx.fill(); }
    }
  }

  // ---------------- main draw ----------------
  var Render = {
    R: R,
    drawPlay: function (ctx, g, world, scale, opts) {
      opts = opts || {};
      ctx.drawImage(background(world, scale), 0, 0, C.W, C.H);
      ctx.save();
      if (g.shakeAmt > 0) ctx.translate((Math.random() - 0.5) * g.shakeAmt * 2, (Math.random() - 0.5) * g.shakeAmt * 2);
      // walls
      if (!g.wrapX) {
        ctx.fillStyle = 'rgba(120,160,255,0.18)';
        ctx.fillRect(0, C.TOP, 2, C.H - C.TOP); ctx.fillRect(C.W - 2, C.TOP, 2, C.H - C.TOP);
      }
      var i, r;
      for (i = 0; i < g.rules.length; i++) { r = g.rules[i]; if (r.mod.render) r.mod.render(ctx, g, r, 'back', R); }
      drawBricks(ctx, g);
      for (i = 0; i < g.rules.length; i++) { r = g.rules[i]; if (r.mod.renderOverBricks) r.mod.renderOverBricks(ctx, g, r, R); }
      // capsules
      for (i = 0; i < g.capsules.length; i++) {
        var c = g.capsules[i];
        if (c.alive) drawCapsule(ctx, c.type, c.x, c.y, g.t);
      }
      // Easy safety net
      if (g.netActive || g.netFlash > 0) {
        var na = g.netActive ? 0.45 + 0.2 * Math.sin(g.t * 3) : g.netFlash;
        ctx.fillStyle = 'rgba(124,245,255,' + (na * 0.35).toFixed(3) + ')';
        ctx.fillRect(0, C.net.y, C.W, 5);
        ctx.fillStyle = 'rgba(124,245,255,' + na.toFixed(3) + ')';
        ctx.fillRect(0, C.net.y, C.W, 2);
      }
      wrapDraw(ctx, g, drawPaddle);
      for (i = 0; i < g.xpaddles.length; i++) wrapDraw(ctx, g, drawXPaddle, g.xpaddles[i]);
      // lasers
      ctx.fillStyle = '#ffb36b';
      for (i = 0; i < g.lasers.length; i++) { var L = g.lasers[i]; if (L.alive) ctx.fillRect(L.x - 1.5, L.y - 8, 3, 12); }
      wrapDraw(ctx, g, drawBalls);
      BT.Particles.draw(ctx);
      for (i = 0; i < g.rules.length; i++) { r = g.rules[i]; if (r.mod.render) r.mod.render(ctx, g, r, 'front', R); }
      ctx.restore();
      drawHUD(ctx, g, opts.label || '', opts);
      // serve hint
      if (g.state === 'serve' && opts.hint) {
        var a = 0.55 + 0.35 * Math.sin(g.t * 4);
        ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(opts.hint, C.W / 2, C.paddle.y - 70);
        if (opts.sub) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '12px ' + FONT;
          wrapText(ctx, opts.sub, C.W / 2, C.paddle.y - 48, C.W - 40, 15);
        }
      }
    },
    drawCapsule: drawCapsule,
    background: background
  };

  function wrapText(ctx, text, x, y, maxW, lineH) {
    var words = text.split(' '), line = '', yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = words[i]; yy += lineH; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy + lineH;
  }
  R.wrapText = wrapText;

  BT.Render = Render;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
