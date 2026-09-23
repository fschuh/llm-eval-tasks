#!/usr/bin/env node
/*
 * Headless test suite for the simulation (no dependencies): `node tests/run-tests.js`.
 * The sim files are plain scripts that attach to globalThis.Racer, exactly as in the browser.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SIM_FILES = [
  'src/core/dmath.js', 'src/core/rng.js', 'src/sim/track.js', 'src/sim/car.js',
  'src/sim/collision.js', 'src/sim/pathfinding.js', 'src/sim/ai.js', 'src/sim/world.js',
];
for (const f of SIM_FILES) require(path.join(ROOT, f));
const R = globalThis.Racer;
const { M, TPS, DT } = R;

// ------------------------------------------------------------------ tiny harness

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function approx(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ${expected} ± ${tol}, got ${actual}`);
}

/** Integrates one car alone (no AI, no other cars) with collisions against the track walls. */
function simulateSolo(track, car, seconds, controls) {
  const world = { cars: [car], track, events: [] };
  Object.assign(car.controls, controls);
  const trace = [];
  for (let i = 0; i < Math.round(seconds * TPS); i++) {
    car.savePrev();
    car.integrate(DT);
    world.events.length = 0;
    R.Collision.resolveCollisions(world);
    trace.push({ x: car.x, y: car.y, vx: car.vx, vy: car.vy, events: world.events.slice() });
  }
  return trace;
}

/** Deepest penetration of a car's corners beyond the walls (clearance below zero). */
function worstCornerClearance(track, car) {
  const poly = R.Collision.setCarPoly(R.Collision.makePoly(4), car);
  let worst = Infinity;
  for (let i = 0; i < 4; i++) worst = Math.min(worst, track.clearanceAt(poly.vx[i], poly.vy[i]));
  return worst;
}

/** Moves a car along the centerline in small steps, running the lap logic after each one. */
function driveAlong(world, car, fromS, toS, step = 8) {
  const tr = world.track, dir = toS >= fromS ? 1 : -1;
  const place = (s) => {
    const p = tr.pointAt(s);
    car.x = p.x;
    car.y = p.y;
  };
  place(fromS);
  for (let s = fromS; dir > 0 ? s < toS : s > toS;) {
    s = dir > 0 ? Math.min(toS, s + step) : Math.max(toS, s - step);
    car.savePrev();
    place(s);
    world._updateRaceState(car);
    world.tick++;
  }
}

function runRace(opts, maxSeconds = 300) {
  const w = new R.World(opts);
  const wallHits = [0, 0, 0, 0];
  while (w.phase !== 'finished' && w.tick < maxSeconds * TPS) {
    w.step(0);
    for (const e of w.events) if (e.type === 'hit' && e.b < 0) wallHits[e.a]++;
  }
  return { w, wallHits };
}

// ------------------------------------------------------------------ deterministic math & RNG

test('dmath sin/cos/tan/atan2 match Math.* closely', () => {
  let maxErr = 0;
  for (let i = -20000; i <= 20000; i++) {
    const x = i * 0.00731;
    maxErr = Math.max(maxErr, Math.abs(M.sin(x) - Math.sin(x)), Math.abs(M.cos(x) - Math.cos(x)));
  }
  assert.ok(maxErr < 1e-9, 'sin/cos error ' + maxErr);
  let atanErr = 0;
  for (let i = -300; i <= 300; i++) {
    for (let j = -300; j <= 300; j += 7) {
      const y = i * 0.37, x = j * 0.41;
      atanErr = Math.max(atanErr, Math.abs(M.atan2(y, x) - Math.atan2(y, x)));
    }
  }
  assert.ok(atanErr < 1e-9, 'atan2 error ' + atanErr);
  approx(M.tan(0.4), Math.tan(0.4), 1e-9);
  approx(M.wrapAngle(3 * Math.PI), -Math.PI, 1e-12);
  assert.strictEqual(M.atan2(0, 0), 0);
});

test('simulation sources avoid engine-dependent math (Math.sin/cos/atan2/pow/exp/hypot, **)', () => {
  const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|pow|hypot|cbrt|random)\b|\*\*|Date\.now|performance\.now/;
  for (const f of SIM_FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const m = src.match(banned);
    assert.ok(!m, `${f} uses ${m && m[0]}`);
  }
});

test('RNG is deterministic, uniform-ish, and derived streams are independent', () => {
  const a = new R.RNG(42), b = new R.RNG(42), c = new R.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 1000; i++) { sa.push(a.float()); sb.push(b.float()); sc.push(c.float()); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
  const mean = sa.reduce((s, v) => s + v, 0) / sa.length;
  approx(mean, 0.5, 0.05, 'mean');
  assert.ok(sa.every((v) => v >= 0 && v < 1));
  // A derived stream depends only on the root seed and its label, not on prior draws.
  const fresh = new R.RNG(7).derive('ai').float();
  const used = new R.RNG(7);
  for (let i = 0; i < 50; i++) used.float();
  assert.strictEqual(used.derive('ai').float(), fresh);
  assert.notStrictEqual(new R.RNG(7).derive('grid').float(), fresh);
  for (let i = 0; i < 200; i++) {
    const v = a.int(3, 5);
    assert.ok(v >= 3 && v <= 5 && Number.isInteger(v));
  }
  assert.strictEqual(R.parseSeed('1337'), 1337);
  assert.strictEqual(R.parseSeed('banana'), R.parseSeed('banana'));
});

// ------------------------------------------------------------------ track

test('classic track is valid (no folded walls, no overlapping sections)', () => {
  const tr = R.Track.create(R.TRACK_DEFS.classic);
  assert.ok(tr.validation.ok, JSON.stringify(tr.validation));
  assert.ok(tr.gates.length >= 10);
  assert.strictEqual(tr.gates[0].s, 0);
  // Clearance is half the width on the centerline and ~0 on the walls.
  for (let i = 0; i < tr.n; i += 7) {
    approx(tr.clearanceAt(tr.cx[i], tr.cy[i]), tr.halfWidth, 6, 'centerline clearance');
    approx(tr.clearanceAt(tr.lx[i], tr.ly[i]), 0, 6, 'wall clearance');
  }
});

test('procedural tracks validate for many seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const def = R.generateProceduralDef(new R.RNG(seed).derive('track'), seed);
    assert.ok(def, 'no valid layout for seed ' + seed);
    const tr = R.Track.create(def, { strict: true });
    assert.ok(tr && tr.validation.ok, 'seed ' + seed);
  }
  // Same seed -> same layout.
  const a = R.generateProceduralDef(new R.RNG(5).derive('track'), 5);
  const b = R.generateProceduralDef(new R.RNG(5).derive('track'), 5);
  assert.deepStrictEqual(a, b);
});

test('track projection returns consistent arc length and signed lateral offset', () => {
  const tr = R.Track.create(R.TRACK_DEFS.classic);
  const out = {};
  let hint = -1;
  for (let k = 0; k < 200; k++) {
    const s = (k * 97.3) % tr.length;
    const p = tr.pointAt(s);
    const lat = ((k % 9) - 4) * 15;
    tr.project(p.x + p.nx * lat, p.y + p.ny * lat, hint, out);
    approx(tr.deltaS(s, out.s), 0, 3, 'arc length');
    approx(out.lat, lat, 3, 'lateral');
    hint = -1; // exercise the grid lookup path as well as the hinted path
    if (k % 2) hint = out.i;
  }
});

// ------------------------------------------------------------------ A*

test('A* finds optimal 8-connected paths and respects walls / corner cutting', () => {
  const w = 10, h = 10, cost = new Float64Array(w * h).fill(1);
  const astar = new R.GridAStar(w, h, cost, 1);
  const goal = 9 * w + 9;
  const hDist = (c) => Math.hypot(9 - (c % w), 9 - Math.floor(c / w));
  let path = astar.search(0, (c) => c === goal, hDist);
  assert.strictEqual(path.length, 10); // pure diagonal
  // Wall across the grid with a single gap at x = 9.
  for (let x = 0; x < 9; x++) cost[5 * w + x] = Infinity;
  path = astar.search(0, (c) => c === goal, hDist);
  assert.ok(path.includes(5 * w + 9), 'must go through the gap');
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const ax = a % w, ay = Math.floor(a / w), bx = b % w, by = Math.floor(b / w);
    if (ax !== bx && ay !== by) {
      assert.notStrictEqual(cost[ay * w + bx], Infinity, 'corner cut');
      assert.notStrictEqual(cost[by * w + ax], Infinity, 'corner cut');
    }
  }
  cost[5 * w + 9] = Infinity; // close the gap
  assert.strictEqual(astar.search(0, (c) => c === goal, hDist), null);
});

test('A* racing lines stay on track, close the loop and cut corners', () => {
  const tr = R.Track.create(R.TRACK_DEFS.classic);
  const opts = { safeClearance: 26, preferredClearance: 48, clearanceWeight: 1.4 };
  const line = R.AI.planRacingLine(tr, opts);
  let maxSeg = 0;
  for (let i = 0; i < line.n; i++) {
    assert.ok(tr.clearanceAt(line.x[i], line.y[i]) >= opts.safeClearance - 4, 'line point too close to a wall');
    maxSeg = Math.max(maxSeg, line.segLen[i]);
  }
  assert.ok(maxSeg < 30, 'gap in the line: ' + maxSeg);
  assert.ok(line.length < tr.length && line.length > tr.length * 0.8, `line ${line.length} vs track ${tr.length}`);
  const other = R.AI.planRacingLine(tr, { safeClearance: 26, preferredClearance: 64, clearanceWeight: 2.6 });
  let maxDiff = 0;
  for (let i = 0; i < line.n; i += 5) {
    const j = other.nearest(line.x[i], line.y[i], -1, tr, line.ts[i]);
    maxDiff = Math.max(maxDiff, M.len(other.x[j] - line.x[i], other.y[j] - line.y[i]));
  }
  assert.ok(maxDiff > 8, 'personalities should produce different lines');
});

test('runtime A* detour routes around a wall between two nearby track sections', () => {
  const w = new R.World({ seed: 3 });
  const tr = w.track;
  // Find two centerline points that are close in space but far apart along the track.
  let best = null;
  for (let i = 0; i < tr.n; i += 3) {
    for (let j = 0; j < tr.n; j += 3) {
      if (Math.abs(tr.deltaS(tr.s[i], tr.s[j])) < 1500) continue;
      const d = M.len(tr.cx[i] - tr.cx[j], tr.cy[i] - tr.cy[j]);
      if (!best || d < best.d) best = { i, j, d };
    }
  }
  assert.ok(!tr.lineClear(tr.cx[best.i], tr.cy[best.i], tr.cx[best.j], tr.cy[best.j], 8), 'expected a wall in between');
  const car = w.cars[1];
  car.place(tr.cx[best.i], tr.cy[best.i], 0);
  const route = R.AI.planDetour(w, car, tr.cx[best.j], tr.cy[best.j]);
  assert.ok(route && route.length >= 2, 'no detour found');
  let len = 0;
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1], b = route[k];
    assert.ok(tr.lineClear(a.x, a.y, b.x, b.y, 10), 'detour leg crosses a wall');
    len += M.len(b.x - a.x, b.y - a.y);
  }
  assert.ok(len > best.d * 1.5, 'detour should go the long way round');
});

// ------------------------------------------------------------------ car physics

test('car accelerates, tops out, brakes, reverses and steers the right way', () => {
  const car = new R.Car(0); // integrated directly: open space, no walls
  car.place(0, 0, 0);
  Object.assign(car.controls, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  let t100 = -1;
  for (let i = 0; i < 12 * TPS; i++) {
    car.integrate(DT);
    if (t100 < 0 && car.speed * 0.36 >= 100) t100 = i * DT;
  }
  assert.ok(car.speed > 470 && car.speed < 540, 'top speed ' + car.speed);
  assert.ok(t100 > 0.8 && t100 < 2.5, '0-100 km/h in ' + t100);
  approx(car.y, 0, 1e-9, 'straight line');

  Object.assign(car.controls, { throttle: 0, brake: 1 });
  const x0 = car.x;
  let stopped = -1;
  for (let i = 0; i < 3 * TPS && stopped < 0; i++) {
    car.integrate(DT);
    if (car.forwardSpeed() <= R.CAR_SPEC.gearSwitchSpeed) stopped = car.x - x0;
  }
  assert.ok(stopped > 50 && stopped < 260, 'braking distance ' + stopped);
  for (let i = 0; i < 3 * TPS; i++) car.integrate(DT);
  assert.ok(car.forwardSpeed() < -100 && car.forwardSpeed() >= -R.CAR_SPEC.maxReverse, 'reverse ' + car.forwardSpeed());

  // Steering right (+1) turns clockwise on screen (+y is down): heading increases.
  const c2 = new R.Car(1);
  c2.place(0, 0, 0);
  c2.vx = 200;
  Object.assign(c2.controls, { throttle: 0.5, steer: 1 });
  for (let i = 0; i < TPS / 2; i++) c2.integrate(DT);
  assert.ok(c2.angle > 0.3, 'heading ' + c2.angle);
  assert.ok(c2.y > 5, 'should curve toward +y (right)');
});

test('handbrake lets the rear slide', () => {
  const run = (handbrake) => {
    const car = new R.Car(0);
    car.place(0, 0, 0);
    car.vx = 350;
    Object.assign(car.controls, { throttle: 0.3, steer: 1, handbrake });
    let maxSlip = 0;
    for (let i = 0; i < TPS; i++) {
      car.integrate(DT);
      maxSlip = Math.max(maxSlip, Math.abs(car.slip));
    }
    return maxSlip;
  };
  assert.ok(run(true) > run(false) * 1.5);
});

// ------------------------------------------------------------------ collisions

test('SAT box-box contact: normal, depth and contact point', () => {
  const A = new R.Car(0), B = new R.Car(1);
  A.place(0, 0, 0);
  B.place(40, 5, 0); // overlapping by 4 units along x
  const m = {};
  const pa = R.Collision.setCarPoly(R.Collision.makePoly(4), A);
  const pb = R.Collision.setCarPoly(R.Collision.makePoly(4), B);
  assert.ok(R.Collision.collide(pa, pb, m));
  approx(m.nx, 1, 1e-9);
  approx(m.ny, 0, 1e-9);
  approx(m.depth, 4, 1e-9);
  approx(m.x, 20, 2.1); // on the shared face
  B.place(50, 0, 0);
  R.Collision.setCarPoly(pb, B);
  assert.ok(!R.Collision.collide(pa, pb, m), 'separated boxes must not collide');
  B.place(30, 26, 0.5); // rotated, touching only by a corner region
  R.Collision.setCarPoly(pb, B);
  assert.ok(R.Collision.collide(pa, pb, m));
  assert.ok(m.depth > 0 && m.depth < 10);
});

test('impulse resolution conserves momentum and applies restitution', () => {
  const A = new R.Car(0), B = new R.Car(1);
  A.place(0, 0, 0);
  B.place(43, 0, 0);
  A.vx = 200;
  B.vx = -200;
  const m = {};
  R.Collision.collide(R.Collision.setCarPoly(R.Collision.makePoly(4), A), R.Collision.setCarPoly(R.Collision.makePoly(4), B), m);
  R.Collision.resolve(A, B, m, 0.35, 0.1);
  approx(A.vx + B.vx, 0, 1e-6, 'linear momentum');
  approx(B.vx - A.vx, 0.35 * 400, 1e-6, 'restitution');
  approx(A.av, 0, 1e-9);

  // Off-centre hit: spin is imparted, and linear + angular momentum are conserved.
  const C = new R.Car(2), D = new R.Car(3);
  C.place(0, 0, 0);
  D.place(40, 14, 0.3);
  C.vx = 250;
  D.vy = -30;
  const momentum = () => [C.vx + D.vx, C.vy + D.vy,
    C.x * C.vy - C.y * C.vx + C.inertia * C.av + D.x * D.vy - D.y * D.vx + D.inertia * D.av];
  const before = momentum();
  R.Collision.collide(R.Collision.setCarPoly(R.Collision.makePoly(4), C), R.Collision.setCarPoly(R.Collision.makePoly(4), D), m);
  const cx = C.x, cy = C.y, dx = D.x, dy = D.y;
  R.Collision.resolve(C, D, m, 0.35, 0.1);
  // Compare angular momentum about the origin using pre-correction positions.
  [C.x, C.y, D.x, D.y] = [cx, cy, dx, dy];
  const after = momentum();
  for (let k = 0; k < 3; k++) approx(after[k], before[k], 1e-6 * Math.max(1, Math.abs(before[k])), 'momentum ' + k);
  assert.ok(Math.abs(C.av) > 0.01 && Math.abs(D.av) > 0.01, 'off-centre impacts should spin both cars');
});

test('cars never tunnel through walls, even head-on at top speed', () => {
  const tr = R.Track.create(R.TRACK_DEFS.classic);
  for (const [s, angleOffset] of [[500, M.HALF_PI], [2000, -M.HALF_PI], [5200, 0.6], [8000, -2.4], [9100, 1.2]]) {
    const car = new R.Car(0);
    const p = tr.pointAt(s);
    const angle = M.atan2(p.ty, p.tx) + angleOffset;
    car.place(p.x, p.y, angle);
    car.vx = M.cos(angle) * 520;
    car.vy = M.sin(angle) * 520;
    const trace = simulateSolo(tr, car, 3, { throttle: 1, steer: 0.3 });
    let worst = Infinity;
    for (let i = 0; i < trace.length; i++) worst = Math.min(worst, tr.clearanceAt(trace[i].x, trace[i].y));
    assert.ok(worst > car.width / 2 - 3, `centre got within ${worst} of a wall (s=${s})`);
    assert.ok(worstCornerClearance(tr, car) > -3, 'corner penetrates the wall');
    assert.ok(trace.some((t) => t.events.length > 0), 'expected a wall hit event');
  }
});

test('wall bounce reverses the normal velocity with restitution', () => {
  const tr = R.Track.create(R.TRACK_DEFS.classic);
  const p = tr.pointAt(1000); // on the start straight
  const car = new R.Car(0);
  const angle = M.atan2(p.ny, p.nx); // facing the right-hand wall
  car.place(p.x + p.nx * 40, p.y + p.ny * 40, angle);
  car.vx = p.nx * 400;
  car.vy = p.ny * 400;
  const trace = simulateSolo(tr, car, 0.5, { throttle: 0 });
  const hit = trace.findIndex((t) => t.events.length > 0);
  assert.ok(hit >= 0, 'no hit');
  const after = trace[hit + 3];
  const vn = after.vx * p.nx + after.vy * p.ny; // + = toward the wall
  assert.ok(vn < -40 && vn > -0.3 * 400 - 5, 'rebound speed ' + vn);
});

// ------------------------------------------------------------------ lap detection

test('laps count only when every checkpoint is passed in order', () => {
  const w = new R.World({ seed: 11, laps: 2 });
  const L = w.track.length, car = w.cars[1];
  w.phase = 'racing';
  w.tick = w.startTick;
  driveAlong(w, car, -120, 60); // cross the start line: lap 1 begins
  assert.strictEqual(car.gatesPassed, 1);
  assert.strictEqual(car.lapsDone, 0);
  driveAlong(w, car, 60, L + 60); // one full lap
  assert.strictEqual(car.lapsDone, 1);
  assert.strictEqual(car.lapTimes.length, 1);
  assert.ok(car.lapTimes[0] > 0);
  // Back over the line and forward again: no extra lap, no extra lap time.
  driveAlong(w, car, L + 60, L - 80);
  assert.strictEqual(w.currentLap(car), 2);
  driveAlong(w, car, L - 80, L + 60);
  assert.strictEqual(car.lapsDone, 1);
  assert.strictEqual(car.lapTimes.length, 1);
  driveAlong(w, car, L + 60, 2 * L + 60);
  assert.strictEqual(car.lapsDone, 2);
  assert.ok(car.finished, 'should finish after 2 laps');
  assert.strictEqual(car.lapTimes.length, 2);
  // Driving on after the flag must not change the result.
  const finishTime = car.finishTime;
  driveAlong(w, car, 2 * L + 60, 3 * L + 60);
  assert.strictEqual(car.finishTime, finishTime);
  assert.strictEqual(car.lapTimes.length, 2);
  assert.strictEqual(w.finishCount, 1);
});

test('shortcuts and driving backwards never count laps', () => {
  const w = new R.World({ seed: 12, laps: 3 });
  const L = w.track.length, tr = w.track;
  const cheat = w.cars[2];
  driveAlong(w, cheat, -100, 40);
  driveAlong(w, cheat, 40, 700);
  const passed = cheat.gatesPassed;
  // Teleport near the end of the lap (skipping most gates), then cross the line.
  const p = tr.pointAt(L - 40);
  cheat.x = p.x; cheat.y = p.y;
  cheat.savePrev();
  w._updateRaceState(cheat);
  driveAlong(w, cheat, L - 40, L + 40);
  assert.strictEqual(cheat.lapsDone, 0);
  assert.strictEqual(cheat.gatesPassed, passed);

  const wrong = w.cars[3];
  driveAlong(w, wrong, -100, -100 - L - 200, 8); // a full lap in reverse
  assert.strictEqual(wrong.lapsDone, 0);
  assert.strictEqual(wrong.gatesPassed, 0);
});

test('gate crossing reports the sub-tick fraction and direction', () => {
  const gate = { x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: 1 };
  approx(R.gateCrossing(gate, -3, 0, 1, 0, 1, 100), 0.75, 1e-12);
  assert.strictEqual(R.gateCrossing(gate, 1, 0, -3, 0, 1, 100), -1);
  approx(R.gateCrossing(gate, 1, 0, -3, 0, -1, 100), 0.25, 1e-12);
  assert.strictEqual(R.gateCrossing(gate, -3, 150, 1, 150, 1, 100), -1, 'outside the gate span');
});

// ------------------------------------------------------------------ determinism

test('same seed + same inputs => bit-identical state; different seed => different race', () => {
  const inputs = [];
  const irng = new R.RNG(99);
  let bits = 0;
  for (let t = 0; t < 4000; t++) {
    if (t % 25 === 0) bits = irng.int(0, 31);
    inputs.push(bits);
  }
  const run = (seed) => {
    const w = new R.World({ seed });
    const hashes = [];
    for (let t = 0; t < inputs.length; t++) {
      w.step(inputs[t]);
      if (w.tick % 60 === 0) hashes.push(w.hash());
    }
    return hashes;
  };
  const a = run(2024), b = run(2024), c = run(2025);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a[a.length - 1], c[c.length - 1]);
});

test('simulation never touches Math.random or the clock', () => {
  const saved = { random: Math.random, now: Date.now };
  Math.random = () => { throw new Error('Math.random used in sim'); };
  Date.now = () => { throw new Error('Date.now used in sim'); };
  try {
    const w = new R.World({ seed: 77, track: 'procedural' });
    for (let i = 0; i < 900; i++) w.step(i % 7);
  } finally {
    Math.random = saved.random;
    Date.now = saved.now;
  }
});

test('world config is normalised (seed strings, lap bounds, unknown tracks)', () => {
  const w = new R.World({ seed: 'hello', laps: 999, track: 'nope' });
  assert.strictEqual(w.seed, R.parseSeed('hello'));
  assert.strictEqual(w.config.laps, 50);
  assert.strictEqual(w.track.id, 'classic');
});

// ------------------------------------------------------------------ AI & full races

test('full 3-lap race on the classic track: every car finishes with sane lap times', () => {
  const t0 = Date.now();
  const { w, wallHits } = runRace({ seed: 1337, autopilot: true });
  const ms = Date.now() - t0;
  assert.strictEqual(w.phase, 'finished');
  for (const car of w.cars) {
    assert.ok(car.finished, car.name + ' did not finish');
    assert.strictEqual(car.lapTimes.length, 3);
    for (const lt of car.lapTimes) assert.ok(lt / TPS > 18 && lt / TPS < 40, `${car.name} lap ${lt / TPS}s`);
  }
  const positions = w.standings.map((c) => c.position);
  assert.deepStrictEqual(positions, [1, 2, 3, 4]);
  for (let i = 1; i < w.standings.length; i++) assert.ok(w.standings[i].finishTime >= w.standings[i - 1].finishTime);
  assert.ok(wallHits.reduce((a, b) => a + b, 0) <= 8, 'too many wall hits: ' + wallHits);
  console.log(`      (${w.tick} ticks simulated in ${ms} ms ≈ ${Math.round(w.tick / TPS / (ms / 1000))}× real time)`);
});

test('AI finishes races on procedural tracks', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { w } = runRace({ seed, track: 'procedural', autopilot: true, laps: 2 });
    assert.strictEqual(w.phase, 'finished', 'seed ' + seed);
  }
});

test('AI recovers from being spun backwards or parked nose-first against a wall', () => {
  for (const scenario of ['backwards', 'wall']) {
    const w = new R.World({ seed: 21, autopilot: true });
    while (w.phase === 'countdown') w.step(0);
    const tr = w.track, car = w.cars[2];
    const p = tr.pointAt(3000);
    // Park the others far away so this is a solo recovery test.
    w.cars.forEach((c, i) => { if (c !== car) c.place(tr.pointAt(6000 + i * 200).x, tr.pointAt(6000 + i * 200).y, 0); });
    const heading = M.atan2(p.ty, p.tx);
    if (scenario === 'backwards') car.place(p.x, p.y, heading + Math.PI);
    else car.place(p.x + p.nx * (tr.halfWidth - 14), p.y + p.ny * (tr.halfWidth - 14), heading + M.HALF_PI);
    car.driver.idx = -1;
    w._initRaceState(car);
    const startS = car.trackS;
    for (let i = 0; i < 12 * TPS; i++) w.step(0);
    const progress = tr.deltaS(startS, car.trackS);
    assert.ok(progress > 800 || car.gatesPassed >= 3, `${scenario}: only ${progress.toFixed(0)} units of progress`);
  }
});
test('AI drivers get different personalities and racing lines per seed', () => {
  const w1 = new R.World({ seed: 1 }), w2 = new R.World({ seed: 2 });
  const p1 = w1.cars.slice(1).map((c) => c.driver.p.pace), p2 = w2.cars.slice(1).map((c) => c.driver.p.pace);
  assert.notDeepStrictEqual(p1, p2);
  assert.notStrictEqual(w1.cars[1].driver.line.length, w1.cars[2].driver.line.length);
});

// ------------------------------------------------------------------ run

let failed = 0;
const started = Date.now();
for (const t of tests) {
  const t0 = Date.now();
  try {
    t.fn();
    console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${t.name}\n      ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n      ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed in ${Date.now() - started} ms`);
process.exit(failed ? 1 : 0);
