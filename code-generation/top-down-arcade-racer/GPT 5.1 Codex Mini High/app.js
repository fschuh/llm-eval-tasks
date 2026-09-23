'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 576;

const hudLap = document.getElementById('hud-lap');
const hudTime = document.getElementById('hud-time');
const hudPosition = document.getElementById('hud-position');

const TOTAL_LAPS = 3;
const FIXED_DT = 1 / 60;

const rng = createSeededRNG(0x1a2b3c4d);
const track = buildTrack();
const finishLine = {
  start: track.waypoints[0],
  end: track.waypoints[1],
};
const finishDir = normalize(subtract(finishLine.end, finishLine.start));
let finishNormal = { x: finishDir.y, y: -finishDir.x };
if (dot(subtract(track.center, finishLine.start), finishNormal) < 0) {
  finishNormal.x *= -1;
  finishNormal.y *= -1;
}

const cars = createCars(track.waypoints, finishLine, finishNormal);
const playerCar = cars[0];

let raceTime = 0;
let lastTime = performance.now();
let accumulator = 0;

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
};

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      input.up = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      input.down = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      input.left = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      input.right = true;
      break;
    default:
      return;
  }
  event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      input.up = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      input.down = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      input.left = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      input.right = false;
      break;
    default:
      return;
  }
  event.preventDefault();
});

function loop(timestamp) {
  const elapsed = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  accumulator += elapsed;
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

function update(dt) {
  raceTime += dt;
  cars.forEach((car) => {
    car.currentLapTime += dt;
    car.previousPosition.x = car.position.x;
    car.previousPosition.y = car.position.y;
  });

  updatePlayerCar(playerCar);
  for (let i = 1; i < cars.length; i += 1) {
    updateAI(cars[i]);
  }

  cars.forEach((car) => applyDynamics(car, dt));
  resolveCollisions();

  cars.forEach((car) => {
    updateWaypointProgress(car);
    checkLap(car);
  });

  updateHUD();
}

function updatePlayerCar(car) {
  if (car.finished) {
    car.throttle = 0;
    car.steerInput = 0;
    return;
  }
  const forward = (input.up ? 1 : 0) + (input.down ? -1 : 0);
  car.throttle = Math.max(-1, Math.min(1, forward));
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.steerInput = Math.max(-1, Math.min(1, steer));
}

function updateAI(car) {
  if (car.finished) {
    car.throttle = 0;
    car.steerInput = 0;
    return;
  }
  const targetIndex = (car.waypointIndex + 1) % track.waypoints.length;
  const targetPoint = track.waypoints[targetIndex];
  const toTarget = subtract(targetPoint, car.position);
  const desiredHeading = Math.atan2(toTarget.y, toTarget.x);
  const headingDelta = normalizeAngle(desiredHeading - car.angle);
  car.steerInput = clamp(headingDelta * 1.3, -1, 1);

  const distance = length(toTarget);
  const speed = length(car.velocity);
  let baseThrottle = 0.75;
  if (Math.abs(headingDelta) > 0.6) baseThrottle = 0.25;
  if (distance < 90) baseThrottle *= 0.65;
  if (speed > car.maxSpeed * 0.9 && Math.abs(headingDelta) < 0.3) baseThrottle = 0.4;
  const throttle = clamp(baseThrottle * car.aiAggressiveness, 0.2, 1);
  car.throttle = throttle;
}

function applyDynamics(car, dt) {
  const forwardVec = {
    x: Math.cos(car.angle),
    y: Math.sin(car.angle),
  };
  const lateralVec = {
    x: -forwardVec.y,
    y: forwardVec.x,
  };

  const force =
    car.throttle >= 0
      ? car.maxForwardAccel * car.throttle
      : car.maxReverseAccel * car.throttle;
  car.velocity.x += forwardVec.x * force * dt;
  car.velocity.y += forwardVec.y * force * dt;

  const lateralSpeed = dot(car.velocity, lateralVec);
  car.velocity.x -= lateralVec.x * lateralSpeed * car.lateralFriction * dt;
  car.velocity.y -= lateralVec.y * lateralSpeed * car.lateralFriction * dt;

  car.velocity.x *= Math.max(0, 1 - car.drag * dt);
  car.velocity.y *= Math.max(0, 1 - car.drag * dt);

  const speed = length(car.velocity);
  const maxSpeed = car.maxSpeed;
  if (speed > maxSpeed) {
    car.velocity.x = (car.velocity.x / speed) * maxSpeed;
    car.velocity.y = (car.velocity.y / speed) * maxSpeed;
  }

  const speedFactor = Math.min(1, speed / maxSpeed);
  const turning = car.turnSpeed * (0.25 + 0.75 * (1 - speedFactor));
  car.angle += car.steerInput * turning * dt;

  car.position.x += car.velocity.x * dt;
  car.position.y += car.velocity.y * dt;
}

function resolveCollisions() {
  const restitution = 0.4;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const delta = subtract(b.position, a.position);
      const distance = length(delta);
      const minDist = a.radius + b.radius;
      if (distance === 0 || distance >= minDist) continue;

      const normal = {
        x: delta.x / distance,
        y: delta.y / distance,
      };
      const relVel = subtract(b.velocity, a.velocity);
      const separatingVelocity = dot(relVel, normal);
      const impulseMag =
        (-(1 + restitution) * separatingVelocity) / (a.invMass + b.invMass);
      const impulse = scale(normal, impulseMag);
      a.velocity.x -= impulse.x * a.invMass;
      a.velocity.y -= impulse.y * a.invMass;
      b.velocity.x += impulse.x * b.invMass;
      b.velocity.y += impulse.y * b.invMass;

      const penetration = minDist - distance;
      const correction = scale(normal, penetration / (a.invMass + b.invMass));
      a.position.x -= correction.x * a.invMass;
      a.position.y -= correction.y * a.invMass;
      b.position.x += correction.x * b.invMass;
      b.position.y += correction.y * b.invMass;
    }
  }
}

function updateWaypointProgress(car) {
  const current = track.waypoints[car.waypointIndex];
  const nextIndex = (car.waypointIndex + 1) % track.waypoints.length;
  const next = track.waypoints[nextIndex];
  const segment = subtract(next, current);
  const segmentLen = length(segment);
  if (segmentLen < 0.0001) return;
  const toCar = subtract(car.position, current);
  const projection = clamp(
    dot(toCar, segment) / (segmentLen * segmentLen),
    0,
    1
  );
  car.progressAlongSegment = projection;
  if (projection > 0.95) {
    car.waypointIndex = nextIndex;
  }
}

function checkLap(car) {
  if (car.finished) return;
  const currentSide = dot(
    subtract(car.position, finishLine.start),
    finishNormal
  );
  if (
    car.lastFinishSide <= 0 &&
    currentSide > 0 &&
    car.currentLapTime > 0.05
  ) {
    car.lapsCompleted += 1;
    car.lastLapTime = car.currentLapTime;
    car.lapTimes.push(car.currentLapTime);
    car.currentLap = car.lapsCompleted + 1;
    car.currentLapTime = 0;
    if (car.lapsCompleted >= TOTAL_LAPS) {
      car.finished = true;
      car.currentLap = TOTAL_LAPS;
    }
  }
  car.lastFinishSide = currentSide;
}

function updateHUD() {
  const lapNumber = Math.min(TOTAL_LAPS, Math.max(1, playerCar.currentLap));
  hudLap.textContent = `Lap ${lapNumber} / ${TOTAL_LAPS}`;
  hudTime.textContent = `Time ${formatTime(raceTime)}`;
  const ranking = getRankings();
  const playerRank =
    ranking.findIndex((entry) => entry.car === playerCar) + 1;
  hudPosition.textContent = `Position ${playerRank} / ${cars.length}`;
}

function getRankings() {
  return [...cars].map((car) => ({
    car,
    progress: car.lapsCompleted * track.waypoints.length + car.waypointIndex + car.progressAlongSegment,
  })).sort((a, b) => b.progress - a.progress);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0c1326';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTrack();
  drawWaypoints();
  drawFinishLine();
  cars.forEach(drawCar);
}

function drawTrack() {
  ctx.save();
  ctx.fillStyle = '#2f313a';
  ctx.strokeStyle = '#b5b7c1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  track.outer.forEach((pt, index) => {
    if (index === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.closePath();
  ctx.moveTo(track.inner[0].x, track.inner[0].y);
  track.inner.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.stroke();

  ctx.strokeStyle = '#1a1c24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  track.inner.forEach((pt, index) => {
    if (index === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawWaypoints() {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  track.waypoints.forEach((pt, index) => {
    ctx.moveTo(pt.x + 2, pt.y);
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
  });
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFinishLine() {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(finishLine.start.x, finishLine.start.y);
  ctx.lineTo(finishLine.end.x, finishLine.end.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.position.x, car.position.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = car.color;
  ctx.strokeStyle = '#0a0d15';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, -9);
  ctx.lineTo(16, -9);
  ctx.lineTo(18, -5);
  ctx.lineTo(18, 5);
  ctx.lineTo(16, 9);
  ctx.lineTo(-16, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f1321';
  ctx.fillRect(-8, -6, 16, 12);

  ctx.fillStyle = '#ffffff';
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(car.name[0], 0, 0);
  ctx.restore();
}

function createCars(waypointsList, finish, normal) {
  const baseDir = normalize(subtract(waypointsList[1], waypointsList[0]));
  const lanePerp = { x: -baseDir.y, y: baseDir.x };
  const configs = [
    { name: 'Player', color: '#ffe13b', ai: false, offset: 0 },
    { name: 'Crimson', color: '#ff5f39', ai: true, offset: -35 },
    { name: 'Azure', color: '#3cbcff', ai: true, offset: 35 },
    { name: 'Verdant', color: '#6ef2b0', ai: true, offset: -70 },
  ];

  return configs.map((config) => {
    const start = {
      x: finish.start.x + lanePerp.x * config.offset,
      y: finish.start.y + lanePerp.y * config.offset,
    };
    const car = {
      name: config.name,
      color: config.color,
      position: { ...start },
      previousPosition: { ...start },
      velocity: {
        x: baseDir.x * 32,
        y: baseDir.y * 32,
      },
      angle: Math.atan2(baseDir.y, baseDir.x),
      radius: 16,
      invMass: 1,
      maxForwardAccel: 2200,
      maxReverseAccel: 1600,
      drag: 0.5,
      lateralFriction: 4.2,
      turnSpeed: 3.1,
      throttle: 0,
      steerInput: 0,
      lapsCompleted: 0,
      currentLap: 1,
      currentLapTime: 0,
      lapTimes: [],
      lastLapTime: 0,
      waypointIndex: 0,
      progressAlongSegment: 0,
      lastFinishSide: Math.min(-0.1, dot(subtract(start, finish.start), normal)),
      finished: false,
    };

    if (config.ai) {
      const skill = 0.92 + (rng() - 0.5) * 0.2;
      car.aiAggressiveness = clamp(0.85 + rng() * 0.3, 0.75, 1.1);
      car.maxSpeed = clamp(220 * skill, 200, 255);
      car.turnSpeed = 3.0 + (rng() - 0.5) * 0.6;
      car.maxForwardAccel = 2000 + rng() * 600;
      car.lateralFriction = 3.8 + rng() * 1.1;
      car.drag = 0.45 + rng() * 0.15;
    } else {
      car.aiAggressiveness = 1;
      car.maxSpeed = 240;
    }

    return car;
  });
}

function buildTrack() {
  const center = { x: canvas.width / 2, y: canvas.height / 2 + 20 };
  const outer = [];
  const inner = [];
  const outerRadius = 270;
  const innerRadius = 150;
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2;
    const outerOffset = Math.sin(angle * 2.3) * 35;
    const innerOffset = Math.cos(angle * 1.8) * 22;
    outer.push(polar(center, outerRadius + outerOffset, angle));
    inner.push(polar(center, innerRadius + innerOffset, angle));
  }
  const waypoints = [];
  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    const radius = 190 + Math.sin(angle * 3 + 0.8) * 20;
    waypoints.push(polar(center, radius, angle));
  }
  return { center, outer, inner, waypoints };
}

function polar(origin, radius, angle) {
  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius,
  };
}

function createSeededRNG(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function length(vec) {
  return Math.hypot(vec.x, vec.y);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function subtract(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function scale(vec, factor) {
  return {
    x: vec.x * factor,
    y: vec.y * factor,
  };
}

function normalize(vec) {
  const len = length(vec);
  if (len === 0) return { x: 0, y: 0 };
  return {
    x: vec.x / len,
    y: vec.y / len,
  };
}

function normalizeAngle(angle) {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(
    hundredths
  ).padStart(2, '0')}`;
}
