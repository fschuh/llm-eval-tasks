(() => {
  "use strict";

  // Neon Apex is intentionally self-contained: no assets, libraries, or physics engines.
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const lapLabel = document.getElementById("lap");
  const timerLabel = document.getElementById("timer");
  const positionLabel = document.getElementById("position");
  const speedLabel = document.getElementById("speed");
  const toast = document.getElementById("toast");

  const WORLD = { width: 1120, height: 720 };
  const FIXED_DT = 1 / 120;
  const TOTAL_LAPS = 3;
  const ROAD_HALF_WIDTH = 72;
  const CAR_RADIUS = 14;
  const TAU = Math.PI * 2;
  const RNG_SEED = 0x5eedc0de;
  let rng = mulberry32(RNG_SEED);

  const keys = new Set();
  const particles = [];
  let track;
  let cars;
  let player;
  let simTime = 0;
  let finished = false;
  let finishFlash = 0;

  function mulberry32(seed) {
    return function nextRandom() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function length(x, y) {
    return Math.hypot(x, y);
  }

  function normalize(x, y) {
    const size = Math.hypot(x, y) || 1;
    return { x: x / size, y: y / size };
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  function wrapIndex(index, count) {
    return ((index % count) + count) % count;
  }

  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    const millis = Math.floor((seconds % 1) * 1000).toString().padStart(3, "0");
    return `${minutes}:${secs}.${millis}`;
  }

  function ordinal(number) {
    const suffix = number % 100 >= 11 && number % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
    return `${number}${suffix}`;
  }

  function catmullRom(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * b) +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3
    );
  }

  function buildTrack() {
    // These control points form a readable road while the spline removes hard corners.
    const control = [
      { x: 245, y: 228 },
      { x: 382, y: 122 },
      { x: 635, y: 105 },
      { x: 848, y: 172 },
      { x: 944, y: 322 },
      { x: 900, y: 498 },
      { x: 720, y: 594 },
      { x: 475, y: 615 },
      { x: 267, y: 553 },
      { x: 145, y: 420 },
      { x: 137, y: 286 },
    ];
    const points = [];
    const samplesPerSection = 16;
    for (let i = 0; i < control.length; i += 1) {
      const a = control[wrapIndex(i - 1, control.length)];
      const b = control[i];
      const c = control[wrapIndex(i + 1, control.length)];
      const d = control[wrapIndex(i + 2, control.length)];
      for (let j = 0; j < samplesPerSection; j += 1) {
        const t = j / samplesPerSection;
        points.push({
          x: catmullRom(a.x, b.x, c.x, d.x, t),
          y: catmullRom(a.y, b.y, c.y, d.y, t),
        });
      }
    }

    const samples = points.map((point, index) => {
      const previous = points[wrapIndex(index - 1, points.length)];
      const next = points[wrapIndex(index + 1, points.length)];
      const tangent = normalize(next.x - previous.x, next.y - previous.y);
      return {
        x: point.x,
        y: point.y,
        tangent,
        normal: { x: -tangent.y, y: tangent.x },
      };
    });

    const outer = samples.map((sample) => ({
      x: sample.x + sample.normal.x * (ROAD_HALF_WIDTH + 10),
      y: sample.y + sample.normal.y * (ROAD_HALF_WIDTH + 10),
    }));
    const inner = samples.map((sample) => ({
      x: sample.x - sample.normal.x * (ROAD_HALF_WIDTH + 10),
      y: sample.y - sample.normal.y * (ROAD_HALF_WIDTH + 10),
    }));

    return { samples, outer, inner };
  }

  function sampleAt(progress, lateral = 0) {
    const count = track.samples.length;
    const wrapped = ((progress % 1) + 1) % 1;
    const exact = wrapped * count;
    const index = Math.floor(exact);
    const nextIndex = wrapIndex(index + 1, count);
    const t = exact - index;
    const a = track.samples[index];
    const b = track.samples[nextIndex];
    const tangent = normalize(lerp(a.tangent.x, b.tangent.x, t), lerp(a.tangent.y, b.tangent.y, t));
    const normal = { x: -tangent.y, y: tangent.x };
    return {
      x: lerp(a.x, b.x, t) + normal.x * lateral,
      y: lerp(a.y, b.y, t) + normal.y * lateral,
      tangent,
      normal,
      index,
    };
  }

  function closestTrackPoint(x, y) {
    let best = { distance: Infinity, progress: 0, x: 0, y: 0, tangent: { x: 1, y: 0 } };
    const points = track.samples;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[wrapIndex(i + 1, points.length)];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const denom = abx * abx + aby * aby || 1;
      const t = clamp(((x - a.x) * abx + (y - a.y) * aby) / denom, 0, 1);
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const dx = x - px;
      const dy = y - py;
      const distance = dx * dx + dy * dy;
      if (distance < best.distance) {
        best = {
          distance,
          progress: (i + t) / points.length,
          x: px,
          y: py,
          tangent: a.tangent,
        };
      }
    }
    best.distance = Math.sqrt(best.distance);
    return best;
  }

  class Car {
    constructor(options) {
      Object.assign(this, {
        id: options.id,
        name: options.name,
        color: options.color,
        accent: options.accent,
        isPlayer: Boolean(options.isPlayer),
        lateral: options.lateral || 0,
        skill: options.skill || 1,
        radius: CAR_RADIUS,
        mass: options.isPlayer ? 1.15 : 1,
        maxSpeed: options.isPlayer ? 300 : 255 + options.skill * 17,
        acceleration: options.isPlayer ? 206 : 170 + options.skill * 20,
        braking: options.isPlayer ? 318 : 245,
        turnRate: options.isPlayer ? 2.72 : 2.48,
      });
      const start = sampleAt(options.startProgress, this.lateral);
      this.x = start.x;
      this.y = start.y;
      this.previousX = this.x;
      this.previousY = this.y;
      this.vx = 0;
      this.vy = 0;
      this.angle = Math.atan2(start.tangent.y, start.tangent.x);
      this.progress = options.startProgress;
      this.previousProgress = this.progress;
      this.completedLaps = 0;
      this.finished = false;
      this.finishTime = 0;
      this.steer = 0;
      this.throttle = 0;
      this.brake = 0;
      this.skid = 0;
      this.aiLookahead = options.aiLookahead || 0.035;
    }

    get speed() {
      return length(this.vx, this.vy);
    }

    get forward() {
      return { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    }

    get raceScore() {
      return this.completedLaps + this.progress;
    }

    update(dt) {
      this.previousX = this.x;
      this.previousY = this.y;
      const input = this.isPlayer ? playerInput() : this.aiInput();
      this.steer = input.steer;
      this.throttle = input.throttle;
      this.brake = input.brake;

      const forward = this.forward;
      const right = { x: -forward.y, y: forward.x };
      const forwardSpeed = dot(this.vx, this.vy, forward.x, forward.y);
      const lateralSpeed = dot(this.vx, this.vy, right.x, right.y);

      // Arcade tire model: grip removes lateral velocity, while throttle adds force in car space.
      const grip = Math.min(1, 9.8 * dt);
      this.vx -= right.x * lateralSpeed * grip;
      this.vy -= right.y * lateralSpeed * grip;

      if (this.throttle > 0) {
        const engineForce = this.acceleration * this.throttle * (forwardSpeed < this.maxSpeed ? 1 : 0.12);
        this.vx += forward.x * engineForce * dt;
        this.vy += forward.y * engineForce * dt;
      }

      if (this.brake > 0) {
        const braking = this.braking * this.brake * dt;
        if (forwardSpeed > 8) {
          const amount = Math.min(forwardSpeed, braking);
          this.vx -= forward.x * amount;
          this.vy -= forward.y * amount;
        } else if (this.throttle === 0) {
          this.vx -= forward.x * this.braking * 0.38 * this.brake * dt;
          this.vy -= forward.y * this.braking * 0.38 * this.brake * dt;
        }
      }

      const trackPoint = closestTrackPoint(this.x, this.y);
      const offRoad = trackPoint.distance > ROAD_HALF_WIDTH - 4;
      const drag = offRoad ? 2.7 : 0.92;
      const dragFactor = Math.exp(-drag * dt);
      this.vx *= dragFactor;
      this.vy *= dragFactor;

      const steeringGrip = clamp(Math.abs(forwardSpeed) / 65, 0, 1);
      this.angle += this.steer * this.turnRate * steeringGrip * dt * (forwardSpeed >= -2 ? 1 : -1);

      const speed = this.speed;
      const allowedSpeed = offRoad ? this.maxSpeed * 0.42 : this.maxSpeed;
      if (speed > allowedSpeed) {
        const scale = allowedSpeed / speed;
        this.vx *= scale;
        this.vy *= scale;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.resolveTrackBoundary();
      this.updateProgress();
      this.emitSkidDust(offRoad, lateralSpeed, dt);
    }

    aiInput() {
      const lookahead = this.aiLookahead + clamp(this.speed / 900, 0, 0.026);
      const target = sampleAt(this.progress + lookahead, this.lateral);
      const targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
      const angleError = wrapAngle(targetAngle - this.angle);
      const steer = clamp(angleError * 2.45, -1, 1);
      const upcoming = sampleAt(this.progress + lookahead * 1.8, this.lateral);
      const bend = Math.abs(wrapAngle(Math.atan2(upcoming.tangent.y, upcoming.tangent.x) - this.angle));
      const desiredSpeed = this.maxSpeed * clamp(1.08 - bend * 0.7, 0.35, 1);
      const throttle = this.speed < desiredSpeed ? 1 : 0.18;
      const brake = this.speed > desiredSpeed + 26 ? clamp((this.speed - desiredSpeed) / 80, 0, 1) : 0;
      return { steer, throttle, brake };
    }

    resolveTrackBoundary() {
      const nearest = closestTrackPoint(this.x, this.y);
      const limit = ROAD_HALF_WIDTH - this.radius - 2;
      if (nearest.distance <= limit) return;
      const away = normalize(this.x - nearest.x, this.y - nearest.y);
      const penetration = nearest.distance - limit;
      this.x -= away.x * penetration;
      this.y -= away.y * penetration;
      const outwardSpeed = dot(this.vx, this.vy, away.x, away.y);
      if (outwardSpeed > 0) {
        this.vx -= away.x * outwardSpeed * 1.35;
        this.vy -= away.y * outwardSpeed * 1.35;
      }
      this.vx *= 0.82;
      this.vy *= 0.82;
    }

    updateProgress() {
      const nearest = closestTrackPoint(this.x, this.y);
      this.previousProgress = this.progress;
      this.progress = nearest.progress;
      const movedAcrossStart = this.previousProgress > 0.82 && this.progress < 0.18;
      const forwardMotion = dot(this.vx, this.vy, nearest.tangent.x, nearest.tangent.y) > -10;
      if (movedAcrossStart && forwardMotion) {
        this.completedLaps += 1;
        if (this.completedLaps >= TOTAL_LAPS && !this.finished) {
          this.finished = true;
          this.finishTime = simTime;
          if (this.isPlayer) finishFlash = 2.2;
        }
      }
    }

    emitSkidDust(offRoad, lateralSpeed, dt) {
        if (this.isPlayer && Math.abs(lateralSpeed) > 45 && this.speed > 100 || offRoad && this.speed > 125) {
        if (rng() < dt * 20) {
          const backX = this.x - this.forward.x * 13;
          const backY = this.y - this.forward.y * 13;
          particles.push({
            x: backX,
            y: backY,
            vx: -this.vx * 0.1 + (rng() - 0.5) * 22,
            vy: -this.vy * 0.1 + (rng() - 0.5) * 22,
            life: 0.32 + rng() * 0.24,
            maxLife: 0.56,
            size: 2.5 + rng() * 3,
            color: offRoad ? "#c7b990" : "#d4e2e7",
          });
        }
      }
    }

    draw(interpolation) {
      const x = lerp(this.previousX, this.x, interpolation);
      const y = lerp(this.previousY, this.y, interpolation);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.angle);

      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#02070b";
      ctx.beginPath();
      ctx.ellipse(-3, 5, 20, 10, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = this.color;
      roundRect(ctx, -18, -10, 36, 20, 6);
      ctx.fill();

      ctx.fillStyle = this.accent;
      roundRect(ctx, -4, -8, 14, 16, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(217, 247, 255, 0.86)";
      roundRect(ctx, 1, -6, 8, 12, 2);
      ctx.fill();

      ctx.fillStyle = "#0a1018";
      ctx.fillRect(-12, -12, 7, 4);
      ctx.fillRect(-12, 8, 7, 4);
      ctx.fillRect(9, -12, 7, 4);
      ctx.fillRect(9, 8, 7, 4);

      ctx.fillStyle = this.isPlayer ? "#fff4b0" : "#ff7a69";
      ctx.fillRect(15, -5, 3, 3);
      ctx.fillRect(15, 2, 3, 3);
      if (this.isPlayer) {
        ctx.strokeStyle = "rgba(98, 244, 238, 0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 23, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function playerInput() {
    const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
    const throttle = keys.has("ArrowUp") || keys.has("w") || keys.has("W");
    const brake = keys.has("ArrowDown") || keys.has("s") || keys.has("S");
    return {
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      throttle: throttle ? 1 : 0,
      brake: brake ? 1 : 0,
    };
  }

  function resetRace() {
    // Re-seeding keeps every restart byte-for-byte reproducible.
    rng = mulberry32(RNG_SEED);
    track = buildTrack();
    particles.length = 0;
    simTime = 0;
    finished = false;
    finishFlash = 0;
    toast.classList.remove("visible");

    const aiPalette = [
      { color: "#ff705e", accent: "#ffd1a6" },
      { color: "#b987ff", accent: "#eee0ff" },
      { color: "#f7c95c", accent: "#fff3b1" },
    ];
    const opponents = aiPalette.map((paint, index) => new Car({
      id: index + 1,
      name: `AI ${index + 1}`,
      ...paint,
      startProgress: 0.012 - index * 0.013,
      lateral: (index - 1) * 22 + (rng() - 0.5) * 4,
      skill: 0.78 + rng() * 0.28,
      aiLookahead: 0.032 + rng() * 0.01,
    }));
    player = new Car({
      id: 0,
      name: "Player",
      color: "#50dfdb",
      accent: "#d8ffff",
      isPlayer: true,
      startProgress: 0.05,
      lateral: 0,
    });
    cars = [player, ...opponents];

    // Seed the deterministic launch order with a small forward velocity.
    for (const car of cars) {
      const sample = sampleAt(car.progress, car.lateral);
      car.angle = Math.atan2(sample.tangent.y, sample.tangent.x);
      car.vx = sample.tangent.x * 8;
      car.vy = sample.tangent.y * 8;
    }
    updateHud();
  }

  function resolveCarCollisions() {
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance === 0) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const minimum = a.radius + b.radius;
        if (distance >= minimum) continue;

        const nx = dx / distance;
        const ny = dy / distance;
        const penetration = minimum - distance;
        const inverseA = 1 / a.mass;
        const inverseB = 1 / b.mass;
        const inverseMass = inverseA + inverseB;
        const correction = penetration * 0.82 / inverseMass;
        a.x -= nx * correction * inverseA;
        a.y -= ny * correction * inverseA;
        b.x += nx * correction * inverseB;
        b.y += ny * correction * inverseB;

        // Impulse resolution: only push cars apart when their relative velocity is closing.
        const relativeVelocity = dot(b.vx - a.vx, b.vy - a.vy, nx, ny);
        if (relativeVelocity < 0) {
          const restitution = 0.42;
          const impulse = -(1 + restitution) * relativeVelocity / inverseMass;
          a.vx -= impulse * inverseA * nx;
          a.vy -= impulse * inverseA * ny;
          b.vx += impulse * inverseB * nx;
          b.vy += impulse * inverseB * ny;
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-4 * dt);
      particle.vy *= Math.exp(-4 * dt);
    }
  }

  function update(dt) {
    if (finished) {
      finishFlash = Math.max(0, finishFlash - dt);
      updateParticles(dt);
      updateHud();
      return;
    }

    simTime += dt;
    for (const car of cars) car.update(dt);
    resolveCarCollisions();
    updateParticles(dt);

    if (player.finished) {
      finished = true;
      toast.innerHTML = `Finished ${ordinal(getPosition(player))}<small>${formatTime(player.finishTime)} · Press R to restart</small>`;
      toast.classList.add("visible");
    }
    updateHud();
  }

  function getPosition(car) {
    const sorted = [...cars].sort((a, b) => b.raceScore - a.raceScore);
    return sorted.indexOf(car) + 1;
  }

  function updateHud() {
    if (!player) return;
    const displayLap = Math.min(player.completedLaps + 1, TOTAL_LAPS);
    lapLabel.textContent = player.finished ? `Lap ${TOTAL_LAPS} / ${TOTAL_LAPS}` : `Lap ${displayLap} / ${TOTAL_LAPS}`;
    timerLabel.textContent = formatTime(player.finished ? player.finishTime : simTime);
    positionLabel.textContent = `${ordinal(getPosition(player))} / ${cars.length}`;
    speedLabel.textContent = `${Math.round(player.speed * 0.72)} km/h`;
  }

  function drawRibbon(points, fillStyle, width) {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const sample = track.samples[i];
      const x = point.x + sample.normal.x * width;
      const y = point.y + sample.normal.y * width;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = points.length - 1; i >= 0; i -= 1) {
      const point = points[i];
      const sample = track.samples[i];
      const x = point.x - sample.normal.x * width;
      const y = point.y - sample.normal.y * width;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawClosedLine(points, color, lineWidth, dash = []) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    gradient.addColorStop(0, "#123d3a");
    gradient.addColorStop(1, "#0a2529");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = "#8ee1c3";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrack() {
    // Soft shadow underneath the ribbon.
    ctx.save();
    ctx.translate(0, 8);
    drawRibbon(track.samples, "rgba(2, 8, 12, 0.36)", ROAD_HALF_WIDTH + 18);
    ctx.restore();

    drawRibbon(track.samples, "#e6d6bd", ROAD_HALF_WIDTH + 9);
    drawRibbon(track.samples, "#2d3944", ROAD_HALF_WIDTH);
    drawClosedLine(track.samples, "rgba(8, 15, 22, 0.72)", 2.5);
    drawClosedLine(track.samples, "rgba(255, 255, 255, 0.12)", 1, [8, 14]);

    // Alternating curb marks make the road edge readable at a glance.
    for (let i = 0; i < track.samples.length; i += 8) {
      const sample = track.samples[i];
      const next = track.samples[wrapIndex(i + 4, track.samples.length)];
      const angle = Math.atan2(next.y - sample.y, next.x - sample.x);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(sample.x + sample.normal.x * side * (ROAD_HALF_WIDTH + 4), sample.y + sample.normal.y * side * (ROAD_HALF_WIDTH + 4));
        ctx.rotate(angle);
        ctx.fillStyle = ((i / 8) % 2 === 0) ? "#eaf1f1" : "#e86a5c";
        ctx.fillRect(-8, -3, 16, 6);
        ctx.restore();
      }
    }

    // Finish gate: a small checkered stripe across the entire racing surface.
    const start = track.samples[0];
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(Math.atan2(start.tangent.y, start.tangent.x));
    const cell = 9;
    for (let i = -8; i < 8; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#f4fbff" : "#19232e";
      ctx.fillRect(-4, i * cell, 8, cell);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1) * 0.65;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (1.2 - particle.life / particle.maxLife * 0.2), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(interpolation) {
    drawBackground();
    drawTrack();
    drawParticles();
    const renderCars = [...cars].sort((a, b) => a.y - b.y);
    for (const car of renderCars) car.draw(interpolation);
    if (finishFlash > 0) {
      ctx.fillStyle = `rgba(98, 244, 238, ${finishFlash * 0.04})`;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD.width * ratio;
    canvas.height = WORLD.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  window.addEventListener("keydown", (event) => {
    keys.add(event.key);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
    if (event.key === "r" || event.key === "R") resetRace();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key));
  window.addEventListener("resize", resizeCanvas);

  resetRace();
  resizeCanvas();

  let lastTime = performance.now();
  let accumulator = 0;
  function frame(now) {
    const elapsed = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render(accumulator / FIXED_DT);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
