(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const lapValue = document.getElementById("lapValue");
  const timeValue = document.getElementById("timeValue");
  const positionValue = document.getElementById("positionValue");
  const standings = document.getElementById("standings");

  const RNG_SEED = 0x5eed2026;
  const FIXED_DT = 1 / 60;
  const TOTAL_LAPS = 3;
  const TRACK_WIDTH = 182;
  const CHECKPOINT_RADIUS = 112;
  const WORLD = { width: 1460, height: 940 };
  const TWO_PI = Math.PI * 2;

  const TRACK_POINTS = [
    { x: 220, y: 560 },
    { x: 315, y: 250 },
    { x: 650, y: 128 },
    { x: 1028, y: 170 },
    { x: 1240, y: 392 },
    { x: 1160, y: 674 },
    { x: 858, y: 790 },
    { x: 496, y: 718 },
  ];

  const TRACK = buildTrackData(TRACK_POINTS);
  const scenery = buildScenery();
  const keys = new Set();
  const view = { width: 0, height: 0, dpr: 1 };

  let cars = [];
  let player = null;
  let simTime = 0;
  let finishCounter = 0;
  let accumulator = 0;
  let previousFrame = performance.now();

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  resizeCanvas();
  initRace();
  requestAnimationFrame(frame);

  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function initRace() {
    const rng = mulberry32(RNG_SEED);
    const start = TRACK_POINTS[0];
    const startDir = normalize(sub(TRACK_POINTS[1], TRACK_POINTS[0]));
    const startNormal = perp(startDir);
    const angle = Math.atan2(startDir.y, startDir.x);
    const grid = [
      {
        name: "Player",
        color: "#f04d3a",
        accent: "#ffe66b",
        lane: -32,
        back: 8,
        isPlayer: true,
      },
      {
        name: "Apex",
        color: "#2e86de",
        accent: "#bde0fe",
        lane: 34,
        back: 42,
      },
      {
        name: "Torque",
        color: "#38b000",
        accent: "#d8f3dc",
        lane: -42,
        back: 82,
      },
      {
        name: "Nova",
        color: "#ff9f1c",
        accent: "#fff3b0",
        lane: 26,
        back: 122,
      },
    ];

    cars = grid.map((entry, index) => {
      const startOffset = add(
        add(start, scale(startDir, -entry.back)),
        scale(startNormal, entry.lane)
      );

      return createCar({
        name: entry.name,
        position: startOffset,
        angle,
        color: entry.color,
        accent: entry.accent,
        isPlayer: entry.isPlayer === true,
        laneOffset: entry.lane + (rng() - 0.5) * 16,
        rng,
        index,
      });
    });

    player = cars[0];
    simTime = 0;
    finishCounter = 0;
    accumulator = 0;
    previousFrame = performance.now();
    cars.forEach(refreshRaceDistance);
  }

  function createCar({
    name,
    position,
    angle,
    color,
    accent,
    isPlayer,
    laneOffset,
    rng,
    index,
  }) {
    const aiPace = 0.91 + rng() * 0.13;
    const aiTurn = 1.25 + rng() * 0.35;

    return {
      name,
      color,
      accent,
      isPlayer,
      pos: { x: position.x, y: position.y },
      previousPos: { x: position.x, y: position.y },
      vel: { x: 0, y: 0 },
      angle,
      radius: 18,
      length: 46,
      width: 25,
      mass: isPlayer ? 1.15 : 1 + index * 0.03,
      enginePower: isPlayer ? 540 : 510 * aiPace,
      brakePower: isPlayer ? 720 : 680,
      reversePower: 260,
      maxSpeed: isPlayer ? 340 : 286 + rng() * 42,
      turnRate: isPlayer ? 3.25 : 3.05,
      steerSpeed: 180,
      grip: isPlayer ? 8.4 : 8.0 + rng() * 0.6,
      drag: 0.0016,
      rollingDrag: 0.62,
      nextCheckpoint: 1,
      completedLaps: 0,
      lapStartedAt: 0,
      finished: false,
      finishTime: null,
      finishOrder: Infinity,
      trackDistance: 0,
      raceDistance: 0,
      ai: {
        targetIndex: 1,
        laneOffset,
        pace: aiPace,
        reaction: aiTurn,
        caution: 0.78 + rng() * 0.32,
      },
    };
  }

  function frame(now) {
    const elapsed = Math.min(0.25, (now - previousFrame) / 1000);
    previousFrame = now;
    accumulator += elapsed;

    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(frame);
  }

  function step(dt) {
    simTime += dt;

    const controls = new Map();
    for (const car of cars) {
      controls.set(car, car.isPlayer ? readPlayerControls(car) : readAiControls(car));
    }

    for (const car of cars) {
      car.previousPos.x = car.pos.x;
      car.previousPos.y = car.pos.y;
      driveCar(car, controls.get(car), dt);
    }

    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < cars.length; i += 1) {
        for (let j = i + 1; j < cars.length; j += 1) {
          resolveCarCollision(cars[i], cars[j]);
        }
      }

      for (const car of cars) {
        resolveTrackCollision(car);
      }
    }

    for (const car of cars) {
      updateLapState(car);
      refreshRaceDistance(car);
    }
  }

  function readPlayerControls(car) {
    if (car.finished) {
      return { throttle: 0, brake: 0, steer: 0 };
    }

    return {
      throttle: keys.has("arrowup") || keys.has("w") ? 1 : 0,
      brake: keys.has("arrowdown") || keys.has("s") ? 1 : 0,
      steer:
        (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
        (keys.has("arrowleft") || keys.has("a") ? 1 : 0),
    };
  }

  function readAiControls(car) {
    if (car.finished) {
      return { throttle: 0, brake: 0, steer: 0 };
    }

    const speed = length(car.vel);
    const closeEnough = 88 + speed * 0.18;
    let target = getAiTarget(car);

    if (distance(car.pos, target) < closeEnough) {
      car.ai.targetIndex = (car.ai.targetIndex + 1) % TRACK_POINTS.length;
      target = getAiTarget(car);
    }

    const forward = angleVector(car.angle);
    const right = perp(forward);
    const toTarget = sub(target, car.pos);
    const desiredAngle = Math.atan2(toTarget.y, toTarget.x);
    const turnError = wrapAngle(desiredAngle - car.angle);
    const absTurn = Math.abs(turnError);
    let steer = clamp(turnError * car.ai.reaction, -1, 1);

    const forwardSpeed = dot(car.vel, forward);
    const cornerLimit = car.maxSpeed * (1 - clamp(absTurn / 1.85, 0, 0.48));
    const targetSpeed = Math.max(110, cornerLimit * car.ai.caution);
    let throttle = forwardSpeed < targetSpeed ? 1 : 0.18;
    let brake = forwardSpeed > targetSpeed + 22 ? clamp((forwardSpeed - targetSpeed) / 90, 0, 1) : 0;

    for (const other of cars) {
      if (other === car) {
        continue;
      }

      const offset = sub(other.pos, car.pos);
      const forwardGap = dot(offset, forward);
      const sideGap = dot(offset, right);

      if (forwardGap > 0 && forwardGap < 78 && Math.abs(sideGap) < 40) {
        brake = Math.max(brake, 0.4);
        throttle = Math.min(throttle, 0.55);
        steer = clamp(steer + (sideGap >= 0 ? -0.28 : 0.28), -1, 1);
      }
    }

    return { throttle, brake, steer };
  }

  function getAiTarget(car) {
    const index = car.ai.targetIndex;
    const next = TRACK_POINTS[index];
    const prev = TRACK_POINTS[(index - 1 + TRACK_POINTS.length) % TRACK_POINTS.length];
    const tangent = normalize(sub(next, prev));
    const normal = perp(tangent);
    return add(next, scale(normal, car.ai.laneOffset));
  }

  function driveCar(car, controls, dt) {
    const forward = angleVector(car.angle);
    const right = perp(forward);
    const forwardSpeed = dot(car.vel, forward);
    const lateralSpeed = dot(car.vel, right);

    let acceleration = 0;
    if (controls.throttle > 0) {
      acceleration += car.enginePower * controls.throttle;
    }
    if (controls.brake > 0) {
      acceleration -= (forwardSpeed > 12 ? car.brakePower : car.reversePower) * controls.brake;
    }

    car.vel.x += forward.x * acceleration * dt;
    car.vel.y += forward.y * acceleration * dt;

    const grip = clamp(car.grip * dt, 0, 1);
    car.vel.x -= right.x * lateralSpeed * grip;
    car.vel.y -= right.y * lateralSpeed * grip;

    applyDrag(car, dt);

    const steeringSpeed = clamp(Math.abs(forwardSpeed) / car.steerSpeed, 0, 1);
    const steeringDirection = forwardSpeed >= -6 ? 1 : -1;
    car.angle = wrapAngle(
      car.angle + controls.steer * car.turnRate * steeringSpeed * steeringDirection * dt
    );

    const speed = length(car.vel);
    if (speed > car.maxSpeed) {
      const limited = car.maxSpeed / speed;
      car.vel.x *= limited;
      car.vel.y *= limited;
    }

    car.pos.x += car.vel.x * dt;
    car.pos.y += car.vel.y * dt;
  }

  function applyDrag(car, dt) {
    const speed = length(car.vel);
    if (speed <= 0.0001) {
      return;
    }

    const dragForce = car.drag * speed * speed + car.rollingDrag * speed;
    const dragDelta = Math.min(speed, dragForce * dt);
    car.vel.x -= (car.vel.x / speed) * dragDelta;
    car.vel.y -= (car.vel.y / speed) * dragDelta;
  }

  function resolveCarCollision(a, b) {
    const delta = sub(b.pos, a.pos);
    let distSq = delta.x * delta.x + delta.y * delta.y;
    const minDist = a.radius + b.radius;

    if (distSq >= minDist * minDist) {
      return;
    }

    let normal;
    let dist;
    if (distSq < 0.0001) {
      normal = angleVector(a.angle + Math.PI * 0.5);
      dist = 0.01;
      distSq = dist * dist;
    } else {
      dist = Math.sqrt(distSq);
      normal = scale(delta, 1 / dist);
    }

    const invMassA = 1 / a.mass;
    const invMassB = 1 / b.mass;
    const invMassSum = invMassA + invMassB;
    const penetration = minDist - dist;

    a.pos.x -= normal.x * penetration * (invMassA / invMassSum);
    a.pos.y -= normal.y * penetration * (invMassA / invMassSum);
    b.pos.x += normal.x * penetration * (invMassB / invMassSum);
    b.pos.y += normal.y * penetration * (invMassB / invMassSum);

    const relativeVelocity = sub(b.vel, a.vel);
    const velocityAlongNormal = dot(relativeVelocity, normal);
    if (velocityAlongNormal > 0) {
      return;
    }

    const restitution = 0.38;
    const impulseMagnitude = (-(1 + restitution) * velocityAlongNormal) / invMassSum;
    const impulse = scale(normal, impulseMagnitude);

    a.vel.x -= impulse.x * invMassA;
    a.vel.y -= impulse.y * invMassA;
    b.vel.x += impulse.x * invMassB;
    b.vel.y += impulse.y * invMassB;

    const tangentVelocity = sub(sub(b.vel, a.vel), scale(normal, dot(sub(b.vel, a.vel), normal)));
    const tangentSpeed = length(tangentVelocity);
    if (tangentSpeed <= 0.0001) {
      return;
    }

    const tangent = scale(tangentVelocity, 1 / tangentSpeed);
    const tangentImpulseMagnitude = clamp(
      -dot(sub(b.vel, a.vel), tangent) / invMassSum,
      -impulseMagnitude * 0.34,
      impulseMagnitude * 0.34
    );
    const tangentImpulse = scale(tangent, tangentImpulseMagnitude);

    a.vel.x -= tangentImpulse.x * invMassA;
    a.vel.y -= tangentImpulse.y * invMassA;
    b.vel.x += tangentImpulse.x * invMassB;
    b.vel.y += tangentImpulse.y * invMassB;
  }

  function resolveTrackCollision(car) {
    const nearest = nearestOnTrack(car.pos);
    const maxDistance = TRACK_WIDTH * 0.5 - car.radius - 4;

    if (nearest.distance <= maxDistance) {
      return;
    }

    let normal = sub(car.pos, nearest.point);
    const normalLength = length(normal);
    if (normalLength <= 0.0001) {
      normal = nearest.normal;
    } else {
      normal = scale(normal, 1 / normalLength);
    }

    car.pos.x = nearest.point.x + normal.x * maxDistance;
    car.pos.y = nearest.point.y + normal.y * maxDistance;

    const outwardSpeed = dot(car.vel, normal);
    if (outwardSpeed > 0) {
      const wallRestitution = 0.22;
      const impulse = -(1 + wallRestitution) * outwardSpeed;
      car.vel.x += normal.x * impulse;
      car.vel.y += normal.y * impulse;
    }

    car.vel.x *= 0.9;
    car.vel.y *= 0.9;
  }

  function updateLapState(car) {
    if (car.finished) {
      return;
    }

    const checkpoint = TRACK_POINTS[car.nextCheckpoint];
    const hitRadius = car.nextCheckpoint === 0 ? 86 : CHECKPOINT_RADIUS;

    if (distance(car.pos, checkpoint) > hitRadius) {
      return;
    }

    if (car.nextCheckpoint === 0) {
      car.completedLaps += 1;
      car.lapStartedAt = simTime;

      if (car.completedLaps >= TOTAL_LAPS) {
        car.finished = true;
        car.finishTime = simTime;
        car.finishOrder = ++finishCounter;
      }

      car.nextCheckpoint = 1;
      return;
    }

    car.nextCheckpoint = (car.nextCheckpoint + 1) % TRACK_POINTS.length;
  }

  function refreshRaceDistance(car) {
    const nearest = nearestOnTrack(car.pos);
    let trackDistance = nearest.distanceAlong;

    if (car.completedLaps === 0 && car.nextCheckpoint === 1 && trackDistance > TRACK.totalLength * 0.72) {
      trackDistance = 0;
    }

    car.trackDistance = trackDistance;
    car.raceDistance = car.completedLaps * TRACK.totalLength + trackDistance;
  }

  function getRaceOrder() {
    return [...cars].sort((a, b) => {
      if (a.finished && b.finished) {
        return a.finishOrder - b.finishOrder;
      }
      if (a.finished) {
        return -1;
      }
      if (b.finished) {
        return 1;
      }
      return b.raceDistance - a.raceDistance;
    });
  }

  function render() {
    ctx.clearRect(0, 0, view.width, view.height);

    const zoom = Math.max(0.58, Math.min(0.94, Math.min(view.width / 930, view.height / 620)));
    const marginX = view.width / (2 * zoom);
    const marginY = view.height / (2 * zoom);
    const cameraX = clampCamera(player.pos.x, marginX, WORLD.width);
    const cameraY = clampCamera(player.pos.y, marginY, WORLD.height);

    ctx.save();
    ctx.translate(view.width / 2, view.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cameraX, -cameraY);

    drawBackground();
    drawTrack();
    drawTrackFurniture();

    const renderOrder = [...cars].sort((a, b) => a.pos.y - b.pos.y);
    for (const car of renderOrder) {
      drawCar(car);
    }

    ctx.restore();
    updateHud();
  }

  function drawBackground() {
    ctx.fillStyle = "#253823";
    ctx.fillRect(-1200, -1200, WORLD.width + 2400, WORLD.height + 2400);

    ctx.fillStyle = "rgba(17, 31, 18, 0.35)";
    for (const patch of scenery.grassPatches) {
      ctx.beginPath();
      ctx.ellipse(patch.x, patch.y, patch.rx, patch.ry, patch.rotation, 0, TWO_PI);
      ctx.fill();
    }

    for (const fleck of scenery.grassFlecks) {
      ctx.fillStyle = fleck.color;
      ctx.fillRect(fleck.x, fleck.y, fleck.width, fleck.height);
    }
  }

  function drawTrack() {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    traceTrackPath();
    ctx.strokeStyle = "#141a1d";
    ctx.lineWidth = TRACK_WIDTH + 38;
    ctx.stroke();

    traceTrackPath();
    ctx.strokeStyle = "#4e5352";
    ctx.lineWidth = TRACK_WIDTH;
    ctx.stroke();

    traceTrackPath();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 5;
    ctx.setLineDash([22, 30]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const mark of scenery.tireMarks) {
      const sample = sampleTrack(mark.distance);
      const center = add(sample.point, scale(sample.normal, mark.offset));
      const from = add(center, scale(sample.dir, -mark.length / 2));
      const to = add(center, scale(sample.dir, mark.length / 2));
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = mark.width;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    drawStartLine();
    ctx.restore();
  }

  function drawTrackFurniture() {
    for (let i = 0; i < TRACK_POINTS.length; i += 1) {
      const point = TRACK_POINTS[i];
      const prev = TRACK_POINTS[(i - 1 + TRACK_POINTS.length) % TRACK_POINTS.length];
      const next = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
      const tangent = normalize(sub(next, prev));
      const normal = perp(tangent);
      const gateHalf = TRACK_WIDTH * 0.42;
      const posts = [add(point, scale(normal, gateHalf)), add(point, scale(normal, -gateHalf))];

      for (const post of posts) {
        ctx.fillStyle = i === 0 ? "#ffffff" : "#f6c744";
        ctx.beginPath();
        ctx.arc(post.x, post.y, 5, 0, TWO_PI);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.32)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function traceTrackPath() {
    ctx.beginPath();
    ctx.moveTo(TRACK_POINTS[0].x, TRACK_POINTS[0].y);
    for (let i = 1; i < TRACK_POINTS.length; i += 1) {
      ctx.lineTo(TRACK_POINTS[i].x, TRACK_POINTS[i].y);
    }
    ctx.closePath();
  }

  function drawStartLine() {
    const start = TRACK_POINTS[0];
    const dir = normalize(sub(TRACK_POINTS[1], TRACK_POINTS[0]));
    const normal = perp(dir);
    const angle = Math.atan2(normal.y, normal.x);
    const lineLength = TRACK_WIDTH * 0.78;
    const blocks = 12;
    const rows = 2;
    const blockWidth = lineLength / blocks;
    const blockHeight = 12;

    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(angle);

    for (let x = 0; x < blocks; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#f8f8f8" : "#1b1d1e";
        ctx.fillRect(
          -lineLength / 2 + x * blockWidth,
          -blockHeight * rows * 0.5 + y * blockHeight,
          blockWidth,
          blockHeight
        );
      }
    }

    ctx.restore();
  }

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.pos.x, car.pos.y);
    ctx.rotate(car.angle);

    ctx.fillStyle = "rgba(0,0,0,0.26)";
    roundedRect(-car.length / 2 - 2, -car.width / 2 + 3, car.length + 4, car.width + 4, 7);
    ctx.fill();

    ctx.fillStyle = "#101214";
    ctx.fillRect(-car.length * 0.37, -car.width * 0.65, 11, 6);
    ctx.fillRect(-car.length * 0.37, car.width * 0.42, 11, 6);
    ctx.fillRect(car.length * 0.18, -car.width * 0.65, 12, 6);
    ctx.fillRect(car.length * 0.18, car.width * 0.42, 12, 6);

    ctx.fillStyle = car.color;
    roundedRect(-car.length / 2, -car.width / 2, car.length, car.width, 7);
    ctx.fill();

    ctx.fillStyle = car.accent;
    roundedRect(car.length * 0.05, -car.width * 0.34, car.length * 0.36, car.width * 0.68, 5);
    ctx.fill();

    ctx.fillStyle = "rgba(9, 21, 26, 0.76)";
    roundedRect(-car.length * 0.2, -car.width * 0.31, car.length * 0.22, car.width * 0.62, 4);
    ctx.fill();

    ctx.strokeStyle = car.isPlayer ? "#ffffff" : "rgba(255,255,255,0.64)";
    ctx.lineWidth = car.isPlayer ? 2.5 : 1.5;
    roundedRect(-car.length / 2, -car.width / 2, car.length, car.width, 7);
    ctx.stroke();

    ctx.restore();
  }

  function updateHud() {
    const order = getRaceOrder();
    const playerPosition = order.indexOf(player) + 1;
    const shownLap = player.finished
      ? `${TOTAL_LAPS}/${TOTAL_LAPS}`
      : `${Math.min(player.completedLaps + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;

    lapValue.textContent = shownLap;
    timeValue.textContent = formatTime(player.finishTime ?? simTime);
    positionValue.textContent = ordinal(playerPosition);
    standings.innerHTML = order
      .map((car, index) => {
        const lapLabel = car.finished
          ? formatTime(car.finishTime)
          : `Lap ${Math.min(car.completedLaps + 1, TOTAL_LAPS)}`;
        const rowClass = car.isPlayer ? " standings__row--player" : "";
        return `<div class="standings__row${rowClass}">
          <span class="standings__position">${ordinal(index + 1)}</span>
          <span class="standings__name">${car.name}</span>
          <span class="standings__lap">${lapLabel}</span>
        </div>`;
      })
      .join("");
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
    if (key === "r") {
      initRace();
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function resizeCanvas() {
    view.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    canvas.width = Math.floor(view.width * view.dpr);
    canvas.height = Math.floor(view.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  function buildTrackData(points) {
    const segmentLengths = [];
    const cumulative = [0];
    let totalLength = 0;

    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const segmentLength = distance(current, next);
      segmentLengths.push(segmentLength);
      totalLength += segmentLength;
      cumulative.push(totalLength);
    }

    return { segmentLengths, cumulative, totalLength };
  }

  function nearestOnTrack(position) {
    let best = null;

    for (let i = 0; i < TRACK_POINTS.length; i += 1) {
      const a = TRACK_POINTS[i];
      const b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
      const ab = sub(b, a);
      const t = clamp(dot(sub(position, a), ab) / dot(ab, ab), 0, 1);
      const point = add(a, scale(ab, t));
      const delta = sub(position, point);
      const distSq = dot(delta, delta);

      if (best === null || distSq < best.distSq) {
        const dir = normalize(ab);
        best = {
          point,
          distSq,
          distance: Math.sqrt(distSq),
          segmentIndex: i,
          t,
          dir,
          normal: perp(dir),
          distanceAlong: TRACK.cumulative[i] + TRACK.segmentLengths[i] * t,
        };
      }
    }

    return best;
  }

  function sampleTrack(distanceAlong) {
    const wrapped = positiveModulo(distanceAlong, TRACK.totalLength);
    let segmentIndex = TRACK.segmentLengths.length - 1;

    for (let i = 0; i < TRACK.segmentLengths.length; i += 1) {
      if (wrapped <= TRACK.cumulative[i + 1]) {
        segmentIndex = i;
        break;
      }
    }

    const startDistance = TRACK.cumulative[segmentIndex];
    const segmentLength = TRACK.segmentLengths[segmentIndex];
    const t = clamp((wrapped - startDistance) / segmentLength, 0, 1);
    const a = TRACK_POINTS[segmentIndex];
    const b = TRACK_POINTS[(segmentIndex + 1) % TRACK_POINTS.length];
    const dir = normalize(sub(b, a));
    return {
      point: lerp(a, b, t),
      dir,
      normal: perp(dir),
    };
  }

  function buildScenery() {
    const rng = mulberry32(RNG_SEED ^ 0xa57c3f11);
    const grassFlecks = [];
    const grassPatches = [];
    const tireMarks = [];

    for (let i = 0; i < 520; i += 1) {
      grassFlecks.push({
        x: rng() * WORLD.width,
        y: rng() * WORLD.height,
        width: 3 + rng() * 7,
        height: 1 + rng() * 3,
        color: rng() > 0.5 ? "rgba(148, 182, 88, 0.23)" : "rgba(79, 124, 63, 0.24)",
      });
    }

    for (let i = 0; i < 22; i += 1) {
      grassPatches.push({
        x: rng() * WORLD.width,
        y: rng() * WORLD.height,
        rx: 24 + rng() * 68,
        ry: 12 + rng() * 34,
        rotation: rng() * TWO_PI,
      });
    }

    for (let i = 0; i < 76; i += 1) {
      tireMarks.push({
        distance: rng() * TRACK.totalLength,
        offset: (rng() - 0.5) * TRACK_WIDTH * 0.62,
        length: 28 + rng() * 78,
        width: 2 + rng() * 3,
        color: `rgba(12, 13, 13, ${0.1 + rng() * 0.11})`,
      });
    }

    return { grassFlecks, grassPatches, tireMarks };
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function angleVector(angle) {
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function scale(vector, scalar) {
    return { x: vector.x * scalar, y: vector.y * scalar };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function length(vector) {
    return Math.hypot(vector.x, vector.y);
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalize(vector) {
    const vectorLength = length(vector);
    if (vectorLength <= 0.0001) {
      return { x: 1, y: 0 };
    }
    return { x: vector.x / vectorLength, y: vector.y / vectorLength };
  }

  function perp(vector) {
    return { x: -vector.y, y: vector.x };
  }

  function lerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampCamera(value, margin, worldSize) {
    if (margin * 2 >= worldSize) {
      return worldSize / 2;
    }
    return clamp(value, margin, worldSize - margin);
  }

  function wrapAngle(angle) {
    let wrapped = angle;
    while (wrapped <= -Math.PI) {
      wrapped += TWO_PI;
    }
    while (wrapped > Math.PI) {
      wrapped -= TWO_PI;
    }
    return wrapped;
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function formatTime(value) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    const milliseconds = Math.floor((value - Math.floor(value)) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
      milliseconds
    ).padStart(3, "0")}`;
  }

  function ordinal(value) {
    const tens = value % 100;
    if (tens >= 11 && tens <= 13) {
      return `${value}th`;
    }

    switch (value % 10) {
      case 1:
        return `${value}st`;
      case 2:
        return `${value}nd`;
      case 3:
        return `${value}rd`;
      default:
        return `${value}th`;
    }
  }
})();
