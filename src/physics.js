// Pure collision / motion helpers. No DOM. Uses a shared scratch object to avoid allocations.
(function (BT) {
  'use strict';

  var HIT = { nx: 0, ny: 0, depth: 0 };
  var DEG = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // Circle vs axis-aligned rect. Returns penetration depth (>0 when overlapping) and fills HIT.nx/ny
  // with the push-out normal (from rect towards circle centre).
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    var qx = clamp(cx, rx, rx + rw);
    var qy = clamp(cy, ry, ry + rh);
    var dx = cx - qx, dy = cy - qy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return 0;
    if (d2 > 1e-9) {
      var d = Math.sqrt(d2);
      HIT.nx = dx / d; HIT.ny = dy / d; HIT.depth = r - d;
      return HIT.depth;
    }
    // centre is inside the rect: push out along the axis of least penetration
    var l = cx - rx, rr = rx + rw - cx, t = cy - ry, b = ry + rh - cy;
    var m = Math.min(l, rr, t, b);
    if (m === l) { HIT.nx = -1; HIT.ny = 0; }
    else if (m === rr) { HIT.nx = 1; HIT.ny = 0; }
    else if (m === t) { HIT.nx = 0; HIT.ny = -1; }
    else { HIT.nx = 0; HIT.ny = 1; }
    HIT.depth = m + r;
    return HIT.depth;
  }

  function circleCircle(cx, cy, r, ox, oy, or) {
    var dx = cx - ox, dy = cy - oy, rr = r + or;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return 0;
    var d = Math.sqrt(d2);
    if (d < 1e-6) { HIT.nx = 0; HIT.ny = -1; HIT.depth = rr; return rr; }
    HIT.nx = dx / d; HIT.ny = dy / d; HIT.depth = rr - d;
    return HIT.depth;
  }

  // Reflect ball velocity about normal if moving into the surface. Returns true if reflected.
  function reflect(ball, nx, ny) {
    var dot = ball.vx * nx + ball.vy * ny;
    if (dot >= 0) return false;
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;
    return true;
  }

  // Set velocity magnitude to speed, and keep the ball from travelling too close to horizontal.
  function normalizeVel(ball, speed, minVyFrac) {
    var vx = ball.vx, vy = ball.vy;
    var s = Math.sqrt(vx * vx + vy * vy);
    if (!(s > 1e-6)) { vx = 0; vy = -1; s = 1; }
    vx /= s; vy /= s;
    if (Math.abs(vy) < minVyFrac) {
      vy = (vy < 0 ? -1 : (vy > 0 ? 1 : -1)) * minVyFrac;
      vx = (vx < 0 ? -1 : 1) * Math.sqrt(1 - minVyFrac * minVyFrac);
    }
    ball.vx = vx * speed;
    ball.vy = vy * speed;
  }

  function rotateVel(ball, rad) {
    var c = Math.cos(rad), s = Math.sin(rad);
    var vx = ball.vx * c - ball.vy * s;
    ball.vy = ball.vx * s + ball.vy * c;
    ball.vx = vx;
  }

  // Angle (radians, 0 = straight up, + = right) for a ball leaving the paddle.
  function paddleAngle(ballX, paddleX, paddleHalfW, paddleVx, cfgBall) {
    var t = clamp((ballX - paddleX) / paddleHalfW, -1, 1);
    var a = t * cfgBall.maxAngleDeg;
    a += clamp(paddleVx * cfgBall.englishPerSpeed, -cfgBall.englishMaxDeg, cfgBall.englishMaxDeg);
    a = clamp(a, -cfgBall.maxAngleDeg, cfgBall.maxAngleDeg);
    return a * DEG;
  }

  // Straight-line prediction of where a ball crosses targetY, reflecting off side walls.
  function predictLandingX(x, y, vx, vy, targetY, left, right) {
    if (vy <= 0) return x;
    var t = (targetY - y) / vy;
    var px = x + vx * t;
    var w = right - left;
    if (w <= 0) return x;
    var u = (px - left) % (2 * w);
    if (u < 0) u += 2 * w;
    return u <= w ? left + u : right - (u - w);
  }

  BT.Physics = {
    HIT: HIT, DEG: DEG, clamp: clamp,
    circleRect: circleRect, circleCircle: circleCircle,
    reflect: reflect, normalizeVel: normalizeVel, rotateVel: rotateVel,
    paddleAngle: paddleAngle, predictLandingX: predictLandingX
  };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
