// Save data: one versioned JSON key in localStorage. Every access is wrapped in try/catch;
// if storage is missing or throws (private mode, sandboxed iframe) the game keeps working in memory.
(function (BT) {
  'use strict';

  var C = BT.CONFIG;

  function defaults() {
    return { v: C.saveVersion, progress: {}, difficulty: 'normal', muted: false, seen: {}, endless: {} };
  }

  // Endless bests, one entry per difficulty: { round, score }. Unknown or broken entries are dropped.
  function cleanEndless(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (var k in C.presets) {
      var e = raw[k];
      if (!e || typeof e !== 'object') continue;
      var round = Math.max(0, Math.floor(+e.round || 0)), score = Math.max(0, Math.floor(+e.score || 0));
      if (round || score) out[k] = { round: round, score: score };
    }
    return out;
  }

  // Bring older save shapes up to date. Never throws; unknown data falls back to defaults.
  //   v1: { version: 1, stars: { "<levelId>": n }, best: { "<levelId>": score }, diff: 'normal', sound: true }
  //   v2: { v: 2, progress: { "<levelId>": { stars, best, cleared } }, difficulty, muted, seen }
  //       phase 4 adds endless: { "<preset>": { round, score } } (an optional field, so no version bump:
  //       older v2 saves load as they are, with no Endless bests yet)
  function migrate(raw) {
    var d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    var ver = raw.v || raw.version || 1;
    if (ver === 1) {
      var stars = raw.stars || {}, best = raw.best || {};
      for (var id in stars) {
        var n = +stars[id] || 0;
        d.progress[id] = { stars: Math.max(0, Math.min(3, n)), best: +best[id] || 0, cleared: n > 0 };
      }
      if (raw.diff && C.presets[raw.diff]) d.difficulty = raw.diff;
      if (raw.sound === false) d.muted = true;
      return d;
    }
    // v2 or newer: copy known fields defensively
    if (raw.progress && typeof raw.progress === 'object') {
      for (var k in raw.progress) {
        var p = raw.progress[k] || {};
        d.progress[k] = { stars: Math.max(0, Math.min(3, +p.stars || 0)), best: +p.best || 0, cleared: !!p.cleared };
      }
    }
    if (raw.difficulty && C.presets[raw.difficulty]) d.difficulty = raw.difficulty;
    d.muted = !!raw.muted;
    if (raw.seen && typeof raw.seen === 'object') for (var s in raw.seen) d.seen[s] = !!raw.seen[s];
    d.endless = cleanEndless(raw.endless);
    return d;
  }

  var Save = {
    data: defaults(),
    storage: null,
    ok: false,

    init: function (storage) {
      this.storage = storage === undefined ? Save.findStorage() : storage;
      this.data = this.load();
      return this.data;
    },
    findStorage: function () {
      try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
    },
    load: function () {
      var raw = null;
      try {
        if (this.storage) {
          var s = this.storage.getItem(C.saveKey);
          if (s) raw = JSON.parse(s);
        }
        this.ok = !!this.storage;
      } catch (e) { this.ok = false; raw = null; }
      return migrate(raw);
    },
    write: function () {
      try {
        if (this.storage) { this.storage.setItem(C.saveKey, JSON.stringify(this.data)); this.ok = true; }
      } catch (e) { this.ok = false; }
    },
    levelInfo: function (id) {
      return this.data.progress[id] || { stars: 0, best: 0, cleared: false };
    },
    record: function (id, stars, score) {
      var cur = this.levelInfo(id);
      this.data.progress[id] = { stars: Math.max(cur.stars, stars), best: Math.max(cur.best, score), cleared: true };
      this.write();
    },
    isUnlocked: function (id) {
      if (id <= 1) return true;
      return !!this.levelInfo(id - 1).cleared;
    },
    totalStars: function () {
      var n = 0;
      for (var k in this.data.progress) n += this.data.progress[k].stars || 0;
      return n;
    },
    // Endless: best round reached and best score, per difficulty. Returns which of them are new bests.
    endlessBest: function (preset) {
      var e = this.data.endless && this.data.endless[preset];
      return { round: e ? e.round : 0, score: e ? e.score : 0 };
    },
    recordEndless: function (preset, round, score) {
      if (!C.presets[preset]) return { round: false, score: false };
      var cur = this.endlessBest(preset), res = { round: round > cur.round, score: score > cur.score };
      if (!res.round && !res.score) return res;
      if (!this.data.endless) this.data.endless = {};
      this.data.endless[preset] = { round: Math.max(cur.round, round | 0), score: Math.max(cur.score, score | 0) };
      this.write();
      return res;
    },
    markSeen: function (key) { if (!this.data.seen[key]) { this.data.seen[key] = true; this.write(); } },
    setDifficulty: function (d) { if (C.presets[d]) { this.data.difficulty = d; this.write(); } },
    setMuted: function (m) { this.data.muted = !!m; this.write(); },
    migrate: migrate,
    defaults: defaults
  };

  BT.Save = Save;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
