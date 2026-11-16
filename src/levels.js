// Level data: ASCII grids (12 columns, see bricks.js legend) plus rule lists. No DOM.
// Each level introduces one twist; `banner` is shown the first time that twist appears.
// clear: 'bricks' (default, every required brick), 'core' (only the core), 'boss' (beat the boss).
(function (BT) {
  'use strict';

  var WORLDS = [
    { n: 1, name: 'Warm-up', tint: '#151b3d', accent: '#ffd35a' },
    { n: 2, name: 'On the move', tint: '#0f2a3a', accent: '#4fd8ff' },
    { n: 3, name: 'Bend the ball', tint: '#25163e', accent: '#c56bff' },
    { n: 4, name: 'Lights and switches', tint: '#1a1a1a', accent: '#ffcc33' },
    { n: 5, name: 'Flip the rules', tint: '#2a1414', accent: '#ff6b6b' },
    { n: 6, name: 'Mash-ups', tint: '#14261a', accent: '#2ee0a4', soon: true }
  ];

  var LEVELS = [
    // ---------------- World 1: Warm-up ----------------
    {
      id: 1, world: 1, name: 'First Wall', twist: 'capsules', par: 50, capsuleChance: 0.3,
      banner: 'Catch the falling capsules. They give you powers!',
      grid: [
        '............',
        '............',
        '.rrrrrrrrrr.',
        '.ooCooooCoo.',
        '.yyyyyyyyyy.',
        '.ggCggggCgg.',
        '.cccccccccc.'
      ]
    },
    {
      id: 2, world: 1, name: 'Hard Hats', twist: 'armour', par: 115,
      banner: 'Silver bricks take extra hits. Steel never breaks: go round the side!',
      grid: [
        '............',
        '..22222222..',
        '.2bbbbbbbb2.',
        '.2bpbCCbpb2.',
        '.2bbbbbbbb2.',
        '..22222222..',
        '............',
        '..########..',
        '............',
        '...y2..2y...'
      ]
    },
    {
      id: 3, world: 1, name: 'Fuse', twist: 'tnt', par: 60,
      banner: 'Hit the TNT at the bottom. It sets off the whole fuse!',
      grid: [
        'yyyyyyyyyyyy',
        'y##########y',
        'y#TTTTTTTT#y',
        'y#oooooooo#y',
        'y####T#####y',
        '....#T#.....',
        '....#T#.....',
        '....#T#.....',
        '.....T......',
        '............',
        '.#........#.'
      ]
    },
    {
      id: 4, world: 1, name: 'Lock and Key', twist: 'key', par: 120,
      banner: 'Gold padlocks are locked. Squeeze through the gap and hit the key!',
      grid: [
        'LLLLLLLLL#.K',
        'LmmmmmmmL#..',
        'LmmmmmmmL#..',
        'LLLLLLLLL#..',
        '.........#..',
        '.gggggggg#..',
        '.........#.#',
        '............',
        '............',
        '..c.cC.c.c..'
      ]
    },
    {
      id: 5, world: 1, name: 'The Gatekeeper', twist: 'boss-gatekeeper', par: 135, clear: 'boss', boss: true,
      banner: 'Boss! Break through and hit both eyes. Dodge the red blocks it spits.',
      grid: [
        '............', '............', '............', '............', '............',
        '............', '............', '............',
        'C..........C'
      ],
      rules: [{ id: 'gatekeeper' }]
    },

    // ---------------- World 2: On the move ----------------
    {
      id: 6, world: 2, name: 'Conveyor', twist: 'conveyor', par: 90,
      banner: 'The rows slide like conveyor belts. Wait for a gap!',
      grid: [
        'rrrrr..rrrr.',
        '.oooo..ooooo',
        'yyy..yyy..yy',
        'gg..gggg..gC',
        'cccc....cccc',
        'bb..bb..bb..'
      ],
      rules: [{ id: 'conveyor', rows: { 0: 32, 1: -32, 2: 44, 3: -44, 4: 56, 5: -56 } }]
    },
    {
      id: 7, world: 2, name: 'Squeeze', twist: 'squeeze', par: 95,
      banner: 'The wall is coming down! Hit the arrow bricks to shove it back up.',
      grid: [
        'pppppppppppp',
        'pmmmmmmmmmmp',
        'rrrrrrrrrrrr',
        'ooooCooooooo',
        'yyyyyyyyCyyy',
        'gggggggggggg',
        'cccAccccAccc'
      ],
      rules: [{ id: 'squeeze', speed: 5 }]
    },
    {
      id: 8, world: 2, name: 'Orbit', twist: 'orbit', par: 55, clear: 'core', capsuleChance: 0.15,
      banner: 'Only the glowing core matters. Time your shot through the gaps!',
      grid: [],
      rules: [{
        id: 'orbit', cx: 180, cy: 226,
        rings: [
          { radius: 46, speed: 0.9, pattern: 'cccccccccc', size: 16 },
          { radius: 84, speed: -0.55, pattern: 'bb.bb.bb.bb.bb.bb.', size: 16 },
          { radius: 122, speed: 0.32, pattern: '#...#...#...#...#...', size: 16 }
        ]
      }]
    },
    {
      id: 9, world: 2, name: 'Pendulum', twist: 'pendulum', par: 50,
      banner: 'These bricks swing on chains. Hit them on the way past!',
      grid: [],
      rules: [{
        id: 'pendulum', pendulums: [
          { x: 84, y: 44, len: 120, amp: 26, period: 3.2, phase: 0, cluster: ['ccc', 'cCc', 'ccc'] },
          { x: 276, y: 44, len: 120, amp: 26, period: 3.2, phase: 0, cluster: ['mmm', 'mmm', 'mCm'] },
          { x: 180, y: 44, len: 236, amp: 20, period: 4.4, phase: Math.PI / 2, cluster: ['yyyy', 'y22y'] }
        ]
      }]
    },
    {
      id: 10, world: 2, name: 'The Serpent', twist: 'boss-serpent', par: 110, clear: 'boss', boss: true,
      banner: 'Boss! Chop off the Serpent\'s tail, then hit its head when it turns red.',
      grid: [],
      rules: [{ id: 'serpent' }]
    },

    // ---------------- World 3: Bend the ball ----------------
    {
      id: 11, world: 3, name: 'Portals', twist: 'portals', par: 75,
      banner: 'Portals! Go in one and pop out of its twin. It is the only way up.',
      grid: [
        '............',
        '............',
        'oyyggggggyyo',
        'ygCbbbbbbCgy',
        '.gbbppppbbg.',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '############',
        '............',
        '............',
        '....wwww....',
        '...w....w...'
      ],
      rules: [{
        id: 'portals', radius: 21, captureFrac: 0.7,
        pairs: [
          [{ x: 52, y: 390 }, { x: 300, y: 218 }],
          [{ x: 308, y: 390 }, { x: 60, y: 218 }]
        ]
      }]
    },
    {
      id: 12, world: 3, name: 'Gravity Wells', twist: 'wells', par: 90,
      banner: 'Planets bend the ball. Watch the dotted line after each launch.',
      grid: [
        '............',
        'bbbbbbbbbbbb',
        'bppppppppppb',
        'bp........pb',
        'b..........b',
        '............',
        'yy........yy',
        'y..........y',
        '............',
        '............',
        '.....cc.....'
      ],
      rules: [{ id: 'wells', planets: [{ x: 100, y: 300, mass: 1 }, { x: 262, y: 236, mass: 1 }] }]
    },
    {
      id: 13, world: 3, name: 'Gusts', twist: 'gusts', par: 125,
      banner: 'Wind! Streaks and arrows warn you just before a gust blows.',
      grid: [
        'gggggggggggg',
        'g..........g',
        'g.cccccccc.g',
        'g.c.oooo.c.g',
        'g.c.oCoo.c.g',
        'g.cccccccc.g',
        'g..........g',
        '............',
        '............',
        'w..........w',
        'w..........w'
      ],
      rules: [{ id: 'gusts' }]
    },
    {
      id: 14, world: 3, name: 'Pinball', twist: 'pinball', par: 120,
      banner: 'Bumpers kick the ball. Green gates only let it through going up.',
      grid: [
        'rrrrrrrrrrrr',
        'oooooooooooo',
        'yy.yyCyy.yy.',
        '..g..gg..g..',
        '............',
        '.....##.....'
      ],
      rules: [{
        id: 'pinball',
        bumpers: [{ x: 90, y: 250 }, { x: 270, y: 250 }, { x: 180, y: 300 }, { x: 130, y: 190 }, { x: 230, y: 190 }],
        gates: [{ x1: 0, x2: 66, y: 372 }, { x1: 294, x2: 360, y: 372 }]
      }]
    },
    {
      id: 15, world: 3, name: 'The Magnet', twist: 'boss-magnet', par: 75, clear: 'boss', boss: true,
      banner: 'Boss! The Magnet pulls the ball in. Hit it only while it glows red.',
      grid: [
        'C..........C',
        'pp........pp',
        'p..........p'
      ],
      rules: [{ id: 'magnet', cx: 180, cy: 230, shieldRadius: 64, shield: '2c2c2c2c2c2c' }]
    },

    // ---------------- World 4: Lights and switches ----------------
    {
      id: 16, world: 4, name: 'Lights Out', twist: 'lightsout', par: 75,
      banner: 'It\'s dark! Hit the glowing bricks to light things up.',
      grid: [
        '............',
        '.cccccccccc.',
        '.ccGccccGcc.',
        '.cccccccccc.',
        '............',
        'bbbb....bbbb',
        'bGbb....bbGb',
        'bbbb....bbbb',
        '............',
        '....pppp....',
        '....pGCp....',
        '....pppp....'
      ],
      rules: [{ id: 'lightsout' }]
    },
    {
      id: 17, world: 4, name: 'Red / Blue', twist: 'redblue', par: 95,
      banner: 'Only one colour is solid. Hit a switch to swap red and blue!',
      grid: [
        '............',
        '.BBBBBBBBBB.',
        '.RRRRRRRRRR.',
        '.BBBBBBBBBB.',
        '............',
        'S..........S',
        '............',
        '............',
        '...RRRRRR...'
      ],
      rules: [{ id: 'redblue', start: 'red' }]
    },
    {
      id: 18, world: 4, name: 'On the Beat', twist: 'beat', par: 95,
      banner: 'Bricks fade in and out to the beat. The ball goes through faded ones.',
      grid: [
        '............',
        '............',
        'mmmmmmmmmmmm',
        'mmmmmmmmmmmm',
        'pppppppppppp',
        'ppppCppppppp',
        'bbbbbbbbbbbb',
        'bbbbbbbCbbbb',
        '............',
        '..cccccccc..'
      ],
      rules: [{ id: 'beat', pattern: 'checker' }]
    },
    {
      id: 19, world: 4, name: 'Overgrown', twist: 'overgrown', par: 115,
      banner: 'Vines grow back! Smash the brown roots and their vines wither.',
      grid: [
        '.VVV....VVV.',
        '.VOV....VOV.',
        '.VVV....VVV.',
        '..V......V..',
        '............',
        '....VVVV....',
        '....VOVV....',
        '....VVVV....',
        '.....V......',
        '............',
        'C..........C'
      ],
      rules: [{ id: 'overgrown' }]
    },
    {
      id: 20, world: 4, name: 'The Lighthouse', twist: 'boss-lighthouse', par: 85, clear: 'boss', boss: true,
      banner: 'Boss! Bricks are only solid in the light. Hit the lamp in the middle.',
      grid: [
        'C..........C'
      ],
      rules: [{
        id: 'lighthouse', cx: 180, cy: 222, startAngle: 0,
        rings: [
          { radius: 46, n: 10, ch: 'y', size: 18 },
          { radius: 80, n: 16, ch: 'o', size: 18, offset: 0.5 },
          { radius: 114, n: 22, ch: 'r', size: 18 }
        ]
      }]
    },

    // ---------------- World 5: Flip the rules ----------------
    {
      id: 21, world: 5, name: 'Double Trouble', twist: 'double', par: 85,
      banner: 'A second paddle at the top copies yours. Keep the ball in at both ends!',
      grid: [
        '............', '............', '............', '............', '............',
        '............', '............', '............', '............',
        '..rrrrrrrr..',
        '.oo.oooo.oo.',
        'yyyyCyyCyyyy',
        'gggggggggggg',
        '.cc.cccc.cc.',
        '..bbbbbbbb..'
      ],
      rules: [{ id: 'double' }]
    },
    {
      id: 22, world: 5, name: 'Wraparound', twist: 'wrap', par: 115,
      banner: 'No side walls! The ball and your paddle wrap round to the other side.',
      grid: [
        '............',
        'cc........cc',
        'cc..yyyy..cc',
        'bb..mCmm..bb',
        'bb........bb',
        'pp........pp',
        'pp##....##pp',
        '............',
        '............',
        'gg........gg'
      ],
      rules: [{ id: 'wrap' }]
    },
    {
      id: 23, world: 5, name: 'Brickfall', twist: 'brickfall', par: 125,
      banner: 'Brick shapes drop in and stack up. Don\'t let the stack reach the red line!',
      grid: [
        '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............',
        '............',
        '............',
        'y..........y',
        'oo...CC...oo',
        'rrr.rrrr.rrr'
      ],
      rules: [{ id: 'brickfall' }]
    },
    {
      id: 24, world: 5, name: 'Twelve Bounces', twist: 'bounces', par: 60, capsuleChance: 0,
      banner: 'Puzzle! Clear it in 12 bounces. Run out and it just starts again.',
      grid: [
        'rrr......bbb',
        'rrr......bbb',
        'rTr......bTb',
        '.T........T.',
        '.T..oooo..T.',
        '....oooo....',
        '....oTTo....',
        '.....TT.....',
        '............',
        'gg........gg',
        'gT###..###Tg',
        'gT........Tg'
      ],
      rules: [{ id: 'bounces' }]
    },
    {
      id: 25, world: 5, name: 'The Rival', twist: 'boss-rival', par: 120, clear: 'boss', boss: true,
      banner: 'Boss! Your Rival bats the ball back. Sneak past it and smash its core.',
      grid: [
        '.rrr....rrr.',
        '.ooo....ooo.',
        '...yyyyyy...',
        '............',
        '............', '............', '............', '............',
        '............', '............', '............', '............',
        'C..........C'
      ],
      rules: [{ id: 'rival' }]
    }
  ];

  BT.WORLDS = WORLDS;
  BT.LEVELS = LEVELS;
  BT.levelById = function (id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
