/*
 * Headless test-suite for the simulation (no dependencies):   node test/run.js
 *
 * Covers: seeded RNG, track generation/validation, car dynamics, impulse collisions
 * (conservation laws + barrier containment), lap detection incl. anti-cheat, AI behaviour,
 * determinism and fixed-timestep invariance.
 */
'use strict';
const assert = require('assert');
const R = require('./load.js');

const CFG = R.CONFIG;
const DT = CFG.DT;
const CAR = CFG.CAR;

let passed = 0;
let failed = 0;
const only = process.argv[2];

function section(name) {
  console.log('\n' + name);
}

function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name + '  (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + '\n      ' + String(e.message).split('\n').join('\n      '));
  }
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + a + ' ≈ ' + b + ' (±' + tol + ')');
const mkCar = (v) => {
  const c = new R.Car(0);
  c.place(0, 0, 0);
  if (v) {
    c.vx = v;
    c.refreshVelocityFrame();
  }
  return c;
};
const noInput = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

// ---------------------------------------------------------------------------
section('RNG');

test('same seed -> same sequence, different seed -> different', () => {
  const a = new R.RNG(12345);
  const b = new R.RNG(12345);
  const c = new R.RNG(12346);
  let diff = 0;
  for (let i = 0; i < 1000; i++) {
    const x = a.next();
    assert.strictEqual(x, b.next());
    if (x !== c.next()) diff++;
    assert.ok(x >= 0 && x < 1);
  }
  assert.ok(diff > 990);
});

test('golden values (mulberry32 reference output; pins seeds across versions)', () => {
  const r = new R.RNG(12345);
  const got = [r.next(), r.next(), r.next()].map((v) => v.toFixed(10));
  assert.deepStrictEqual(got, ['0.9797282678', '0.3067522645', '0.4842054215']);
});

test('fork() streams are independent of how much the parent was used', () => {
  const a = new R.RNG(5);
  const b = new R.RNG(5);
  for (let i = 0; i < 100; i++) b.next();
  assert.strictEqual(a.fork('track').next(), b.fork('track').next());
  assert.notStrictEqual(a.fork('track').next(), a.fork('ai').next());
});

test('int() is inclusive and roughly uniform', () => {
  const r = new R.RNG(7);
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 12000; i++) count[r.int(1, 6)]++;
  assert.strictEqual(count[0], 0);
  for (let f = 1; f <= 6; f++) assert.ok(count[f] > 1700 && count[f] < 2300, 'face ' + f + ' = ' + count[f]);
});

test('parseSeed handles numbers, numeric strings and text', () => {
  assert.strictEqual(R.parseSeed(42), 42);
  assert.strictEqual(R.parseSeed('42'), 42);
  assert.strictEqual(R.parseSeed('hello'), R.parseSeed('hello'));
  assert.notStrictEqual(R.parseSeed('hello'), R.parseSeed('world'));
});

// ---------------------------------------------------------------------------
section('Track');

test('every seed 1..40 yields a valid, closed, drivable circuit', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const t = R.Track.generate(seed);
    assert.ok(!t.fallback, 'seed ' + seed + ' needed the fallback');
    assert.ok(t.validation.ok, 'seed ' + seed + ': ' + t.validation.reason);
    assert.ok(t.validation.minRadius >= CFG.TRACK.minRadius, 'radius seed ' + seed);
    assert.ok(t.validation.minSep >= CFG.TRACK.sepDist, 'separation seed ' + seed);
    assert.ok(t.length >= CFG.TRACK.minLength && t.length <= CFG.TRACK.maxLength);
    // closed: last sample is one spacing from the first
    const close = Math.hypot(t.px[t.n - 1] - t.px[0], t.py[t.n - 1] - t.py[0]);
    assert.ok(close < t.ds * 1.5, 'loop not closed for seed ' + seed);
  }
});

test('the fallback shape is itself valid', () => {
  const t = R.Track.generate(1, Object.assign({}, CFG.TRACK, { maxAttempts: 0 }));
  assert.ok(t.fallback);
  assert.ok(t.validation.ok, t.validation.reason);
});

test('generation is deterministic; seeds differ', () => {
  const h = (s) => R.Track.generate(s).hash();
  assert.strictEqual(h(3), h(3));
  assert.strictEqual(h('abc'), h('abc'));
  const set = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(h));
  assert.strictEqual(set.size, 8);
});

test('start line sits on a straight', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t = R.Track.generate(seed);
    const span = Math.round(300 / t.ds);
    for (let k = -span; k <= Math.round(120 / t.ds); k++) {
      const i = (k + t.n * 2) % t.n;
      assert.ok(Math.abs(t.curv[i]) < 1 / 500, 'seed ' + seed + ' curvature near the start line: R=' + (1 / Math.abs(t.curv[i])).toFixed(0));
    }
  }
});

test('windowed nearest() agrees with a brute-force global search', () => {
  const t = R.Track.generate(9);
  const rng = new R.RNG(1);
  const a = {};
  const b = {};
  for (let k = 0; k < 400; k++) {
    const i = rng.int(0, t.n - 1);
    const off = rng.range(-(t.wallHalf + 10), t.wallHalf + 10);
    const x = t.px[i] + t.nx[i] * off;
    const y = t.py[i] + t.ny[i] * off;
    t.nearest(x, y, i + rng.int(-5, 5), 10, a);
    t.locate(x, y, b);
    near(a.dist, b.dist, 1e-9, 'dist');
    near(a.s, b.s, 1e-6, 's');
  }
});

test('pointAt() and nearest() round-trip arc length and lateral offset', () => {
  const t = R.Track.generate(4);
  const p = {};
  const q = {};
  for (let s = -500; s < t.length + 500; s += 137) {
    for (const off of [-60, -10, 0, 25, 64]) {
      t.pointAt(s, off, p);
      t.locate(p.x, p.y, q);
      const sw = ((s % t.length) + t.length) % t.length;
      let ds = q.s - sw;
      if (ds > t.length / 2) ds -= t.length;
      if (ds < -t.length / 2) ds += t.length;
      near(ds, 0, 1.5, 's @' + s + ',' + off);
      near(q.d, off, 1.0, 'd @' + s + ',' + off);
    }
  }
});

test('gate crossing: direction, interpolation, and the barrier-width extent', () => {
  const t = R.Track.generate(2);
  const g = t.gates[0];
  const fr = { frac: 0 };
  // cross forward along the tangent: from 3 px before the line to 1 px after
  const x0 = g.x - g.tx * 3;
  const y0 = g.y - g.ty * 3;
  const x1 = g.x + g.tx * 1;
  const y1 = g.y + g.ty * 1;
  assert.strictEqual(t.gateCrossing(g, x0, y0, x1, y1, fr), 1);
  near(fr.frac, 0.75, 1e-9, 'frac');
  assert.strictEqual(t.gateCrossing(g, x1, y1, x0, y0, fr), -1);
  assert.strictEqual(t.gateCrossing(g, x0, y0, x0, y0, fr), 0);
  // far to the side (outside the corridor) is not a crossing
  const wide = g.halfExtent + 20;
  assert.strictEqual(t.gateCrossing(g, x0 + g.nx * wide, y0 + g.ny * wide, x1 + g.nx * wide, y1 + g.ny * wide, fr), 0);
  // exactly on the line counts once
  assert.strictEqual(t.gateCrossing(g, g.x - g.tx * 2, g.y - g.ty * 2, g.x, g.y, fr), 1);
  assert.strictEqual(t.gateCrossing(g, g.x, g.y, g.x + g.tx * 2, g.y + g.ty * 2, fr), 0);
});

// ---------------------------------------------------------------------------
section('Car dynamics');

test('accelerates smoothly to a terminal speed (no overshoot)', () => {
  const c = mkCar();
  c.input.throttle = 1;
  const term = R.Car.terminalSpeed();
  let prev = 0;
  let t300 = 0;
  for (let i = 0; i < 14 * 120; i++) {
    c.step(DT);
    assert.ok(c.vF >= prev - 1e-9, 'speed must not decrease under full throttle');
    assert.ok(c.vF <= term + 0.5, 'overshoot');
    prev = c.vF;
    if (!t300 && c.vF > 300) t300 = i * DT;
  }
  near(c.vF, term, 1, 'terminal');
  assert.ok(term > 420 && term < 560, 'terminal ' + term);
  assert.ok(t300 > 0.9 && t300 < 2.2, '0-300 took ' + t300);
});

test('brakes to a stop and then reverses (capped), brake never flips sign instantly', () => {
  const c = mkCar(450);
  c.input.brake = 1;
  let i = 0;
  while (c.vF > 1 && i++ < 5 * 120) c.step(DT);
  assert.ok(i * DT < 1.2, 'stopping took ' + i * DT);
  assert.ok(c.x > 60 && c.x < 400, 'braking distance ' + c.x);
  for (let k = 0; k < 6 * 120; k++) c.step(DT);
  assert.ok(c.vF < -100 && c.vF >= -CAR.reverseMax - 1, 'reverse speed ' + c.vF);
});

test('coasting decelerates gently; with nothing pressed the car comes to rest', () => {
  const c = mkCar(300);
  for (let i = 0; i < 40 * 120; i++) c.step(DT);
  assert.strictEqual(c.vF, 0);
  assert.ok(c.vx === 0 || Math.abs(c.vx) < 1e-9);
});

test('low-speed turning radius = wheelbase / tan(max steer)', () => {
  const c = mkCar(60);
  c.input.steer = 1;
  for (let i = 0; i < 2 * 120; i++) {
    c.input.throttle = c.vF < 60 ? 1 : 0;
    c.step(DT);
  }
  const radius = c.speed / Math.abs(c.omega);
  near(radius, CAR.wheelbase / CAR.maxTanSteer, 6, 'radius');
  assert.ok(c.omega > 0, 'positive steer turns clockwise (to the right on screen)');
});

test('steering lock shrinks with speed so cornering stays near the grip limit', () => {
  for (const v of [200, 300, 400, 500]) {
    const lim = R.Car.steerLimit(v);
    const aLat = (v * v * lim) / CAR.wheelbase;
    assert.ok(aLat <= CAR.steerOverGrip * CAR.gripLat * 1.001 + 1e-6, 'v=' + v + ' aLat=' + aLat);
  }
  assert.ok(R.Car.steerLimit(500) < R.Car.steerLimit(100));
});

test('the tyres saturate: hard cornering at speed produces slip, then it recovers', () => {
  const c = mkCar(420);
  c.input.steer = 1;
  let maxSlip = 0;
  for (let i = 0; i < 90; i++) {
    c.input.throttle = c.vF < 420 ? 1 : 0;
    c.step(DT);
    maxSlip = Math.max(maxSlip, Math.abs(c.vL));
  }
  assert.ok(maxSlip > 25, 'expected some slide, got ' + maxSlip);
  c.input.steer = 0;
  c.input.throttle = 1;
  for (let i = 0; i < 120; i++) c.step(DT);
  assert.ok(Math.abs(c.vL) < 3, 'should regain grip, vL=' + c.vL);
});

test('handbrake breaks the rear loose (big slip, big heading change)', () => {
  const a = mkCar(400);
  const b = mkCar(400);
  a.input.steer = b.input.steer = 1;
  b.input.handbrake = 1;
  let slipA = 0;
  let slipB = 0;
  for (let i = 0; i < 40; i++) {
    a.step(DT);
    b.step(DT);
    slipA = Math.max(slipA, Math.abs(a.vL));
    slipB = Math.max(slipB, Math.abs(b.vL));
  }
  assert.ok(slipB > slipA * 1.5, 'handbrake slip ' + slipB + ' vs ' + slipA);
  assert.ok(b.angle > a.angle, 'handbrake rotates the car more');
});

test('grass: lower top speed, less grip', () => {
  const road = mkCar();
  const grass = mkCar();
  grass.offFrac = 1;
  road.input.throttle = grass.input.throttle = 1;
  for (let i = 0; i < 15 * 120; i++) {
    road.step(DT);
    grass.step(DT);
  }
  assert.ok(grass.vF < road.vF * 0.5, 'grass ' + grass.vF + ' road ' + road.vF);
});

test('stays finite under 20 s of random button mashing', () => {
  const rng = new R.RNG(5);
  const c = mkCar();
  for (let i = 0; i < 20 * 120; i++) {
    if (i % 15 === 0) {
      c.input.throttle = rng.int(0, 1);
      c.input.brake = rng.int(0, 1);
      c.input.steer = rng.int(-1, 1);
      c.input.handbrake = rng.int(0, 1);
    }
    c.step(DT);
    assert.ok(Number.isFinite(c.x + c.y + c.angle + c.vx + c.vy + c.omega));
    assert.ok(c.speed < 600);
  }
});

// ---------------------------------------------------------------------------
section('Collisions (impulse resolution)');

function pair(ax, ay, aa, avx, avy, bx, by, ba, bvx, bvy) {
  const a = new R.Car(0);
  const b = new R.Car(1);
  a.place(ax, ay, aa);
  b.place(bx, by, ba);
  a.vx = avx; a.vy = avy; b.vx = bvx; b.vy = bvy;
  return [a, b];
}
const momentum = (a, b) => [a.mass * a.vx + b.mass * b.vx, a.mass * a.vy + b.mass * b.vy];
const energy = (a, b) =>
  [a, b].reduce((e, c) => e + 0.5 * c.mass * (c.vx * c.vx + c.vy * c.vy) + 0.5 * c.inertia * c.omega * c.omega, 0);

test('contact impulse matches the analytic solution (centre hit on a static wall)', () => {
  const car = mkCar();
  car.vx = -100;
  // wall normal points +x (out of the wall); contact point at the centre of mass
  const j = R.Collision.applyContactImpulse(car, null, car.x, car.y, 1, 0, 0.3, 0.0);
  near(car.vx, 30, 1e-9, 'restitution 0.3');
  near(j, 1.3 * 100 * car.mass, 1e-6, 'impulse');
  assert.strictEqual(car.omega, 0);
  // already separating -> no impulse
  assert.strictEqual(R.Collision.applyContactImpulse(car, null, car.x, car.y, 1, 0, 0.3, 0), 0);
});

test('slow impacts are inelastic (no jitter)', () => {
  const car = mkCar();
  car.vx = -10;
  R.Collision.applyContactImpulse(car, null, car.x, car.y, 1, 0, 0.9, 0);
  near(car.vx, 0, 1e-9);
});

test('head-on: momentum conserved, energy not created, bodies separate', () => {
  const [a, b] = pair(0, 0, 0, 200, 0, 40, 0, Math.PI, -200, 0);
  const p0 = momentum(a, b);
  const e0 = energy(a, b);
  const j = R.Collision.solveCarCar(a, b);
  assert.ok(j > 0, 'contact expected');
  const p1 = momentum(a, b);
  near(p1[0], p0[0], 1e-6, 'px');
  near(p1[1], p0[1], 1e-6, 'py');
  assert.ok(energy(a, b) < e0, 'energy must drop for e<1');
  assert.ok(a.vx < 0 && b.vx > 0, 'they bounce apart');
  near(a.vx, -CFG.COLLISION.carRestitution * 200, 2, 'restitution');
});

test('rear-end: the shunted car speeds up, the shunter slows, momentum conserved', () => {
  const [a, b] = pair(0, 0, 0, 300, 0, 40, 0, 0, 100, 0);
  const p0 = momentum(a, b);
  assert.ok(R.Collision.solveCarCar(a, b) > 0);
  near(momentum(a, b)[0], p0[0], 1e-6);
  assert.ok(a.vx < 300 && b.vx > 100);
  assert.ok(a.vx <= b.vx + 1e-9, 'they must not pass through each other');
});

test('off-centre hit transfers spin; linear and angular momentum are conserved by the impulse', () => {
  // B rolls into the side of a stationary A, near its nose; contact point on A's flank
  const [a, b] = pair(0, 0, 0, 0, 0, 10, 28, -Math.PI / 2, 0, -250);
  const px = 10;
  const py = 10; // contact point between the bodies
  const about = (c) => c.mass * ((c.x - px) * c.vy - (c.y - py) * c.vx) + c.inertia * c.omega; // L about p
  const p0 = momentum(a, b);
  const L0 = about(a) + about(b);
  const j = R.Collision.applyContactImpulse(a, b, px, py, 0, -1, CFG.COLLISION.carRestitution, CFG.COLLISION.carFriction);
  assert.ok(j > 0);
  const p1 = momentum(a, b);
  near(p1[0], p0[0], 1e-6, 'px');
  near(p1[1], p0[1], 1e-6, 'py');
  near(about(a) + about(b), L0, Math.abs(L0) * 1e-9 + 1e-3, 'angular momentum');
  assert.ok(Math.abs(a.omega) > 0.05, 'the struck car must start to spin, got ' + a.omega);
  // and the full pair solver gives the struck car a spin too
  const [a2, b2] = pair(0, 0, 0, 0, 0, 10, 28, -Math.PI / 2, 0, -250);
  assert.ok(R.Collision.solveCarCar(a2, b2) > 0);
  assert.ok(Math.abs(a2.omega) > 0.05);
});

test('overlapping, motionless cars are pushed apart', () => {
  const [a, b] = pair(0, 0, 0, 0, 0, 12, 4, 0.3, 0, 0);
  for (let i = 0; i < 30; i++) R.Collision.solveCarCar(a, b);
  const rr = 2 * CAR.circleRadius;
  let minD = Infinity;
  for (let i = 0; i < CAR.circleOffsets.length; i++)
    for (let k = 0; k < CAR.circleOffsets.length; k++)
      minD = Math.min(minD, Math.hypot(a.circleX(i) - b.circleX(k), a.circleY(i) - b.circleY(k)));
  assert.ok(minD > rr - 1.5, 'residual overlap ' + (rr - minD));
});

test('cars that are apart are untouched', () => {
  const [a, b] = pair(0, 0, 0, 100, 0, 200, 0, 0, 0, 0);
  assert.strictEqual(R.Collision.solveCarCar(a, b), 0);
  assert.strictEqual(a.vx, 100);
});

test('barrier: a car driven straight at the wall never gets through and loses speed', () => {
  const track = R.Track.generate(6);
  const car = new R.Car(0);
  const p = {};
  const q = {};
  track.pointAt(-100, 0, p);
  car.place(p.x, p.y, p.angle + Math.PI / 2); // facing the +normal barrier
  car.vx = Math.cos(car.angle) * 380;
  car.vy = Math.sin(car.angle) * 380;
  track.locate(car.x, car.y, q);
  car.hint = q.i;
  car.input.throttle = 1;
  let hits = 0;
  let worst = 0;
  for (let i = 0; i < 6 * 120; i++) {
    car.step(DT);
    if (R.Collision.solveCarWall(car, track) > 0) hits++;
    track.nearest(car.x, car.y, car.hint, 12, q);
    car.hint = q.i;
    worst = Math.max(worst, q.dist + CAR.circleRadius - track.wallHalf);
  }
  assert.ok(hits > 0, 'should have hit the barrier');
  assert.ok(worst < 6, 'penetrated ' + worst + ' px');
  assert.ok(car.speed < 200, 'speed after the crash ' + car.speed);
});

test('barrier: glancing contact scrapes (loses less speed than head-on)', () => {
  const track = R.Track.generate(6);
  const run = (angleOff) => {
    const car = new R.Car(0);
    const p = {};
    const q = {};
    track.pointAt(-200, track.wallHalf - 40, p);
    car.place(p.x, p.y, p.angle + angleOff);
    car.vx = Math.cos(car.angle) * 400;
    car.vy = Math.sin(car.angle) * 400;
    track.locate(car.x, car.y, q);
    car.hint = q.i;
    let worst = 0;
    for (let i = 0; i < 90; i++) {
      car.input.throttle = 1;
      car.step(DT);
      R.Collision.solveCarWall(car, track);
      track.nearest(car.x, car.y, car.hint, 12, q);
      car.hint = q.i;
      worst = Math.max(worst, q.dist + CAR.circleRadius - track.wallHalf);
    }
    assert.ok(worst < 6, 'penetration ' + worst);
    return car.speed;
  };
  assert.ok(run(0.12) > run(Math.PI / 2) + 100, 'glancing should keep far more speed');
});

// ---------------------------------------------------------------------------
section('Lap detection');

function ghost(race, car, fromS, toS, off, state, jump) {
  // Move `car` along the centreline in 4 px steps through the real progress/gate code.
  // Call n moves the car during tick n-1 (so arriving at s_j happens at time j * DT).
  // jump=true first teleports (no gate checks), like respawning at another part of the track.
  const p = {};
  const q = {};
  const step = fromS <= toS ? 4 : -4;
  let first = true;
  for (let s = fromS; step > 0 ? s <= toS : s >= toS; s += step) {
    race.track.pointAt(s, off || 0, p);
    if (first && jump) {
      car.place(p.x, p.y, p.angle);
      race.track.locate(car.x, car.y, q);
      car.hint = q.i;
      car.sPrev = q.s;
      first = false;
      continue;
    }
    first = false;
    car.savePrev();
    car.x = p.x;
    car.y = p.y;
    car.angle = p.angle;
    race._updateProgress(car, state.k++);
  }
  race._updateOrder();
}
function fresh(opts) {
  const race = new R.Race(Object.assign({ seed: 5, laps: 2 }, opts));
  const car = race.player;
  // put the player exactly 40 px behind the line (so ghost distances are easy to reason about)
  const p = {};
  race.track.pointAt(-40, 0, p);
  car.place(p.x, p.y, p.angle);
  const q = {};
  race.track.locate(car.x, car.y, q);
  car.hint = q.i;
  car.sPrev = q.s;
  car.progress = -40;
  return { race, car, state: { k: -1 } };
}

test('a full lap in gate order is counted once, with an exact (sub-tick) lap time', () => {
  const { race, car, state } = fresh();
  const L = race.track.length;
  ghost(race, car, -40, L + 100, 0, state);
  assert.strictEqual(car.lapsDone, 1);
  assert.strictEqual(car.cp, CFG.GATES + 1);
  assert.strictEqual(car.lapTimes.length, 1);
  near(car.lapTimes[0], ((L + 40) / 4) * DT, DT, 'lap time');
  assert.ok(!car.finished);
  near(car.progress, L + 100, 5, 'unrolled progress');
});

test('finishing the race: flag, finish time, finish order', () => {
  const { race, car, state } = fresh({ laps: 2 });
  const L = race.track.length;
  ghost(race, car, -40, 2 * L + 50, 0, state);
  assert.strictEqual(car.lapsDone, 2);
  assert.ok(car.finished);
  assert.strictEqual(car.finishOrder, 1);
  assert.strictEqual(race.finishedCount, 1);
  assert.ok(car.finishTime > 0 && race.order[0] === car);
  const after = car.cp;
  ghost(race, car, 2 * L + 50, 3 * L, 0, state); // keeps driving: no extra laps
  assert.strictEqual(car.lapsDone, 2);
  assert.strictEqual(car.cp, after);
});

test('shortcut protection: skipping gates means the line does not count', () => {
  const { race, car, state } = fresh();
  const T = race.track;
  const G = T.gates;
  ghost(race, car, -40, G[1].s + 60, 0, state); // legit: gates 0 and 1
  assert.strictEqual(car.cp, 2);
  // "teleport" to just past gate 6, skipping 2..5, and drive to the finish line
  ghost(race, car, G[6].s + 60, T.length + 60, 0, state, true);
  assert.strictEqual(car.lapsDone, 0, 'no lap for a skipped sector');
  assert.strictEqual(car.cp, 2);
});

test('reversing over the line cannot be farmed (backward crossings un-count)', () => {
  const { race, car, state } = fresh();
  ghost(race, car, -40, 40, 0, state);
  assert.strictEqual(car.cp, 1);
  for (let i = 0; i < 5; i++) {
    ghost(race, car, 40, -40, 0, state);
    assert.strictEqual(car.cp, 0);
    ghost(race, car, -40, 40, 0, state);
    assert.strictEqual(car.cp, 1);
  }
  assert.strictEqual(car.lapsDone, 0);
});

test('backing up over the line after completing a lap takes the lap back', () => {
  const { race, car, state } = fresh();
  const L = race.track.length;
  ghost(race, car, -40, L + 40, 0, state);
  assert.strictEqual(car.lapsDone, 1);
  ghost(race, car, L + 40, L - 40, 0, state);
  assert.strictEqual(car.lapsDone, 0);
  assert.strictEqual(car.lapTimes.length, 0);
  assert.strictEqual(car.bestLap, Infinity);
  ghost(race, car, L - 40, L + 40, 0, state);
  assert.strictEqual(car.lapsDone, 1);
});

test('lateral position does not matter (gates span the whole corridor)', () => {
  for (const off of [-60, 60]) {
    const { race, car, state } = fresh();
    const L = race.track.length;
    // start from the right place for that offset
    ghost(race, car, -40, L + 100, off, state);
    assert.strictEqual(car.lapsDone, 1, 'offset ' + off);
  }
});

test('standings: finished cars first (by finish time), then by distance covered', () => {
  const race = new R.Race({ seed: 8, laps: 1 });
  const [p, a, b, c] = race.cars;
  p.progress = 500; a.progress = 900; b.progress = 100; c.progress = -50;
  race._updateOrder();
  assert.deepStrictEqual(race.order.map((x) => x.id), [a.id, p.id, b.id, c.id]);
  assert.deepStrictEqual(race.order.map((x) => x.position), [1, 2, 3, 4]);
  // c finishes: ahead of everyone regardless of progress; earlier finisher beats later
  c.finished = true; c.finishTime = 70;
  b.finished = true; b.finishTime = 65;
  race._updateOrder();
  assert.deepStrictEqual(race.order.map((x) => x.id), [b.id, c.id, a.id, p.id]);
});

test('the grid: all four cars behind the line, none overlapping, seed-dependent order', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const race = new R.Race({ seed });
    orders.add(race.cars.map((c) => c.gridSlot).join(''));
    for (const c of race.cars) assert.ok(c.progress < 0 && c.progress > -200, 'behind the line');
    for (let i = 0; i < 4; i++)
      for (let k = i + 1; k < 4; k++) {
        const A = race.cars[i];
        const B = race.cars[k];
        assert.strictEqual(R.Collision.solveCarCar(A, B), 0, 'grid cars touching, seed ' + seed);
      }
  }
  assert.ok(orders.size > 6, 'grid order should vary with the seed');
});

// ---------------------------------------------------------------------------
section('AI & full races');

function raceAll(seed, laps, mod) {
  const race = new R.Race({ seed, laps, autoPlayer: true });
  if (mod) mod(race);
  const limit = 400 / DT;
  let worst = 0;
  const q = {};
  while (!race.allFinished && race.tick < limit) {
    race.step();
    for (const c of race.cars) {
      assert.ok(Number.isFinite(c.x + c.y + c.vx + c.vy + c.omega + c.angle), 'NaN in sim');
      race.track.nearest(c.x, c.y, c.hint, 12, q);
      worst = Math.max(worst, q.dist + CAR.circleRadius - race.track.wallHalf);
    }
  }
  return { race, worst };
}

test('AI-only races finish on 12 different tracks, stay inside the barrier', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { race, worst } = raceAll(seed, 2);
    assert.ok(race.allFinished, 'seed ' + seed + ' did not finish');
    assert.ok(worst < 6, 'seed ' + seed + ' penetrated the barrier by ' + worst);
    assert.ok(race.stats.wallHits <= 4, 'seed ' + seed + ': ' + race.stats.wallHits + ' wall hits');
    const reversals = race.drivers.reduce((s, d) => s + d.reversals, 0);
    assert.ok(reversals <= 1, 'AI got stuck ' + reversals + ' times on seed ' + seed);
    // classification is consistent: finish order == sorted by finish time
    const times = race.order.map((c) => c.finishTime);
    assert.deepStrictEqual(times.slice().sort((x, y) => x - y), times);
    for (const c of race.cars) {
      assert.strictEqual(c.lapTimes.length, 2);
      assert.ok(c.bestLap > 12 && c.bestLap < 50, 'lap time ' + c.bestLap);
    }
  }
});

test('AI laps are quick but not superhuman (comparable to the physics limit)', () => {
  const { race } = raceAll(3, 2);
  const mean = race.cars.reduce((s, c) => s + race.track.length / c.bestLap, 0) / 4;
  assert.ok(mean > 250 && mean < R.Car.terminalSpeed(), 'mean lap speed ' + mean);
});

test('AI recovers when stuck facing the barrier', () => {
  const race = new R.Race({ seed: 11, laps: 2 });
  race.phase = 'racing';
  race.tick = race.startTick + 300;
  const ai = race.cars[1];
  const p = {};
  const q = {};
  race.track.pointAt(1500, race.track.halfWidth + 25, p);
  ai.place(p.x, p.y, p.angle + Math.PI / 2);
  race.track.locate(ai.x, ai.y, q);
  ai.hint = q.i;
  ai.sPrev = q.s;
  for (let i = 0; i < 12 / DT; i++) race.step(noInput);
  assert.ok(race.drivers[1].reversals >= 1, 'reverse manoeuvre expected');
  assert.ok(Math.abs(ai.d) < race.track.halfWidth + 5, 'back on the road, d=' + ai.d);
  assert.ok(ai.speed > 120, 'moving again, speed=' + ai.speed);
});

test('AI overtakes a much slower car instead of following it for ever', () => {
  const race = new R.Race({ seed: 2, laps: 3, autoPlayer: true });
  race.drivers[1].skill = 0.55; // a rolling roadblock
  race.drivers[1].bias = 0;
  const slow = race.cars[1];
  const limit = 200 / DT;
  while (!race.allFinished && race.tick < limit) race.step();
  assert.ok(slow.position === 4, 'slow car should end last, got P' + slow.position);
  assert.ok(race.cars.filter((c) => c !== slow).every((c) => c.finished), 'the others must get past and finish');
});

test('rubber-banding is mild and only applies to AI cars behind/ahead of the human', () => {
  const race = new R.Race({ seed: 1 });
  const [h, a] = race.cars;
  h.progress = 3000; a.progress = 0;
  near(race.rubberFactor(a), 1 + CFG.AI.rubber, 1e-12);
  a.progress = 6000;
  near(race.rubberFactor(a), 1 - CFG.AI.rubber, 1e-12);
  assert.strictEqual(race.rubberFactor(h), 1);
});

test('after the flag the human car is taken over by the autopilot (and slows down)', () => {
  const race = new R.Race({ seed: 4, laps: 1 });
  race.phase = 'racing';
  race.tick = race.startTick;
  race.player.finished = true;
  for (let i = 0; i < 6 / DT; i++) race.step(Object.assign({}, noInput, { brake: 1 })); // human input ignored
  assert.ok(race.player.speed > 100, 'autopilot should be driving, speed ' + race.player.speed);
  assert.ok(race.player.speed < CFG.AI.cooldownSpeed + 40, 'cool-down pace');
});

// ---------------------------------------------------------------------------
section('Determinism & fixed timestep');

function scripted(i) {
  // a fixed, non-trivial player input stream
  return {
    throttle: i % 400 < 330 ? 1 : 0,
    brake: i % 400 >= 330 ? 1 : 0,
    steer: Math.sin(i / 90) > 0.3 ? 1 : Math.sin(i / 90) < -0.3 ? -1 : 0,
    handbrake: i % 977 > 940 ? 1 : 0,
  };
}
function trace(seed, ticks) {
  const race = new R.Race({ seed, laps: 3 });
  const out = [];
  for (let i = 0; i < ticks; i++) {
    race.step(scripted(i));
    if (i % 120 === 0) out.push(race.stateHash());
  }
  out.push(race.stateHash());
  return out;
}

test('same seed + same input => bit-identical simulation', () => {
  assert.deepStrictEqual(trace(77, 30 * 120), trace(77, 30 * 120));
});

test('different seeds diverge', () => {
  const a = trace(77, 10 * 120);
  const b = trace(78, 10 * 120);
  assert.notStrictEqual(a[a.length - 1], b[b.length - 1]);
  assert.notStrictEqual(a[0], b[0]);
});

test('simulation never reads Math.random / Date / performance (the seeded RNG is the only entropy)', () => {
  const trap = (what) => () => { throw new Error(what + ' called inside the simulation'); };
  const saved = [[Math, 'random', Math.random], [Date, 'now', Date.now], [globalThis.performance, 'now', globalThis.performance.now]];
  Math.random = trap('Math.random');
  Date.now = trap('Date.now');
  globalThis.performance.now = trap('performance.now');
  try {
    const race = new R.Race({ seed: 21 });
    for (let i = 0; i < 20 * 120; i++) race.step(scripted(i));
    new R.Race({ seed: 'any text seed', autoPlayer: true }).step();
  } finally {
    for (const [obj, key, fn] of saved) obj[key] = fn;
  }
});

test('frame rate does not matter: any frame-time pattern gives the same tick count and state', () => {
  const total = 20; // seconds of wall-clock time to feed in
  const patterns = {
    '60 Hz': () => 1 / 60,
    '144 Hz': () => 1 / 144,
    '30 Hz': () => 1 / 30,
    'jittery': (() => { const r = new R.RNG(3); return () => r.range(0.002, 0.04); })(),
  };
  // Tick counts per pattern, then compare each to a reference run with exactly that many ticks.
  for (const [name, next] of Object.entries(patterns)) {
    const race = new R.Race({ seed: 31 });
    const stepper = new R.FixedStepper(DT, CFG.MAX_FRAME);
    let ticks = 0;
    let fed = 0;
    while (fed < total) {
      const dtf = next();
      fed += dtf;
      ticks += stepper.advance(dtf, () => race.step(scripted(race.tick)));
    }
    assert.strictEqual(race.tick, ticks);
    assert.ok(Math.abs(ticks * DT - fed) <= DT + 1e-9 + 0, name + ': ticks*dt=' + ticks * DT + ' fed=' + fed);
    const ref = new R.Race({ seed: 31 });
    for (let i = 0; i < ticks; i++) ref.step(scripted(i));
    assert.strictEqual(race.stateHash(), ref.stateHash(), name + ' diverged from the fixed-step reference');
  }
});

test('FixedStepper: clamps huge frames (spiral of death) and exposes the leftover as alpha', () => {
  const s = new R.FixedStepper(DT, 0.25);
  let n = 0;
  assert.strictEqual(s.advance(10, () => n++), Math.floor(0.25 / DT + 1e-9));
  s.reset();
  assert.strictEqual(s.advance(DT * 2.5, () => n++), 2);
  near(s.alpha, 0.5, 1e-6, 'alpha');
  assert.strictEqual(s.advance(-1, () => n++), 0);
});

// ---------------------------------------------------------------------------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
