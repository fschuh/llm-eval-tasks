(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const ui = {
    lap: document.getElementById("lapValue"),
    time: document.getElementById("timeValue"),
    best: document.getElementById("bestLapValue"),
    position: document.getElementById("positionValue"),
    suffix: document.getElementById("positionSuffix"),
    overlay: document.getElementById("messageOverlay"),
    kicker: document.getElementById("messageKicker"),
    message: document.getElementById("messageValue"),
    detail: document.getElementById("messageDetail"),
    restart: document.getElementById("restartButton"),
    pause: document.getElementById("pauseButton"),
    sound: document.getElementById("soundButton"),
    dots: [...document.querySelectorAll(".lap-dots i")]
  };

  const WORLD = { width: 1600, height: 900 };
  const FIXED_DT = 1 / 120;
  const MAX_FRAME = 0.1;
  const TOTAL_LAPS = 3;
  const ROAD_HALF_WIDTH = 104;
  const RNG_SEED = 0x00c0ffee;
  const CAR_RADIUS = 23;
  const checkpoints = [0, 3, 6, 9];
  const centerline = [
    { x: 800, y: 758 },
    { x: 545, y: 742 },
    { x: 325, y: 650 },
    { x: 213, y: 480 },
    { x: 252, y: 293 },
    { x: 438, y: 170 },
    { x: 704, y: 121 },
    { x: 1008, y: 139 },
    { x: 1260, y: 250 },
    { x: 1384, y: 431 },
    { x: 1325, y: 617 },
    { x: 1108, y: 730 }
  ];

  class SeededRandom {
    constructor(seed) { this.state = seed >>> 0 || 1; }
    next() {
      let x = this.state;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.state = x >>> 0;
      return this.state / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const length = (x, y) => Math.hypot(x, y);
  const normalizeAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const ordinal = n => (n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH");

  function formatTime(seconds) {
    const safe = Math.max(0, seconds);
    const minutes = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.floor((safe - Math.floor(safe)) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  function closestOnTrack(x, y) {
    let best = null;
    let accumulated = 0;
    let bestProgress = 0;
    let totalLength = 0;

    for (let i = 0; i < centerline.length; i++) {
      const a = centerline[i];
      const b = centerline[(i + 1) % centerline.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const segmentLength = Math.hypot(abx, aby);
      const t = clamp(((x - a.x) * abx + (y - a.y) * aby) / (segmentLength * segmentLength), 0, 1);
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const dx = x - px;
      const dy = y - py;
      const distanceSq = dx * dx + dy * dy;
      if (!best || distanceSq < best.distanceSq) {
        best = { x: px, y: py, dx, dy, distanceSq, segment: i, t };
        bestProgress = accumulated + segmentLength * t;
      }
      accumulated += segmentLength;
      totalLength += segmentLength;
    }
    best.progress = bestProgress;
    best.totalLength = totalLength;
    return best;
  }

  function trackPoint(index, laneOffset = 0) {
    const point = centerline[index % centerline.length];
    const prev = centerline[(index - 1 + centerline.length) % centerline.length];
    const next = centerline[(index + 1) % centerline.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const mag = Math.hypot(tx, ty) || 1;
    return { x: point.x - ty / mag * laneOffset, y: point.y + tx / mag * laneOffset };
  }

  function makeCar(config) {
    return {
      id: config.id,
      name: config.name,
      color: config.color,
      stripe: config.stripe,
      isPlayer: Boolean(config.isPlayer),
      x: config.x,
      y: config.y,
      prevX: config.x,
      prevY: config.y,
      renderX: config.x,
      renderY: config.y,
      angle: Math.PI,
      prevAngle: Math.PI,
      vx: 0,
      vy: 0,
      angularVelocity: 0,
      radius: CAR_RADIUS,
      mass: 1,
      input: { throttle: 0, brake: 0, steer: 0, handbrake: false },
      waypoint: 1,
      lane: config.lane || 0,
      skill: config.skill || 1,
      caution: config.caution || 1,
      completedLaps: 0,
      lap: 1,
      checkpointCursor: 1,
      wasNearCheckpoint: false,
      finished: false,
      finishTime: Infinity,
      currentLapStart: 0,
      lapTimes: [],
      bestLap: Infinity,
      progress: 0,
      totalProgress: 0,
      position: 1,
      collisionFlash: 0,
      skid: 0
    };
  }

  let cars = [];
  let player = null;
  let decorations = [];
  let skidMarks = [];
  let raceTime = 0;
  let countdown = 3.5;
  let raceState = "countdown";
  let pausedFrom = "racing";
  let lastTimestamp = performance.now();
  let accumulator = 0;
  let soundEnabled = true;
  let audioContext = null;
  let engineOscillator = null;
  let engineGain = null;
  let lastCountdownNumber = 4;
  let view = { scale: 1, x: 0, y: 0, width: WORLD.width, height: WORLD.height, dpr: 1 };
  const keys = new Set();
  const touch = { left: false, right: false, throttle: false, brake: false };

  function createDecorations() {
    const rng = new SeededRandom(RNG_SEED ^ 0x51a9d3);
    const items = [];
    let attempts = 0;
    while (items.length < 74 && attempts++ < 1500) {
      const x = rng.range(45, WORLD.width - 45);
      const y = rng.range(45, WORLD.height - 45);
      const track = closestOnTrack(x, y);
      if (Math.sqrt(track.distanceSq) < ROAD_HALF_WIDTH + 62) continue;
      items.push({
        x, y,
        size: rng.range(10, 22),
        kind: rng.next() > 0.22 ? "tree" : "rock",
        shade: rng.next()
      });
    }
    return items;
  }

  function resetRace() {
    const rng = new SeededRandom(RNG_SEED);
    const grid = [
      { x: 902, y: 716 },
      { x: 940, y: 788 },
      { x: 1006, y: 708 },
      { x: 1048, y: 784 }
    ];
    player = makeCar({ id: 0, name: "YOU", color: "#51e3ba", stripe: "#eafff7", isPlayer: true, ...grid[0], lane: -18 });
    cars = [player];
    const rivals = [
      { name: "KITE", color: "#ff5942", stripe: "#ffe8bd", lane: 30 },
      { name: "NOVA", color: "#f0d44d", stripe: "#2b3031", lane: -38 },
      { name: "VEX", color: "#aa81ff", stripe: "#f2eaff", lane: 42 }
    ];
    rivals.forEach((rival, i) => {
      cars.push(makeCar({
        id: i + 1,
        ...rival,
        ...grid[i + 1],
        skill: rng.range(0.94, 1.075),
        caution: rng.range(0.88, 1.12)
      }));
    });
    decorations = createDecorations();
    skidMarks = [];
    raceTime = 0;
    countdown = 3.5;
    raceState = "countdown";
    lastCountdownNumber = 4;
    accumulator = 0;
    keys.clear();
    Object.keys(touch).forEach(k => { touch[k] = false; });
    ui.overlay.className = "message-overlay";
    ui.kicker.textContent = "GET READY";
    ui.message.textContent = "3";
    ui.detail.textContent = "Three laps. Leave nothing on the tarmac.";
    updateHUD();
    canvas.focus({ preventScroll: true });
  }

  function userInput() {
    const left = keys.has("ArrowLeft") || keys.has("KeyA") || touch.left;
    const right = keys.has("ArrowRight") || keys.has("KeyD") || touch.right;
    const throttle = keys.has("ArrowUp") || keys.has("KeyW") || touch.throttle;
    const brake = keys.has("ArrowDown") || keys.has("KeyS") || touch.brake;
    player.input.steer = (right ? 1 : 0) - (left ? 1 : 0);
    player.input.throttle = throttle ? 1 : 0;
    player.input.brake = brake ? 1 : 0;
    player.input.handbrake = keys.has("Space");
  }

  function aiInput(car) {
    let target = trackPoint(car.waypoint, car.lane);
    let dx = target.x - car.x;
    let dy = target.y - car.y;
    let distance = Math.hypot(dx, dy);
    const switchDistance = 82 + Math.min(75, Math.hypot(car.vx, car.vy) * 0.18);
    if (distance < switchDistance) {
      car.waypoint = (car.waypoint + 1) % centerline.length;
      target = trackPoint(car.waypoint, car.lane);
      dx = target.x - car.x;
      dy = target.y - car.y;
      distance = Math.hypot(dx, dy);
    }

    let desiredAngle = Math.atan2(dy, dx);
    for (const other of cars) {
      if (other === car) continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const forward = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = -ox * Math.sin(car.angle) + oy * Math.cos(car.angle);
      if (forward > 0 && forward < 105 && Math.abs(side) < 43) {
        desiredAngle += (side >= 0 ? -1 : 1) * (0.24 + (105 - forward) * 0.002);
      }
    }

    const angleError = normalizeAngle(desiredAngle - car.angle);
    const speed = Math.hypot(car.vx, car.vy);
    const next = trackPoint((car.waypoint + 1) % centerline.length, car.lane);
    const cornerAngle = Math.abs(normalizeAngle(Math.atan2(next.y - target.y, next.x - target.x) - desiredAngle));
    const targetSpeed = lerp(390, 265, clamp(cornerAngle / 1.2, 0, 1)) * car.skill;
    car.input.steer = clamp(angleError * 2.65, -1, 1);
    car.input.throttle = speed < targetSpeed ? 1 : 0.2;
    car.input.brake = speed > targetSpeed + 30 ? clamp((speed - targetSpeed) / 80, 0, 1) : 0;
    car.input.handbrake = cornerAngle > 0.75 && speed > 300 && Math.abs(angleError) > 0.28;
  }

  function integrateCar(car, dt) {
    car.prevX = car.x;
    car.prevY = car.y;
    car.prevAngle = car.angle;

    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    let forwardSpeed = car.vx * cos + car.vy * sin;
    let lateralSpeed = car.vx * -sin + car.vy * cos;
    const movingForward = forwardSpeed > -8;
    const enginePower = car.isPlayer ? 292 : 280 * car.skill;
    const maxSpeed = car.isPlayer ? 430 : 417 * car.skill;

    if (car.input.throttle) forwardSpeed += enginePower * car.input.throttle * dt;
    if (car.input.brake) {
      if (forwardSpeed > 12) forwardSpeed -= 430 * car.input.brake * dt;
      else forwardSpeed -= 145 * car.input.brake * dt;
    }

    const drag = 0.38 + Math.abs(forwardSpeed) * 0.0017;
    forwardSpeed *= Math.max(0, 1 - drag * dt);
    forwardSpeed = clamp(forwardSpeed, -126, maxSpeed);

    const grip = car.input.handbrake ? 2.3 : 8.8;
    lateralSpeed *= Math.max(0, 1 - grip * dt);
    car.skid = Math.abs(lateralSpeed) + (car.input.handbrake ? Math.abs(forwardSpeed) * 0.1 : 0);

    const speedRatio = clamp(Math.abs(forwardSpeed) / 175, 0.12, 1.35);
    const reverseDirection = movingForward ? 1 : -1;
    const steerRate = car.input.steer * 2.05 * speedRatio * reverseDirection;
    car.angularVelocity = lerp(car.angularVelocity, steerRate, clamp(9 * dt, 0, 1));
    car.angle = normalizeAngle(car.angle + car.angularVelocity * dt);

    const newCos = Math.cos(car.angle);
    const newSin = Math.sin(car.angle);
    car.vx = newCos * forwardSpeed - newSin * lateralSpeed;
    car.vy = newSin * forwardSpeed + newCos * lateralSpeed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.collisionFlash = Math.max(0, car.collisionFlash - dt * 4);

    if (car.skid > 48 && Math.abs(forwardSpeed) > 130 && skidMarks.length < 1000) {
      const rear = 20;
      const side = 11;
      const rx = car.x - newCos * rear;
      const ry = car.y - newSin * rear;
      skidMarks.push({ x1: rx + newSin * side, y1: ry - newCos * side, x2: rx - newSin * side, y2: ry + newCos * side, life: 1 });
    }
  }

  function resolveTrackCollision(car) {
    const track = closestOnTrack(car.x, car.y);
    const distance = Math.sqrt(track.distanceSq);
    const limit = ROAD_HALF_WIDTH - car.radius * 0.72;
    if (distance <= limit) return;

    let nx = track.dx / distance;
    let ny = track.dy / distance;
    if (!Number.isFinite(nx)) { nx = 1; ny = 0; }
    const penetration = distance - limit;
    car.x -= nx * penetration;
    car.y -= ny * penetration;
    const outwardVelocity = car.vx * nx + car.vy * ny;
    if (outwardVelocity > 0) {
      const impulse = outwardVelocity * 1.28;
      car.vx -= nx * impulse;
      car.vy -= ny * impulse;
      car.angularVelocity += ((car.vx * ny - car.vy * nx) > 0 ? 1 : -1) * Math.min(1.5, outwardVelocity * 0.006);
      car.collisionFlash = Math.min(1, outwardVelocity / 180);
    }
  }

  function resolveCarCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDistance = a.radius + b.radius;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= minDistance * minDistance) return;

    const distance = Math.sqrt(distanceSq) || 0.001;
    const nx = dx / distance;
    const ny = dy / distance;
    const penetration = minDistance - distance;
    a.x -= nx * penetration * 0.5;
    a.y -= ny * penetration * 0.5;
    b.x += nx * penetration * 0.5;
    b.y += ny * penetration * 0.5;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const normalVelocity = rvx * nx + rvy * ny;
    if (normalVelocity >= 0) return;

    const restitution = 0.28;
    const normalImpulse = -(1 + restitution) * normalVelocity / (1 / a.mass + 1 / b.mass);
    const ix = normalImpulse * nx;
    const iy = normalImpulse * ny;
    a.vx -= ix / a.mass;
    a.vy -= iy / a.mass;
    b.vx += ix / b.mass;
    b.vy += iy / b.mass;

    const tx = -ny;
    const ty = nx;
    const tangentVelocity = rvx * tx + rvy * ty;
    const tangentImpulse = clamp(-tangentVelocity / 2, -normalImpulse * 0.32, normalImpulse * 0.32);
    a.vx -= tx * tangentImpulse / a.mass;
    a.vy -= ty * tangentImpulse / a.mass;
    b.vx += tx * tangentImpulse / b.mass;
    b.vy += ty * tangentImpulse / b.mass;
    a.angularVelocity -= tangentImpulse * 0.004;
    b.angularVelocity += tangentImpulse * 0.004;
    a.collisionFlash = b.collisionFlash = Math.min(1, -normalVelocity / 140);
  }

  function updateLap(car) {
    if (car.finished) return;
    const checkpointIndex = checkpoints[car.checkpointCursor];
    const checkpoint = centerline[checkpointIndex];
    const distance = Math.hypot(car.x - checkpoint.x, car.y - checkpoint.y);
    const near = distance < 92;

    if (near && !car.wasNearCheckpoint) {
      car.checkpointCursor = (car.checkpointCursor + 1) % checkpoints.length;
      if (car.checkpointCursor === 1) {
        car.completedLaps++;
        const lapTime = raceTime - car.currentLapStart;
        car.lapTimes.push(lapTime);
        car.bestLap = Math.min(car.bestLap, lapTime);
        car.currentLapStart = raceTime;
        if (car.completedLaps >= TOTAL_LAPS) {
          car.finished = true;
          car.finishTime = raceTime;
          car.lap = TOTAL_LAPS;
        } else {
          car.lap = car.completedLaps + 1;
        }
      }
    }
    car.wasNearCheckpoint = near;

    const track = closestOnTrack(car.x, car.y);
    car.progress = track.progress / track.totalLength;
    // The grid sits just before the timing line. Keep that launch segment
    // negative so crossing the line cannot momentarily scramble the order.
    if (car.completedLaps === 0 && car.checkpointCursor === 1 && car.progress > 0.75) car.progress -= 1;
    car.totalProgress = car.completedLaps + car.progress;
    if (car.finished) car.totalProgress = TOTAL_LAPS + (TOTAL_LAPS - car.finishTime) * 0.000001;
  }

  function updatePositions() {
    const ordered = [...cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
    ordered.forEach((car, index) => { car.position = index + 1; });
  }

  function fixedUpdate(dt) {
    if (raceState === "paused" || raceState === "finished") return;

    if (raceState === "countdown") {
      countdown -= dt;
      const shown = Math.max(1, Math.ceil(countdown - 0.5));
      if (shown !== lastCountdownNumber && countdown > 0.5) {
        lastCountdownNumber = shown;
        beep(170 + (3 - shown) * 55, 0.06, 0.035);
      }
      if (countdown <= 0.5) {
        raceState = "racing";
        raceTime = 0;
        cars.forEach(car => { car.currentLapStart = 0; });
        ui.kicker.textContent = "";
        ui.message.textContent = "GO!";
        ui.detail.textContent = "";
        beep(420, 0.16, 0.055);
        window.setTimeout(() => {
          if (raceState === "racing") ui.overlay.classList.add("hidden");
        }, 520);
      }
    } else if (raceState === "racing") {
      raceTime += dt;
    }

    userInput();
    if (raceState !== "racing") {
      player.input.throttle = 0;
      player.input.brake = 0;
    }
    for (const car of cars) {
      if (!car.isPlayer) {
        aiInput(car);
        if (raceState !== "racing") { car.input.throttle = 0; car.input.brake = 0; }
      }
      if (car.finished && !car.isPlayer) car.input.throttle = 0.35;
      integrateCar(car, dt);
      resolveTrackCollision(car);
    }

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) resolveCarCollision(cars[i], cars[j]);
      }
    }

    if (raceState === "racing") cars.forEach(updateLap);
    else cars.forEach(car => {
      const track = closestOnTrack(car.x, car.y);
      car.progress = track.progress / track.totalLength;
      if (car.completedLaps === 0 && car.checkpointCursor === 1 && car.progress > 0.75) car.progress -= 1;
      car.totalProgress = car.completedLaps + car.progress;
    });
    updatePositions();
    if (player.finished && raceState !== "finished") finishRace();

    for (const mark of skidMarks) mark.life -= dt * 0.015;
    if (skidMarks.length > 900) skidMarks.splice(0, 200);
  }

  function finishRace() {
    raceState = "finished";
    const place = player.position;
    ui.overlay.className = "message-overlay finished";
    ui.kicker.textContent = "RACE COMPLETE";
    ui.message.textContent = `${place}${ordinal(place)}`;
    ui.detail.textContent = `Total time ${formatTime(player.finishTime)} · Best lap ${formatTime(player.bestLap)}`;
    beep(place === 1 ? 520 : 320, 0.3, 0.06);
  }

  function togglePause() {
    if (raceState === "finished") return;
    if (raceState === "paused") {
      raceState = pausedFrom;
      ui.overlay.className = raceState === "countdown" ? "message-overlay" : "message-overlay hidden";
      ui.pause.setAttribute("aria-label", "Pause race");
      lastTimestamp = performance.now();
    } else {
      pausedFrom = raceState;
      raceState = "paused";
      ui.overlay.className = "message-overlay finished paused";
      ui.kicker.textContent = "SIMULATION HALTED";
      ui.message.textContent = "PAUSED";
      ui.detail.textContent = "Press P or the pause button to continue.";
      ui.pause.setAttribute("aria-label", "Resume race");
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const cssScale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
    view = {
      scale: cssScale * dpr,
      x: (width - WORLD.width * cssScale * dpr) * 0.5,
      y: (height - WORLD.height * cssScale * dpr) * 0.5,
      width,
      height,
      dpr
    };
  }

  function roundedRect(context, x, y, w, h, r) {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    gradient.addColorStop(0, "#28483d");
    gradient.addColorStop(1, "#1b3832");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#d8e8cf";
    for (let y = 0; y < WORLD.height; y += 34) {
      for (let x = (Math.floor(y / 34) % 2) * 17; x < WORLD.width; x += 34) {
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }
    ctx.globalAlpha = 1;

    for (const item of decorations) {
      if (item.kind === "tree") {
        ctx.fillStyle = "rgba(5,18,16,.22)";
        ctx.beginPath(); ctx.ellipse(item.x + 7, item.y + 8, item.size * 1.08, item.size * .72, .45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = item.shade > .5 ? "#17372e" : "#21483a";
        ctx.beginPath(); ctx.arc(item.x, item.y, item.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = item.shade > .5 ? "#2c5a43" : "#37634a";
        ctx.beginPath(); ctx.arc(item.x - item.size * .22, item.y - item.size * .25, item.size * .63, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#496057";
        ctx.beginPath();
        ctx.moveTo(item.x - item.size, item.y + item.size * .4);
        ctx.lineTo(item.x - item.size * .4, item.y - item.size * .65);
        ctx.lineTo(item.x + item.size * .7, item.y - item.size * .35);
        ctx.lineTo(item.x + item.size, item.y + item.size * .5);
        ctx.closePath(); ctx.fill();
      }
    }

    drawBuilding(655, 356, 300, 175);
    drawBuilding(742, 580, 130, 66, true);
  }

  function drawBuilding(x, y, w, h, pit = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(3,15,18,.24)";
    ctx.fillRect(12, 14, w, h);
    ctx.fillStyle = pit ? "#d6ded5" : "#e1e6dc";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#152c33";
    ctx.fillRect(10, 10, w - 20, h - 20);
    if (!pit) {
      ctx.fillStyle = "#21414a";
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) ctx.fillRect(22 + col * 44, 23 + row * 41, 28, 23);
      }
      ctx.fillStyle = "#ff5a41";
      ctx.fillRect(w - 15, 0, 15, h);
      ctx.save();
      ctx.translate(w / 2, h - 11);
      ctx.fillStyle = "#90aaa5";
      ctx.font = "800 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("SLIPSTREAM RACING CLUB", 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = "#ff523d";
      for (let i = 0; i < 3; i++) ctx.fillRect(10 + i * 41, 14, 31, h - 28);
    }
    ctx.restore();
  }

  function strokeTrack(width, color, dash = []) {
    ctx.beginPath();
    ctx.moveTo(centerline[0].x, centerline[0].y);
    for (let i = 1; i < centerline.length; i++) ctx.lineTo(centerline[i].x, centerline[i].y);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTrack() {
    strokeTrack(ROAD_HALF_WIDTH * 2 + 28, "rgba(4,13,16,.27)");
    strokeTrack(ROAD_HALF_WIDTH * 2 + 14, "#d7ded6");
    strokeTrack(ROAD_HALF_WIDTH * 2 + 2, "#d24c3c", [22, 22]);
    strokeTrack(ROAD_HALF_WIDTH * 2 - 16, "#2b3437");
    strokeTrack(3, "rgba(226,231,220,.23)", [18, 22]);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#0b1113";
    ctx.lineWidth = 1;
    for (let i = 0; i < 15; i++) {
      const offset = (i - 7) * 11;
      ctx.beginPath();
      const first = trackPoint(0, offset);
      ctx.moveTo(first.x, first.y);
      for (let j = 1; j < centerline.length; j++) {
        const p = trackPoint(j, offset);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(8,11,12,.28)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (const mark of skidMarks) {
      ctx.globalAlpha = clamp(mark.life, 0, 1) * 0.42;
      ctx.beginPath(); ctx.moveTo(mark.x1, mark.y1); ctx.lineTo(mark.x2, mark.y2); ctx.stroke();
    }
    ctx.restore();

    drawStartLine();
    drawTrackLabels();
  }

  function drawStartLine() {
    const p = centerline[0];
    const prev = centerline[centerline.length - 1];
    const next = centerline[1];
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const rows = 10;
    const cell = 18;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? "#f1f1e8" : "#172023";
        ctx.fillRect(-cell, -rows * cell / 2 + row * cell, cell, cell);
        ctx.fillStyle = (row + col + 1) % 2 ? "#f1f1e8" : "#172023";
        ctx.fillRect(0, -rows * cell / 2 + row * cell, cell, cell);
      }
    }
    ctx.restore();
  }

  function drawTrackLabels() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.font = "900 12px system-ui";
    ctx.letterSpacing = "3px";
    ctx.textAlign = "center";
    ctx.translate(1150, 208);
    ctx.rotate(.4);
    ctx.fillText("TURN 8", 0, 0);
    ctx.restore();
  }

  function drawCar(car, alpha) {
    const x = lerp(car.prevX, car.x, alpha);
    const y = lerp(car.prevY, car.y, alpha);
    const angleDelta = normalizeAngle(car.angle - car.prevAngle);
    const angle = car.prevAngle + angleDelta * alpha;
    car.renderX = x;
    car.renderY = y;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(2,7,9,.35)";
    roundedRect(ctx, -26 + 4, -15 + 5, 52, 30, 8); ctx.fill();

    ctx.fillStyle = "#10171a";
    ctx.fillRect(-18, -18, 12, 6);
    ctx.fillRect(10, -18, 12, 6);
    ctx.fillRect(-18, 12, 12, 6);
    ctx.fillRect(10, 12, 12, 6);

    const bodyGradient = ctx.createLinearGradient(-28, 0, 28, 0);
    bodyGradient.addColorStop(0, car.color);
    bodyGradient.addColorStop(.55, car.color);
    bodyGradient.addColorStop(1, car.collisionFlash > 0.1 ? "#ffffff" : car.color);
    ctx.fillStyle = bodyGradient;
    roundedRect(ctx, -28, -14, 56, 28, 8); ctx.fill();

    ctx.fillStyle = car.stripe;
    ctx.fillRect(-15, -14, 6, 28);
    ctx.fillStyle = "rgba(9,25,30,.88)";
    roundedRect(ctx, -6, -11, 19, 22, 5); ctx.fill();
    ctx.fillStyle = "rgba(184,230,226,.42)";
    ctx.fillRect(-3, -9, 3, 18);

    ctx.fillStyle = "#eff8e9";
    ctx.fillRect(25, -9, 3, 6);
    ctx.fillRect(25, 3, 3, 6);
    ctx.fillStyle = "#f44135";
    ctx.fillRect(-28, -9, 3, 5);
    ctx.fillRect(-28, 4, 3, 5);

    if (car.isPlayer) {
      ctx.strokeStyle = "rgba(81,227,186,.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(-angle);
      ctx.fillStyle = "#eafff7";
      ctx.font = "900 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("YOU", 0, -34);
    }
    ctx.restore();
  }

  function drawMinimap() {
    const x = 55;
    const y = WORLD.height - 165;
    const scale = .115;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = .74;
    ctx.beginPath();
    ctx.moveTo(centerline[0].x - 160, centerline[0].y - 85);
    for (let i = 1; i < centerline.length; i++) ctx.lineTo(centerline[i].x - 160, centerline[i].y - 85);
    ctx.closePath();
    ctx.lineWidth = 42;
    ctx.strokeStyle = "rgba(9,25,30,.8)";
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(210,225,216,.7)";
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const car of cars) {
      ctx.fillStyle = car.isPlayer ? "#51e3ba" : car.color;
      ctx.beginPath();
      ctx.arc((car.renderX || car.x) - 160, (car.renderY || car.y) - 85, car.isPlayer ? 30 : 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render(alpha) {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a171d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawBackground();
    drawTrack();
    const sortedCars = [...cars].sort((a, b) => a.y - b.y);
    for (const car of sortedCars) drawCar(car, alpha);
    drawMinimap();
  }

  function updateHUD() {
    ui.lap.textContent = String(clamp(player?.lap || 1, 1, TOTAL_LAPS));
    ui.time.textContent = formatTime(player?.finished ? player.finishTime : raceTime);
    ui.best.textContent = Number.isFinite(player?.bestLap) ? formatTime(player.bestLap) : "--:--.---";
    ui.position.textContent = String(player?.position || 1);
    ui.suffix.textContent = ordinal(player?.position || 1);
    ui.dots.forEach((dot, index) => dot.classList.toggle("active", index < (player?.lap || 1)));
    if (raceState === "countdown") {
      ui.message.textContent = String(Math.max(1, Math.ceil(countdown - .5)));
    }
  }

  function frame(timestamp) {
    const elapsed = Math.min(MAX_FRAME, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    if (raceState !== "paused") accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      fixedUpdate(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render(accumulator / FIXED_DT);
    updateHUD();
    updateEngineSound();
    requestAnimationFrame(frame);
  }

  function initAudio() {
    if (audioContext || !soundEnabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext = new AudioCtx();
    engineOscillator = audioContext.createOscillator();
    engineGain = audioContext.createGain();
    engineOscillator.type = "sawtooth";
    engineGain.gain.value = 0;
    engineOscillator.connect(engineGain).connect(audioContext.destination);
    engineOscillator.start();
  }

  function updateEngineSound() {
    if (!audioContext || !engineOscillator || !engineGain) return;
    const speed = player ? Math.hypot(player.vx, player.vy) : 0;
    const now = audioContext.currentTime;
    engineOscillator.frequency.setTargetAtTime(45 + speed * 0.34, now, .04);
    const gain = soundEnabled && raceState === "racing" ? 0.009 + (player.input.throttle ? 0.007 : 0) : 0;
    engineGain.gain.setTargetAtTime(gain, now, .05);
  }

  function beep(frequency, duration, volume) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  window.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    if (!event.repeat && event.code === "KeyP") togglePause();
    if (!event.repeat && event.code === "KeyR") resetRace();
    keys.add(event.code);
    initAudio();
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    if (raceState === "racing") togglePause();
  });

  document.querySelectorAll("[data-control]").forEach(button => {
    const control = button.dataset.control;
    const press = event => {
      event.preventDefault();
      touch[control] = true;
      button.classList.add("pressed");
      button.setPointerCapture?.(event.pointerId);
      initAudio();
    };
    const release = event => {
      event.preventDefault();
      touch[control] = false;
      button.classList.remove("pressed");
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", event => { if (event.buttons === 0) release(event); });
  });

  ui.restart.addEventListener("click", resetRace);
  ui.pause.addEventListener("click", togglePause);
  ui.sound.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    ui.sound.classList.toggle("muted", !soundEnabled);
    ui.sound.setAttribute("aria-label", soundEnabled ? "Mute sound" : "Enable sound");
    if (soundEnabled) initAudio();
  });
  canvas.addEventListener("pointerdown", initAudio);
  window.addEventListener("resize", resize);

  resetRace();
  resize();
  requestAnimationFrame(frame);
})();
