'use strict';
/* Headless verification for the racing engine.
 * - determinism: two identical runs (same seed + same scripted input) must
 *   produce bit-identical state
 * - lap detection: AI cars must complete laps around the closed track
 * - stability: no NaN, cars stay near the centerline
 * - seed sensitivity: different seeds must change the AI parameters
 */
const { createGame, buildTrack, buildCars, mulberry32, lapsDone, resolveCollisions, fmtTime } = require('./racer.js');

const DT = 1 / 120;
let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg);
  if (!cond) failures++;
};

// deterministic scripted input for the "player" (coasting with wobble steering)
function scriptedInput(step) {
  return { throttle: 1, brake: step % 600 < 60 ? 1 : 0, steer: Math.sin(step / 90) * 0.6 };
}

function runSim(seed, seconds, inputFn) {
  const game = createGame({ seed });
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) {
    game.state.input = inputFn ? inputFn(i) : { throttle: 0, brake: 0, steer: 0 };
    game.step(DT);
  }
  return game;
}

function hashState(game) {
  const s = game.state;
  let h = '' + s.raceTime + ',' + s.phase;
  for (const c of s.cars) {
    h += '|' + c.x.toFixed(6) + ',' + c.y.toFixed(6) + ',' + c.angle.toFixed(6)
       + ',' + c.vx.toFixed(6) + ',' + c.vy.toFixed(6) + ',' + c.cp
       + ',' + c.lapCross + ',' + c.rankScore + ',' + c.wpIndex;
  }
  return h;
}

function anyNaN(game) {
  for (const c of game.state.cars) {
    if ([c.x, c.y, c.vx, c.vy, c.angle].some((v) => !Number.isFinite(v))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 1. determinism
const A = runSim(1337, 20, scriptedInput);
const B = runSim(1337, 20, scriptedInput);
ok(hashState(A) === hashState(B), 'determinism: two runs, same seed + input -> identical state');
const C = runSim(9999, 20, scriptedInput);
ok(hashState(C) !== hashState(A), 'seed sensitivity: different seed -> different state');

// ---------------------------------------------------------------- 2. lap detection
const G = runSim(1337, 90, scriptedInput);
ok(!anyNaN(G), 'stability: no NaN after 90 s');
const ai = G.state.cars.slice(1);
const laps = ai.map((c) => lapsDone(c));
console.log('      AI laps after 90s: ' + laps.join(', ') + '  (player ' + lapsDone(G.state.cars[0]) + ')');
ok(laps.every((l) => l >= 1), 'lap detection: every AI has completed >= 1 lap');
ok(ai.every((c) => c.rankScore >= 24), 'lap detection: rankScore monotonically counts gates (>= 1 lap = 24)');

// finish line crossings consistent with laps + starting position
ok(G.state.cars.every((c) => lapsDone(c) === Math.max(0, c.lapCross - 1)), 'invariant: laps = max(0, lapCross-1)');

// ---------------------------------------------------------------- 3. on-track behaviour
const G2 = runSim(1337, 60, scriptedInput);
const off = G2.state.cars.map((c) => c.offTrack);
ok(G2.state.cars.every((c) => Number.isFinite(c.trackIndex)), 'progress tracking: nearest centerline index valid');
console.log('      offTrack flags at 60s (player ' + off[0] + '): ' + off.join(','));
const aiOnTrack = ai.length && (() => {
  const g = runSim(1337, 30, scriptedInput);
  return g.state.cars.slice(1).every((c) => !c.offTrack);
})();
ok(aiOnTrack, 'AI stay on the racing line at the 30 s mark');

// ------------------------------------------------------- 3b. full race completion
// Autopilot the player with the same waypoint logic the AI uses: it must
// finish 3 laps and the race must transition to the 'finished' phase.
const g3 = createGame({ seed: 1337 });
const track3 = g3.state.track;
const p3 = g3.state.cars[0];
for (let i = 0; i < 120 * 90 && g3.state.phase !== 'finished'; i++) {
  const wp = track3.centerline[(p3.trackIndex + 6) % track3.M];
  const want = Math.atan2(wp.y - p3.y, wp.x - p3.x);
  const diff = Math.atan2(Math.sin(want - p3.angle), Math.cos(want - p3.angle));
  g3.state.input = {
    throttle: Math.abs(diff) > 0.55 ? 0.55 : 1,
    brake: 0,
    steer: Math.max(-1, Math.min(1, diff * 3.0))
  };
  g3.step(1 / 120);
}
ok(g3.state.phase === 'finished', 'race completes: player finishes 3 laps -> finished phase');
ok(p3.done && p3.finishTime > 0, 'race completes: player has a finish time');
console.log('      player finish: ' + fmtTime(p3.finishTime) + '  position ' + p3.position +
  '  standings ' + g3.getStandings().map((s) => s.position + '. ' + s.name + ' (' + s.laps + ' laps)').join('  '));

// ---------------------------------------------------------------- 4. collisions
// Head-on: two equal-mass cars, 16 px overlap. The engine calls
// resolveCollisions every fixed step; a few solver passes must fully
// separate them and flip their velocities along the contact normal.
const cA = { x: 480, y: 300, vx: 120, vy: 0, radius: 13 };
const cB = { x: 490, y: 300, vx: -120, vy: 0, radius: 13 };
for (let i = 0; i < 5; i++) resolveCollisions([cA, cB]);
const sep = Math.hypot(cB.x - cA.x, cB.y - cA.y);
console.log('      post-collision separation = ' + sep.toFixed(2) + ' px (sum of radii = ' + (cA.radius + cB.radius) + ')');
console.log('      velocities after impulse: A=' + cA.vx.toFixed(1) + ' B=' + cB.vx.toFixed(1));
ok(sep >= cA.radius + cB.radius - 1e-6, 'collisions: positional correction pushes cars apart');
ok(cA.vx < 0 && cB.vx > 0, 'collisions: impulse reverses approach velocity along the normal');
// tangential velocity must be untouched by the normal impulse
ok(cA.vy === 0 && cB.vy === 0, 'collisions: no tangential force introduced');

// ---------------------------------------------------------------- 5. track shape
const t = buildTrack();
let maxR = 0, minR = 0;
for (const pt of t.centerline) {
  const d = Math.hypot(pt.x, pt.y);
  if (d > maxR) maxR = d;
  if (minR === 0 || d < minR) minR = d;
}
ok(t.M > 200 && t.N === 24, 'track: ' + t.M + ' samples, ' + t.N + ' checkpoints');
console.log('      track sample count = ' + t.M);

// seed -> AI personality mapping must be stable
const r1 = mulberry32(1337), r2 = mulberry32(1337);
const carsA = buildCars(buildTrack(), r1).map((c) => c.speedMult).join();
const carsB = buildCars(buildTrack(), r2).map((c) => c.speedMult).join();
ok(carsA === carsB, 'RNG: same seed reproduces the same AI parameters');

// ------------------------------ 6. browser wiring -------------------------
// Execute racer.js in a VM with minimal DOM shims and drive ~5 s of frames
// to confirm the browser path (keyboard -> fixed step -> canvas render) runs.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'racer.js'), 'utf8');

let rafCbs = [];
let nowMs = 0;
const listeners = {};
const ctxShim = new Proxy({}, {
  get: (t, prop) => (typeof t[prop] === 'function' ? t[prop] : () => {}),
  set: (t, prop, v) => { t[prop] = v; return true; }
});
const canvasShim = { width: 960, height: 600, getContext: () => ctxShim };
const browserSandbox = {
  console,
  document: { getElementById: (id) => (id === 'game' ? canvasShim : null) },
  window: {
    location: { search: '?seed=1337' },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }
  },
  performance: { now: () => nowMs },
  requestAnimationFrame: (cb) => { rafCbs.push(cb); return rafCbs.length; },
  cancelAnimationFrame: () => {},
  Path2D: class { moveTo() {} lineTo() {} closePath() {} }
};
vm.createContext(browserSandbox);
vm.runInContext(code, browserSandbox, { filename: 'racer.js' });
ok(typeof browserSandbox.createGame === 'function', 'browser: script evaluates, createGame exposed');
ok(rafCbs.length === 1, 'browser: game auto-starts an animation loop');

for (let i = 1; i <= 300; i++) { // ~5 s at 60 fps
  nowMs = i * 16.7;
  const cbs = rafCbs; rafCbs = [];
  for (const cb of cbs) cb(nowMs);
}
ok(rafCbs.length === 1, 'browser: loop reschedules every frame (300 frames, no exceptions)');

const kd = listeners.keydown || [], ku = listeners.keyup || [];
ok(kd.length >= 1 && ku.length >= 1, 'browser: key listeners registered');

// hold the throttle and verify the player actually drives (input provider is
// sampled inside the fixed-step loop) and the race clock advances
const bg = browserSandbox.window.game;
ok(!!bg, 'browser: game instance exposed on window');
ok(bg.state.raceTime > 0, 'browser: countdown elapses, race clock advances (t=' + bg.state.raceTime.toFixed(2) + 's)');
const p0 = bg.state.cars[0];
const x0 = p0.x, y0 = p0.y;
kd.forEach((fn) => fn({ code: 'ArrowUp', preventDefault() {} }));
for (let i = 301; i <= 420; i++) { // 2 s of driving
  nowMs = i * 16.7;
  const cbs = rafCbs; rafCbs = [];
  for (const cb of cbs) cb(nowMs);
}
ku.forEach((fn) => fn({ code: 'ArrowUp', preventDefault() {} }));
const moved = Math.hypot(p0.x - x0, p0.y - y0);
console.log('      player moved ' + moved.toFixed(1) + ' px in 2 s under throttle');
ok(moved > 20, 'browser: keyboard input reaches the player car (moved ' + moved.toFixed(1) + ' px)');

console.log('');
if (failures) { console.log(failures + ' test(s) FAILED'); process.exit(1); }
console.log('all tests passed');
