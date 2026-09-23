'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../simulation');

function runningRace(seed = 2048) {
  const race = S.createRace(seed);
  S.startRace(race);
  for (let i = 0; i < 360; i++) S.stepRace(race);
  return race;
}

function crossGate(race, car, gateIndex, direction = 1, lane = 0) {
  const gate = race.track.gates[gateIndex];
  car.prevX = gate.x - gate.tx * direction * 2 - gate.ty * lane;
  car.prevY = gate.y - gate.ty * direction * 2 + gate.tx * lane;
  car.x = gate.x + gate.tx * direction * 2 - gate.ty * lane;
  car.y = gate.y + gate.ty * direction * 2 + gate.tx * lane;
  race.time += 1;
  S.updateLapProgress(race, car);
}

test('seeded random stream is reproducible, including a zero seed', () => {
  for (const seed of [0, 2048, 4294967295]) {
    const a = S.seededRandom(seed), b = S.seededRandom(seed);
    const sequence = Array.from({ length: 100 }, () => a());
    assert.deepEqual(sequence, Array.from({ length: 100 }, () => b()));
    assert.ok(sequence.every(n => n >= 0 && n < 1));
    assert.ok(new Set(sequence).size > 90);
  }
  assert.notEqual(S.seededRandom(0)(), S.seededRandom(2048)());
});

test('race contains one player, three AI rivals, and an exact three-second countdown', () => {
  const race = S.createRace();
  assert.equal(race.cars.filter(car => car.ai).length, 3);
  assert.equal(race.cars.filter(car => !car.ai).length, 1);
  const before = JSON.stringify(race.cars);
  S.stepRace(race, { throttle: 1 });
  assert.equal(JSON.stringify(race.cars), before);
  S.startRace(race);
  for (let i = 0; i < 359; i++) S.stepRace(race, { throttle: 1 });
  assert.equal(race.phase, 'countdown');
  assert.equal(race.time, 0);
  assert.equal(JSON.stringify(race.cars), before);
  S.stepRace(race);
  assert.equal(race.phase, 'racing');
  assert.equal(race.time, 0);
  S.stepRace(race, { throttle: 1 });
  assert.equal(race.time, S.DT);
});

test('same seed and input history produce exactly the same entire simulation', () => {
  const a = runningRace(120), b = runningRace(120);
  for (let tick = 0; tick < 4800; tick++) {
    const input = { throttle: tick % 550 < 460 ? 1 : 0, brake: tick % 550 >= 460 ? 1 : 0,
      steer: Math.sin(tick / 170), handbrake: tick % 431 < 30 };
    S.stepRace(a, input); S.stepRace(b, input);
  }
  assert.deepEqual(a, b);
  assert.notEqual(S.createRace(120).cars[1].aiPace, S.createRace(121).cars[1].aiPace);
});

test('30, 60, 144 Hz, and jittered rendering produce identical fixed-tick states', () => {
  function replay(frameDeltas) {
    const race = runningRace(15);
    const clock = new S.FixedStepper(() => S.stepRace(race, { throttle: 1, steer: Math.sin(race.ticks / 180) * .5 }));
    for (const delta of frameDeltas) clock.advance(delta);
    return race;
  }
  const sixty = replay(Array(600).fill(1 / 60));
  assert.equal(sixty.ticks, 1200);
  assert.deepEqual(sixty, replay(Array(300).fill(1 / 30)));
  assert.deepEqual(sixty, replay(Array(1440).fill(1 / 144)));
  assert.deepEqual(sixty, replay(Array.from({ length: 600 }, (_, i) => i % 2 ? 1 / 40 : 1 / 120)));
});

test('fixed-step clock caps catch-up after a long frame', () => {
  let count = 0;
  const clock = new S.FixedStepper(() => count++);
  assert.equal(clock.advance(10).count, 30);
  assert.equal(count, 30);
  clock.reset(); assert.equal(clock.accumulator, 0);
  assert.equal(clock.advance(-1).count, 0);
});

test('pause freezes race physics and race time', () => {
  const race = runningRace(); S.stepRace(race, { throttle: 1 }); race.paused = true;
  const before = JSON.stringify({ cars: race.cars, ticks: race.ticks, time: race.time });
  for (let i = 0; i < 500; i++) S.stepRace(race, { throttle: 1, steer: 1 });
  assert.equal(JSON.stringify({ cars: race.cars, ticks: race.ticks, time: race.time }), before);
});

test('acceleration, braking, reverse, and speed-sensitive steering respond to input', () => {
  const track = { halfWidth: 57, segments: [{ x: -1e6, y: 0, dx: 2e6, dy: 0, len: 2e6, s: 0, tx: 1, ty: 0 }] };
  const car = S.createRace().cars[0];
  Object.assign(car, { x: 0, y: 0, angle: 0, omega: 0 });
  S.integrateCar(car, { steer: 1 }, track);
  assert.equal(car.angle, 0, 'stationary steering must not rotate the car');
  for (let i = 0; i < 360; i++) S.integrateCar(car, { throttle: 1 }, track);
  assert.ok(car.vx > 300 && car.vx <= 355);
  for (let i = 0; i < 60; i++) S.integrateCar(car, { brake: 1 }, track);
  assert.ok(car.vx > 0 && car.vx < 200);
  for (let i = 0; i < 240; i++) S.integrateCar(car, { brake: 1 }, track);
  assert.ok(car.vx < -60 && car.vx >= -80);
  for (let i = 0; i < 120; i++) S.integrateCar(car, { throttle: 1, steer: 1 }, track);
  assert.ok(Math.abs(car.angle) > .05);
});

test('head-on impulse conserves linear momentum and dissipates energy', () => {
  const [a, b] = S.createRace().cars;
  Object.assign(a, { x: -20, y: 0, angle: 0, vx: 100, vy: 0, omega: 0 });
  Object.assign(b, { x: 20, y: 0, angle: 0, vx: -100, vy: 0, omega: 0 });
  assert.equal(S.resolveCarCollision(a, b), true);
  assert.ok(Math.abs(a.vx + b.vx) < 1e-10);
  assert.ok(a.vx < 0 && b.vx > 0, 'cars must bounce apart');
  assert.ok(a.vx ** 2 + b.vx ** 2 < 20000);
  assert.ok(b.x - a.x > 40, 'penetration must be corrected');
});

test('separating and coincident cars resolve without attracting or producing NaN', () => {
  const [a, b] = S.createRace().cars;
  Object.assign(a, { x: -20, y: 0, angle: 0, vx: -100, vy: 0, omega: 0 });
  Object.assign(b, { x: 20, y: 0, angle: 0, vx: 100, vy: 0, omega: 0 });
  S.resolveCarCollision(a, b);
  assert.equal(a.vx, -100); assert.equal(b.vx, 100);
  Object.assign(a, { x: 0, y: 0 }); Object.assign(b, { x: 0, y: 0 });
  for (let i = 0; i < 10; i++) S.resolveCarCollision(a, b);
  assert.ok([a.x, a.y, b.x, b.y, a.vx, b.vx].every(Number.isFinite));
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20);
});

test('barriers reflect outward velocity and keep both chassis circles inside', () => {
  const race = S.createRace(), car = race.cars[0];
  const p = S.sampleTrack(race.track, 100, 77);
  Object.assign(car, { x: p.x, y: p.y, angle: p.angle, vx: -p.ty * 180, vy: p.tx * 180 });
  assert.ok(S.resolveWalls(car, race.track));
  for (let i = 0; i < 8; i++) S.resolveWalls(car, race.track);
  for (const center of S.hull(car)) assert.ok(S.nearestTrack(race.track, center.x, center.y).distance <= 68.1);
  assert.ok(car.vx * -p.ty + car.vy * p.tx < 0);
});

test('start crossing and oscillating across the finish line do not award laps', () => {
  const race = runningRace(), car = race.cars[0];
  crossGate(race, car, 0);
  assert.equal(car.startedLap, true); assert.equal(car.nextGate, 1); assert.equal(car.lapsCompleted, 0);
  for (let i = 0; i < 20; i++) { crossGate(race, car, 0, -1); crossGate(race, car, 0); }
  assert.equal(car.lapsCompleted, 0);
});

test('out-of-order, reverse, and outside-width checkpoint crossings are rejected', () => {
  const race = runningRace(), car = race.cars[0];
  crossGate(race, car, 0);
  crossGate(race, car, 2); assert.equal(car.nextGate, 1);
  crossGate(race, car, 1, -1); assert.equal(car.nextGate, 1);
  crossGate(race, car, 1, 1, 110); assert.equal(car.nextGate, 1);
  crossGate(race, car, 1); assert.equal(car.nextGate, 2);
  crossGate(race, car, 0); assert.equal(car.lapsCompleted, 0);
});

test('three ordered laps finish once and produce consistent lap and race times', () => {
  const race = runningRace(), car = race.cars[0];
  crossGate(race, car, 0);
  for (let lap = 0; lap < 3; lap++) {
    for (let gate = 1; gate < 12; gate++) crossGate(race, car, gate);
    crossGate(race, car, 0);
    assert.equal(car.lapsCompleted, lap + 1);
  }
  assert.equal(car.finished, true); assert.equal(car.lapTimes.length, 3);
  assert.equal(car.bestLap, Math.min(...car.lapTimes));
  assert.ok(Math.abs(car.lapTimes.reduce((sum, n) => sum + n, 0) - car.finishTime) < 1e-9);
  crossGate(race, car, 0); assert.equal(car.lapsCompleted, 3);
});

test('standings handle grid ties, wraparound, overtakes, and fixed finish order', () => {
  const race = runningRace(), [player, nova, kai, remy] = race.cars;
  assert.deepEqual(S.standings(race).map(c => c.name), ['NOVA', 'KAI', 'REMY', 'YOU']);
  player.progress = race.track.length + 20; nova.progress = race.track.length - 4;
  assert.equal(S.standings(race)[0], player);
  kai.finished = true; kai.finishTime = 42;
  remy.finished = true; remy.finishTime = 41.999;
  assert.deepEqual(S.standings(race).slice(0, 2).map(c => c.name), ['REMY', 'KAI']);
});

test('AI completes full races for multiple seeds, with a stationary player obstacle', () => {
  for (const seed of [0, 1, 42, 2048, 9999, 4294967295]) {
    const race = runningRace(seed);
    for (let i = 0; i < 14400 && !race.cars.filter(c => c.ai).every(c => c.finished); i++) S.stepRace(race);
    for (const car of race.cars.filter(c => c.ai)) {
      assert.equal(car.finished, true, `seed ${seed}: ${car.name} stuck at gate ${car.nextGate}`);
      assert.equal(car.lapsCompleted, 3);
      assert.ok(car.lapTimes.every(time => time > 8));
      assert.ok([car.x, car.y, car.vx, car.vy, car.omega].every(Number.isFinite));
    }
  }
});

test('a completed race no longer advances and fractional finish order is stable', () => {
  const race = runningRace(); race.cars[0].ai = true;
  for (let i = 0; i < 14400 && race.phase !== 'finished'; i++) S.stepRace(race);
  assert.equal(race.phase, 'finished');
  assert.deepEqual(S.standings(race).map(c => c.finishPlace), [1, 2, 3, 4]);
  const time = race.time; S.stepRace(race); assert.equal(race.time, time);
});
