(() => {
  "use strict";

  // Top-down 2D racing prototype: fixed timestep, deterministic RNG, basic impulse collisions,
  // waypoint-following AI, lap detection, and HUD.

  const DT = 1 / 60; // Fixed simulation timestep (seconds)
  const TOTAL_LAPS = 3;

  const CAR_CFG = {
    radius: 14,
    mass: 1200,
    engineAccel: 220, // px/s^2
    brakeAccel: 320, // px/s^2
    maxSpeed: 560, // px/s
    maxReverse: 220, // px/s
    rolling: 1.6, // linear forward damping
    drag: 0.004, // quadratic forward damping
    lateralGrip: 9.5, // higher = less sideways slide
    steerRate: 2.8, // rad/s at high speed
  };

  const COLLISION_CFG = {
    restitution: 0.15,
    friction: 0.6,
    wallRestitution: 0.2,
  };

  const WAYPOINT_CFG = {
    radius: 40, // how close you must get to "collect" a waypoint
    lookahead: 3, // AI steers toward wpIndex + lookahead
  };

  class RNG {
    constructor(seed) {
      this.state = (seed >>> 0) || 1;
    }
    nextU32() {
      // LCG: Numerical Recipes
      this.state = (1664525 * this.state + 1013904223) >>> 0;
      return this.state;
    }
    nextFloat() {
      return this.nextU32() / 4294967296;
    }
    range(min, max) {
      return min + (max - min) * this.nextFloat();
    }
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function wrapAngle(a) {
    // Wrap to [-pi, pi]
    a = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a < -Math.PI ? a + Math.PI * 2 : a;
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  function len(x, y) {
    return Math.hypot(x, y);
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function segmentParam(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLen2 = abx * abx + aby * aby;
    if (abLen2 <= 1e-9) return 0;
    const t = (apx * abx + apy * aby) / abLen2;
    return clamp(t, 0, 1);
  }

  class Track {
    constructor() {
      // Ring track: outer rect minus inner rect.
      this.outer = { l: 100, t: 100, r: 1500, b: 800 };
      this.inner = { l: 520, t: 310, r: 1080, b: 590 };

      this.waypoints = this.#buildWaypoints();
      const { cumDist, segLen, totalLength } = this.#measurePath(this.waypoints);
      this.cumDist = cumDist;
      this.segLen = segLen;
      this.totalLength = totalLength;

      // Start/finish visual line: vertical stripe at waypoint[0] x across bottom segment.
      this.startX = this.waypoints[0].x;
    }

    #buildWaypoints() {
      const o = this.outer;
      const i = this.inner;
      const leftC = (o.l + i.l) * 0.5;
      const rightC = (o.r + i.r) * 0.5;
      const topC = (o.t + i.t) * 0.5;
      const botC = (o.b + i.b) * 0.5;
      const cx = (leftC + rightC) * 0.5;

      const pts = [];
      const stepsBottomHalf = 10;
      const stepsSide = 12;
      const stepsTop = 16;

      const addSegment = (ax, ay, bx, by, steps, includeEnd) => {
        for (let s = 1; s <= steps; s++) {
          if (!includeEnd && s === steps) break;
          const t = s / steps;
          pts.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
        }
      };

      // Start at bottom center; go right, up, left, down, then back to bottom center (excluding final duplicate).
      pts.push({ x: cx, y: botC });
      addSegment(cx, botC, rightC, botC, stepsBottomHalf, true);
      addSegment(rightC, botC, rightC, topC, stepsSide, true);
      addSegment(rightC, topC, leftC, topC, stepsTop, true);
      addSegment(leftC, topC, leftC, botC, stepsSide, true);
      addSegment(leftC, botC, cx, botC, stepsBottomHalf, false);

      return pts;
    }

    #measurePath(waypoints) {
      const n = waypoints.length;
      const segLen = new Array(n);
      const cumDist = new Array(n);
      cumDist[0] = 0;

      let total = 0;
      for (let i = 0; i < n; i++) {
        const a = waypoints[i];
        const b = waypoints[(i + 1) % n];
        const d = dist(a.x, a.y, b.x, b.y);
        segLen[i] = d;
        total += d;
        if (i + 1 < n) cumDist[i + 1] = cumDist[i] + d;
      }

      return { cumDist, segLen, totalLength: total };
    }

    draw(ctx) {
      const o = this.outer;
      const i = this.inner;

      // Grass background
      ctx.fillStyle = "#1e3d2a";
      ctx.fillRect(o.l - 3000, o.t - 3000, 6000, 6000);

      // Asphalt (outer rect)
      ctx.fillStyle = "#2a2f35";
      ctx.fillRect(o.l, o.t, o.r - o.l, o.b - o.t);

      // Inner hole (grass)
      ctx.fillStyle = "#193020";
      ctx.fillRect(i.l, i.t, i.r - i.l, i.b - i.t);

      // Track borders
      ctx.strokeStyle = "#bfc7d5";
      ctx.lineWidth = 6;
      ctx.strokeRect(o.l, o.t, o.r - o.l, o.b - o.t);
      ctx.strokeRect(i.l, i.t, i.r - i.l, i.b - i.t);

      // Start/finish line (visual aid)
      const bottomTrackTop = i.b;
      const bottomTrackBottom = o.b;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.startX, bottomTrackTop);
      ctx.lineTo(this.startX, bottomTrackBottom);
      ctx.stroke();

      // Dashed "checkers"
      ctx.strokeStyle = "#0b0f10";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(this.startX - 10, bottomTrackTop);
      ctx.lineTo(this.startX - 10, bottomTrackBottom);
      ctx.moveTo(this.startX + 10, bottomTrackTop);
      ctx.lineTo(this.startX + 10, bottomTrackBottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  class Car {
    constructor({ id, name, color, x, y, angle, isAI }) {
      this.id = id;
      this.name = name;
      this.color = color;
      this.isAI = isAI;

      this.pos = { x, y };
      this.vel = { x: 0, y: 0 };
      this.angle = angle;

      this.radius = CAR_CFG.radius;
      this.mass = CAR_CFG.mass;
      this.invMass = 1 / this.mass;

      this.controls = { throttle: 0, brake: 0, steer: 0 };

      // Racing state
      this.lap = 0; // completed laps
      this.wpIndex = 1; // next waypoint to reach; spawn just after wp0
      this.lapTime = 0;
      this.lastLapTime = null;
      this.bestLapTime = null;
      this.finished = false;

      // Derived per-tick
      this.raceS = 0;
      this.rank = 0;
    }
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  function resizeCanvas() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener("resize", resizeCanvas);

  // Deterministic seed (default 1337). Set via URL: ?seed=123
  const seedFromUrl = Number.parseInt(new URLSearchParams(location.search).get("seed") || "1337", 10);
  const BASE_SEED = Number.isFinite(seedFromUrl) ? (seedFromUrl | 0) : 1337;

  let rng;
  let track;
  let cars;
  let player;

  // Input state (sampled during fixed-timestep updates).
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  function setKey(e, down) {
    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        input.up = down;
        e.preventDefault();
        break;
      case "ArrowDown":
      case "KeyS":
        input.down = down;
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "KeyA":
        input.left = down;
        e.preventDefault();
        break;
      case "ArrowRight":
      case "KeyD":
        input.right = down;
        e.preventDefault();
        break;
      case "KeyR":
        if (down) resetWorld();
        break;
    }
  }

  window.addEventListener("keydown", (e) => setKey(e, true));
  window.addEventListener("keyup", (e) => setKey(e, false));

  function resetWorld() {
    rng = new RNG(BASE_SEED);
    track = new Track();
    cars = [];

    const wp0 = track.waypoints[0];
    const wp1 = track.waypoints[1];
    const fx = wp1.x - wp0.x;
    const fy = wp1.y - wp0.y;
    const fLen = Math.max(1e-6, Math.hypot(fx, fy));
    const fdx = fx / fLen;
    const fdy = fy / fLen;
    const rdx = -fdy;
    const rdy = fdx;
    const baseAngle = Math.atan2(fdy, fdx);

    const spawnAhead = 60;
    const spawnBack = 80;
    const baseX = wp0.x + fdx * spawnAhead;
    const baseY = wp0.y + fdy * spawnAhead;

    const offsets = [
      { f: -0, r: -22 },
      { f: 0, r: 22 },
      { f: -1, r: -22 },
      { f: -1, r: 22 },
    ];

    const palette = ["#ff4d4d", "#4dd2ff", "#ffe34d", "#b84dff"];
    const names = ["You", "AI-1", "AI-2", "AI-3"];

    for (let k = 0; k < 4; k++) {
      const off = offsets[k];
      const x = baseX + fdx * (off.f * spawnBack) + rdx * off.r;
      const y = baseY + fdy * (off.f * spawnBack) + rdy * off.r;
      const color = palette[k];
      const isAI = k !== 0;
      const car = new Car({
        id: k,
        name: names[k],
        color,
        x,
        y,
        angle: baseAngle,
        isAI,
      });

      // Small deterministic per-car velocity to help separate spawns.
      const jitter = (rng.nextFloat() - 0.5) * 8;
      car.vel.x = fdx * jitter;
      car.vel.y = fdy * jitter;
      cars.push(car);
    }

    player = cars[0];

    simTime = 0;
    acc = 0;
    lastFrameT = performance.now() * 0.001;

    updateRanks();
  }

  function playerControlsStep(car) {
    if (car.finished) {
      car.controls.throttle = 0;
      car.controls.brake = 1; // stop-ish
      car.controls.steer = 0;
      return;
    }
    car.controls.throttle = input.up ? 1 : 0;
    car.controls.brake = input.down ? 1 : 0;
    car.controls.steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    car.controls.steer = clamp(car.controls.steer, -1, 1);
  }

  function aiControlsStep(car) {
    if (car.finished) {
      car.controls.throttle = 0;
      car.controls.brake = 1;
      car.controls.steer = 0;
      return;
    }

    const n = track.waypoints.length;
    const targetIndex = (car.wpIndex + WAYPOINT_CFG.lookahead) % n;
    const target = track.waypoints[targetIndex];
    const dx = target.x - car.pos.x;
    const dy = target.y - car.pos.y;

    const desired = Math.atan2(dy, dx);
    const err = wrapAngle(desired - car.angle);

    const steer = clamp(err / 0.9, -1, 1);

    const absErr = Math.abs(err);
    let throttle = 1.0;
    let brake = 0.0;

    // Simple cornering heuristic.
    if (absErr > 0.9) {
      throttle = 0.1;
      brake = 0.6;
    } else if (absErr > 0.6) {
      throttle = 0.35;
      brake = 0.25;
    } else if (absErr > 0.35) {
      throttle = 0.7;
      brake = 0.0;
    }

    // Avoid getting stuck reversing: if forward speed is negative, prioritize throttle.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const vf = dot(car.vel.x, car.vel.y, fx, fy);
    if (vf < -40) {
      throttle = 1.0;
      brake = 0.0;
    }

    car.controls.throttle = throttle;
    car.controls.brake = brake;
    car.controls.steer = steer;
  }

  function integrateCar(car, dt) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const rx = -fy;
    const ry = fx;

    const vf = dot(car.vel.x, car.vel.y, fx, fy);
    const vr = dot(car.vel.x, car.vel.y, rx, ry);

    const throttle = car.controls.throttle;
    const brake = car.controls.brake;

    let aF = throttle * CAR_CFG.engineAccel;
    if (brake > 0) {
      // Brake opposes forward motion; if essentially stopped, brake acts like reverse-throttle.
      const s = vf === 0 ? 1 : Math.sign(vf);
      aF -= brake * CAR_CFG.brakeAccel * s;
    }

    // Forward resistive forces (simple rolling + quadratic drag).
    aF -= CAR_CFG.rolling * vf;
    aF -= CAR_CFG.drag * vf * Math.abs(vf);

    // Lateral stabilization (tire grip).
    const aR = -vr * CAR_CFG.lateralGrip;

    car.vel.x += (fx * aF + rx * aR) * dt;
    car.vel.y += (fy * aF + ry * aR) * dt;

    // Clamp forward speed to keep things stable.
    const vf2 = dot(car.vel.x, car.vel.y, fx, fy);
    const vr2 = dot(car.vel.x, car.vel.y, rx, ry);
    const vfClamped = clamp(vf2, -CAR_CFG.maxReverse, CAR_CFG.maxSpeed);
    car.vel.x = fx * vfClamped + rx * vr2;
    car.vel.y = fy * vfClamped + ry * vr2;

    // Steering: turn rate increases with speed; sign flips when reversing.
    const speedFactor = clamp(Math.abs(vfClamped) / 320, 0, 1);
    const yawRate = car.controls.steer * CAR_CFG.steerRate * speedFactor * (vfClamped >= 0 ? 1 : -1);
    car.angle = wrapAngle(car.angle + yawRate * dt);

    car.pos.x += car.vel.x * dt;
    car.pos.y += car.vel.y * dt;
  }

  function resolveCarCar(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const minDist = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) return;

    const d = Math.sqrt(Math.max(1e-12, d2));
    const nx = dx / d;
    const ny = dy / d;
    const penetration = minDist - d;

    const invMassSum = a.invMass + b.invMass;
    if (invMassSum <= 0) return;

    // Positional correction (split by inverse mass).
    const k = penetration / invMassSum;
    a.pos.x -= nx * k * a.invMass;
    a.pos.y -= ny * k * a.invMass;
    b.pos.x += nx * k * b.invMass;
    b.pos.y += ny * k * b.invMass;

    // Relative velocity
    const rvx = b.vel.x - a.vel.x;
    const rvy = b.vel.y - a.vel.y;
    const velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal > 0) return;

    const e = COLLISION_CFG.restitution;
    let j = -(1 + e) * velAlongNormal;
    j /= invMassSum;

    const ix = j * nx;
    const iy = j * ny;
    a.vel.x -= ix * a.invMass;
    a.vel.y -= iy * a.invMass;
    b.vel.x += ix * b.invMass;
    b.vel.y += iy * b.invMass;

    // Simple Coulomb friction along tangent.
    const tvx = rvx - velAlongNormal * nx;
    const tvy = rvy - velAlongNormal * ny;
    const tLen = Math.hypot(tvx, tvy);
    if (tLen > 1e-6) {
      const tx = tvx / tLen;
      const ty = tvy / tLen;
      const vt = rvx * tx + rvy * ty;
      let jt = -vt / invMassSum;
      const mu = COLLISION_CFG.friction;
      const maxJt = mu * j;
      jt = clamp(jt, -maxJt, maxJt);
      const fx = jt * tx;
      const fy = jt * ty;
      a.vel.x -= fx * a.invMass;
      a.vel.y -= fy * a.invMass;
      b.vel.x += fx * b.invMass;
      b.vel.y += fy * b.invMass;
    }
  }

  function reflectVelocity(car, nx, ny) {
    const vn = car.vel.x * nx + car.vel.y * ny;
    if (vn >= 0) return; // moving away from wall
    const e = COLLISION_CFG.wallRestitution;
    car.vel.x -= (1 + e) * vn * nx;
    car.vel.y -= (1 + e) * vn * ny;
  }

  function resolveWalls(car) {
    const r = car.radius;
    const o = track.outer;
    const i = track.inner;

    // Outer boundary (keep inside).
    if (car.pos.x - r < o.l) {
      car.pos.x = o.l + r;
      reflectVelocity(car, 1, 0);
    } else if (car.pos.x + r > o.r) {
      car.pos.x = o.r - r;
      reflectVelocity(car, -1, 0);
    }
    if (car.pos.y - r < o.t) {
      car.pos.y = o.t + r;
      reflectVelocity(car, 0, 1);
    } else if (car.pos.y + r > o.b) {
      car.pos.y = o.b - r;
      reflectVelocity(car, 0, -1);
    }

    // Inner hole (keep outside). Treat as collision against the expanded inner rect.
    const l = i.l - r;
    const t = i.t - r;
    const rr = i.r + r;
    const bb = i.b + r;
    if (car.pos.x > l && car.pos.x < rr && car.pos.y > t && car.pos.y < bb) {
      const penL = car.pos.x - l;
      const penR = rr - car.pos.x;
      const penT = car.pos.y - t;
      const penB = bb - car.pos.y;

      // Push to the nearest side.
      let minPen = penL;
      let nx = -1;
      let ny = 0;
      let newX = l;
      let newY = car.pos.y;

      if (penR < minPen) {
        minPen = penR;
        nx = 1;
        ny = 0;
        newX = rr;
      }
      if (penT < minPen) {
        minPen = penT;
        nx = 0;
        ny = -1;
        newX = car.pos.x;
        newY = t;
      }
      if (penB < minPen) {
        minPen = penB;
        nx = 0;
        ny = 1;
        newX = car.pos.x;
        newY = bb;
      }

      car.pos.x = newX;
      car.pos.y = newY;
      reflectVelocity(car, nx, ny);
    }
  }

  function advanceWaypointsAndLaps(car, dt) {
    if (car.finished) return;
    car.lapTime += dt;

    const wp = track.waypoints;
    const n = wp.length;
    const r2 = WAYPOINT_CFG.radius * WAYPOINT_CFG.radius;

    // Allow multiple advancements per step (e.g. collisions + high speed).
    for (let guard = 0; guard < 6; guard++) {
      const target = wp[car.wpIndex];
      const dx = target.x - car.pos.x;
      const dy = target.y - car.pos.y;
      if (dx * dx + dy * dy > r2) break;

      const reached = car.wpIndex;
      car.wpIndex = (car.wpIndex + 1) % n;

      if (reached === 0) {
        car.lap += 1;
        car.lastLapTime = car.lapTime;
        car.bestLapTime = car.bestLapTime === null ? car.lastLapTime : Math.min(car.bestLapTime, car.lastLapTime);
        car.lapTime = 0;
        if (car.lap >= TOTAL_LAPS) car.finished = true;
      }
    }
  }

  function updateRaceDistance(car) {
    const wp = track.waypoints;
    const n = wp.length;
    const next = car.wpIndex;
    const prev = (next + n - 1) % n;
    const a = wp[prev];
    const b = wp[next];
    const t = segmentParam(car.pos.x, car.pos.y, a.x, a.y, b.x, b.y);
    const sInLap = track.cumDist[prev] + t * track.segLen[prev];

    if (car.finished) {
      car.raceS = TOTAL_LAPS * track.totalLength;
      return;
    }

    car.raceS = car.lap * track.totalLength + sInLap;
  }

  function updateRanks() {
    for (const c of cars) updateRaceDistance(c);
    const sorted = [...cars].sort((a, b) => b.raceS - a.raceS || a.id - b.id);
    for (let i = 0; i < sorted.length; i++) sorted[i].rank = i + 1;
  }

  function fmtTime(s) {
    const mins = Math.floor(s / 60);
    const secs = s - mins * 60;
    const mm = String(mins).padStart(2, "0");
    const ss = secs.toFixed(2).padStart(5, "0");
    return `${mm}:${ss}`;
  }

  function drawCar(ctx, car) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const rx = -fy;
    const ry = fx;

    // Body
    const w = 34;
    const h = 18;

    ctx.save();
    ctx.translate(car.pos.x, car.pos.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = car.color;
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);

    // Windshield + nose marker
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(2, -h * 0.35, w * 0.32, h * 0.7);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(w * 0.25, -2, w * 0.2, 4);
    ctx.restore();

    // Collision circle (subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(car.pos.x, car.pos.y, car.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Velocity vector (debug-ish)
    const v = len(car.vel.x, car.vel.y);
    if (v > 20) {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(car.pos.x, car.pos.y);
      ctx.lineTo(car.pos.x + car.vel.x * 0.12, car.pos.y + car.vel.y * 0.12);
      ctx.stroke();
    }
  }

  function render() {
    resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fit world into the canvas with a margin.
    const o = track.outer;
    const worldW = o.r - o.l;
    const worldH = o.b - o.t;
    const margin = 30;
    const sx = (canvas.width - margin * 2) / worldW;
    const sy = (canvas.height - margin * 2) / worldH;
    const scale = Math.max(0.1, Math.min(sx, sy));
    const ox = Math.floor((canvas.width - worldW * scale) * 0.5 - o.l * scale);
    const oy = Math.floor((canvas.height - worldH * scale) * 0.5 - o.t * scale);

    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    track.draw(ctx);

    // Draw waypoints lightly (helps visually verify lap detection + AI).
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let k = 0; k < track.waypoints.length; k++) {
      const p = track.waypoints[k];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cars (sorted by y for a hint of depth)
    const drawList = [...cars].sort((a, b) => a.pos.y - b.pos.y || a.id - b.id);
    for (const car of drawList) drawCar(ctx, car);

    // HUD (screen-space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(14, 12, 310, 126);
    ctx.fillStyle = "#e9f1ff";
    ctx.font = "14px monospace";

    const speed = len(player.vel.x, player.vel.y);
    const lapShown = Math.min(TOTAL_LAPS, player.lap + 1);
    const posStr = `${player.rank}/${cars.length}`;

    const lines = [
      `Seed: ${BASE_SEED}    (R to reset)`,
      `Time: ${fmtTime(simTime)}`,
      `Lap:  ${lapShown}/${TOTAL_LAPS}    LapTime: ${fmtTime(player.lapTime)}`,
      `Pos:  ${posStr}        Speed: ${speed.toFixed(0)} px/s`,
    ];

    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 22, 34 + i * 18);

    // Leaderboard
    const sorted = [...cars].sort((a, b) => a.rank - b.rank);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(14, 148, 310, 20 + 18 * sorted.length);
    ctx.fillStyle = "#e9f1ff";
    ctx.fillText("Leaderboard:", 22, 170);
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      const tag = c.finished ? "FIN" : `${Math.min(TOTAL_LAPS, c.lap + 1)}/${TOTAL_LAPS}`;
      ctx.fillStyle = c === player ? "#ffffff" : "#c9d6ee";
      ctx.fillText(`${c.rank}. ${c.name.padEnd(4)}  Lap ${tag}`, 22, 188 + i * 18);
    }
  }

  let simTime = 0;
  let lastFrameT = performance.now() * 0.001;
  let acc = 0;

  function step(dt) {
    simTime += dt;

    playerControlsStep(player);
    for (let i = 1; i < cars.length; i++) aiControlsStep(cars[i]);

    // Integrate dynamics.
    for (const c of cars) integrateCar(c, dt);

    // Walls first (prevents cars being pushed into invalid space).
    for (const c of cars) resolveWalls(c);

    // Pairwise impulse collisions (deterministic order).
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) resolveCarCar(cars[i], cars[j]);
    }

    // Laps / waypoints
    for (const c of cars) advanceWaypointsAndLaps(c, dt);

    updateRanks();
  }

  function frame(nowMs) {
    const now = nowMs * 0.001;
    let frameDt = now - lastFrameT;
    lastFrameT = now;

    // Prevent "spiral of death" after tab inactive.
    frameDt = clamp(frameDt, 0, 0.1);
    acc += frameDt;

    while (acc >= DT) {
      step(DT);
      acc -= DT;
    }

    render();
    requestAnimationFrame(frame);
  }

  resetWorld();
  requestAnimationFrame(frame);
})();
