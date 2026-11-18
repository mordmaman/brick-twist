// Endless mode: seeded, procedurally built rounds. No DOM.
//
// A round is an ordinary level object (grid + rules) built from (seed, round, preset, worlds). The same inputs
// always give the same round, so the sim can test it. Twists are drawn only from worlds the player has finished,
// and which twists may share a round is decided explicitly below (tags, conflicts and partner lists), never left
// to chance. Every round is checked before it is used: every required brick reachable, every switch / pusher /
// anchor / splitter hittable, no rule element on or near the bricks, the ball or the paddle. A layout that fails
// is rebuilt from the next sub-seed.
(function (BT) {
  'use strict';

  var C = BT.CONFIG, E = C.endless, GR = C.grid, COLS = GR.cols;

  // ---------------------------------------------------------------- the twists
  // world: where it is taught. heat 1..3: how much it adds to a round. tags: at most one twist per tag in a round
  // (see CAP_TAGS). partners: if set, the only twists it may share a round with.
  var TWISTS = {
    fuse: { world: 1, layout: true, heat: 1, name: 'Fuse', tip: 'TNT blows up its neighbours' },
    lockkey: { world: 1, layout: true, heat: 1, name: 'Lock and Key', tip: 'Hit the key to open the padlocks' },
    conveyor: { world: 2, heat: 1, tags: ['mover'], name: 'Conveyor', tip: 'Rows slide sideways' },
    squeeze: { world: 2, heat: 2, tags: ['mover', 'crush'], name: 'Squeeze', tip: 'The wall creeps down. Hit the arrows!' },
    orbit: { world: 2, heat: 2, tags: ['owner', 'mover'], name: 'Orbit', tip: 'Only the glowing core matters',
      partners: ['lightsout', 'gusts', 'tide', 'ice', 'thunder', 'redhot', 'wrap'] },
    pendulum: { world: 2, heat: 1, tags: ['owner', 'mover'], name: 'Pendulum', tip: 'Bricks swing on chains',
      partners: ['lightsout', 'gusts', 'tide', 'ice', 'thunder', 'redhot', 'wrap', 'pinball', 'bigsmall'] },
    portals: { world: 3, heat: 1, tags: ['field'], name: 'Portals', tip: 'In one portal, out of the other' },
    wells: { world: 3, heat: 2, tags: ['field', 'force'], name: 'Gravity Wells', tip: 'Planets bend the ball' },
    gusts: { world: 3, heat: 2, tags: ['force'], name: 'Gusts', tip: 'Wind blows the ball sideways' },
    pinball: { world: 3, heat: 1, tags: ['field'], name: 'Pinball', tip: 'Bumpers kick the ball' },
    lightsout: { world: 4, heat: 2, name: 'Lights Out', tip: 'Dark! Glow bricks light it up',
      partners: ['fuse', 'lockkey', 'conveyor', 'orbit', 'pendulum', 'gusts', 'ice', 'tide', 'redhot', 'thunder', 'runaway', 'bigsmall'] },
    redblue: { world: 4, heat: 2, tags: ['ghost'], name: 'Red / Blue', tip: 'Hit a switch to swap red and blue' },
    beat: { world: 4, heat: 2, tags: ['ghost'], name: 'On the Beat', tip: 'Bricks fade in and out to the beat' },
    overgrown: { world: 4, heat: 2, tags: ['grower'], name: 'Overgrown', tip: 'Vines regrow. Smash the roots!' },
    double: { world: 5, heat: 3, tags: ['top'], name: 'Double Trouble', tip: 'A second paddle guards the top' },
    wrap: { world: 5, heat: 2, tags: ['sides'], name: 'Wraparound', tip: 'No side walls' },
    brickfall: { world: 5, heat: 3, tags: ['owner', 'mover', 'crush'], name: 'Brickfall', tip: 'Keep the stack below the red line!',
      partners: ['gusts', 'tide', 'ice', 'thunder', 'redhot', 'wrap'] },
    ice: { world: 7, heat: 2, tags: ['paddle'], name: 'Ice Rink', tip: 'Slippery paddle, frozen bricks' },
    tide: { world: 7, heat: 1, tags: ['paddle'], name: 'High Tide', tip: 'Under water everything slows down' },
    redhot: { world: 7, heat: 1, tags: ['pierce'], name: 'Red Hot', tip: 'Combos make the ball burn through' },
    thunder: { world: 7, heat: 2, tags: ['paddle'], name: 'Thunderstorm', tip: 'Keep out from under the lightning' },
    runaway: { world: 8, heat: 2, tags: ['mover'], name: 'Runaways', tip: 'Bricks run away from the ball' },
    bigsmall: { world: 8, heat: 1, tags: ['pierce', 'field'], name: 'Big and Small', tip: 'Hit a splitter to break the big ball' },
    walls: { world: 8, heat: 2, tags: ['sides', 'crush'], name: 'Closing Walls', tip: 'Walls close in. Hit the pushers!' },
    mirrors: { world: 8, heat: 2, tags: ['field'], name: 'Hall of Mirrors', tip: 'Mirrors turn the ball' },
    // act two. Powers help the player (heat 1); one power a round, so a tap always means one thing.
    powershot: { world: 9, heat: 1, tags: ['power'], name: 'Power Shot', tip: 'Tap as the ball lands to smash through' },
    slowmo: { world: 9, heat: 1, tags: ['power'], name: 'Slow-Mo', tip: 'Tap to slow time down' },
    curve: { world: 9, heat: 1, tags: ['power', 'force'], name: 'Curveball', tip: 'Move the paddle to bend the ball' },
    safetywall: { world: 9, heat: 1, tags: ['power'], name: 'Safety Wall', tip: 'Tap to raise a wall under you' },
    hatch: { world: 10, heat: 2, tags: ['critter'], name: 'Hatchlings', tip: 'Eggs hatch into critters. Bop them!' },
    paint: { world: 10, heat: 2, tags: ['field'], name: 'Paint Job', tip: 'Paint the ball to match the bricks' },
    cannon: { world: 11, heat: 2, tags: ['force', 'zone'], name: 'Cannonball', tip: 'A heavy ball that flies in arcs' },
    flip: { world: 11, heat: 2, tags: ['view'], name: 'Flip', tip: 'Now and then it all turns upside down' }
  };
  // Stable order (also the order rules are added to a round; Lights Out last so its dark covers the others).
  var ORDER = ['fuse', 'lockkey', 'orbit', 'pendulum', 'brickfall', 'conveyor', 'squeeze', 'runaway', 'portals', 'wells',
    'gusts', 'pinball', 'redblue', 'beat', 'overgrown', 'double', 'wrap', 'ice', 'tide', 'redhot', 'thunder', 'bigsmall',
    'walls', 'mirrors', 'hatch', 'paint', 'cannon', 'powershot', 'slowmo', 'curve', 'safetywall', 'flip', 'lightsout'];
  // (act-two twists sit before Lights Out; among the older twists the order, and so every older round, is unchanged)

  // Left out of Endless, and why.
  var EXCLUDED = {
    bounces: 'Twelve Bounces is a puzzle with free retries and no lives; it needs a hand-made solvable layout',
    bosses: 'boss fights are hand-built set pieces (not needed in Endless)',
    puppet: 'Puppet Strings needs a hand-made block with room to slide and a gap under it to aim through',
    builders: 'Builder Bots need hand-made rails under a wall, with every rebuilt brick clear of the ball',
    skyscraper: 'Skyscraper is a three-screen tower; Endless layouts are one screen',
    numbers: 'By the Numbers needs a hand-made order where every next brick is reachable past the others'
  };

  // At most one twist per tag in a round. 'field' (things placed in the open play area) allows two.
  var CAP_TAGS = { owner: 1, mover: 1, crush: 1, ghost: 1, force: 1, paddle: 1, pierce: 1, sides: 1, top: 1, grower: 1, field: 2,
    power: 1, critter: 1, zone: 1, view: 1 };
  var TAG_WHY = {
    owner: 'both build the whole layout', mover: 'both move the bricks', crush: 'two ways to be crushed at once',
    ghost: 'both make bricks see-through', force: 'two forces pushing the ball', paddle: 'two handicaps on the paddle',
    pierce: 'both use the burn-through count', sides: 'both change the side walls', top: 'both change the top',
    grower: 'both grow bricks', field: 'the open play area gets too crowded',
    power: 'one power a round, so a tap always means one thing', critter: 'one lot of critters is plenty',
    zone: 'both change the ball\'s speed by where it is', view: 'one way of turning the view is plenty'
  };
  // Pairs that do not mix, beyond the tags.
  var CONFLICTS = [
    ['conveyor', 'walls', 'rows that slide off the edge stop the walls ever closing'],
    ['conveyor', 'overgrown', 'vines regrow on cells the rows have slid away from'],
    ['squeeze', 'overgrown', 'shoots would grow where the wall used to be'],
    ['runaway', 'overgrown', 'roots would run away from their own vines'],
    ['runaway', 'redblue', 'runners could stop inside a see-through brick'],
    ['runaway', 'beat', 'runners could stop inside a see-through brick'],
    ['double', 'squeeze', 'the wall would start next to the danger line'],
    ['double', 'walls', 'the top paddle does not know about moving walls'],
    ['double', 'runaway', 'runners could hide behind the top paddle'],
    ['double', 'overgrown', 'vines would grow up into the top paddle'],
    ['double', 'portals', 'the top portal sits where the top paddle is'],
    ['double', 'lockkey', 'the layout sits low, under the vault, with no room left'],
    ['brickfall', 'lockkey', 'locked bricks do not settle with the stack'],
    ['brickfall', 'fuse', 'the fuse layout does not settle with the stack'],
    ['squeeze', 'lockkey', 'a closed vault coming down is no fun'],
    ['redblue', 'walls', 'the switches stop the walls'],
    ['ice', 'thunder', 'a frozen paddle sliding is too much'],
    // act two
    ['paint', 'redblue', 'both use the red and blue bricks'],
    ['paint', 'beat', 'a see-through brick of the wrong colour is too much to read'],
    ['paint', 'bigsmall', 'the splitter sits where the gates go'],
    ['paint', 'walls', 'the closing walls would cover the side gates'],
    ['paint', 'runaway', 'a runaway layout is tall and leaves no room for three gates'],
    ['paint', 'double', 'the bricks sit low under the top paddle, with no room for the gates'],
    ['hatch', 'runaway', 'eggs would run away from the ball'],
    ['hatch', 'brickfall', 'eggs do not settle with the stack'],
    ['tide', 'cannon', 'both change the ball\'s speed by where it is'],
    ['double', 'cannon', 'a lobbed ball and an open top do not mix'],
    ['double', 'flip', 'with two paddles, which way up is it?'],
    ['double', 'powershot', 'the top paddle sits right under the power strip'],
    ['double', 'slowmo', 'the top paddle sits right under the power strip'],
    ['double', 'curve', 'the top paddle sits right under the power strip'],
    ['double', 'safetywall', 'the top paddle sits right under the power strip'],
    ['flip', 'redblue', 'the colour legend would be upside down'],
    ['flip', 'tide', 'the tide gauge would be upside down'],
    ['flip', 'thunder', 'lightning from below is too confusing'],
    ['flip', 'paint', 'the paint gates would point the wrong way'],
    ['flip', 'portals', 'too many ways round at once'],
    ['flip', 'mirrors', 'mirrors turned upside down are too hard to read']
  ];

  function hasTag(id, tag) { var t = TWISTS[id].tags; return !!t && t.indexOf(tag) >= 0; }

  // Why two twists may not share a round, or null if they may.
  function conflictReason(a, b) {
    if (a === b) return 'the same twist';
    var A = TWISTS[a], B = TWISTS[b];
    if (!A || !B) return 'unknown twist';
    if (A.partners && A.partners.indexOf(b) < 0) return A.name + ' only mixes with its own short list';
    if (B.partners && B.partners.indexOf(a) < 0) return B.name + ' only mixes with its own short list';
    for (var tag in CAP_TAGS) if (CAP_TAGS[tag] === 1 && hasTag(a, tag) && hasTag(b, tag)) return TAG_WHY[tag];
    for (var i = 0; i < CONFLICTS.length; i++) {
      var p = CONFLICTS[i];
      if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return p[2];
    }
    return null;
  }
  function compatible(a, b) { return !conflictReason(a, b); }

  // Can these twists share a round? (every pair compatible and no tag over its cap)
  function legalSet(ids) {
    for (var i = 0; i < ids.length; i++) {
      if (!TWISTS[ids[i]]) return false;
      for (var j = i + 1; j < ids.length; j++) if (!compatible(ids[i], ids[j])) return false;
    }
    for (var tag in CAP_TAGS) {
      var n = 0;
      for (i = 0; i < ids.length; i++) if (hasTag(ids[i], tag)) n++;
      if (n > CAP_TAGS[tag]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- unlocking
  // A world is finished when its last level (the boss) is cleared; levels unlock in order, so that means all of it.
  function completedWorlds(isCleared) {
    var out = [];
    for (var w = 1; w <= BT.WORLDS.length; w++) if (E.unlockAll || isCleared(w * 5)) out.push(w);
    return out;
  }
  function unlocked(isCleared) { return !!E.unlockAll || !!isCleared(E.unlockAfterLevel); }
  function pool(worlds) {
    var out = [];
    for (var i = 0; i < ORDER.length; i++) if (worlds.indexOf(TWISTS[ORDER[i]].world) >= 0) out.push(ORDER[i]);
    return out;
  }

  // ---------------------------------------------------------------- seeds and the ramp
  function hash32(a, b) {
    var h = Math.imul((a >>> 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b >>> 0) + 0x632BE5AB, 0xC2B2AE35);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return h >>> 0;
  }
  function rngFor(seed, round, salt) { return BT.mulberry32(hash32(hash32(seed, round), salt)); }
  function ramp(round) { return Math.max(0, Math.min(1, (round - 1) / Math.max(1, E.ramp - 1))); }
  function lerp(pair, d) { return pair[0] + (pair[1] - pair[0]) * d; }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function rint(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

  // The preset for a round: the chosen difficulty, with the ball a little faster and hazards a little stronger.
  function roundPreset(presetName, round) {
    var base = C.presets[presetName] || C.presets.normal, p = {}, k;
    for (k in base) p[k] = base[k];
    var n = Math.min(round - 1, E.speedRounds), h = Math.min(round - 1, E.hazardRounds);
    p.speedStart = base.speedStart + E.speedStartStep * n;
    p.speedMax = Math.min(C.ball.absMaxSpeed, base.speedMax + E.speedMaxStep * n);
    p.hazardScale = base.hazardScale * (1 + E.hazardStep * h);
    return p;
  }

  // ---------------------------------------------------------------- choosing twists
  // Two twists (three from E.threeFrom), all from finished worlds, a legal set, within the round's heat budget.
  // Later rounds lean towards the nastier twists. Twists of the previous round are less likely to come back.
  function chooseTwists(seed, round, worlds, avoid) {
    var rng = rngFor(seed, round, 11), n = round >= E.threeFrom ? 3 : 2, best = [];
    // a draw can paint itself into a corner (Orbit first leaves few partners): draw again, keep the fullest
    for (var tries = 0; tries < 12 && best.length < n; tries++) {
      var got = drawTwists(rng, round, worlds, avoid, n);
      if (got.length > best.length) best = got;
    }
    best.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    return best;
  }
  function drawTwists(rng, round, worlds, avoid, n) {
    var d = ramp(round), budget = lerp(E.heat, d);
    var cands = pool(worlds), chosen = [], heat = 0;
    while (chosen.length < n) {
      var opts = [], w = [], total = 0, strict, i;
      for (strict = 1; strict >= 0 && !opts.length; strict--) {
        for (i = 0; i < cands.length; i++) {
          var id = cands[i], T = TWISTS[id];
          if (chosen.indexOf(id) >= 0 || !legalSet(chosen.concat([id]))) continue;
          if (strict && heat + T.heat > budget) continue;
          var wt = (T.layout ? E.layoutWeight : 1) * Math.pow(T.heat, d * 1.2) * (avoid && avoid.indexOf(id) >= 0 ? 0.25 : 1);
          opts.push(id); w.push(wt); total += wt;
        }
      }
      if (!opts.length) break;
      var r = rng() * total, k = 0;
      for (; k < opts.length - 1; k++) { r -= w[k]; if (r <= 0) break; }
      chosen.push(opts[k]); heat += TWISTS[opts[k]].heat;
    }
    return chosen;
  }

  // ---------------------------------------------------------------- layout helpers
  var COLOURS = 'roygcbpm';
  var BREAKABLE = 'roygcbpmw23TKCGRBVOIFEY';   // grid chars a ball can break (L counts once its key is hit)
  var HITTABLE = 'ASXH';                    // unbreakable chars a ball must be able to touch (anchor, switch, splitter, pusher)
  function rowY(r) { return GR.top + r * GR.cellH; }
  function colX(c) { return c * GR.cellW; }
  function isColour(ch) { return COLOURS.indexOf(ch) >= 0 || ch === 'w'; }

  function Plan(rng, round, twists, presetName) {
    this.rng = rng; this.round = round; this.d = ramp(round); this.twists = twists; this.preset = presetName;
    this.g = [];
    for (var r = 0; r < 21; r++) { var row = []; for (var c = 0; c < COLS; c++) row.push('.'); this.g.push(row); }
    this.conv = {};      // conveyor rows (row -> speed)
    this.els = [];       // things in the open area: { x, y, r, kind }
    this.rules = [];
    this.top0 = 0; this.nRows = 0; this.colMin = 0; this.colMax = COLS - 1;
    this.has = {};
    for (var i = 0; i < twists.length; i++) this.has[twists[i]] = true;
  }
  var PL = Plan.prototype;
  PL.at = function (r, c) { return this.g[r][c]; };
  PL.set = function (r, c, ch) { this.g[r][c] = ch; };
  PL.setM = function (r, c, ch) { this.g[r][c] = ch; this.g[r][COLS - 1 - c] = ch; };
  PL.bricks = function (fn) { // every non-empty cell
    for (var r = 0; r < this.g.length; r++) for (var c = 0; c < COLS; c++) if (this.g[r][c] !== '.') fn(r, c, this.g[r][c]);
  };
  PL.count = function (test) { var n = 0; this.bricks(function (r, c, ch) { if (test(ch)) n++; }); return n; };
  PL.lowestRow = function () { var lo = -1; this.bricks(function (r) { if (r > lo) lo = r; }); return lo; };
  PL.layoutBottom = function () { return this.top0 + this.nRows - 1; };
  // half-row cells (outer to centre) for mirrored drawing
  PL.halfCols = function () { var out = []; for (var c = this.colMin; c < COLS / 2; c++) out.push(c); return out; };
  PL.colourFor = function (i) { return COLOURS[(i + this.colourOfs) % COLOURS.length]; };

  // ---------------- the brick pattern
  var PATTERNS = ['rows', 'pyramid', 'vee', 'diamond', 'blocks', 'columns', 'frame', 'checker', 'noise', 'bands'];
  PL.pattern = function () {
    var rng = this.rng, n = this.nRows, cols = this.halfCols(), w = cols.length, d = this.d;
    var type = pick(rng, PATTERNS), dens = lerp(E.density, d), gapJ = rint(rng, 0, w - 1), ofs = rint(rng, 0, 2);
    this.patternType = type;
    for (var i = 0; i < n; i++) {
      var r = this.top0 + i;
      for (var jj = 0; jj < w; jj++) {
        var c = cols[jj], j = w - 1 - jj; // j: 0 = centre column, w-1 = outer edge
        var on;
        switch (type) {
          case 'rows': on = (i + ofs) % 3 !== 2 && !(j === gapJ && i % 2 === 0); break;
          case 'pyramid': on = j <= 1 + i * w / n; break;
          case 'vee': on = j >= w - 2 - i * w / n || i === 0; break;
          case 'diamond': on = Math.abs(i - (n - 1) / 2) / ((n + 1) / 2) + j / w <= 1.05; break;
          case 'blocks': on = (i + ofs) % 3 !== 2 && (j + ofs) % 3 !== 2; break;
          case 'columns': on = (j + ofs) % 2 === 0 || i === 0; break;
          case 'frame': on = i === 0 || j === w - 1 || (i === n - 1 && j > 1) || (i > 1 && i < n - 2 && j < w - 2 && rng() < 0.6); break;
          case 'checker': on = (i + j + ofs) % 2 === 0 || i === 0; break;
          case 'bands': on = i % 2 === 0 || j % 3 === ofs; break;
          default: on = true;
        }
        if (on && rng() < dens) this.setM(r, c, this.colourFor(i));
      }
    }
    // never too thin: top up near the top of the layout
    var guard = 0;
    while (this.count(isColour) < 10 + Math.round(10 * d) && guard++ < 80) {
      var rr = this.top0 + rint(rng, 0, n - 1), cc = pick(rng, cols);
      this.setM(rr, cc, this.colourFor(rr - this.top0));
    }
  };

  // Runaways want room to run: single bricks on a loose lattice, a few steel posts to corner them against.
  PL.sparse = function () {
    var rng = this.rng, cols = this.halfCols();
    for (var i = 0; i < this.nRows; i += 2) {
      for (var jj = 0; jj < cols.length; jj++) {
        if ((jj + (i / 2)) % 2 !== 0 || rng() > 0.8) continue;
        var r = this.top0 + i;
        this.set(r, cols[jj], this.colourFor(i)); this.set(r, COLS - 1 - cols[jj], this.colourFor(i + 3));
      }
    }
    var posts = rint(rng, 1, 2);
    for (var k = 0; k < posts; k++) {
      var pr = this.top0 + 1 + 2 * rint(rng, 0, Math.max(0, (this.nRows - 3) >> 1)), pc = pick(rng, cols);
      if (this.at(pr, pc) === '.') this.setM(pr, pc, '#');
    }
  };

  // ---------------- reachability (also used by the tests)
  // grid: array of strings. opts: { lockedSolid, conv (rows), wrap, links (cell key -> cell key) }.
  function reachMap(grid, opts) {
    var rows = grid.length, maxR = Math.max(rows + 12, 27), seen = {}, stack = [], c;
    function passable(r, c2) {
      if (r >= rows) return true;
      if (opts.conv && opts.conv[r] != null) return true; // a sliding row always opens a gap
      var ch = grid[r][c2];
      if (ch === '.' || BREAKABLE.indexOf(ch) >= 0) return true;
      if (ch === 'L') return !opts.lockedSolid;
      return false;
    }
    for (c = 0; c < COLS; c++) stack.push([maxR - 1, c]);
    while (stack.length) {
      var cur = stack.pop(), rr = cur[0], cc = cur[1], key = rr + ',' + cc;
      if (rr < 0 || cc < 0 || cc >= COLS || rr >= maxR || seen[key]) continue;
      if (!passable(rr, cc)) continue;
      seen[key] = true;
      stack.push([rr + 1, cc], [rr - 1, cc], [rr, cc + 1], [rr, cc - 1]);
      if (opts.wrap && cc === 0) stack.push([rr, COLS - 1]);
      if (opts.wrap && cc === COLS - 1) stack.push([rr, 0]);
      if (opts.links && opts.links[key]) { var p = opts.links[key].split(','); stack.push([+p[0], +p[1]]); }
    }
    return seen;
  }
  function cellOf(x, y) { return Math.floor((y - GR.top) / GR.cellH) + ',' + Math.floor(x / GR.cellW); }

  // Fair-layout check for a built level. Returns null if fine, else a reason.
  function checkLayout(level) {
    var grid = level.grid || [], opts = { conv: {}, wrap: false, links: {} }, i;
    (level.rules || []).forEach(function (ru) {
      if (ru.id === 'conveyor') for (var k in ru.rows) opts.conv[k] = ru.rows[k];
      if (ru.id === 'wrap') opts.wrap = true;
      if (ru.id === 'portals') ru.pairs.forEach(function (pr) { var a = cellOf(pr[0].x, pr[0].y), b = cellOf(pr[1].x, pr[1].y); opts.links[a] = b; opts.links[b] = a; });
    });
    for (i = 0; i < grid.length; i++) {
      if (grid[i].length !== COLS) return 'row ' + i + ' is not ' + COLS + ' wide';
      for (var c = 0; c < COLS; c++) if (BT.Bricks.LEGEND.indexOf(grid[i][c]) < 0) return 'unknown char ' + grid[i][c];
    }
    opts.lockedSolid = true;
    var s1 = reachMap(grid, opts);
    opts.lockedSolid = false;
    var s2 = reachMap(grid, opts);
    var keys = 0, req = 0;
    for (var r = 0; r < grid.length; r++) for (var c2 = 0; c2 < COLS; c2++) {
      var ch = grid[r][c2], k = r + ',' + c2;
      if (ch === 'K') { keys++; if (!s1[k]) return 'key at ' + k + ' cannot be reached while the padlocks are shut'; }
      if (BREAKABLE.indexOf(ch) >= 0 || ch === 'L') { req++; if (!s2[k]) return 'brick ' + ch + ' at ' + k + ' cannot be reached'; }
      if (HITTABLE.indexOf(ch) >= 0 && !opts.conv[r]) {
        var near = s1[(r + 1) + ',' + c2] || s1[(r - 1) + ',' + c2] || s1[r + ',' + (c2 + 1)] || s1[r + ',' + (c2 - 1)];
        if (!near) return ch + ' at ' + k + ' cannot be hit';
      }
    }
    if (grid.join('').indexOf('L') >= 0 && !keys) return 'padlocks but no key';
    var ruleBricks = (level.rules || []).some(function (ru) { return ru.id === 'pendulum' || ru.id === 'orbit'; });
    if (!req && !ruleBricks) return 'nothing to break';
    return null;
  }

  // ---------------- things placed in the open area
  // Field box: below every brick, above the paddle zone, inside where the walls can reach.
  PL.fieldBox = function () {
    var lo = this.has.pendulum ? -1 : this.lowestRow(), yTop = lo >= 0 ? rowY(lo + 1) + 26 : 150; // (Pendulum's splitters sit in the field)
    if (this.has.orbit) yTop = Math.max(yTop, 372);
    if (this.has.pendulum) yTop = Math.max(yTop, 338);
    var side = this.has.walls ? C.rules.walls.maxIn + 14 : 14;
    return { x0: side, x1: C.W - side, y0: yTop, y1: 446 };
  };
  PL.free = function (x, y, r, box) {
    if (x - r < box.x0 || x + r > box.x1 || y - r < box.y0 || y + r > box.y1) return false;
    for (var i = 0; i < this.els.length; i++) {
      var e = this.els[i], dx = e.x - x, dy = e.y - y, need = e.r + r + 32; // room for the ball between them
      if (dx * dx + dy * dy < need * need) return false;
    }
    var ok = true;
    this.bricks(function (row, col) {
      var bx = colX(col) + 1, by = rowY(row) + 1;
      var qx = Math.max(bx, Math.min(x, bx + GR.brickW)), qy = Math.max(by, Math.min(y, by + GR.brickH));
      if ((qx - x) * (qx - x) + (qy - y) * (qy - y) < (r + 20) * (r + 20)) ok = false;
    });
    return ok;
  };
  PL.place = function (r, kind, box, prefer) {
    var rng = this.rng;
    for (var t = 0; t < 80; t++) {
      var x = box.x0 + r + rng() * (box.x1 - box.x0 - 2 * r), y = box.y0 + r + rng() * (box.y1 - box.y0 - 2 * r);
      if (prefer) { var p = prefer(t); if (p) { x = p.x; y = p.y; } }
      if (this.free(x, y, r, box)) { var e = { x: Math.round(x), y: Math.round(y), r: r, kind: kind }; this.els.push(e); return e; }
    }
    return null;
  };

  // ---------------------------------------------------------------- building a round
  PL.build = function () {
    var rng = this.rng, d = this.d, h = this.has, i, r, c, cols;
    this.colourOfs = rint(rng, 0, 7);
    var hasField = h.portals || h.wells || h.pinball || h.mirrors || h.bigsmall || h.paint;

    // ---- whole-layout twists
    if (h.orbit) { this.buildOrbit(); return this.finishField(); }
    if (h.pendulum) { this.buildPendulum(); return this.finishField(); }
    if (h.brickfall) { this.buildBrickfall(); return this.finishField(); }

    // ---- the frame of the layout
    if (h.walls) { this.colMin = 3; this.colMax = COLS - 4; }
    this.top0 = h.double ? 8 : (h.portals ? 3 : 0); // Portals: an open strip at the top for the far portal
    if (this.power()) this.top0 = Math.max(this.top0 + (h.portals ? 1 : 0), 1); // the power strip takes the top of the field
    var depth = Math.max(h.redblue ? 2 : 0, h.walls ? 3 : 0, h.bigsmall ? 5 : 0);
    var limit = hasField ? 15 : 18;
    this.nRows = Math.round(lerp(E.rows, d)) + rint(rng, -1, 0);
    // twists that make a round slow to finish get a smaller wall
    var slow = ['beat', 'overgrown', 'redblue', 'walls', 'mirrors', 'squeeze', 'pinball'].filter(function (id) { return h[id]; }).length;
    this.nRows -= slow;
    if (h.runaway) this.nRows = Math.max(this.nRows + 3, 9);
    if (h.lockkey) this.nRows = Math.max(this.nRows, 6); // room for the vault and open bricks under it
    this.nRows = Math.max(3, Math.min(this.nRows, limit - depth - this.top0 + 1, 13));
    if (h.runaway) this.sparse(); else this.pattern();
    var bottom = this.layoutBottom();
    cols = this.halfCols();

    // ---- armour (the Hard Hats twist is part of every round, more of it as the rounds go on)
    var arm = lerp(E.armour, d), three = this.round >= E.armour3From;
    for (r = this.top0; r <= bottom; r++) for (i = 0; i < cols.length; i++) {
      c = cols[i];
      if (!isColour(this.at(r, c)) || rng() >= arm) continue;
      this.setM(r, c, three && rng() < 0.35 ? '3' : '2');
    }
    // ---- capsule bricks
    var caps = 0;
    for (var t = 0; t < 30 && caps < 2; t++) {
      r = rint(rng, this.top0, bottom); c = pick(rng, cols);
      if (isColour(this.at(r, c))) { this.setM(r, c, 'C'); caps += 2; }
    }
    // ---- twist features
    if (h.fuse) this.addFuse();
    if (h.lockkey) this.addVault();
    if (h.lightsout) this.sprinkle('G', 2, 3);
    if (h.hatch) this.sprinkle('E', 2, 2 + Math.round(d * 2));
    if (h.safetywall) this.sprinkle('F', 1, 2);
    if (h.paint) this.addPaint();
    if (h.ice) this.sprinkle('I', 3 + Math.round(d * 3), 6 + Math.round(d * 4));
    if (h.overgrown) this.addRoots();
    if (h.redblue) this.addRedBlue();
    if (h.squeeze) this.addAnchors();
    if (h.walls) { this.setM(bottom + 3, this.colMin + 1, 'H'); }
    if (h.bigsmall) { var sc = Math.max(this.colMin, 2); this.setM(bottom + 5, sc, 'X'); }
    // ---- the key, then steel shelves, only where they leave everything reachable
    if (h.lockkey) this.placeKey();
    if (!h.runaway) this.addSteel();
    if (h.conveyor) this.addConveyor();
    return this.finishField();
  };

  PL.power = function () { var h = this.has; return !!(h.powershot || h.slowmo || h.curve || h.safetywall); };

  // Paint Job: colour bricks by thirds of the field (red left, yellow middle, blue right); the gates go in finishField.
  PL.addPaint = function () {
    for (var r = this.top0; r <= this.layoutBottom(); r++) for (var c = 0; c < COLS; c++) {
      if (!isColour(this.at(r, c))) continue;
      this.set(r, c, c < 4 ? 'R' : (c < 8 ? 'Y' : 'B'));
    }
  };

  // Turn some coloured bricks into ch, in mirrored pairs.
  PL.sprinkle = function (ch, minPairs, maxPairs) {
    var rng = this.rng, want = rint(rng, minPairs, maxPairs), got = 0, cols = this.halfCols();
    for (var t = 0; t < 120 && got < want; t++) {
      var r = rint(this.rng, this.top0, this.layoutBottom()), c = pick(rng, cols);
      if (isColour(this.at(r, c))) { this.setM(r, c, ch); got++; }
    }
  };

  PL.addFuse = function () {
    var rng = this.rng, bottom = this.layoutBottom(), cols = this.halfCols();
    // a TNT fuse up from the bottom edge, and a TNT band across the upper part it can set off
    var fc = cols[rint(rng, Math.min(1, cols.length - 1), cols.length - 1)], len = Math.min(this.nRows, rint(rng, 2, 4));
    for (var k = 0; k < len; k++) this.setM(bottom - k, fc, 'T');
    var br = this.top0 + rint(rng, 0, Math.max(0, this.nRows - len - 1));
    for (var c = fc; c < COLS / 2; c++) if (this.at(br, c) !== '.' || rng() < 0.5) this.setM(br, c, 'T');
  };

  PL.addVault = function () {
    // a padlocked room at the top of the layout with bricks inside; the key goes somewhere else (placeKey)
    var rng = this.rng, hgt = Math.max(3, Math.min(this.nRows - 3, rint(this.rng, 3, 4))), a = Math.max(this.colMin, rint(rng, 3, 4)), b = COLS - 1 - a;
    var r0 = this.top0;
    for (var r = r0; r < r0 + hgt; r++) for (var c = a; c <= b; c++) {
      var edge = r === r0 || r === r0 + hgt - 1 || c === a || c === b;
      this.set(r, c, edge ? 'L' : (rng() < 0.3 ? 'y' : this.colourFor(r - r0)));
    }
    this.vault = { r0: r0, r1: r0 + hgt - 1, a: a, b: b };
  };
  PL.placeKey = function () {
    // somewhere reachable while the padlocks are shut, outside the vault, as far down as the layout allows
    var v = this.vault, grid = this.grid(), seen = reachMap(grid, { lockedSolid: true, conv: {}, wrap: !!this.has.wrap, links: {} });
    var spots = [];
    for (var r = this.top0; r <= this.layoutBottom(); r++) for (var c = this.colMin; c <= this.colMax; c++) {
      if (r >= v.r0 && r <= v.r1 && c >= v.a && c <= v.b) continue;
      var ch = this.at(r, c);
      if ((isColour(ch) || ch === '2' || ch === '.') && seen[r + ',' + c]) spots.push([r, c]);
    }
    if (!spots.length) { this.set(v.r1 + 1, v.a - 1 >= 0 ? v.a - 1 : 0, 'K'); return; }
    var s = pick(this.rng, spots);
    this.set(s[0], s[1], 'K');
  };

  PL.addRoots = function () {
    var rng = this.rng, cols = this.halfCols(), rr = this.top0 + rint(rng, 1, Math.max(1, Math.min(3, this.nRows - 2)));
    var cc = cols[rint(rng, 1, Math.max(1, cols.length - 2))];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var r = rr + dr, c = cc + dc;
      if (r < this.top0 || r > this.layoutBottom() || c < this.colMin || c >= COLS / 2) continue;
      this.setM(r, c, dr === 0 && dc === 0 ? 'O' : (rng() < 0.8 ? 'V' : this.at(r, c)));
    }
    this.setM(rr, cc, 'O');
  };

  PL.addRedBlue = function () {
    var rng = this.rng, bottom = this.layoutBottom(), red = 0, blue = 0;
    for (var r = this.top0; r <= bottom; r++) {
      if (rng() < 0.3) continue;
      var ch = (r - this.top0) % 2 === 0 ? 'R' : 'B';
      for (var c = 0; c < COLS; c++) if (isColour(this.at(r, c))) { this.set(r, c, ch); if (ch === 'R') red++; else blue++; }
    }
    if (!red || !blue) { // make sure both colours are there
      for (c = 0; c < COLS; c++) if (isColour(this.at(bottom, c)) || this.at(bottom, c) === 'R' || this.at(bottom, c) === 'B') this.set(bottom, c, red ? 'B' : 'R');
    }
    this.setM(bottom + 2, this.colMin, 'S');
  };

  PL.addAnchors = function () {
    var bottom = this.layoutBottom(), cols = this.halfCols();
    var c = cols[rint(this.rng, 1, Math.max(1, cols.length - 2))];
    this.setM(bottom, c, 'A');
  };

  PL.addSteel = function () {
    var rng = this.rng, n = Math.round(lerp(E.steel, this.d) * (0.6 + 0.4 * rng())), cols = this.halfCols();
    for (var k = 0; k < n; k++) {
      var r = rint(rng, this.top0 + 1, this.layoutBottom()), len = rint(rng, 2, 3), c0 = cols[rint(rng, 0, Math.max(0, cols.length - len))];
      var undo = [], c;
      for (c = c0; c < c0 + len && c < COLS / 2; c++) {
        var ch = this.at(r, c);
        if (ch !== '.' && !isColour(ch) && ch !== '2' && ch !== '3') continue; // never over a twist feature
        undo.push([c, ch]); this.setM(r, c, '#');
      }
      if (checkLayout({ grid: this.grid(), rules: this.has.wrap ? [{ id: 'wrap' }] : [] })) {
        for (var u = 0; u < undo.length; u++) this.setM(r, undo[u][0], undo[u][1]);
      }
    }
  };

  PL.addConveyor = function () {
    // slide rows that have no steel or twist features; each gets a gap of at least two cells so the ball can slip through
    var rng = this.rng, ok = [], r, c;
    for (r = this.top0; r <= this.layoutBottom(); r++) {
      var plain = true, any = false;
      for (c = 0; c < COLS; c++) { var ch = this.at(r, c); if (ch !== '.') any = true; if ('#LKASXHOV'.indexOf(ch) >= 0) plain = false; }
      if (plain && any) ok.push(r);
    }
    var want = Math.min(ok.length, 2 + Math.round(this.d * 2) + rint(rng, 0, 1)), sign = rng() < 0.5 ? 1 : -1;
    for (var k = 0; k < want; k++) {
      r = ok.splice(rint(rng, 0, ok.length - 1), 1)[0];
      var run = 0, best = 0;
      for (c = 0; c < COLS; c++) { run = this.at(r, c) === '.' ? run + 1 : 0; best = Math.max(best, run); }
      if (best < 2) { var g0 = rint(rng, 0, COLS - 2); this.set(r, g0, '.'); this.set(r, g0 + 1, '.'); }
      this.conv[r] = sign * Math.round(30 + rng() * 14 + this.d * 10);
      sign = -sign;
    }
  };

  // ---- the three whole-layout twists
  PL.buildOrbit = function () {
    var rng = this.rng, d = this.d, inner = '', mid = '', outer = '', i;
    for (i = 0; i < 10; i++) inner += i === 3 || i === 8 ? 'C' : (rng() < 0.25 + 0.3 * d ? '2' : this.colourFor(0));
    for (i = 0; i < 18; i++) mid += i % 3 === 2 ? '.' : this.colourFor(3);
    var steelOuter = rng() < 0.4 + 0.4 * d;
    for (i = 0; i < 20; i++) outer += i % 4 === 0 ? (steelOuter ? '#' : this.colourFor(5)) : '.';
    var dir = rng() < 0.5 ? 1 : -1, rings = [
      { radius: 46, speed: dir * (0.6 + 0.3 * rng()), pattern: inner, size: 16 },
      { radius: 84, speed: -dir * (0.4 + 0.2 * rng()), pattern: mid, size: 16 }
    ];
    if (d > 0.25 || rng() < 0.4) rings.push({ radius: 122, speed: dir * (0.25 + 0.1 * rng()), pattern: outer, size: 16 });
    this.rules.push({ id: 'orbit', cx: 180, cy: 222, rings: rings });
    this.clear = 'core';
    this.capsuleChance = 0.15;
  };

  PL.buildPendulum = function () {
    var rng = this.rng, d = this.d;
    var self = this;
    function cluster(w, hgt) {
      var rows = [];
      for (var r = 0; r < hgt; r++) {
        var s = '';
        for (var c = 0; c < w; c++) s += rng() < 0.2 + 0.35 * d ? '2' : self.colourFor(r + c);
        rows.push(s);
      }
      var cr = rint(rng, 0, hgt - 1), cc = rint(rng, 0, w - 1);
      rows[cr] = rows[cr].slice(0, cc) + 'C' + rows[cr].slice(cc + 1);
      return rows;
    }
    // two short pendulums at the sides swinging together, and a long one in the middle (never overlapping)
    var len = rint(rng, 110, 125), amp = 16 + rng() * 6, per = 3 + rng() * 0.6;
    var midLen = rint(rng, 220, 236), midAmp = 16 + rng() * 6;
    this.rules.push({ id: 'pendulum', pendulums: [
      { x: 98, y: 44, len: len, amp: amp, period: per, phase: 0, cluster: cluster(3, 3) },
      { x: 262, y: 44, len: len, amp: amp, period: per, phase: 0, cluster: cluster(3, 3) },
      { x: 180, y: 44, len: midLen, amp: midAmp, period: 4 + rng() * 0.8, phase: Math.PI / 2, cluster: cluster(4, 2) }
    ] });
    if (this.has.bigsmall) { this.setM(18, 2, 'X'); }
  };

  PL.buildBrickfall = function () {
    var rng = this.rng, d = this.d;
    // a low starting stack on the glass floor (row 20); pieces drop in on top of it
    var heights = [], c;
    for (c = 0; c < COLS / 2; c++) heights.push(rint(rng, 0, 2));
    for (c = 0; c < COLS / 2; c++) for (var k = 0; k < heights[c]; k++) {
      var ch = rng() < lerp(E.armour, d) ? '2' : this.colourFor(k);
      this.setM(19 - k, c, ch);
    }
    this.setM(19, rint(rng, 1, 4), 'C');
    this.top0 = 17; this.nRows = 3;
    // first piece no sooner than ~3.3s after launch, even with this round's stronger hazards
    var hs = roundPreset(this.preset, this.round).hazardScale, bf = C.rules.brickfall;
    this.rules.push({ id: 'brickfall', pieces: Math.round(8 + 6 * d), grace: Math.max(bf.grace, Math.ceil((3.3 * hs - bf.telegraph) * 10) / 10) });
  };

  // Place the open-area twists and finish the rule list.
  PL.finishField = function () {
    var h = this.has, rng = this.rng, d = this.d, box = this.fieldBox(), e, i, self = this;
    var bottomY = rowY(this.lowestRow() + 1);
    if (h.portals) { // one pair: low at a side, out into the open strip above the bricks
      var side = rng() < 0.5 ? 0 : 1, rad = C.rules.portals.radius;
      e = this.place(rad, 'portal', box, function () { return { x: side ? box.x1 - rad - 6 - rng() * 30 : box.x0 + rad + 6 + rng() * 30, y: box.y0 + rad + rng() * (box.y1 - box.y0 - 2 * rad) }; });
      if (!e) return this.fail('no room for a portal');
      var ex = 70 + Math.round(rng() * 220);
      this.rules.push({ id: 'portals', pairs: [[{ x: e.x, y: e.y }, { x: ex, y: GR.top + (this.power() ? 28 : 20) }]] });
    }
    if (h.bigsmall) {
      var anyX = false;
      this.bricks(function (r, c, ch) { if (ch === 'X') { anyX = true; self.els.push({ x: colX(c) + 15, y: rowY(r) + 8, r: 16, kind: 'splitter' }); } });
      if (!anyX) return this.fail('no splitter');
    }
    if (h.wells) {
      var planets = [], np = d > 0.5 && rng() < 0.6 ? 2 : 1;
      for (i = 0; i < np; i++) {
        e = this.place(C.rules.wells.planetRadius + 14, 'planet', { x0: box.x0 + 30, x1: box.x1 - 30, y0: box.y0, y1: Math.min(box.y1, 410) });
        if (e) planets.push({ x: e.x, y: e.y, mass: Math.round((0.6 + 0.3 * rng()) * 100) / 100 });
      }
      if (!planets.length) return this.fail('no room for a planet');
      this.rules.push({ id: 'wells', planets: planets });
    }
    if (h.pinball) {
      var bumpers = [], nb = rint(rng, 2, 3 + Math.round(d));
      for (i = 0; i < nb; i++) { e = this.place(C.rules.pinball.bumperRadius, 'bumper', box); if (e) bumpers.push({ x: e.x, y: e.y }); }
      if (!bumpers.length) return this.fail('no room for a bumper');
      var gates = rng() < 0.5 ? [{ x1: 0, x2: 60, y: 452 }, { x1: 300, x2: 360, y: 452 }] : [];
      this.rules.push({ id: 'pinball', bumpers: bumpers, gates: gates });
    }
    if (h.paint) { // one gate per colour, under its third of the field
      var gates = [], cols = ['red', 'yellow', 'blue'];
      for (i = 0; i < 3; i++) {
        var gx = 60 + i * 120, gw = 64;
        e = this.place(gw / 2 + 2, 'gate', box, function () { return { x: gx + (rng() - 0.5) * 16, y: box.y0 + gw / 2 + 4 + rng() * Math.max(0, box.y1 - box.y0 - gw - 8) }; });
        if (!e) return this.fail('no room for a paint gate');
        gates.push({ x: e.x - gw / 2, y: e.y, w: gw, color: cols[i] });
      }
      this.rules.push({ id: 'paint', start: 'yellow', gates: gates });
    }
    if (h.mirrors) {
      var mirrors = [], nm = rint(rng, 2, 3), half = (this.preset === 'easy' ? C.rules.mirrors.lenEasy : C.rules.mirrors.len) / 2;
      for (i = 0; i < nm; i++) { e = this.place(half + 4, 'mirror', box); if (e) mirrors.push({ x: e.x, y: e.y, dir: rng() < 0.5 ? 1 : -1 }); }
      if (!mirrors.length) return this.fail('no room for a mirror');
      this.rules.push({ id: 'mirrors', mirrors: mirrors });
    }
    // ---- the rest of the rules, in ORDER
    var spec = {
      conveyor: function () { return { id: 'conveyor', rows: self.conv }; },
      squeeze: function () { return { id: 'squeeze', speed: Math.round((2.8 + 1.4 * d) * 10) / 10 }; },
      runaway: function () { return { id: 'runaway', maxY: Math.min(C.rules.runaway.maxY, self.els.length ? box.y0 - 10 : C.rules.runaway.maxY) }; },
      gusts: function () { return { id: 'gusts' }; },
      redblue: function () { return { id: 'redblue', start: rng() < 0.5 ? 'red' : 'blue', idleSwap: 12 }; },
      beat: function () { return { id: 'beat', pattern: pick(rng, ['checker', 'rows', 'cols']) }; },
      overgrown: function () { return { id: 'overgrown', maxRow: Math.max(self.layoutBottom() + 1, 8) }; },
      double: function () { return { id: 'double' }; },
      wrap: function () { return { id: 'wrap' }; },
      ice: function () { return { id: 'ice' }; },
      tide: function () { return { id: 'tide' }; },
      redhot: function () { return { id: 'redhot' }; },
      thunder: function () { return { id: 'thunder' }; },
      bigsmall: function () { return { id: 'bigsmall' }; },
      walls: function () { return { id: 'walls' }; },
      hatch: function () { return { id: 'hatch' }; },
      cannon: function () { return { id: 'cannon' }; },
      powershot: function () { return { id: 'powershot' }; },
      slowmo: function () { return { id: 'slowmo' }; },
      curve: function () { return { id: 'curve' }; },
      safetywall: function () { return { id: 'safetywall', splitEvery: 0 }; },
      flip: function () { return { id: 'flip' }; },
      lightsout: function () { return { id: 'lightsout' }; }
    };
    for (i = 0; i < ORDER.length; i++) if (h[ORDER[i]] && spec[ORDER[i]]) this.rules.push(spec[ORDER[i]]());
    this.rules.sort(function (a, b) { return ORDER.indexOf(a.id) - ORDER.indexOf(b.id); });
    this.bottomY = bottomY;
    return true;
  };
  PL.fail = function (why) { this.failed = why; return false; };

  PL.grid = function () {
    var out = [], last = -1, r;
    for (r = 0; r < this.g.length; r++) if (this.g[r].join('') !== '............') last = r;
    for (r = 0; r <= last; r++) out.push(this.g[r].join(''));
    return out;
  };

  // ---------------------------------------------------------------- the public generator
  // opts: { seed, round, preset ('easy'|'normal'|'hard'), worlds: [finished world numbers] }
  function generate(opts) {
    var seed = opts.seed >>> 0, round = Math.max(1, opts.round | 0), presetName = opts.preset || 'normal';
    var worlds = opts.worlds && opts.worlds.length ? opts.worlds : [1];
    var prev = round > 1 ? chooseTwists(seed, round - 1, worlds, null) : null;
    var twists = chooseTwists(seed, round, worlds, prev);
    var level = null, why = null, attempt;
    for (attempt = 0; attempt < 40 && !level; attempt++) {
      var P = new Plan(rngFor(seed, round, 100 + attempt), round, twists, presetName);
      if (P.build() === false) { why = P.failed; continue; }
      var lv = makeLevel(P, seed, round, presetName, worlds, twists);
      why = checkLayout(lv) || checkPlacement(lv);
      if (!why) { level = lv; level.attempts = attempt + 1; }
    }
    if (!level) { // should never happen (the sim checks thousands of rounds); a plain safe wall instead
      level = makeLevel(fallbackPlan(seed, round, presetName), seed, round, presetName, worlds, []);
      level.fallback = why || true;
      level.attempts = attempt;
    }
    return level;
  }

  function fallbackPlan(seed, round, presetName) {
    var P = new Plan(rngFor(seed, round, 999), round, [], presetName);
    P.colourOfs = 0; P.top0 = 1; P.nRows = 5;
    for (var r = 1; r <= 5; r++) for (var c = 1; c < COLS - 1; c++) P.set(r, c, P.colourFor(r));
    P.finishField();
    return P;
  }

  function makeLevel(P, seed, round, presetName, worlds, twists) {
    var names = [], tips = [], i, w = 1;
    for (i = 0; i < twists.length; i++) { names.push(TWISTS[twists[i]].name); tips.push(TWISTS[twists[i]].tip); w = Math.max(w, TWISTS[twists[i]].world); }
    return {
      id: 1000 + round, world: w, name: 'Round ' + round, twist: 'endless', endless: true,
      round: round, seed: seed, preset: presetName, twists: twists.slice(), twistNames: names, tips: tips,
      banner: tips.join(' · '), par: 9999,
      clear: P.clear || 'bricks',
      capsuleChance: P.capsuleChance != null ? P.capsuleChance : lerp(E.capsuleChance, P.d),
      grid: P.grid(), rules: P.rules.slice(),
      noCapsules: P.power() ? ['laser', 'catch'] : undefined // a tap is a power in these rounds
    };
  }

  // Rule elements: never on a brick, never in the paddle zone, never on top of each other.
  function checkPlacement(level) {
    var els = [], i, j;
    (level.rules || []).forEach(function (ru) {
      if (ru.id === 'wells') ru.planets.forEach(function (p) { els.push({ x: p.x, y: p.y, r: C.rules.wells.planetRadius }); });
      if (ru.id === 'pinball') ru.bumpers.forEach(function (p) { els.push({ x: p.x, y: p.y, r: C.rules.pinball.bumperRadius }); });
      if (ru.id === 'portals') ru.pairs.forEach(function (pr) { els.push({ x: pr[0].x, y: pr[0].y, r: C.rules.portals.radius }, { x: pr[1].x, y: pr[1].y, r: C.rules.portals.radius }); });
      if (ru.id === 'mirrors') ru.mirrors.forEach(function (m) { els.push({ x: m.x, y: m.y, r: C.rules.mirrors.lenEasy / 2 + 2 }); });
      if (ru.id === 'paint') ru.gates.forEach(function (q) { els.push({ x: q.x + q.w / 2, y: q.y, r: q.w / 2 }); });
    });
    var paddleTop = C.paddle.y - C.paddle.h / 2 - 2 * C.ball.radius - 40;
    for (i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.y + e.r > paddleTop) return 'element too close to the paddle';
      if (e.x - e.r < 0 || e.x + e.r > C.W || e.y - e.r < C.TOP) return 'element outside the field';
      for (j = i + 1; j < els.length; j++) if (Math.hypot(els[j].x - e.x, els[j].y - e.y) < els[j].r + e.r + 2 * C.ball.radius) return 'elements overlap';
      var grid = level.grid;
      for (var r = 0; r < grid.length; r++) for (var c = 0; c < COLS; c++) {
        if (grid[r][c] === '.') continue;
        var bx = colX(c) + 1, by = rowY(r) + 1, qx = Math.max(bx, Math.min(e.x, bx + GR.brickW)), qy = Math.max(by, Math.min(e.y, by + GR.brickH));
        if (Math.hypot(qx - e.x, qy - e.y) < e.r + C.ball.radius) return 'element on a brick';
      }
    }
    return null;
  }

  function describe(id) { return TWISTS[id] ? { name: TWISTS[id].name, tip: TWISTS[id].tip, world: TWISTS[id].world } : null; }

  BT.Endless = {
    TWISTS: TWISTS, ORDER: ORDER, EXCLUDED: EXCLUDED, CAP_TAGS: CAP_TAGS, CONFLICTS: CONFLICTS,
    conflictReason: conflictReason, compatible: compatible, legalSet: legalSet,
    completedWorlds: completedWorlds, unlocked: unlocked, pool: pool,
    chooseTwists: chooseTwists, generate: generate, roundPreset: roundPreset, ramp: ramp,
    checkLayout: checkLayout, checkPlacement: checkPlacement, reachMap: reachMap, describe: describe, hash32: hash32
  };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
