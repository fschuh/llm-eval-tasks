"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("2D canvas context is required.");
  }

  const WORLD_WIDTH = 1280;
  const WORLD_HEIGHT = 800;
  const FIXED_DT = 1 / 120;
  const TOTAL_LAPS = 3;
  const WAYPOINT_RADIUS = 54;
  const CAR_COUNT = 4;
  const DEFAULT_SEED = 1337;

  const CAR = {
    radius: 14,
    mass: 1,
    restitution: 0.24,
    maxForward: 330,
    maxReverse: 140,
    engineAccel: 430,
    brakeAccel: 560,
    reverseAccel: 290,
    rollingDrag: 1.7,
    airDrag: 0.006,
    lateralGrip: 11.5,
    turnRate: 2.55,
    wallRestitution: 0.18,
    wallFriction: 0.08
  };

  const TRACK = {
    outer: { left: 90, top: 90, right: 1190, bottom: 710 },
    inner: { left: 360, top: 245, right: 920, bottom: 555 }
  };

  const input = {
    accelerate: false,
    brake: false,
    left: false,
    right: false
  };

  const seedParam = Number.parseInt(new URLSearchParams(window.location.search).get("seed") || "", 10);
  const rngSeed = Number.isFinite(seedParam) ? seedParam : DEFAULT_SEED;
  const rng = createRng(rngSeed);

  const waypoints = buildWaypoints(TRACK);
  const pathMeta = buildPathMeta(waypoints);
  const cars = createCars();

  let raceClock = 0;
  let standings = [];
  let accumulator = 0;
  let previousTime = performance.now();

  window.addEventListener("keydown", onKeyChange(true), { passive: false });
  window.addEventListener("keyup", onKeyChange(false));
  window.addEventListener("blur", clearInput);

  updateDerivedRaceState();
  requestAnimationFrame(frame);

  function frame(timestamp) {
    let delta = (timestamp - previousTime) * 0.001;
    previousTime = timestamp;
    if (delta > 0.2) {
      delta = 0.2;
    }

    accumulator += delta;

    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(frame);
  }

  function step(dt) {
    if (!cars.every((car) => car.finished)) {
      raceClock += dt;
    }

    for (const car of cars) {
      const controls = car.isPlayer ? getPlayerControls() : getAiControls(car);
      if (car.finished) {
        controls.throttle = 0;
        controls.brake = 0;
        controls.steer = 0;
      }
      integrateCar(car, controls, dt);
      resolveTrackCollisions(car);
    }

    for (let pass = 0; pass < 2; pass += 1) {
      resolveCarCollisions(cars);
      for (const car of cars) {
        resolveTrackCollisions(car);
      }
    }

    for (const car of cars) {
      updateLapProgress(car);
    }

    updateDerivedRaceState();
  }

  function render() {
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    drawTrack();
    drawCars();
    drawHud();
  }

  function createCars() {
    const start = waypoints[0];
    const specs = [
      { name: "Player", color: "#ffd166", isPlayer: true, yOffset: -18, xOffset: -86 },
      { name: "Cinder", color: "#ef476f", isPlayer: false, yOffset: 18, xOffset: -122 },
      { name: "Skiff", color: "#06d6a0", isPlayer: false, yOffset: -18, xOffset: -158 },
      { name: "Volt", color: "#5ac8fa", isPlayer: false, yOffset: 18, xOffset: -194 }
    ];

    return specs.slice(0, CAR_COUNT).map((spec, index) => {
      const paceBias = 0.9 + rng() * 0.16;
      const brakeBias = 0.68 + rng() * 0.2;
      const lookahead = 1 + Math.floor(rng() * 2);

      return {
        id: index,
        name: spec.name,
        color: spec.color,
        isPlayer: spec.isPlayer,
        x: start.x + spec.xOffset,
        y: start.y + spec.yOffset,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: CAR.radius,
        mass: CAR.mass,
        invMass: 1 / CAR.mass,
        restitution: CAR.restitution,
        lapsCompleted: 0,
        nextWaypoint: 1,
        lastLapAt: 0,
        pathProgress: 0,
        progressScore: 0,
        finished: false,
        finishTime: null,
        forwardSpeed: 0,
        aiPaceBias: paceBias,
        aiBrakeBias: brakeBias,
        aiLookahead: lookahead
      };
    });
  }

  function getPlayerControls() {
    return {
      throttle: input.accelerate ? 1 : 0,
      brake: input.brake ? 1 : 0,
      steer: (input.right ? 1 : 0) - (input.left ? 1 : 0)
    };
  }

  function getAiControls(car) {
    const lookaheadIndex = (car.nextWaypoint + car.aiLookahead) % waypoints.length;
    const target = waypoints[lookaheadIndex];
    const immediate = waypoints[car.nextWaypoint];

    const desiredAngle = Math.atan2(target.y - car.y, target.x - car.x);
    const angleError = wrapAngle(desiredAngle - car.angle);
    const steer = clamp(angleError * 1.7, -1, 1);

    const distanceToNext = Math.hypot(immediate.x - car.x, immediate.y - car.y);
    const cornerSlowdown = 1 - Math.min(0.7, Math.abs(angleError) / Math.PI * car.aiBrakeBias);
    let targetSpeed = CAR.maxForward * car.aiPaceBias * cornerSlowdown;

    if (distanceToNext < 110) {
      targetSpeed *= 0.9;
    }
    targetSpeed = clamp(targetSpeed, 110, CAR.maxForward * 0.98);

    let throttle = 0;
    let brake = 0;

    if (car.forwardSpeed < targetSpeed - 10) {
      throttle = 1;
    } else if (car.forwardSpeed > targetSpeed + 12) {
      brake = clamp((car.forwardSpeed - targetSpeed) / 120, 0.2, 1);
    }

    if (Math.abs(angleError) > 1.45 && car.forwardSpeed > 170) {
      throttle = 0;
      brake = Math.max(brake, 0.7);
    }

    if (car.forwardSpeed < -18) {
      throttle = 1;
      brake = 0;
    }

    return { throttle, brake, steer };
  }

  function integrateCar(car, controls, dt) {
    if (car.finished) {
      car.vx = 0;
      car.vy = 0;
      car.forwardSpeed = 0;
      return;
    }

    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);
    const rightX = -forwardY;
    const rightY = forwardX;

    let forwardSpeed = dot(car.vx, car.vy, forwardX, forwardY);
    let lateralSpeed = dot(car.vx, car.vy, rightX, rightY);

    if (controls.throttle > 0) {
      forwardSpeed += CAR.engineAccel * controls.throttle * dt;
    }

    if (controls.brake > 0) {
      if (forwardSpeed > 0) {
        forwardSpeed -= CAR.brakeAccel * controls.brake * dt;
      } else {
        forwardSpeed -= CAR.reverseAccel * controls.brake * dt;
      }
    }

    forwardSpeed = clamp(forwardSpeed, -CAR.maxReverse, CAR.maxForward);
    forwardSpeed /= 1 + (CAR.rollingDrag + CAR.airDrag * Math.abs(forwardSpeed)) * dt;
    lateralSpeed /= 1 + CAR.lateralGrip * dt;

    if (!controls.throttle && !controls.brake && Math.abs(forwardSpeed) < 1.2) {
      forwardSpeed = 0;
    }
    if (Math.abs(lateralSpeed) < 0.4) {
      lateralSpeed = 0;
    }

    car.vx = forwardX * forwardSpeed + rightX * lateralSpeed;
    car.vy = forwardY * forwardSpeed + rightY * lateralSpeed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    const turnScale = 0.22 + 0.78 * clamp(Math.abs(forwardSpeed) / 180, 0, 1);
    if (Math.abs(forwardSpeed) > 4) {
      car.angle = wrapAngle(
        car.angle + controls.steer * CAR.turnRate * turnScale * Math.sign(forwardSpeed) * dt
      );
    }

    car.forwardSpeed = forwardSpeed;
  }

  function resolveTrackCollisions(car) {
    const { outer, inner } = TRACK;
    const radius = car.radius;

    if (car.x - radius < outer.left) {
      car.x = outer.left + radius;
      applyWallImpulse(car, 1, 0);
    }
    if (car.x + radius > outer.right) {
      car.x = outer.right - radius;
      applyWallImpulse(car, -1, 0);
    }
    if (car.y - radius < outer.top) {
      car.y = outer.top + radius;
      applyWallImpulse(car, 0, 1);
    }
    if (car.y + radius > outer.bottom) {
      car.y = outer.bottom - radius;
      applyWallImpulse(car, 0, -1);
    }

    const closestX = clamp(car.x, inner.left, inner.right);
    const closestY = clamp(car.y, inner.top, inner.bottom);
    const offsetX = car.x - closestX;
    const offsetY = car.y - closestY;
    const distanceSq = offsetX * offsetX + offsetY * offsetY;

    if (distanceSq > 0 && distanceSq < radius * radius) {
      const distance = Math.sqrt(distanceSq);
      const nx = offsetX / distance;
      const ny = offsetY / distance;
      const penetration = radius - distance;
      car.x += nx * penetration;
      car.y += ny * penetration;
      applyWallImpulse(car, nx, ny);
      return;
    }

    if (
      car.x > inner.left &&
      car.x < inner.right &&
      car.y > inner.top &&
      car.y < inner.bottom
    ) {
      const distances = [
        { depth: car.x - inner.left, nx: -1, ny: 0 },
        { depth: inner.right - car.x, nx: 1, ny: 0 },
        { depth: car.y - inner.top, nx: 0, ny: -1 },
        { depth: inner.bottom - car.y, nx: 0, ny: 1 }
      ];
      distances.sort((a, b) => a.depth - b.depth);
      const push = distances[0];
      car.x += push.nx * (radius + push.depth);
      car.y += push.ny * (radius + push.depth);
      applyWallImpulse(car, push.nx, push.ny);
    }
  }

  function applyWallImpulse(car, nx, ny) {
    const normalSpeed = dot(car.vx, car.vy, nx, ny);
    if (normalSpeed < 0) {
      car.vx -= (1 + CAR.wallRestitution) * normalSpeed * nx;
      car.vy -= (1 + CAR.wallRestitution) * normalSpeed * ny;
    }

    const tangentX = -ny;
    const tangentY = nx;
    const tangentSpeed = dot(car.vx, car.vy, tangentX, tangentY);
    car.vx -= tangentSpeed * CAR.wallFriction * tangentX;
    car.vy -= tangentSpeed * CAR.wallFriction * tangentY;
  }

  function resolveCarCollisions(activeCars) {
    for (let i = 0; i < activeCars.length - 1; i += 1) {
      for (let j = i + 1; j < activeCars.length; j += 1) {
        resolveCarPair(activeCars[i], activeCars[j]);
      }
    }
  }

  function resolveCarPair(a, b) {
    if (a.finished && b.finished) {
      return;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDistance = a.radius + b.radius;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= minDistance * minDistance) {
      return;
    }

    const distance = Math.sqrt(distanceSq) || 0.0001;
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minDistance - distance;
    const invMassA = a.finished ? 0 : a.invMass;
    const invMassB = b.finished ? 0 : b.invMass;
    const invMassTotal = invMassA + invMassB;

    if (invMassTotal <= 0) {
      return;
    }

    const correction = overlap / invMassTotal;

    a.x -= nx * correction * invMassA;
    a.y -= ny * correction * invMassA;
    b.x += nx * correction * invMassB;
    b.y += ny * correction * invMassB;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const separatingSpeed = dot(rvx, rvy, nx, ny);

    if (separatingSpeed >= 0) {
      return;
    }

    const restitution = Math.min(a.restitution, b.restitution);
    const normalImpulse = (-(1 + restitution) * separatingSpeed) / invMassTotal;
    const impulseX = normalImpulse * nx;
    const impulseY = normalImpulse * ny;

    a.vx -= impulseX * invMassA;
    a.vy -= impulseY * invMassA;
    b.vx += impulseX * invMassB;
    b.vy += impulseY * invMassB;

    const tangentX = rvx - separatingSpeed * nx;
    const tangentY = rvy - separatingSpeed * ny;
    const tangentLength = Math.hypot(tangentX, tangentY);

    if (tangentLength > 1e-6) {
      const tx = tangentX / tangentLength;
      const ty = tangentY / tangentLength;
      const tangentSpeed = dot(rvx, rvy, tx, ty);
      let tangentImpulse = -tangentSpeed / invMassTotal;
      const maxFriction = normalImpulse * 0.16;
      tangentImpulse = clamp(tangentImpulse, -maxFriction, maxFriction);

      a.vx -= tangentImpulse * tx * invMassA;
      a.vy -= tangentImpulse * ty * invMassA;
      b.vx += tangentImpulse * tx * invMassB;
      b.vy += tangentImpulse * ty * invMassB;
    }
  }

  function updateLapProgress(car) {
    if (car.finished) {
      return;
    }

    let hops = 0;
    while (hops < waypoints.length) {
      const target = waypoints[car.nextWaypoint];
      const dx = target.x - car.x;
      const dy = target.y - car.y;

      if (dx * dx + dy * dy > WAYPOINT_RADIUS * WAYPOINT_RADIUS) {
        break;
      }

      if (car.nextWaypoint === 0) {
        car.lapsCompleted += 1;
        car.lastLapAt = raceClock;
        if (car.lapsCompleted >= TOTAL_LAPS) {
          car.finished = true;
          car.finishTime = raceClock;
          car.vx = 0;
          car.vy = 0;
          car.forwardSpeed = 0;
          car.pathProgress = pathMeta.totalLength;
          car.progressScore = TOTAL_LAPS * pathMeta.totalLength;
          car.nextWaypoint = 1;
          return;
        }
      }

      car.nextWaypoint = (car.nextWaypoint + 1) % waypoints.length;
      hops += 1;
    }
  }

  function updateDerivedRaceState() {
    for (const car of cars) {
      if (!car.finished) {
        car.pathProgress = samplePathProgress(car.x, car.y);
        car.progressScore = car.lapsCompleted * pathMeta.totalLength + car.pathProgress;
      }
    }

    standings = cars
      .slice()
      .sort((a, b) => compareCars(a, b))
      .map((car, index) => ({ ...car, place: index + 1 }));
  }

  function compareCars(a, b) {
    if (a.finished && b.finished) {
      return a.finishTime - b.finishTime || a.id - b.id;
    }
    if (a.finished) {
      return -1;
    }
    if (b.finished) {
      return 1;
    }
    if (Math.abs(b.progressScore - a.progressScore) > 1e-6) {
      return b.progressScore - a.progressScore;
    }
    return a.id - b.id;
  }

  function drawTrack() {
    ctx.fillStyle = "#234129";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.fillStyle = "#2a2f34";
    fillRect(TRACK.outer);

    ctx.fillStyle = "#183221";
    fillRect(TRACK.inner);

    ctx.strokeStyle = "rgba(240, 244, 240, 0.22)";
    ctx.lineWidth = 6;
    strokeRect(TRACK.outer);
    strokeRect(TRACK.inner);

    ctx.save();
    ctx.setLineDash([22, 14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i += 1) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    drawFinishLine();
    drawTrackHighlights();
  }

  function drawTrackHighlights() {
    const stripes = [
      { x: TRACK.outer.left + 18, y: TRACK.outer.top + 18, w: 180, h: 18, color: "rgba(255, 255, 255, 0.06)" },
      { x: TRACK.outer.right - 240, y: TRACK.outer.top + 18, w: 220, h: 18, color: "rgba(255, 255, 255, 0.05)" },
      { x: TRACK.outer.left + 18, y: TRACK.outer.bottom - 36, w: 220, h: 18, color: "rgba(255, 255, 255, 0.05)" },
      { x: TRACK.outer.right - 260, y: TRACK.outer.bottom - 36, w: 240, h: 18, color: "rgba(255, 255, 255, 0.06)" }
    ];

    for (const stripe of stripes) {
      ctx.fillStyle = stripe.color;
      ctx.fillRect(stripe.x, stripe.y, stripe.w, stripe.h);
    }
  }

  function drawFinishLine() {
    const x = waypoints[0].x - 10;
    const startY = TRACK.inner.bottom;
    const endY = TRACK.outer.bottom;
    const cell = 12;

    for (let y = startY; y < endY; y += cell) {
      for (let xOffset = 0; xOffset < 24; xOffset += cell) {
        const row = Math.floor((y - startY) / cell);
        const col = Math.floor(xOffset / cell);
        ctx.fillStyle = (row + col) % 2 === 0 ? "#f2f4f7" : "#111111";
        ctx.fillRect(x + xOffset, y, cell, cell);
      }
    }
  }

  function drawCars() {
    for (const car of cars) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      ctx.fillStyle = car.color;
      ctx.fillRect(-18, -10, 36, 20);

      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillRect(2, -7, 11, 14);

      ctx.fillStyle = "rgba(8, 8, 8, 0.28)";
      ctx.fillRect(-14, -8, 5, 4);
      ctx.fillRect(-14, 4, 5, 4);
      ctx.fillRect(9, -8, 5, 4);
      ctx.fillRect(9, 4, 5, 4);

      if (car.isPlayer) {
        ctx.strokeStyle = "#fff4bf";
        ctx.lineWidth = 2;
        ctx.strokeRect(-19, -11, 38, 22);
      }

      ctx.restore();

      ctx.fillStyle = "rgba(7, 10, 9, 0.7)";
      ctx.fillRect(car.x - 22, car.y - 30, 44, 16);
      ctx.fillStyle = "#f7fbf8";
      ctx.font = "12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(car.name, car.x, car.y - 18);
    }

    ctx.textAlign = "left";
  }

  function drawHud() {
    const player = cars[0];
    const playerStanding = standings.find((car) => car.id === player.id);
    const shownLap = player.finished ? TOTAL_LAPS : Math.min(TOTAL_LAPS, player.lapsCompleted + 1);
    const shownTime = player.finished ? player.finishTime : raceClock;

    ctx.fillStyle = "rgba(6, 10, 9, 0.76)";
    ctx.fillRect(18, 18, 286, 152);
    ctx.fillRect(WORLD_WIDTH - 254, 18, 236, 128);

    ctx.fillStyle = "#f1f8f4";
    ctx.font = "22px Trebuchet MS, sans-serif";
    ctx.fillText(`Lap ${shownLap}/${TOTAL_LAPS}`, 32, 52);
    ctx.fillText(`Time ${formatTime(shownTime)}`, 32, 84);
    ctx.fillText(`Position ${playerStanding ? playerStanding.place : 1}/${cars.length}`, 32, 116);

    ctx.font = "14px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#d8e8de";
    ctx.fillText(`Seed ${rngSeed}`, 32, 144);

    ctx.fillStyle = "#f1f8f4";
    ctx.font = "18px Trebuchet MS, sans-serif";
    ctx.fillText("Standings", WORLD_WIDTH - 236, 46);

    ctx.font = "15px Trebuchet MS, sans-serif";
    standings.forEach((car, index) => {
      const lineY = 72 + index * 22;
      ctx.fillStyle = car.color;
      ctx.fillText(`${index + 1}. ${car.name}`, WORLD_WIDTH - 236, lineY);
      ctx.fillStyle = "#d8e8de";
      const lapLabel = car.finished ? "FIN" : `L${Math.min(TOTAL_LAPS, car.lapsCompleted + 1)}`;
      ctx.fillText(lapLabel, WORLD_WIDTH - 70, lineY);
    });

    if (player.finished && playerStanding) {
      ctx.fillStyle = "rgba(6, 10, 9, 0.84)";
      ctx.fillRect(WORLD_WIDTH * 0.5 - 215, WORLD_HEIGHT * 0.5 - 58, 430, 116);
      ctx.fillStyle = "#fff8d9";
      ctx.font = "30px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Finished ${ordinal(playerStanding.place)}`, WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5 - 10);
      ctx.font = "20px Trebuchet MS, sans-serif";
      ctx.fillStyle = "#f1f8f4";
      ctx.fillText(`Final time ${formatTime(player.finishTime)}`, WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5 + 24);
      ctx.textAlign = "left";
    }
  }

  function buildWaypoints(track) {
    const lane = {
      left: (track.outer.left + track.inner.left) * 0.5,
      top: (track.outer.top + track.inner.top) * 0.5,
      right: (track.outer.right + track.inner.right) * 0.5,
      bottom: (track.outer.bottom + track.inner.bottom) * 0.5
    };
    const middleX = (lane.left + lane.right) * 0.5;

    return [
      { x: middleX, y: lane.bottom },
      { x: 820, y: lane.bottom },
      { x: 980, y: lane.bottom - 10 },
      { x: lane.right, y: 560 },
      { x: lane.right, y: 430 },
      { x: lane.right, y: 300 },
      { x: 980, y: lane.top + 10 },
      { x: 820, y: lane.top },
      { x: middleX, y: lane.top },
      { x: 460, y: lane.top },
      { x: 300, y: lane.top + 10 },
      { x: lane.left, y: 300 },
      { x: lane.left, y: 430 },
      { x: lane.left, y: 560 },
      { x: 300, y: lane.bottom - 10 },
      { x: 460, y: lane.bottom }
    ];
  }

  function buildPathMeta(points) {
    const segmentStarts = new Array(points.length);
    const segmentLengths = new Array(points.length);
    let totalLength = 0;

    for (let i = 0; i < points.length; i += 1) {
      segmentStarts[i] = totalLength;
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      segmentLengths[i] = length;
      totalLength += length;
    }

    return { segmentStarts, segmentLengths, totalLength };
  }

  function samplePathProgress(x, y) {
    let bestDistanceSq = Infinity;
    let bestProgress = 0;

    for (let i = 0; i < waypoints.length; i += 1) {
      const a = waypoints[i];
      const b = waypoints[(i + 1) % waypoints.length];
      const abX = b.x - a.x;
      const abY = b.y - a.y;
      const t = clamp(((x - a.x) * abX + (y - a.y) * abY) / (abX * abX + abY * abY), 0, 1);
      const sampleX = a.x + abX * t;
      const sampleY = a.y + abY * t;
      const dx = x - sampleX;
      const dy = y - sampleY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestProgress = pathMeta.segmentStarts[i] + pathMeta.segmentLengths[i] * t;
      }
    }

    return bestProgress;
  }

  function fillRect(rect) {
    ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }

  function strokeRect(rect) {
    ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }

  function formatTime(seconds) {
    const totalMilliseconds = Math.max(0, Math.floor(seconds * 1000));
    const minutes = Math.floor(totalMilliseconds / 60000);
    const remainder = totalMilliseconds % 60000;
    const secs = Math.floor(remainder / 1000);
    const millis = remainder % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  function ordinal(value) {
    if (value % 100 >= 11 && value % 100 <= 13) {
      return `${value}th`;
    }
    const suffix = value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
    return `${value}${suffix}`;
  }

  function onKeyChange(nextValue) {
    return (event) => {
      const key = event.key.toLowerCase();
      if (key === "w" || key === "arrowup") {
        input.accelerate = nextValue;
      } else if (key === "s" || key === "arrowdown") {
        input.brake = nextValue;
      } else if (key === "a" || key === "arrowleft") {
        input.left = nextValue;
      } else if (key === "d" || key === "arrowright") {
        input.right = nextValue;
      } else {
        return;
      }

      if (key.startsWith("arrow")) {
        event.preventDefault();
      }
    };
  }

  function clearInput() {
    input.accelerate = false;
    input.brake = false;
    input.left = false;
    input.right = false;
  }

  function createRng(seed) {
    let state = (seed >>> 0) || 1;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function wrapAngle(angle) {
    while (angle <= -Math.PI) {
      angle += Math.PI * 2;
    }
    while (angle > Math.PI) {
      angle -= Math.PI * 2;
    }
    return angle;
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }
})();
