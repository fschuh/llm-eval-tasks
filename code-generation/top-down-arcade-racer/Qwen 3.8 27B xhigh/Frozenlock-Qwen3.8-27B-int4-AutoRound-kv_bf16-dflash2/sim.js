/* Top-down 2D racing prototype - simulation core.
 * Deterministic: all randomness comes from a seeded mulberry32 PRNG.
 * No external physics engine: arcade car model + circle impulse collisions.
 * Works in the browser (window.RacingSim) and in Node (module.exports).
 */
(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") module.exports = factory();
  else global.RacingSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DT = 1 / 120;
  const TOTAL_LAPS = 3;
  const TRACK_WIDTH = 110;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normAngle(a) {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  }

  // Closed circuit control points (smoothed with Catmull-Rom in buildTrack).
  const CONTROL = [
    { x: 400, y: 300 },
    { x: 1000, y: 220 },
    { x: 1600, y: 320 },
    { x: 1780, y: 650 },
    { x: 1500, y: 820 },
    { x: 1500, y: 1080 },
    { x: 1780, y: 1250 },
    { x: 1300, y: 1350 },
    { x: 800, y: 1300 },
    { x: 500, y: 1100 },
    { x: 350, y: 700 },
  ];

  function buildTrack() {
    const n = CONTROL.length;
    const S = 16;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const p0 = CONTROL[(i - 1 + n) % n];
      const p1 = CONTROL[i];
      const p2 = CONTROL[(i + 1) % n];
      const p3 = CONTROL[(i + 2) % n];
      for (let s = 0; s < S; s++) {
        const t = s / S, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    const N = pts.length;
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      pts[i].tx = dx / d;
      pts[i].ty = dy / d;
    }
    return { pts, N, halfWidth: TRACK_WIDTH / 2 };
  }

  function nearestPoint(track, x, y) {
    const pts = track.pts;
    let best = 0, bd = Infinity;
    for (let i = 0; i < track.N; i++) {
      const dx = pts[i].x - x, dy = pts[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return { index: best, dist: Math.sqrt(bd) };
  }

  function createSim(seed) {
    const rng = mulberry32(seed);
    const track = buildTrack();
    const N = track.N;

    const defs = [
      { name: "You", color: "#4da6ff", isPlayer: true,
        skill: { maxSpeed: 430, accel: 340, brake: 520, steerRate: 2.7, drag: 0.55, grip: 7, reverseMax: 130 } },
      { name: "Rival A", color: "#ff5c5c", isPlayer: false },
      { name: "Rival B", color: "#ffd23f", isPlayer: false },
      { name: "Rival C", color: "#7ed957", isPlayer: false },
    ];
    for (const d of defs) {
      if (!d.isPlayer) {
        d.skill = {
          maxSpeed: 385 + rng() * 55,
          accel: 300 + rng() * 60,
          brake: 500,
          steerRate: 2.3 + rng() * 0.5,
          drag: 0.55,
          grip: 7,
          reverseMax: 130,
        };
      }
    }

    const cars = defs.map((d, i) => {
      const gi = (N - 2 - i * 3) % N;
      const p = track.pts[gi];
      const side = (i % 2 === 0 ? 1 : -1) * 22;
      return {
        name: d.name, color: d.color, isPlayer: d.isPlayer, skill: d.skill,
        r: 14, m: 1,
        x: p.x - p.ty * side,
        y: p.y + p.tx * side,
        heading: Math.atan2(p.ty, p.tx),
        vx: 0, vy: 0,
        wp: gi,
        npIndex: gi, npDist: 0,
        lap: 1, prevProgress: gi / N, crossedHalf: false,
        progress: gi / N,
        finished: false, finishTime: 0,
        offTrack: false, collisions: 0,
      };
    });

    // Waypoint-following AI: steer toward a lookahead point on the centerline,
    // lift/brake when the track bends sharply ahead, resync if knocked off line.
    function aiInput(car) {
      const ahead = (car.npIndex - car.wp + N) % N;
      if (ahead > 1) car.wp = car.npIndex;
      else if (ahead === 1) car.wp = (car.wp + 1) % N;
      const target = track.pts[(car.wp + 3) % N];
      const desired = Math.atan2(target.y - car.y, target.x - car.x);
      const diff = normAngle(desired - car.heading);
      const steer = Math.max(-1, Math.min(1, diff * 2.4));
      let throttle = 1, brake = 0;
      const far = track.pts[(car.wp + 14) % N];
      const farDiff = Math.abs(normAngle(Math.atan2(far.y - car.y, far.x - car.x) - car.heading));
      if (farDiff > 1.15) { throttle = 0; brake = 0.7; }
      else if (farDiff > 0.6) throttle = 0.5;
      if (car.offTrack) { throttle = 1; brake = 0; }
      return { throttle, brake, steer };
    }

    function stepCar(car, input, dt) {
      const sk = car.skill;
      let cos = Math.cos(car.heading), sin = Math.sin(car.heading);
      let fwd = car.vx * cos + car.vy * sin;
      let latX = car.vx - cos * fwd;
      let latY = car.vy - sin * fwd;

      if (input.throttle > 0) fwd += sk.accel * input.throttle * dt;
      if (input.brake > 0) {
        if (fwd > 1) fwd -= sk.brake * input.brake * dt;
        else fwd -= sk.accel * 0.45 * input.brake * dt;
      }
      fwd -= fwd * sk.drag * dt;
      fwd = Math.max(-sk.reverseMax, Math.min(sk.maxSpeed, fwd));

      const gf = Math.exp(-sk.grip * dt);
      latX *= gf;
      latY *= gf;

      const speedFactor = Math.min(1, Math.abs(fwd) / 130);
      car.heading += input.steer * sk.steerRate * speedFactor * (fwd >= 0 ? 1 : -1) * dt;

      cos = Math.cos(car.heading);
      sin = Math.sin(car.heading);
      car.vx = cos * fwd + latX;
      car.vy = sin * fwd + latY;

      const np = nearestPoint(track, car.x, car.y);
      car.npIndex = np.index;
      car.npDist = np.dist;
      car.offTrack = np.dist > track.halfWidth;
      if (car.offTrack) {
        const g = Math.exp(-2.8 * dt);
        car.vx *= g;
        car.vy *= g;
        const sp = Math.hypot(car.vx, car.vy);
        if (sp > 150) { car.vx *= 150 / sp; car.vy *= 150 / sp; }
      }

      car.x += car.vx * dt;
      car.y += car.vy * dt;
    }

    // Simple impulse resolution between circle colliders.
    function resolveCollisions() {
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i], b = cars[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const min = a.r + b.r;
          if (d2 < min * min && d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            const overlap = (min - d) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            const velN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (velN < 0) {
              const e = 0.35;
              const jimp = (-(1 + e) * velN) / (1 / a.m + 1 / b.m);
              a.vx -= (jimp * nx) / a.m;
              a.vy -= (jimp * ny) / a.m;
              b.vx += (jimp * nx) / b.m;
              b.vy += (jimp * ny) / b.m;
              a.collisions++;
              b.collisions++;
            }
          }
        }
      }
    }

    // Lap detection: crossing the start line only counts if the car has
    // crossed the halfway point of the current lap (prevents reverse-cheating).
    function updateLaps() {
      for (const car of cars) {
        if (car.finished) continue;
        const progress = car.npIndex / N;
        const crossedLine = car.prevProgress > 0.85 && progress < 0.15;
        if (crossedLine) {
          if (car.crossedHalf) {
            car.lap++;
            if (car.lap > TOTAL_LAPS) {
              car.finished = true;
              car.finishTime = sim.raceTime;
            }
          }
          car.crossedHalf = false;
        }
        if (progress > 0.5 && progress < 0.95) car.crossedHalf = true;
        car.prevProgress = progress;
        car.progress = progress;
      }
    }

    function rankCars() {
      const order = cars.map((c, i) => ({
        i,
        key: c.finished ? 1e6 - c.finishTime : c.lap * 1000 + c.progress,
      }));
      order.sort((a, b) => b.key - a.key);
      sim.positions = order.map((o) => o.i);
    }

    const sim = {
      seed,
      track,
      cars,
      phase: "countdown",
      countdown: 3.0,
      raceTime: 0,
      playerInput: { throttle: 0, brake: 0, steer: 0 },
      positions: cars.map((_, i) => i),
    };

    sim.step = function (dt) {
      if (sim.phase === "countdown") {
        sim.countdown -= dt;
        if (sim.countdown <= 0) {
          sim.countdown = 0;
          sim.phase = "racing";
        }
        return;
      }
      if (sim.phase !== "racing") return;
      sim.raceTime += dt;

      for (const car of cars) {
        let input;
        if (car.finished) input = { throttle: 0, brake: 1, steer: 0 };
        else if (car.isPlayer) input = sim.playerInput;
        else input = aiInput(car);
        stepCar(car, input, dt);
      }
      resolveCollisions();
      updateLaps();
      rankCars();

      if (cars.every((c) => c.finished)) sim.phase = "finished";
      else if (cars[0].finished && sim.raceTime > cars[0].finishTime + 8) sim.phase = "finished";
    };

    return sim;
  }

  return { createSim, DT, TOTAL_LAPS, mulberry32 };
});
