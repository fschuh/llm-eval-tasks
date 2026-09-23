/*
 * Seeded pseudo-random numbers (sfc32, seeded through splitmix32).
 *
 * Every consumer asks for a *named* sub-stream via rng.derive('name'). A derived stream
 * depends only on the root seed and the name, never on how many numbers other systems
 * have already drawn, so adding a new random consumer can't perturb existing ones.
 */
(function (Racer) {
  'use strict';

  /** FNV-1a 32-bit string hash. */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** murmur3 finalizer: good avalanche for 32-bit integers. */
  function mix32(x) {
    x >>>= 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  }

  class RNG {
    constructor(seed) {
      this.seed = seed >>> 0;
      let s = this.seed;
      const splitmix = () => {
        s = (s + 0x9e3779b9) >>> 0;
        return mix32(s);
      };
      this.a = splitmix();
      this.b = splitmix();
      this.c = splitmix();
      this.d = splitmix();
      for (let i = 0; i < 15; i++) this.nextU32();
    }

    nextU32() {
      let a = this.a, b = this.b, c = this.c, d = this.d;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      this.a = a; this.b = b; this.c = c; this.d = d;
      return t >>> 0;
    }

    /** Uniform float in [0, 1). */
    float() {
      return this.nextU32() / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.float();
    }

    /** Uniform integer in [min, max] (inclusive). */
    int(min, max) {
      return min + Math.floor(this.float() * (max - min + 1));
    }

    chance(p) {
      return this.float() < p;
    }

    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    }

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    /** Independent named stream derived from this generator's seed. */
    derive(label) {
      return new RNG(mix32(this.seed ^ hashString(label)));
    }
  }

  /** Accepts a number or any string ("42", "banana") and returns a uint32 seed. */
  function parseSeed(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
    const str = String(value == null ? '' : value).trim();
    if (/^\d+$/.test(str)) return Number(str) >>> 0;
    return hashString(str);
  }

  Racer.RNG = RNG;
  Racer.hashString = hashString;
  Racer.mix32 = mix32;
  Racer.parseSeed = parseSeed;
})(globalThis.Racer = globalThis.Racer || {});
