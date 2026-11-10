/*
 * track.js — procedural closed-circuit track.
 *
 * Pipeline (all driven by the seeded RNG):
 *   random control points around a centre  ->  centripetal Catmull–Rom spline
 *   -> uniform arc-length resampling -> light Laplacian smoothing -> validation
 *
 * A candidate is rejected (and the next one drawn from the same RNG stream)
 * if its corners are too tight, two far-apart parts of the circuit come too
 * close to each other, or the lap is too short / too long. That keeps every seed
 * drivable while remaining 100% deterministic.
 *
 * The finished Track exposes the centreline as flat typed arrays plus:
 *   nearest(x, y, hint, window, out)  windowed closest-point query (O(window))
 *   pointAt(s, lateralOffset, out)    arc-length parametrisation
 *   gates                              full-width checkpoint lines for lap detection
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});
  const { CONFIG, RNG } = R;
  const TAU = Math.PI * 2;

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  // ---------------------------------------------------------------- geometry

  /** Closed centripetal Catmull–Rom spline through `ctrl` ([[x,y],...]). */
  function catmullRomClosed(ctrl, perSeg) {
    const n = ctrl.length;
    const xs = [];
    const ys = [];
    const d = (a, b) => Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1])); // alpha = 0.5
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i + n - 1) % n];
      const p1 = ctrl[i];
      const p2 = ctrl[(i + 1) % n];
      const p3 = ctrl[(i + 2) % n];
      const t0 = 0;
      const t1 = t0 + Math.max(d(p0, p1), 1e-4);
      const t2 = t1 + Math.max(d(p1, p2), 1e-4);
      const t3 = t2 + Math.max(d(p2, p3), 1e-4);
      for (let k = 0; k < perSeg; k++) {
        const t = t1 + ((t2 - t1) * k) / perSeg;
        const mix = (a, b, ta, tb) => {
          const w = (t - ta) / (tb - ta);
          return [a[0] * (1 - w) + b[0] * w, a[1] * (1 - w) + b[1] * w];
        };
        const A1 = mix(p0, p1, t0, t1);
        const A2 = mix(p1, p2, t1, t2);
        const A3 = mix(p2, p3, t2, t3);
        const B1 = mix(A1, A2, t0, t2);
        const B2 = mix(A2, A3, t1, t3);
        const C = mix(B1, B2, t1, t2);
        xs.push(C[0]);
        ys.push(C[1]);
      }
    }
    return { xs, ys };
  }

  /** Resample a closed polyline to `count` points evenly spaced by arc length. */
  function resampleClosed(xs, ys, count) {
    const n = xs.length;
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      cum[i + 1] = cum[i] + Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
    }
    const total = cum[n];
    const ox = new Float64Array(count);
    const oy = new Float64Array(count);
    let seg = 0;
    for (let k = 0; k < count; k++) {
      const target = (k / count) * total;
      while (seg < n - 1 && cum[seg + 1] < target) seg++;
      const j = (seg + 1) % n;
      const len = cum[seg + 1] - cum[seg];
      const t = len > 0 ? (target - cum[seg]) / len : 0;
      ox[k] = xs[seg] + (xs[j] - xs[seg]) * t;
      oy[k] = ys[seg] + (ys[j] - ys[seg]) * t;
    }
    return { xs: ox, ys: oy, length: total };
  }

  function smoothClosed(xs, ys, iterations, lambda) {
    const n = xs.length;
    let ax = Float64Array.from(xs);
    let ay = Float64Array.from(ys);
    let bx = new Float64Array(n);
    let by = new Float64Array(n);
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < n; i++) {
        const p = (i + n - 1) % n;
        const q = (i + 1) % n;
        bx[i] = ax[i] + lambda * 0.5 * (ax[p] + ax[q] - 2 * ax[i]);
        by[i] = ay[i] + lambda * 0.5 * (ay[p] + ay[q] - 2 * ay[i]);
      }
      [ax, bx] = [bx, ax];
      [ay, by] = [by, ay];
    }
    return { xs: ax, ys: ay };
  }

  /** Random star-shaped control polygon -> smooth, evenly sampled closed curve. */
  function buildCandidate(rng, cfg) {
    const N = rng.int(12, 20);
    const base = rng.range(cfg.radiusMin, cfg.radiusMax);
    const stretch = rng.range(1.25, 1.7);
    const raw = [];
    // Radii alternate between "lobes" and "bays" with random strength, which is what
    // produces hairpins, S-bends and long straights between them.
    for (let i = 0; i < N; i++) raw.push(rng.range(0.38, 1.0));
    const ctrl = [];
    for (let i = 0; i < N; i++) {
      const a = ((i + rng.range(-0.35, 0.35)) / N) * TAU;
      const r = base * (0.78 * raw[i] + 0.11 * (raw[(i + 1) % N] + raw[(i + N - 1) % N]));
      ctrl.push([Math.cos(a) * r * stretch, Math.sin(a) * r]);
    }
    return finishCurve(ctrl, cfg);
  }

  /** Deterministic, always-valid fallback used only if every candidate is rejected. */
  function buildFallback(cfg) {
    const N = 12;
    const ctrl = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const r = 1250 * (1 + 0.15 * Math.cos(3 * a)); // three gentle lobes
      ctrl.push([Math.cos(a) * r * 1.6, Math.sin(a) * r]);
    }
    return finishCurve(ctrl, cfg);
  }

  function finishCurve(ctrl, cfg) {
    const dense = catmullRomClosed(ctrl, 32);
    let cur = resampleClosed(dense.xs, dense.ys, 2000);
    const count = Math.max(64, Math.round(cur.length / cfg.spacing));
    cur = resampleClosed(cur.xs, cur.ys, count);
    const sm = smoothClosed(cur.xs, cur.ys, 14, 0.5);
    const out = resampleClosed(sm.xs, sm.ys, count);
    return { xs: out.xs, ys: out.ys };
  }

  // ------------------------------------------------------------------- Track

  class Track {
    /**
     * @param {Float64Array} xs  centreline x (closed loop, uniform-ish spacing)
     * @param {Float64Array} ys  centreline y
     * @param {object} [cfg]     CONFIG.TRACK overrides
     */
    constructor(xs, ys, cfg) {
      cfg = cfg || CONFIG.TRACK;
      this.cfg = cfg;
      this.halfWidth = cfg.width / 2;
      this.wallHalf = this.halfWidth + cfg.runoff; // barrier distance from the centreline
      this._setGeometry(xs, ys);
      this._rotateToStraight();
      this._buildGates();
      this.attempts = 1;
    }

    _setGeometry(xs, ys) {
      const n = xs.length;
      this.n = n;
      this.px = Float64Array.from(xs);
      this.py = Float64Array.from(ys);
      this.tx = new Float64Array(n);
      this.ty = new Float64Array(n);
      this.nx = new Float64Array(n);
      this.ny = new Float64Array(n);
      this.curv = new Float64Array(n); // signed curvature, + turns towards +normal
      let length = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        length += Math.hypot(this.px[j] - this.px[i], this.py[j] - this.py[i]);
      }
      this.length = length;
      this.ds = length / n;
      const heading = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const p = (i + n - 1) % n;
        const q = (i + 1) % n;
        const dx = this.px[q] - this.px[p];
        const dy = this.py[q] - this.py[p];
        const len = Math.hypot(dx, dy) || 1;
        this.tx[i] = dx / len;
        this.ty[i] = dy / len;
        this.nx[i] = -this.ty[i];
        this.ny[i] = this.tx[i];
        heading[i] = Math.atan2(dy, dx);
      }
      for (let i = 0; i < n; i++) {
        const p = (i + n - 1) % n;
        const q = (i + 1) % n;
        const arc =
          Math.hypot(this.px[i] - this.px[p], this.py[i] - this.py[p]) +
          Math.hypot(this.px[q] - this.px[i], this.py[q] - this.py[i]);
        this.curv[i] = wrapAngle(heading[q] - heading[p]) / (arc || 1);
      }
      this._computeBounds();
    }

    _computeBounds() {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < this.n; i++) {
        if (this.px[i] < minX) minX = this.px[i];
        if (this.px[i] > maxX) maxX = this.px[i];
        if (this.py[i] < minY) minY = this.py[i];
        if (this.py[i] > maxY) maxY = this.py[i];
      }
      const m = this.wallHalf + 40;
      this.bounds = { minX: minX - m, minY: minY - m, maxX: maxX + m, maxY: maxY + m };
    }

    /** Start the lap in the middle of the straightest stretch, so the grid is on a straight. */
    _rotateToStraight() {
      const n = this.n;
      const back = Math.round(260 / this.ds);
      const fwd = Math.round(160 / this.ds);
      let best = Infinity;
      let bi = 0;
      for (let i = 0; i < n; i++) {
        let worst = 0;
        for (let k = -back; k <= fwd; k += 2) {
          const c = Math.abs(this.curv[(i + k + n * 4) % n]);
          if (c > worst) worst = c;
        }
        if (worst < best - 1e-12) {
          best = worst;
          bi = i;
        }
      }
      const xs = new Float64Array(n);
      const ys = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        xs[i] = this.px[(i + bi) % n];
        ys[i] = this.py[(i + bi) % n];
      }
      this._setGeometry(xs, ys);
    }

    _buildGates() {
      const G = CONFIG.GATES;
      this.gates = [];
      for (let k = 0; k < G; k++) {
        const i = Math.round((k * this.n) / G) % this.n;
        this.gates.push({
          index: k,
          x: this.px[i],
          y: this.py[i],
          tx: this.tx[i],
          ty: this.ty[i],
          nx: this.nx[i],
          ny: this.ny[i],
          s: i * this.ds,
          halfExtent: this.wallHalf + 12,
        });
      }
    }

    // ------------------------------------------------------------- queries

    /**
     * Closest point on the centreline, searching only samples hint±win (cars move a
     * fraction of a sample per tick, so this is O(1) and, unlike a global search,
     * can't snap to a different strand of the circuit at a hairpin).
     * Fills `out` and returns it:
     *   i,t  segment index and fraction     s     arc length position [0, length)
     *   cx,cy closest centreline point      dist  |distance| to the centreline
     *   d    signed lateral offset (+ = towards the +normal side)
     */
    nearest(x, y, hint, win, out) {
      const n = this.n;
      const px = this.px;
      const py = this.py;
      let best = Infinity;
      let bi = 0;
      let bt = 0;
      let bcross = 0;
      for (let k = hint - win; k <= hint + win; k++) {
        const i = ((k % n) + n) % n;
        const j = i + 1 === n ? 0 : i + 1;
        const ax = px[i];
        const ay = py[i];
        const ex = px[j] - ax;
        const ey = py[j] - ay;
        const len2 = ex * ex + ey * ey;
        let t = ((x - ax) * ex + (y - ay) * ey) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (ax + ex * t);
        const dy = y - (ay + ey * t);
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          bi = i;
          bt = t;
          bcross = ex * (y - ay) - ey * (x - ax);
        }
      }
      const j = bi + 1 === n ? 0 : bi + 1;
      out.i = bi;
      out.t = bt;
      out.cx = px[bi] + (px[j] - px[bi]) * bt;
      out.cy = py[bi] + (py[j] - py[bi]) * bt;
      out.dist = Math.sqrt(best);
      out.d = bcross >= 0 ? out.dist : -out.dist;
      out.s = (bi + bt) * this.ds;
      return out;
    }

    /** Global closest-point search (init / recovery only). */
    locate(x, y, out) {
      return this.nearest(x, y, 0, (this.n >> 1) + 1, out);
    }

    /** Point at arc length s (wraps), displaced `off` along the +normal. */
    pointAt(s, off, out) {
      const n = this.n;
      let u = s / this.ds;
      u -= Math.floor(u / n) * n;
      const i = Math.floor(u) % n;
      const t = u - Math.floor(u);
      const j = (i + 1) % n;
      let tx = this.tx[i] * (1 - t) + this.tx[j] * t;
      let ty = this.ty[i] * (1 - t) + this.ty[j] * t;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      out.x = this.px[i] * (1 - t) + this.px[j] * t - ty * off;
      out.y = this.py[i] * (1 - t) + this.py[j] * t + tx * off;
      out.tx = tx;
      out.ty = ty;
      out.angle = Math.atan2(ty, tx);
      out.index = i;
      return out;
    }

    /**
     * Did the segment (x0,y0)->(x1,y1) cross gate `g`?
     * +1 forward, -1 backward, 0 no. `frac` (0..1) is how far along the move it happened.
     * Half-open comparison so a point exactly on the line is counted exactly once.
     */
    gateCrossing(g, x0, y0, x1, y1, outFrac) {
      const s0 = (x0 - g.x) * g.tx + (y0 - g.y) * g.ty;
      const s1 = (x1 - g.x) * g.tx + (y1 - g.y) * g.ty;
      let dir = 0;
      if (s0 < 0 && s1 >= 0) dir = 1;
      else if (s0 >= 0 && s1 < 0) dir = -1;
      else return 0;
      const frac = s0 / (s0 - s1);
      const mx = x0 + (x1 - x0) * frac;
      const my = y0 + (y1 - y0) * frac;
      const lat = (mx - g.x) * g.nx + (my - g.y) * g.ny;
      if (Math.abs(lat) > g.halfExtent) return 0;
      if (outFrac) outFrac.frac = frac;
      return dir;
    }

    // ----------------------------------------------------------- validation

    /** Returns { ok, reason, minRadius, length, minSep } */
    validate() {
      const c = this.cfg;
      let maxK = 0;
      for (let i = 0; i < this.n; i++) maxK = Math.max(maxK, Math.abs(this.curv[i]));
      const minRadius = maxK > 0 ? 1 / maxK : Infinity;
      const res = { ok: true, reason: '', minRadius, length: this.length, minSep: Infinity };
      if (this.length < c.minLength || this.length > c.maxLength) {
        res.ok = false;
        res.reason = 'length';
        return res;
      }
      if (minRadius < c.minRadius) {
        res.ok = false;
        res.reason = 'radius';
        return res;
      }
      // Strands of the circuit that are far apart along the lap must not come close in space.
      const n = this.n;
      const minArcSamples = Math.ceil(c.sepArc / this.ds);
      const stride = 2;
      let minSep = Infinity;
      for (let i = 0; i < n; i += stride) {
        for (let j = i + minArcSamples; j < n; j += stride) {
          const arc = Math.min(j - i, n - (j - i));
          if (arc < minArcSamples) continue;
          const dx = this.px[i] - this.px[j];
          const dy = this.py[i] - this.py[j];
          const d2 = dx * dx + dy * dy;
          if (d2 < minSep) minSep = d2;
        }
      }
      res.minSep = Math.sqrt(minSep);
      if (res.minSep < c.sepDist) {
        res.ok = false;
        res.reason = 'separation';
      }
      return res;
    }

    /** FNV-1a over the centreline bits — used by tests to prove determinism. */
    hash() {
      const f = new Float64Array(1);
      const u = new Uint32Array(f.buffer);
      let h = 0x811c9dc5;
      for (let i = 0; i < this.n; i++) {
        for (const v of [this.px[i], this.py[i]]) {
          f[0] = v;
          h = Math.imul(h ^ u[0], 0x01000193);
          h = Math.imul(h ^ u[1], 0x01000193);
        }
      }
      return h >>> 0;
    }

    /**
     * Seeded track generation. `seed` may be anything RNG.parseSeed accepts.
     * Always returns a valid track (falls back to a fixed shape in the astronomically
     * unlikely case that every candidate is rejected).
     */
    static generate(seed, cfg) {
      cfg = cfg || CONFIG.TRACK;
      const rng = new RNG(seed).fork('track');
      const stats = { rejected: { length: 0, radius: 0, separation: 0 } };
      for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        const cand = buildCandidate(rng, cfg);
        let xs = cand.xs;
        let ys = cand.ys;
        if (rng.chance(0.5)) {
          // Drive the other way round (also mirrors the corner sequence).
          xs = Float64Array.from(xs).reverse();
          ys = Float64Array.from(ys).reverse();
        }
        const track = new Track(xs, ys, cfg);
        const v = track.validate();
        if (v.ok) {
          track.attempts = attempt;
          track.rejected = stats.rejected;
          track.validation = v;
          return track;
        }
        stats.rejected[v.reason]++;
      }
      const fb = buildFallback(cfg);
      const track = new Track(fb.xs, fb.ys, cfg);
      track.attempts = cfg.maxAttempts + 1;
      track.rejected = stats.rejected;
      track.validation = track.validate();
      track.fallback = true;
      return track;
    }
  }

  R.Track = Track;
  R.wrapAngle = wrapAngle;
})();
