// Optional real-browser smoke test of the built index.html (needs Playwright; not part of the game).
// Run: node tests/browser-check.js [outDir]
// Checks: boots with no console errors, no network requests, level starts via real taps, touch drag moves
// the paddle, ball moves and bricks break, every level runs, the level select scrolls by touch and wheel
// without starting levels by accident, the ending screen after the final boss, works in a sandboxed iframe.
// Endless: locked on a fresh save, opens after World 1, a run starts by touch, plays, advances a round, shows
// the results card, bests persist; many generated rounds render without errors.
// PWA (served over HTTP on localhost under /brick-twist/, like GitHub Pages): manifest valid and linked, icons
// load, the service worker registers and takes control, the game loads offline after one visit, and after a
// rebuild an online reload gets the new version (old caches deleted); no console errors in a sandboxed iframe.
'use strict';
var path = require('path');
var fs = require('fs');
var http = require('http');
var os = require('os');
var crypto = require('crypto');
var childProcess = require('child_process');
var pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }

var ROOT = path.join(__dirname, '..');
var OUT = process.argv[2] || path.join(ROOT, 'tests', 'shots');
var URL = 'file://' + path.join(ROOT, 'index.html');
var fails = 0;
var BT_BOSS_IDS = [20, 25, 30, 35, 40];
var LAST = 40;
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
  for (var id = 1; id <= LAST; id++) {
    await page.evaluate(function (id) { BT.Save.data.seen = {}; BT.App.startLevel(id, true); }, id);
    if (id > 15) { // phase 2: also capture the opening moment, before launch, to check the twist reads safely
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'level-' + id + '-serve.png') });
    }
    await page.evaluate(function () { // count what the ball touches besides walls and the paddle (any brick hit, portal...)
      if (!window.__play) { window.__play = BT.Audio.play; BT.Audio.play = function (n, a) { if (['launch', 'paddle', 'wall', 'powerup', 'powerdown'].indexOf(n) < 0) window.__touches++; return window.__play.call(BT.Audio, n, a); }; }
      window.__touches = 0; BT.App.game.tap();
    });
    await page.waitForTimeout(id === 12 ? 600 : 4000);
    var info = await page.evaluate(function () { var g = BT.App.game; return { state: g.state, balls: g.balls.length, t: g.t.toFixed(1), req: g.requiredLeft(), score: g.score, touches: window.__touches }; });
    ok(info.state !== 'lost', 'level ' + id + ' runs (state ' + info.state + ', t ' + info.t + (id > 15 ? ', score ' + info.score : '') + ')');
    if (id > 15) ok(info.touches > 0 || (BT_BOSS_IDS.indexOf(id) >= 0), 'level ' + id + ' ball reaches something in 4s (score ' + info.score + ', touches ' + info.touches + ')');
    await page.screenshot({ path: path.join(OUT, 'level-' + (id < 10 ? '0' : '') + id + '.png') });
    if (id > 15) { // and a later moment, for twists that develop over time
      await page.waitForTimeout(5000);
      var info2 = await page.evaluate(function () { var g = BT.App.game; return { state: g.state, t: g.t.toFixed(1) }; });
      ok(info2.state !== 'lost', 'level ' + id + ' still running at t ' + info2.t + ' (state ' + info2.state + ')');
      await page.screenshot({ path: path.join(OUT, 'level-' + id + '-later.png') });
    }
  }
  // first-time banners of the new twists
  for (id = 16; id <= LAST; id++) {
    var bn = await page.evaluate(function (id) { BT.Save.data.seen = {}; BT.App.startLevel(id); return { overlay: BT.App.overlay, banner: BT.App.level.banner }; }, id);
    ok(bn.overlay === 'banner' && bn.banner.length > 10, 'level ' + id + ' shows its first-time banner');
    if (id === 16 || id === 21 || id === 24 || id === 28 || id === 39 || id === 40) await page.screenshot({ path: path.join(OUT, 'banner-' + id + '.png') });
  }
  await page.evaluate(function () { BT.App.doAction('dismissBanner'); });
  // results card: force a win on level 3
  await page.evaluate(function () { BT.App.startLevel(3, true); var g = BT.App.game; g.tap(); g.bricks.forEach(function (b) { if (b.required && b.alive) g.destroyBrick(b, 'test'); }); });
  await page.waitForTimeout(2600);
  ok(await page.evaluate(function () { return BT.App.overlay === 'won'; }), 'clearing a level shows the results card');
  await page.screenshot({ path: path.join(OUT, '05-won.png') });
  await page.evaluate(function () { clearInterval(window.__bot); BT.App.toSelect(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '06-select-after.png') });

  // level select with saved progress through level 15: World 4 opens at 16, 17 stays locked
  var sel = await page.evaluate(function () {
    var keep = JSON.stringify(BT.Save.data);
    for (var i = 1; i <= 15; i++) BT.Save.data.progress[i] = { stars: 2, best: 100, cleared: true };
    BT.App.toSelect();
    return { keep: keep, u16: BT.Save.isUnlocked(16), u17: BT.Save.isUnlocked(17), stars: BT.Save.totalStars() };
  });
  ok(sel.u16 && !sel.u17 && sel.stars === 30, 'after level 15, level 16 unlocks and 17 stays locked');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '09-select-world4.png') });
  var r16 = await page.evaluate(function () { return BT.UI.tileRect(16, BT.App.sel.scroll); });
  ok(r16.visible, 'the newly opened World 4 row is in view');
  var t16 = await pt(r16.x + 28, r16.y + 27); // World 4 row, first tile
  await page.touchscreen.tap(t16.x, t16.y);
  await page.waitForTimeout(200);
  var st16 = await page.evaluate(function () { return { scene: BT.App.scene, id: BT.App.level && BT.App.level.id }; });
  ok(st16.scene === 'play' && st16.id === 16, 'tapping the first World 4 tile starts level 16');
  await page.evaluate(function () {
    for (var i = 16; i <= 25; i++) BT.Save.data.progress[i] = { stars: (i % 3) + 1, best: 100, cleared: true };
    BT.App.toSelect();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '10-select-all.png') });

  // a phase-2 player (cleared 1-25) carries straight on into World 6: 26 open, 27 locked, stars untouched
  var p2 = await page.evaluate(function () {
    BT.Save.data.progress = {};
    for (var i = 1; i <= 25; i++) BT.Save.data.progress[i] = { stars: (i % 3) + 1, best: 100, cleared: true };
    BT.App.level = null; BT.App.toSelect();
    return { u26: BT.Save.isUnlocked(26), u27: BT.Save.isUnlocked(27), stars: BT.Save.totalStars(), scroll: BT.App.sel.scroll, r26: BT.UI.tileRect(26, BT.App.sel.scroll) };
  });
  ok(p2.u26 && !p2.u27 && p2.stars === 50, 'phase-2 save: 26 unlocks after 25, 27 stays locked, stars untouched (' + p2.stars + ')');
  ok(p2.r26.visible, 'opening the list scrolls so World 6 is in view (scroll ' + p2.scroll.toFixed(0) + ')');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '11-select-world6.png') });

  // all eight worlds: scroll by touch drag. A drag never starts a level; a tap after it does.
  await page.evaluate(function () {
    for (var i = 1; i <= 39; i++) BT.Save.data.progress[i] = { stars: (i % 3) + 1, best: 100, cleared: true };
    BT.App.level = null; BT.App.toSelect(); BT.App.sel.scroll = 0;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '12-select-top.png') });
  var dragA = await pt(150, 560), dragB = await pt(150, 330); // starts on a World 6 tile
  var startTile = await page.evaluate(function () { return BT.UI.hit(150, 560); });
  await touch('touchStart', dragA.x, dragA.y);
  for (i = 1; i <= 10; i++) { await touch('touchMove', dragA.x, dragA.y + (dragB.y - dragA.y) * i / 10); await page.waitForTimeout(16); }
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(600);
  var sc1 = await page.evaluate(function () { return { scene: BT.App.scene, scroll: BT.App.sel.scroll, max: BT.UI.maxScroll() }; });
  ok(sc1.max > 0, 'eight worlds do not fit: the list scrolls (range ' + sc1.max.toFixed(0) + 'px)');
  ok(sc1.scene === 'select' && sc1.scroll > sc1.max * 0.8, 'touch drag scrolls the level list (to ' + sc1.scroll.toFixed(0) + ') and does not start ' + startTile);
  await page.screenshot({ path: path.join(OUT, '13-select-bottom.png') });
  var r40 = await page.evaluate(function () { return BT.UI.tileRect(40, BT.App.sel.scroll); });
  ok(r40.visible, 'after scrolling, the World 8 row is in view');
  var t40 = await pt(r40.x + 28, r40.y + 27);
  await page.touchscreen.tap(t40.x, t40.y);
  await page.waitForTimeout(200);
  var st40 = await page.evaluate(function () { return { scene: BT.App.scene, id: BT.App.level && BT.App.level.id }; });
  ok(st40.scene === 'play' && st40.id === 40, 'tapping the scrolled-in final boss tile starts level 40');
  // header stays put: a tap on a tile scrolled up under the header does nothing
  await page.evaluate(function () { BT.App.toSelect(); BT.App.sel.scroll = 60; });
  var hidden = await page.evaluate(function () { return BT.UI.tileRect(1, BT.App.sel.scroll); });
  var under = await pt(48, 146); // under the header, over the hidden top part of tile 1 (not a header button)
  await page.waitForTimeout(100);
  await page.touchscreen.tap(under.x, under.y);
  await page.waitForTimeout(150);
  ok(!hidden.visible && await page.evaluate(function () { return BT.App.scene === 'select' && BT.Save.data.difficulty === 'normal'; }) === true,
    'a tile scrolled under the header cannot be tapped through it');
  await page.evaluate(function () { BT.Save.setDifficulty('normal'); });

  // the ending screen after beating the final boss
  await page.evaluate(function () {
    BT.App.startLevel(40, true); var g = BT.App.game; g.tap();
    var r = g.boss; r.s.phase = 2; r.s.phaseHp = 1; r.s.hp = 1; r.s.hitCd = 0;
    r.mod.hitCore(g, r);
  });
  await page.waitForTimeout(2800);
  var end = await page.evaluate(function () { return { overlay: BT.App.overlay, stars: BT.Save.levelInfo(40).stars }; });
  ok(end.overlay === 'ending', 'beating The Machine shows the ending screen (overlay ' + end.overlay + ')');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '14-ending.png') });
  var back = await pt(180, 470);
  await page.touchscreen.tap(back.x, back.y);
  await page.waitForTimeout(200);
  ok(await page.evaluate(function () { return BT.App.scene === 'select'; }), 'the ending screen returns to the level select');
  await page.screenshot({ path: path.join(OUT, '15-select-after-ending.png') });
  await page.evaluate(function (k) { BT.Save.data = JSON.parse(k); BT.Save.write(); }, sel.keep);

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
  // mouse wheel scrolls the level list
  await page3.evaluate(function () { for (var i = 1; i <= 39; i++) BT.Save.data.progress[i] = { stars: 1, best: 1, cleared: true }; BT.App.toSelect(); BT.App.sel.scroll = 0; });
  await page3.mouse.move(v3.ox + 180 * v3.scale, v3.oy + 400 * v3.scale);
  await page3.mouse.wheel(0, 400);
  await page3.waitForTimeout(200);
  var wh = await page3.evaluate(function () { return { s: BT.App.sel.scroll, scene: BT.App.scene }; });
  ok(wh.s > 50 && wh.scene === 'select', 'mouse wheel scrolls the level list (' + wh.s.toFixed(0) + ')');
  var dr = await page3.evaluate(function () { return BT.App.sel.scroll; });
  await page3.mouse.move(v3.ox + 150 * v3.scale, v3.oy + 300 * v3.scale); await page3.mouse.down();
  await page3.mouse.move(v3.ox + 150 * v3.scale, v3.oy + 450 * v3.scale, { steps: 8 }); await page3.mouse.up();
  await page3.waitForTimeout(100);
  var dr2 = await page3.evaluate(function () { return { s: BT.App.sel.scroll, scene: BT.App.scene }; });
  ok(dr2.s < dr - 50 && dr2.scene === 'select', 'mouse drag scrolls the list too, without starting a level');

  await endlessChecks(browser);
  await pwaChecks(browser);

  await browser.close();
  console.log(fails ? fails + ' browser checks FAILED' : 'all browser checks passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });

// ------------------------------------------------------------------ Endless in a real browser
async function endlessChecks(browser) {
  console.log('-- Endless');
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var page = await ctx.newPage(), errors = [];
  page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  await page.goto(URL);
  await page.waitForTimeout(400);
  async function pt(x, y) { return page.evaluate(function (a) { var v = BT.App.view; return { x: v.ox + a[0] * v.scale, y: v.oy + a[1] * v.scale }; }, [x, y]); }
  var bar = await page.evaluate(function () { return BT.UI.ENDLESS_BAR; });
  var barPt = await pt(bar.x + bar.w / 2, bar.y + bar.h / 2);

  // locked on a fresh save: a tap explains, nothing starts
  ok(await page.evaluate(function () { return !BT.App.endlessOpen() && BT.CONFIG.endless.unlockAll === false; }), 'Endless is locked on a fresh save');
  await page.touchscreen.tap(barPt.x, barPt.y);
  await page.waitForTimeout(150);
  ok(await page.evaluate(function () { return BT.App.scene === 'select' && BT.App.lockMsgT > 0; }), 'tapping the locked Endless bar starts nothing and shows a hint');
  await page.screenshot({ path: path.join(OUT, 'endless-01-locked.png') });

  // finish World 1 (levels 1-5), reload: Endless opens
  await page.evaluate(function () { for (var i = 1; i <= 5; i++) BT.Save.record(i, 2, 500); });
  await page.reload(); await page.waitForTimeout(400);
  ok(await page.evaluate(function () { return BT.App.endlessOpen() && BT.Endless.completedWorlds(function (id) { return BT.Save.levelInfo(id).cleared; }).join() === '1'; }), 'after World 1, Endless opens (with World 1 twists)');
  // the bar stays in view however the list is scrolled
  await page.evaluate(function () { BT.App.sel.scroll = BT.UI.maxScroll(); });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, 'endless-02-entry.png') });
  ok(await page.evaluate(function (a) { return BT.UI.hit(a[0], a[1]) === 'endless'; }, [bar.x + 40, bar.y + 20]), 'the Endless bar is tappable with the list scrolled to the end');

  // a run starts by touch
  await page.touchscreen.tap(barPt.x, barPt.y);
  await page.waitForTimeout(250);
  var st = await page.evaluate(function () { var a = BT.App; return { scene: a.scene, mode: a.mode, overlay: a.overlay, round: a.run && a.run.round, twists: a.level.twists, lives: a.game.lives }; });
  ok(st.scene === 'play' && st.mode === 'endless' && st.overlay === 'round' && st.round === 1, 'tapping the bar starts an Endless run with a Round 1 card');
  ok(st.twists.length >= 1 && st.twists.every(function (t) { return t === 'fuse' || t === 'lockkey'; }), 'with only World 1 finished, the twists are World 1 ones (' + st.twists.join('+') + ')');
  await page.screenshot({ path: path.join(OUT, 'endless-03-round-card.png') });
  await page.waitForTimeout(2700);
  ok(await page.evaluate(function () { return BT.App.overlay === null; }), 'the round card goes by itself');
  var mid = await pt(180, 400);
  await page.touchscreen.tap(mid.x, mid.y);
  await page.waitForTimeout(400);
  ok(await page.evaluate(function () { return BT.App.game.state === 'play'; }), 'a tap launches the ball');
  await page.evaluate(function () {
    window.__ebot = setInterval(function () {
      var g = BT.App.game; if (!g || !g.balls.length || BT.App.overlay) return;
      var b = g.balls[0]; g.pointTo(b.x + Math.sin(performance.now() / 700) * 18); if (b.stuck) g.tap();
    }, 16);
  });
  await page.waitForTimeout(2500);
  var hud = await page.evaluate(function () { return { label: BT.App.label(), score: BT.App.game.score, round: BT.App.run.round }; });
  ok(/ROUND 1/.test(hud.label), 'the HUD shows the round (' + hud.label + ', score ' + hud.score + ')');
  await page.screenshot({ path: path.join(OUT, 'endless-04-round1-play.png') });

  // clear the round: straight on to Round 2, lives and score carried
  var before = await page.evaluate(function () { var g = BT.App.game; g.bricks.forEach(function (b) { if (b.required && b.alive) g.destroyBrick(b, 'test'); }); return { lives: g.lives }; });
  await page.waitForTimeout(2400); // last-brick slow motion, then the win delay
  var r2 = await page.evaluate(function () { var a = BT.App; return { round: a.run.round, overlay: a.overlay, lives: a.game.lives, score: a.game.score, runScore: a.run.score }; });
  ok(r2.round === 2 && r2.overlay === 'round' && r2.lives === before.lives && r2.score === r2.runScore && r2.score > 0, 'clearing a round goes to Round 2 with lives and score carried (' + JSON.stringify({ before: before, after: r2 }) + ')');
  await page.screenshot({ path: path.join(OUT, 'endless-05-round2-card.png') });
  await page.evaluate(function () { BT.App.doAction('dismissRound'); });

  // run over: results card with round, score and bests
  await page.evaluate(function () { var g = BT.App.game; g.tap(); g.lives = 1; g.loseLife('fell'); });
  await page.waitForTimeout(1300);
  var over = await page.evaluate(function () { var a = BT.App; return { overlay: a.overlay, res: a.run.result, best: BT.Save.endlessBest(a.run.preset) }; });
  ok(over.overlay === 'over' && over.res.round === 2 && over.best.round === 2 && over.best.score === over.res.score && over.res.newRound, 'losing the last life shows the results card with round reached and new bests (' + JSON.stringify(over.res) + ')');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'endless-06-results.png') });
  // play again by touch, in well under a second
  var again = await pt(180, 401);
  var t0 = Date.now();
  await page.touchscreen.tap(again.x, again.y);
  await page.waitForFunction(function () { return BT.App.run && BT.App.run.round === 1 && BT.App.overlay === 'round'; }, null, { timeout: 1000 });
  var restartMs = Date.now() - t0;
  var inPage = await page.evaluate(function () { var t = performance.now(); BT.App.doAction('endlessAgain'); return performance.now() - t; });
  ok(restartMs < 1000 && inPage < 100, 'Play again starts a new run at once (' + restartMs + 'ms by touch, ' + inPage.toFixed(1) + 'ms to build the round)');
  // bests persist across a reload
  await page.evaluate(function () { BT.App.toSelect(); });
  await page.reload(); await page.waitForTimeout(400);
  var kept = await page.evaluate(function () { return BT.Save.endlessBest(BT.Save.data.difficulty); });
  ok(kept.round === 2 && kept.score === over.best.score, 'Endless bests persist after a reload (' + JSON.stringify(kept) + ')');
  await page.screenshot({ path: path.join(OUT, 'endless-07-entry-best.png') });
  // separate bests per difficulty: Hard has none yet
  ok(await page.evaluate(function () { return BT.Save.endlessBest('hard').round === 0; }), 'bests are kept per difficulty');

  // deeper rounds with every world finished: screenshots at a few depths, and a render sweep for errors
  await page.evaluate(function () { for (var i = 1; i <= 40; i++) BT.Save.record(i, 2, 500); BT.App.startEndless(); });
  var depths = [3, 9, 16, 24];
  for (var di = 0; di < depths.length; di++) {
    await page.evaluate(function (rd) { var a = BT.App; a.run.round = rd; a.run.seed = 4242 + rd; a.startRound(); a.doAction('dismissRound'); a.game.tap(); }, depths[di]);
    await page.waitForTimeout(2600);
    var info = await page.evaluate(function () { var a = BT.App; return { tw: a.level.twists.join('+'), state: a.game.state }; });
    console.log('    round ' + depths[di] + ': ' + info.tw + ' (' + info.state + ')');
    await page.screenshot({ path: path.join(OUT, 'endless-round-' + (depths[di] < 10 ? '0' : '') + depths[di] + '.png') });
  }
  await page.evaluate(function () { var a = BT.App; a.run.round = 12; a.run.seed = 99; a.run.lifeGained = true; a.startRound(); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'endless-08-round12-card.png') });
  var sweep = await page.evaluate(async function () {
    var a = BT.App, seen = {}, n = 0;
    for (var sd = 1; sd <= 30; sd++) for (var rd = 1; rd <= 24; rd += 4) {
      a.run.seed = sd * 7 + 1; a.run.round = rd; a.startRound(); a.doAction('dismissRound'); a.game.tap();
      for (var k = 0; k < 90; k++) a.game.step(1 / 120); // let things move, then draw a frame
      a.render(); n++;
      a.level.twists.forEach(function (t) { seen[t] = true; });
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    return { n: n, twists: Object.keys(seen).length };
  });
  ok(sweep.n === 180 && sweep.twists >= 22, 'drew ' + sweep.n + ' generated rounds covering ' + sweep.twists + ' twists without an error');
  await page.evaluate(function () { clearInterval(window.__ebot); });
  ok(errors.length === 0, 'Endless: no console errors or warnings' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await ctx.close();
}

// ------------------------------------------------------------------ installable PWA over HTTP
// A tiny static server for a copy of the repo under /brick-twist/ (like GitHub Pages: a project subpath,
// Cache-Control max-age=600, ETags). `down` makes every request fail, like a phone with no signal.
function startServer(root) {
  var srv = { down: false, hits: [] };
  var types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
  srv.server = http.createServer(function (req, res) {
    if (srv.down) { req.socket.destroy(); return; }
    var u = decodeURIComponent(req.url.split('?')[0]);
    srv.hits.push(u);
    if (u.indexOf('/brick-twist/') !== 0) { res.writeHead(404); res.end('not found'); return; }
    var rel = u.slice('/brick-twist/'.length) || 'index.html';
    var file = path.join(root, rel);
    if (file.indexOf(root) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    var body = fs.readFileSync(file), etag = '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    var head = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', 'ETag': etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    res.writeHead(200, head); res.end(body);
  });
  return new Promise(function (resolve) { srv.server.listen(0, '127.0.0.1', function () { srv.port = srv.server.address().port; resolve(srv); }); });
}

async function pwaChecks(browser) {
  console.log('-- PWA (served over HTTP under /brick-twist/)');
  // a scratch copy of the repo, so the update check can change a source file and rebuild without touching the repo
  var site = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-pages-'));
  ['index.html', 'sw.js', 'manifest.json', 'build.py'].forEach(function (f) { fs.copyFileSync(path.join(ROOT, f), path.join(site, f)); });
  ['src', 'icons'].forEach(function (d) {
    fs.mkdirSync(path.join(site, d));
    fs.readdirSync(path.join(ROOT, d)).forEach(function (f) { fs.copyFileSync(path.join(ROOT, d, f), path.join(site, d, f)); });
  });
  var srv = await startServer(site), BASE = 'http://localhost:' + srv.port + '/brick-twist/';
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var page = await ctx.newPage(), errors = [];
  page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  await page.goto(BASE);
  await page.waitForTimeout(500);
  ok(await page.evaluate(function () { return !!(window.BT && BT.App.scene === 'select'); }), 'the game loads over HTTP under a project subpath');

  // manifest: linked, valid (Chrome's own parser), relative start_url / scope inside the subpath
  var cdp = await ctx.newCDPSession(page);
  var man = await cdp.send('Page.getAppManifest');
  var data = {};
  try { data = JSON.parse(man.data || '{}'); } catch (e) {}
  ok(/\/brick-twist\/manifest\.json$/.test(man.url) && (man.errors || []).length === 0, 'manifest is linked and parses with no errors (' + man.url + (man.errors && man.errors.length ? ' ' + JSON.stringify(man.errors) : '') + ')');
  ok(data.name === 'Brick Twist' && data.short_name && data.display === 'standalone' && data.orientation === 'portrait' && data.start_url === './' && data.scope === './' &&
    data.theme_color === '#05060d' && data.background_color === '#05060d', 'manifest has name, short_name, standalone, portrait, relative start_url and scope, and the game colours');
  var icons = await page.evaluate(async function () {
    var m = await (await fetch('manifest.json')).json(), out = [];
    var list = m.icons.map(function (i) { return { src: i.src, sizes: i.sizes, purpose: i.purpose }; });
    var apple = document.querySelector('link[rel=apple-touch-icon]'), fav = document.querySelector('link[rel=icon]');
    list.push({ src: apple.getAttribute('href'), sizes: '180x180', purpose: 'apple' });
    list.push({ src: fav.getAttribute('href'), sizes: '192x192', purpose: 'favicon' });
    for (var i = 0; i < list.length; i++) {
      var r = await fetch(list[i].src), img = new Image();
      img.src = list[i].src;
      try { await img.decode(); } catch (e) {}
      out.push({ src: list[i].src, purpose: list[i].purpose, status: r.status, type: r.headers.get('content-type'), size: img.naturalWidth + 'x' + img.naturalHeight, want: list[i].sizes });
    }
    return out;
  });
  ok(icons.length === 5 && icons.every(function (i) { return i.status === 200 && i.type === 'image/png' && i.size === i.want; }), 'every icon loads at its stated size: ' + icons.map(function (i) { return i.src + ' ' + i.size + (i.purpose ? ' ' + i.purpose : ''); }).join(', '));
  ok(icons.some(function (i) { return i.purpose === 'maskable'; }) && icons.some(function (i) { return i.purpose === 'any' && i.want === '512x512'; }), 'there is a 512 icon and a maskable icon');
  ok(await page.evaluate(function () { return document.querySelectorAll('link').length === 3 && !document.querySelector('meta[name=viewport]').content.includes('viewport-fit'); }), 'only the three PWA links are in the head; viewport meta unchanged');

  // the service worker registers, installs and takes control without a reload
  var sw = await page.evaluate(async function () {
    var reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(function (r) { navigator.serviceWorker.addEventListener('controllerchange', r); setTimeout(r, 3000); });
    return { scope: reg.scope, active: !!reg.active, controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() };
  });
  var v1 = (fs.readFileSync(path.join(site, 'sw.js'), 'utf8').match(/VERSION = '([0-9a-f]+)'/) || [])[1];
  ok(sw.active && sw.controlled && /\/brick-twist\/$/.test(sw.scope), 'the service worker registers for /brick-twist/ and takes control (' + sw.scope + ')');
  ok(sw.caches.length === 1 && sw.caches[0] === 'brick-twist-' + v1, 'one cache, named with the build version (' + sw.caches.join(',') + ')');
  var inst = await cdp.send('Page.getInstallabilityErrors').catch(function () { return null; });
  if (inst) ok(inst.installabilityErrors.length === 0, 'Chrome reports the page as installable' + (inst.installabilityErrors.length ? ': ' + JSON.stringify(inst.installabilityErrors) : ''));
  else console.log('    (Page.getInstallabilityErrors not available in this Chrome)');
  await page.screenshot({ path: path.join(OUT, 'pwa-01-online.png') });

  // offline: the network is gone (the browser is offline and the server drops every request)
  srv.down = true; await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(800);
  var off = await page.evaluate(function () { return { ok: !!(window.BT && BT.App), scene: window.BT && BT.App.scene }; }).catch(function (e) { return { ok: false, err: e.message }; });
  ok(off.ok && off.scene === 'select', 'with the network off, the game still loads after one visit');
  await page.evaluate(function () { BT.App.startLevel(1, true); BT.App.game.tap(); });
  await page.waitForTimeout(800);
  ok(await page.evaluate(function () { return BT.App.game.state === 'play'; }), 'and plays offline');
  await page.goto(BASE + 'index.html').catch(function () {});
  await page.waitForTimeout(500);
  ok(await page.evaluate(function () { return !!(window.BT && BT.App); }).catch(function () { return false; }), 'index.html by name also loads offline');
  await page.screenshot({ path: path.join(OUT, 'pwa-02-offline.png') });

  // an update: change a source file and rebuild (as before a push); an online reload gets the new build at once
  fs.appendFileSync(path.join(site, 'src', 'main.js'), "\nBT.BUILD_MARK = 'update-check';\n");
  childProcess.execFileSync('python3', ['build.py'], { cwd: site, stdio: 'pipe' });
  var v2 = (fs.readFileSync(path.join(site, 'sw.js'), 'utf8').match(/VERSION = '([0-9a-f]+)'/) || [])[1];
  ok(v2 && v2 !== v1, 'the rebuild stamped a new service worker version (' + v1 + ' -> ' + v2 + ')');
  srv.down = false; await ctx.setOffline(false);
  await page.goto(BASE); await page.waitForTimeout(600);
  ok(await page.evaluate(function () { return BT.BUILD_MARK === 'update-check'; }), 'online, the very next load is the new build (network first for the page)');
  var after = await page.evaluate(async function () {
    var reg = await navigator.serviceWorker.getRegistration();
    await reg.update().catch(function () {});
    for (var i = 0; i < 40; i++) { var k = await caches.keys(); if (k.length === 1 && reg.active && !reg.installing && !reg.waiting) break; await new Promise(function (r) { setTimeout(r, 150); }); }
    return { caches: await caches.keys() };
  });
  ok(after.caches.length === 1 && after.caches[0] === 'brick-twist-' + v2, 'the new worker took over and deleted the old cache (' + after.caches.join(',') + ')');
  srv.down = true; await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(800);
  ok(await page.evaluate(function () { return BT.BUILD_MARK === 'update-check'; }).catch(function () { return false; }), 'offline after the update, the stored copy is the new build');
  srv.down = false; await ctx.setOffline(false);
  ok(errors.length === 0, 'PWA: no console errors or warnings' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));

  // the icons as the browser shows them
  await page.setContent('<body style="margin:0;background:#e8e8ee;display:flex;gap:16px;align-items:flex-end;padding:16px;flex-wrap:wrap">' +
    ['icon-512.png', 'maskable-512.png', 'icon-192.png', 'apple-touch-icon.png'].map(function (f) {
      return '<img src="' + BASE + 'icons/' + f + '" style="width:' + (f.indexOf('512') >= 0 ? 160 : 96) + 'px;' + (f.indexOf('maskable') >= 0 ? 'border-radius:50%' : 'border-radius:22%') + '">';
    }).join('') + '<img src="' + BASE + 'icons/icon-192.png" style="width:48px;border-radius:22%"><img src="' + BASE + 'icons/icon-192.png" style="width:32px;border-radius:22%"></body>');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'pwa-03-icons.png') });

  // a sandboxed iframe loading the page over HTTP: service workers are refused there; no errors, game runs
  var page2 = await ctx.newPage(), err2 = [];
  page2.on('pageerror', function (e) { err2.push(e.message); });
  page2.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') err2.push(m.text()); });
  await page2.goto(BASE + 'manifest.json');
  await page2.setContent('<iframe id="f" sandbox="allow-scripts" src="' + BASE + '" style="width:360px;height:640px;border:0"></iframe>');
  await page2.waitForTimeout(1200);
  var fr = page2.frames()[1];
  var fi = await fr.evaluate(function () { BT.App.startLevel(1, true); BT.App.game.tap(); return { scene: BT.App.scene, origin: String(self.origin) }; });
  await page2.waitForTimeout(400);
  ok(fi.scene === 'play' && err2.length === 0, 'sandboxed iframe over HTTP (origin ' + fi.origin + '): runs, no console errors' + (err2.length ? ': ' + err2.join(' | ') : ''));
  await ctx.close();
  srv.server.close();
  fs.rmSync(site, { recursive: true, force: true });
}
