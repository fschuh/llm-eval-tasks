/*
 * Track geometry.
 *
 * A track is a closed centripetal Catmull-Rom spline through a handful of control points,
 * resampled at uniform arc length. From the centerline we derive:
 *   - left/right boundary polylines, which are the collision walls,
 *   - checkpoint gates used for lap detection and race progress,
 *   - a clearance grid (distance to the nearest wall for every cell) that the AI's
 *     A* planner searches and that answers fast "which part of the track am I on" queries.
 *
 * Coordinates are world units (1 unit = 1 CSS pixel at zoom 1, roughly 10 units per metre).
 * Screen convention: +x right, +y down, so a positive heading change turns clockwise (right).
 */
(function (Racer) {
  'use strict';
  const M = Racer.M;

  const SAMPLE_SPACING = 16; // centerline resolution
  const GRID_CELL = 12; // clearance / A* grid resolution
  const GATE_SPACING = 300; // approximate distance between checkpoint gates
  const WALL_CELL = 96; // spatial hash cell size for wall segments
  const OFF_GRID = -1e4; // clearance reported for cells far outside the track

  const TRACK_DEFS = {
    classic: {
      id: 'classic',
      name: 'Harbor Circuit',
      width: 180,
      start: [2000, 2000],
      points: [
        [900, 2000], [1700, 2000], [2500, 2000], [3000, 1900], [3250, 1560],
        [3130, 1200], [2780, 1110], [2440, 1260], [2100, 1360], [1780, 1220],
        [1720, 900], [1960, 650], [2350, 610], [2680, 560], [2880, 450],
        [2930, 300], [2840, 160], [2640, 100], [1500, 150], [900, 230],
        [520, 480], [420, 900], [680, 1180], [700, 1460], [540, 1700],
        [620, 1940],
      ],
    },
  };

  // ---------------------------------------------------------------- spline helpers

  function knot(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.sqrt(Math.sqrt(dx * dx + dy * dy)); // |d|^0.5 -> centripetal parameterisation
  }

  function tl(va, vb, ta, tb, u) {
    return ((tb - u) * va + (u - ta) * vb) / (tb - ta);
  }

  /** Samples a closed centripetal Catmull-Rom spline (Barry-Goldman pyramid form). */
  function catmullRomClosed(pts, perSegment) {
    const n = pts.length;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const t0 = 0;
      const t1 = t0 + knot(p0, p1);
      const t2 = t1 + knot(p1, p2);
      const t3 = t2 + knot(p2, p3);
      for (let k = 0; k < perSegment; k++) {
        const u = t1 + (t2 - t1) * (k / perSegment);
        const out = [0, 0];
        for (let c = 0; c < 2; c++) {
          const a1 = tl(p0[c], p1[c], t0, t1, u);
          const a2 = tl(p1[c], p2[c], t1, t2, u);
          const a3 = tl(p2[c], p3[c], t2, t3, u);
          const b1 = tl(a1, a2, t0, t2, u);
          const b2 = tl(a2, a3, t1, t3, u);
          out[c] = tl(b1, b2, t1, t2, u);
        }
        xs.push(out[0]);
        ys.push(out[1]);
      }
    }
    return { xs, ys };
  }

  /** Resamples a closed polyline at (nearly) uniform arc-length spacing. */
  function resampleClosed(xs, ys, spacing) {
    const m = xs.length;
    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      cum[i + 1] = cum[i] + M.len(xs[j] - xs[i], ys[j] - ys[i]);
    }
    const total = cum[m];
    const n = Math.max(16, Math.round(total / spacing));
    const step = total / n;
    const x = new Float64Array(n), y = new Float64Array(n);
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = k * step;
      while (seg < m - 1 && cum[seg + 1] < s) seg++;
      const j = (seg + 1) % m;
      const span = cum[seg + 1] - cum[seg];
      const t = span > 0 ? (s - cum[seg]) / span : 0;
      x[k] = xs[seg] + (xs[j] - xs[seg]) * t;
      y[k] = ys[seg] + (ys[j] - ys[seg]) * t;
    }
    return { x, y, n };
  }

  /** Signed curvature (1/radius, positive = right turn) from the circle through three points. */
  function curvature3(ax, ay, bx, by, cx, cy) {
    const abx = bx - ax, aby = by - ay, acx = cx - ax, acy = cy - ay, bcx = cx - bx, bcy = cy - by;
    const cross = abx * acy - aby * acx;
    const denom = M.len(abx, aby) * M.len(acx, acy) * M.len(bcx, bcy);
    return denom > 0 ? (2 * cross) / denom : 0;
  }

  function rotateArray(arr, start) {
    const n = arr.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = arr[(i + start) % n];
    return out;
  }

  // ---------------------------------------------------------------- wall spatial index

  /** Uniform-grid bucket index over wall segments (compressed-row storage, deterministic order). */
  class WallIndex {
    constructor(walls, cellSize) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w of walls) {
        minX = Math.min(minX, w.ax, w.bx); maxX = Math.max(maxX, w.ax, w.bx);
        minY = Math.min(minY, w.ay, w.by); maxY = Math.max(maxY, w.ay, w.by);
      }
      this.cs = cellSize;
      this.ox = minX - cellSize;
      this.oy = minY - cellSize;
      this.w = Math.ceil((maxX - this.ox) / cellSize) + 2;
      this.h = Math.ceil((maxY - this.oy) / cellSize) + 2;
      this.walls = walls;
      const counts = new Int32Array(this.w * this.h + 1);
      const forEachCell = (w, fn) => {
        const x0 = Math.floor((Math.min(w.ax, w.bx) - this.ox) / cellSize);
        const x1 = Math.floor((Math.max(w.ax, w.bx) - this.ox) / cellSize);
        const y0 = Math.floor((Math.min(w.ay, w.by) - this.oy) / cellSize);
        const y1 = Math.floor((Math.max(w.ay, w.by) - this.oy) / cellSize);
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) fn(cy * this.w + cx);
      };
      for (const w of walls) forEachCell(w, (c) => counts[c + 1]++);
      for (let i = 0; i < this.w * this.h; i++) counts[i + 1] += counts[i];
      this.start = counts;
      this.items = new Int32Array(counts[this.w * this.h]);
      const fill = counts.slice(0, this.w * this.h);
      walls.forEach((w, idx) => forEachCell(w, (c) => { this.items[fill[c]++] = idx; }));
      this.stamp = new Uint32Array(walls.length);
      this.queryId = 0;
    }

    /** Collects walls whose cells overlap the AABB into `out` (each wall at most once). */
    query(minX, minY, maxX, maxY, out) {
      out.length = 0;
      const id = ++this.queryId;
      const cs = this.cs;
      const x0 = Math.max(0, Math.floor((minX - this.ox) / cs));
      const x1 = Math.min(this.w - 1, Math.floor((maxX - this.ox) / cs));
      const y0 = Math.max(0, Math.floor((minY - this.oy) / cs));
      const y1 = Math.min(this.h - 1, Math.floor((maxY - this.oy) / cs));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = cy * this.w + cx;
          for (let k = this.start[c]; k < this.start[c + 1]; k++) {
            const wi = this.items[k];
            if (this.stamp[wi] === id) continue;
            this.stamp[wi] = id;
            out.push(this.walls[wi]);
          }
        }
      }
      return out;
    }
  }

  // ---------------------------------------------------------------- track

  class Track {
    /**
     * Builds the centerline and validates it. Call build() (or use Track.create) to also
     * construct walls, gates and the clearance grid.
     */
    constructor(def) {
      this.id = def.id;
      this.name = def.name;
      this.width = def.width;
      this.halfWidth = def.width / 2;
      this.def = def;

      const spline = catmullRomClosed(def.points, 48);
      let { x, y, n } = resampleClosed(spline.xs, spline.ys, SAMPLE_SPACING);
      if (def.reverse) {
        x = x.slice().reverse();
        y = y.slice().reverse();
      }
      const start = def.start ? nearestIndex(x, y, def.start[0], def.start[1]) : pickStartIndex(x, y, n);
      this._setCenterline(rotateArray(x, start), rotateArray(y, start));
      this.validation = this._validate();
    }

    static create(def, { strict = false } = {}) {
      const track = new Track(def);
      if (strict && !track.validation.ok) return null;
      track.build();
      return track;
    }

    build() {
      this._buildWalls();
      this._buildGates();
      this._buildGrid();
      return this;
    }

    _setCenterline(x, y) {
      const n = x.length, hw = this.halfWidth;
      this.n = n;
      this.cx = x;
      this.cy = y;
      this.tx = new Float64Array(n);
      this.ty = new Float64Array(n);
      this.nx = new Float64Array(n); // right-hand normal (+y is down, so (−ty, tx))
      this.ny = new Float64Array(n);
      this.s = new Float64Array(n);
      this.segLen = new Float64Array(n);
      this.curv = new Float64Array(n);
      this.lx = new Float64Array(n);
      this.ly = new Float64Array(n);
      this.rx = new Float64Array(n);
      this.ry = new Float64Array(n);
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.s[i] = acc;
        this.segLen[i] = M.len(x[j] - x[i], y[j] - y[i]);
        acc += this.segLen[i];
      }
      this.length = acc;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = (i - 1 + n) % n, b = (i + 1) % n;
        let tx = x[b] - x[a], ty = y[b] - y[a];
        const l = M.len(tx, ty);
        tx /= l; ty /= l;
        this.tx[i] = tx; this.ty[i] = ty;
        this.nx[i] = -ty; this.ny[i] = tx;
        const a2 = (i - 2 + n) % n, b2 = (i + 2) % n;
        this.curv[i] = curvature3(x[a2], y[a2], x[i], y[i], x[b2], y[b2]);
        this.lx[i] = x[i] - this.nx[i] * hw; this.ly[i] = y[i] - this.ny[i] * hw;
        this.rx[i] = x[i] + this.nx[i] * hw; this.ry[i] = y[i] + this.ny[i] * hw;
        minX = Math.min(minX, this.lx[i], this.rx[i]); maxX = Math.max(maxX, this.lx[i], this.rx[i]);
        minY = Math.min(minY, this.ly[i], this.ry[i]); maxY = Math.max(maxY, this.ly[i], this.ry[i]);
      }
      this.bounds = { minX, minY, maxX, maxY };
    }

    /** Checks that the walls neither fold over (tight curves) nor touch another part of the track. */
    _validate() {
      const n = this.n, hw = this.halfWidth;
      let minRadius = Infinity;
      for (let i = 0; i < n; i++) {
        const k = Math.abs(this.curv[i]);
        if (k > 0) minRadius = Math.min(minRadius, 1 / k);
      }
      // Pairs further apart (along the track) than a minimum-radius hairpin must keep a grass gap.
      const localArc = M.PI * (hw + 20) + 40;
      let minGap = Infinity;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const arc = Math.min(Math.abs(this.s[j] - this.s[i]), this.length - Math.abs(this.s[j] - this.s[i]));
          if (arc <= localArc) continue;
          const d = M.len(this.cx[j] - this.cx[i], this.cy[j] - this.cy[i]) - this.width;
          if (d < minGap) minGap = d;
        }
      }
      const ok = minRadius >= hw + 20 && minGap >= 40 && this.length >= 4000;
      return { ok, minRadius, minGap, length: this.length };
    }

    _buildWalls() {
      const n = this.n, walls = [];
      for (const side of [-1, 1]) { // -1: left wall, +1: right wall
        const bx = side < 0 ? this.lx : this.rx, by = side < 0 ? this.ly : this.ry;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const dx = bx[j] - bx[i], dy = by[j] - by[i];
          const l = M.len(dx, dy);
          // Inward normal (towards the centerline).
          walls.push({ id: walls.length, side, ax: bx[i], ay: by[i], bx: bx[j], by: by[j], nx: (side * dy) / l, ny: (-side * dx) / l });
        }
      }
      this.walls = walls;
      this.wallIndex = new WallIndex(walls, WALL_CELL);
    }

    _buildGates() {
      const count = Math.max(10, Math.round(this.length / GATE_SPACING));
      const ext = this.halfWidth + 30; // reaches a little past the walls
      this.gates = [];
      for (let k = 0; k < count; k++) {
        const i = Math.round((k * this.n) / count) % this.n;
        const x = this.cx[i], y = this.cy[i], nx = this.nx[i], ny = this.ny[i];
        this.gates.push({
          k, i, s: this.s[i], x, y, tx: this.tx[i], ty: this.ty[i], nx, ny,
          ax: x - nx * ext, ay: y - ny * ext, bx: x + nx * ext, by: y + ny * ext,
        });
      }
    }

    /** Distance-to-centerline grid; clearance = halfWidth - distance (distance to nearest wall). */
    _buildGrid() {
      const cs = GRID_CELL, hw = this.halfWidth, n = this.n;
      const reach = hw + 4 * cs;
      const b = this.bounds;
      const ox = b.minX - 6 * cs, oy = b.minY - 6 * cs;
      const w = Math.ceil((b.maxX - ox + 6 * cs) / cs), h = Math.ceil((b.maxY - oy + 6 * cs) / cs);
      const dist = new Float64Array(w * h).fill(Infinity);
      const nearest = new Int32Array(w * h).fill(-1);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = this.cx[i], ay = this.cy[i], bx = this.cx[j], by = this.cy[j];
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - ox) / cs));
        const gx1 = Math.min(w - 1, Math.floor((Math.max(ax, bx) + reach - ox) / cs));
        const gy0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - oy) / cs));
        const gy1 = Math.min(h - 1, Math.floor((Math.max(ay, by) + reach - oy) / cs));
        for (let gy = gy0; gy <= gy1; gy++) {
          const py = oy + (gy + 0.5) * cs;
          for (let gx = gx0; gx <= gx1; gx++) {
            const px = ox + (gx + 0.5) * cs;
            const t = M.clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
            const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
            const d = Math.sqrt(dx * dx + dy * dy);
            const k = gy * w + gx;
            if (d < dist[k]) {
              dist[k] = d;
              nearest[k] = t < 0.5 ? i : j;
            }
          }
        }
      }
      const clear = new Float64Array(w * h);
      for (let k = 0; k < w * h; k++) clear[k] = dist[k] === Infinity ? OFF_GRID : hw - dist[k];
      this.grid = { cs, ox, oy, w, h, clear, nearest };
    }

    // ------------------------------------------------------------ queries

    wrapS(s) {
      const L = this.length;
      return s - L * Math.floor(s / L);
    }

    /** Signed shortest arc difference b - a in [-L/2, L/2). */
    deltaS(a, b) {
      const L = this.length;
      let d = this.wrapS(b - a);
      if (d >= L / 2) d -= L;
      return d;
    }

    /** Sample index whose arc position is the last one <= s. */
    indexAtS(s) {
      s = this.wrapS(s);
      let i = Math.min(this.n - 1, Math.floor((s / this.length) * this.n));
      while (i > 0 && this.s[i] > s) i--;
      while (i < this.n - 1 && this.s[i + 1] <= s) i++;
      return i;
    }

    /** Position, tangent and normal at arc length s. */
    pointAt(s, out = {}) {
      s = this.wrapS(s);
      const i = this.indexAtS(s), j = (i + 1) % this.n;
      const t = this.segLen[i] > 0 ? (s - this.s[i]) / this.segLen[i] : 0;
      out.x = M.lerp(this.cx[i], this.cx[j], t);
      out.y = M.lerp(this.cy[i], this.cy[j], t);
      let tx = M.lerp(this.tx[i], this.tx[j], t), ty = M.lerp(this.ty[i], this.ty[j], t);
      const l = M.len(tx, ty);
      tx /= l; ty /= l;
      out.tx = tx; out.ty = ty; out.nx = -ty; out.ny = tx;
      return out;
    }

    cellIndex(x, y) {
      const g = this.grid;
      const gx = Math.floor((x - g.ox) / g.cs), gy = Math.floor((y - g.oy) / g.cs);
      if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return -1;
      return gy * g.w + gx;
    }

    cellCenterX(cell) {
      const g = this.grid;
      return g.ox + ((cell % g.w) + 0.5) * g.cs;
    }

    cellCenterY(cell) {
      const g = this.grid;
      return g.oy + (Math.floor(cell / g.w) + 0.5) * g.cs;
    }

    /** Bilinearly interpolated distance to the nearest wall (negative = outside the track). */
    clearanceAt(x, y) {
      const g = this.grid;
      const fx = (x - g.ox) / g.cs - 0.5, fy = (y - g.oy) / g.cs - 0.5;
      const gx = Math.floor(fx), gy = Math.floor(fy);
      if (gx < 0 || gy < 0 || gx + 1 >= g.w || gy + 1 >= g.h) return OFF_GRID;
      const tx = fx - gx, ty = fy - gy, k = gy * g.w + gx, c = g.clear;
      const top = c[k] + (c[k + 1] - c[k]) * tx;
      const bottom = c[k + g.w] + (c[k + g.w + 1] - c[k + g.w]) * tx;
      return top + (bottom - top) * ty;
    }

    /** True if every point on the segment keeps at least minClear distance from the walls. */
    lineClear(x0, y0, x1, y1, minClear) {
      const dx = x1 - x0, dy = y1 - y0;
      const steps = Math.max(1, Math.ceil(M.len(dx, dy) / (GRID_CELL * 0.5)));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        if (this.clearanceAt(x0 + dx * t, y0 + dy * t) < minClear) return false;
      }
      return true;
    }

    /**
     * Projects a point onto the centerline. `hint` (a previous result index) keeps the search
     * local, which is both fast and immune to jumping onto a nearby, unrelated part of the track.
     * Result: i (segment start), s (arc length), lat (signed lateral offset, + = right), dist.
     */
    project(px, py, hint = -1, out = {}) {
      const n = this.n;
      let best = -1, bestD = Infinity;
      if (hint >= 0) {
        for (let k = -10; k <= 10; k++) {
          const i = (hint + k + n) % n;
          const dx = this.cx[i] - px, dy = this.cy[i] - py, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        if (bestD > 4 * this.halfWidth * this.halfWidth) best = -1; // lost it; do a full lookup
      }
      if (best < 0) {
        const cell = this.cellIndex(px, py);
        const guess = cell >= 0 ? this.grid.nearest[cell] : -1;
        bestD = Infinity;
        const from = guess >= 0 ? -4 : 0, to = guess >= 0 ? 4 : n - 1;
        for (let k = from; k <= to; k++) {
          const i = guess >= 0 ? (guess + k + n) % n : k;
          const dx = this.cx[i] - px, dy = this.cy[i] - py, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      // Refine on the two segments adjacent to the nearest sample.
      out.dist = Infinity;
      this._projectSegment((best - 1 + n) % n, px, py, out);
      this._projectSegment(best, px, py, out);
      return out;
    }

    _projectSegment(i, px, py, out) {
      const j = (i + 1) % this.n;
      const ax = this.cx[i], ay = this.cy[i];
      const vx = this.cx[j] - ax, vy = this.cy[j] - ay;
      const l2 = vx * vx + vy * vy;
      const t = M.clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
      const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < out.dist) {
        const cross = vx * (py - ay) - vy * (px - ax);
        out.i = t < 0.5 ? i : j;
        out.s = this.wrapS(this.s[i] + t * this.segLen[i]);
        out.dist = d;
        out.lat = cross >= 0 ? d : -d;
      }
    }
  }

  function nearestIndex(x, y, px, py) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = (x[i] - px) * (x[i] - px) + (y[i] - py) * (y[i] - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Start line goes near the end of the straightest stretch so the grid behind it is straight too. */
  function pickStartIndex(x, y, n) {
    const curv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n, b = (i + 2) % n;
      curv[i] = Math.abs(curvature3(x[a], y[a], x[i], y[i], x[b], y[b]));
    }
    const win = Math.max(8, Math.round(640 / SAMPLE_SPACING));
    let sum = 0;
    for (let i = 0; i < win; i++) sum += curv[i];
    let bestSum = sum, bestStart = 0;
    for (let a = 1; a < n; a++) {
      sum += curv[(a + win - 1) % n] - curv[a - 1];
      if (sum < bestSum - 1e-12) { bestSum = sum; bestStart = a; }
    }
    return (bestStart + Math.round(win * 0.72)) % n;
  }

  // ---------------------------------------------------------------- procedural tracks

  /**
   * Seeded procedural circuit: jittered points around a squashed circle (so the control polygon
   * is star-shaped and never self-intersects), rejected and re-rolled until the walls validate.
   */
  function generateProceduralDef(rng, seed) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const count = rng.int(9, 14);
      const sx = rng.range(1.2, 1.55), sy = rng.range(0.8, 1.0);
      const points = [];
      for (let i = 0; i < count; i++) {
        const ang = ((i + rng.range(-0.3, 0.3)) / count) * M.TAU;
        const r = 1100 * rng.range(0.48, 1.0);
        points.push([2000 + M.cos(ang) * r * sx, 1500 + M.sin(ang) * r * sy]);
      }
      const def = {
        id: 'procedural',
        name: 'Procedural #' + seed,
        width: 180,
        points,
        reverse: rng.chance(0.5),
      };
      const probe = new Track(def);
      if (probe.validation.ok) return def;
    }
    return null;
  }

  /** Builds the requested track; procedural layouts are derived from the RNG stream. */
  function buildTrack(trackId, rng, seed = 0) {
    if (trackId === 'procedural') {
      const def = generateProceduralDef(rng, seed);
      if (def) return Track.create(def);
    }
    return Track.create(TRACK_DEFS[trackId] || TRACK_DEFS.classic);
  }

  Racer.Track = Track;
  Racer.TRACK_DEFS = TRACK_DEFS;
  Racer.TRACK_IDS = ['classic', 'procedural'];
  Racer.buildTrack = buildTrack;
  Racer.generateProceduralDef = generateProceduralDef;
  Racer.GRID_CELL = GRID_CELL;
})(globalThis.Racer = globalThis.Racer || {});
