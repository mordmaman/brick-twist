// Brick types and factory. No DOM.
// ASCII legend for level grids:
//   .  empty
//   r o y g c b p m w   normal brick in that colour
//   2 3                 armoured (2 or 3 hits)
//   #                   steel (unbreakable except by TNT / bomb; not needed to clear)
//   T                   TNT (explodes, takes neighbours, chains)
//   K                   key (unlocks every locked brick)
//   L                   locked (acts as steel until the key is hit)
//   C                   capsule brick (always drops a capsule)
//   A                   anchor (Squeeze: hit to shove the wall up; unbreakable)
(function (BT) {
  'use strict';

  var COLORS = {
    r: '#ff5a64', o: '#ff9f43', y: '#ffd35a', g: '#2ee0a4', c: '#4fd8ff',
    b: '#5b8cff', p: '#a46bff', m: '#ff6bcb', w: '#e8ecf4'
  };
  var ARMOUR_COLOR = '#8fa3c7';
  var STEEL_COLOR = '#5d6678';
  var TNT_COLOR = '#ff3b3b';
  var KEY_COLOR = '#ffcc33';
  var LOCK_COLOR = '#b8912e';
  var CAPSULE_BRICK_COLOR = '#ffffff';
  var ANCHOR_COLOR = '#3dd6c6';

  function make(type, x, y, w, h) {
    return {
      type: type, x: x, y: y, w: w, h: h,
      bx: x, by: y, dx: 0, dy: 0,     // base position + per-step offsets added by rules
      hp: 1, maxHp: 1, color: '#fff', alive: true,
      required: true,                  // must be destroyed to clear the level
      breakable: true,
      solid: true,                     // ball collides with it
      noBlast: false,                  // explosions ignore it
      blastDamage: false,              // explosions damage it by 1 rather than destroying it
      wrap: false,                     // conveyor: drawn/collided across the side edge
      owner: null,                     // rule instance that owns/moves it
      row: -1, col: -1,
      flash: 0, shake: 0, tag: null, cap: null
    };
  }

  // Create a brick from an ASCII character. Returns null for empty.
  function fromChar(ch, x, y, w, h) {
    var b;
    if (ch === '.' || ch === ' ') return null;
    if (COLORS[ch]) {
      b = make('normal', x, y, w, h); b.color = COLORS[ch]; return b;
    }
    switch (ch) {
      case '2': case '3':
        b = make('armour', x, y, w, h); b.hp = b.maxHp = +ch; b.color = ARMOUR_COLOR; return b;
      case '#':
        b = make('steel', x, y, w, h); b.breakable = false; b.required = false; b.color = STEEL_COLOR; return b;
      case 'T':
        b = make('tnt', x, y, w, h); b.color = TNT_COLOR; return b;
      case 'K':
        b = make('key', x, y, w, h); b.color = KEY_COLOR; return b;
      case 'L':
        b = make('locked', x, y, w, h); b.breakable = false; b.color = LOCK_COLOR; return b;
      case 'C':
        b = make('capsule', x, y, w, h); b.color = CAPSULE_BRICK_COLOR; return b;
      case 'A':
        b = make('anchor', x, y, w, h); b.breakable = false; b.required = false; b.noBlast = true; b.color = ANCHOR_COLOR; return b;
    }
    return null;
  }

  // Bricks that explosions treat as solid walls they can blow through.
  function isHardWall(b) { return b.type === 'steel' || b.type === 'locked'; }

  BT.Bricks = {
    COLORS: COLORS, ARMOUR_COLOR: ARMOUR_COLOR, STEEL_COLOR: STEEL_COLOR, TNT_COLOR: TNT_COLOR,
    KEY_COLOR: KEY_COLOR, LOCK_COLOR: LOCK_COLOR, ANCHOR_COLOR: ANCHOR_COLOR,
    make: make, fromChar: fromChar, isHardWall: isHardWall,
    LEGEND: '.rroygcbpmw23#TKLCA'
  };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
