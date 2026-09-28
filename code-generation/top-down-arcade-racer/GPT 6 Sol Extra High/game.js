(() => {
  'use strict';

  const WORLD = { width: 1200, height: 760 };
  const FIXED_DT = 1 / 120;
  const TOTAL_LAPS = 3;
  const ROAD_WIDTH = 112;
  const CAR_RADIUS = 18;
  const DEFAULT_SEED = 240924;
  const CONTROL_POINTS = [
    [595, 130], [810, 105], [1000, 165], [1070, 300],
    [1025, 455], [910, 575], [730, 610], [565, 560],
    [430, 620], [260, 575], [155, 465], [170, 325],
    [290, 215], [440, 205]
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    lap: document.getElementById('lap'),
    time: document.getElementById('time'),
    bestLap: document.getElementById('best-lap'),
    speed: document.getElementById('speed'),
    position: document.getElementById('position'),
    standings: document.getElementById('standings'),
    message: document.getElementById('center-message'),
    eyebrow: document.getElementById('message-eyebrow'),
    main: document.getElementById('message-main'),
    foot: document.getElementById('message-foot'),
    seed: document.getElementById('seed-label')
  };

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function wrap(value, length) {
    return ((value % length) + length) % length;
  }

  function angleDelta(target, current) {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
  }

  // A string seed is hashed, so ?seed=championship and ?seed=123 both repeat exactly.
  function getSeed() {
    const raw = new URLSearchParams(location.search).get('seed');
    if (raw === null || raw === '') return DEFAULT_SEED;
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function catmullRom(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * b) + (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3);
  }

  function makeTrack() {
    const points = [];
    const count = CONTROL_POINTS.length;
    const subdivisions = 20;
    for (let i = 0; i < count; i++) {
      const p0 = CONTROL_POINTS[(i - 1 + count) % count];
      const p1 = CONTROL_POINTS[i];
      const p2 = CONTROL_POINTS[(i + 1) % count];
      const p3 = CONTROL_POINTS[(i + 2) % count];
      for (let j = 0; j < subdivisions; j++) {
        const t = j / subdivisions;
        points.push({
          x: catmullRom(p0[0], p1[0], p2[0], p3[0], t),
          y: catmullRom(p0[1], p1[1], p2[1], p3[1], t),
          s: 0,
          length: 0
        });
      }
    }
    let totalLength = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      current.s = totalLength;
      current.length = Math.hypot(next.x - current.x, next.y - current.y);
      totalLength += current.length;
    }
    return { points, length: totalLength };
  }

  const track = makeTrack();

  function pointAt(distance) {
    const s = wrap(distance, track.length);
    const points = track.points;
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (points[mid].s <= s) low = mid;
      else high = mid - 1;
    }
    const a = points[low];
    const b = points[(low + 1) % points.length];
    const t = (s - a.s) / a.length;
    const tx = (b.x - a.x) / a.length;
    const ty = (b.y - a.y) / a.length;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      tx, ty, nx: -ty, ny: tx,
      angle: Math.atan2(ty, tx)
    };
  }

  function projectToTrack(x, y) {
    const points = track.points;
    let closest = null;
    let bestDistance2 = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) /
        (a.length * a.length), 0, 1);
      const qx = a.x + t * dx;
      const qy = a.y + t * dy;
      const ex = x - qx;
      const ey = y - qy;
      const distance2 = ex * ex + ey * ey;
      if (distance2 < bestDistance2) {
        bestDistance2 = distance2;
        closest = {
          x: qx, y: qy, s: a.s + t * a.length,
          distance: Math.sqrt(distance2),
          outwardX: 0, outwardY: 0,
          tx: dx / a.length, ty: dy / a.length
        };
        if (distance2 > 0.000001) {
          closest.outwardX = ex / closest.distance;
          closest.outwardY = ey / closest.distance;
        }
      }
    }
    return closest;
  }

  const seed = getSeed();
  ui.seed.textContent = `SEED ${seed}`;
  let random = seededRandom(seed);
  let cars = [];
  let player;
  let phase = 'countdown';
  let phaseTimer = 3.35;
  let raceTime = 0;
  let paused = false;
  let lastFrame = 0;
  let accumulator = 0;
  let scenery;

  const keys = new Set();
  const touch = new Set();
  const keyMap = {
    ArrowUp: 'accelerate', KeyW: 'accelerate',
    ArrowDown: 'brake', KeyS: 'brake', Space: 'brake',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  function isDown(control) {
    return touch.has(control) || [...keys].some(code => keyMap[code] === control);
  }

  function makeCar(name, number, color, startS, lane, isPlayer) {
    const start = pointAt(startS);
    return {
      name, number, color, isPlayer,
      x: start.x + start.nx * lane,
      y: start.y + start.ny * lane,
      angle: start.angle,
      vx: 0, vy: 0,
      progress: startS,
      lastProgress: startS,
      laps: 0,
      nextCheckpoint: 0,
      lapStart: 0,
      bestLap: Infinity,
      finishTime: null,
      lane: isPlayer ? 0 : lane * 0.5,
      pace: isPlayer ? 0 : random() * 24 - 12
    };
  }

  function resetRace() {
    random = seededRandom(seed);
    scenery = makeScenery(random);
    player = makeCar('YOU', '01', '#d7ef4e', 52, -19, true);
    cars = [
      player,
      makeCar('NOVA', '02', '#ff6c61', 86, 19, false),
      makeCar('VEX', '03', '#6bd8ea', 122, -19, false),
      makeCar('RIFT', '04', '#ffb357', 158, 19, false)
    ];
    phase = 'countdown';
    phaseTimer = 3.35;
    raceTime = 0;
    paused = false;
    accumulator = 0;
    keys.clear();
    touch.clear();
    document.querySelectorAll('.touch-controls button').forEach(button => button.classList.remove('pressed'));
    updateHud();
  }

  function playerControls() {
    return {
      throttle: isDown('accelerate') ? 1 : 0,
      brake: isDown('brake') ? 1 : 0,
      steer: Number(isDown('right')) - Number(isDown('left'))
    };
  }

  function aiControls(car) {
    const speed = Math.hypot(car.vx, car.vy);
    const lookahead = 72 + speed * 0.28;
    const target = pointAt(car.progress + lookahead);
    const targetX = target.x + target.nx * car.lane;
    const targetY = target.y + target.ny * car.lane;
    const desiredAngle = Math.atan2(targetY - car.y, targetX - car.x);
    const error = angleDelta(desiredAngle, car.angle);
    const further = pointAt(car.progress + lookahead + 95);
    const bend = Math.abs(angleDelta(further.angle, target.angle));
    const targetSpeed = 255 + car.pace - Math.min(75, bend * 155);
    return {
      throttle: speed < targetSpeed - 7 ? 1 : 0,
      brake: speed > targetSpeed + 10 ? 1 : 0,
      steer: clamp(error * 2.8, -1, 1)
    };
  }

  function drive(car, input, dt) {
    const oldForwardX = Math.cos(car.angle);
    const oldForwardY = Math.sin(car.angle);
    const oldRightX = -oldForwardY;
    const oldRightY = oldForwardX;
    let forwardSpeed = car.vx * oldForwardX + car.vy * oldForwardY;
    let sideSpeed = car.vx * oldRightX + car.vy * oldRightY;

    const steeringPower = 0.48 + 1.95 * Math.min(Math.abs(forwardSpeed) / 190, 1);
    car.angle += input.steer * steeringPower * Math.sign(forwardSpeed || 1) * dt;

    let acceleration = input.throttle * 300;
    if (input.brake) acceleration -= forwardSpeed > 8 ? 450 : 165;
    acceleration -= forwardSpeed * 0.55 + forwardSpeed * Math.abs(forwardSpeed) * 0.0014;
    forwardSpeed = clamp(forwardSpeed + acceleration * dt, -75, 320);
    sideSpeed *= Math.exp(-8.5 * dt);

    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    car.vx = fx * forwardSpeed - fy * sideSpeed;
    car.vy = fy * forwardSpeed + fx * sideSpeed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
  }

  function resolveCarCollisions() {
    const minDistance = CAR_RADIUS * 2;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (a.finishTime !== null || b.finishTime !== null) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= minDistance) continue;
        const nx = distance > 0.0001 ? dx / distance : 1;
        const ny = distance > 0.0001 ? dy / distance : 0;
        const overlap = minDistance - distance;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        // Equal masses and a small restitution make contact lively without a physics engine.
        const closingSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closingSpeed < 0) {
          const impulse = -(1 + 0.25) * closingSpeed / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
        }
      }
    }
  }

  function resolveRoadBoundary(car) {
    const nearest = projectToTrack(car.x, car.y);
    const limit = ROAD_WIDTH / 2 - CAR_RADIUS + 2;
    if (nearest.distance > limit) {
      const nx = nearest.outwardX || -nearest.ty;
      const ny = nearest.outwardY || nearest.tx;
      car.x = nearest.x + nx * limit;
      car.y = nearest.y + ny * limit;
      const outwardSpeed = car.vx * nx + car.vy * ny;
      if (outwardSpeed > 0) {
        car.vx -= (1 + 0.35) * outwardSpeed * nx;
        car.vy -= (1 + 0.35) * outwardSpeed * ny;
        car.vx *= 0.83;
        car.vy *= 0.83;
      }
    }
    return projectToTrack(car.x, car.y);
  }

  function crossedForward(previous, current, marker) {
    return previous < marker && current >= marker && current - previous < track.length * 0.25;
  }

  function updateLap(car, projection) {
    const previous = car.progress;
    const current = wrap(projection.s, track.length);
    car.lastProgress = previous;
    car.progress = current;
    if (car.finishTime !== null) return;

    const checkpoints = [0.25, 0.5, 0.75];
    if (car.nextCheckpoint < checkpoints.length &&
        crossedForward(previous, current, checkpoints[car.nextCheckpoint] * track.length)) {
      car.nextCheckpoint++;
    }

    const crossedFinish = previous > track.length * 0.8 && current < track.length * 0.2;
    const movingForward = car.vx * projection.tx + car.vy * projection.ty > 10;
    if (crossedFinish && movingForward && car.nextCheckpoint === checkpoints.length) {
      car.laps++;
      car.bestLap = Math.min(car.bestLap, raceTime - car.lapStart);
      car.lapStart = raceTime;
      car.nextCheckpoint = 0;
      if (car.laps >= TOTAL_LAPS) {
        car.finishTime = raceTime;
        if (car.isPlayer) phase = 'finished';
      }
    }
  }

  function step(dt) {
    if (paused || phase === 'finished') return;
    if (phase === 'countdown') {
      phaseTimer -= dt;
      if (phaseTimer <= 0) {
        phase = 'racing';
        phaseTimer = 0.75;
      }
      return;
    }

    raceTime += dt;
    if (phaseTimer > 0) phaseTimer -= dt;
    for (const car of cars) {
      if (car.finishTime !== null) continue;
      drive(car, car.isPlayer ? playerControls() : aiControls(car), dt);
    }
    resolveCarCollisions();
    for (const car of cars) updateLap(car, resolveRoadBoundary(car));
  }

  function sortedCars() {
    return [...cars].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      const aDistance = a.finishTime !== null ? TOTAL_LAPS * track.length : a.laps * track.length + a.progress;
      const bDistance = b.finishTime !== null ? TOTAL_LAPS * track.length : b.laps * track.length + b.progress;
      return bDistance - aDistance;
    });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--.--';
    const centiseconds = Math.floor(seconds * 100 + 0.0001);
    const minutes = Math.floor(centiseconds / 6000);
    const remainder = centiseconds % 6000;
    return `${String(minutes).padStart(2, '0')}:${String(Math.floor(remainder / 100)).padStart(2, '0')}.${String(remainder % 100).padStart(2, '0')}`;
  }

  function updateHud() {
    const order = sortedCars();
    ui.position.textContent = String(order.indexOf(player) + 1);
    ui.lap.textContent = `${Math.min(player.laps + 1, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
    ui.time.textContent = formatTime(raceTime);
    ui.bestLap.textContent = formatTime(player.bestLap);
    ui.speed.textContent = String(Math.round(Math.max(0, player.vx * Math.cos(player.angle) + player.vy * Math.sin(player.angle)) * 0.9));
    ui.standings.innerHTML = order.map((car, index) =>
      `<li><span class="standings-rank">${index + 1}</span><span class="swatch" style="background:${car.color}"></span><span class="${car.isPlayer ? 'player-name' : ''}">${car.name}</span><span class="standings-lap">${car.finishTime !== null ? 'FIN' : `L${Math.min(car.laps + 1, TOTAL_LAPS)}`}</span></li>`
    ).join('');

    if (paused) {
      setMessage('RACE PAUSED', 'PAUSE', 'Press P to continue');
    } else if (phase === 'countdown') {
      setMessage('GET READY', String(Math.max(1, Math.ceil(phaseTimer))), '3 laps · 4 drivers');
    } else if (phase === 'finished') {
      setMessage('FINISH LINE', `${order.indexOf(player) + 1}${ordinal(order.indexOf(player) + 1)}`, `${formatTime(player.finishTime)} · Press R to race again`);
    } else if (phaseTimer > 0) {
      setMessage('LIGHTS OUT', 'GO!', 'Make every corner count');
    } else {
      ui.message.classList.add('hidden');
    }
  }

  function ordinal(place) {
    return ['','st','nd','rd','th'][place] || 'th';
  }

  function setMessage(eyebrow, main, foot) {
    ui.message.classList.remove('hidden');
    ui.eyebrow.textContent = eyebrow;
    ui.main.textContent = main;
    ui.foot.textContent = foot;
  }

  function traceTrack(context) {
    context.beginPath();
    context.moveTo(track.points[0].x, track.points[0].y);
    for (let i = 1; i < track.points.length; i++) {
      context.lineTo(track.points[i].x, track.points[i].y);
    }
    context.closePath();
  }

  function offsetTrace(context, offset) {
    context.beginPath();
    const first = pointAt(0);
    context.moveTo(first.x + first.nx * offset, first.y + first.ny * offset);
    for (const p of track.points) {
      const at = pointAt(p.s);
      context.lineTo(at.x + at.nx * offset, at.y + at.ny * offset);
    }
    context.closePath();
  }

  function drawStartLine(context) {
    const at = pointAt(0);
    context.save();
    context.translate(at.x, at.y);
    context.rotate(at.angle);
    const columns = 12;
    const cell = ROAD_WIDTH / columns;
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < columns; column++) {
        context.fillStyle = (row + column) % 2 ? '#1d2526' : '#f6f8e9';
        context.fillRect((row - 1) * cell, (column - columns / 2) * cell, cell + 0.4, cell + 0.4);
      }
    }
    context.restore();
  }

  function makeScenery(rng) {
    const layer = document.createElement('canvas');
    layer.width = WORLD.width;
    layer.height = WORLD.height;
    const context = layer.getContext('2d');
    context.fillStyle = '#416a48';
    context.fillRect(0, 0, WORLD.width, WORLD.height);

    // Seeded grass and shrubs are baked into a layer once per race.
    for (let i = 0; i < 1800; i++) {
      const x = rng() * WORLD.width;
      const y = rng() * WORLD.height;
      const size = 1 + rng() * 4;
      context.fillStyle = rng() > 0.5 ? '#6e9255' : '#355c3b';
      context.globalAlpha = 0.12 + rng() * 0.13;
      context.beginPath();
      context.ellipse(x, y, size * 2, size, -0.4, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (let i = 0; i < 120; i++) {
      const x = 30 + rng() * (WORLD.width - 60);
      const y = 30 + rng() * (WORLD.height - 60);
      if (projectToTrack(x, y).distance < ROAD_WIDTH / 2 + 34) continue;
      const radius = 3 + rng() * 6;
      context.fillStyle = '#213e31';
      context.beginPath();
      context.arc(x + 2, y + 3, radius + 1, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = rng() > 0.5 ? '#315e3b' : '#537d4c';
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#6d9658';
      context.beginPath();
      context.arc(x - radius * 0.2, y - radius * 0.25, radius * 0.4, 0, Math.PI * 2);
      context.fill();
    }

    context.lineJoin = 'round';
    context.lineCap = 'round';
    const layers = [
      { width: ROAD_WIDTH + 26, color: '#254936' },
      { width: ROAD_WIDTH + 14, color: '#c9d0ba' },
      { width: ROAD_WIDTH + 2, color: '#596261' },
      { width: ROAD_WIDTH - 3, color: '#303a3c' }
    ];
    for (const style of layers) {
      traceTrack(context);
      context.strokeStyle = style.color;
      context.lineWidth = style.width;
      context.stroke();
    }

    for (const side of [-1, 1]) {
      offsetTrace(context, side * (ROAD_WIDTH / 2 - 2));
      context.strokeStyle = '#a7b7ae';
      context.globalAlpha = 0.45;
      context.lineWidth = 1.5;
      context.stroke();
      context.globalAlpha = 1;
      for (let s = 0, index = 0; s < track.length; s += 31, index++) {
        const a = pointAt(s);
        const b = pointAt(s + 23);
        const offset = side * (ROAD_WIDTH / 2 + 3);
        context.beginPath();
        context.moveTo(a.x + a.nx * offset, a.y + a.ny * offset);
        context.lineTo(b.x + b.nx * offset, b.y + b.ny * offset);
        context.strokeStyle = index % 2 ? '#f4e8d8' : '#df5d50';
        context.lineWidth = 9;
        context.stroke();
      }
    }

    traceTrack(context);
    context.setLineDash([15, 30]);
    context.strokeStyle = '#aec1b0';
    context.globalAlpha = 0.25;
    context.lineWidth = 2;
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;

    for (const fraction of [0.25, 0.5, 0.75]) {
      const at = pointAt(track.length * fraction);
      context.beginPath();
      context.moveTo(at.x - at.nx * (ROAD_WIDTH / 2 - 5), at.y - at.ny * (ROAD_WIDTH / 2 - 5));
      context.lineTo(at.x + at.nx * (ROAD_WIDTH / 2 - 5), at.y + at.ny * (ROAD_WIDTH / 2 - 5));
      context.strokeStyle = '#ddf487';
      context.globalAlpha = 0.45;
      context.lineWidth = 2;
      context.setLineDash([6, 6]);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
    }
    drawStartLine(context);
    return layer;
  }

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.isPlayer) {
      ctx.fillStyle = '#d7ef4e35';
      ctx.beginPath();
      ctx.ellipse(0, 0, 31, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#121a1b77';
    ctx.fillRect(-18 + 3, -12 + 4, 39, 26);
    ctx.fillStyle = '#121819';
    for (const x of [-12, 12]) {
      ctx.fillRect(x - 5, -16, 10, 5);
      ctx.fillRect(x - 5, 11, 10, 5);
    }
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.moveTo(-21, -10);
    ctx.lineTo(11, -10);
    ctx.lineTo(21, -6);
    ctx.lineTo(21, 6);
    ctx.lineTo(11, 10);
    ctx.lineTo(-21, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#10191c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#243c40';
    ctx.fillRect(-6, -8, 12, 16);
    ctx.fillStyle = '#a8d4cf';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(-4, -7, 3, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f5f1d1';
    ctx.fillRect(17, -7, 3, 4);
    ctx.fillRect(17, 3, 3, 4);
    ctx.fillStyle = '#eb524e';
    ctx.fillRect(-21, -7, 2, 4);
    ctx.fillRect(-21, 3, 2, 4);
    ctx.restore();

    if (car.isPlayer) {
      ctx.fillStyle = '#162420d9';
      ctx.beginPath();
      ctx.roundRect(car.x - 13, car.y - 37, 26, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#e9f6d4';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', car.x, car.y - 26);
    }
  }

  function render() {
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    ctx.drawImage(scenery, 0, 0);
    for (const car of cars) {
      if (car.isPlayer || car.finishTime === null) drawCar(car);
    }
    updateHud();
  }

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    accumulator += Math.min((now - lastFrame) / 1000, 0.12);
    lastFrame = now;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 12) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === 12) accumulator = 0;
    render();
    requestAnimationFrame(frame);
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(WORLD.width * ratio);
    canvas.height = Math.round(WORLD.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  window.addEventListener('keydown', event => {
    if (keyMap[event.code]) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.repeat) return;
    if (event.code === 'KeyR') resetRace();
    if (event.code === 'KeyP') {
      paused = !paused;
      updateHud();
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  document.getElementById('restart-button').addEventListener('click', resetRace);

  for (const button of document.querySelectorAll('.touch-controls button')) {
    const control = button.dataset.control;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touch.add(control);
      button.classList.add('pressed');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, () => {
        touch.delete(control);
        button.classList.remove('pressed');
      });
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  resetRace();
  requestAnimationFrame(frame);
})();
