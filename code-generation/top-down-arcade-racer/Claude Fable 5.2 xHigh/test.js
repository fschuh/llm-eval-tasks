#!/usr/bin/env node
/*
 * Headless checks for the simulation core (no dependencies):  node test.js
 *
 * The interesting ones are the determinism tests — the whole race, including
 * the three AI drivers, must be a pure function of (seed, input bytes).
 */
'use strict';

const assert = require('assert');
const S = require('./sim.js');
const { IN_UP, IN_DOWN, IN_LEFT, IN_RIGHT, TICK_RATE } = S;

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok    ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); }
}

/** Keyboard-like input stream from a seeded RNG: a new random key combo every 0.2–1 s. */
function randomInputs(seed, ticks) {
  const rng = new S.RNG(seed, 1234), out = new Uint8Array(ticks);
  let bits = 0, hold = 0;
  for (let i = 0; i < ticks; i++) {
    if (--hold <= 0) {
      hold = 24 + rng.int(96);
      bits = (rng.next() < 0.8 ? IN_UP : 0) | (rng.next() < 0.15 ? IN_DOWN : 0);
      const s = rng.next();
      if (s < 0.3) bits |= IN_LEFT; else if (s < 0.6) bits |= IN_RIGHT;
    }
    out[i] = bits;
  }
  return out;
}

function run(opts, inputs, ticks, onTick) {
  const race = new S.Race(opts);
  for (let i = 0; i < ticks && !(opts.untilOver && race.over); i++) {
    race.step(inputs ? inputs[i] : 0);
    if (onTick) onTick(race, i);
  }
  return race;
}

console.log('sim.js — ' + TICK_RATE + ' Hz fixed step, track ' + S.getTrack().length.toFixed(0) + ' m');

test('RNG: same seed → same sequence, different seed/stream → different', () => {
  const a = new S.RNG(42, 0), b = new S.RNG(42, 0), c = new S.RNG(43, 0), d = new S.RNG(42, 1);
  let same = true, diffSeed = false, diffStream = false;
  for (let i = 0; i < 1000; i++) {
    const x = a.next();
    assert(x >= 0 && x < 1);
    if (x !== b.next()) same = false;
    if (x !== c.next()) diffSeed = true;
    if (x !== d.next()) diffStream = true;
  }
  assert(same && diffSeed && diffStream);
});

test('fixed timestep: every step advances the clock by exactly 1/120 s', () => {
  assert.strictEqual(S.DT, 1 / 120);
  const race = new S.Race({ seed: 1 });
  for (let i = 0; i < S.COUNTDOWN_TICKS; i++) race.step(IN_UP);
  assert.strictEqual(race.time, 0, 'clock must not run during the countdown');
  assert(race.player.dist < 0 && race.player.speed === 0, 'cars are held on the grid until the lights go out');
  for (let i = 0; i < 600; i++) race.step(IN_UP);
  assert.strictEqual(race.tick, S.COUNTDOWN_TICKS + 600);
  assert.strictEqual(race.time, 600 / 120);
});

test('determinism: same seed + same inputs → bit-identical state on every tick', () => {
  const ticks = 120 * 75, inputs = randomInputs(7, ticks);
  const trail = [];
  run({ seed: 2024 }, inputs, ticks, (race) => trail.push(race.hash()));
  let mismatch = -1;
  run({ seed: 2024 }, inputs, ticks, (race, i) => { if (mismatch < 0 && race.hash() !== trail[i]) mismatch = i; });
  assert.strictEqual(mismatch, -1, 'runs diverged at tick ' + mismatch);
});

test('determinism: the seed drives the AI (different seed → different race)', () => {
  const a = run({ seed: 1, autopilot: true }, null, 120 * 40);
  const b = run({ seed: 2, autopilot: true }, null, 120 * 40);
  assert.notStrictEqual(a.hash(), b.hash());
});

test('determinism: different inputs → different race', () => {
  const ticks = 120 * 20;
  assert.notStrictEqual(run({ seed: 5 }, randomInputs(1, ticks), ticks).hash(), run({ seed: 5 }, randomInputs(2, ticks), ticks).hash());
});

test('AI: all four waypoint drivers complete 3 clean laps; classification is consistent', () => {
  for (const seed of [1337, 7, 99]) {
    let wallHits = 0;
    const race = run({ seed, autopilot: true, untilOver: true }, null, 120 * 300, (r) => {
      for (const e of r.events) if (e.type === 'wall') wallHits++;
      for (const c of r.cars) assert(Number.isFinite(c.x + c.y + c.angle + c.vx + c.vy + c.angVel), 'non-finite state');
    });
    assert(race.over, 'seed ' + seed + ': race did not finish');
    assert.strictEqual(wallHits, 0, 'seed ' + seed + ': AI hit the barriers');
    const places = race.order.map((c) => c.place);
    assert.deepStrictEqual(places, [1, 2, 3, 4]);
    for (let i = 0; i < race.order.length; i++) {
      const c = race.order[i];
      assert(c.finished && c.lapTimes.length === 3, c.name + ' laps: ' + c.lapTimes.length);
      for (const t of c.lapTimes) assert(t > 30 && t < 60, c.name + ' lap time ' + t);
      assert(Math.abs(c.lapTimes.reduce((a, b) => a + b, 0) - c.finishTime) < 1e-9, 'lap times must add up to the race time');
      if (i > 0) assert(c.finishTime >= race.order[i - 1].finishTime, 'finish order vs finish time');
    }
  }
});

test('lap detection: a lap needs every gate in order — reversing over the line gains nothing', () => {
  const race = new S.Race({ seed: 1337 }), p = race.player;
  const hold = (bits, secs) => { for (let i = 0; i < secs * 120; i++) race.step(bits); };
  hold(0, 3);                       // countdown
  hold(IN_UP, 2.6);                 // across the line: lap 1 begins
  assert.strictEqual(p.lap, 1); assert.strictEqual(p.nextGate, 1);
  hold(IN_DOWN, 6.5);               // brake, then reverse back over the line
  assert(p.dist < 0, 'should be behind the line again');
  hold(IN_UP, 4);                   // forwards over the line a second time
  assert(p.dist > 0);
  assert.strictEqual(p.lap, 1, 'second crossing must not count');
  assert.strictEqual(p.lapTimes.length, 0);
});

test('lap detection: lap count matches distance covered for every car', () => {
  const len = S.getTrack().length;
  run({ seed: 11, autopilot: true }, null, 120 * 100, (race) => {
    if (race.tick % 30) return;
    for (const c of race.cars) {
      if (c.finished) continue;
      const lapsByDistance = Math.floor(c.dist / len) + 1;       // dist < 0 before the first crossing → lap 0
      assert(Math.abs(c.lap - lapsByDistance) <= (Math.abs(c.dist / len - Math.round(c.dist / len)) < 0.01 ? 1 : 0),
        c.name + ' lap ' + c.lap + ' but distance says ' + lapsByDistance);
    }
  });
});

test('wrong-way flag is raised when driving against the track direction', () => {
  const race = new S.Race({ seed: 3 }), p = race.player;
  const hold = (bits, secs) => { for (let i = 0; i < secs * 120; i++) race.step(bits); };
  hold(0, 3); hold(IN_UP, 0.7); hold(IN_UP | IN_LEFT, 0.5); hold(IN_LEFT, 1.2);
  let seen = 0;
  for (let i = 0; i < 120 * 6; i++) {
    const t = race.track, facing = Math.cos(p.angle) * t.tx[p.idx] + Math.sin(p.angle) * t.ty[p.idx];
    race.step(facing > -0.9 ? IN_UP | IN_LEFT : IN_UP);
    if (p.wrongWay > seen) seen = p.wrongWay;
  }
  assert(seen > 120, 'wrongWay ticks: ' + seen);
  assert(p.lap <= 1);
});

test('barriers: no car ever leaves the track corridor, whatever the inputs', () => {
  const track = S.getTrack(), loc = {}, box = new Float64Array(8);
  for (const seed of [1, 2, 3]) {
    const ticks = 120 * 70, inputs = randomInputs(seed * 31, ticks);
    let worst = 0, wallEvents = 0;
    run({ seed }, inputs, ticks, (race) => {
      for (const e of race.events) if (e.type === 'wall') wallEvents++;
      for (const c of race.cars) {
        assert(Number.isFinite(c.x + c.y + c.angle + c.vx + c.vy + c.angVel), 'non-finite state');
        S.cornersOf(c, box);
        for (let k = 0; k < 8; k += 2) {
          track.locate(box[k], box[k + 1], c.idx, loc);
          if (loc.dist - track.wallHalf > worst) worst = loc.dist - track.wallHalf;
        }
        assert(c.speed < S.TOP_SPEED * 1.5, 'runaway speed ' + c.speed);
      }
    });
    assert(wallEvents > 0, 'random driving should have found a wall');
    assert(worst < 0.25, 'corner ' + worst.toFixed(3) + ' m outside the barrier');
  }
});

test('collision response: impulses conserve linear and angular momentum', () => {
  const I = S.CAR.inertia;
  const mk = (x, y, angle, vx, vy, w) => Object.assign(S.makeCar(0), { x, y, angle, vx, vy, angVel: w });
  const momentum = (cars, pos) => {
    let px = 0, py = 0, L = 0;
    cars.forEach((c, i) => { px += c.vx; py += c.vy; L += pos[i][0] * c.vy - pos[i][1] * c.vx + I * c.angVel; });
    return [px, py, L];
  };
  // head-on in line: no spin, relative speed reversed and scaled by the restitution
  let a = mk(0, 0, 0, 10, 0, 0), b = mk(4.2, 0, 0, 0, 0, 0), events = [];
  S.collideCars(a, b, events);
  assert(Math.abs(a.vx + b.vx - 10) < 1e-12 && Math.abs(a.angVel) < 1e-12 && Math.abs(b.angVel) < 1e-12);
  assert(Math.abs((b.vx - a.vx) - S.CAR.restitution * 10) < 1e-12, 'restitution');
  assert(b.x - a.x >= 4.29, 'bodies must be pushed apart');
  assert(events.length === 1 && events[0].type === 'hit');
  // oblique hit with spin: totals unchanged, cars pick up rotation
  a = mk(0, 0, 0.3, 12, 1, 0.2); b = mk(3.4, 1.3, -0.5, -3, 0.5, -0.1);
  const pos = [[a.x, a.y], [b.x, b.y]], before = momentum([a, b], pos);
  S.collideCars(a, b, events);
  const after = momentum([a, b], pos);
  for (let k = 0; k < 3; k++) assert(Math.abs(before[k] - after[k]) < 1e-9, 'momentum component ' + k + ': ' + before[k] + ' → ' + after[k]);
  assert(Math.abs(a.angVel - 0.2) > 1e-3 || Math.abs(b.angVel + 0.1) > 1e-3, 'off-centre hit should change spin');
  // separated boxes are left alone
  a = mk(0, 0, 0, 5, 0, 0); b = mk(0, 2.2, 0, 0, 0, 0);
  S.collideCars(a, b, events);
  assert(a.vx === 5 && b.vx === 0);
});

test('replay: recorded input bytes reproduce the finished race exactly', () => {
  // "live" run: a keyboard-style bot (on/off keys) drives the player's car to the flag
  const live = new S.Race({ seed: 77, laps: 1 }), p = live.player, log = [];
  const bot = new S.Driver(live, p, { skill: 0.97, latUse: 0.9, brakeUse: 13, topUse: 0.99, lineBlend: 1, bias: 0, reaction: 0 });
  while (!live.over && live.tick < 120 * 200) {
    let bits = 0;
    if (live.phase !== 'countdown' && !p.finished) {
      bot.update();
      if (p.inThrottle > 0.3) bits |= IN_UP;
      if (p.inBrake > 0.3) bits |= IN_DOWN;
      if (p.inSteer > 0.3) bits |= IN_RIGHT; else if (p.inSteer < -0.3) bits |= IN_LEFT;
    }
    log.push(bits);
    live.step(bits);
  }
  assert(live.over && p.finished, 'bot should finish the lap');
  const replay = new S.Race({ seed: 77, laps: 1 });
  for (const bits of log) replay.step(bits);
  assert.strictEqual(replay.hash(), live.hash());
  assert.strictEqual(replay.player.finishTime, p.finishTime);
});

console.log(failed ? '\n' + failed + ' test(s) failed' : '\nall tests passed');
process.exit(failed ? 1 : 0);
