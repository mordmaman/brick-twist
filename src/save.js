// Save data: one versioned JSON key in localStorage. Every access is wrapped in try/catch;
// if storage is missing or throws (private mode, sandboxed iframe) the game keeps working in memory.
(function (BT) {
  'use strict';

  var C = BT.CONFIG;

  function defaults() {
    return { v: C.saveVersion, progress: {}, difficulty: 'normal', muted: false, seen: {} };
  }

  // Bring older save shapes up to date. Never throws; unknown data falls back to defaults.
  //   v1: { version: 1, stars: { "<levelId>": n }, best: { "<levelId>": score }, diff: 'normal', sound: true }
  //   v2: { v: 2, progress: { "<levelId>": { stars, best, cleared } }, difficulty, muted, seen }
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
    markSeen: function (key) { if (!this.data.seen[key]) { this.data.seen[key] = true; this.write(); } },
    setDifficulty: function (d) { if (C.presets[d]) { this.data.difficulty = d; this.write(); } },
    setMuted: function (m) { this.data.muted = !!m; this.write(); },
    migrate: migrate,
    defaults: defaults
  };

  BT.Save = Save;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
