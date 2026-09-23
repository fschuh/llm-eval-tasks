'use strict';

const CONFIG = {
  seed: 1337,
  dt: 1 / 120,
  laps: 3,
  headlessSeconds: 120,
  trackWidth: 90,
  carRadius: 13,
};

const CONTROL = [
  [300, 220], [700, 140], [1150, 180], [1480, 330],
  [1560, 640], [1440, 940], [1120, 1060], [820, 980],
  [620, 820], [380, 920], [180, 700], [220, 430],
];
const SEGMENTS = 20;
const GATE_STRIDE = 20;
const GATE_RADIUS = CONFIG.trackWidth * 0.75;
const OFF_TRACK_DIST = CONFIG.trackWidth / 2 + 6;
const ENGINE_POWER = 900;
const BRAKE_POWER = 1400;
const REVERSE_POWER = 420;
const LINEAR_DRAG = 0.9;
const QUAD_DRAG = 0.0015;
const GRASS_DRAG = 2.6;
const LATERAL_GRIP = 8;
const STEER_RATE = 2.5;
const RESTITUTION = 0.35;
const TOP_SPEED = 530;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function buildCenterline() {
  const pts = [];
  const n = CONTROL.length;
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n];
    const p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n];
    const p3 = CONTROL[(i + 2) % n];
    for (let s = 0; s < SEGMENTS; s++) pts.push(catmullRom(p0, p1, p2, p3, s / SEGMENTS));
  }
  return pts;
}

function nearestIndex(centerline, x, y) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < centerline.length; i++) {
    const dx = x - centerline[i][0];
    const dy = y - centerline[i][1];
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function trackDirection(centerline, i) {
  const n = centerline.length;
  const a = centerline[(i - 1 + n) % n];
  const b = centerline[(i + 1) % n];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

function createWorld(seed) {
  const rng = mulberry32(seed);
  const centerline = buildCenterline();
  const n = centerline.length;
  const gates = [];
  for (let i = 0; i < n; i += GATE_STRIDE) {
    gates.push({ x: centerline[i][0], y: centerline[i][1], r: GATE_RADIUS });
  }
  const specs = [
    { name: 'AI-Red', color: '#e5484d', col: 0 },
    { name: 'AI-Blue', color: '#4c9aff', col: 1 },
    { name: 'AI-Yellow', color: '#ffd43b', col: 0 },
    { name: 'PLAYER', color: '#f8f8f8', col: 1, isPlayer: true },
  ];
  const backIdx = [7, 11, 15, 19];
  const cars = specs.map((s, idx) => {
    const k = (n - backIdx[idx]) % n;
    const d = trackDirection(centerline, k);
    const nrm = [-d[1], d[0]];
    const lateral = (s.col === 0 ? -1 : 1) * 24;
    const p = centerline[k];
    return {
      name: s.name,
      color: s.color,
      isPlayer: !!s.isPlayer,
      x: p[0] + nrm[0] * lateral,
      y: p[1] + nrm[1] * lateral,
      vx: 0,
      vy: 0,
      heading: Math.atan2(d[1], d[0]),
      mass: 1,
      radius: CONFIG.carRadius,
      topSpeedFactor: 0.9 + rng() * 0.1,
      steerGain: 1.1 + rng() * 0.4,
      wpIndex: k,
      nextGate: 0,
      gateCount: 0,
      lapsCompleted: 0,
      lapTimes: [],
      lapStart: 0,
      finishTime: -1,
    };
  });
  return { cars, centerline, gates, simTime: 0, seed };
}

function stepCar(world, car, input, dt) {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  const rx = -fy;
  const ry = fx;
  const vF = car.vx * fx + car.vy * fy;
  let force = 0;
  if (input.throttle > 0) force += input.throttle * ENGINE_POWER;
  if (input.brake > 0) {
    if (vF > 20) force -= input.brake * BRAKE_POWER;
    else if (vF > -20) force -= input.brake * REVERSE_POWER;
  }
  car.vx += fx * force * dt;
  car.vy += fy * force * dt;
  const nIdx = nearestIndex(world.centerline, car.x, car.y);
  const cpx = world.centerline[nIdx][0];
  const cpy = world.centerline[nIdx][1];
  const onGrass = Math.hypot(car.x - cpx, car.y - cpy) > OFF_TRACK_DIST;
  const sp = Math.hypot(car.vx, car.vy);
  const kDrag = LINEAR_DRAG + (onGrass ? GRASS_DRAG : 0) + QUAD_DRAG * sp;
  car.vx -= car.vx * kDrag * dt;
  car.vy -= car.vy * kDrag * dt;
  const vL = car.vx * rx + car.vy * ry;
  const grip = 1 - Math.exp(-LATERAL_GRIP * dt);
  car.vx -= rx * vL * grip;
  car.vy -= ry * vL * grip;
  car.heading += input.steer * STEER_RATE * clamp(vF / 220, -1, 1) * dt;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

function aiInput(world, car) {
  const cl = world.centerline;
  const n = cl.length;
  const speed = Math.hypot(car.vx, car.vy);
  const look = 10 + Math.floor(speed / 40);
  const ti = (car.wpIndex + look) % n;
  const target = cl[ti];
  const angleTo = Math.atan2(target[1] - car.y, target[0] - car.x);
  let steer = clamp(angleDiff(angleTo, car.heading) * 1.8 * car.steerGain, -1, 1);
  const fi = (ti + 14) % n;
  const far = cl[fi];
  const bend = Math.abs(angleDiff(Math.atan2(far[1] - target[1], far[0] - target[0]), angleTo));
  const vMax = clamp((TOP_SPEED * car.topSpeedFactor) / (1 + bend * 2.2), 130, TOP_SPEED);
  let throttle = 0;
  let brake = 0;
  if (speed < vMax) throttle = 1;
  else if (speed > vMax + 60) brake = 1;
  const nIdx = nearestIndex(cl, car.x, car.y);
  const delta = (nIdx - car.wpIndex + n) % n;
  if (delta <= 25) car.wpIndex = nIdx;
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  for (const other of world.cars) {
    if (other === car) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const d2 = ox * ox + oy * oy;
    if (d2 < 130 * 130 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      if ((ox * fx + oy * fy) / d > 0.2) {
        const side = ox * -fy + oy * fx;
        steer = clamp(steer + (side > 0 ? -0.7 : 0.7) * (1 - d / 130), -1, 1);
        if (d < 90) brake = 1;
      }
    }
  }
  return { throttle, brake, steer };
}

function resolveCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const invA = 1 / a.mass;
      const invB = 1 / b.mass;
      const total = invA + invB;
      const overlap = r - d;
      a.x -= nx * overlap * (invA / total);
      a.y -= ny * overlap * (invA / total);
      b.x += nx * overlap * (invB / total);
      b.y += ny * overlap * (invB / total);
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const jImp = (-(1 + RESTITUTION) * vn) / total;
        a.vx -= jImp * nx * invA;
        a.vy -= jImp * ny * invA;
        b.vx += jImp * nx * invB;
        b.vy += jImp * ny * invB;
      }
    }
  }
}

function updateGates(world, car) {
  const g = world.gates[car.nextGate];
  const dx = car.x - g.x;
  const dy = car.y - g.y;
  if (dx * dx + dy * dy <= g.r * g.r) {
    car.gateCount++;
    car.nextGate = (car.nextGate + 1) % world.gates.length;
    const done = Math.floor(car.gateCount / world.gates.length);
    if (done > car.lapsCompleted) {
      car.lapsCompleted = done;
      car.lapTimes.push(world.simTime - car.lapStart);
      car.lapStart = world.simTime;
      if (done >= CONFIG.laps && car.finishTime < 0) car.finishTime = world.simTime;
    }
  }
}

function stepWorld(world, dt, playerInput) {
  for (const car of world.cars) {
    const input = car.isPlayer ? playerInput(car) : aiInput(world, car);
    stepCar(world, car, input, dt);
  }
  resolveCollisions(world.cars);
  for (const car of world.cars) updateGates(world, car);
  world.simTime += dt;
}

function ranked(world) {
  return world.cars
    .map((c) => {
      const g = world.gates[c.nextGate];
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      return { car: c, score: c.gateCount * 1e6 - d };
    })
    .sort((a, b) => b.score - a.score);
}

function fmtTime(t) {
  if (t < 0) return '--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + s.toFixed(3).padStart(6, '0');
}

function stateString(world) {
  return JSON.stringify(world.cars.map((c) => [
    c.x.toFixed(6),
    c.y.toFixed(6),
    c.vx.toFixed(6),
    c.vy.toFixed(6),
    c.heading.toFixed(6),
    c.gateCount,
    c.lapsCompleted,
  ]));
}

function runHeadless() {
  const world = createWorld(CONFIG.seed);
  const totalFrames = Math.round(CONFIG.headlessSeconds / CONFIG.dt);
  let framesRun = 0;
  let lastSec = -1;
  for (let f = 0; f < totalFrames; f++) {
    stepWorld(world, CONFIG.dt, (car) => aiInput(world, car));
    framesRun++;
    const sec = Math.floor(world.simTime);
    if (sec !== lastSec) {
      lastSec = sec;
      const lines = ranked(world).map((r, i) => {
        const c = r.car;
        const lap = Math.min(c.lapsCompleted + 1, CONFIG.laps);
        return i + 1 + ' ' + c.name.padEnd(9) + ' L' + lap + '/' + CONFIG.laps + ' split ' + fmtTime(world.simTime - c.lapStart);
      });
      console.log('[t=' + fmtTime(world.simTime) + '] ' + lines.join(' | '));
    }
    if (world.cars.every((c) => c.finishTime >= 0)) break;
  }
  const lines = ranked(world).map((r, i) => {
    const c = r.car;
    const best = c.lapTimes.length ? Math.min.apply(null, c.lapTimes) : -1;
    return i + 1 + '. ' + c.name.padEnd(9) + ' laps ' + c.lapsCompleted + '/' + CONFIG.laps + ' total ' + fmtTime(c.finishTime) + ' best ' + fmtTime(best);
  });
  console.log('FINAL STANDINGS t=' + fmtTime(world.simTime));
  console.log(lines.join('\n'));
  const ref = stateString(world);
  const world2 = createWorld(CONFIG.seed);
  for (let f = 0; f < framesRun; f++) stepWorld(world2, CONFIG.dt, (car) => aiInput(world2, car));
  console.log(stateString(world2) === ref ? 'DETERMINISM OK: repeated run with same seed produced identical state' : 'DETERMINISM FAIL');
}

function runBrowser() {
  const canvas = document.getElementById('racer') || (() => {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;display:block';
    document.body.appendChild(c);
    return c;
  })();
  const ctx = canvas.getContext('2d');
  const world = createWorld(CONFIG.seed);
  const path = new Path2D();
  world.centerline.forEach((p, i) => (i === 0 ? path.moveTo(p[0], p[1]) : path.lineTo(p[0], p[1])));
  path.closePath();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of world.centerline) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const pad = 70;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const keyState = { up: false, down: false, left: false, right: false };
  const keyMap = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code]) {
      keyState[keyMap[e.code]] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code]) {
      keyState[keyMap[e.code]] = false;
      e.preventDefault();
    }
  });
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  const playerInput = () => ({
    throttle: keyState.up ? 1 : 0,
    brake: keyState.down ? 1 : 0,
    steer: (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0),
  });
  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    const s = Math.min((w - 24) / (maxX - minX), (h - 24) / (maxY - minY));
    const ox = (w - (maxX - minX) * s) / 2;
    const oy = (h - (maxY - minY) * s) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#24441f';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = CONFIG.trackWidth + 16;
    ctx.stroke(path);
    ctx.strokeStyle = '#3d3d44';
    ctx.lineWidth = CONFIG.trackWidth;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 22]);
    ctx.stroke(path);
    ctx.setLineDash([]);
    const p0 = world.centerline[0];
    const d0 = trackDirection(world.centerline, 0);
    const n0 = [-d0[1], d0[0]];
    const hw = CONFIG.trackWidth / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(p0[0] - n0[0] * hw, p0[1] - n0[1] * hw);
    ctx.lineTo(p0[0] + n0[0] * hw, p0[1] + n0[1] * hw);
    ctx.stroke();
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(p0[0] + d0[0] * 12 - n0[0] * hw, p0[1] + d0[1] * 12 - n0[1] * hw);
    ctx.lineTo(p0[0] + d0[0] * 12 + n0[0] * hw, p0[1] + d0[1] * 12 + n0[1] * hw);
    ctx.stroke();
    for (const c of world.cars) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.heading);
      ctx.fillStyle = c.color;
      ctx.fillRect(-14, -8, 28, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(5, -6, 5, 12);
      if (c.isPlayer) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -8, 28, 16);
      }
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const order = ranked(world);
    const player = world.cars.find((c) => c.isPlayer);
    const ppos = order.findIndex((r) => r.car === player) + 1;
    const curLap = Math.min(player.lapsCompleted + 1, CONFIG.laps);
    const best = player.lapTimes.length ? Math.min.apply(null, player.lapTimes) : -1;
    const speed = Math.hypot(player.vx, player.vy);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 210, 132);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.textBaseline = 'top';
    const hud = [
      'POS  ' + ppos + '/' + world.cars.length,
      'LAP  ' + curLap + '/' + CONFIG.laps,
      'TIME ' + fmtTime(world.simTime),
      'BEST ' + (best >= 0 ? fmtTime(best) : '--'),
      'SPD  ' + Math.round(speed),
    ];
    hud.forEach((line, i) => ctx.fillText(line, 24, 24 + i * 22));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(w - 292, 12, 280, 132);
    ctx.font = '15px monospace';
    order.forEach((r, i) => {
      ctx.fillStyle = r.car.color;
      ctx.fillRect(w - 280, 27 + i * 26, 10, 10);
      ctx.fillStyle = '#ffffff';
      const time = r.car.finishTime >= 0 ? fmtTime(r.car.finishTime) : fmtTime(world.simTime - r.car.lapStart);
      ctx.fillText(i + 1 + '. ' + r.car.name.padEnd(9) + ' L' + Math.min(r.car.lapsCompleted + 1, CONFIG.laps) + '  ' + time, w - 264, 24 + i * 26);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px monospace';
    ctx.fillText('WASD / arrows to drive', 14, h - 26);
  }
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let delta = (now - last) / 1000;
    last = now;
    if (delta > 0.1) delta = 0.1;
    acc += delta;
    while (acc >= CONFIG.dt) {
      stepWorld(world, CONFIG.dt, playerInput);
      acc -= CONFIG.dt;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') runBrowser();
else runHeadless();
