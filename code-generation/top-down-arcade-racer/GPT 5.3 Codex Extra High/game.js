"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const WIDTH = 1200;
  const HEIGHT = 800;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const FIXED_DT = 1 / 120;
  const TOTAL_LAPS = 3;
  const WAYPOINT_RADIUS = 46;
  const RNG_SEED = 133742;

  const track = {
    outer: { left: 80, top: 80, right: 1120, bottom: 720 },
    inner: { left: 350, top: 230, right: 850, bottom: 570 }
  };

  const centerLane = {
    left: (track.outer.left + track.inner.left) * 0.5,
    top: (track.outer.top + track.inner.top) * 0.5,
    right: (track.outer.right + track.inner.right) * 0.5,
    bottom: (track.outer.bottom + track.inner.bottom) * 0.5
  };

  const waypoints = [
    { x: centerLane.left + 120, y: centerLane.bottom },
    { x: centerLane.right - 120, y: centerLane.bottom },
    { x: centerLane.right - 40, y: centerLane.bottom - 20 },
    { x: centerLane.right, y: centerLane.bottom - 120 },
    { x: centerLane.right, y: centerLane.top + 120 },
    { x: centerLane.right - 40, y: centerLane.top + 20 },
    { x: centerLane.right - 120, y: centerLane.top },
    { x: centerLane.left + 120, y: centerLane.top },
    { x: centerLane.left + 40, y: centerLane.top + 20 },
    { x: centerLane.left, y: centerLane.top + 120 },
    { x: centerLane.left, y: centerLane.bottom - 120 },
    { x: centerLane.left + 40, y: centerLane.bottom - 20 }
  ];

  const pathMeta = buildPathMeta(waypoints);

  let raceTime = 0;
  let standings = [];

  const rng = mulberry32(RNG_SEED);

  const cars = createCars();
  for (const car of cars) {
    car.pathProgress = computePathProgress(car.pos).s;
  }

  standings = computeStandings(cars);

  const input = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowup" || key === "w") input.up = true;
    if (key === "arrowdown" || key === "s") input.down = true;
    if (key === "arrowleft" || key === "a") input.left = true;
    if (key === "arrowright" || key === "d") input.right = true;
    if (key.startsWith("arrow")) event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowup" || key === "w") input.up = false;
    if (key === "arrowdown" || key === "s") input.down = false;
    if (key === "arrowleft" || key === "a") input.left = false;
    if (key === "arrowright" || key === "d") input.right = false;
  });

  let accumulator = 0;
  let lastTime = performance.now();

  function loop(now) {
    let delta = (now - lastTime) * 0.001;
    lastTime = now;
    if (delta > 0.2) delta = 0.2;

    accumulator += delta;
    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  function step(dt) {
    if (!cars.every((car) => car.finished)) {
      raceTime += dt;
    }

    for (const car of cars) {
      const controls = car.isPlayer ? getPlayerControls() : getAiControls(car);
      if (car.finished) {
        controls.throttle = 0;
        controls.steer = 0;
      }
      integrateCar(car, controls, dt);
      resolveOuterBounds(car, track.outer);
      resolveInnerObstacle(car, track.inner);
    }

    for (let i = 0; i < 2; i += 1) {
      resolveCarCollisions(cars);
    }

    for (const car of cars) {
      resolveOuterBounds(car, track.outer);
      resolveInnerObstacle(car, track.inner);
      updateLapProgress(car);
      car.pathProgress = computePathProgress(car.pos).s;
    }

    standings = computeStandings(cars);
  }

  function render() {
    drawTrack();
    drawCars();
    drawHud();
  }

  function drawTrack() {
    ctx.fillStyle = "#284b39";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#4a4e54";
    fillRect(track.outer);

    ctx.fillStyle = "#284b39";
    fillRect(track.inner);

    ctx.strokeStyle = "rgba(220, 230, 225, 0.25)";
    ctx.lineWidth = 4;
    strokeRect(track.outer);
    strokeRect(track.inner);

    ctx.save();
    ctx.setLineDash([20, 14]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i += 1) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    drawFinishLine();
  }

  function drawFinishLine() {
    const x = waypoints[0].x - 6;
    const yStart = track.inner.bottom;
    const yEnd = track.outer.bottom;
    const cell = 10;

    for (let y = yStart; y < yEnd; y += cell) {
      for (let col = 0; col < 2; col += 1) {
        const row = Math.floor((y - yStart) / cell);
        ctx.fillStyle = (row + col) % 2 === 0 ? "#ffffff" : "#111111";
        ctx.fillRect(x + col * cell, y, cell, cell);
      }
    }
  }

  function drawCars() {
    for (const car of cars) {
      ctx.save();
      ctx.translate(car.pos.x, car.pos.y);
      ctx.rotate(car.angle);

      const bodyLength = 34;
      const bodyWidth = 18;

      ctx.fillStyle = car.color;
      ctx.fillRect(-bodyLength * 0.5, -bodyWidth * 0.5, bodyLength, bodyWidth);

      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(2, -bodyWidth * 0.35, 10, bodyWidth * 0.7);

      if (car.isPlayer) {
        ctx.strokeStyle = "#fff08a";
        ctx.lineWidth = 2;
        ctx.strokeRect(-bodyLength * 0.5, -bodyWidth * 0.5, bodyLength, bodyWidth);
      }

      ctx.restore();
    }
  }

  function drawHud() {
    const player = cars[0];
    const playerRank = standings.findIndex((car) => car.id === player.id) + 1;

    ctx.fillStyle = "rgba(8, 12, 10, 0.72)";
    ctx.fillRect(16, 16, 280, 156);

    ctx.fillStyle = "#e9f2ee";
    ctx.font = "20px Consolas, Menlo, monospace";
    ctx.fillText(`Lap: ${Math.min(player.lapsCompleted + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`, 28, 50);
    ctx.fillText(`Time: ${formatTime(raceTime)}`, 28, 82);
    ctx.fillText(`Position: ${playerRank}/${cars.length}`, 28, 114);
    ctx.font = "14px Consolas, Menlo, monospace";
    ctx.fillText(`Seed: ${RNG_SEED}`, 28, 142);

    ctx.fillStyle = "rgba(8, 12, 10, 0.72)";
    ctx.fillRect(WIDTH - 232, 16, 216, 122);
    ctx.fillStyle = "#f4f7f5";
    ctx.font = "16px Consolas, Menlo, monospace";
    ctx.fillText("Standings", WIDTH - 216, 40);
    ctx.font = "14px Consolas, Menlo, monospace";
    for (let i = 0; i < standings.length; i += 1) {
      const car = standings[i];
      const lapDisplay = Math.min(car.lapsCompleted + 1, TOTAL_LAPS);
      ctx.fillStyle = car.color;
      ctx.fillText(`${i + 1}. ${car.name} L${lapDisplay}`, WIDTH - 216, 64 + i * 18);
    }

    if (player.finished) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(WIDTH * 0.5 - 230, HEIGHT * 0.5 - 56, 460, 112);
      ctx.fillStyle = "#f8fcfa";
      ctx.font = "28px Consolas, Menlo, monospace";
      ctx.fillText(`Finished #${playerRank}`, WIDTH * 0.5 - 136, HEIGHT * 0.5 - 8);
      ctx.font = "20px Consolas, Menlo, monospace";
      ctx.fillText(`Total Time: ${formatTime(player.finishTime)}`, WIDTH * 0.5 - 148, HEIGHT * 0.5 + 26);
    }
  }

  function createCars() {
    const start = waypoints[0];
    const baseX = start.x - 40;
    const baseY = start.y + 28;

    const baseCar = {
      radius: 12,
      mass: 1,
      invMass: 1,
      restitution: 0.24,
      wallRestitution: 0.1,
      maxForward: 285,
      maxReverse: 115,
      accelRate: 255,
      brakeRate: 310,
      rollingDrag: 2.6,
      lateralGrip: 9.2,
      airDrag: 0.18,
      maxSteerRate: 3.0
    };

    const player = makeCar({
      ...baseCar,
      id: 0,
      name: "Player",
      color: "#f6d74b",
      isPlayer: true,
      pos: { x: baseX, y: baseY },
      angle: 0
    });

    const opponents = [];
    const colors = ["#f04d57", "#58b9f0", "#76d65f"];
    const names = ["AI Red", "AI Blue", "AI Green"];
    for (let i = 0; i < 3; i += 1) {
      const skill = 0.9 + rng() * 0.18;
      const caution = 0.78 + rng() * 0.22;
      opponents.push(
        makeCar({
          ...baseCar,
          id: i + 1,
          name: names[i],
          color: colors[i],
          isPlayer: false,
          pos: { x: baseX - 54 * (i + 1), y: baseY + (i % 2 === 0 ? 26 : 0) },
          angle: 0,
          maxForward: 265 + skill * 30,
          accelRate: 235 + skill * 30,
          lateralGrip: 8.5 + skill,
          aiAggression: skill,
          aiCaution: caution
        })
      );
    }

    return [player, ...opponents];
  }

  function makeCar(data) {
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      isPlayer: data.isPlayer,
      pos: { x: data.pos.x, y: data.pos.y },
      vel: { x: 0, y: 0 },
      angle: data.angle,
      radius: data.radius,
      mass: data.mass,
      invMass: data.invMass,
      restitution: data.restitution,
      wallRestitution: data.wallRestitution,
      maxForward: data.maxForward,
      maxReverse: data.maxReverse,
      accelRate: data.accelRate,
      brakeRate: data.brakeRate,
      rollingDrag: data.rollingDrag,
      lateralGrip: data.lateralGrip,
      airDrag: data.airDrag,
      maxSteerRate: data.maxSteerRate,
      aiAggression: data.aiAggression || 0,
      aiCaution: data.aiCaution || 1,
      nextWaypoint: 1,
      lastWaypoint: 0,
      lapsCompleted: 0,
      finished: false,
      finishTime: 0,
      pathProgress: 0
    };
  }

  function getPlayerControls() {
    let throttle = 0;
    if (input.up) throttle += 1;
    if (input.down) throttle -= 1;

    let steer = 0;
    if (input.left) steer -= 1;
    if (input.right) steer += 1;

    return { throttle, steer };
  }

  function getAiControls(car) {
    const shouldLookFurther =
      distSq(car.pos, waypoints[car.nextWaypoint]) < WAYPOINT_RADIUS * WAYPOINT_RADIUS * 0.9;
    const targetIndex = shouldLookFurther
      ? (car.nextWaypoint + 1) % waypoints.length
      : car.nextWaypoint;
    const target = waypoints[targetIndex];

    const desiredAngle = Math.atan2(target.y - car.pos.y, target.x - car.pos.x);
    const delta = normalizeAngle(desiredAngle - car.angle);
    const steer = clamp(delta / 0.6, -1, 1);

    const wA = waypoints[car.nextWaypoint];
    const wB = waypoints[(car.nextWaypoint + 1) % waypoints.length];
    const dirToA = normalize({ x: wA.x - car.pos.x, y: wA.y - car.pos.y });
    const dirAtoB = normalize({ x: wB.x - wA.x, y: wB.y - wA.y });
    const turnStrength = Math.acos(clamp(dirToA.x * dirAtoB.x + dirToA.y * dirAtoB.y, -1, 1));

    const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const forwardSpeed = dot(car.vel, forward);

    const cornerPenalty = turnStrength * 0.22 * car.aiCaution;
    const desiredRatio = clamp(0.56 + 0.38 * car.aiAggression - cornerPenalty, 0.32, 0.96);
    const targetSpeed = car.maxForward * desiredRatio;

    let throttle = 0;
    if (forwardSpeed < targetSpeed - 10) throttle = 1;
    else if (forwardSpeed > targetSpeed + 20) throttle = -0.8;
    if (Math.abs(delta) > 1.1) throttle = Math.min(throttle, 0.25);

    throttle = clamp(throttle * car.aiAggression, -1, 1);
    return { throttle, steer };
  }

  function integrateCar(car, controls, dt) {
    const speed = Math.hypot(car.vel.x, car.vel.y);
    const steerScale = clamp(speed / 140, 0.16, 1);
    car.angle += controls.steer * car.maxSteerRate * steerScale * dt;

    const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const right = { x: -forward.y, y: forward.x };

    let forwardSpeed = dot(car.vel, forward);
    let lateralSpeed = dot(car.vel, right);

    let accel = 0;
    if (controls.throttle > 0) accel = controls.throttle * car.accelRate;
    else if (controls.throttle < 0) accel = controls.throttle * car.brakeRate;
    forwardSpeed += accel * dt;

    if (controls.throttle === 0) {
      forwardSpeed *= Math.max(0, 1 - car.rollingDrag * dt);
    }

    lateralSpeed *= Math.max(0, 1 - car.lateralGrip * dt);
    forwardSpeed = clamp(forwardSpeed, -car.maxReverse, car.maxForward);

    car.vel.x = forward.x * forwardSpeed + right.x * lateralSpeed;
    car.vel.y = forward.y * forwardSpeed + right.y * lateralSpeed;

    const air = Math.max(0, 1 - car.airDrag * dt);
    car.vel.x *= air;
    car.vel.y *= air;

    car.pos.x += car.vel.x * dt;
    car.pos.y += car.vel.y * dt;
  }

  function resolveOuterBounds(car, bounds) {
    const r = car.radius;
    if (car.pos.x - r < bounds.left) {
      car.pos.x = bounds.left + r;
      applyWallImpulse(car, { x: 1, y: 0 });
    } else if (car.pos.x + r > bounds.right) {
      car.pos.x = bounds.right - r;
      applyWallImpulse(car, { x: -1, y: 0 });
    }

    if (car.pos.y - r < bounds.top) {
      car.pos.y = bounds.top + r;
      applyWallImpulse(car, { x: 0, y: 1 });
    } else if (car.pos.y + r > bounds.bottom) {
      car.pos.y = bounds.bottom - r;
      applyWallImpulse(car, { x: 0, y: -1 });
    }
  }

  function resolveInnerObstacle(car, bounds) {
    const x = car.pos.x;
    const y = car.pos.y;
    const r = car.radius;
    const inside = x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom;

    if (inside) {
      const leftDist = x - bounds.left;
      const rightDist = bounds.right - x;
      const topDist = y - bounds.top;
      const bottomDist = bounds.bottom - y;

      let normal = { x: -1, y: 0 };
      let penetration = leftDist + r;
      if (rightDist < leftDist && rightDist <= topDist && rightDist <= bottomDist) {
        normal = { x: 1, y: 0 };
        penetration = rightDist + r;
      } else if (topDist < leftDist && topDist < rightDist && topDist <= bottomDist) {
        normal = { x: 0, y: -1 };
        penetration = topDist + r;
      } else if (bottomDist < leftDist && bottomDist < rightDist && bottomDist < topDist) {
        normal = { x: 0, y: 1 };
        penetration = bottomDist + r;
      }

      car.pos.x += normal.x * penetration;
      car.pos.y += normal.y * penetration;
      applyWallImpulse(car, normal);
      return;
    }

    const closestX = clamp(x, bounds.left, bounds.right);
    const closestY = clamp(y, bounds.top, bounds.bottom);
    const dx = x - closestX;
    const dy = y - closestY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 < 1e-8) return;

    const d = Math.sqrt(d2);
    const normal = { x: dx / d, y: dy / d };
    const penetration = r - d;
    car.pos.x += normal.x * penetration;
    car.pos.y += normal.y * penetration;
    applyWallImpulse(car, normal);
  }

  function applyWallImpulse(car, normal) {
    const vn = car.vel.x * normal.x + car.vel.y * normal.y;
    if (vn < 0) {
      const impulse = -(1 + car.wallRestitution) * vn;
      car.vel.x += normal.x * impulse;
      car.vel.y += normal.y * impulse;
    }
  }

  function resolveCarCollisions(allCars) {
    for (let i = 0; i < allCars.length; i += 1) {
      for (let j = i + 1; j < allCars.length; j += 1) {
        const a = allCars[i];
        const b = allCars[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;

        const d = Math.max(Math.sqrt(d2), 1e-6);
        const nx = dx / d;
        const ny = dy / d;
        const penetration = r - d;
        const invMassSum = a.invMass + b.invMass;

        if (invMassSum === 0) continue;

        const correction = penetration / invMassSum;
        a.pos.x -= nx * correction * a.invMass;
        a.pos.y -= ny * correction * a.invMass;
        b.pos.x += nx * correction * b.invMass;
        b.pos.y += ny * correction * b.invMass;

        const rvx = b.vel.x - a.vel.x;
        const rvy = b.vel.y - a.vel.y;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal > 0) continue;

        const restitution = Math.min(a.restitution, b.restitution);
        const impulseMag = (-(1 + restitution) * velAlongNormal) / invMassSum;
        const impX = nx * impulseMag;
        const impY = ny * impulseMag;
        a.vel.x -= impX * a.invMass;
        a.vel.y -= impY * a.invMass;
        b.vel.x += impX * b.invMass;
        b.vel.y += impY * b.invMass;

        const txRaw = rvx - velAlongNormal * nx;
        const tyRaw = rvy - velAlongNormal * ny;
        const tLen = Math.hypot(txRaw, tyRaw);
        if (tLen > 1e-8) {
          const tx = txRaw / tLen;
          const ty = tyRaw / tLen;
          let jt = (-(rvx * tx + rvy * ty)) / invMassSum;
          const mu = 0.42;
          const maxFriction = impulseMag * mu;
          jt = clamp(jt, -maxFriction, maxFriction);
          const fX = tx * jt;
          const fY = ty * jt;
          a.vel.x -= fX * a.invMass;
          a.vel.y -= fY * a.invMass;
          b.vel.x += fX * b.invMass;
          b.vel.y += fY * b.invMass;
        }
      }
    }
  }

  function updateLapProgress(car) {
    const r2 = WAYPOINT_RADIUS * WAYPOINT_RADIUS;
    let guard = 0;
    while (guard < waypoints.length) {
      const reachedIndex = car.nextWaypoint;
      const target = waypoints[reachedIndex];
      if (distSq(car.pos, target) > r2) break;

      car.lastWaypoint = reachedIndex;
      car.nextWaypoint = (reachedIndex + 1) % waypoints.length;
      if (reachedIndex === 0) {
        car.lapsCompleted += 1;
        if (car.lapsCompleted >= TOTAL_LAPS && !car.finished) {
          car.finished = true;
          car.finishTime = raceTime;
        }
      }
      guard += 1;
    }
  }

  function computeStandings(allCars) {
    return [...allCars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;

      if (a.lapsCompleted !== b.lapsCompleted) {
        return b.lapsCompleted - a.lapsCompleted;
      }
      if (a.pathProgress !== b.pathProgress) {
        return b.pathProgress - a.pathProgress;
      }

      const da = distSq(a.pos, waypoints[a.nextWaypoint]);
      const db = distSq(b.pos, waypoints[b.nextWaypoint]);
      return da - db;
    });
  }

  function computePathProgress(pos) {
    let bestD2 = Infinity;
    let bestS = 0;

    for (let i = 0; i < waypoints.length; i += 1) {
      const a = waypoints[i];
      const b = waypoints[(i + 1) % waypoints.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abLen2 = abx * abx + aby * aby;
      if (abLen2 <= 1e-8) continue;

      const apx = pos.x - a.x;
      const apy = pos.y - a.y;
      const t = clamp((apx * abx + apy * aby) / abLen2, 0, 1);
      const qx = a.x + abx * t;
      const qy = a.y + aby * t;
      const dx = pos.x - qx;
      const dy = pos.y - qy;
      const d2 = dx * dx + dy * dy;

      if (d2 < bestD2) {
        bestD2 = d2;
        bestS = pathMeta.cumulative[i] + pathMeta.lengths[i] * t;
      }
    }

    return { s: bestS, d2: bestD2 };
  }

  function buildPathMeta(path) {
    const lengths = [];
    const cumulative = [];
    let total = 0;
    for (let i = 0; i < path.length; i += 1) {
      cumulative.push(total);
      const a = path[i];
      const b = path[(i + 1) % path.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      lengths.push(len);
      total += len;
    }
    return { lengths, cumulative, total };
  }

  function fillRect(rect) {
    ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }

  function strokeRect(rect) {
    ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function distSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function normalize(v) {
    const len = Math.hypot(v.x, v.y);
    if (len <= 1e-8) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  function normalizeAngle(angle) {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function formatTime(seconds) {
    const totalMs = Math.max(0, Math.floor(seconds * 1000));
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function random() {
      t += 0x6d2b79f5;
      let s = t;
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
