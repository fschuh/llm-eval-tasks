"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const startCard = document.querySelector("#startCard");
const startButton = document.querySelector("#startButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FIXED_DT = 1 / 120;
const TOTAL_LAPS = 3;
const ROAD_HALF_WIDTH = 78;
const CAR_RADIUS = 15;
const WAYPOINT_COUNT = 120;
const SEED = 4731;
const controls = { left: false, right: false, accelerate: false, brake: false };

let rng;
let cars;
let raceTime;
let accumulator = 0;
let lastFrame = 0;
let running = false;
let paused = false;
let countdown = 3;
let finishOrder = [];

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildWaypoints() {
  const points = [];
  const segmentSamples = 30;
  for (let i = 0; i < segmentSamples; i++) points.push({ x: 330 + 620 * i / segmentSamples, y: 210 });
  for (let i = 0; i < segmentSamples; i++) {
    const a = -Math.PI / 2 + Math.PI * i / segmentSamples;
    points.push({ x: 950 + Math.cos(a) * 180, y: 390 + Math.sin(a) * 180 });
  }
  for (let i = 0; i < segmentSamples; i++) points.push({ x: 950 - 620 * i / segmentSamples, y: 570 });
  for (let i = 0; i < segmentSamples; i++) {
    const a = Math.PI / 2 + Math.PI * i / segmentSamples;
    points.push({ x: 330 + Math.cos(a) * 180, y: 390 + Math.sin(a) * 180 });
  }
  return points;
}
const waypoints = buildWaypoints();

function makeCar(name, color, gridIndex, isPlayer = false) {
  const x = 755 + (gridIndex % 2) * 46;
  const y = 570 + Math.floor(gridIndex / 2) * 38;
  return {
    name, color, isPlayer, x, y, angle: Math.PI, vx: 0, vy: 0,
    angularVelocity: 0, mass: 1, radius: CAR_RADIUS, nextWaypoint: 75,
    completedWaypoints: 0, lap: 1, finished: false, finishTime: 0,
    aiSkill: isPlayer ? 1 : 0.88 + rng() * 0.09,
    laneOffset: isPlayer ? 0 : (rng() - 0.5) * 34,
  };
}

function resetRace() {
  rng = mulberry32(SEED);
  cars = [
    makeCar("YOU", "#d8ee42", 3, true),
    makeCar("NOVA", "#f04b2f", 0),
    makeCar("MOSS", "#5bd1d7", 1),
    makeCar("KITE", "#f2bd4b", 2),
  ];
  raceTime = 0;
  countdown = 3;
  finishOrder = [];
  paused = false;
  accumulator = 0;
}

function trackProjection(x, y) {
  let px;
  let py;
  if (x >= 330 && x <= 950) {
    const topDistance = Math.abs(y - 210);
    const bottomDistance = Math.abs(y - 570);
    px = x;
    py = topDistance < bottomDistance ? 210 : 570;
  } else {
    const cx = x < 330 ? 330 : 950;
    const a = Math.atan2(y - 390, x - cx);
    px = cx + Math.cos(a) * 180;
    py = 390 + Math.sin(a) * 180;
  }
  const dx = x - px;
  const dy = y - py;
  const distance = Math.hypot(dx, dy);
  return { x: px, y: py, distance, nx: distance ? dx / distance : 0, ny: distance ? dy / distance : 0 };
}

function nearestWaypointIndex(car) {
  let best = car.nextWaypoint;
  let bestDistance = Infinity;
  for (let offset = -3; offset <= 8; offset++) {
    const index = (car.nextWaypoint + offset + WAYPOINT_COUNT) % WAYPOINT_COUNT;
    const p = waypoints[index];
    const d = (p.x - car.x) ** 2 + (p.y - car.y) ** 2;
    if (d < bestDistance) { bestDistance = d; best = index; }
  }
  return best;
}

function updateProgress(car) {
  const target = waypoints[car.nextWaypoint];
  if ((target.x - car.x) ** 2 + (target.y - car.y) ** 2 < 46 ** 2) {
    car.nextWaypoint = (car.nextWaypoint + 1) % WAYPOINT_COUNT;
    car.completedWaypoints++;
    if (car.nextWaypoint === 75 && car.completedWaypoints >= WAYPOINT_COUNT) {
      car.completedWaypoints -= WAYPOINT_COUNT;
      car.lap++;
      if (car.lap > TOTAL_LAPS && !car.finished) {
        car.finished = true;
        car.finishTime = raceTime;
        finishOrder.push(car);
      }
    }
  } else {
    const nearest = nearestWaypointIndex(car);
    const forward = (nearest - car.nextWaypoint + WAYPOINT_COUNT) % WAYPOINT_COUNT;
    if (forward > 0 && forward < 7) {
      car.completedWaypoints += forward;
      car.nextWaypoint = (nearest + 1) % WAYPOINT_COUNT;
    }
  }
}

function aiInput(car) {
  const speed = Math.hypot(car.vx, car.vy);
  const lookAhead = 5 + Math.floor(speed / 85);
  const index = (car.nextWaypoint + lookAhead) % WAYPOINT_COUNT;
  const point = waypoints[index];
  const next = waypoints[(index + 1) % WAYPOINT_COUNT];
  const tx = next.x - point.x;
  const ty = next.y - point.y;
  const len = Math.hypot(tx, ty) || 1;
  const targetX = point.x - ty / len * car.laneOffset;
  const targetY = point.y + tx / len * car.laneOffset;
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  let error = normalizeAngle(desired - car.angle);
  const corner = Math.abs(normalizeAngle(Math.atan2(
    waypoints[(index + 5) % WAYPOINT_COUNT].y - point.y,
    waypoints[(index + 5) % WAYPOINT_COUNT].x - point.x
  ) - desired));
  const targetSpeed = (corner > 0.22 ? 185 : 255) * car.aiSkill;
  return { steer: Math.max(-1, Math.min(1, error * 2.8)), throttle: speed < targetSpeed ? 1 : 0, brake: speed > targetSpeed + 18 ? 0.75 : 0 };
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function updateCar(car, input, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let forwardSpeed = car.vx * fx + car.vy * fy;
  let sideSpeed = car.vx * rx + car.vy * ry;

  const engine = car.finished ? 0 : input.throttle * 260;
  const braking = input.brake * 360;
  forwardSpeed += engine * dt;
  if (braking > 0) {
    const change = Math.min(Math.abs(forwardSpeed), braking * dt);
    forwardSpeed -= Math.sign(forwardSpeed) * change;
  }
  forwardSpeed *= Math.pow(0.994, dt * 120);
  sideSpeed *= Math.pow(0.78, dt * 120);
  forwardSpeed = Math.max(-75, Math.min(285, forwardSpeed));

  const steerGrip = Math.min(1, Math.abs(forwardSpeed) / 45);
  car.angle += input.steer * 2.35 * steerGrip * Math.sign(forwardSpeed || 1) * dt;
  car.vx = Math.cos(car.angle) * forwardSpeed + -Math.sin(car.angle) * sideSpeed;
  car.vy = Math.sin(car.angle) * forwardSpeed + Math.cos(car.angle) * sideSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  resolveTrackCollision(car);
  updateProgress(car);
}

function resolveTrackCollision(car) {
  const hit = trackProjection(car.x, car.y);
  const limit = ROAD_HALF_WIDTH - car.radius;
  if (hit.distance <= limit) return;
  const penetration = hit.distance - limit;
  car.x -= hit.nx * penetration;
  car.y -= hit.ny * penetration;
  const outwardSpeed = car.vx * hit.nx + car.vy * hit.ny;
  if (outwardSpeed > 0) {
    car.vx -= hit.nx * outwardSpeed * 1.35;
    car.vy -= hit.ny * outwardSpeed * 1.35;
  }
  car.vx *= 0.72;
  car.vy *= 0.72;
}

function resolveCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const minDistance = a.radius + b.radius;
      if (distance >= minDistance) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const penetration = minDistance - distance;
      a.x -= nx * penetration * 0.5;
      a.y -= ny * penetration * 0.5;
      b.x += nx * penetration * 0.5;
      b.y += ny * penetration * 0.5;
      const relativeNormalSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeNormalSpeed < 0) {
        const restitution = 0.35;
        const impulse = -(1 + restitution) * relativeNormalSpeed / (1 / a.mass + 1 / b.mass);
        a.vx -= impulse * nx / a.mass;
        a.vy -= impulse * ny / a.mass;
        b.vx += impulse * nx / b.mass;
        b.vy += impulse * ny / b.mass;
      }
    }
  }
}

function simulate(dt) {
  if (countdown > 0) countdown = Math.max(0, countdown - dt);
  else raceTime += dt;
  for (const car of cars) {
    let input;
    if (car.isPlayer) {
      input = {
        steer: (controls.left ? -1 : 0) + (controls.right ? 1 : 0),
        throttle: controls.accelerate ? 1 : 0,
        brake: controls.brake ? 1 : 0,
      };
    } else input = aiInput(car);
    if (countdown > 0) input = { steer: 0, throttle: 0, brake: 1 };
    updateCar(car, input, dt);
  }
  resolveCarCollisions();
}

function drawTrack() {
  ctx.fillStyle = "#263b29";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#bdd0b4";
  ctx.lineWidth = 1;
  for (let x = -HEIGHT; x < WIDTH; x += 26) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + HEIGHT, HEIGHT); ctx.stroke();
  }
  ctx.restore();

  strokeCourse("#c8c2ad", 174);
  drawCurbs();
  strokeCourse("#313633", 150);
  ctx.save();
  ctx.setLineDash([17, 19]);
  strokeCourse("#777b70", 2);
  ctx.restore();
  drawFinishLine();

  ctx.fillStyle = "rgba(8,12,9,.5)";
  ctx.font = "900 92px 'DejaVu Sans Condensed'";
  ctx.textAlign = "center";
  ctx.fillText("AC", 640, 420);
  ctx.font = "600 13px 'DejaVu Sans Mono'";
  ctx.fillStyle = "#829081";
  ctx.fillText("APEX COUNTY MOTOR CLUB", 640, 448);
}

function coursePath() {
  ctx.beginPath();
  ctx.moveTo(330, 210);
  ctx.lineTo(950, 210);
  ctx.arc(950, 390, 180, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(330, 570);
  ctx.arc(330, 390, 180, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

function strokeCourse(color, width) {
  coursePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawCurbs() {
  ctx.save();
  ctx.setLineDash([12, 12]);
  ctx.lineDashOffset = 4;
  strokeCourse("#e7dfcf", 166);
  ctx.lineDashOffset = 16;
  strokeCourse("#e84d36", 166);
  ctx.restore();
}

function drawFinishLine() {
  const x = 745;
  const y1 = 494;
  const size = 12;
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 ? "#ece9dc" : "#171b18";
      ctx.fillRect(x + col * size, y1 + row * size, size, size);
    }
  }
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(-18, -10, 39, 22);
  ctx.fillStyle = "#111";
  ctx.fillRect(-12, -14, 9, 4); ctx.fillRect(8, -14, 9, 4);
  ctx.fillRect(-12, 10, 9, 4); ctx.fillRect(8, 10, 9, 4);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-20, -11, 40, 22, 6);
  ctx.fill();
  ctx.fillStyle = "#1b2522";
  ctx.fillRect(-6, -8, 12, 16);
  ctx.fillStyle = "rgba(232,229,217,.7)";
  ctx.fillRect(10, -7, 4, 14);
  ctx.fillStyle = "#111";
  ctx.font = "800 9px 'DejaVu Sans Mono'";
  ctx.textAlign = "center";
  ctx.fillText(car.isPlayer ? "01" : car.name.slice(0, 2), -12, 3);
  ctx.restore();
}

function raceRanking() {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    const aProgress = (a.lap - 1) * WAYPOINT_COUNT + a.completedWaypoints;
    const bProgress = (b.lap - 1) * WAYPOINT_COUNT + b.completedWaypoints;
    return bProgress - aProgress;
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${secs}`;
}

function drawHud() {
  const player = cars[0];
  const ranking = raceRanking();
  const position = ranking.indexOf(player) + 1;
  ctx.fillStyle = "rgba(13,18,14,.88)";
  ctx.fillRect(28, 26, 252, 92);
  ctx.fillStyle = "#d8ee42";
  ctx.fillRect(28, 26, 5, 92);
  ctx.textAlign = "left";
  ctx.fillStyle = "#9eaa9e";
  ctx.font = "600 11px 'DejaVu Sans Mono'";
  ctx.fillText("LAP", 48, 52); ctx.fillText("RACE TIME", 122, 52); ctx.fillText("POS", 230, 52);
  ctx.fillStyle = "#eeeade";
  ctx.font = "800 28px 'DejaVu Sans Condensed'";
  ctx.fillText(`${Math.min(player.lap, TOTAL_LAPS)}/${TOTAL_LAPS}`, 48, 84);
  ctx.fillText(formatTime(player.finished ? player.finishTime : raceTime), 122, 84);
  ctx.fillStyle = position === 1 ? "#d8ee42" : "#eeeade";
  ctx.fillText(`${position}/4`, 230, 84);
  ctx.font = "600 10px 'DejaVu Sans Mono'";
  ctx.fillStyle = "#7d887e";
  ctx.fillText(`${Math.round(Math.hypot(player.vx, player.vy) * 0.72)} KM/H`, 48, 103);

  ctx.fillStyle = "rgba(13,18,14,.82)";
  ctx.fillRect(WIDTH - 178, 26, 150, 112);
  ctx.font = "600 10px 'DejaVu Sans Mono'";
  ranking.forEach((car, i) => {
    ctx.fillStyle = car.color;
    ctx.fillRect(WIDTH - 162, 43 + i * 22, 5, 12);
    ctx.fillStyle = car.isPlayer ? "#fff" : "#a9b2a9";
    ctx.fillText(`${i + 1}  ${car.name}`, WIDTH - 148, 53 + i * 22);
  });

  if (countdown > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(12,17,13,.8)";
    ctx.fillRect(WIDTH / 2 - 70, 45, 140, 100);
    ctx.fillStyle = "#f04b2f";
    ctx.font = "italic 900 78px 'DejaVu Sans Condensed'";
    ctx.fillText(Math.ceil(countdown), WIDTH / 2, 122);
  } else if (player.finished) {
    ctx.fillStyle = "rgba(12,17,13,.9)";
    ctx.fillRect(WIDTH / 2 - 195, HEIGHT / 2 - 73, 390, 146);
    ctx.fillStyle = "#d8ee42";
    ctx.textAlign = "center";
    ctx.font = "italic 900 54px 'DejaVu Sans Condensed'";
    ctx.fillText(position === 1 ? "VICTORY" : `P${position} FINISH`, WIDTH / 2, HEIGHT / 2 - 7);
    ctx.fillStyle = "#e8e5d9";
    ctx.font = "600 13px 'DejaVu Sans Mono'";
    ctx.fillText(`${formatTime(player.finishTime)}  ·  PRESS R TO RACE AGAIN`, WIDTH / 2, HEIGHT / 2 + 31);
  } else if (paused) {
    ctx.fillStyle = "rgba(12,17,13,.85)";
    ctx.fillRect(WIDTH / 2 - 120, HEIGHT / 2 - 42, 240, 84);
    ctx.fillStyle = "#e8e5d9";
    ctx.textAlign = "center";
    ctx.font = "italic 900 44px 'DejaVu Sans Condensed'";
    ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2 + 13);
  }
}

function render() {
  drawTrack();
  for (const car of cars) drawCar(car);
  drawHud();
}

function frame(timestamp) {
  const elapsed = Math.min(0.1, (timestamp - lastFrame) / 1000 || 0);
  lastFrame = timestamp;
  if (running && !paused) {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      simulate(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }
  render();
  requestAnimationFrame(frame);
}

function setKey(code, pressed) {
  if (code === "ArrowLeft" || code === "KeyA") controls.left = pressed;
  if (code === "ArrowRight" || code === "KeyD") controls.right = pressed;
  if (code === "ArrowUp" || code === "KeyW") controls.accelerate = pressed;
  if (code === "ArrowDown" || code === "KeyS" || code === "Space") controls.brake = pressed;
}

window.addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  setKey(event.code, true);
  if (event.code === "KeyP" && running) paused = !paused;
  if (event.code === "KeyR") { resetRace(); running = true; startCard.classList.add("hidden"); }
});
window.addEventListener("keyup", event => setKey(event.code, false));
window.addEventListener("blur", () => {
  Object.keys(controls).forEach(key => controls[key] = false);
  if (running) paused = true;
});

document.querySelectorAll("[data-control]").forEach(button => {
  const control = button.dataset.control;
  const press = event => { event.preventDefault(); controls[control] = true; };
  const release = event => { event.preventDefault(); controls[control] = false; };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

startButton.addEventListener("click", () => {
  resetRace();
  running = true;
  startCard.classList.add("hidden");
  canvas.focus();
});

resetRace();
requestAnimationFrame(frame);
