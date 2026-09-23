/* Pure simulation: no DOM, wall clock, timers, external libraries, or Math.random. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ApexSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DT = 1 / 120;
  const TAU = Math.PI * 2;
  const TOTAL_LAPS = 3;
  const CAR_RADIUS = 12;
  const HULL_OFFSET = 9;
  const INV_INERTIA = 12 / (42 * 42 + 24 * 24);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const mod = (n, m) => ((n % m) + m) % m;
  const angleDiff = (a, b) => mod(a - b + Math.PI, TAU) - Math.PI;

  // Mulberry32. Independent seeded streams are used for driving and scenery.
  function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createTrack() {
    // Closed route, beginning on the bottom straight (heading right).
    const anchors = [
      [690, 733], [948, 733], [1169, 677], [1247, 525],
      [1186, 359], [1080, 250], [896, 224], [748, 308],
      [610, 412], [479, 357], [387, 228], [239, 272],
      [181, 433], [259, 601], [435, 712],
    ];
    const points = [];
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[mod(i - 1, anchors.length)];
      const b = anchors[i];
      const c = anchors[(i + 1) % anchors.length];
      const d = anchors[(i + 2) % anchors.length];
      const steps = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 10);
      for (let j = 0; j < steps; j++) {
        const t = j / steps, t2 = t * t, t3 = t2 * t;
        const spline = k => .5 * ((2 * b[k]) + (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
        points.push({ x: spline(0), y: spline(1) });
      }
    }
    let length = 0;
    const segments = points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy);
      const segment = { x: p.x, y: p.y, dx, dy, len, s: length, tx: dx / len, ty: dy / len };
      length += len;
      return segment;
    });
    const track = { points, segments, length, halfWidth: 57, apron: 23, gateCount: 12 };
    track.gates = Array.from({ length: track.gateCount }, (_, i) => sampleTrack(track, i * length / track.gateCount));
    return track;
  }

  function sampleTrack(track, distance, lane = 0) {
    const s = mod(distance, track.length);
    let lo = 0, hi = track.segments.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (track.segments[mid].s <= s) lo = mid;
      else hi = mid - 1;
    }
    const p = track.segments[lo];
    const t = (s - p.s) / p.len;
    return { x: p.x + p.dx * t - p.ty * lane, y: p.y + p.dy * t + p.tx * lane,
      tx: p.tx, ty: p.ty, angle: Math.atan2(p.ty, p.tx), s };
  }

  function nearestTrack(track, x, y) {
    let bestD2 = Infinity, result;
    for (let i = 0; i < track.segments.length; i++) {
      const p = track.segments[i];
      const t = clamp(((x - p.x) * p.dx + (y - p.y) * p.dy) / (p.len * p.len), 0, 1);
      const px = p.x + p.dx * t, py = p.y + p.dy * t;
      const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        result = { x: px, y: py, s: p.s + t * p.len, tx: p.tx, ty: p.ty,
          distance: Math.sqrt(d2), lateral: dx * -p.ty + dy * p.tx, index: i };
      }
    }
    return result;
  }

  function createRace(seed = 2048) {
    const rng = seededRandom(seed), track = createTrack();
    const specs = [
      { name: 'YOU', color: '#d6f17b', ai: false, grid: 3 },
      { name: 'NOVA', color: '#f49474', ai: true, grid: 0 },
      { name: 'KAI', color: '#9ec5ef', ai: true, grid: 1 },
      { name: 'REMY', color: '#c1a6e7', ai: true, grid: 2 },
    ];
    const cars = specs.map((spec, id) => {
      const distance = -40 - Math.floor(spec.grid / 2) * 59;
      const p = sampleTrack(track, distance, spec.grid % 2 ? 23 : -23);
      return { ...spec, id, x: p.x, y: p.y, prevX: p.x, prevY: p.y,
        angle: p.angle, prevAngle: p.angle, vx: 0, vy: 0, omega: 0,
        lapsCompleted: 0, nextGate: 0, startedLap: false, lapStartTime: 0,
        lapTimes: [], bestLap: null, finished: false, finishTime: null, finishPlace: null,
        progress: distance, prevS: p.s, distance: p.s, offroad: false,
        aiLane: (rng() - .5) * 30, aiPace: .87 + rng() * .09,
        aiPhase: rng() * TAU, wrongWayTicks: 0, stuckTicks: 0,
        control: { throttle: 0, brake: 0, steer: 0, handbrake: false } };
    });
    return { seed: seed >>> 0, track, cars, phase: 'ready', paused: false,
      ticks: 0, countdownTicks: 360, time: 0, totalLaps: TOTAL_LAPS,
      finishCount: 0, collisionCount: 0, events: [] };
  }

  function startRace(race) { if (race.phase === 'ready') race.phase = 'countdown'; }

  function aiControl(race, car) {
    const track = race.track;
    const p = nearestTrack(track, car.x, car.y);
    const speed = Math.hypot(car.vx, car.vy);
    const lookAhead = 39 + speed * .31;
    let lane = car.aiLane + Math.sin(race.time * .36 + car.aiPhase) * 3;
    let trafficSpeed = Infinity;
    for (const other of race.cars) {
      if (other === car) continue;
      const forward = (other.x - car.x) * p.tx + (other.y - car.y) * p.ty;
      const lateral = (other.x - car.x) * -p.ty + (other.y - car.y) * p.tx;
      if (forward > 0 && forward < 105 && Math.abs(lateral) < 30) {
        lane += (p.lateral >= 0 ? 1 : -1) * 22;
        if (forward < 44) trafficSpeed = Math.hypot(other.vx, other.vy) + 10;
      }
    }
    lane = clamp(lane, -32, 32);
    const target = sampleTrack(track, p.s + lookAhead, lane);
    const desiredAngle = Math.atan2(target.y - car.y, target.x - car.x);
    const error = angleDiff(desiredAngle, car.angle);
    let curvature = 0;
    for (const ahead of [35, 85, 140]) {
      const a = sampleTrack(track, p.s + ahead);
      const b = sampleTrack(track, p.s + ahead + 55);
      curvature = Math.max(curvature, Math.abs(angleDiff(b.angle, a.angle)) / 55);
    }
    let targetSpeed = Math.min(318, Math.sqrt(370 / Math.max(curvature, .002))) * car.aiPace;
    targetSpeed *= clamp(1 - Math.abs(error) * .27, .33, 1);
    targetSpeed = Math.min(targetSpeed, trafficSpeed);
    const forwardSpeed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
    if (speed < 15) car.stuckTicks++;
    else car.stuckTicks = 0;
    // A short reverse maneuver recovers from traffic and nose-first wall impacts.
    if (car.stuckTicks > 210 && car.stuckTicks < 340) {
      return { throttle: 0, brake: 1, steer: -Math.sign(error || 1), handbrake: false };
    }
    if (car.stuckTicks >= 340) car.stuckTicks = 0;
    return {
      throttle: clamp((targetSpeed - forwardSpeed) / 45, 0, 1),
      brake: forwardSpeed > targetSpeed + 16 ? clamp((forwardSpeed - targetSpeed) / 80, 0, 1) : 0,
      steer: clamp(error * 2.5, -1, 1), handbrake: false,
    };
  }

  function integrateCar(car, input, track) {
    const throttle = clamp(Number(input.throttle) || 0, 0, 1);
    const brake = clamp(Number(input.brake) || 0, 0, 1);
    const steer = clamp(Number(input.steer) || 0, -1, 1);
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    let forward = car.vx * fx + car.vy * fy;
    let lateral = -car.vx * fy + car.vy * fx;
    const road = nearestTrack(track, car.x, car.y);
    car.offroad = road.distance > track.halfWidth - 4;
    const maxSpeed = car.offroad ? 125 : 355;
    const accel = car.offroad ? 105 : 185;
    if (throttle > 0) forward += (forward < -5 ? 310 : accel) * throttle * DT;
    if (brake > 0) {
      if (forward > 0) forward = Math.max(0, forward - 325 * brake * DT);
      else if (throttle === 0) forward = Math.max(-80, forward - 105 * brake * DT);
    }
    const resistance = (car.offroad ? 1.4 : .14) * Math.abs(forward) + 8;
    forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - resistance * DT);
    if (input.handbrake) forward *= Math.exp(-1.5 * DT);
    if (forward > maxSpeed) forward = Math.max(maxSpeed, forward - 260 * DT);
    lateral *= Math.exp(-(input.handbrake ? 2.5 : car.offroad ? 4 : 8.5) * DT);
    const steeringRate = 2.4 * clamp(Math.abs(forward) / 70, 0, 1) / (1 + Math.abs(forward) / 530);
    const desiredOmega = steer * steeringRate * Math.sign(forward) * (input.handbrake ? 1.32 : 1);
    car.omega += (desiredOmega - car.omega) * (1 - Math.exp(-9 * DT));
    car.angle = angleDiff(car.angle + car.omega * DT, 0);
    car.vx = fx * forward - fy * lateral;
    car.vy = fy * forward + fx * lateral;
    car.x += car.vx * DT;
    car.y += car.vy * DT;
    car.control = { throttle, brake, steer, handbrake: !!input.handbrake };
  }

  function hull(car) {
    const dx = Math.cos(car.angle) * HULL_OFFSET, dy = Math.sin(car.angle) * HULL_OFFSET;
    return [{ x: car.x - dx, y: car.y - dy }, { x: car.x + dx, y: car.y + dy }];
  }

  // Equal-mass rigid bodies; contact velocity includes angular velocity.
  function resolveCarCollision(a, b) {
    let contact = null, deepest = 0;
    for (const ca of hull(a)) for (const cb of hull(b)) {
      const dx = cb.x - ca.x, dy = cb.y - ca.y;
      const distance = Math.hypot(dx, dy);
      const penetration = CAR_RADIUS * 2 - distance;
      if (penetration > deepest) {
        deepest = penetration;
        contact = { nx: distance > 1e-8 ? dx / distance : 1,
          ny: distance > 1e-8 ? dy / distance : 0,
          x: (ca.x + cb.x) * .5, y: (ca.y + cb.y) * .5 };
      }
    }
    if (!contact) return false;
    const { nx, ny, x, y } = contact;
    const rax = x - a.x, ray = y - a.y, rbx = x - b.x, rby = y - b.y;
    const rvx = b.vx - b.omega * rby - a.vx + a.omega * ray;
    const rvy = b.vy + b.omega * rbx - a.vy - a.omega * rax;
    const normalSpeed = rvx * nx + rvy * ny;
    if (normalSpeed < 0) {
      const raCrossN = rax * ny - ray * nx, rbCrossN = rbx * ny - rby * nx;
      const impulse = -(1 + .28) * normalSpeed / (2 + (raCrossN ** 2 + rbCrossN ** 2) * INV_INERTIA);
      applyImpulse(a, -nx * impulse, -ny * impulse, rax, ray);
      applyImpulse(b, nx * impulse, ny * impulse, rbx, rby);
      const tx = -ny, ty = nx;
      const raCrossT = rax * ty - ray * tx, rbCrossT = rbx * ty - rby * tx;
      const friction = clamp(-(rvx * tx + rvy * ty) / (2 + (raCrossT ** 2 + rbCrossT ** 2) * INV_INERTIA), -impulse * .3, impulse * .3);
      applyImpulse(a, -tx * friction, -ty * friction, rax, ray);
      applyImpulse(b, tx * friction, ty * friction, rbx, rby);
    }
    const correction = Math.max(0, deepest - .03) * .46;
    a.x -= nx * correction; a.y -= ny * correction;
    b.x += nx * correction; b.y += ny * correction;
    return true;
  }

  function applyImpulse(car, ix, iy, rx, ry) {
    car.vx += ix; car.vy += iy;
    car.omega = clamp(car.omega + (rx * iy - ry * ix) * INV_INERTIA, -5, 5);
  }

  function resolveWalls(car, track) {
    let collided = false;
    for (const offset of [-HULL_OFFSET, HULL_OFFSET]) {
      const cx = car.x + Math.cos(car.angle) * offset;
      const cy = car.y + Math.sin(car.angle) * offset;
      const p = nearestTrack(track, cx, cy);
      const limit = track.halfWidth + track.apron - CAR_RADIUS;
      if (p.distance <= limit) continue;
      collided = true;
      const nx = (cx - p.x) / p.distance, ny = (cy - p.y) / p.distance;
      const rx = cx - car.x + nx * CAR_RADIUS, ry = cy - car.y + ny * CAR_RADIUS;
      const vn = (car.vx - car.omega * ry) * nx + (car.vy + car.omega * rx) * ny;
      car.x -= nx * (p.distance - limit); car.y -= ny * (p.distance - limit);
      if (vn > 0) {
        const crossN = rx * ny - ry * nx;
        const j = -(1 + .3) * vn / (1 + crossN * crossN * INV_INERTIA);
        applyImpulse(car, nx * j, ny * j, rx, ry);
        car.vx *= .985; car.vy *= .985;
      }
    }
    return collided;
  }

  function updateLapProgress(race, car) {
    if (car.finished) return;
    const track = race.track, p = nearestTrack(track, car.x, car.y);
    let delta = mod(p.s - car.prevS + track.length / 2, track.length) - track.length / 2;
    // Discontinuous teleports must never turn into race progress.
    if (Math.abs(delta) > 30) delta = 0;
    car.progress += delta;
    car.prevS = p.s; car.distance = p.s;
    if (delta < -.08 && Math.hypot(car.vx, car.vy) > 35) car.wrongWayTicks++;
    else car.wrongWayTicks = Math.max(0, car.wrongWayTicks - 2);

    const gate = track.gates[car.nextGate];
    const previousSide = (car.prevX - gate.x) * gate.tx + (car.prevY - gate.y) * gate.ty;
    const currentSide = (car.x - gate.x) * gate.tx + (car.y - gate.y) * gate.ty;
    if (previousSide > 0 || currentSide <= 0 || currentSide - previousSide > 30) return;
    const fraction = -previousSide / (currentSide - previousSide);
    const ix = car.prevX + (car.x - car.prevX) * fraction;
    const iy = car.prevY + (car.y - car.prevY) * fraction;
    const across = Math.abs((ix - gate.x) * -gate.ty + (iy - gate.y) * gate.tx);
    if (across > track.halfWidth + track.apron) return;
    const crossingTime = Math.max(0, race.time - DT + fraction * DT);
    if (car.nextGate === 0) {
      if (car.startedLap) {
        const lapTime = crossingTime - car.lapStartTime;
        car.lapTimes.push(lapTime);
        car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
        car.lapsCompleted++;
        car.lapStartTime = crossingTime;
        race.events.push({ type: 'lap', carId: car.id, lap: car.lapsCompleted, time: lapTime });
        if (car.lapsCompleted >= race.totalLaps) {
          car.finished = true;
          car.finishTime = crossingTime;
          race.events.push({ type: 'finish', carId: car.id, time: crossingTime });
        }
      } else car.startedLap = true;
    }
    car.nextGate = (car.nextGate + 1) % track.gateCount;
  }

  function standings(race) {
    return race.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime || a.id - b.id;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress || a.grid - b.grid;
    });
  }

  function stepRace(race, input = {}) {
    race.events.length = 0;
    if (race.paused || race.phase === 'ready' || race.phase === 'finished') return;
    if (race.phase === 'countdown') {
      race.countdownTicks--;
      if (race.countdownTicks <= 0) {
        race.phase = 'racing';
        race.events.push({ type: 'go' });
      }
      return;
    }
    race.ticks++;
    race.time = race.ticks * DT;
    // Compute all controls from the same state, before moving any car.
    const controls = race.cars.map(car => car.ai || car.finished ? aiControl(race, car) : input);
    for (const car of race.cars) {
      car.prevX = car.x; car.prevY = car.y; car.prevAngle = car.angle;
      integrateCar(car, controls[car.id], race.track);
    }
    for (let iteration = 0; iteration < 3; iteration++) {
      for (let i = 0; i < race.cars.length; i++) for (let j = i + 1; j < race.cars.length; j++) {
        if (resolveCarCollision(race.cars[i], race.cars[j]) && iteration === 0) race.collisionCount++;
      }
      for (const car of race.cars) resolveWalls(car, race.track);
    }
    for (const car of race.cars) updateLapProgress(race, car);
    // Fractional crossing times resolve finishes within the same fixed step.
    const finishers = standings(race).filter(car => car.finished);
    finishers.forEach((car, i) => { car.finishPlace = i + 1; });
    race.finishCount = finishers.length;
    if (race.cars.every(car => car.finished)) race.phase = 'finished';
  }

  // Render cadence only determines how many identical simulation steps run.
  // Overload is capped at 250 ms, deliberately slowing game time instead of
  // allowing an unbounded catch-up loop after a suspended browser tab.
  class FixedStepper {
    constructor(step) { this.step = step; this.accumulator = 0; }
    advance(seconds) {
      this.accumulator += clamp(seconds, 0, .25);
      let count = 0;
      while (this.accumulator + 1e-10 >= DT) {
        this.step(); this.accumulator -= DT; count++;
      }
      this.accumulator = Math.max(0, this.accumulator);
      return { alpha: this.accumulator / DT, count };
    }
    reset() { this.accumulator = 0; }
  }

  return { DT, TOTAL_LAPS, CAR_RADIUS, INV_INERTIA, clamp, mod, angleDiff,
    seededRandom, createTrack, sampleTrack, nearestTrack, createRace, startRace,
    aiControl, integrateCar, hull, resolveCarCollision, resolveWalls,
    updateLapProgress, standings, stepRace, FixedStepper };
});
