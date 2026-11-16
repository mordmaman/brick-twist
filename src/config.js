// Brick Twist - all tunable numbers live here.
// Units: logical pixels (playfield is 360 x 640), seconds, px/s, px/s^2.
(function (BT) {
  'use strict';

  var CONFIG = {
    W: 360,
    H: 640,
    TOP: 44,              // top wall (HUD sits above it)
    physicsHz: 120,       // fixed physics step rate
    maxFrameDt: 0.1,      // clamp on a long frame (tab switch etc.)

    grid: { cols: 12, cellW: 30, cellH: 16, top: 64, brickW: 28, brickH: 14 },

    ball: {
      radius: 6,
      maxAngleDeg: 65,        // off vertical at the paddle edge
      englishPerSpeed: 0.012, // degrees of extra angle per px/s of paddle movement
      englishMaxDeg: 10,
      minVyFrac: 0.26,        // |vy| >= speed * this (~15 deg off horizontal) so no sideways loops
      speedUpEvery: 8,        // paddle hits between speed-ups
      speedUpStep: 10,        // px/s per speed-up
      stuckSeconds: 12,       // no brick hit for this long -> nudge the angle
      nudgeMinDeg: 12,
      nudgeMaxDeg: 22,
      absMaxSpeed: 900,       // hard cap for any ball, including bumper boosts
      boostDecay: 1.6,        // per second, bumper boost decays back to 1
      maxBalls: 9,
      launchSpreadDeg: 8,
      catchHoldSeconds: 3,    // Catch capsule auto-release
      trailLength: 10
    },

    paddle: {
      y: 586,
      h: 12,
      maxSpeed: 4200,         // px/s cap on how fast the paddle chases the finger (effectively direct)
      touchSensitivity: 1.25, // paddle px per finger px (relative drag)
      keySpeed: 540,
      keyAccel: 5200,
      widthLerp: 10,          // how fast width changes animate
      squashTime: 0.12,
      edgeMargin: 0           // paddle may touch the walls
    },

    net: { y: 624 },          // Easy safety net

    capsule: {
      w: 32, h: 14,
      fallSpeed: 115,
      chance: 0.12,           // per normal brick, scaled by preset and level
      maxOnScreen: 3,
      weights: { long: 5, slow: 4, multi: 5, 'catch': 3, laser: 3, bomb: 3, life: 1, shrink: 3, flip: 2 },
      bad: ['shrink', 'flip'],
      durations: { long: 15, slow: 12, 'catch': 15, laser: 10, shrink: 10, flip: 5 },
      longMult: 1.5,
      shrinkMult: 0.65,
      slowMult: 0.7,
      flipEnabled: true       // family can switch the Flip capsule off here
    },

    laser: { cooldown: 0.22, speed: 720, autoFireOnEasy: true, autoInterval: 0.45 },
    bomb: { radius: 50 },
    tnt: { radius: 42, chainDelay: 0.07 },

    combo: { maxMult: 8, pitchMaxSteps: 15 },

    score: { brick: 10, armourExtra: 10, bossHit: 50, bumper: 5 },

    slowmo: { scale: 0.25, duration: 0.9 },     // last brick
    shake: { tnt: 5, boss: 7, life: 4, decay: 18 },
    winDelay: 1.0,            // real seconds after the slow-mo before the results card

    presets: {
      easy: {
        label: 'Easy', lives: 5, paddleW: 100, speedStart: 230, speedMax: 340,
        net: true, badCapsules: false, capsuleMult: 1.4, forceScale: 0.65,
        hazardScale: 0.6, bossHpScale: 0.6, parScale: 1.3,
        blurb: 'Big paddle, slow ball, safety net'
      },
      normal: {
        label: 'Normal', lives: 3, paddleW: 76, speedStart: 290, speedMax: 470,
        net: false, badCapsules: true, capsuleMult: 1, forceScale: 1,
        hazardScale: 1, bossHpScale: 1, parScale: 1,
        blurb: 'The proper game'
      },
      hard: {
        label: 'Hard', lives: 2, paddleW: 62, speedStart: 340, speedMax: 570,
        net: false, badCapsules: true, capsuleMult: 0.8, forceScale: 1.25,
        hazardScale: 1.3, bossHpScale: 1.3, parScale: 0.85,
        blurb: 'Fast ball, small paddle'
      }
    },

    // Twist (rule) defaults. Level data can override any of these per level.
    rules: {
      conveyor: { speed: 40 },
      squeeze: { speed: 3.2, shove: 44, grace: 3, dangerGap: 56, resetOnLife: 150, shoveCooldown: 0.25 },
      orbit: { coreHp: 4 },
      pendulum: {},
      portals: { radius: 17, captureFrac: 0.65 },
      wells: { accelAt60: 820, minDist: 22, planetRadius: 12, predictSeconds: 1.0, predictAimSeconds: 1.4 },
      gusts: { accel: 560, calmMin: 3.2, calmMax: 5, warn: 1.3, gust: 1.6, firstDelay: 3.5 },
      pinball: { bumperRadius: 14, boost: 1.35 },
      // World 4
      lightsout: {
        dark: 0.93, darkEasy: 0.84,      // how black the dark is (alpha), Normal/Hard and Easy
        ballLight: 84, paddleLight: 96, capsuleLight: 34, glowLight: 30,
        lanternLight: 125, lanternTime: 8, // glow bricks leave a lantern this big for this long (s)
        flashLight: 46, flashTime: 0.45,  // brief light where any brick breaks
        easyLightMult: 1.3, outline: 0.2, // faint outline on every brick still standing
        coreLight: 46                     // a core (the target) always glows a little
      },
      redblue: { swapCooldown: 0.5, autoSwap: 3, idleSwap: 0 }, // autoSwap: seconds with nothing solid left to hit before colours swap by themselves; idleSwap (0 = off): swap anyway after this long without a switch hit
      beat: { period: 3.4, warn: 0.6 },   // seconds for a full cycle (each group solid half of it); warning before a brick turns solid
      overgrown: { growEvery: 5, sproutTime: 1.4, extraPerRoot: 7, maxRow: 13, ballMargin: 12, witherEvery: 0.06 },
      // World 5
      double: { gap: 30, widthMult: 1.3, assist: 24, assistRate: 6 },
      wrap: {},
      brickfall: {
        every: 5.5, telegraph: 1.8, fallSpeed: 62, settleSpeed: 170, pieces: 12, grace: 2,
        floorRow: 20, overflowRow: 2, clearRowsOnLife: 6, ballMargin: 3
      },
      bounces: { count: 12, failDelay: 0.7 },
      // World 7
      ice: {
        follow: 9, grip: 6,               // paddle chases the finger at follow/s; grip/s: how fast its slide changes (lower = slippier)
        followEasy: 11, gripEasy: 14,     // Easy: a much milder slide
        bounce: 0.35                      // share of its speed the paddle keeps when it slides into a wall
      },
      tide: {
        low: 612, high: 352, period: 20,  // water surface y at low and high tide; seconds for a full rise and fall
        ballMul: 0.62, ease: 7,           // ball speed under water; how quickly it slows down / speeds up (1/s)
        paddleCap: 520, paddleCapEasy: 760 // paddle top speed (px/s) under water
      },
      redhot: { hotAt: 3, hotAtEasy: 2, burns: 3 }, // bricks hit without touching the paddle to glow; bricks it then burns through
      thunder: {
        first: 4, calmMin: 4.5, calmMax: 7, telegraph: 1.7, telegraphEasy: 2.4, width: 36,
        freeze: 0.85, freezeEasy: 0.45,   // seconds a struck paddle is frozen (Hard scales up a little)
        thawNearEasy: 190,                // Easy: a frozen paddle thaws at once when a falling ball gets this close
        aimAtPaddle: 0.3                  // chance a strike is aimed at the paddle (never on Easy)
      },
      // World 8
      runaway: {
        radius: 58, speed: 78, stamina: 6, staminaEasy: 3.5, // how close the ball gets before a brick runs, how fast, for how long (s)
        tiredWhenLeft: 3, giveUpAfter: 25, maxY: 372         // last few tire twice as fast; all give up after this long with no catch
      },
      bigsmall: { bigR: 12, bigSpeed: 0.78, bigPierce: 3, smallR: 4.2, smallSpeed: 1.22, split: 3, splitCooldown: 0.3 },
      walls: { speed: 2.2, maxIn: 62, shove: 34, grace: 3, shoveCooldown: 0.4, reliefOnLife: 40, gap: 30 },
      mirrors: { len: 36, lenEasy: 46, thick: 4, maxChain: 6, flipClear: 6 }
    },

    bosses: {
      gatekeeper: { eyeHp: 3, sway: 52, period: 6, spitEvery: 3.4, spitTell: 0.7, spitSpeed: 150, dazeSeconds: 3, dazeMult: 0.7 },
      serpent: { segments: 14, headHp: 5, vulnerableAt: 2, speedMin: 55, speedMax: 150, spacing: 20, size: 18, turnRate: 0.9 },
      magnet: { hp: 8, pull: 3.4, warn: 0.7, repel: 3.0, pullAccel: 900, repelAccel: 380, flingRadius: 150, flingBoost: 1.3, bodyRadius: 26 },
      lighthouse: { hp: 10, bodyRadius: 20, beams: 2, beamHalfDeg: 30, spin: 0.5, spinPerHit: 0.04, beamLength: 420, invuln: 0.8 },
      rival: {
        coreHp: 5, paddleW: 66, y: 204, speed: 150, accel: 1100, react: 0.18, aimErr: 22, sight: 150,
        cheekyAim: 14, dizzy: 2.6, tauntChance: 0.35
      },
      twins: {
        hp: 4, revive: 9, reviveEasy: 13, swapEvery: 6.5, warn: 1.2, bodyRadius: 20,
        ringRadius: 44, ringSpin: 0.7, bob: 10, reviveHpFrac: 0.5
      },
      stormcloud: {
        hp: 7, bodyRadius: 34, drift: 70, idle: 4.2, charge: 1.3, open: 3.6, // seconds: raining, charging (tell), vulnerable after the flash
        dropEvery: 1.1, dropSpeed: 95, shrinkTime: 4, shrinkTimeEasy: 2.2, freeze: 0.7, freezeEasy: 0.35, boltWidth: 40
      },
      machine: {
        hp: [3, 3, 4], coreRadius: 17, transition: 2.4, // core hits per phase (Normal), seconds between phases
        sway: 50, swayPeriod: 7
      }
    },

    // Endless mode (see endless.js). Values given as [a, b] go from a in round 1 to b once the ramp is done.
    endless: {
      unlockAll: false,         // testing: Endless open from the start, with every world's twists in the pool
      unlockAfterLevel: 5,      // Endless opens once this level (the end of World 1) is cleared
      threeFrom: 8,             // from this round on a round has three twists instead of two
      lifeEvery: 3,             // an extra life every this many rounds cleared
      maxLives: 9,
      ramp: 16,                 // rounds over which layouts go from gentle to their hardest
      rows: [5, 9],             // brick rows in the layout
      density: [0.62, 0.9],     // share of a pattern's cells that get a brick
      armour: [0.06, 0.38],     // share of bricks with armour
      armour3From: 9,           // from this round some armour takes three hits
      steel: [0, 3],            // steel shelves (pairs)
      heat: [3.5, 8],           // how nasty the twist mix may be (each twist has a heat of 1 to 3)
      speedStartStep: 5, speedMaxStep: 8, speedRounds: 14, // ball start / top speed rise per round (px/s), for this many rounds
      hazardStep: 0.02, hazardRounds: 15,                   // twist hazards get a little stronger each round
      capsuleChance: [0.16, 0.1],
      layoutWeight: 0.35,       // how often Fuse / Lock and Key are drawn compared with a rule twist
      cardSeconds: 2.6          // the "Round N" card goes by itself after this long (or on a tap)
    },

    touch: { tapMaxMs: 280, tapMaxMove: 14 },

    saveKey: 'brick-twist-save',
    saveVersion: 2
  };

  BT.CONFIG = CONFIG;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
