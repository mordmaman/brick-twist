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
    { n: 6, name: 'Mash-ups', tint: '#14261a', accent: '#2ee0a4' },
    { n: 7, name: 'The elements', tint: '#10223a', accent: '#7fd4ff' },
    { n: 8, name: 'Wits', tint: '#26182e', accent: '#ff9f43' },
    { n: 9, name: 'New powers', tint: '#1d2242', accent: '#ffe27a', act: 2 },
    { n: 10, name: 'Living bricks', tint: '#1b2a16', accent: '#b6f07a', act: 2 },
    { n: 11, name: 'Topsy-turvy', tint: '#2a1838', accent: '#7cf5ff', act: 2 }
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
    },

    // ---------------- World 6: Mash-ups (two earlier twists that need each other) ----------------
    {
      id: 26, world: 6, name: 'Express Delivery', twist: 'mash-conveyor-portals', par: 55,
      banner: 'Portals are the only way up, and the top ones ride a conveyor belt. Time your shot!',
      grid: [
        'rrrr..rrrr..',
        '..oooo..oooo',
        'yyCyy..yyCyy',
        '............',
        '............',
        '............',
        'gg..gggg..gg',
        '.cccc..cccc.',
        '............', '............', '............',
        '############'
      ],
      rules: [
        { id: 'conveyor', rows: { 0: 34, 1: -40, 2: 48, 4: -46, 6: -36, 7: 30 } },
        { id: 'portals', radius: 19, captureFrac: 0.7,
          pairs: [
            [{ x: 52, y: 400 }, { x: 90, y: 136, vx: -46 }],
            [{ x: 308, y: 400 }, { x: 270, y: 136, vx: -46 }]
          ] }
      ]
    },
    {
      id: 27, world: 6, name: 'Night Sky', twist: 'mash-lightsout-orbit', par: 60, clear: 'core', capsuleChance: 0.15,
      banner: 'Dark, and the rings turn! The glowing bricks ride round with them. Hit the core.',
      grid: [
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............',
        'G..........G'
      ],
      rules: [
        { id: 'orbit', cx: 180, cy: 226, rings: [
          { radius: 46, speed: 0.8, pattern: 'cGccccGccc', size: 16 },
          { radius: 84, speed: -0.5, pattern: 'bb.bGb.bb.bbG.b.bb', size: 16 },
          { radius: 122, speed: 0.3, pattern: '#...G...#...G...#...', size: 16 }
        ] },
        { id: 'lightsout' }
      ]
    },
    {
      id: 28, world: 6, name: 'Slingshot', twist: 'mash-wrap-wells', par: 120,
      banner: 'No side walls! The corner bricks join up across the edge, and planets sling the ball over.',
      grid: [
        '###......###',
        '..#......#..',
        'oo#.pppp.#oo',
        'rr#.pCpp.#rr',
        'gg#......#cc',
        '..#......#..'
      ],
      rules: [{ id: 'wrap' }, { id: 'wells', planets: [{ x: 46, y: 330, mass: 0.9 }, { x: 314, y: 270, mass: 0.9 }] }]
    },
    {
      id: 29, world: 6, name: 'Pressure Switch', twist: 'mash-redblue-squeeze', par: 115,
      banner: 'The wall is coming down! Swap colours with a switch to reach the arrow bricks.',
      grid: [
        'BBBBBBBBBBBB',
        'RRRRRRRRRRRR',
        '..A....A....',
        'RRRRBBBBRRRR',
        '............',
        'S..........S'
      ],
      rules: [{ id: 'redblue', start: 'red', idleSwap: 12 }, { id: 'squeeze', speed: 4 }]
    },
    {
      id: 30, world: 6, name: 'The Twins', twist: 'boss-twins', par: 90, clear: 'boss', boss: true,
      banner: 'Boss! Only the awake twin can be hurt. Knock one out, then quickly get the other!',
      grid: [
        'C..........C'
      ],
      rules: [{ id: 'twins' }]
    },

    // ---------------- World 7: The elements ----------------
    {
      id: 31, world: 7, name: 'Ice Rink', twist: 'ice', par: 105,
      banner: 'Ice! Your paddle slides and takes a moment to stop. Frosty bricks thaw first, then break.',
      grid: [
        '............',
        '..IIIIIIII..',
        '.Icc.CC.ccI.',
        '.IIIIIIIIII.',
        '............',
        '..bbb..bbb..',
        '............',
        '...IIIIII...'
      ],
      rules: [{ id: 'ice' }]
    },
    {
      id: 32, world: 7, name: 'High Tide', twist: 'tide', par: 105,
      banner: 'The tide rises and falls. Under water the ball and your paddle slow down.',
      grid: [
        '............',
        'cccccccccccc',
        'bbbbCbbbbbbb',
        'cccccccccccc',
        '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............',
        '............', '............', '............', '............',
        'w.w.w..w.w.w',
        '.gg.gCgg.gg.'
      ],
      rules: [{ id: 'tide' }]
    },
    {
      id: 33, world: 7, name: 'Red Hot', twist: 'redhot', par: 125,
      banner: 'Hit bricks in a row to heat the ball up. Red hot, it burns straight through them!',
      grid: [
        '............',
        '.2222222222.',
        '.2rrrCrrrr2.',
        '.2rr####rr2.',
        '.2rrrrrrCr2.',
        '.2222..2222.',
        '............',
        'oo..oooo..oo',
        '............',
        '...yyyyyy...'
      ],
      rules: [{ id: 'redhot' }]
    },
    {
      id: 34, world: 7, name: 'Thunderstorm', twist: 'thunder', par: 55,
      banner: 'Lightning! A cloud shows where it will strike. Keep your paddle out from under it.',
      grid: [
        '............',
        'bbbbbbbbbbbb',
        '2b22b22b22b2',
        'bbbbCbbCbbbb',
        '............',
        '##..####..##',
        '............',
        'pppp....pppp',
        '............',
        '..cc....cc..'
      ],
      rules: [{ id: 'thunder' }]
    },
    {
      id: 35, world: 7, name: 'The Storm Cloud', twist: 'boss-stormcloud', par: 90, clear: 'boss', boss: true,
      banner: 'Boss! Its drops shrink your paddle. Hit the cloud right after its lightning flash.',
      grid: [
        'C..........C'
      ],
      rules: [{ id: 'stormcloud' }]
    },

    // ---------------- World 8: Wits ----------------
    {
      id: 36, world: 8, name: 'Runaways', twist: 'runaway', par: 90,
      banner: 'These bricks run away from the ball! Trap them against walls and each other.',
      grid: [
        '............',
        '..r.o..y.g..',
        '............',
        '.c..##..##.b',
        '............',
        '..p.m..r.o..',
        '............',
        '#....yy....#',
        '............',
        '...g....c...'
      ],
      rules: [{ id: 'runaway' }]
    },
    {
      id: 37, world: 8, name: 'Big and Small', twist: 'bigsmall', par: 65, capsuleChance: 0.06,
      banner: 'A giant ball ploughs through bricks. Hit a purple splitter to break it into small fast ones!',
      grid: [
        '222222222222',
        '2oooooooooo2',
        '2o22222222o2',
        '............',
        '............',
        '..X......X..',
        '............',
        '............',
        'yyyyyyyyyyyy',
        'gggCgggggCgg',
        'cccccccccccc'
      ],
      rules: [{ id: 'bigsmall' }]
    },
    {
      id: 38, world: 8, name: 'Closing Walls', twist: 'walls', par: 95,
      banner: 'The walls are closing in! Hit the orange pushers to shove them back out.',
      grid: [
        '....rrrr....',
        '...oooooo...',
        '..yyyCyyyy..',
        '...gggggg...',
        '....cccc....',
        '............',
        '............',
        '....H..H....',
        '............',
        '...bbbbbb...'
      ],
      rules: [{ id: 'walls' }]
    },
    {
      id: 39, world: 8, name: 'Hall of Mirrors', twist: 'mirrors', par: 130,
      banner: 'Mirrors turn the ball sideways and flip when hit. Use them to get into the sealed rooms!',
      grid: [
        '............',
        '###.pppp.###',
        'rr#.pppp.#oo',
        'rr........oo',
        'Cr........oC',
        'rr........oo',
        '###......###'
      ],
      rules: [{ id: 'mirrors', mirrors: [{ x: 180, y: 136, dir: 1 }, { x: 120, y: 250, dir: 1 }, { x: 240, y: 250, dir: -1 }] }]
    },
    {
      id: 40, world: 8, name: 'The Machine', twist: 'boss-machine', par: 175, clear: 'boss', boss: true, actEnd: true,
      banner: 'Final boss! The Machine has three phases. Hit its red eye when it is open.',
      grid: [
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............', '............',
        'C..........C'
      ],
      rules: [{ id: 'machine' }]
    },

    // ======================= Act two =======================
    // Taps are powers here, so the Laser and Catch capsules (which also use taps) are left out of these levels.
    // ---------------- World 9: New powers ----------------
    {
      id: 41, world: 9, name: 'Power Shot', twist: 'powershot', par: 110, noCapsules: ['laser', 'catch'],
      banner: 'New power! Tap just as the ball lands on your paddle (the ring shows when) for a POWER SHOT that smashes through bricks.',
      grid: [
        '............',
        '..33333333..',
        '.3yyyyyyyy3.',
        '.3yCyyyyCy3.',
        '.3yyyyyyyy3.',
        '..33333333..',
        '............',
        '............',
        '...3....3...'
      ],
      rules: [{ id: 'powershot' }]
    },
    {
      id: 42, world: 9, name: 'Slow-Mo', twist: 'slowmo', par: 140, noCapsules: ['laser', 'catch'],
      banner: 'New power! Tap to slow time down (tap again to stop). Your paddle stays fast. Use it to aim through the narrow gaps.',
      grid: [
        '............',
        '#ppp####ppp#',
        '#pCp####pCp#',
        '#ppp####ppp#',
        '##..####..##',
        '............',
        '............',
        '............',
        '....bbbb....',
        '............',
        'yy........yy'
      ],
      rules: [{ id: 'slowmo' }, { id: 'pinball', bumpers: [{ x: 180, y: 244 }, { x: 116, y: 296 }, { x: 244, y: 296 }], gates: [] }]
    },
    {
      id: 43, world: 9, name: 'Curveball', twist: 'curve', par: 130, noCapsules: ['laser', 'catch'],
      banner: 'New power! While the ball flies up, move your paddle to bend it the same way. Curve it round the steel!',
      grid: [
        '............',
        '............',
        '...cccccc...',
        '...cbCbbc...',
        '...cccccc...',
        '............',
        '..########..',
        '............',
        '............',
        '...yy..yy...'
      ],
      rules: [{ id: 'curve' }]
    },
    {
      id: 44, world: 9, name: 'Safety Wall', twist: 'safetywall', par: 105, noCapsules: ['laser', 'catch'],
      banner: 'New power! Tap to raise a wall under your paddle for a moment. Watch out: this level loves multi-ball! Shield bricks give more walls.',
      grid: [
        '............',
        'rrrrrrrrrrrr',
        'oFooooooooFo',
        'yyyyyyyyyyyy',
        'gggFggggFggg',
        'cccccccccccc',
        '............',
        '..bbbbbbbb..'
      ],
      rules: [{ id: 'safetywall' }]
    },
    {
      id: 45, world: 9, name: 'The Keeper', twist: 'boss-keeper', par: 150, clear: 'boss', boss: true, noCapsules: ['laser', 'catch'],
      banner: 'Boss! Score goals past The Keeper. It stops straight shots: use a Power Shot, or curve the ball after it dives!',
      grid: [
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............', '............',
        '............', '............',
        'C..........C'
      ],
      rules: [{ id: 'keeper' }, { id: 'powershot' }, { id: 'curve' }, { id: 'slowmo' }]
    },

    // ---------------- World 10: Living bricks ----------------
    {
      id: 46, world: 10, name: 'Hatchlings', twist: 'hatch', par: 105,
      banner: 'Eggs! They wobble, then hatch into critters that shrink your paddle. Break eggs early or bop the critters!',
      grid: [
        '............',
        '.rrrrrrrrrr.',
        '.rEoooooEor.',
        '.yyyyEyyyyy.',
        '.gEggggggEg.',
        '............',
        '...cccccc...'
      ],
      rules: [{ id: 'hatch' }]
    },
    {
      id: 47, world: 10, name: 'Puppet Strings', twist: 'puppet', par: 115,
      banner: 'The purple block is a puppet: it slides the opposite way to your paddle. Move it over the gap to hit it!',
      grid: [
        '............',
        '...pppppp...',
        '...mCmmCm...',
        '...pppppp...',
        '............',
        '............',
        '####....####',
        '............',
        '..yy....yy..'
      ],
      rules: [{ id: 'puppet', rows: [1, 2, 3] }]
    },
    {
      id: 48, world: 10, name: 'Builder Bots', twist: 'builders', par: 120,
      banner: 'Builder bots rebuild broken bricks! Knock the robots out first (two hits each).',
      grid: [
        '............',
        '.oooooooooo.',
        '.yyyCyyyyCy.',
        '.gggggggggg.',
        '............',
        '............',
        '............',
        '............',
        '...cc..cc...'
      ],
      rules: [{ id: 'builders', bots: [{ row: 5, c0: 0, c1: 5, rows: [1, 3] }, { row: 5, c0: 6, c1: 11, rows: [1, 3] }] }]
    },
    {
      id: 49, world: 10, name: 'Paint Job', twist: 'paint', par: 130,
      banner: 'Send the ball up through a paint gate to colour it. It only breaks bricks of its own colour and shape!',
      grid: [
        '............',
        'RRR..YY..BBB',
        'RRR..YY..BBB',
        'RR...YY...BB',
        '............',
        '....BYYR....',
        '............',
        '.ww......ww.'
      ],
      rules: [{ id: 'paint', start: 'yellow', gates: [{ x: 8, y: 352, w: 80, color: 'red' }, { x: 140, y: 384, w: 80, color: 'yellow' }, { x: 272, y: 352, w: 80, color: 'blue' }] }]
    },
    {
      id: 50, world: 10, name: 'The Queen', twist: 'boss-queen', par: 130, clear: 'boss', boss: true,
      banner: 'Boss! The Queen hides inside her eggs. Break a way in and hit her before they hatch!',
      grid: [
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............',
        'C..........C'
      ],
      rules: [{ id: 'queen' }]
    },

    // ---------------- World 11: Topsy-turvy ----------------
    {
      id: 51, world: 11, name: 'Cannonball', twist: 'cannon', par: 125,
      banner: 'Heavy ball! It flies in arcs and falls back down. Lob it over the steel. The dotted arc shows its path.',
      grid: [
        '............',
        '............',
        '..pp....pp..',
        '..pp....pp..',
        '..##....##..',
        '............',
        '.....cc.....',
        '.....##.....',
        '............',
        '............',
        'g.g.g..g.g.g'
      ],
      rules: [{ id: 'cannon' }]
    },
    {
      id: 52, world: 11, name: 'Skyscraper', twist: 'skyscraper', par: 170,
      banner: 'This level is three screens tall! The view follows the ball. The strip on the right shows the whole tower.',
      grid: [],
      rules: [{ id: 'skyscraper', floors: {
        2: '...rrTTrr...',
        18: '###......###',
        30: '...oo..oo...',
        46: '####....####',
        56: '....y22y....',
        70: '##........##',
        78: '...g.CC.g...',
        88: '....####....',
        94: 'cc........cc'
      } }]
    },
    {
      id: 53, world: 11, name: 'By the Numbers', twist: 'numbers', par: 100,
      banner: 'Break the numbered bricks in order: 1, 2, 3... The next one glows. The others just bounce the ball.',
      grid: [
        'C..........C',
        '............',
        '...N....N...',
        '............',
        '............',
        '.N........N.',
        '............',
        '.....NN.....',
        '............',
        '..N......N..',
        '............',
        '............',
        '#....##....#'
      ],
      rules: [{ id: 'numbers', order: [[9, 2], [9, 9], [7, 5], [7, 6], [5, 1], [5, 10], [2, 3], [2, 8]] }]
    },
    {
      id: 54, world: 11, name: 'Flip', twist: 'flip', par: 130,
      banner: 'Every so often the whole level turns upside down! Sun bricks are solid the right way up, moon bricks upside down.',
      grid: [
        '............',
        '.UUUU..DDDD.',
        '.rrrr..bbbb.',
        '.UrrU..DbbD.',
        '............',
        '...DD..UU...',
        '............',
        '..gggggggg..'
      ],
      rules: [{ id: 'flip' }]
    },
    {
      id: 55, world: 11, name: 'The Architect', twist: 'boss-architect', par: 210, clear: 'boss', boss: true, final: true, noCapsules: ['laser', 'catch'],
      banner: 'Final boss! The Architect rebuilds the arena four times. All three powers are yours: Power Shot, Slow-Mo and Curveball.',
      grid: [
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............', '............', '............',
        '............', '............', '............', '............',
        'C..........C'
      ],
      rules: [{ id: 'architect' }, { id: 'powershot' }, { id: 'slowmo' }, { id: 'curve' }]
    }
  ];

  BT.WORLDS = WORLDS;
  BT.LEVELS = LEVELS;
  BT.levelById = function (id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  };
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
