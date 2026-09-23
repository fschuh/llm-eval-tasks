'use strict';
const fs = require('fs');
const path = require('path');
function freshRun(seed) {
  global.location = { search: '?seed=' + seed };
  const listeners = {};
  global.window = { devicePixelRatio: 1, addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
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
  eval(src + '\n;globalThis.__H={get world(){return world},get cars(){return cars},get state(){return state},get raceTime(){return raceTime},cellId};');
  return {
    handle: global.__H,
    pump(ms) { if (rafCb) { const cb = rafCb; rafCb = null; clock += ms; cb(clock); } },
    key(c, d) { (listeners[d ? 'keydown' : 'keyup'] || []).forEach(f => f({ code: c, preventDefault() {} })); },
  };
}
const TAU = Math.PI * 2;
const seed = parseInt(process.argv[2] || '42', 10);
const r = freshRun(seed);
const H = r.handle;
const pressed = { W: false, A: false, D: false, S: false };
const frames = 100 * 60;
for (let f = 0; f < frames; f++) {
  if (f % 600 === 0) {
    const p = H.cars[0];
    const M = H.world.M;
    const t = H.world.pts[(p.idx + 24) % M];
    let d = Math.atan2(t.y - p.y, t.x - p.x) - p.heading;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const target = Math.max(-1, Math.min(1, d * 2.2));
    const want = { W: p.vf < p.maxSpeed * 0.98, A: target < -0.25, D: target > 0.25, S: false };
    for (const k of ['W', 'A', 'D', 'S']) {
      if (pressed[k] !== want[k]) { r.key('Key' + k, want[k]); pressed[k] = !!want[k]; }
    }
  }
  r.pump(16.7);
  if (f % 1200 === 0) {
    console.log('t ' + H.raceTime.toFixed(1) + 's | ' + H.cars.map(c =>
      c.name + ' idx' + c.idx + ' cp' + c.cp + ' L' + c.lapsDone + ' vf' + c.vf.toFixed(0) +
      (c.astarPath ? ' ASTAR' + c.astarPath.length : '') + (c.walled ? ' WALL' : '') +
      ' st' + c.stuck.toFixed(1)).join('  '));
  }
}
console.log('=== final ===');
for (const c of H.cars) console.log(c.name, 'idx', c.idx, 'L', c.lapsDone, 'vf', c.vf.toFixed(1), 'stuck', c.stuck.toFixed(2), 'astar', c.astarPath ? c.astarPath.length : 'none', 'at', c.x.toFixed(0) + ',' + c.y.toFixed(0));
