'use strict';

/* ============================================================================
 * Top-Down Arcade Racer - single-file JS engine
 *
 *  - Player car: acceleration / braking / steering (arrows or WASD)
 *  - 3 AI opponents: waypoint following + light avoidance
 *  - Lap detection via ordered gate checkpoints (finish + 23 mid-track gates)
 *  - Car-to-car collisions resolved with a simple impulse solver
 *  - HUD: lap / time / position (+ speed and standings)
 *  - Deterministic: seeded mulberry32 RNG, fixed timestep (1/120 s)
 *  - No external physics engine
 *
 * Browser: load in index.html and call createGame({canvas}).start()
 * Node:    const { createGame } = require('./racer.js');  (see test.js)
 * ==========================================================================*/

// ----------------------------- deterministic RNG ---------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------- math helpers ------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  };
}

const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ms = Math.floor((t * 1000) % 1000);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
};
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const lapsDone = (car) => Math.max(0, car.lapCross - 1);

// ------------------------------- track build -------------------------------
function buildTrack() {
  // Control points of a closed loop (screen space, y down).
  const ctrl = [
    [150, 150], [370, 110], [610, 120], [800, 195], [835, 335],
    [715, 455], [555, 430], [415, 488], [225, 500], [120, 400], [108, 262]
  ];
  const SEG = 44; // spline samples per control segment
  const centerline = [];
  for (let i = 0; i < ctrl.length; i++) {
    const p0 = ctrl[(i - 1 + ctrl.length) % ctrl.length];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % ctrl.length];
    const p3 = ctrl[(i + 2) % ctrl.length];
    for (let s = 0; s < SEG; s++) centerline.push(catmullRom(p0, p1, p2, p3, s / SEG));
  }
  const M = centerline.length;
  const tangents = [], normals = [];
  for (let i = 0; i < M; i++) {
    const a = centerline[(i - 1 + M) % M], b = centerline[(i + 1) % M];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    tangents.push({ x: dx, y: dy });
    normals.push({ x: -dy, y: dx });
  }
  const N = 24; // ordered checkpoints; index 0 = finish/start line
  const cpIndex = [];
  for (let k = 0; k < N; k++) cpIndex.push(Math.round((k * M) / N) % M);
  return {
    centerline, tangents, normals, cpIndex,
    waypoints: centerline, // AI follows the centerline
    roadWidth: 74, M, N
  };
}

function nearestIndex(track, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < track.M; i++) {
    const dx = track.centerline[i].x - x, dy = track.centerline[i].y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ------------------------------ car factory --------------------------------
function buildCars(track, rng) {
  const cars = [];
  const M = track.M, roadHalf = track.roadWidth / 2;
  const names = ['YOU', 'AI RED', 'AI AMBER', 'AI LIME'];
  const colors = ['#2f7bff', '#ff4d4d', '#ffb020', '#59d95b'];
  for (let i = 0; i < 4; i++) {
    const row = Math.floor(i / 2), col = i % 2; // 2x2 starting grid
    const back = 14 + row * 12;                 // samples behind the finish
    const idx = (M - back + M) % M;
    const side = (col === 0 ? -1 : 1) * roadHalf * 0.5;
    const P = track.centerline[idx], Nn = track.normals[idx], T = track.tangents[idx];
    const car = {
      id: i, name: names[i], color: colors[i],
      x: P.x + Nn.x * side + (rng() - 0.5) * 2,
      y: P.y + Nn.y * side + (rng() - 0.5) * 2,
      angle: Math.atan2(T.y, T.x),
      vx: 0, vy: 0,
      radius: 13, length: 26, width: 14,
      maxSpeed: 300, accel: 320, brake: 520, drag: 0.7, grip: 7, turnRate: 3.8,
      // lap detection state: next gate to cross, finish crossings, ordered progress
      cp: 0, lapCross: 0, rankScore: 0, lastS: null,
      trackIndex: idx, offTrack: false,
      isPlayer: i === 0,
      wpIndex: (idx + 3) % M,
      position: i + 1, done: false, finishTime: null
    };
    if (i > 0) { // AI personality, drawn from the seeded RNG (deterministic)
      car.speedMult = 0.88 + rng() * 0.08;       // 0.88 .. 0.96 of player top speed
      car.steerGain = 3.0 + rng() * 0.5;
      car.throttleBias = 0.9 + rng() * 0.1;
      car.maxSpeed = 300 * car.speedMult;
      car.accel = 320 * car.speedMult;
    }
    cars.push(car);
  }
  return cars;
}

// ------------------------------ car physics --------------------------------
function updateCar(car, input, dt, track) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const rx = -fy, ry = fx;
  let fSpeed = car.vx * fx + car.vy * fy;   // forward component
  let lSpeed = car.vx * rx + car.vy * ry;   // lateral component

  const grass = car.offTrack;
  const maxSpeed = car.maxSpeed * (grass ? 0.5 : 1);
  const acc = car.accel * (grass ? 0.5 : 1);

  if (input.throttle > 0) fSpeed += acc * input.throttle * dt;
  if (input.brake > 0) {
    if (fSpeed > 5) fSpeed -= car.brake * input.brake * dt;
    else fSpeed -= acc * 0.5 * input.brake * dt; // reverse
  }
  fSpeed -= fSpeed * car.drag * dt;          // aerodynamic drag
  const rr = 22 * dt;                        // rolling resistance (full stop)
  if (Math.abs(fSpeed) <= rr) fSpeed = 0; else fSpeed -= Math.sign(fSpeed) * rr;
  fSpeed = clamp(fSpeed, -maxSpeed * 0.35, maxSpeed);

  const grip = car.grip * (grass ? 0.35 : 1);
  lSpeed -= lSpeed * grip * dt;              // tyre grip kills lateral slip

  // steering authority scales with speed (and flips in reverse)
  const sf = clamp(fSpeed / (maxSpeed * 0.25), -1, 1);
  car.angle += input.steer * car.turnRate * sf * dt;

  const fx2 = Math.cos(car.angle), fy2 = Math.sin(car.angle);
  const rx2 = -fy2, ry2 = fx2;
  car.vx = fx2 * fSpeed + rx2 * lSpeed;
  car.vy = fy2 * fSpeed + ry2 * lSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

// ------------------------------- AI driver ---------------------------------
// Waypoint following on the centerline with look-ahead, corner braking and a
// light deterministic avoidance of cars directly ahead.
function updateAI(car, dt, track, cars) {
  const M = track.M;
  const ref = track.centerline[car.wpIndex];
  if (Math.hypot(ref.x - car.x, ref.y - car.y) < 12) {
    car.wpIndex = (car.wpIndex + 1) % M; // passed this reference point
  }
  const wp = track.centerline[(car.wpIndex + 6) % M]; // look ahead ~6 samples
  const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = angleDiff(desired, car.angle);
  let steer = clamp(diff * car.steerGain, -1, 1);

  // avoidance: nudge away from the nearest car within 55 px that is ahead
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const rx = -fy, ry = fx;
  for (let i = 0; i < cars.length; i++) {
    const o = cars[i];
    if (o === car) continue;
    const dxo = o.x - car.x, dyo = o.y - car.y;
    const dist = Math.hypot(dxo, dyo);
    if (dist < 55 && dist > 0.001) {
      if (dxo * fx + dyo * fy > 0) {
        const side = dxo * rx + dyo * ry;
        steer = clamp(steer - clamp(side, -1, 1) * (1 - dist / 55) * 0.9, -1, 1);
      }
    }
  }

  const sev = Math.abs(diff);
  let throttle = car.throttleBias;
  if (sev > 0.55) throttle *= 0.55;
  if (sev > 1.15) throttle *= 0.3;

  updateCar(car, { throttle, brake: 0, steer }, dt, track);
}

// ---------------------------- collision solver -----------------------------
// Equal-mass circle collisions: impulse along the contact normal + a
// positional correction so cars do not sink into each other.
function resolveCollisions(cars) {
  const e = 0.35; // restitution
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = a.radius + b.radius;
      if (d > 0.0001 && d < minD) {
        const nx = dx / d, ny = dy / d;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const jImp = -(1 + e) * vn * 0.5; // m_a = m_b = 1
          a.vx -= jImp * nx; a.vy -= jImp * ny;
          b.vx += jImp * nx; b.vy += jImp * ny;
        }
        const corr = (minD - d) * 0.5; // split the full overlap between both cars
        a.x -= nx * corr; a.y -= ny * corr;
        b.x += nx * corr; b.y += ny * corr;
      }
    }
  }
}

// --------------------------- progress / laps -------------------------------
function updateOffTrack(car, track) {
  const ni = nearestIndex(track, car.x, car.y);
  car.trackIndex = ni;
  const dx = track.centerline[ni].x - car.x, dy = track.centerline[ni].y - car.y;
  car.offTrack = Math.hypot(dx, dy) > track.roadWidth * 0.5 - 2;
}

// Ordered gate crossing: the car must pass its next checkpoint (a gate
// spanning the road, perpendicular to travel) while moving forward.
// Crossing gate 0 = finish/start line; the 2nd+ crossing counts a lap.
function updateCheckpoint(car, track) {
  const P = track.centerline[track.cpIndex[car.cp]];
  const T = track.tangents[track.cpIndex[car.cp]];
  const Nn = track.normals[track.cpIndex[car.cp]];
  const s = (car.x - P.x) * T.x + (car.y - P.y) * T.y;    // signed along-track
  const perp = (car.x - P.x) * Nn.x + (car.y - P.y) * Nn.y; // across-track
  if (car.lastS === null) { car.lastS = s; return; }
  const fwd = car.vx * T.x + car.vy * T.y;
  if (car.lastS < 0 && s >= 0 && Math.abs(perp) < track.roadWidth * 0.55 && fwd > 0) {
    car.rankScore++;
    if (car.cp === 0) car.lapCross++;
    car.cp = (car.cp + 1) % track.N;
    car.lastS = null; // re-arm for the next gate
  } else {
    car.lastS = s;
  }
}

function updateRanking(cars) {
  const order = cars.slice().sort((a, b) => b.rankScore - a.rankScore);
  for (let i = 0; i < order.length; i++) order[i].position = i + 1;
}

// ------------------------------ game factory -------------------------------
function createGame(opts) {
  opts = opts || {};
  const seed = opts.seed != null ? opts.seed : 1337;
  const canvas = opts.canvas || null;
  const inputProvider = opts.inputProvider || null; // e.g. keyboard reader
  const ctx = canvas ? canvas.getContext('2d') : null;
  const W = canvas ? canvas.width : 960;
  const H = canvas ? canvas.height : 600;
  const TOTAL_LAPS = 3;
  const FIXED_DT = 1 / 120;

  const track = buildTrack();
  const state = {
    seed, track, W, H, totalLaps: TOTAL_LAPS, fixedDt: FIXED_DT,
    cars: buildCars(track, mulberry32(seed)),
    phase: 'countdown', countdown: 3.0, goTimer: 0,
    raceTime: 0, finished: false,
    input: { throttle: 0, brake: 0, steer: 0 }
  };

  if (ctx) {
    const path = new Path2D();
    path.moveTo(track.centerline[0].x, track.centerline[0].y);
    for (let i = 1; i < track.M; i++) path.lineTo(track.centerline[i].x, track.centerline[i].y);
    path.closePath();
    track.path = path;
  }

  function step(dt) {
    if (state.phase === 'countdown') {
      state.countdown -= dt;
      if (state.countdown <= 0) { state.phase = 'racing'; state.goTimer = 1.0; }
      return;
    }
    if (state.phase !== 'racing') return; // 'finished': frozen
    if (state.goTimer > 0) state.goTimer -= dt;
    state.raceTime += dt;

    const cars = state.cars;
    const input = inputProvider ? inputProvider() : state.input;
    for (let i = 0; i < cars.length; i++) updateOffTrack(cars[i], track);
    updateCar(cars[0], input, dt, track);
    for (let i = 1; i < cars.length; i++) updateAI(cars[i], dt, track, cars);
    resolveCollisions(cars);
    for (let i = 0; i < cars.length; i++) updateCheckpoint(cars[i], track);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.done && lapsDone(c) >= TOTAL_LAPS) { c.done = true; c.finishTime = state.raceTime; }
    }
    if (cars[0].done && !state.finished) { state.finished = true; state.phase = 'finished'; }
    updateRanking(cars);
  }

  function reset() {
    const wasRunning = state.running;
    const cars = buildCars(track, mulberry32(seed)); // same seed -> identical grid
    state.cars = cars;
    state.phase = 'countdown'; state.countdown = 3.0; state.goTimer = 0;
    state.raceTime = 0; state.finished = false;
    state.input = { throttle: 0, brake: 0, steer: 0 };
    state.running = wasRunning;
  }

  // ------------------------------- rendering -------------------------------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawFinish() {
    const P = track.centerline[0], T = track.tangents[0], Nn = track.normals[0];
    const half = track.roadWidth / 2, sq = 7;
    const cols = Math.floor(track.roadWidth / sq);
    const rot = Math.atan2(T.y, T.x);
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < cols; c++) {
        const off = (c + 0.5) / cols * track.roadWidth - half;
        const along = (row - 0.5) * sq;
        const x = P.x + Nn.x * off + T.x * along;
        const y = P.y + Nn.y * off + T.y * along;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(rot);
        ctx.fillStyle = (c + row) % 2 === 0 ? '#15181d' : '#f4f4f4';
        ctx.fillRect(-sq / 2, -sq / 2, sq, sq);
        ctx.restore();
      }
    }
  }

  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -c.length / 2 + 2, -c.width / 2 + 2, c.length, c.width, 5);
    ctx.fill();
    ctx.fillStyle = c.color;
    roundRect(ctx, -c.length / 2, -c.width / 2, c.length, c.width, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(18,24,34,0.85)';
    roundRect(ctx, 1, -c.width / 2 + 3, c.length * 0.3, c.width - 6, 2);
    ctx.fill();
    if (c.isPlayer) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', -c.length * 0.2, 0.5);
    }
    ctx.restore();
  }

  function drawHUD() {
    const p = state.cars[0];
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    roundRect(ctx, 12, 12, 200, 176, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px monospace';
    ctx.fillText('LAP ' + Math.min(lapsDone(p) + 1, state.totalLaps) + '/' + state.totalLaps, 26, 24);
    ctx.fillText('POS ' + p.position + '/4', 26, 52);
    ctx.font = '15px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('TIME ' + fmtTime(state.raceTime), 26, 84);
    ctx.fillText('SPEED ' + Math.round(Math.hypot(p.vx, p.vy) * 0.6) + ' km/h', 26, 107);
    const order = state.cars.slice().sort((a, b) => b.rankScore - a.rankScore);
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      ctx.fillStyle = c.color;
      ctx.fillText((i + 1) + '.', 26, 136 + i * 13);
      ctx.fillStyle = c.isPlayer ? '#fff' : 'rgba(255,255,255,0.75)';
      ctx.fillText(c.name + (c.done ? '  ' + fmtTime(c.finishTime) : ''), 44, 136 + i * 13);
    }
    ctx.restore();
  }

  function drawCenter() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state.phase === 'countdown') {
      ctx.font = 'bold 96px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(String(Math.max(1, Math.ceil(state.countdown))), state.W / 2, state.H / 2);
    } else if (state.goTimer > 0) {
      ctx.font = 'bold 96px monospace';
      ctx.fillStyle = '#7cfc66';
      ctx.fillText('GO!', state.W / 2, state.H / 2);
    } else if (state.phase === 'finished') {
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      ctx.fillRect(0, 0, state.W, state.H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 54px monospace';
      ctx.fillText('FINISHED', state.W / 2, state.H / 2 - 40);
      ctx.font = '22px monospace';
      ctx.fillText('You finished ' + ordinal(state.cars[0].position), state.W / 2, state.H / 2 + 8);
      ctx.font = '14px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('Press R to race again', state.W / 2, state.H / 2 + 44);
    }
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, state.W, state.H);
    ctx.fillStyle = '#3f8f3a';
    ctx.fillRect(0, 0, state.W, state.H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e8e6df';
    ctx.lineWidth = track.roadWidth + 10;
    ctx.stroke(track.path);
    ctx.strokeStyle = '#4a4d55';
    ctx.lineWidth = track.roadWidth;
    ctx.stroke(track.path);
    ctx.setLineDash([18, 22]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke(track.path);
    ctx.setLineDash([]);
    drawFinish();
    const cars = state.cars.slice().sort((a, b) => a.id - b.id);
    for (let i = 0; i < cars.length; i++) drawCar(cars[i]);
    drawHUD();
    drawCenter();
    ctx.save();
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Arrows/WASD drive  -  R restart  -  seed ' + state.seed, state.W - 14, state.H - 12);
    ctx.restore();
  }

  // ------------------------------ main loop --------------------------------
  let raf = 0, last = 0, acc = 0;
  const MAX_FRAME = 0.25;
  function loop(now) {
    if (!state.running) return;
    let ft = (now - last) / 1000;
    last = now;
    if (ft > MAX_FRAME) ft = MAX_FRAME; // clamp: no spiral of death
    acc += ft;
    while (acc >= FIXED_DT) {
      step(FIXED_DT);
      acc -= FIXED_DT;
    }
    render();
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (state.running) return;
    state.running = true;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    state.running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function getStandings() {
    return state.cars
      .slice()
      .sort((a, b) => b.rankScore - a.rankScore)
      .map((c) => ({
        name: c.name, position: c.position, laps: lapsDone(c),
        rankScore: c.rankScore, done: c.done, finishTime: c.finishTime
      }));
  }

  return { state, step, render, start, stop, reset, getStandings, FIXED_DT };
}

// -------------------------------- exports ----------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createGame, mulberry32, buildTrack, buildCars, lapsDone, resolveCollisions, fmtTime };
}

// ------------------------------ browser init -------------------------------
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const canvas = document.getElementById('game');
  if (canvas) {
    const m = window.location.search.match(/[?&]seed=(\d+)/);
    const seed = m ? parseInt(m[1], 10) : 1337;

    const keys = {};
    const DRIVE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
    function readInput() {
      return {
        throttle: (keys.ArrowUp || keys.KeyW) ? 1 : 0,
        brake: (keys.ArrowDown || keys.KeyS) ? 1 : 0,
        steer: ((keys.ArrowRight || keys.KeyD) ? 1 : 0) + ((keys.ArrowLeft || keys.KeyA) ? -1 : 0)
      };
    }

    const game = createGame({ canvas, seed, inputProvider: readInput });
    window.game = game; // console access for debugging

    window.addEventListener('keydown', (e) => {
      if (DRIVE.indexOf(e.code) !== -1) e.preventDefault();
      keys[e.code] = true;
      if (e.code === 'KeyR') game.reset();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    game.start();
  }
}
