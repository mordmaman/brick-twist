// Synthesised sound effects (Web Audio). No audio files. Unlocked on first touch/click/key.
(function (BT) {
  'use strict';

  var A = {
    ctx: null, master: null, noise: null, muted: false, last: {},
    unlock: function () {
      try {
        if (!this.ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : 0.5;
          this.master.connect(this.ctx.destination);
          var len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
          for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          this.noise = buf;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
    },
    setMuted: function (m) {
      this.muted = !!m;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    },
    suspend: function () { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {} },

    tone: function (type, f0, f1, dur, vol, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    hiss: function (dur, vol, ftype, freq, delay, q) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise;
      f.type = ftype || 'lowpass'; f.frequency.value = freq || 1200; if (q) f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur + 0.02);
    },

    play: function (name, arg) {
      if (!this.ctx || this.muted) return;
      var now = this.ctx.currentTime;
      if (this.last[name] && now - this.last[name] < 0.03) return; // no machine-gun stacking
      this.last[name] = now;
      try { this.synth(name, arg); } catch (e) { /* audio is optional */ }
    },

    synth: function (name, arg) {
      var semis, f;
      switch (name) {
        case 'paddle': this.tone('square', 330 + (arg || 0) * 60, 300, 0.07, 0.18); break;
        case 'wall': this.tone('sine', 700, 650, 0.03, 0.06); break;
        case 'break':
          semis = Math.min(arg || 0, 15);
          f = 440 * Math.pow(2, semis / 12);
          this.tone('triangle', f, f * 1.02, 0.09, 0.22);
          this.tone('square', f * 2, f * 2, 0.03, 0.05);
          break;
        case 'armour': this.tone('square', 260, 240, 0.06, 0.14); this.hiss(0.05, 0.08, 'highpass', 2500); break;
        case 'steel': this.tone('sine', 980, 960, 0.12, 0.10); this.tone('sine', 1470, 1450, 0.08, 0.06); break;
        case 'locked': this.tone('sine', 620, 600, 0.12, 0.10); this.tone('square', 310, 300, 0.05, 0.05); break;
        case 'boom': this.hiss(0.45, 0.5, 'lowpass', 900); this.tone('sine', 120, 40, 0.4, 0.4); break;
        case 'powerup': this.tone('square', 523, 523, 0.07, 0.12); this.tone('square', 659, 659, 0.07, 0.12, 0.07); this.tone('square', 784, 784, 0.1, 0.12, 0.14); break;
        case 'powerdown': this.tone('square', 392, 392, 0.08, 0.12); this.tone('square', 311, 311, 0.08, 0.12, 0.08); this.tone('square', 233, 233, 0.12, 0.12, 0.16); break;
        case 'launch': this.tone('triangle', 300, 700, 0.12, 0.15); break;
        case 'laser': this.tone('sawtooth', 1400, 300, 0.1, 0.08); break;
        case 'lose': this.tone('triangle', 440, 110, 0.55, 0.25); break;
        case 'gameover': this.tone('triangle', 330, 82, 1.1, 0.25); this.tone('square', 165, 60, 1.0, 0.06); break;
        case 'win':
          [523, 659, 784, 1047].forEach(function (n, i) { this.tone('square', n, n, 0.16, 0.12, i * 0.11); this.tone('triangle', n / 2, n / 2, 0.2, 0.12, i * 0.11); }, this);
          break;
        case 'lastbrick': this.tone('sine', 1568, 1568, 0.9, 0.18); this.tone('sine', 2093, 2093, 0.9, 0.1, 0.05); break;
        case 'unlock': this.tone('sine', 880, 880, 0.12, 0.18); this.tone('sine', 1320, 1320, 0.25, 0.18, 0.1); break;
        case 'net': this.tone('sine', 300, 1200, 0.25, 0.2); break;
        case 'shove': this.tone('square', 110, 220, 0.18, 0.18); break;
        case 'portal': this.tone('sine', 300, 1100, 0.18, 0.18); this.tone('sine', 1100, 300, 0.18, 0.08, 0.05); break;
        case 'bumper': this.tone('sine', arg ? 700 : 450, arg ? 1100 : 600, 0.09, 0.18); break;
        case 'gate': this.tone('square', 900, 900, 0.03, 0.06); break;
        case 'windwarn': this.hiss(0.9, 0.06, 'bandpass', 700, 0, 2); break;
        case 'wind': this.hiss(1.4, 0.16, 'bandpass', 500, 0, 1); break;
        case 'spit': this.tone('square', 160, 90, 0.12, 0.14); break;
        case 'daze': this.tone('triangle', 500, 200, 0.3, 0.2); this.tone('triangle', 520, 210, 0.3, 0.1, 0.02); break;
        case 'bosshit': this.tone('square', 180, 120, 0.15, 0.22); this.hiss(0.12, 0.2, 'lowpass', 1500); break;
        case 'bossdown': this.hiss(0.9, 0.5, 'lowpass', 700); this.tone('sine', 90, 30, 0.9, 0.4);
          [784, 988, 1175, 1568].forEach(function (n, i) { this.tone('square', n, n, 0.14, 0.1, 0.3 + i * 0.09); }, this);
          break;
        case 'flip': this.tone('sawtooth', 200, 900, 0.2, 0.1); break;
      }
    }
  };

  BT.Audio = A;
})(typeof window !== 'undefined' ? (window.BT = window.BT || {}) : (globalThis.BT = globalThis.BT || {}));
