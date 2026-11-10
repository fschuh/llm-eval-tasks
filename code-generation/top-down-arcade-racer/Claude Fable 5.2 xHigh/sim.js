/*
 * sim.js — deterministic simulation core for the top-down racing prototype.
 *
 * No DOM, no timers, no Math.random: the whole race is a pure function of
 * (seed, per-tick input bits). It runs unchanged in the browser (global
 * `RacerSim`) and in Node (`require('./sim.js')`), which is how test.js
 * verifies determinism headlessly.
 *
 * Units: metres, seconds, radians. Screen convention: +x right, +y down, so a
 * positive angle / positive steer is a clockwise (right-hand) turn.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RacerSim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────────── constants ─────────────────────────────

  const TICK_RATE = 120;              // fixed simulation rate (Hz)
  const DT = 1 / TICK_RATE;           // fixed timestep (s)
  const COUNTDOWN_TICKS = 3 * TICK_RATE;
  const DEFAULT_SEED = 1337;
  const DEFAULT_LAPS = 3;
  const TAU = Math.PI * 2;

  // Input bit flags (one byte per tick — also the replay format).
  const IN_UP = 1, IN_DOWN = 2, IN_LEFT = 4, IN_RIGHT = 8;

  const CAR = Object.freeze({
    halfLen: 2.15, halfWid: 0.98, wheelBase: 2.7,
    mass: 1, inertia: 2.4,                 // unit mass; inertia tuned for arcade spin
    engineAccel: 11.5,                     // m/s² at full throttle
    brakeDecel: 26, reverseAccel: 8, maxReverse: 10,
    dragLin: 0.035, dragQuad: 0.004,       // → top speed ≈ 49 m/s on tarmac
    coastDecel: 1.6,                       // engine braking when off the throttle
    grassDrag: 0.5,                        // extra linear drag with all wheels on grass
    grassPower: 0.65,                      // traction multiplier on grass
    grip: 17,                              // max lateral tyre accel on tarmac (m/s²)
    grassGrip: 0.55,                       // grip multiplier on grass
    slideSpeed: 3.2, slideGrip: 0.84,      // once sliding, tyres give a bit less
    maxSteer: 0.58,                        // full lock at low speed (rad)
    steerLimit: 1.1,                       // steering may ask 10% more than grip → mild drift
    steerRate: 4.5, steerReturn: 9,        // steering smoothing (1/s)
    yawResponse: 14,                       // how fast yaw rate follows the front wheels (1/s)
    restitution: 0.3, friction: 0.25,      // car ↔ car
    wallRestitution: 0.25, wallFriction: 0.2,
  });

  // Top speed where engine force balances drag: a = dragLin·v + dragQuad·v².
  const TOP_SPEED = (-CAR.dragLin + Math.sqrt(CAR.dragLin * CAR.dragLin + 4 * CAR.dragQuad * CAR.engineAccel)) / (2 * CAR.dragQuad);

  // Track layout: control polygon of a closed uniform cubic B-spline (metres).
  const TRACK_DEF = Object.freeze({
    roadHalf: 6.5,        // half width of the tarmac
    wallHalf: 10.5,       // distance from the centre line to the barriers
    start: [172, 236],    // start/finish line is placed at the closest point to this
    points: [
      [84, 236], [130, 236], [180, 236], [230, 236], [280, 236], [318, 236],   // main straight (→ east)
      [350, 234], [368, 214], [368, 184],                                // T1
      [374, 150], [350, 120], [374, 90], [362, 58],                      // esses
      [342, 34], [308, 28],                                              // T2
      [270, 28], [240, 28],                                              // back straight (→ west)
      [208, 30], [190, 48], [190, 82],                                   // T3
      [190, 112],
      [190, 128], [183, 145], [166, 152], [149, 145], [142, 128],        // hairpin
      [142, 104], [142, 84],
      [140, 56], [122, 36], [96, 30],                                    // T5
      [70, 30],
      [44, 34], [26, 54], [22, 84],                                      // T6
      [20, 112], [44, 144], [20, 176],                                   // chicane
      [20, 200], [28, 224], [52, 236],                                   // T7
    ],
  });

  const DRIVER_NAMES = ['YOU', 'NOVA', 'BLITZ', 'REX'];
  const CAR_COLORS = ['#e23b3b', '#3d8bff', '#ffb62e', '#35c46a'];

  // ───────────────────────────── helpers ─────────────────────────────

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  // ───────────────────────────── seeded RNG ─────────────────────────────

  function mix32(a) {
    a |= 0;
    a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
    a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
    return (a ^ (a >>> 16)) >>> 0;
  }

  /** mulberry32. `stream` derives independent sequences from one seed. */
  class RNG {
    constructor(seed, stream) {
      this.state = mix32((seed >>> 0) + Math.imul((stream | 0) + 1, 0x9e3779b9));
    }
    next() {
      let t = (this.state = (this.state + 0x6d2b79f5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(lo, hi) { return lo + (hi - lo) * this.next(); }
    int(n) { return Math.floor(this.next() * n); }
  }

  // ───────────────────────────── track ─────────────────────────────

  const LOCATE_WINDOW = 10;    // ± samples searched around a hint index
  const GATE_COUNT = 8;        // ordered checkpoints (gate 0 = start/finish)

  class Track {
    constructor(def) {
      this.roadHalf = def.roadHalf;
      this.wallHalf = def.wallHalf;
      this.grassFrom = def.roadHalf + 0.9;   // kerbs still count as tarmac

      // 1) densely evaluate the closed cubic B-spline
      const cp = def.points, m = cp.length, SUB = 24;
      const dx = [], dy = [];
      for (let i = 0; i < m; i++) {
        const p0 = cp[(i + m - 1) % m], p1 = cp[i], p2 = cp[(i + 1) % m], p3 = cp[(i + 2) % m];
        for (let k = 0; k < SUB; k++) {
          const t = k / SUB, t2 = t * t, t3 = t2 * t;
          const b0 = (1 - 3 * t + 3 * t2 - t3) / 6;
          const b1 = (3 * t3 - 6 * t2 + 4) / 6;
          const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
          const b3 = t3 / 6;
          dx.push(b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0]);
          dy.push(b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]);
        }
      }
      // rotate so the polyline starts at the start/finish line
      const dn = dx.length;
      let s0 = 0, bestD = Infinity;
      for (let i = 0; i < dn; i++) {
        const ex = dx[i] - def.start[0], ey = dy[i] - def.start[1];
        const d = ex * ex + ey * ey;
        if (d < bestD) { bestD = d; s0 = i; }
      }
      const cum = new Float64Array(dn + 1);
      for (let i = 0; i < dn; i++) {
        const a = (s0 + i) % dn, b = (s0 + i + 1) % dn;
        cum[i + 1] = cum[i] + Math.sqrt((dx[b] - dx[a]) * (dx[b] - dx[a]) + (dy[b] - dy[a]) * (dy[b] - dy[a]));
      }
      const total = cum[dn];

      // 2) resample at uniform arc length (n is a multiple of 16 for the
      //    multi-resolution racing-line solver)
      const n = Math.round(total / 2 / 16) * 16;
      const ds = total / n;
      this.n = n; this.ds = ds; this.length = total;
      const px = this.px = new Float64Array(n), py = this.py = new Float64Array(n);
      let seg = 0;
      for (let i = 0; i < n; i++) {
        const s = i * ds;
        while (seg < dn - 1 && cum[seg + 1] < s) seg++;
        const u = (s - cum[seg]) / (cum[seg + 1] - cum[seg]);
        const a = (s0 + seg) % dn, b = (s0 + seg + 1) % dn;
        px[i] = lerp(dx[a], dx[b], u);
        py[i] = lerp(dy[a], dy[b], u);
      }

      // 3) frames + curvature
      const tx = this.tx = new Float64Array(n), ty = this.ty = new Float64Array(n);
      const nx = this.nx = new Float64Array(n), ny = this.ny = new Float64Array(n);
      const curv = this.curv = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n;
        let ex = px[b] - px[a], ey = py[b] - py[a];
        const l = Math.sqrt(ex * ex + ey * ey);
        ex /= l; ey /= l;
        tx[i] = ex; ty[i] = ey;
        nx[i] = -ey; ny[i] = ex;       // +lateral = right-hand side of travel on screen
      }
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n;
        const cross = tx[a] * ty[b] - ty[a] * tx[b], dot = tx[a] * tx[b] + ty[a] * ty[b];
        curv[i] = Math.atan2(cross, dot) / (2 * ds);
      }

      // 4) bounds, gates, racing line
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
        if (py[i] < minY) minY = py[i]; if (py[i] > maxY) maxY = py[i];
      }
      this.bounds = { minX, minY, maxX, maxY };

      this.gates = [];
      for (let g = 0; g < GATE_COUNT; g++) {
        const i = Math.round(g * n / GATE_COUNT) % n;
        this.gates.push({ index: i, x: px[i], y: py[i], tx: tx[i], ty: ty[i], nx: nx[i], ny: ny[i] });
      }

      this.lineOff = buildRacingLine(this, 1.7);
    }

    /**
     * Closest point on the centre line. `hint` is a nearby sample index
     * (pass -1 for a full scan). Result goes into `out` to avoid allocation:
     * i, u (segment + fraction), s (arc length), lat (signed offset),
     * dist (|offset|), qx/qy (closest point).
     */
    locate(x, y, hint, out) {
      const n = this.n, px = this.px, py = this.py;
      let from = hint - LOCATE_WINDOW, to = hint + LOCATE_WINDOW;
      if (hint < 0) { from = 0; to = n - 1; }
      let best = Infinity, bi = 0, bu = 0, bqx = 0, bqy = 0;
      for (let k = from; k <= to; k++) {
        const i = ((k % n) + n) % n, j = i + 1 === n ? 0 : i + 1;
        const ax = px[i], ay = py[i], bx = px[j] - ax, by = py[j] - ay;
        let u = ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by);
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const qx = ax + bx * u, qy = ay + by * u;
        const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (d2 < best) { best = d2; bi = i; bu = u; bqx = qx; bqy = qy; }
      }
      const j = bi + 1 === n ? 0 : bi + 1;
      const lnx = lerp(this.nx[bi], this.nx[j], bu), lny = lerp(this.ny[bi], this.ny[j], bu);
      out.i = bi; out.u = bu; out.s = (bi + bu) * this.ds;
      out.qx = bqx; out.qy = bqy;
      out.dist = Math.sqrt(best);
      out.lat = (x - bqx) * lnx + (y - bqy) * lny;
      return out;
    }

    /** World position at arc length s with lateral offset. */
    pointAt(s, lat, out) {
      const n = this.n;
      let f = s / this.ds;
      f = ((f % n) + n) % n;
      const i = Math.floor(f) % n, j = i + 1 === n ? 0 : i + 1, u = f - Math.floor(f);
      const nx = lerp(this.nx[i], this.nx[j], u), ny = lerp(this.ny[i], this.ny[j], u);
      out.x = lerp(this.px[i], this.px[j], u) + nx * lat;
      out.y = lerp(this.py[i], this.py[j], u) + ny * lat;
      out.angle = Math.atan2(lerp(this.ty[i], this.ty[j], u), lerp(this.tx[i], this.tx[j], u));
      return out;
    }
  }

  /**
   * Racing line as a lateral offset per centre-line sample.
   *
   * Minimises bending energy Σ|L[i-1] − 2L[i] + L[i+1]|² (plus a little path
   * length) subject to staying `margin` inside the tarmac, using projected
   * Gauss-Seidel on a coarse-to-fine hierarchy. The result is the familiar
   * outside → apex → outside line.
   */
  function buildRacingLine(track, margin) {
    const n = track.n, px = track.px, py = track.py, nx = track.nx, ny = track.ny;
    const lim = track.roadHalf - margin;
    const off = new Float64Array(n);
    const lx = Float64Array.from(px), ly = Float64Array.from(py);
    const SHORTEN = 0.0006;   // membrane weight at the finest level
    for (let step = 16; step >= 1; step >>= 1) {
      const lambda = SHORTEN * step * step;
      const iters = step === 1 ? 250 : 500;
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i += step) {
          const a2 = (i - 2 * step + 2 * n) % n, a1 = (i - step + n) % n;
          const b1 = (i + step) % n, b2 = (i + 2 * step) % n;
          const bendX = (-lx[a2] + 4 * lx[a1] + 4 * lx[b1] - lx[b2]) / 6;
          const bendY = (-ly[a2] + 4 * ly[a1] + 4 * ly[b1] - ly[b2]) / 6;
          const midX = (lx[a1] + lx[b1]) / 2, midY = (ly[a1] + ly[b1]) / 2;
          const gx = (6 * bendX + 2 * lambda * midX) / (6 + 2 * lambda);
          const gy = (6 * bendY + 2 * lambda * midY) / (6 + 2 * lambda);
          const o = clamp((gx - px[i]) * nx[i] + (gy - py[i]) * ny[i], -lim, lim);
          off[i] = o;
          lx[i] = px[i] + nx[i] * o;
          ly[i] = py[i] + ny[i] * o;
        }
      }
      // prolong to the next finer level
      if (step > 1) {
        const h = step >> 1;
        for (let i = h; i < n; i += step) {
          const o = (off[i - h] + off[(i + h) % n]) / 2;
          off[i] = o;
          lx[i] = px[i] + nx[i] * o;
          ly[i] = py[i] + ny[i] * o;
        }
      }
    }
    return off;
  }

  /**
   * Target speed per sample for a line given by lateral offsets: corner speed
   * from curvature (v² = a_lat / κ), then a backwards pass so the car starts
   * braking early enough for what is coming.
   */
  function buildSpeedProfile(track, off, aLat, aBrake, vTop) {
    const n = track.n;
    const lx = new Float64Array(n), ly = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      lx[i] = track.px[i] + track.nx[i] * off[i];
      ly[i] = track.py[i] + track.ny[i] * off[i];
    }
    const v = new Float64Array(n), curv = new Float64Array(n);
    const SPAN = 3;
    for (let i = 0; i < n; i++) {
      const a = (i - SPAN + n) % n, b = (i + SPAN) % n;
      // Menger curvature through three points of the line
      const abx = lx[i] - lx[a], aby = ly[i] - ly[a];
      const bcx = lx[b] - lx[i], bcy = ly[b] - ly[i];
      const acx = lx[b] - lx[a], acy = ly[b] - ly[a];
      const area2 = abx * bcy - aby * bcx;
      const den = Math.sqrt((abx * abx + aby * aby) * (bcx * bcx + bcy * bcy) * (acx * acx + acy * acy));
      curv[i] = den > 1e-9 ? 2 * area2 / den : 0;
    }
    for (let i = 0; i < n; i++) {
      // light smoothing so a single noisy sample cannot cause a brake stab
      const k = (Math.abs(curv[(i - 1 + n) % n]) + 2 * Math.abs(curv[i]) + Math.abs(curv[(i + 1) % n])) / 4;
      v[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(k, 1e-4)));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        const segLen = Math.sqrt((lx[j] - lx[i]) * (lx[j] - lx[i]) + (ly[j] - ly[i]) * (ly[j] - ly[i]));
        const lim = Math.sqrt(v[j] * v[j] + 2 * aBrake * segLen);
        if (v[i] > lim) v[i] = lim;
      }
    }
    return { speed: v, curv, lx, ly };
  }

  // ───────────────────────────── car physics ─────────────────────────────

  function makeCar(id) {
    return {
      id, name: DRIVER_NAMES[id], color: CAR_COLORS[id], isPlayer: id === 0,
      // rigid body
      x: 0, y: 0, angle: 0, vx: 0, vy: 0, angVel: 0,
      prevX: 0, prevY: 0, prevAngle: 0,          // previous tick (render interpolation, gates)
      // controls: in* are commands, steer is the smoothed wheel position
      inThrottle: 0, inBrake: 0, inSteer: 0, steer: 0,
      // derived each tick
      vf: 0, vl: 0, speed: 0, grass: 0, skid: 0, braking: false,
      // track relation
      idx: 0, s: 0, lat: 0, dist: 0, wrongWay: 0,
      // race bookkeeping
      lap: 0, nextGate: 0, lapStart: 0, lastLap: 0, bestLap: 0, lapTimes: [],
      finished: false, finishTime: 0, finishPlace: 0, place: id + 1,
      driver: null,
    };
  }

  /** Largest useful steering angle at a given speed (keeps lateral accel near the grip limit). */
  function maxSteerAt(v) {
    if (v < 1) return CAR.maxSteer;
    const a = Math.atan(CAR.steerLimit * CAR.grip * CAR.wheelBase / (v * v));
    return a < CAR.maxSteer ? a : CAR.maxSteer;
  }

  function integrateCar(c, dt) {
    c.prevX = c.x; c.prevY = c.y; c.prevAngle = c.angle;

    // steering wheel follows the command at a finite rate (faster back to centre)
    const want = c.inSteer;
    const rate = (Math.abs(want) < Math.abs(c.steer) || want * c.steer < 0) ? CAR.steerReturn : CAR.steerRate;
    c.steer += clamp(want - c.steer, -rate * dt, rate * dt);

    const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
    let vf = c.vx * cs + c.vy * sn;        // forward speed
    let vl = -c.vx * sn + c.vy * cs;       // sideways (slip) speed
    const g = c.grass;

    // longitudinal: engine, brake / reverse, drag
    let acc = 0;
    const power = 1 - (1 - CAR.grassPower) * g;
    if (c.inThrottle > 0) acc += c.inThrottle * CAR.engineAccel * power;
    if (c.inBrake > 0) {
      if (vf > 0.4) acc -= c.inBrake * CAR.brakeDecel * power;
      else if (vf > -CAR.maxReverse) acc -= c.inBrake * CAR.reverseAccel * power;
    }
    acc -= vf * (CAR.dragLin + CAR.grassDrag * g) + CAR.dragQuad * vf * Math.abs(vf);
    vf += acc * dt;
    if (c.inThrottle === 0 && c.inBrake === 0) {          // coasting: engine braking, then rest
      const eb = CAR.coastDecel * dt;
      vf = Math.abs(vf) <= eb ? 0 : vf - (vf > 0 ? eb : -eb);
    }
    c.braking = c.inBrake > 0 && vf > 0.4;

    // lateral: tyres cancel sideways speed, but only up to the available grip
    let grip = CAR.grip * (1 - (1 - CAR.grassGrip) * g);
    if (Math.abs(vl) > CAR.slideSpeed) grip *= CAR.slideGrip;
    vl += clamp(-vl, -grip * dt, grip * dt);
    c.skid = clamp((Math.abs(vl) - 1.4) / 4, 0, 1);

    // yaw: kinematic bicycle target, approached at a finite rate so collision
    // spin (angVel impulses) blends back into steering control
    const yawTarget = vf / CAR.wheelBase * Math.tan(c.steer * maxSteerAt(Math.abs(vf)));
    const follow = 1 - Math.exp(-CAR.yawResponse * (1 - 0.4 * g) * dt);
    c.angVel += (yawTarget - c.angVel) * follow;

    c.vx = vf * cs - vl * sn;
    c.vy = vf * sn + vl * cs;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.angle = wrapAngle(c.angle + c.angVel * dt);
    c.vf = vf; c.vl = vl;
  }

  // ───────────────────────────── collisions ─────────────────────────────

  const _ca = new Float64Array(8), _cb = new Float64Array(8);

  function cornersOf(c, out) {
    const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
    const fx = cs * CAR.halfLen, fy = sn * CAR.halfLen;
    const rx = -sn * CAR.halfWid, ry = cs * CAR.halfWid;
    out[0] = c.x + fx + rx; out[1] = c.y + fy + ry;    // front right
    out[2] = c.x + fx - rx; out[3] = c.y + fy - ry;    // front left
    out[4] = c.x - fx - rx; out[5] = c.y - fy - ry;    // rear left
    out[6] = c.x - fx + rx; out[7] = c.y - fy + ry;    // rear right
    return out;
  }

  function pointInCar(c, x, y, cs, sn) {
    const dx = x - c.x, dy = y - c.y;
    return Math.abs(dx * cs + dy * sn) <= CAR.halfLen + 0.02 && Math.abs(-dx * sn + dy * cs) <= CAR.halfWid + 0.02;
  }

  const BROAD_R2 = 4 * (CAR.halfLen * CAR.halfLen + CAR.halfWid * CAR.halfWid);
  const BOUNCE_MIN = 1;        // closing speed (m/s) below which contacts are fully inelastic

  /**
   * Car ↔ car: oriented-box SAT for the contact normal and depth, then a
   * single impulse (normal + Coulomb friction) at the contact point, with
   * angular terms, followed by positional de-penetration.
   */
  function collideCars(a, b, events) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy > BROAD_R2) return;
    const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
    const cb = Math.cos(b.angle), sb = Math.sin(b.angle);

    let depth = Infinity, nx = 0, ny = 0;
    for (let k = 0; k < 4; k++) {
      const ax = k === 0 ? ca : k === 1 ? -sa : k === 2 ? cb : -sb;
      const ay = k === 0 ? sa : k === 1 ? ca : k === 2 ? sb : cb;
      const ra = CAR.halfLen * Math.abs(ca * ax + sa * ay) + CAR.halfWid * Math.abs(-sa * ax + ca * ay);
      const rb = CAR.halfLen * Math.abs(cb * ax + sb * ay) + CAR.halfWid * Math.abs(-sb * ax + cb * ay);
      const d = dx * ax + dy * ay;
      const overlap = ra + rb - Math.abs(d);
      if (overlap <= 0) return;                       // separating axis found
      if (overlap < depth) { depth = overlap; const sg = d < 0 ? -1 : 1; nx = ax * sg; ny = ay * sg; }
    }

    // contact point: mean of the corners of each box that lie inside the other
    cornersOf(a, _ca); cornersOf(b, _cb);
    let px = 0, py = 0, cnt = 0;
    for (let k = 0; k < 8; k += 2) {
      if (pointInCar(b, _ca[k], _ca[k + 1], cb, sb)) { px += _ca[k]; py += _ca[k + 1]; cnt++; }
      if (pointInCar(a, _cb[k], _cb[k + 1], ca, sa)) { px += _cb[k]; py += _cb[k + 1]; cnt++; }
    }
    if (cnt > 0) { px /= cnt; py /= cnt; } else { px = (a.x + b.x) / 2; py = (a.y + b.y) / 2; }

    const rax = px - a.x, ray = py - a.y, rbx = px - b.x, rby = py - b.y;
    const invM = 2 / CAR.mass, invI = 1 / CAR.inertia;
    let rvx = (b.vx - b.angVel * rby) - (a.vx - a.angVel * ray);
    let rvy = (b.vy + b.angVel * rbx) - (a.vy + a.angVel * rax);
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const raN = rax * ny - ray * nx, rbN = rbx * ny - rby * nx;
      const e = vn < -BOUNCE_MIN ? CAR.restitution : 0;          // no bounce in resting / pushing contact
      const jn = -(1 + e) * vn / (invM + (raN * raN + rbN * rbN) * invI);
      a.vx -= jn * nx / CAR.mass; a.vy -= jn * ny / CAR.mass; a.angVel -= raN * jn * invI;
      b.vx += jn * nx / CAR.mass; b.vy += jn * ny / CAR.mass; b.angVel += rbN * jn * invI;

      // friction along the contact tangent, limited by μ·jn
      const tx = -ny, ty = nx;
      rvx = (b.vx - b.angVel * rby) - (a.vx - a.angVel * ray);
      rvy = (b.vy + b.angVel * rbx) - (a.vy + a.angVel * rax);
      const vt = rvx * tx + rvy * ty;
      const raT = rax * ty - ray * tx, rbT = rbx * ty - rby * tx;
      const jt = clamp(-vt / (invM + (raT * raT + rbT * rbT) * invI), -CAR.friction * jn, CAR.friction * jn);
      a.vx -= jt * tx / CAR.mass; a.vy -= jt * ty / CAR.mass; a.angVel -= raT * jt * invI;
      b.vx += jt * tx / CAR.mass; b.vy += jt * ty / CAR.mass; b.angVel += rbT * jt * invI;

      if (jn > 0.6) events.push({ type: 'hit', x: px, y: py, power: jn, a: a.id, b: b.id });
    }

    // push the boxes apart (equal masses → half each)
    const push = Math.max(depth - 0.01, 0) * 0.5;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
  }

  const _loc = { i: 0, u: 0, s: 0, lat: 0, dist: 0, qx: 0, qy: 0 };

  /**
   * Barriers + surface. Each body corner is tested against the wall offset
   * curve; a penetrating corner receives an impulse there (the wall has
   * infinite mass), which naturally rotates the car parallel to the barrier.
   * Also counts corners on grass for the surface model.
   */
  function resolveWalls(c, track, events) {
    let onGrass = 0;
    const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
    for (let k = 0; k < 4; k++) {
      const sf = k < 2 ? 1 : -1, sr = (k === 0 || k === 3) ? 1 : -1;
      const rx = cs * CAR.halfLen * sf - sn * CAR.halfWid * sr;
      const ry = sn * CAR.halfLen * sf + cs * CAR.halfWid * sr;
      const wx = c.x + rx, wy = c.y + ry;
      track.locate(wx, wy, c.idx, _loc);
      if (_loc.dist > track.grassFrom) onGrass++;
      const pen = _loc.dist - track.wallHalf;
      if (pen <= 0) continue;

      const nx = (_loc.qx - wx) / _loc.dist, ny = (_loc.qy - wy) / _loc.dist;   // towards the track
      const invI = 1 / CAR.inertia;
      let vpx = c.vx - c.angVel * ry, vpy = c.vy + c.angVel * rx;
      const vn = vpx * nx + vpy * ny;
      if (vn < 0) {
        const rN = rx * ny - ry * nx;
        const e = vn < -BOUNCE_MIN ? CAR.wallRestitution : 0;
        const jn = -(1 + e) * vn / (1 / CAR.mass + rN * rN * invI);
        c.vx += jn * nx / CAR.mass; c.vy += jn * ny / CAR.mass; c.angVel += rN * jn * invI;

        const tx = -ny, ty = nx;
        vpx = c.vx - c.angVel * ry; vpy = c.vy + c.angVel * rx;
        const vt = vpx * tx + vpy * ty;
        const rT = rx * ty - ry * tx;
        const jt = clamp(-vt / (1 / CAR.mass + rT * rT * invI), -CAR.wallFriction * jn, CAR.wallFriction * jn);
        c.vx += jt * tx / CAR.mass; c.vy += jt * ty / CAR.mass; c.angVel += rT * jt * invI;

        if (jn > 0.6) events.push({ type: 'wall', x: wx, y: wy, power: jn, a: c.id, b: -1 });
      }
      c.x += nx * pen; c.y += ny * pen;
    }
    c.grass = onGrass / 4;
  }

  // ───────────────────────────── AI driver ─────────────────────────────

  const _tp = { x: 0, y: 0, angle: 0 };
  const LANES = 13;            // lateral candidates evaluated for overtaking / avoidance

  /**
   * Waypoint-following driver. Waypoints are the samples of a racing line
   * (centre line + per-sample lateral offset). Steering is pure pursuit on a
   * speed-dependent look-ahead point; speed follows a curvature-based profile
   * with a braking pass. On top: overtaking/avoidance offsets, mild rubber
   * banding against the player, and reverse-out-of-trouble recovery.
   */
  class Driver {
    constructor(race, car, cfg) {
      const track = race.track, n = track.n;
      this.race = race; this.car = car; this.cfg = cfg;
      this.lim = track.roadHalf - 1.35;
      const lineLim = track.roadHalf - 1.7;
      this.off = new Float64Array(n);
      for (let i = 0; i < n; i++) this.off[i] = clamp(track.lineOff[i] * cfg.lineBlend + cfg.bias, -lineLim, lineLim);
      const prof = buildSpeedProfile(track, this.off, CAR.grip * cfg.latUse, cfg.brakeUse, TOP_SPEED * cfg.topUse);
      this.speed = prof.speed;
      // lateral deviation from the line (m); starts as "stay in my grid lane"
      this.avoid = car.lat - clamp(this.off[car.idx], -this.lim, this.lim);
      this.others = [0, 1, 2].map(() => ({ lat: 0, beside: false, urgency: 0 }));
      this.stuck = 0;             // ticks spent nearly stationary
      this.reverse = 0;           // ticks left in a reversing manoeuvre
      this.reverseSteer = 0;
      this.pace = 1;
      this.lastTick = -2;
      this.targetX = car.x; this.targetY = car.y;
    }

    update() {
      const car = this.car, race = this.race, track = race.track, cfg = this.cfg;
      const n = track.n, ds = track.ds, len = track.length;
      const raceTick = race.tick - COUNTDOWN_TICKS;
      const others = this.others, lim = this.lim, here = car.lat;
      const lineHere = clamp(this.off[car.idx], -lim, lim);
      // (re)taking the wheel — at the start, or when the player's car is handed
      // over after the flag: begin from wherever the car actually is
      if (race.tick !== this.lastTick + 1) this.avoid = clamp(here, -lim, lim) - lineHere;
      this.lastTick = race.tick;
      if (raceTick < cfg.reaction) { car.inThrottle = 0; car.inBrake = 0; car.inSteer = 0; return; }

      const v = car.speed;

      // ── traffic: choose the cheapest free "lane" and, if boxed in, a speed cap ──
      // Candidate lateral positions across the track are scored by distance
      // from the racing line, distance from the current plan (hysteresis) and
      // by the cars that occupy or guard them.
      let speedCap = Infinity, m = 0;
      for (let k = 0; k < race.cars.length; k++) {
        const o = race.cars[k];
        if (o === car) continue;
        let gap = o.s - car.s;                          // + = other is ahead along the track
        if (gap > len / 2) gap -= len; else if (gap < -len / 2) gap += len;
        const closing = v - o.speed;
        const horizon = clamp(10 + closing * 2.2, 12, 80);
        if (gap <= -5.5 || gap >= horizon) continue;
        const beside = gap < 4.7 && Math.abs(o.lat - here) > 1.7;   // overlapping lengthwise, in another lane
        if (!beside && closing < -1.5 && gap > 6) continue;         // pulling away from me
        const e = others[m++];
        e.lat = o.lat; e.beside = beside;
        e.urgency = beside ? 1 : clamp(1 - (gap - 4.7) / (horizon - 4.7), 0.15, 1);
        // directly ahead and overlapping → never close faster than I can brake
        if (gap > 0 && Math.abs(o.lat - here) < 2.2) {
          const cap = gap < 5.8 ? Math.max(o.speed - 1, 3) : o.speed + Math.sqrt(20 * (gap - 5.8));
          if (cap < speedCap) speedCap = cap;
        }
      }
      let wantAvoid = 0;
      if (m > 0) {
        const planned = lineHere + this.avoid;
        let bestCost = Infinity, best = lineHere;
        for (let ci = 0; ci <= LANES; ci++) {
          const cand = ci === 0 ? lineHere : -lim + (ci - 1) * (2 * lim / (LANES - 1));
          let cost = Math.abs(cand - lineHere) + 0.6 * Math.abs(cand - planned);
          for (let q = 0; q < m; q++) {
            const e = others[q], sep = Math.abs(e.lat - cand);
            if (e.beside) {
              if ((cand - e.lat) * (here - e.lat) < 0) cost += 1000;        // would have to drive through it
              else if (sep < 2.9) cost += 60 + (2.9 - sep) * 40;
            } else if (sep < 2.7) cost += e.urgency * (30 + (2.7 - sep) * 12);
          }
          if (cost < bestCost) { bestCost = cost; best = cand; }
        }
        wantAvoid = best - lineHere;
      }
      const avoidRate = (Math.abs(wantAvoid) > Math.abs(this.avoid) ? 5 : 2.5) * DT;
      this.avoid += clamp(wantAvoid - this.avoid, -avoidRate, avoidRate);

      // ── steering: pure pursuit towards a look-ahead waypoint ──
      const look = clamp(4.5 + 0.34 * v, 6, 24);
      const f = (car.s + look) / ds;
      const j0 = Math.floor(f) % n, j1 = (j0 + 1) % n, fu = f - Math.floor(f);
      const lat = clamp(lerp(this.off[j0], this.off[j1], fu) + this.avoid, -this.lim, this.lim);
      track.pointAt(car.s + look, lat, _tp);
      this.targetX = _tp.x; this.targetY = _tp.y;          // exposed for the debug overlay
      const dx = _tp.x - car.x, dy = _tp.y - car.y;
      const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      const alpha = Math.atan2(ly, lx);
      const dist = Math.sqrt(dx * dx + dy * dy);

      // ── recovery: stuck against something → back out, nose towards the track ──
      if (this.reverse > 0) {
        this.reverse--;
        if (Math.abs(alpha) < 0.35 && this.reverse < 0.8 * TICK_RATE) this.reverse = 0;
        car.inThrottle = 0; car.inBrake = 1; car.inSteer = this.reverseSteer;
        return;
      }
      if (v < 1.2) {
        if (++this.stuck > 1.1 * TICK_RATE) {
          this.stuck = 0;
          this.reverse = Math.round(1.4 * TICK_RATE);
          this.reverseSteer = alpha > 0 ? -1 : 1;
        }
      } else this.stuck = 0;

      let steer;
      if (Math.abs(alpha) > 1.5) steer = alpha > 0 ? 1 : -1;       // facing the wrong way: full lock round
      else steer = clamp(1.15 * Math.atan(2 * CAR.wheelBase * Math.sin(alpha) / Math.max(dist, 1)) / maxSteerAt(Math.abs(car.vf)), -1, 1);

      // ── speed: profile × pace, capped by traffic and by how far off-line we point ──
      let pace = cfg.skill;
      if (car.finished) pace = 0.62;                                // cool-down lap
      else if (!car.isPlayer) {
        // mild rubber band: ease off when well ahead of the player, push when behind
        const lead = car.dist - race.cars[0].dist;
        pace *= lead > 0 ? 1 - clamp(lead / 110, 0, 1) * 0.09 : 1 + clamp(-lead / 120, 0, 1) * 0.04;
      }
      this.pace = pace = Math.min(pace, 1.04);
      const k = Math.floor((car.s + v * 0.12) / ds) % n;
      let target = this.speed[k] * pace;
      const mis = Math.abs(alpha);
      if (mis > 0.3) target = Math.min(target, lerp(target, 7, clamp((mis - 0.3) / 0.9, 0, 1)));
      if (car.grass > 0.5) target = Math.min(target, 16);
      if (speedCap < target) target = speedCap;

      const err = target - v;
      let throttle = 0, brake = 0;
      if (err >= 0) throttle = clamp(0.25 + err * 0.5, 0, 1);
      else if (err < -0.8) brake = clamp(0.1 + (-err - 0.8) * 0.3, 0, 1);
      if (car.vf < -0.5) { throttle = 1; brake = 0; }               // rolling backwards after a reverse
      car.inThrottle = throttle; car.inBrake = brake; car.inSteer = steer;
    }
  }

  // ───────────────────────────── race ─────────────────────────────

  class Race {
    /**
     * @param {object} [opts]
     * @param {number} [opts.seed]       RNG seed (default 1337)
     * @param {number} [opts.laps]       race distance (default 3)
     * @param {boolean} [opts.autopilot] let a waypoint driver steer the player's car
     */
    constructor(opts) {
      opts = opts || {};
      this.seed = (opts.seed === undefined ? DEFAULT_SEED : opts.seed) >>> 0;
      this.laps = opts.laps || DEFAULT_LAPS;
      this.autopilot = !!opts.autopilot;
      this.track = getTrack();
      this.tick = 0;
      this.phase = 'countdown';        // 'countdown' → 'racing' → 'over' (everyone finished)
      this.over = false;
      this.finishCount = 0;
      this.events = [];                // per-tick events for the presentation layer
      this.cars = [];
      this.order = [];                 // cars sorted by race position

      const rng = new RNG(this.seed, 0);
      const track = this.track;
      // 2×2 staggered grid behind the line; the player starts last.
      const slotOf = [3, 0, 1, 2];
      for (let id = 0; id < 4; id++) {
        const car = makeCar(id);
        const slot = slotOf[id];
        track.pointAt(track.length - (7 + slot * 7.5), slot % 2 === 0 ? -2.7 : 2.7, _tp);
        car.x = car.prevX = _tp.x; car.y = car.prevY = _tp.y; car.angle = car.prevAngle = _tp.angle;
        track.locate(car.x, car.y, -1, _loc);
        car.idx = _loc.i; car.s = _loc.s; car.lat = _loc.lat;
        car.dist = car.s - track.length;                 // negative until the line is crossed
        this.cars.push(car);
        this.order.push(car);
      }
      // Driver personalities come from the seeded RNG (drawn in a fixed order).
      for (let id = 0; id < 4; id++) {
        const car = this.cars[id];
        const cfg = id === 0
          ? { skill: 0.96, latUse: 0.9, brakeUse: 13, topUse: 0.99, lineBlend: 1, bias: 0, reaction: 0 }
          : {
              skill: [0, 0.975, 0.955, 0.932][id] + rng.range(-0.01, 0.01),
              latUse: rng.range(0.86, 0.92),
              brakeUse: rng.range(11.5, 14),
              topUse: rng.range(0.975, 1),
              lineBlend: rng.range(0.82, 1),
              bias: rng.range(-0.5, 0.5),
              reaction: Math.round(rng.range(0.04, 0.3) * TICK_RATE),
            };
        car.driver = new Driver(this, car, cfg);
      }
      this.rank();
    }

    get player() { return this.cars[0]; }
    /** Seconds since the green light (0 during the countdown). */
    get time() { return Math.max(0, this.tick - COUNTDOWN_TICKS) * DT; }

    /** Advance exactly one fixed timestep. `bits` = player input flags for this tick. */
    step(bits) {
      const cars = this.cars, track = this.track, events = this.events;
      events.length = 0;

      if (this.phase === 'countdown' && this.tick >= COUNTDOWN_TICKS) {
        this.phase = 'racing';
        events.push({ type: 'go' });
      }
      const live = this.phase !== 'countdown';

      // 1) controls
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!live) { c.inThrottle = 0; c.inBrake = 0; c.inSteer = 0; }
        else if (c.isPlayer && !this.autopilot && !c.finished) {
          c.inThrottle = bits & IN_UP ? 1 : 0;
          c.inBrake = bits & IN_DOWN ? 1 : 0;
          c.inSteer = (bits & IN_RIGHT ? 1 : 0) - (bits & IN_LEFT ? 1 : 0);
        } else c.driver.update();
      }

      // 2) integrate, 3) car ↔ car, 4) barriers
      for (let i = 0; i < cars.length; i++) integrateCar(cars[i], DT);
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < cars.length; i++) {
          for (let j = i + 1; j < cars.length; j++) collideCars(cars[i], cars[j], events);
        }
      }
      for (let i = 0; i < cars.length; i++) resolveWalls(cars[i], track, events);

      // 5) progress, gates, laps
      for (let i = 0; i < cars.length; i++) this.updateProgress(cars[i]);
      this.rank();

      this.tick++;
      if (!this.over && this.finishCount === cars.length) { this.over = true; this.phase = 'over'; }
    }

    updateProgress(c) {
      const track = this.track, len = track.length;
      c.speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      track.locate(c.x, c.y, c.idx, _loc);
      let d = _loc.s - c.s;
      if (d > len / 2) d -= len; else if (d < -len / 2) d += len;
      c.dist += d;
      c.idx = _loc.i; c.s = _loc.s; c.lat = _loc.lat;

      // heading against the track direction for a while → "wrong way"
      const facing = Math.cos(c.angle) * track.tx[c.idx] + Math.sin(c.angle) * track.ty[c.idx];
      c.wrongWay = (facing < -0.35 && c.vf > 2) ? c.wrongWay + 1 : 0;

      // Lap detection: gates must be crossed in order and in the forward
      // direction; gate 0 is the start/finish line. A lap only counts once
      // every gate has been taken, so reversing over the line gains nothing.
      const g = track.gates[c.nextGate];
      const before = (c.prevX - g.x) * g.tx + (c.prevY - g.y) * g.ty;
      const after = (c.x - g.x) * g.tx + (c.y - g.y) * g.ty;
      if (before < 0 && after >= 0 && Math.abs((c.x - g.x) * g.nx + (c.y - g.y) * g.ny) < track.wallHalf + 3) {
        if (c.nextGate === 0) {
          // sub-tick crossing time keeps lap times independent of tick phase
          const t = (this.tick - COUNTDOWN_TICKS + before / (before - after)) * DT;
          if (c.lap > 0 && !c.finished) {
            c.lastLap = t - c.lapStart;
            c.lapTimes.push(c.lastLap);
            if (c.bestLap === 0 || c.lastLap < c.bestLap) c.bestLap = c.lastLap;
            this.events.push({ type: 'lap', car: c.id, lap: c.lap, time: c.lastLap, best: c.lastLap === c.bestLap });
            c.lapStart = t;
            if (c.lap >= this.laps) {
              c.finished = true;
              c.finishTime = t;
              c.finishPlace = ++this.finishCount;
              this.events.push({ type: 'finish', car: c.id, place: c.finishPlace, time: t });
            }
          }
          if (!c.finished) c.lap++;
        }
        c.nextGate = (c.nextGate + 1) % track.gates.length;
      }
    }

    /** Race order: finishers by finishing order, then everyone else by distance covered. */
    rank() {
      const order = this.order;
      for (let i = 1; i < order.length; i++) {            // insertion sort, stable, allocation-free
        const c = order[i], key = rankKey(c);
        let j = i - 1;
        while (j >= 0 && rankKey(order[j]) < key) { order[j + 1] = order[j]; j--; }
        order[j + 1] = c;
      }
      for (let i = 0; i < order.length; i++) order[i].place = i + 1;
    }

    /** FNV-1a over the exact bit patterns of the dynamic state: any divergence between two runs changes it. */
    hash() {
      let h = 0x811c9dc5;
      const mixIn = (u) => { h ^= u; h = Math.imul(h, 0x01000193); };
      mixIn(this.tick);
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        _hf[0] = c.x; _hf[1] = c.y; _hf[2] = c.angle; _hf[3] = c.vx; _hf[4] = c.vy;
        _hf[5] = c.angVel; _hf[6] = c.steer; _hf[7] = c.dist;
        for (let k = 0; k < 16; k++) mixIn(_hu[k]);
        mixIn(c.lap); mixIn(c.nextGate); mixIn(c.place);
      }
      return h >>> 0;
    }
  }

  const _hf = new Float64Array(8), _hu = new Uint32Array(_hf.buffer);

  function rankKey(c) { return c.finished ? 1e9 - c.finishPlace : c.dist; }

  let _track = null;
  function getTrack() { return _track || (_track = new Track(TRACK_DEF)); }

  return {
    TICK_RATE, DT, COUNTDOWN_TICKS, DEFAULT_SEED, DEFAULT_LAPS, TOP_SPEED,
    IN_UP, IN_DOWN, IN_LEFT, IN_RIGHT,
    CAR, TRACK_DEF, RNG, Track, Race, Driver,
    getTrack, buildRacingLine, buildSpeedProfile, cornersOf, maxSteerAt, makeCar, integrateCar, collideCars,
    clamp, lerp, wrapAngle,
  };
});
