(() => {
  "use strict";

  const WIDTH = 1200;
  const HEIGHT = 800;
  const FIXED_DT = 1 / 120;
  const SEED = 0x5eedc0de;
  const ROAD_HALF_WIDTH = 76;
  const LAPS_TO_WIN = 3;

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const lapReadout = document.querySelector("#lap");
  const timeReadout = document.querySelector("#time");
  const positionReadout = document.querySelector("#position");
  const speedReadout = document.querySelector("#speed");
  const stateLabel = document.querySelector("#state-label");
  const stateLight = document.querySelector("#state-light");
  const pauseButton = document.querySelector("#pause-button");
  const resetButton = document.querySelector("#reset-button");

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = seededRandom(SEED);

  const controls = [
    { x: 590, y: 111 }, { x: 785, y: 112 }, { x: 930, y: 132 },
    { x: 1030, y: 183 }, { x: 1072, y: 272 }, { x: 1081, y: 390 },
    { x: 1076, y: 510 }, { x: 1040, y: 599 }, { x: 974, y: 655 },
    { x: 865, y: 683 }, { x: 710, y: 694 }, { x: 525, y: 690 },
    { x: 355, y: 676 }, { x: 230, y: 641 }, { x: 151, y: 581 },
    { x: 116, y: 487 }, { x: 113, y: 368 }, { x: 130, y: 278 },
    { x: 184, y: 207 }, { x: 274, y: 157 }, { x: 405, y: 126 },
    { x: 510, y: 112 }
  ];

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  function buildTrack() {
    const points = [];
    const stepsPerCurve = 18;
    for (let i = 0; i < controls.length; i += 1) {
      const p0 = controls[(i - 1 + controls.length) % controls.length];
      const p1 = controls[i];
      const p2 = controls[(i + 1) % controls.length];
      const p3 = controls[(i + 2) % controls.length];
      for (let step = 0; step < stepsPerCurve; step += 1) {
        points.push(catmullRom(p0, p1, p2, p3, step / stepsPerCurve));
      }
    }
    let length = 0;
    for (let i = 0; i < points.length; i += 1) {
      if (i > 0) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      points[i].s = length;
    }
    length += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
    return { points, length };
  }

  const track = buildTrack();
  const trackPoints = track.points;

  function normalize(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function segmentAt(index) {
    const a = trackPoints[index];
    const b = trackPoints[(index + 1) % trackPoints.length];
    return { a, b, dx: b.x - a.x, dy: b.y - a.y };
  }

  function projectToTrack(x, y) {
    let bestDistanceSq = Infinity;
    let best = null;
    for (let i = 0; i < trackPoints.length; i += 1) {
      const segment = segmentAt(i);
      const lengthSq = segment.dx * segment.dx + segment.dy * segment.dy;
      const u = Math.max(0, Math.min(1, ((x - segment.a.x) * segment.dx + (y - segment.a.y) * segment.dy) / lengthSq));
      const px = segment.a.x + segment.dx * u;
      const py = segment.a.y + segment.dy * u;
      const ox = x - px;
      const oy = y - py;
      const distanceSq = ox * ox + oy * oy;
      if (distanceSq < bestDistanceSq) {
        const tangent = normalize(segment.dx, segment.dy);
        const normal = { x: -tangent.y, y: tangent.x };
        const segmentEndS = i === trackPoints.length - 1 ? track.length : trackPoints[i + 1].s;
        bestDistanceSq = distanceSq;
        best = {
          x: px,
          y: py,
          distance: Math.sqrt(distanceSq),
          lateral: ox * normal.x + oy * normal.y,
          tangent,
          normal,
          s: segment.a.s + (segmentEndS - segment.a.s) * u
        };
      }
    }
    return best;
  }

  function pointAtDistance(distance) {
    let s = ((distance % track.length) + track.length) % track.length;
    let low = 0;
    let high = trackPoints.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (trackPoints[mid].s <= s) low = mid;
      else high = mid - 1;
    }
    const index = low;
    const segment = segmentAt(index);
    const segmentEndS = index === trackPoints.length - 1 ? track.length : trackPoints[index + 1].s;
    const span = segmentEndS - trackPoints[index].s || 1;
    const u = (s - trackPoints[index].s) / span;
    return { x: segment.a.x + segment.dx * u, y: segment.a.y + segment.dy * u };
  }

  function offsetTrack(distance) {
    const result = [];
    for (let i = 0; i < trackPoints.length; i += 1) {
      const before = trackPoints[(i - 1 + trackPoints.length) % trackPoints.length];
      const after = trackPoints[(i + 1) % trackPoints.length];
      const tangent = normalize(after.x - before.x, after.y - before.y);
      result.push({ x: trackPoints[i].x - tangent.y * distance, y: trackPoints[i].y + tangent.x * distance });
    }
    return result;
  }

  function strokeLoop(points, color, width, dash = [], dashOffset = 0) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineDashOffset = dashOffset;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  const scenery = [];
  for (let i = 0; i < 255; i += 1) {
    const item = { x: 22 + random() * (WIDTH - 44), y: 22 + random() * (HEIGHT - 44), radius: 1.2 + random() * 3.4, tone: random() };
    if (projectToTrack(item.x, item.y).distance > ROAD_HALF_WIDTH + 28) scenery.push(item);
  }

  const start = trackPoints[0];
  const startProjection = projectToTrack(start.x, start.y);
  const startTangent = startProjection.tangent;
  const startNormal = startProjection.normal;

  function makeCar(id, name, color, isPlayer, lane, gridAdvance, skill) {
    const x = start.x + startTangent.x * gridAdvance + startNormal.x * lane;
    const y = start.y + startTangent.y * gridAdvance + startNormal.y * lane;
    const projection = projectToTrack(x, y);
    return {
      id, name, color, isPlayer, lane, skill,
      x, y, gridAdvance,
      vx: 0, vy: 0,
      heading: Math.atan2(startTangent.y, startTangent.x),
      radius: 17,
      mass: isPlayer ? 1.08 : 1,
      lap: 0,
      progress: projection.s,
      routeDistance: projection.s,
      gateSide: (x - start.x) * startTangent.x + (y - start.y) * startTangent.y,
      finished: false,
      finishTime: null,
      aiOffset: (random() - 0.5) * 12,
      aiSkill: skill
    };
  }

  const cars = [
    makeCar(0, "YOU", "#e8d957", true, -24, 70, 1),
    makeCar(1, "NOVA", "#ed6954", false, -24, 25, 0.97 + random() * 0.06),
    makeCar(2, "MILES", "#70b9d2", false, 24, 25, 0.96 + random() * 0.07),
    makeCar(3, "KITE", "#d39ae2", false, 24, 70, 0.96 + random() * 0.06)
  ];

  const keys = Object.create(null);
  let raceTime = 0;
  let paused = false;
  let raceFinished = false;
  let finalPosition = null;
  let finalTime = null;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function wrapAngle(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }

  function getPlayerInput() {
    return {
      throttle: keys.throttle || keys.w || keys.ArrowUp ? 1 : 0,
      brake: keys.brake || keys.s || keys.ArrowDown ? 1 : 0,
      steer: (keys.right || keys.d || keys.ArrowRight ? 1 : 0) - (keys.left || keys.a || keys.ArrowLeft ? 1 : 0)
    };
  }

  function getAiInput(car, projection) {
    const speed = Math.hypot(car.vx, car.vy);
    const lookahead = 78 + Math.min(speed, 330) * 0.28;
    const target = pointAtDistance(projection.s + lookahead + car.aiOffset);
    const desiredHeading = Math.atan2(target.y - car.y, target.x - car.x);
    const headingError = wrapAngle(desiredHeading - car.heading);
    const steer = clamp(headingError * 1.65, -1, 1);

    const farTarget = pointAtDistance(projection.s + lookahead + 170);
    const farHeading = Math.atan2(farTarget.y - target.y, farTarget.x - target.x);
    const bend = Math.abs(wrapAngle(farHeading - desiredHeading));
    const targetSpeed = Math.min(340, (300 - bend * 105) * car.aiSkill);
    const forwardSpeed = car.vx * Math.cos(car.heading) + car.vy * Math.sin(car.heading);
    return forwardSpeed < targetSpeed - 8 ? { throttle: 1, brake: 0, steer } : { throttle: 0, brake: 1, steer };
  }

  function updateCar(car, dt) {
    let projection = projectToTrack(car.x, car.y);
    let input = car.isPlayer ? getPlayerInput() : getAiInput(car, projection);
    if (car.finished || (car.isPlayer && raceFinished)) input = { throttle: 0, brake: 0, steer: 0 };

    const forward = { x: Math.cos(car.heading), y: Math.sin(car.heading) };
    const right = { x: -forward.y, y: forward.x };
    let forwardSpeed = car.vx * forward.x + car.vy * forward.y;
    let sideSpeed = car.vx * right.x + car.vy * right.y;
    const onRoad = projection.distance <= ROAD_HALF_WIDTH - car.radius + 3;

    let acceleration = input.throttle * 505;
    if (input.brake) acceleration -= forwardSpeed > 12 ? 920 : 310;
    const maxForwardSpeed = car.isPlayer ? 410 : 360;
    forwardSpeed += acceleration * dt;
    forwardSpeed -= (0.28 * forwardSpeed + 0.00092 * forwardSpeed * Math.abs(forwardSpeed)) * dt;
    forwardSpeed = clamp(forwardSpeed, -112, maxForwardSpeed);

    const grip = onRoad ? 5.1 : 1.15;
    sideSpeed *= Math.exp(-grip * dt);
    const yawSpeedFactor = 0.18 + 0.82 * Math.min(Math.abs(forwardSpeed) / 190, 1);
    const travelDirection = forwardSpeed < -2 ? -1 : 1;
    car.heading += input.steer * 2.65 * yawSpeedFactor * travelDirection * dt;

    const nextForward = { x: Math.cos(car.heading), y: Math.sin(car.heading) };
    const nextRight = { x: -nextForward.y, y: nextForward.x };
    car.vx = nextForward.x * forwardSpeed + nextRight.x * sideSpeed;
    car.vy = nextForward.y * forwardSpeed + nextRight.y * sideSpeed;
    if (!onRoad) {
      const offroadDrag = Math.exp(-1.15 * dt);
      car.vx *= offroadDrag;
      car.vy *= offroadDrag;
    }

    const previousGateSide = car.gateSide;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    projection = projectToTrack(car.x, car.y);
    car.progress = projection.s;
    car.routeDistance = car.lap * track.length + projection.s;
    car.gateSide = (car.x - start.x) * startTangent.x + (car.y - start.y) * startTangent.y;

    const gateLateral = (car.x - start.x) * startNormal.x + (car.y - start.y) * startNormal.y;
    const crossedFinish = previousGateSide < 0 && car.gateSide >= 0 && Math.abs(gateLateral) < ROAD_HALF_WIDTH - 8;
    if (crossedFinish && car.lap < LAPS_TO_WIN) {
      car.lap += 1;
      car.routeDistance = car.lap * track.length + projection.s;
      if (car.lap === LAPS_TO_WIN) {
        car.finished = true;
        car.finishTime = raceTime;
        if (car.isPlayer && !raceFinished) {
          raceFinished = true;
          finalTime = raceTime;
          finalPosition = getRaceOrder().indexOf(car) + 1;
        }
      }
    }

    const margin = ROAD_HALF_WIDTH - car.radius - 1;
    if (Math.abs(projection.lateral) > margin) {
      const side = Math.sign(projection.lateral);
      const correctedLateral = side * margin;
      car.x = projection.x + projection.normal.x * correctedLateral;
      car.y = projection.y + projection.normal.y * correctedLateral;
      const outwardSpeed = (car.vx * projection.normal.x + car.vy * projection.normal.y) * side;
      if (outwardSpeed > 0) {
        car.vx -= projection.normal.x * side * outwardSpeed * 1.18;
        car.vy -= projection.normal.y * side * outwardSpeed * 1.18;
      }
    }
  }

  function resolveCarCollisions() {
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimumDistance = a.radius + b.radius - 1;
        if (distance >= minimumDistance) continue;
        if (distance < 0.001) {
          const fallbackAngle = (a.id + 1) * 2.17;
          dx = Math.cos(fallbackAngle);
          dy = Math.sin(fallbackAngle);
          distance = 1;
        }
        const nx = dx / distance;
        const ny = dy / distance;
        const inverseMassA = 1 / a.mass;
        const inverseMassB = 1 / b.mass;
        const inverseMassSum = inverseMassA + inverseMassB;
        const overlap = minimumDistance - distance;
        const correction = Math.max(overlap - 0.05, 0) * 0.82 / inverseMassSum;
        a.x -= nx * correction * inverseMassA;
        a.y -= ny * correction * inverseMassA;
        b.x += nx * correction * inverseMassB;
        b.y += ny * correction * inverseMassB;

        const relativeNormalSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relativeNormalSpeed < 0) {
          const impulse = -(1 + 0.38) * relativeNormalSpeed / inverseMassSum;
          a.vx -= nx * impulse * inverseMassA;
          a.vy -= ny * impulse * inverseMassA;
          b.vx += nx * impulse * inverseMassB;
          b.vy += ny * impulse * inverseMassB;
        }
      }
    }
  }

  function getRaceOrder() {
    return [...cars].sort((a, b) => b.routeDistance - a.routeDistance);
  }

  function step(dt) {
    for (const car of cars) updateCar(car, dt);
    resolveCarCollisions();
    raceTime += dt;
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, "#294735");
    gradient.addColorStop(0.52, "#223e2e");
    gradient.addColorStop(1, "#1c3629");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(8, 20, 14, .10)";
    for (let x = 0; x < WIDTH; x += 60) ctx.fillRect(x, 0, 1, HEIGHT);
    for (let y = 0; y < HEIGHT; y += 60) ctx.fillRect(0, y, WIDTH, 1);

    for (const tuft of scenery) {
      ctx.beginPath();
      ctx.arc(tuft.x, tuft.y, tuft.radius, 0, Math.PI * 2);
      ctx.fillStyle = tuft.tone > 0.5 ? "rgba(160, 177, 108, .20)" : "rgba(8, 25, 16, .25)";
      ctx.fill();
    }
  }

  function drawTrack() {
    const infield = trackPoints.map((point, index) => {
      const before = trackPoints[(index - 1 + trackPoints.length) % trackPoints.length];
      const after = trackPoints[(index + 1) % trackPoints.length];
      const tangent = normalize(after.x - before.x, after.y - before.y);
      return { x: point.x - tangent.y * (ROAD_HALF_WIDTH + 17), y: point.y + tangent.x * (ROAD_HALF_WIDTH + 17) };
    });
    ctx.beginPath();
    ctx.moveTo(infield[0].x, infield[0].y);
    for (let i = 1; i < infield.length; i += 1) ctx.lineTo(infield[i].x, infield[i].y);
    ctx.closePath();
    ctx.fillStyle = "rgba(13, 37, 24, .30)";
    ctx.fill();

    strokeLoop(trackPoints, "rgba(5, 13, 10, .42)", 193);
    strokeLoop(trackPoints, "#b8a77a", 168);
    strokeLoop(trackPoints, "#d4c79e", 160);
    strokeLoop(trackPoints, "#303638", 153);
    strokeLoop(trackPoints, "#383e40", 145);

    const edgeOffset = offsetTrack(ROAD_HALF_WIDTH - 2);
    strokeLoop(edgeOffset, "rgba(235, 230, 207, .76)", 2.2);
    strokeLoop(edgeOffset, "#df554a", 10, [19, 17]);
    strokeLoop(edgeOffset, "#f2eee1", 10, [19, 17], -18);
    strokeLoop(trackPoints, "rgba(239, 237, 220, .18)", 1.4, [5, 17]);

    drawFinishLine();
    drawTrackMarkers();
  }

  function drawFinishLine() {
    const tile = 12;
    const rows = 2;
    const across = ROAD_HALF_WIDTH * 2;
    const count = Math.ceil(across / tile);
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(Math.atan2(startTangent.y, startTangent.x));
    for (let i = 0; i < count; i += 1) {
      for (let row = 0; row < rows; row += 1) {
        ctx.fillStyle = (i + row) % 2 ? "#f2f0e6" : "#24292a";
        ctx.fillRect(-tile * rows / 2 + row * tile, -ROAD_HALF_WIDTH + i * tile, tile, tile);
      }
    }
    ctx.restore();
  }

  function drawTrackMarkers() {
    ctx.save();
    ctx.font = "700 10px SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(226, 229, 210, .34)";
    const marker = pointAtDistance(420);
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.atan2(startTangent.y, startTangent.x));
    ctx.fillText("N O R T H   L O O P", 0, -20);
    ctx.restore();

    ctx.save();
    const marshal = pointAtDistance(track.length * 0.42);
    ctx.translate(marshal.x, marshal.y);
    ctx.fillStyle = "rgba(204, 218, 178, .66)";
    ctx.fillRect(-13, -10, 26, 20);
    ctx.fillStyle = "#24332b";
    ctx.font = "700 9px SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("02", 0, 0);
    ctx.restore();
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

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);

    ctx.fillStyle = "rgba(3, 8, 7, .42)";
    roundRect(ctx, -18, -8, 39, 22, 6);
    ctx.fill();

    ctx.fillStyle = "#161a1a";
    roundRect(ctx, -12, -12, 9, 7, 2);
    ctx.fill();
    roundRect(ctx, 8, -12, 9, 7, 2);
    ctx.fill();
    roundRect(ctx, -12, 6, 9, 7, 2);
    ctx.fill();
    roundRect(ctx, 8, 6, 9, 7, 2);
    ctx.fill();

    ctx.fillStyle = car.color;
    roundRect(ctx, -19, -8.5, 38, 17, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, .23)";
    roundRect(ctx, -7, -7, 13, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#263238";
    roundRect(ctx, -5, -6.2, 12, 12.4, 3.5);
    ctx.fill();
    ctx.fillStyle = "rgba(194, 220, 218, .55)";
    roundRect(ctx, 2, -5, 3, 10, 1.5);
    ctx.fill();
    ctx.fillStyle = "#191e1f";
    ctx.fillRect(-17, -10, 4, 20);
    ctx.fillRect(14, -10, 4, 20);
    ctx.fillStyle = "#fff0be";
    ctx.fillRect(17, -6, 2.2, 3.2);
    ctx.fillRect(17, 2.8, 2.2, 3.2);
    ctx.fillStyle = "#ec6b58";
    ctx.fillRect(-19.2, -5.8, 2, 3.3);
    ctx.fillRect(-19.2, 2.5, 2, 3.3);

    if (car.isPlayer) {
      ctx.strokeStyle = "rgba(252, 244, 185, .95)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, -20.5, -10, 41, 20, 6);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.font = "700 8px SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(13, 19, 16, .78)";
    roundRect(ctx, car.x - 17, car.y - 32, 34, 13, 4);
    ctx.fill();
    ctx.fillStyle = car.isPlayer ? "#f6e98c" : "rgba(246, 246, 232, .85)";
    ctx.textBaseline = "middle";
    ctx.fillText(car.name, car.x, car.y - 25.4);
    ctx.restore();
  }

  function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const hundredths = Math.floor((time % 1) * 100);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function updateHud() {
    const player = cars[0];
    const order = getRaceOrder();
    const position = finalPosition || order.indexOf(player) + 1;
    lapReadout.innerHTML = `${String(Math.min(player.lap + 1, LAPS_TO_WIN)).padStart(2, "0")} <small>/ 0${LAPS_TO_WIN}</small>`;
    timeReadout.textContent = formatTime(finalTime ?? raceTime);
    positionReadout.innerHTML = `P${position} <small>/ 04</small>`;
    speedReadout.innerHTML = `${String(Math.round(Math.hypot(player.vx, player.vy) * 0.72)).padStart(3, "0")} <small>km/h</small>`;
    stateLabel.textContent = raceFinished ? `Finished · P${finalPosition}` : paused ? "Paused" : "Racing";
    stateLight.classList.toggle("paused", paused || raceFinished);
    pauseButton.textContent = paused ? "Resume" : "Pause";
  }

  function drawOverlay(title, subtitle) {
    ctx.save();
    ctx.fillStyle = "rgba(8, 14, 12, .56)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f3f1e4";
    ctx.font = "760 39px Inter, system-ui, sans-serif";
    ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 13);
    ctx.fillStyle = "#c0cbb6";
    ctx.font = "12px SFMono-Regular, Consolas, monospace";
    ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 + 27);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawTrack();
    for (const car of cars) drawCar(car);
    if (paused) drawOverlay("PAUSED", "PRESS P OR RESUME TO CONTINUE");
    if (raceFinished) drawOverlay("FINISH", `P${finalPosition}  /  ${formatTime(finalTime)}  ·  PRESS R TO RACE AGAIN`);
    updateHud();
  }

  let previousFrame = 0;
  let accumulator = 0;
  function frame(timestamp) {
    if (!previousFrame) previousFrame = timestamp;
    const frameTime = Math.min((timestamp - previousFrame) / 1000, 0.25);
    previousFrame = timestamp;
    if (!paused && !raceFinished) {
      accumulator += frameTime;
      while (accumulator >= FIXED_DT) {
        step(FIXED_DT);
        accumulator -= FIXED_DT;
      }
    } else {
      accumulator = 0;
    }
    render();
    requestAnimationFrame(frame);
  }

  function setPaused(next) {
    if (raceFinished) return;
    paused = next;
    if (paused) accumulator = 0;
    updateHud();
  }

  function resetRace() {
    raceTime = 0;
    paused = false;
    raceFinished = false;
    finalPosition = null;
    finalTime = null;
    for (const car of cars) {
      car.x = start.x + startTangent.x * car.gridAdvance + startNormal.x * car.lane;
      car.y = start.y + startTangent.y * car.gridAdvance + startNormal.y * car.lane;
      car.vx = 0;
      car.vy = 0;
      car.heading = Math.atan2(startTangent.y, startTangent.x);
      car.lap = 0;
      const projection = projectToTrack(car.x, car.y);
      car.progress = projection.s;
      car.routeDistance = projection.s;
      car.gateSide = (car.x - start.x) * startTangent.x + (car.y - start.y) * startTangent.y;
      car.finished = false;
      car.finishTime = null;
    }
    for (const key of Object.keys(keys)) delete keys[key];
    accumulator = 0;
    updateHud();
  }

  const keyAliases = {
    ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight",
    w: "w", W: "w", a: "a", A: "a", s: "s", S: "s", d: "d", D: "d",
    " ": "brake"
  };

  window.addEventListener("keydown", (event) => {
    const key = keyAliases[event.key];
    if (key) {
      keys[key] = true;
      if (event.key.startsWith("Arrow") || event.key === " ") event.preventDefault();
    }
    if (event.repeat) return;
    if (event.key.toLowerCase() === "p") setPaused(!paused);
    if (event.key.toLowerCase() === "r") resetRace();
  });

  window.addEventListener("keyup", (event) => {
    const key = keyAliases[event.key];
    if (key) keys[key] = false;
  });

  window.addEventListener("blur", () => {
    for (const key of Object.keys(keys)) keys[key] = false;
  });

  pauseButton.addEventListener("click", () => setPaused(!paused));
  resetButton.addEventListener("click", resetRace);

  for (const button of document.querySelectorAll("[data-key]")) {
    const key = button.dataset.key;
    const release = () => { keys[key] = false; button.classList.remove("is-down"); };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      keys[key] = true;
      button.classList.add("is-down");
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  window.addEventListener("resize", () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(WIDTH * pixelRatio);
    canvas.height = Math.round(HEIGHT * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  });
  window.dispatchEvent(new Event("resize"));
  updateHud();
  requestAnimationFrame(frame);
})();
