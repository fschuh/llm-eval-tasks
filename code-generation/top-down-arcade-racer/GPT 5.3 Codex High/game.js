(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const FIXED_DT = 1 / 60;
  const MAX_STEPS = 5;
  const RNG_SEED = 133742;

  const TRACK = {
    center: { x: WIDTH * 0.5, y: HEIGHT * 0.5 },
    innerRadius: 135,
    outerRadius: 270,
    laneRadius: 202,
    waypointCount: 24,
    totalLaps: 3,
  };

  const CAR_CONFIG = {
    radius: 14,
    mass: 1,
    maxSpeed: 265,
    accel: 210,
    reverseAccel: 120,
    brakeStrength: 300,
    steerRate: 2.7,
    linearDrag: 0.8,
    lateralGrip: 7.5,
    wallRestitution: 0.2,
    carRestitution: 0.3,
  };

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(RNG_SEED);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function vec(x = 0, y = 0) {
    return { x, y };
  }

  function add(a, b) {
    return vec(a.x + b.x, a.y + b.y);
  }

  function sub(a, b) {
    return vec(a.x - b.x, a.y - b.y);
  }

  function scale(a, s) {
    return vec(a.x * s, a.y * s);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function len(a) {
    return Math.hypot(a.x, a.y);
  }

  function normalize(a) {
    const l = len(a);
    if (l < 1e-8) return vec(0, 0);
    return scale(a, 1 / l);
  }

  function fromAngle(theta) {
    return vec(Math.cos(theta), Math.sin(theta));
  }

  function perp(a) {
    return vec(-a.y, a.x);
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function formatTime(t) {
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60);
    const millis = Math.floor((t - Math.floor(t)) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  function buildWaypoints() {
    const points = [];
    for (let i = 0; i < TRACK.waypointCount; i += 1) {
      const t = (i / TRACK.waypointCount) * Math.PI * 2 - Math.PI / 2;
      points.push({
        x: TRACK.center.x + Math.cos(t) * TRACK.laneRadius,
        y: TRACK.center.y + Math.sin(t) * TRACK.laneRadius,
      });
    }
    return points;
  }

  const waypoints = buildWaypoints();

  class Car {
    constructor(name, color, isPlayer, startAngle, laneOffset = 0) {
      this.name = name;
      this.color = color;
      this.isPlayer = isPlayer;
      this.radius = CAR_CONFIG.radius;
      this.mass = CAR_CONFIG.mass;

      const startRad = TRACK.laneRadius + laneOffset;
      this.pos = vec(
        TRACK.center.x + Math.cos(startAngle) * startRad,
        TRACK.center.y + Math.sin(startAngle) * startRad
      );
      this.angle = startAngle + Math.PI / 2;
      this.vel = vec(0, 0);

      this.steerInput = 0;
      this.throttleInput = 0;
      this.brakeInput = 0;

      this.nextWaypoint = this.findNearestWaypointAhead();
      this.lap = 1;
      this.finished = false;
      this.finishTime = null;

      this.aiCruiseBias = 0.85 + rand() * 0.2;
      this.aiAggression = 1.2 + rand() * 0.7;
    }

    findNearestWaypointAhead() {
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < waypoints.length; i += 1) {
        const d = len(sub(waypoints[i], this.pos));
        if (d < bestDist) {
          bestDist = d;
          bestIndex = i;
        }
      }
      return (bestIndex + 1) % waypoints.length;
    }

    waypointProgressScore() {
      const target = waypoints[this.nextWaypoint];
      const distToTarget = len(sub(target, this.pos));
      const withinSegment = clamp(1 - distToTarget / 180, 0, 1);
      return this.lap * 10000 + this.nextWaypoint * 100 + withinSegment;
    }

    updateControl(playerInput) {
      if (this.isPlayer) {
        const gas = (playerInput.up ? 1 : 0) - (playerInput.down ? 1 : 0);
        this.throttleInput = clamp(gas, -1, 1);
        this.brakeInput = playerInput.space ? 1 : 0;
        this.steerInput = (playerInput.right ? 1 : 0) - (playerInput.left ? 1 : 0);
        return;
      }

      const target = waypoints[this.nextWaypoint];
      const toTarget = sub(target, this.pos);
      const desiredAngle = Math.atan2(toTarget.y, toTarget.x);
      const delta = wrapAngle(desiredAngle - this.angle);

      const speed = len(this.vel);
      const turnTightness = clamp(Math.abs(delta) / Math.PI, 0, 1);
      const desiredSpeed = CAR_CONFIG.maxSpeed * (this.aiCruiseBias - turnTightness * 0.45);

      this.steerInput = clamp(delta * this.aiAggression, -1, 1);
      this.throttleInput = speed < desiredSpeed ? 1 : 0;
      this.brakeInput = speed > desiredSpeed + 25 ? 1 : 0;
    }

    updatePhysics(dt) {
      const forward = fromAngle(this.angle);
      const right = perp(forward);

      const vForward = dot(this.vel, forward);
      const vRight = dot(this.vel, right);

      const accelMag = this.throttleInput >= 0
        ? this.throttleInput * CAR_CONFIG.accel
        : this.throttleInput * CAR_CONFIG.reverseAccel;
      const engineAccel = scale(forward, accelMag);

      const brakeAccel = this.brakeInput > 0
        ? scale(forward, -Math.sign(vForward) * CAR_CONFIG.brakeStrength * this.brakeInput)
        : vec(0, 0);

      const dragAccel = scale(this.vel, -CAR_CONFIG.linearDrag);
      const sideFriction = scale(right, -vRight * CAR_CONFIG.lateralGrip);

      const totalAccel = add(add(engineAccel, brakeAccel), add(dragAccel, sideFriction));

      this.vel = add(this.vel, scale(totalAccel, dt));

      const speed = len(this.vel);
      if (speed > CAR_CONFIG.maxSpeed) {
        this.vel = scale(this.vel, CAR_CONFIG.maxSpeed / speed);
      }

      const speedFactor = clamp(speed / 120, 0.2, 1.8);
      this.angle += this.steerInput * CAR_CONFIG.steerRate * dt * speedFactor;

      this.pos = add(this.pos, scale(this.vel, dt));

      this.handleTrackCollision();
      this.updateWaypointLapProgress();
    }

    handleTrackCollision() {
      const fromCenter = sub(this.pos, TRACK.center);
      const d = len(fromCenter);
      const n = d > 1e-8 ? scale(fromCenter, 1 / d) : vec(1, 0);

      const maxD = TRACK.outerRadius - this.radius;
      if (d > maxD) {
        const penetration = d - maxD;
        this.pos = sub(this.pos, scale(n, penetration));

        const vn = dot(this.vel, n);
        if (vn > 0) {
          this.vel = sub(this.vel, scale(n, (1 + CAR_CONFIG.wallRestitution) * vn));
        }
      }

      const minD = TRACK.innerRadius + this.radius;
      const d2 = len(sub(this.pos, TRACK.center));
      if (d2 < minD) {
        const n2 = d2 > 1e-8 ? scale(sub(this.pos, TRACK.center), 1 / d2) : vec(1, 0);
        const penetration = minD - d2;
        this.pos = add(this.pos, scale(n2, penetration));

        const vn = dot(this.vel, n2);
        if (vn < 0) {
          this.vel = sub(this.vel, scale(n2, (1 + CAR_CONFIG.wallRestitution) * vn));
        }
      }
    }

    updateWaypointLapProgress() {
      const target = waypoints[this.nextWaypoint];
      if (len(sub(target, this.pos)) < 32) {
        const prev = this.nextWaypoint;
        this.nextWaypoint = (this.nextWaypoint + 1) % waypoints.length;
        if (this.nextWaypoint === 0 && prev === waypoints.length - 1 && !this.finished) {
          this.lap += 1;
          if (this.lap > TRACK.totalLaps) {
            this.finished = true;
            this.finishTime = raceTime;
            this.vel = scale(this.vel, 0.96);
            this.lap = TRACK.totalLaps;
          }
        }
      }
    }
  }

  const cars = [];

  function resetRace() {
    cars.length = 0;
    raceTime = 0;
    raceOver = false;

    const baseAngle = -Math.PI / 2 + 0.18;
    const spacing = 0.09;

    cars.push(new Car("Player", "#52b788", true, baseAngle, -8));
    cars.push(new Car("AI-1", "#ffb703", false, baseAngle + spacing, 4));
    cars.push(new Car("AI-2", "#fb8500", false, baseAngle + spacing * 2, -3));
    cars.push(new Car("AI-3", "#8ecae6", false, baseAngle + spacing * 3, 7));
  }

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
  };

  const keyMap = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    Space: "space",
  };

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") {
      resetRace();
      return;
    }
    const action = keyMap[e.code];
    if (action) {
      input[action] = true;
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    const action = keyMap[e.code];
    if (action) {
      input[action] = false;
      e.preventDefault();
    }
  });

  function solveCarCollisions() {
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const ab = sub(b.pos, a.pos);
        const d = len(ab);
        const minDist = a.radius + b.radius;

        if (d >= minDist || d < 1e-8) continue;

        const n = scale(ab, 1 / d);
        const penetration = minDist - d;
        const correction = scale(n, penetration * 0.5);
        a.pos = sub(a.pos, correction);
        b.pos = add(b.pos, correction);

        const rv = sub(b.vel, a.vel);
        const velAlongNormal = dot(rv, n);
        if (velAlongNormal > 0) continue;

        const invMassA = 1 / a.mass;
        const invMassB = 1 / b.mass;
        const jImpulse = -(1 + CAR_CONFIG.carRestitution) * velAlongNormal / (invMassA + invMassB);
        const impulse = scale(n, jImpulse);

        a.vel = sub(a.vel, scale(impulse, invMassA));
        b.vel = add(b.vel, scale(impulse, invMassB));
      }
    }
  }

  function ranking() {
    return [...cars].sort((a, b) => b.waypointProgressScore() - a.waypointProgressScore());
  }

  function drawTrack() {
    const c = TRACK.center;

    ctx.fillStyle = "#1d3a3f";
    ctx.beginPath();
    ctx.arc(c.x, c.y, TRACK.outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#264653";
    ctx.beginPath();
    ctx.arc(c.x, c.y, TRACK.innerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#dfe7fd";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, TRACK.laneRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const finishA = { x: c.x, y: c.y - TRACK.innerRadius };
    const finishB = { x: c.x, y: c.y - TRACK.outerRadius };
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(finishA.x, finishA.y);
    ctx.lineTo(finishB.x, finishB.y);
    ctx.stroke();

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const t = i / 8;
      const y = finishA.y + (finishB.y - finishA.y) * t;
      const x = finishA.x;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x + 8, y);
        ctx.stroke();
      }
    }
  }

  function drawCar(car) {
    const fwd = fromAngle(car.angle);
    const right = perp(fwd);

    const nose = add(car.pos, scale(fwd, car.radius * 1.35));
    const rear = sub(car.pos, scale(fwd, car.radius * 1.2));
    const rearLeft = add(rear, scale(right, car.radius * 0.85));
    const rearRight = sub(rear, scale(right, car.radius * 0.85));

    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    ctx.lineTo(rearLeft.x, rearLeft.y);
    ctx.lineTo(rearRight.x, rearRight.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(car.pos.x, car.pos.y, car.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    if (car.isPlayer) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.pos.x, car.pos.y, car.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawHUD() {
    const player = cars[0];
    const standings = ranking();
    const position = standings.findIndex((c) => c === player) + 1;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(14, 14, 270, 116);

    ctx.fillStyle = "#d8f3dc";
    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText(`Lap: ${player.lap}/${TRACK.totalLaps}`, 24, 42);

    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText(`Time: ${formatTime(raceTime)}`, 24, 68);

    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText(`Position: ${position}/${cars.length}`, 24, 94);

    ctx.font = "13px Trebuchet MS";
    ctx.fillStyle = "#b7e4c7";
    ctx.fillText(`Seed ${RNG_SEED} | Fixed ${Math.round(1 / FIXED_DT)}Hz`, 24, 116);

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(WIDTH - 190, 14, 176, 116);
    ctx.fillStyle = "#d8f3dc";
    ctx.font = "bold 14px Trebuchet MS";
    ctx.fillText("Standings", WIDTH - 178, 36);

    ctx.font = "13px Trebuchet MS";
    standings.forEach((car, i) => {
      const y = 58 + i * 18;
      ctx.fillStyle = car.color;
      ctx.fillRect(WIDTH - 178, y - 10, 10, 10);
      ctx.fillStyle = "#d8f3dc";
      const label = `${i + 1}. ${car.name}  L${car.lap}`;
      ctx.fillText(label, WIDTH - 162, y);
    });

    if (player.finished) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(WIDTH * 0.5 - 190, HEIGHT * 0.5 - 56, 380, 112);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px Trebuchet MS";
      ctx.fillText("Race Complete", WIDTH * 0.5 - 102, HEIGHT * 0.5 - 12);
      ctx.font = "bold 18px Trebuchet MS";
      ctx.fillText(`Final Time: ${formatTime(player.finishTime ?? raceTime)}`, WIDTH * 0.5 - 96, HEIGHT * 0.5 + 22);
    }
  }

  function stepSimulation(dt) {
    for (const car of cars) {
      car.updateControl(input);
    }

    for (const car of cars) {
      car.updatePhysics(dt);
    }

    solveCarCollisions();

    raceTime += dt;

    const player = cars[0];
    raceOver = player.finished;
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawTrack();
    for (const car of cars) drawCar(car);
    drawHUD();
  }

  let raceTime = 0;
  let raceOver = false;

  resetRace();

  let accumulator = 0;
  let lastTime = performance.now() / 1000;

  function loop(nowMS) {
    const now = nowMS / 1000;
    let frameTime = now - lastTime;
    lastTime = now;

    frameTime = Math.min(frameTime, 0.25);
    accumulator += frameTime;

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      stepSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }

    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
