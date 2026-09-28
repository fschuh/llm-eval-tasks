(() => {
  "use strict";

  // Simulation settings. All race-affecting values are updated in fixed 1/120 s steps.
  const FIXED_DT = 1 / 120;
  const MAX_FRAME_TIME = 0.1;
  const SEED = 0xc1ac017;
  const MAX_LAPS = 3;
  const CHECKPOINT_COUNT = 8;
  const WAYPOINT_COUNT = 48;
  const TAU = Math.PI * 2;

  const WORLD = { width: 1280, height: 720 };
  const TRACK = {
    x: 640,
    y: 360,
    rx: 402,
    ry: 218,
    halfWidth: 72,
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const lapElement = document.getElementById("lap");
  const timeElement = document.getElementById("race-time");
  const positionElement = document.getElementById("position");
  const stateElement = document.getElementById("race-state");
  const finishOverlay = document.getElementById("finish-overlay");
  const finishTitle = document.getElementById("finish-title");
  const finishDetail = document.getElementById("finish-detail");
  const restartButton = document.getElementById("restart");

  class SeededRandom {
    constructor(seed) {
      this.state = seed >>> 0;
    }

    next() {
      let value = (this.state += 0x6d2b79f5);
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.next();
    }
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const length = (v) => Math.hypot(v.x, v.y);
  const ordinal = (value) => {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}TH`;
    if (value % 10 === 1) return `${value}ST`;
    if (value % 10 === 2) return `${value}ND`;
    if (value % 10 === 3) return `${value}RD`;
    return `${value}TH`;
  };

  function formatTime(seconds) {
    const wholeMinutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${String(wholeMinutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  }

  function trackPoint(angle, lane = 0) {
    return {
      x: TRACK.x + (TRACK.rx + lane) * Math.cos(angle),
      y: TRACK.y + (TRACK.ry + lane) * Math.sin(angle),
    };
  }

  function tangentAngle(angle) {
    return Math.atan2(TRACK.ry * Math.cos(angle), -TRACK.rx * Math.sin(angle));
  }

  function radialNormal(angle) {
    const x = Math.cos(angle) / TRACK.rx;
    const y = Math.sin(angle) / TRACK.ry;
    const magnitude = Math.hypot(x, y);
    return { x: x / magnitude, y: y / magnitude };
  }

  const checkpoints = Array.from({ length: CHECKPOINT_COUNT }, (_, index) => {
    const angle = (index / CHECKPOINT_COUNT) * TAU;
    return { angle, ...trackPoint(angle) };
  });

  const terrain = buildTerrain();
  const pressed = new Set();
  let vehicles = [];
  let player;
  let raceTime = 0;
  let simulationTime = 0;
  let finished = false;
  let lastFrame = performance.now() / 1000;
  let accumulator = 0;
  let viewport = { width: 0, height: 0, scale: 1, x: 0, y: 0, pixelRatio: 1 };

  function buildTerrain() {
    const random = new SeededRandom(SEED);
    const flecks = [];
    const trees = [];
    const inRoad = (x, y) => {
      const distance = Math.hypot((x - TRACK.x) / TRACK.rx, (y - TRACK.y) / TRACK.ry);
      return distance > 0.66 && distance < 1.23;
    };

    for (let index = 0; index < 620; index += 1) {
      flecks.push({
        x: random.range(12, WORLD.width - 12),
        y: random.range(12, WORLD.height - 12),
        size: random.range(0.6, 2.1),
        tone: random.next() > 0.55 ? "#276a5c" : "#1e554c",
        alpha: random.range(0.08, 0.35),
      });
    }

    let attempts = 0;
    while (trees.length < 46 && attempts < 800) {
      attempts += 1;
      const x = random.range(44, WORLD.width - 44);
      const y = random.range(42, WORLD.height - 42);
      if (inRoad(x, y)) continue;
      trees.push({
        x,
        y,
        radius: random.range(5, 13),
        shade: random.next() > 0.45 ? "#17493f" : "#123c36",
        highlight: random.next() > 0.5 ? "#2b6958" : "#245f51",
      });
    }
    return { flecks, trees };
  }

  function createVehicle(spec) {
    const startingAngle = spec.startAngle;
    const start = trackPoint(startingAngle, spec.lane);
    const waypoint = Math.floor((startingAngle / TAU) * WAYPOINT_COUNT + 1) % WAYPOINT_COUNT;
    return {
      id: spec.id,
      name: spec.name,
      isPlayer: Boolean(spec.isPlayer),
      color: spec.color,
      accent: spec.accent,
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      heading: tangentAngle(startingAngle),
      radius: 15,
      mass: 1,
      lane: spec.lane,
      controls: { throttle: 0, brake: 0, steer: 0 },
      lap: 1,
      nextCheckpoint: 1,
      passedCheckpoints: 0,
      finished: false,
      finishTime: null,
      waypoint,
      ai: spec.ai || null,
      skid: 0,
    };
  }

  function resetRace() {
    // Recreating this generator on restart means identical AI traits and starts
    // for the same seed, even across a sequence of races.
    const raceRandom = new SeededRandom(SEED ^ 0x0a11ce);
    const nextAI = (minimumSpeed, maximumSpeed, minimumSkill, maximumSkill) => ({
      topSpeed: Math.round(raceRandom.range(minimumSpeed, maximumSpeed)),
      lookAhead: 4 + Math.floor(raceRandom.range(0, 2)),
      skill: Number(raceRandom.range(minimumSkill, maximumSkill).toFixed(3)),
    });

    vehicles = [
      // Two staggered grid rows give every car a clean launch while still letting
      // the impulse solver handle aggressive overtakes later in the race.
      createVehicle({ id: "player", name: "You", isPlayer: true, color: "#f6c84f", accent: "#fff5ca", lane: -30, startAngle: 0.105 }),
      createVehicle({ id: "nova", name: "Nova", color: "#ff6b74", accent: "#ffd4d7", lane: 30, startAngle: 0.105, ai: nextAI(290, 301, 0.98, 1.03) }),
      createVehicle({ id: "atlas", name: "Atlas", color: "#59b8ff", accent: "#d8f1ff", lane: -30, startAngle: 0.335, ai: nextAI(278, 289, 0.91, 0.97) }),
      createVehicle({ id: "sol", name: "Sol", color: "#9a7cff", accent: "#e6deff", lane: 30, startAngle: 0.335, ai: nextAI(268, 279, 0.86, 0.92) }),
    ];
    player = vehicles[0];
    raceTime = 0;
    simulationTime = 0;
    finished = false;
    finishOverlay.classList.remove("visible");
    updateHud();
  }

  function inputControls() {
    return {
      throttle: pressed.has("ArrowUp") || pressed.has("KeyW") ? 1 : 0,
      brake: pressed.has("ArrowDown") || pressed.has("KeyS") ? 1 : 0,
      steer: (pressed.has("ArrowLeft") || pressed.has("KeyA") ? -1 : 0) + (pressed.has("ArrowRight") || pressed.has("KeyD") ? 1 : 0),
    };
  }

  function updateAI(car) {
    const point = trackPoint((car.waypoint / WAYPOINT_COUNT) * TAU, car.lane);
    const dx = point.x - car.x;
    const dy = point.y - car.y;
    if (dx * dx + dy * dy < 62 * 62) {
      car.waypoint = (car.waypoint + 1) % WAYPOINT_COUNT;
    }

    const targetIndex = (car.waypoint + car.ai.lookAhead) % WAYPOINT_COUNT;
    const target = trackPoint((targetIndex / WAYPOINT_COUNT) * TAU, car.lane);
    const desiredHeading = Math.atan2(target.y - car.y, target.x - car.x);
    const steeringError = wrapAngle(desiredHeading - car.heading);
    const forward = { x: Math.cos(car.heading), y: Math.sin(car.heading) };
    const forwardSpeed = dot({ x: car.vx, y: car.vy }, forward);
    const curvePenalty = clamp(Math.abs(steeringError) / 1.05, 0, 1);
    const targetSpeed = car.ai.topSpeed * (1 - curvePenalty * 0.42);

    car.controls.steer = clamp(steeringError * 2.1 * car.ai.skill, -1, 1);
    car.controls.throttle = forwardSpeed < targetSpeed - 5 ? 1 : 0;
    car.controls.brake = forwardSpeed > targetSpeed + 17 ? 0.65 : 0;
  }

  function updateVehicle(car, dt) {
    if (car.finished) return;

    if (car.isPlayer) car.controls = inputControls();
    else updateAI(car);

    const forward = { x: Math.cos(car.heading), y: Math.sin(car.heading) };
    const side = { x: -forward.y, y: forward.x };
    const velocity = { x: car.vx, y: car.vy };
    let forwardSpeed = dot(velocity, forward);
    const lateralSpeed = dot(velocity, side);

    const steeringAuthority = clamp(Math.abs(forwardSpeed) / 78, 0.13, 1);
    const steeringDirection = forwardSpeed < -5 ? -1 : 1;
    car.heading += car.controls.steer * steeringDirection * 2.36 * steeringAuthority * dt;

    const throttleForce = car.controls.throttle * 455;
    // The brake key first removes forward speed, then becomes a capped reverse gear.
    const brakingForce = car.controls.brake ? (forwardSpeed > 12 ? -690 : -275) : 0;
    car.vx += forward.x * (throttleForce + brakingForce) * dt;
    car.vy += forward.y * (throttleForce + brakingForce) * dt;

    // Arcade tire model: heavy lateral grip keeps the cars readable, while a small
    // controlled slip remains visible under hard steering.
    const lateralGrip = 10.5;
    car.vx -= side.x * lateralSpeed * lateralGrip * dt;
    car.vy -= side.y * lateralSpeed * lateralGrip * dt;

    const drag = 0.42;
    const damping = 1 / (1 + drag * dt);
    car.vx *= damping;
    car.vy *= damping;

    forwardSpeed = dot({ x: car.vx, y: car.vy }, forward);
    const speedLimit = car.isPlayer ? 322 : car.ai.topSpeed + 15;
    if (Math.abs(forwardSpeed) > speedLimit) {
      const correction = forwardSpeed - Math.sign(forwardSpeed) * speedLimit;
      car.vx -= forward.x * correction;
      car.vy -= forward.y * correction;
    }

    car.skid = clamp(Math.abs(lateralSpeed) / 54 + Math.abs(car.controls.steer) * Math.abs(forwardSpeed) / 580, 0, 1);
    car.x += car.vx * dt;
    car.y += car.vy * dt;
  }

  function resolveTrackCollision(car) {
    const dx = car.x - TRACK.x;
    const dy = car.y - TRACK.y;
    const outerRx = TRACK.rx + TRACK.halfWidth - car.radius;
    const outerRy = TRACK.ry + TRACK.halfWidth - car.radius;
    const innerRx = TRACK.rx - TRACK.halfWidth + car.radius;
    const innerRy = TRACK.ry - TRACK.halfWidth + car.radius;
    const outerNormalized = Math.hypot(dx / outerRx, dy / outerRy);
    const innerNormalized = Math.hypot(dx / innerRx, dy / innerRy);

    let normal;
    let normalVelocity;
    if (outerNormalized > 1) {
      car.x = TRACK.x + dx / outerNormalized;
      car.y = TRACK.y + dy / outerNormalized;
      normal = { x: dx / (outerRx * outerRx), y: dy / (outerRy * outerRy) };
      const magnitude = length(normal);
      normal.x /= magnitude;
      normal.y /= magnitude;
      normalVelocity = car.vx * normal.x + car.vy * normal.y;
      if (normalVelocity > 0) {
        const impulse = (1 + 0.35) * normalVelocity;
        car.vx -= normal.x * impulse;
        car.vy -= normal.y * impulse;
      }
    } else if (innerNormalized < 1) {
      const safeNormalized = Math.max(innerNormalized, 0.001);
      car.x = TRACK.x + dx / safeNormalized;
      car.y = TRACK.y + dy / safeNormalized;
      normal = { x: dx / (innerRx * innerRx), y: dy / (innerRy * innerRy) };
      const magnitude = length(normal);
      normal.x /= magnitude;
      normal.y /= magnitude;
      normalVelocity = car.vx * normal.x + car.vy * normal.y;
      if (normalVelocity < 0) {
        const impulse = (1 + 0.35) * normalVelocity;
        car.vx -= normal.x * impulse;
        car.vy -= normal.y * impulse;
      }
    }
  }

  // Circle contacts use a normal impulse plus a small positional correction.
  function resolveVehicleCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minimumDistance = a.radius + b.radius;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimumDistance * minimumDistance) return;

    const distance = Math.sqrt(distanceSquared) || 0.001;
    const normal = distanceSquared === 0
      ? { x: Math.cos(a.heading), y: Math.sin(a.heading) }
      : { x: dx / distance, y: dy / distance };
    const overlap = minimumDistance - distance;
    const inverseMassA = 1 / a.mass;
    const inverseMassB = 1 / b.mass;
    const correction = (Math.max(overlap - 0.08, 0) * 0.72) / (inverseMassA + inverseMassB);
    a.x -= normal.x * correction * inverseMassA;
    a.y -= normal.y * correction * inverseMassA;
    b.x += normal.x * correction * inverseMassB;
    b.y += normal.y * correction * inverseMassB;

    const relativeVelocity = { x: b.vx - a.vx, y: b.vy - a.vy };
    const closingSpeed = dot(relativeVelocity, normal);
    if (closingSpeed >= 0) return;

    const restitution = 0.26;
    const impulseSize = (-(1 + restitution) * closingSpeed) / (inverseMassA + inverseMassB);
    const impulse = { x: normal.x * impulseSize, y: normal.y * impulseSize };
    a.vx -= impulse.x * inverseMassA;
    a.vy -= impulse.y * inverseMassA;
    b.vx += impulse.x * inverseMassB;
    b.vy += impulse.y * inverseMassB;
  }

  function updateRaceProgress(car) {
    if (car.finished) return;
    const checkpoint = checkpoints[car.nextCheckpoint];
    const dx = car.x - checkpoint.x;
    const dy = car.y - checkpoint.y;
    if (dx * dx + dy * dy > 58 * 58) return;

    car.passedCheckpoints += 1;
    if (car.nextCheckpoint === 0) {
      if (car.lap === MAX_LAPS) {
        car.finished = true;
        car.finishTime = raceTime;
      } else {
        car.lap += 1;
      }
    }
    car.nextCheckpoint = (car.nextCheckpoint + 1) % CHECKPOINT_COUNT;
  }

  function raceScore(car) {
    const checkpoint = checkpoints[car.nextCheckpoint];
    const distanceToNext = Math.hypot(car.x - checkpoint.x, car.y - checkpoint.y);
    const checkpointFraction = 1 - clamp(distanceToNext / 400, 0, 0.95);
    const finishedBonus = car.finished ? 100000 - car.finishTime : 0;
    return finishedBonus + car.passedCheckpoints + checkpointFraction;
  }

  function standings() {
    return [...vehicles].sort((a, b) => raceScore(b) - raceScore(a));
  }

  function updateHud() {
    const rank = standings().findIndex((car) => car === player) + 1;
    lapElement.textContent = `${Math.min(player.lap, MAX_LAPS)} / ${MAX_LAPS}`;
    timeElement.textContent = formatTime(player.finished ? player.finishTime : raceTime);
    positionElement.textContent = ordinal(rank);
    stateElement.textContent = finished ? "Race complete" : `Checkpoint ${player.nextCheckpoint + 1} / ${CHECKPOINT_COUNT}`;
  }

  function completeRace() {
    if (finished) return;
    finished = true;
    const rank = standings().findIndex((car) => car === player) + 1;
    finishTitle.textContent = `${ordinal(rank)} PLACE`;
    finishDetail.textContent = `Final time ${formatTime(player.finishTime)}`;
    finishOverlay.classList.add("visible");
  }

  function step(dt) {
    simulationTime += dt;
    if (!finished) raceTime += dt;

    for (const car of vehicles) updateVehicle(car, dt);
    for (const car of vehicles) resolveTrackCollision(car);

    for (let first = 0; first < vehicles.length; first += 1) {
      for (let second = first + 1; second < vehicles.length; second += 1) {
        resolveVehicleCollision(vehicles[first], vehicles[second]);
      }
    }
    for (const car of vehicles) {
      resolveTrackCollision(car);
      updateRaceProgress(car);
    }

    if (player.finished) completeRace();
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    const scale = Math.min(bounds.width / WORLD.width, bounds.height / WORLD.height);
    viewport = {
      width: bounds.width,
      height: bounds.height,
      scale,
      x: (bounds.width - WORLD.width * scale) / 2,
      y: (bounds.height - WORLD.height * scale) / 2,
      pixelRatio,
    };
  }

  function drawTerrain() {
    const background = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    background.addColorStop(0, "#205b50");
    background.addColorStop(1, "#103a35");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    for (const fleck of terrain.flecks) {
      ctx.globalAlpha = fleck.alpha;
      ctx.fillStyle = fleck.tone;
      ctx.fillRect(fleck.x, fleck.y, fleck.size, fleck.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawTrack() {
    const outerRx = TRACK.rx + TRACK.halfWidth;
    const outerRy = TRACK.ry + TRACK.halfWidth;
    const innerRx = TRACK.rx - TRACK.halfWidth;
    const innerRy = TRACK.ry - TRACK.halfWidth;

    ctx.save();
    ctx.translate(0, 7);
    ctx.fillStyle = "rgba(1, 12, 13, 0.33)";
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, outerRx + 5, outerRy + 5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    const asphalt = ctx.createRadialGradient(TRACK.x, TRACK.y, 100, TRACK.x, TRACK.y, 580);
    asphalt.addColorStop(0, "#3b464a");
    asphalt.addColorStop(1, "#252f34");
    ctx.fillStyle = asphalt;
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, outerRx, outerRy, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#194d44";
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, innerRx, innerRy, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = "rgba(225, 245, 236, 0.42)";
    ctx.lineWidth = 2;
    ctx.setLineDash([13, 17]);
    ctx.lineDashOffset = -(simulationTime * 35);
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, TRACK.rx, TRACK.ry, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    drawCurb(outerRx, outerRy);
    drawCurb(innerRx, innerRy);
    drawStartLine();
  }

  function drawCurb(rx, ry) {
    ctx.save();
    ctx.lineWidth = 13;
    ctx.strokeStyle = "#e8ece4";
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "#d45455";
    ctx.setLineDash([20, 20]);
    ctx.lineDashOffset = 8;
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawStartLine() {
    const x = TRACK.x + TRACK.rx;
    const top = TRACK.y - TRACK.halfWidth + 3;
    const cell = 10;
    for (let row = 0; row < 14; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        ctx.fillStyle = (row + column) % 2 === 0 ? "#f5f7f0" : "#1b2528";
        ctx.fillRect(x - 10 + column * cell, top + row * cell, cell, cell);
      }
    }
  }

  function drawTrees() {
    for (const tree of terrain.trees) {
      ctx.fillStyle = "rgba(2, 28, 27, 0.24)";
      ctx.beginPath();
      ctx.ellipse(tree.x + 3, tree.y + 4, tree.radius * 1.1, tree.radius * 0.65, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = tree.shade;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = tree.highlight;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(tree.x - tree.radius * 0.22, tree.y - tree.radius * 0.26, tree.radius * 0.52, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // A quiet central landmark makes the infield legible at speed.
    ctx.fillStyle = "#123b37";
    ctx.beginPath();
    ctx.ellipse(TRACK.x, TRACK.y, 78, 38, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1f6255";
    ctx.beginPath();
    ctx.ellipse(TRACK.x - 8, TRACK.y - 7, 49, 20, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#d4a947";
    ctx.font = "800 11px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("NORTHSHORE", TRACK.x, TRACK.y + 4);
  }

  function drawCar(car) {
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > 60 && car.skid > 0.35) {
      ctx.save();
      ctx.globalAlpha = 0.11 + car.skid * 0.11;
      ctx.strokeStyle = "#101416";
      ctx.lineWidth = 3;
      const rearX = car.x - Math.cos(car.heading) * 15;
      const rearY = car.y - Math.sin(car.heading) * 15;
      const sideX = -Math.sin(car.heading) * 8;
      const sideY = Math.cos(car.heading) * 8;
      ctx.beginPath();
      ctx.moveTo(rearX + sideX, rearY + sideY);
      ctx.lineTo(rearX + sideX - car.vx * 0.09, rearY + sideY - car.vy * 0.09);
      ctx.moveTo(rearX - sideX, rearY - sideY);
      ctx.lineTo(rearX - sideX - car.vx * 0.09, rearY - sideY - car.vy * 0.09);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(car.x + 3, car.y + 5);
    ctx.rotate(car.heading);
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 13, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);

    ctx.fillStyle = "#11191c";
    ctx.fillRect(-12, -14, 9, 5);
    ctx.fillRect(-12, 9, 9, 5);
    ctx.fillRect(9, -14, 9, 5);
    ctx.fillRect(9, 9, 9, 5);

    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(15, -10);
    ctx.lineTo(-13, -10);
    ctx.lineTo(-20, -5);
    ctx.lineTo(-20, 5);
    ctx.lineTo(-13, 10);
    ctx.lineTo(15, 10);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = car.isPlayer ? 2.5 : 1.3;
    ctx.strokeStyle = car.isPlayer ? "#fff3be" : "rgba(255, 255, 255, 0.7)";
    ctx.stroke();

    ctx.fillStyle = "#193640";
    ctx.beginPath();
    ctx.moveTo(8, -7);
    ctx.lineTo(14, -3);
    ctx.lineTo(14, 3);
    ctx.lineTo(8, 7);
    ctx.lineTo(-5, 7);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-5, -7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(205, 246, 255, 0.7)";
    ctx.fillRect(-3, -5, 8, 10);

    ctx.fillStyle = car.accent;
    ctx.fillRect(-18, -2, 35, 4);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillRect(17, -5, 3, 3);
    ctx.fillRect(17, 2, 3, 3);
    ctx.restore();

    ctx.save();
    ctx.font = "800 10px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(3, 16, 17, 0.72)";
    ctx.fillRect(car.x - 22, car.y - 32, 44, 14);
    ctx.fillStyle = car.isPlayer ? "#ffe49a" : "#e6f5ee";
    ctx.fillText(car.isPlayer ? "YOU" : car.name.toUpperCase(), car.x, car.y - 21);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#071112";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      viewport.pixelRatio * viewport.scale,
      0,
      0,
      viewport.pixelRatio * viewport.scale,
      viewport.pixelRatio * viewport.x,
      viewport.pixelRatio * viewport.y,
    );

    drawTerrain();
    drawTrack();
    drawTrees();
    [...vehicles].sort((a, b) => a.y - b.y).forEach(drawCar);
    updateHud();
  }

  function frame(nowMilliseconds) {
    const now = nowMilliseconds / 1000;
    accumulator += Math.min(now - lastFrame, MAX_FRAME_TIME);
    lastFrame = now;
    while (accumulator >= FIXED_DT) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      event.preventDefault();
      pressed.add(event.code);
    }
  });
  window.addEventListener("keyup", (event) => pressed.delete(event.code));
  window.addEventListener("blur", () => pressed.clear());
  window.addEventListener("resize", resize);
  restartButton.addEventListener("click", resetRace);

  resize();
  resetRace();
  requestAnimationFrame(frame);
})();
