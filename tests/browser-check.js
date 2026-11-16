// Optional real-browser smoke test of the built index.html (needs Playwright; not part of the game).
// Run: node tests/browser-check.js [outDir]
// Checks: boots with no console errors, no network requests, level starts via real taps, touch drag moves
// the paddle, ball moves and bricks break, every level runs, works inside a sandboxed iframe.
'use strict';
var path = require('path');
var fs = require('fs');
var pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }

var ROOT = path.join(__dirname, '..');
var OUT = process.argv[2] || path.join(ROOT, 'tests', 'shots');
var URL = 'file://' + path.join(ROOT, 'index.html');
var fails = 0;
function ok(c, m) { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; }

(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  var browser;
  try { browser = await pw.chromium.launch(); } catch (e) { browser = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome' }); }
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var page = await ctx.newPage();
  var errors = [], requests = [];
  page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('request', function (r) { if (r.url() !== URL) requests.push(r.url()); });

  await page.goto(URL);
  await page.waitForTimeout(500);
  ok(await page.evaluate(function () { return !!(window.BT && BT.App && BT.App.scene === 'select'); }), 'boots to level select');
  await page.screenshot({ path: path.join(OUT, '01-select.png') });

  // helper: logical -> CSS px
  async function pt(x, y) {
    return page.evaluate(function (a) { var v = BT.App.view; return { x: v.ox + a[0] * v.scale, y: v.oy + a[1] * v.scale }; }, [x, y]);
  }
  // tap level 1 tile (logical 48, 210)
  var p = await pt(48, 210);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(200);
  var st = await page.evaluate(function () { return { scene: BT.App.scene, overlay: BT.App.overlay, id: BT.App.level && BT.App.level.id }; });
  ok(st.scene === 'play' && st.id === 1, 'tapping tile 1 starts level 1');
  ok(st.overlay === 'banner', 'first-time twist banner shows');
  await page.screenshot({ path: path.join(OUT, '02-banner.png') });
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(150);
  ok(await page.evaluate(function () { return BT.App.overlay === null; }), 'tap dismisses the banner');

  // touch drag via CDP: relative drag moves the paddle
  var cdp = await ctx.newCDPSession(page);
  async function touch(type, x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, id: 1 }] });
  }
  var px0 = await page.evaluate(function () { return BT.App.game.paddle.x; });
  var s = await pt(100, 400), e2 = await pt(160, 400);
  await touch('touchStart', s.x, s.y);
  for (var i = 1; i <= 6; i++) { await touch('touchMove', s.x + (e2.x - s.x) * i / 6, s.y); await page.waitForTimeout(16); }
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(100);
  var px1 = await page.evaluate(function () { return BT.App.game.paddle.x; });
  ok(Math.abs((px1 - px0) - 60 * 1.25) < 4, 'relative touch drag moves paddle by drag x sensitivity (' + (px1 - px0).toFixed(1) + 'px for a 60px drag)');
  ok(await page.evaluate(function () { return BT.App.game.state === 'serve'; }), 'a drag does not launch the ball');

  // tap to launch
  var before = await page.evaluate(function () { var g = BT.App.game; return { y: g.balls[0].y, req: g.requiredLeft() }; });
  await page.touchscreen.tap(s.x, s.y);
  await page.waitForTimeout(1600);
  var after = await page.evaluate(function () { var g = BT.App.game; return { state: g.state, y: g.balls.length ? g.balls[0].y : null, req: g.requiredLeft(), score: g.score }; });
  ok(after.state === 'play', 'tap launches the ball');
  ok(after.y !== null && after.y !== before.y, 'ball moves (' + before.y.toFixed(0) + ' -> ' + (after.y === null ? '-' : after.y.toFixed(0)) + ')');
  // keep the paddle under the ball for a few seconds with an in-page helper using the public input API
  await page.evaluate(function () {
    window.__bot = setInterval(function () {
      var g = BT.App.game; if (!g || !g.balls.length) return;
      var b = g.balls[0]; g.pointTo(b.x + Math.sin(performance.now() / 700) * 18); if (b.stuck) g.tap();
    }, 16);
  });
  await page.waitForTimeout(2500);
  var mid = await page.evaluate(function () { var g = BT.App.game; return { req: g.requiredLeft(), score: g.score, parts: BT.Particles.count() }; });
  ok(mid.req < before.req, 'bricks break (' + before.req + ' -> ' + mid.req + ', score ' + mid.score + ')');
  await page.screenshot({ path: path.join(OUT, '03-play-l1.png') });

  // pause button in HUD
  var pb = await pt(340, 20);
  await page.touchscreen.tap(pb.x, pb.y);
  await page.waitForTimeout(100);
  ok(await page.evaluate(function () { return BT.App.overlay === 'pause'; }), 'HUD pause button pauses');
  await page.screenshot({ path: path.join(OUT, '04-pause.png') });
  var rs = await pt(180, 264);
  await page.touchscreen.tap(rs.x, rs.y);
  await page.waitForTimeout(50);

  // every level: start, launch, run 4s with the helper, screenshot
  for (var id = 1; id <= 15; id++) {
    await page.evaluate(function (id) { BT.Save.data.seen = {}; BT.App.startLevel(id, true); BT.App.game.tap(); }, id);
    await page.waitForTimeout(id === 12 ? 600 : 4000);
    var info = await page.evaluate(function () { var g = BT.App.game; return { state: g.state, balls: g.balls.length, t: g.t.toFixed(1) }; });
    ok(info.state !== 'lost', 'level ' + id + ' runs (state ' + info.state + ', t ' + info.t + ')');
    await page.screenshot({ path: path.join(OUT, 'level-' + (id < 10 ? '0' : '') + id + '.png') });
  }
  // results card: force a win on level 3
  await page.evaluate(function () { BT.App.startLevel(3, true); var g = BT.App.game; g.tap(); g.bricks.forEach(function (b) { if (b.required && b.alive) g.destroyBrick(b, 'test'); }); });
  await page.waitForTimeout(2600);
  ok(await page.evaluate(function () { return BT.App.overlay === 'won'; }), 'clearing a level shows the results card');
  await page.screenshot({ path: path.join(OUT, '05-won.png') });
  await page.evaluate(function () { clearInterval(window.__bot); BT.App.toSelect(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '06-select-after.png') });

  ok(errors.length === 0, 'no console errors or warnings' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  ok(requests.length === 0, 'no network requests' + (requests.length ? ': ' + requests.join(', ') : ''));

  // Sandboxed iframe (no same-origin: localStorage throws)
  var page2 = await ctx.newPage();
  var err2 = [];
  page2.on('pageerror', function (e) { err2.push(e.message); });
  page2.on('console', function (m) { if (m.type() === 'error') err2.push(m.text()); });
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  await page2.setContent('<iframe id="f" sandbox="allow-scripts" style="width:360px;height:640px;border:0"></iframe>');
  await page2.evaluate(function (h) { document.getElementById('f').srcdoc = h; }, html);
  await page2.waitForTimeout(800);
  var frame = page2.frames()[1];
  var fr = await frame.evaluate(function () {
    var thrown = false; try { localStorage.getItem('x'); } catch (e) { thrown = true; }
    BT.App.startLevel(1, true); BT.App.game.tap();
    return { scene: BT.App.scene, storageThrows: thrown, saveOk: BT.Save.ok };
  });
  await page2.waitForTimeout(500);
  ok(fr.scene === 'play' && err2.length === 0, 'runs inside a sandboxed iframe (storage throws: ' + fr.storageThrows + ', saving: ' + fr.saveOk + ')' + (err2.length ? ' errors: ' + err2.join(' | ') : ''));
  await page2.screenshot({ path: path.join(OUT, '07-iframe.png') });

  // Laptop: mouse + keyboard
  var ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  var page3 = await ctx3.newPage();
  var err3 = [];
  page3.on('pageerror', function (e) { err3.push(e.message); });
  await page3.goto(URL);
  await page3.waitForTimeout(300);
  var v3 = await page3.evaluate(function () { return BT.App.view; });
  await page3.mouse.click(v3.ox + 48 * v3.scale, v3.oy + 210 * v3.scale);
  await page3.keyboard.press('Space'); // dismiss banner
  await page3.mouse.move(v3.ox + 250 * v3.scale, v3.oy + 500 * v3.scale);
  await page3.waitForTimeout(150);
  var mx = await page3.evaluate(function () { return BT.App.game.paddle.x; });
  ok(Math.abs(mx - 250) < 2, 'mouse moves the paddle to the pointer (' + mx.toFixed(1) + ')');
  await page3.keyboard.down('ArrowLeft'); await page3.waitForTimeout(300); await page3.keyboard.up('ArrowLeft');
  var kx = await page3.evaluate(function () { return BT.App.game.paddle.x; });
  ok(kx < mx - 50, 'arrow keys move the paddle (' + kx.toFixed(1) + ')');
  await page3.keyboard.press('Space');
  await page3.waitForTimeout(300);
  ok(await page3.evaluate(function () { return BT.App.game.state === 'play'; }) && err3.length === 0, 'space launches; no errors on desktop');
  await page3.screenshot({ path: path.join(OUT, '08-desktop.png') });

  await browser.close();
  console.log(fails ? fails + ' browser checks FAILED' : 'all browser checks passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
