'use strict';
// Headless smoke test for racer.js (no browser needed).
// Usage: node test/smoke.js [seed]
//
// 1) Determinism: two fresh runs with the same seed and the same scripted
//    input must produce bit-identical car states.
// 2) Progress: AI opponents complete laps; the scripted player drives.
// 3) A*: astar() returns a road-valid path between two road cells.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TAU = Math.PI * 2;

function freshRun(seed) {
  global.location = { search: '?seed=' + seed };
  const listeners = {};
  global.window = {
    devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  let clock = 0;
  global.performance = { now: () => clock };
  let rafCb = null;
  global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  const nullCtx = new Proxy({}, {
    get(t, p) { return typeof t[p] !== 'undefined' ? t[p] : () => nullCtx; },
    set(t, p, v) { t[p] = v; return true; },
  });
  global.document = { getElementById: () => ({ getContext: () => nullCtx, width: 0, height: 0 }) };

  const src = fs.readFileSync(path.join(__dirname, '..', 'racer.js'), 'utf8');
  eval(src + '\n;globalThis.__H = { get world(){return world}, get cars(){return cars}, get state(){return state}, get raceTime(){return raceTime}, astar, cellId };');
  return {
    handle: global.__H,
    pump(ms) {
      if (rafCb) {
        const cb = rafCb;
        rafCb = null;
        clock += ms;
        cb(clock);
      }
    },
    key(code, down) {
      (listeners[down ? 'keydown' : 'keyup'] || []).forEach((fn) => fn({ code, preventDefault() {} }));
    },
  };
}

function runScenario(seed, maxSeconds, drive) {
  const r = freshRun(seed);
  const H = r.handle;
  const frames = Math.floor((maxSeconds * 1000) / 16.7);
  const pressed = { W: false, A: false, D: false, S: false };
  const track = [];
  const snap = () => H.cars.map((c) =>
    [c.x.toFixed(4), c.y.toFixed(4), c.vf.toFixed(4), c.lapsDone, c.cp, c.finished ? 1 : 0].join('|')).join('\n');
  let finished = false;
  for (let f = 0; f < frames; f++) {
    if (f % 1200 === 0 && H.cars.some(c => c.finished)) finished = true;
    if (drive) {
      const p = H.cars[0];
      const M = H.world.M;
      const t = H.world.pts[(p.idx + 24) % M];
      let d = Math.atan2(t.y - p.y, t.x - p.x) - p.heading;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const target = Math.max(-1, Math.min(1, d * 2.2));
      const want = {
        W: p.vf < p.maxSpeed * 0.98,
        A: target < -0.25,
        D: target > 0.25,
        S: false,
      };
      for (const k of ['W', 'A', 'D', 'S']) {
        if (pressed[k] !== want[k]) { r.key('Key' + k, want[k]); pressed[k] = !!want[k]; }
      }
    }
    r.pump(16.7);
    if (f % 120 === 0) track.push(snap());
    if (finished && f % 120 === 119) break;
  }
  return {
    track,
    state: H.state,
    raceTime: H.raceTime,
    cars: H.cars.map((c) => ({
      name: c.name, laps: c.lapsDone, finished: c.finished,
      last: c.lastLap == null ? null : +c.lastLap.toFixed(2),
      best: c.bestLap == null ? null : +c.bestLap.toFixed(2),
      nan: !isFinite(c.x) || !isFinite(c.y) || !isFinite(c.vf),
    })),
  };
}

const SEED = process.argv[2] ? (parseInt(process.argv[2], 10) >>> 0) : 1337;
console.log('seed =', SEED);
const a = runScenario(SEED, 300, true);
const b = runScenario(SEED, 300, true);

const digest = (t) => crypto.createHash('sha256').update(t.join('\n')).digest('hex').slice(0, 16);
console.log('run A digest:', digest(a.track), 'final state:', a.state, 'raceTime:', a.raceTime.toFixed(2));
console.log('run B digest:', digest(b.track), 'final state:', b.state, 'raceTime:', b.raceTime.toFixed(2));
const det = digest(a.track) === digest(b.track);
console.log('deterministic:', det);
console.log('per-car state:');
for (const c of a.cars) console.log('  ', c.name.padEnd(6), 'laps:', c.laps, 'finished:', c.finished, 'last:', c.last, 'best:', c.best, 'NaN?', c.nan);

// --- A* path check over the road grid
const r3 = freshRun(SEED);
const H = r3.handle;
const w = H.world;
const iA = 10, iB = (10 + w.M / 2) | 0, iC = (10 + w.M / 3) | 0;
const c1 = H.cellId(w.pts[iA].x, w.pts[iA].y);
const c2 = H.cellId(w.pts[iB].x, w.pts[iB].y);
const c3 = H.cellId(w.pts[iC].x, w.pts[iC].y);
let tested = 0, pass = 0;
for (const [from, to, label] of [[c1, c2, 'half lap'], [c1, c3, 'third lap'], [c2, c1, 'reverse half']]) {
  if (from < 0 || to < 0) { console.log('astar', label, ': cell not on grid, skipped'); continue; }
  tested++;
  const p = H.astar(from, to);
  const ok = !!p && p.length > 2;
  if (ok) pass++;
  console.log('astar', label, ':', from, '->', to, ok ? 'path of ' + p.length + ' nodes' : 'NO PATH');
}
console.log('astar pass:', pass + '/' + tested);

const okAll = det
  && a.cars.every((c) => !c.nan)
  && a.cars.some((c) => c.finished)
  && pass === tested;
console.log(okAll ? 'SMOKE TEST: PASS' : 'SMOKE TEST: FAIL');
process.exit(okAll ? 0 : 1);
