'use strict';
/*
 * Top-down 2D racing prototype.
 *
 *  - Player car: throttle / brake(+reverse) / steering
 *  - 3 AI opponents: waypoint (racing-line) following, with an A* grid
 *    re-planner used as an escape route when a car is stuck or wall-locked
 *  - Lap detection via ordered checkpoints + start/finish line
 *  - Car-car collision: impulse resolution along the contact normal
 *  - Car-wall collision: projection + normal impulse against the road edge
 *
 *  Constraints honored:
 *    - deterministic: seeded mulberry32 PRNG drives track generation and
 *      AI personality; zero randomness at runtime; ?seed=NNN changes the track
 *    - fixed timestep: 120 Hz simulation via accumulator, render decoupled
 *    - no external physics engines: all dynamics are plain vector math
 *
 *  Controls: W / Up = gas, S / Down = brake, A-D / Left-Right = steer,
 *            P = pause, R = restart (same seed => identical race)
 */

// ----------------------------------------------------------------- utilities
const TAU = Math.PI * 2;
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mixSeed(a, b) {
  return (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ (a + b)) >>> 0;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function fmtTime(t) {
  if (t == null) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + s.toFixed(3).padStart(6, '0');
}
function ordinal(n) { return n + (['th','st','nd','rd'][((n % 100) - 20) % 10] || ['th','st','nd','rd'][n % 10] || 'th'); }

const SEED = (() => {
  const m = /[?&]seed=(\d+)/.exec(typeof location !== 'undefined' ? location.search : '');
  return m ? (m[1] | 0) >>> 0 : 1337;
})();

// ------------------------------------------------------------------- track
// Procedural closed circuit from the seed. The centerline is a star-shaped
// polar curve r(th) = base * (1 + A * sum_k w_k sin(f_k th + p_k)) with
// integer frequencies, sampled uniformly in th, then linearly squashed.
// Every ray from the center crosses the curve exactly once, so the closed
// loop is guaranteed free of self-intersections; the O(M^2) distance test
// below is kept as a safety net with retry.
function generateWorld(seed) {
  for (let att = 0; att < 96; att++) {
    const rng = mulberry32(mixSeed(seed, 0x51ab + att * 7919));
    const cx = 900 + rng() * 220, cy = 620 + rng() * 160;
    const base = 340 + rng() * 90;
    const squash = 0.72 + rng() * 0.3;
    const nh = 3 + (rng() * 3 | 0);
    const comp = [];
    let wsum = 0;
    for (let k = 0; k < nh; k++) {
      const f = 2 + (rng() * 6 | 0) + k;
      const w = 1 / (1 + k * 0.8);
      comp.push({ f, w, p: rng() * TAU });
      wsum += w;
    }
    const amp = 0.16 + rng() * 0.22;
    const M = 240;
    const pts = [];
    for (let i = 0; i < M; i++) {
      const th = (i / M) * TAU;
      let s = 0;
      for (const h of comp) s += h.w * Math.sin(h.f * th + h.p);
      s = clamp(s / wsum, -0.85, 0.85); // keep lobes well away from the center
      const r = base * (1 + amp * s);
      pts.push({ x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r * squash });
    }
    const halfW = 58 + rng() * 18;
    // safety net: the road bands of the ring must never come closer than
    // road width + margin. Pairs of samples 8-16 apart may legitimately be
    // close (same band, road is up to ~150 px wide), so start at 17.
    // (Narrow "S" shapes with touching bands break nearest-line/CP logic.)
    let ok = true;
    const minD = 2 * halfW + 20;
    outer:
    for (let i = 0; i < M; i++) {
      for (let o = 17; o < M / 2; o++) {
        const j = (i + o) % M;
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        if (dx * dx + dy * dy < minD * minD) { ok = false; break outer; }
      }
    }
    if (!ok) continue;
    // bounding box
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
    // start/finish tangent + perpendicular at pts[0]
    const a = pts[0], b = pts[Math.min(4, M - 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    return { seed, M, pts, halfW, bbox: { minX, minY, maxX, maxY }, tan: { x: tx, y: ty }, perp: { x: -ty, y: tx } };
  }
  throw new Error('track generation failed for seed ' + seed);
}

// ----------------------------------------------------- A* grid over the road
let grid = null;
function buildGrid(world) {
  const cell = 16, pad = 48;
  const x0 = world.bbox.minX - pad, y0 = world.bbox.minY - pad;
  const w = Math.max(4, Math.ceil((world.bbox.maxX + pad - x0) / cell));
  const h = Math.max(4, Math.ceil((world.bbox.maxY + pad - y0) / cell));
  const road = new Uint8Array(w * h);
  const r2 = (world.halfW - 4) * (world.halfW - 4);
  const pts = world.pts, M = world.M;
  for (let j = 0; j < h; j++) {
    const py = y0 + (j + 0.5) * cell;
    for (let i = 0; i < w; i++) {
      const px = x0 + (i + 0.5) * cell;
      for (let k = 0; k < M; k++) {
        const dx = px - pts[k].x, dy = py - pts[k].y;
        if (dx * dx + dy * dy < r2) { road[j * w + i] = 1; break; }
      }
    }
  }
  grid = { cell, x0, y0, w, h, road };
}
function cellId(x, y) {
  if (!grid) return -1;
  const i = (x - grid.x0) / grid.cell | 0, j = (y - grid.y0) / grid.cell | 0;
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return -1;
  return j * grid.w + i;
}
function cellCenter(id) {
  return { x: grid.x0 + ((id % grid.w) + 0.5) * grid.cell, y: grid.y0 + (((id / grid.w) | 0) + 0.5) * grid.cell };
}

// Deterministic A*: 8-connected, corner-cut prevention, open list is an array
// scanned for the minimum f (ties broken by insertion order => reproducible).
const DIRS = [[-1,-1,1.4142],[0,-1,1],[-1,0,1],[1,0,1],[-1,1,1.4142],[0,1,1],[1,-1,1.4142],[1,1,1.4142]];
const NO_BLOCK = new Set();
function astar(s, t, blocked) {
  if (s < 0 || t < 0 || s === t) return null;
  const n = grid.w * grid.h;
  const blk = blocked || NO_BLOCK;
  if (!grid.road[s] || !grid.road[t] || blk.has(s) || blk.has(t)) return null;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const w = grid.w;
  const hx = t % w, hy = (t / w) | 0;
  const h = (id) => {
    const dx = (id % w) - hx, dy = ((id / w) | 0) - hy;
    return Math.hypot(dx, dy);
  };
  g[s] = 0;
  const open = [{ id: s, g: 0, f: h(s) }];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi];
    open.splice(bi, 1);
    if (closed[cur.id] || cur.g > g[cur.id]) continue;
    if (cur.id === t) {
      const path = [];
      let id = cur.id;
      while (id !== -1) { path.push(cellCenter(id)); id = came[id]; }
      return path.reverse();
    }
    closed[cur.id] = 1;
    const cx = cur.id % w, cy = (cur.id / w) | 0;
    for (const [dx, dy, cost] of DIRS) {
      if (dx && dy) {
        const row = cur.id + dx, col = cur.id + w * dy;
        if (row < 0 || row >= n || col < 0 || col >= n) continue;
        if (!grid.road[row] || !grid.road[col]) continue; // no corner cutting
      }
      const ni = cur.id + dx + w * dy;
      if (ni < 0 || ni >= n || !grid.road[ni] || blk.has(ni)) continue;
      const ng = g[cur.id] + cost;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur.id; open.push({ id: ni, g: ng, f: ng + h(ni) }); }
    }
  }
  return null;
}

// --------------------------------------------------------------------- cars
const DT = 1 / 120;           // fixed simulation timestep
const TOTAL_LAPS = 3;
const CPN = 8;               // ordered checkpoints (index 0 = start/finish)
const CP_WIN = 12;           // checkpoint window in centerline samples
const CAR = { accel: 420, brake: 800, reverse: 280, maxReverse: 150, drag: 0.72, grip: 5.5, steer: 2.5 };
const AI_NAMES = ['VOLT', 'ONYX', 'BLAZE'];
const AI_COLORS = ['#ff5544', '#4d9fff', '#ffd23e'];
const PLAYER_COLOR = '#46e08b';

let world = null, cars = null, player = null;
let state = 'countdown', countdown = 3, raceTime = 0, paused = false;
let camX = 0, camY = 0, camInit = false;

function makeCar(o) {
  return {
    x: o.x, y: o.y, vx: 0, vy: 0, vf: 0, heading: o.heading, lastHeading: o.heading,
    r: 14, maxSpeed: o.maxSpeed,
    name: o.name, color: o.color, isPlayer: !!o.isPlayer,
    ai: o.ai || null,
    cp: 1, lapsDone: 0, lapStart: 0, lastLap: null, bestLap: null,
    idx: world.M - 4, scan: 0,
    astarPath: null, astarIdx: 0, stuck: 0, blockedAhead: false, blockedFor: 0, planCooldown: 0,
    brakeHold: 0, _leaderHold: 0, _lastLeader: null,
    walled: false, finished: false, finishTime: 0,
    input: { throttle: 0, brake: 0, steer: 0 },
  };
}

function reset() {
  world = generateWorld(SEED);
  buildGrid(world);
  const rng = mulberry32(mixSeed(SEED, 77));
  const aiAttrs = [];
  for (let i = 0; i < 3; i++) {
    aiAttrs.push({
      look: 7 + (rng() * 8 | 0),    // lookahead in centerline samples
      gain: 2.2 + rng() * 0.9,      // steering P-gain
      curveK: 0.9 + rng() * 0.35,  // curve-braking aggressiveness
      topMul: 0.93 + rng() * 0.09, // individual top-speed difference
    });
  }
  const c0 = world.pts[0], T = world.tan, P = world.perp;
  const baseTop = CAR.accel / CAR.drag;
  cars = [0, 1, 2, 3].map((k) => {
    const row = k >> 1, col = (k % 2 ? 1 : -1) * 26;
    const pos = { x: c0.x - T.x * (34 + row * 44) + P.x * col, y: c0.y - T.y * (34 + row * 44) + P.y * col };
    const isPlayer = k === 0;
    return makeCar({
      ...pos,
      heading: Math.atan2(T.y, T.x),
      maxSpeed: baseTop * (isPlayer ? 1.0 : aiAttrs[k - 1].topMul),
      name: isPlayer ? 'YOU' : AI_NAMES[k - 1],
      color: isPlayer ? PLAYER_COLOR : AI_COLORS[k - 1],
      isPlayer,
      ai: isPlayer ? null : aiAttrs[k - 1],
    });
  });
  player = cars[0];
  state = 'countdown'; countdown = 3; raceTime = 0; paused = false;
  camInit = false;
}

// ------------------------------------------------------- player input polling
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyP') paused = !paused;
  if (e.code === 'Escape') paused = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); paused = true; });
const key = (code) => keys.has(code);

function readPlayerInput(car) {
  car.input.throttle = (key('KeyW') || key('ArrowUp')) ? 1 : 0;
  car.input.brake = (key('KeyS') || key('ArrowDown')) ? 1 : 0;
  car.input.steer = ((key('KeyD') || key('ArrowRight')) ? 1 : 0) - ((key('KeyA') || key('ArrowLeft')) ? 1 : 0);
}

// ------------------------------------------------------------- car physics
function integrate(car, inp, dt) {
  const h1 = Math.cos(car.heading), s1 = Math.sin(car.heading);
  let vf = car.vx * h1 + car.vy * s1;      // speed along heading
  let vl = car.vx * -s1 + car.vy * h1;     // lateral slip
  if (inp.throttle > 0) vf += CAR.accel * inp.throttle * dt;
  if (inp.brake > 0) {
    if (vf > 8) vf -= CAR.brake * inp.brake * dt;
    else {
      // braking a (nearly) stopped car ramps slowly into a gentle reverse
      // instead of instantly kicking to full reverse: an instant sign flip
      // on vf inverts the steering and makes a car that flickers between
      // stop/throttle oscillate in place forever
      car.brakeHold = Math.min(1, car.brakeHold + dt * 3);
      const rev = Math.min(1, Math.max(0, car.brakeHold - 0.15) / 0.35);
      vf = Math.max(vf - CAR.reverse * rev * inp.brake * dt, -CAR.maxReverse);
    }
  } else {
    car.brakeHold = 0;
  }
  vf -= vf * CAR.drag * dt;
  if (vf > car.maxSpeed) vf = car.maxSpeed;
  vl *= Math.max(0, 1 - CAR.grip * dt);     // tire grip kills lateral slide
  // turn authority scales with speed, but keeps a 30% floor at crawl:
  // a real car can still rotate its wheels when nearly stopped, and without
  // this the AI can deadlock (pinned at the wall it can never build the
  // speed a full turn authority would need)
  const sf = Math.max(0.3, Math.min(1, Math.abs(vf) / 140));
  car.heading += inp.steer * CAR.steer * sf * (vf < 0 ? -1 : 1) * dt;
  const h2 = Math.cos(car.heading), s2 = Math.sin(car.heading);
  car.vx = h2 * vf - s2 * vl;
  car.vy = s2 * vf + h2 * vl;
  car.vf = vf;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

// Impulse resolution between two cars (equal mass, restitution 0.4),
// plus positional correction so they do not interpenetrate.
function collideCars() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const md = a.r + b.r;
      if (d >= md) continue;
      let nx, ny;
      if (d < 1e-6) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const jImp = (-(1 + 0.4) * vn) / 2;
        a.vx -= jImp * nx; a.vy -= jImp * ny;
        b.vx += jImp * nx; b.vy += jImp * ny;
      }
      const ov = (md - d) / 2;
      a.x -= nx * ov; a.y -= ny * ov;
      b.x += nx * ov; b.y += ny * ov;
    }
  }
}

// Road-edge "wall": push the center back inside the road and reflect the
// outward velocity component (infinite-mass impulse).
function clampToTrack(car) {
  car.walled = false;
  const p = world.pts[car.idx];
  const dx = car.x - p.x, dy = car.y - p.y;
  const d = Math.hypot(dx, dy);
  const limit = world.halfW - car.r;
  if (d > limit && d > 0) {
    const nx = dx / d, ny = dy / d;
    car.x = p.x + nx * limit;
    car.y = p.y + ny * limit;
    const vn = car.vx * nx + car.vy * ny;
    if (vn > 0) { car.vx -= nx * vn * 1.35; car.vy -= ny * vn * 1.35; car.walled = true; }
  }
}

// Nearest centerline sample — used for wall clamping, checkpoints, progress
// and the AI. The local window is biased forward (-6/+18) so the anchor
// follows the car's progress along the track; a symmetric window would keep
// re-anchoring on a point the car has already passed (the AI would then keep
// trying to turn back to it and oscillate against the wall).
function updateNearest(car) {
  const M = world.M, pts = world.pts;
  const full = car.scan === 0;
  let bd = Infinity, bi = car.idx;
  for (let k = 0; k < (full ? M : 25); k++) {
    const i = full ? k : (car.idx - 6 + k + M) % M;
    const dx = car.x - pts[i].x, dy = car.y - pts[i].y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  car.idx = bi;
  car.scan = (car.scan + 1) % 40;
}

function withinCp(car) {
  const M = world.M;
  const cpIdx = (car.cp * (M / CPN) | 0) % M;
  let d = Math.abs(car.idx - cpIdx);
  if (d > M / 2) d = M - d;
  return d <= CP_WIN;
}

function updateLaps(car) {
  if (car.finished) return;
  if (!withinCp(car)) return;
  if (car.cp === 0) {
    const t = raceTime - car.lapStart;
    car.lastLap = t;
    car.bestLap = car.bestLap == null ? t : Math.min(car.bestLap, t);
    car.lapsDone++;
    car.lapStart = raceTime;
    if (car.lapsDone >= TOTAL_LAPS) {
      car.finished = true;
      car.finishTime = raceTime;
      if (car.isPlayer) state = 'finished';
    }
  }
  car.cp = (car.cp + 1) % CPN;
}

// --------------------------------------------------------------- AI driving
function aiDrive(car) {
  const inp = car.input, M = world.M, ai = car.ai;
  let tx = null, ty = null;
  if (car.astarPath) {
    const p = car.astarPath;
    // abandon a stale route if the car was flung far off it
    const head0 = p[car.astarIdx];
    if (Math.hypot(head0.x - car.x, head0.y - car.y) > 140) {
      car.astarPath = null; car.stuck = 0;
    } else {
      // consume nodes when close, or when the car has passed the node's
      // cross-section (progress-based: robust to cars hugging the wall)
      let guard = 0;
      while (car.astarIdx < p.length - 1 && guard++ < 8) {
        const cur = p[car.astarIdx], nxt = p[car.astarIdx + 1];
        const dx = nxt.x - cur.x, dy = nxt.y - cur.y;
        const dlen = Math.hypot(dx, dy) || 1;
        const dcur = Math.hypot(cur.x - car.x, cur.y - car.y);
        const along = (car.x - cur.x) * dx + (car.y - cur.y) * dy;
        if (dcur < 26 || along > dlen * 0.5) { car.astarIdx++; car.lastNodeAt = raceTime; }
        else break;
      }
      if (car.astarIdx >= p.length) { car.astarPath = null; car.stuck = 0; }
      else {
        const n = p[Math.min(car.astarIdx + 1, p.length - 1)];
        tx = n.x; ty = n.y;
      }
    }
  }
  if (tx === null) {
    const t = world.pts[(car.idx + ai.look) % M];
    tx = t.x; ty = t.y;
  }
  const da = angleDiff(Math.atan2(ty - car.y, tx - car.x), car.heading);
  // PD steering: the derivative term on heading rate damps full-lock
  // oscillation (a pure P-steer can lock in a spin when the target is close)
  const omega = (car.heading - car.lastHeading) / DT;
  car.lastHeading = car.heading;
  inp.steer = clamp(da * ai.gain - 0.3 * omega, -1, 1);
  // wall recovery: if the car is pinned against the road edge and misaligned,
  // steer gently toward a point a little AHEAD on the centerline. Targeting
  // the nearest sample would sit behind the car and make it spin the wrong
  // way; a forward target re-aligns the nose with the road direction.
  let recovSteer = null, recovBrake = 0;
  {
    const p = world.pts[car.idx];
    const dl = Math.hypot(car.x - p.x, car.y - p.y);
    if (dl > world.halfW - car.r - 6) {
      const ahead = world.pts[(car.idx + 8) % M];
      const dA = angleDiff(Math.atan2(ahead.y - car.y, ahead.x - car.x), car.heading);
      if (Math.abs(dA) > 0.5) {
        recovSteer = clamp(dA * 0.9, -1, 1);
        recovBrake = car.vf > 60 ? 0.6 : 0;
      }
    }
  }
  // speed target: while following an A* route go at a moderate pace; otherwise
  // fit a circle to the chord out to a far point on the line
  // (chord c, turn angle da => radius ~ c/da; max speed ~ steerRate * radius)
  let target;
  if (car.astarPath) {
    target = car.maxSpeed * 0.55;
  } else {
    const farI = (car.idx + ((world.M / 16) | 0)) % M;
    const fp = world.pts[farI];
    const fc = Math.hypot(fp.x - car.x, fp.y - car.y);
    const fda = Math.abs(angleDiff(Math.atan2(fp.y - car.y, fp.x - car.x), car.heading));
    target = Math.min(car.maxSpeed, 2.6 * (fc / Math.max(0.3, fda)) * ai.curveK);
    target = Math.max(target, car.maxSpeed * 0.3);
  }
  if (car.astarPath) {
    // following a route: the planner already avoided stopped cars, so no
    // traffic logic here - just hold the cruise speed
    if (car.vf > target) { inp.throttle = 0; inp.brake = 0.6; }
    else { inp.throttle = 1; inp.brake = 0; }
    car.blockedAhead = false; car.blockedFor = 0;
  } else {
    // nearest car in the forward cone. The leader is held for a short hold
    // time after it leaves the cone: cars that jitter in and out of the cone
    // (tightly packed at the start line) would otherwise toggle between
    // full brake and full throttle every couple of steps and never settle.
    let leader = null, gap = Infinity;
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d > 140) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), car.heading)) >= 0.6) continue;
      if (d < gap) { gap = d; leader = o; }
    }
    if (leader) {
      car._leaderHold = 1;
    } else {
      car._leaderHold = Math.max(0, car._leaderHold - DT * 1.25);
      const l = car._lastLeader;
      if (car._leaderHold > 0 && l && l !== car) {
        const d = Math.hypot(l.x - car.x, l.y - car.y);
        if (d <= 170) { leader = l; gap = d; }
        else car._leaderHold = 0;
      }
    }
    if (leader) car._lastLeader = leader;
    car.blockedAhead = false;
    if (!leader) {
      car.blockedFor = 0;
      if (car.vf > target) { inp.throttle = 0; inp.brake = 0.6; }
      else { inp.throttle = 1; inp.brake = 0; }
    } else if (leader.vf >= 40) {
      // normal following of a moving car
      car.blockedFor = 0;
      if (gap < 60) { inp.throttle = 0; inp.brake = 0.5; }
      else if (car.vf > target) { inp.throttle = 0; inp.brake = 0.6; }
      else { inp.throttle = 1; inp.brake = 0; }
    } else {
      // stopped car ahead: the car whose next checkpoint is closest has right
      // of way; the rest brake. The (right-of-way) car creeps forward so the
      // gap opens and the stuck timer can trigger an A* overtake route.
      car.blockedFor += DT;
      car.blockedAhead = true;
      const cpIdx = (c) => (c.cp * (M / CPN) | 0) % M;
      const distCp = (c) => (cpIdx(c) - c.idx + M) % M;
      if (gap < 60 || distCp(leader) + 6 < distCp(car)) {
        // gentle hold (not a hard brake): a hard stop from rest would kick
        // the car into reverse and flip the steering inversion, oscillating
        // it in place; the slow reverse ramp only engages on a sustained hold
        inp.throttle = 0; inp.brake = 0.3;
      } else {
        inp.throttle = 0.3; inp.brake = 0;
      }
    }
  }
  if (recovSteer !== null) {
    inp.steer = recovSteer;
    inp.brake = Math.max(inp.brake, recovBrake);
  }
}

// Is a world point inside the road mask?
function isRoad(x, y) {
  const id = cellId(x, y);
  return id >= 0 && !!grid.road[id];
}
// Line-of-sight test between two points, staying inside the road
// (samples the chord; ~8 px resolution is enough for a 16 px grid).
function lineOfSight(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(d / 8));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (!isRoad(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}
// Simplify a zig-zaggy grid path into straight chords the car can actually drive.
function smoothPath(path) {
  if (path.length < 3) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let far = path.length - 1;
    for (let j = path.length - 1; j > i + 1; j--) {
      if (lineOfSight(path[i], path[j])) { far = j; break; }
    }
    out.push(path[far]);
    i = far;
  }
  return out;
}

// A* escape route: plan a grid path from the car to the next checkpoint
// (or the lookahead waypoint) when the car is wall-locked or stalled.
// Cells occupied by slow/stopped cars ahead are treated as off-road so the
// route goes AROUND the obstacle instead of straight through it.
function aiPlan(car) {
  if (car.astarPath) return;
  if (raceTime < car.planCooldown) return;
  car.planCooldown = raceTime + 2; // do not replan in a tight loop
  const M = world.M;
  const blocked = new Set();
  for (const o of cars) {
    if (o === car || o.vf > 60) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    if (dx * dx + dy * dy > 260 * 260) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), car.heading)) > 1.2) continue;
    const c = grid.cell;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const id = cellId(o.x + ox * c, o.y + oy * c);
        if (id >= 0) blocked.add(id);
      }
    }
  }
  const targets = [
    world.pts[(car.cp * (M / CPN) | 0) % M],
    world.pts[(car.idx + car.ai.look) % M],
  ];
  for (const tgt of targets) {
    const from = cellId(car.x, car.y), to = cellId(tgt.x, tgt.y);
    if (from < 0 || to < 0) continue;
    const path = astar(from, to, blocked);
    if (path) {
      car.astarPath = smoothPath(path);
      car.astarIdx = 0;
      car.lastNodeAt = raceTime;
      car.planCooldown = 0;
      return;
    }
  }
}

function aiStuckCheck(car) {
  if (car.walled && car.vf > 130) { aiPlan(car); return; }
  if (car.vf < 55 && (car.input.throttle > 0.4 || car.blockedAhead)) {
    car.stuck += DT;
    if (car.stuck > 1.0) {
      // a route that has made no node progress for a while is stale
      // (e.g. a new obstacle parked on it) - drop it and re-plan
      if (car.astarPath && raceTime - (car.lastNodeAt || 0) > 4) {
        car.astarPath = null; car.stuck = 0;
      }
      aiPlan(car);
    }
  } else {
    car.stuck = Math.max(0, car.stuck - DT * 2);
  }
}

// --------------------------------------------------------------- simulation
function step(dt) {
  if (state === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) { state = 'racing'; for (const c of cars) c.lapStart = 0; }
  }
  const racing = state === 'racing';
  if (racing) raceTime += dt;
  for (const car of cars) {
    car.walled = false;
    if (!racing || car.finished) {
      car.input.throttle = 0; car.input.brake = 1; car.input.steer = 0;
    } else if (car.isPlayer) {
      readPlayerInput(car);
    } else {
      aiDrive(car);
    }
    integrate(car, car.input, dt);
  }
  collideCars();
  for (const car of cars) clampToTrack(car);
  for (const car of cars) updateNearest(car);
  for (const car of cars) updateLaps(car);
  for (const car of cars) if (!car.isPlayer && !car.finished) aiStuckCheck(car);
}

function progress(car) { return car.lapsDone * world.M + car.idx; }
function standings() {
  return [...cars].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.finishTime - b.finishTime;
    return progress(b) - progress(a);
  });
}

// ------------------------------------------------------------------ drawing
const cv = document.getElementById('c');
const dpr = Math.min(2, window.devicePixelRatio || 1);
cv.width = 1280 * dpr; cv.height = 720 * dpr;
const ctx = cv.getContext('2d');

function drawTrack() {
  const pts = world.pts;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };
  path(); ctx.strokeStyle = '#151a12'; ctx.lineWidth = world.halfW * 2 + 16; ctx.stroke();
  path(); ctx.strokeStyle = '#474e5a'; ctx.lineWidth = world.halfW * 2; ctx.stroke();
  path(); ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = world.halfW * 2 - 46; ctx.stroke();
  ctx.setLineDash([16, 26]);
  path(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.setLineDash([]);
  // checkered start/finish strip
  const c0 = pts[0], T = world.tan, P = world.perp;
  const n = 9, s = (world.halfW * 2) / n;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      const off = -world.halfW + i * s;
      ctx.fillStyle = (i + row) % 2 ? '#111418' : '#e8e8e8';
      const cx = c0.x + P.x * off + T.x * (row * s - s);
      const cy = c0.y + P.y * off + T.y * (row * s - s);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(T.y, T.x));
      ctx.fillRect(0, -s / 2, s, s);
      ctx.restore();
    }
  }
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-18, -8, 36, 19);
  ctx.fillStyle = '#14161a';
  ctx.fillRect(-15, -11.5, 8, 4); ctx.fillRect(7, -11.5, 8, 4);
  ctx.fillRect(-15, 7.5, 8, 4); ctx.fillRect(7, 7.5, 8, 4);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.moveTo(19, 0); ctx.lineTo(10, -9.5); ctx.lineTo(-16, -9.5);
  ctx.lineTo(-19, -5); ctx.lineTo(-19, 5); ctx.lineTo(-16, 9.5);
  ctx.lineTo(10, 9.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(-6, -6.5, 10, 13);
  if (car.isPlayer) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.restore();
  if (car.astarPath) {
    // visualize the active A* escape route
    ctx.strokeStyle = 'rgba(255,210,62,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(car.x, car.y);
    for (let i = car.astarIdx; i < car.astarPath.length; i++) ctx.lineTo(car.astarPath[i].x, car.astarPath[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawMinimap() {
  const W = 190, H = 140, mx = 1280 - W - 14, my = 720 - H - 40;
  const b = world.bbox;
  const pad = 10;
  const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxY - b.minY));
  const ox = mx + W / 2, oy = my + H / 2;
  const tcx = (b.minX + b.maxX) / 2, tcy = (b.minY + b.maxY) / 2;
  const mp = (x, y) => [ox + (x - tcx) * sc, oy + (y - tcy) * sc];
  ctx.fillStyle = 'rgba(10,12,16,0.75)';
  ctx.fillRect(mx, my, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const p0 = mp(world.pts[0].x, world.pts[0].y);
  ctx.moveTo(p0[0], p0[1]);
  for (let i = 1; i < world.M; i += 3) { const p = mp(world.pts[i].x, world.pts[i].y); ctx.lineTo(p[0], p[1]); }
  ctx.closePath(); ctx.stroke();
  for (const car of cars) {
    const p = mp(car.x, car.y);
    ctx.fillStyle = car.color;
    ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, TAU); ctx.fill();
  }
}

function panel(x, y, w, lines) {
  ctx.fillStyle = 'rgba(8,10,14,0.72)';
  ctx.fillRect(x, y, w, lines.length * 20 + 10);
  ctx.font = '14px "Courier New", monospace';
  ctx.textBaseline = 'top';
  lines.forEach((ln, i) => {
    ctx.fillStyle = ln.c || '#dfe6ee';
    ctx.fillText(ln.t, x + 10, y + 7 + i * 20);
  });
}

function drawHUD() {
  const st = standings();
  const pos = st.indexOf(player) + 1;
  const lapNo = Math.min(player.lapsDone + 1, TOTAL_LAPS);
  panel(14, 12, 252, [
    { t: 'POS   ' + ordinal(pos) + '  / ' + cars.length, c: '#ffd23e' },
    { t: 'LAP   ' + lapNo + ' / ' + TOTAL_LAPS },
    { t: 'TIME  ' + fmtTime(raceTime) },
    { t: 'LAST  ' + fmtTime(player.lastLap) },
    { t: 'BEST  ' + fmtTime(player.bestLap), c: '#46e08b' },
  ]);
  const lines = st.map((car, i) => ({
    t: ordinal(i + 1) + '  ' + car.name.padEnd(5) + '  ' + (car.finished ? 'FIN ' + fmtTime(car.finishTime) : 'L' + Math.min(car.lapsDone + 1, TOTAL_LAPS) + '  ' + fmtTime(car.lastLap)),
    c: car.color,
  }));
  panel(1280 - 276, 12, 262, lines);
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = 'rgba(220,228,238,0.55)';
  ctx.textBaseline = 'top';
  ctx.fillText('W/Up gas   S/Down brake   A/D steer   P pause   R restart (same seed)', 16, 720 - 26);
  ctx.textAlign = 'right';
  ctx.fillText('seed ' + SEED + '  ( ?seed=NNN for another track )', 1264, 720 - 26);
  ctx.textAlign = 'left';
  drawMinimap();
}

function drawOverlay() {
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 42px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED - P to resume', 640, 360);
    ctx.textAlign = 'left';
    return;
  }
  if (state === 'countdown') {
    const n = Math.ceil(countdown);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 120px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 640, 330);
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('GET READY', 640, 420);
    ctx.textAlign = 'left';
  } else if (state === 'racing' && raceTime < 1) {
    ctx.fillStyle = '#46e08b';
    ctx.font = 'bold 110px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GO!', 640, 330);
    ctx.textAlign = 'left';
  } else if (state === 'finished') {
    ctx.fillStyle = 'rgba(5,7,10,0.7)';
    ctx.fillRect(0, 0, 1280, 720);
    const st = standings();
    const pos = st.indexOf(player) + 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 64px "Courier New", monospace';
    ctx.fillText('FINISHED', 640, 200);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.fillText('You took ' + ordinal(pos) + '  -  ' + fmtTime(player.finishTime), 640, 268);
    ctx.font = '20px "Courier New", monospace';
    st.forEach((car, i) => {
      ctx.fillStyle = car.color;
      ctx.fillText(ordinal(i + 1) + '  ' + car.name.padEnd(6) + (car.finished ? '  ' + fmtTime(car.finishTime) : '  +DNF'), 640, 330 + i * 30);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText('R - race again (same seed, same race)   ?seed=NNN - new track', 640, 500);
    ctx.textAlign = 'left';
  }
}

// ------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let ft = (now - last) / 1000;
  last = now;
  if (ft > 0.25) ft = 0.25;
  if (!paused) {
    acc += ft;
    let n = 0;
    while (acc >= DT && n < 10) { step(DT); acc -= DT; n++; }
    if (n === 10) acc = 0; // spiral-of-death guard
  }
  render(ft);
}

function render(ft) {
  const p = cars[0];
  if (!camInit) { camX = p.x; camY = p.y; camInit = true; }
  const k = 1 - Math.pow(0.0005, ft);
  camX += (p.x - camX) * k;
  camY += (p.y - camY) * k;
  const SCALE = 1.5;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#232b1e';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.save();
  ctx.translate(640, 360);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-camX, -camY);
  drawTrack();
  for (const car of cars) drawCar(car);
  ctx.restore();
  drawHUD();
  drawOverlay();
}

reset();
requestAnimationFrame(frame);
