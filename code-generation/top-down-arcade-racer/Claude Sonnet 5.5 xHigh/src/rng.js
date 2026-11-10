/*
 * rng.js — deterministic pseudo random numbers.
 *
 * The whole simulation draws randomness from this module and nowhere else:
 * Math.random() and Date.now() are never used by the sim, so a given seed (plus
 * the same player input) always reproduces the same track, grid, AI personalities
 * and race.
 *
 * Generator: mulberry32 (32-bit state, passes PractRand to reasonable size, tiny).
 * Independent sub-streams are derived with fork(name) so that adding a random
 * call to one subsystem (say, decor) never changes another (say, the track).
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});

  // FNV-1a, 32 bit.
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Accepts numbers ("42"), or arbitrary strings ("hello" -> hashed).
  function parseSeed(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
    const s = String(value).trim();
    if (/^-?\d+$/.test(s)) return Number(s) >>> 0;
    return hashString(s);
  }

  class RNG {
    constructor(seed) {
      this.seed = parseSeed(seed);
      this.state = this.seed;
    }

    /** Uniform float in [0, 1). */
    next() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Uniform float in [a, b). */
    range(a, b) {
      return a + (b - a) * this.next();
    }

    /** Uniform integer in [a, b] (inclusive). */
    int(a, b) {
      return a + Math.floor(this.next() * (b - a + 1));
    }

    chance(p) {
      return this.next() < p;
    }

    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }

    /** Fisher–Yates; returns a new array. */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    }

    /** Standard normal (Box–Muller). */
    normal() {
      const u1 = Math.max(this.next(), 1e-12);
      const u2 = this.next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    /**
     * Independent stream derived from the *root seed* and a label. It does not
     * depend on how many numbers this generator has already produced.
     */
    fork(label) {
      return new RNG(hashString(this.seed + ':' + label));
    }
  }

  R.RNG = RNG;
  R.hashString = hashString;
  R.parseSeed = parseSeed;
})();
