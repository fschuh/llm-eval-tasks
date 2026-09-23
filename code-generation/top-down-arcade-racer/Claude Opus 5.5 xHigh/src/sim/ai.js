/*
 * AI drivers.
 *
 * Planning (once per race, per driver): A* on the track's clearance grid from checkpoint gate to
 * checkpoint gate, all the way around the lap. Cell cost grows near the walls, and each
 * driver's personality weights that cost differently, so every opponent ends up with its own
 * line. The cell path is string-pulled (line-of-sight shortcutting), resampled and relaxed into
 * a smooth racing line, then a speed profile is computed from its curvature (v = sqrt(a·R))
 * with a backward braking pass.
 *
 * Driving (every tick): waypoint following with pure-pursuit steering toward a look-ahead point
 * on the racing line. On top of that:
 *   - traffic: shift the target sideways to overtake a slower car ahead, or follow it;
 *   - detours: if the straight line to the target is blocked (e.g. after a spin), run a
 *     short A* search and follow the detour until the racing line is visible again;
 *   - recovery: reverse out when pinned against a wall.
 */
(function (Racer) {
  'use strict';
  const M = Racer.M;

  const LINE_SPACING = 20;
  const LOS_BLOCK_CLEARANCE = 8; // below this the direct path to the target counts as blocked
  const NAV_CLEARANCE = 13; // minimum wall distance for runtime detour paths
  const LOOK_FACTORS = [1, 0.6, 0.35]; // look-ahead fallbacks when the full target is hidden
  const FOLLOW_GAP = 56; // centre-to-centre distance kept to a car directly ahead
  const ELBOW_ROOM = 40; // lateral distance an AI tries to keep from a car alongside

  // ---------------------------------------------------------------- racing line

  class RacingLine {
    constructor(track, x, y) {
      const n = x.length;
      this.n = n;
      this.x = x;
      this.y = y;
      this.s = new Float64Array(n);
      this.segLen = new Float64Array(n);
      this.tx = new Float64Array(n);
      this.ty = new Float64Array(n);
      this.radius = new Float64Array(n);
      this.ts = new Float64Array(n); // arc position of each point on the track centerline
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.s[i] = acc;
        this.segLen[i] = M.len(x[j] - x[i], y[j] - y[i]);
        acc += this.segLen[i];
      }
      this.length = acc;
      const proj = {};
      let hint = -1;
      for (let i = 0; i < n; i++) {
        const a = (i - 1 + n) % n, b = (i + 1) % n;
        const tl = M.len(x[b] - x[a], y[b] - y[a]);
        this.tx[i] = (x[b] - x[a]) / tl;
        this.ty[i] = (y[b] - y[a]) / tl;
        const a3 = (i - 3 + n) % n, b3 = (i + 3) % n;
        this.radius[i] = circumradius(x[a3], y[a3], x[i], y[i], x[b3], y[b3]);
        track.project(x[i], y[i], hint, proj);
        hint = proj.i;
        this.ts[i] = proj.s;
      }
    }

    /** Target speed at each point: lateral-grip limit, then a backward pass for braking distance. */
    speedProfile(aLat, aBrake, vMax) {
      const n = this.n, v = new Float64Array(n);
      for (let i = 0; i < n; i++) v[i] = Math.min(vMax, Math.sqrt(aLat * this.radius[i]));
      for (let pass = 0; pass < 2; pass++) {
        for (let i = n - 1; i >= 0; i--) {
          const j = (i + 1) % n;
          v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * aBrake * this.segLen[i]));
        }
      }
      return v;
    }

    /**
     * Index of the line point nearest to (px, py). Searches a window around `hint`; if the car
     * has strayed, re-acquires among points that belong to the same stretch of track.
     */
    nearest(px, py, hint, track, trackS) {
      const n = this.n;
      let best = -1, bestD = Infinity;
      if (hint >= 0) {
        for (let k = -4; k <= 30; k++) {
          const i = (hint + k + n) % n;
          const dx = this.x[i] - px, dy = this.y[i] - py, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        if (bestD < 120 * 120) return best;
      }
      best = -1; bestD = Infinity;
      for (let i = 0; i < n; i++) {
        if (Math.abs(track.deltaS(trackS, this.ts[i])) > 260) continue;
        const dx = this.x[i] - px, dy = this.y[i] - py, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best >= 0 ? best : Math.max(hint, 0);
    }

    /** Point `dist` ahead along the line, measured from the car's projection onto segment idx. */
    pointAhead(idx, px, py, dist, out) {
      const n = this.n;
      let i = idx;
      const j0 = (i + 1) % n;
      const vx = this.x[j0] - this.x[i], vy = this.y[j0] - this.y[i];
      const t0 = M.clamp(((px - this.x[i]) * vx + (py - this.y[i]) * vy) / (vx * vx + vy * vy), 0, 1);
      let remaining = dist + t0 * this.segLen[i];
      for (let guard = 0; guard < n && remaining > this.segLen[i]; guard++) {
        remaining -= this.segLen[i];
        i = (i + 1) % n;
      }
      const j = (i + 1) % n;
      const t = this.segLen[i] > 0 ? remaining / this.segLen[i] : 0;
      out.x = M.lerp(this.x[i], this.x[j], t);
      out.y = M.lerp(this.y[i], this.y[j], t);
      out.i = i;
      out.nx = -this.ty[i];
      out.ny = this.tx[i];
      return out;
    }
  }

  function circumradius(ax, ay, bx, by, cx, cy) {
    const abx = bx - ax, aby = by - ay, acx = cx - ax, acy = cy - ay;
    const cross = Math.abs(abx * acy - aby * acx);
    if (cross < 1e-9) return 1e9;
    return (M.len(abx, aby) * M.len(acx, acy) * M.len(cx - bx, cy - by)) / (2 * cross);
  }

  // ---------------------------------------------------------------- planning helpers

  function buildCostGrid(track, safe, preferred, weight) {
    const clear = track.grid.clear, cost = new Float64Array(clear.length);
    for (let k = 0; k < clear.length; k++) {
      const c = clear[k];
      cost[k] = c < safe ? Infinity : 1 + (weight * Math.max(0, preferred - c)) / preferred;
    }
    return cost;
  }

  /** Nearest traversable cell to a point (spiral search, deterministic order). */
  function nearestWalkable(track, cost, x, y, maxRing) {
    const g = track.grid;
    const gx = Math.floor((x - g.ox) / g.cs), gy = Math.floor((y - g.oy) / g.cs);
    let best = -1, bestD = Infinity;
    for (let ring = 0; ring <= maxRing && best < 0; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const cx = gx + dx, cy = gy + dy;
          if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) continue;
          const c = cy * g.w + cx;
          if (cost[c] === Infinity) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = c; }
        }
      }
    }
    return best;
  }

  /** Greedy line-of-sight simplification of an open polyline. */
  function stringPull(track, pts, minClear, maxSpan) {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j + 1 < pts.length && j - i < maxSpan &&
        track.lineClear(pts[i].x, pts[i].y, pts[j + 1].x, pts[j + 1].y, minClear)) j++;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  function resampleLoop(pts, spacing) {
    const m = pts.length, cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % m];
      cum[i + 1] = cum[i] + M.len(b.x - a.x, b.y - a.y);
    }
    const n = Math.max(8, Math.round(cum[m] / spacing));
    const step = cum[m] / n;
    const x = new Float64Array(n), y = new Float64Array(n);
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = k * step;
      while (seg < m - 1 && cum[seg + 1] < s) seg++;
      const a = pts[seg], b = pts[(seg + 1) % m];
      const span = cum[seg + 1] - cum[seg];
      const t = span > 0 ? (s - cum[seg]) / span : 0;
      x[k] = a.x + (b.x - a.x) * t;
      y[k] = a.y + (b.y - a.y) * t;
    }
    return { x, y };
  }

  /** Laplacian relaxation of a closed polyline; a move is rejected if it gets too close to a wall. */
  function relaxLoop(track, x, y, minClear, iterations) {
    const n = x.length, nx = new Float64Array(n), ny = new Float64Array(n);
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < n; i++) {
        const a = (i - 1 + n) % n, b = (i + 1) % n;
        const px = x[i] + ((x[a] + x[b]) * 0.5 - x[i]) * 0.5;
        const py = y[i] + ((y[a] + y[b]) * 0.5 - y[i]) * 0.5;
        const ok = track.clearanceAt(px, py) >= minClear;
        nx[i] = ok ? px : x[i];
        ny[i] = ok ? py : y[i];
      }
      x.set(nx);
      y.set(ny);
    }
  }

  /**
   * Plans a closed racing line with A*, gate by gate. Two laps are planned and only the second is
   * kept, so the loop starts where the previous lap actually arrives and closes cleanly.
   */
  function planRacingLine(track, opts) {
    const g = track.grid, cs = g.cs, hw = track.halfWidth;
    const cost = buildCostGrid(track, opts.safeClearance, opts.preferredClearance, opts.clearanceWeight);
    const astar = new Racer.GridAStar(g.w, g.h, cost, cs);
    const gates = track.gates, G = gates.length;
    const band = 0.75 * cs; // goal band half-thickness; wider than half a diagonal step, so no skipping
    let cur = nearestWalkable(track, cost, gates[0].x, gates[0].y, 8);
    const cells = [];
    let expanded = 0;
    for (let lap = 0; lap < 2; lap++) {
      for (let k = 1; k <= G; k++) {
        const gate = gates[k % G];
        const isGoal = (c) => {
          const dx = track.cellCenterX(c) - gate.x, dy = track.cellCenterY(c) - gate.y;
          const along = dx * gate.tx + dy * gate.ty;
          return along >= -band && along <= band && Math.abs(dx * gate.nx + dy * gate.ny) <= hw;
        };
        const heuristic = (c) => Math.max(0,
          M.distToSegment(track.cellCenterX(c), track.cellCenterY(c), gate.ax, gate.ay, gate.bx, gate.by) - band);
        const path = astar.search(cur, isGoal, heuristic);
        if (!path) throw new Error('A*: no route to gate ' + gate.k);
        expanded += astar.lastExpanded;
        if (lap === 1) for (let i = cells.length ? 1 : 0; i < path.length; i++) cells.push(path[i]);
        cur = path[path.length - 1];
      }
    }
    if (cells.length > 1 && cells[cells.length - 1] === cells[0]) cells.pop();
    const raw = cells.map((c) => ({ x: track.cellCenterX(c), y: track.cellCenterY(c) }));
    const pulled = stringPull(track, raw, opts.safeClearance, 50);
    const first = resampleLoop(pulled, LINE_SPACING);
    relaxLoop(track, first.x, first.y, opts.safeClearance - 2, 70);
    const final = resampleLoop(Array.from(first.x, (x, i) => ({ x, y: first.y[i] })), LINE_SPACING);
    const line = new RacingLine(track, final.x, final.y);
    line.stats = { rawCells: cells.length, pulledPoints: pulled.length, expanded };
    return line;
  }

  // ---------------------------------------------------------------- runtime navigation

  /** Shared A* instance for short runtime detours (one per world). */
  function createNavigator(track) {
    const g = track.grid;
    const cost = buildCostGrid(track, NAV_CLEARANCE, 40, 1.5);
    return { cost, astar: new Racer.GridAStar(g.w, g.h, cost, g.cs) };
  }

  function planDetour(world, car, tx, ty) {
    const track = world.track, nav = world.nav, cs = track.grid.cs;
    const start = nearestWalkable(track, nav.cost, car.x, car.y, 4);
    if (start < 0) return null;
    const goalR = 2 * cs;
    const dist = (c) => M.len(track.cellCenterX(c) - tx, track.cellCenterY(c) - ty);
    const path = nav.astar.search(start, (c) => dist(c) <= goalR, (c) => Math.max(0, dist(c) - goalR), 6000);
    if (!path) return null;
    const pts = path.map((c) => ({ x: track.cellCenterX(c), y: track.cellCenterY(c) }));
    return stringPull(track, pts, NAV_CLEARANCE, 40);
  }

  // ---------------------------------------------------------------- personalities

  function rollPersonality(rng) {
    return {
      pace: rng.range(0.95, 1.0), // top-speed / straight-line commitment
      cornering: rng.range(0.8, 0.9), // share of tire grip used when planning corner speeds
      braking: rng.range(0.55, 0.68), // share of brake force assumed when planning braking points
      lookBase: rng.range(44, 56),
      lookGain: rng.range(0.22, 0.3),
      passOffset: rng.range(34, 46),
      offsetRate: rng.range(70, 110),
      line: {
        safeClearance: 26,
        preferredClearance: rng.range(34, 64),
        clearanceWeight: rng.range(0.6, 2.6),
      },
    };
  }

  const AUTOPILOT_PERSONALITY = Object.freeze({
    pace: 0.97, cornering: 0.84, braking: 0.6, lookBase: 50, lookGain: 0.26,
    passOffset: 40, offsetRate: 90,
    line: Object.freeze({ safeClearance: 26, preferredClearance: 48, clearanceWeight: 1.4 }),
  });

  // ---------------------------------------------------------------- driver

  class AIDriver {
    constructor(car, line, personality) {
      const spec = car.spec;
      this.car = car;
      this.line = line;
      this.p = personality;
      this.profile = line.speedProfile(spec.grip * personality.cornering, spec.brakeDecel * personality.braking, 560);
      this.idx = -1;
      this.offset = 0;
      this.passSide = 0;
      this.passTimer = 0;
      this.stuckTime = 0;
      this.reverseTime = 0;
      this.reverseSteer = 0;
      this.detour = null;
      this.detourIdx = 0;
      this.detourTime = 0;
      this.replanCooldown = 0;
      this.mode = 'race';
      this.target = { x: car.x, y: car.y, i: 0, nx: 0, ny: 0 };
      this.aim = { x: car.x, y: car.y };
    }

    think(world, dt) {
      const car = this.car, line = this.line, P = this.p, track = world.track, ctl = car.controls;
      const vf = car.forwardSpeed();
      this.idx = line.nearest(car.x, car.y, this.idx, track, car.trackS);
      ctl.handbrake = false;

      if (this.reverseTime > 0) {
        this.reverseTime -= dt;
        ctl.throttle = 0;
        ctl.brake = 1;
        ctl.steer = this.reverseSteer;
        this.mode = 'reverse';
        return;
      }

      // Look-ahead target on the racing line (pure pursuit), offset sideways for overtakes.
      // If a wall hides it (tight corner), shorten the look-ahead; if even the shortest
      // target is hidden, follow an A* detour instead.
      const look = P.lookBase + P.lookGain * Math.max(0, vf);
      const tgt = line.pointAhead(this.idx, car.x, car.y, look, this.target);
      const followSpeed = this._traffic(world, dt);
      let visible = false;
      for (let k = 0; k < LOOK_FACTORS.length && !visible; k++) {
        if (k > 0) line.pointAhead(this.idx, car.x, car.y, Math.max(30, look * LOOK_FACTORS[k]), tgt);
        if (this.offset !== 0) this._applyOffset(track, tgt);
        visible = track.lineClear(car.x, car.y, tgt.x, tgt.y, LOS_BLOCK_CLEARANCE);
      }
      this.mode = this.passSide !== 0 ? 'pass' : 'race';

      let aimX = tgt.x, aimY = tgt.y;
      this.replanCooldown -= dt;
      if (visible) {
        this.detour = null;
      } else {
        if (this.detour) this.detourTime += dt;
        if ((!this.detour || this.detourTime > 4) && this.replanCooldown <= 0) {
          this.detour = planDetour(world, car, aimX, aimY);
          this.detourIdx = 0;
          this.detourTime = 0;
          this.replanCooldown = 0.5;
        }
        if (this.detour) {
          const d = this.detour;
          while (this.detourIdx < d.length - 1 &&
            (M.len(d[this.detourIdx].x - car.x, d[this.detourIdx].y - car.y) < 36 ||
              track.lineClear(car.x, car.y, d[this.detourIdx + 1].x, d[this.detourIdx + 1].y, LOS_BLOCK_CLEARANCE))) {
            this.detourIdx++;
          }
          aimX = d[this.detourIdx].x;
          aimY = d[this.detourIdx].y;
          this.mode = 'detour';
        }
      }
      this.aim.x = aimX;
      this.aim.y = aimY;

      // Pure pursuit: curvature through the aim point, converted to a steering input.
      const dx = aimX - car.x, dy = aimY - car.y;
      const lx = dx * car.c + dy * car.s, ly = -dx * car.s + dy * car.c;
      let steer;
      if (lx > 5) {
        const k = (2 * ly) / (lx * lx + ly * ly);
        steer = M.atan2(k * car.spec.wheelBase, 1) / car.maxSteer();
      } else {
        steer = ly >= 0 ? 1 : -1; // target is behind: full lock toward it
      }
      ctl.steer = M.clamp(steer, -1, 1);

      // Speed: planned profile, eased when badly misaligned, in traffic or on a detour.
      let vT = this.profile[(this.idx + 2) % line.n] * P.pace * this._rubberBand(world);
      const headingErr = Math.abs(M.atan2(ly, lx));
      if (headingErr > 0.4) vT = Math.min(vT, Math.max(90, vT * (1.3 - headingErr)));
      if (this.detour) vT = Math.min(vT, 240);
      if (lx <= 5) vT = Math.min(vT, 110);
      vT = Math.min(vT, followSpeed);
      const err = vT - vf;
      if (err > 0) {
        ctl.throttle = M.clamp(err / 25, 0.15, 1);
        ctl.brake = 0;
      } else if (err < -10) {
        ctl.throttle = 0;
        ctl.brake = M.clamp(-err / 45, 0, 1);
      } else {
        ctl.throttle = 0;
        ctl.brake = 0;
      }

      // Stuck (wants to go, but isn't moving: nose in a wall or another car): back off with
      // opposite lock for a moment.
      if (vT > 50 && Math.abs(vf) < 20) {
        this.stuckTime += dt;
        if (this.stuckTime > 1.1) {
          this.reverseTime = 0.9;
          this.reverseSteer = ctl.steer >= 0 ? -1 : 1;
          this.stuckTime = 0;
          this.detour = null;
        }
      } else {
        this.stuckTime = Math.max(0, this.stuckTime - dt);
      }
    }

    /**
     * Traffic awareness, measured along the racing line (not the car's heading, so a spun car
     * still reasons about the right direction):
     *   - a slower car ahead is overtaken on the side with room between it and the wall, or
     *     followed at a safe gap if neither side has room;
     *   - cars alongside push the target sideways a little, to leave elbow room.
     * Updates the lateral offset and returns a speed cap.
     */
    _traffic(world, dt) {
      const car = this.car, P = this.p, track = world.track, line = this.line;
      const tx = line.tx[this.idx], ty = line.ty[this.idx];
      const myV = car.vx * tx + car.vy * ty;
      const range = 60 + Math.max(0, myV) * 0.5;
      let blocker = null, bestFwd = Infinity, blockerLat = 0, blockerV = 0, nudge = 0;
      for (const other of world.cars) {
        if (other === car) continue;
        const dx = other.x - car.x, dy = other.y - car.y;
        const fwd = dx * tx + dy * ty;
        const lat = dy * tx - dx * ty;
        if (Math.abs(fwd) < 30 && Math.abs(lat) < ELBOW_ROOM) nudge -= (lat >= 0 ? 1 : -1) * (ELBOW_ROOM - Math.abs(lat));
        if (fwd <= 10 || fwd > range || Math.abs(lat) > 34) continue;
        const otherV = other.vx * tx + other.vy * ty;
        if (fwd > 60 && myV - otherV < -10) continue; // clear of us and pulling away
        if (fwd < bestFwd) { bestFwd = fwd; blocker = other; blockerLat = lat; blockerV = otherV; }
      }
      this.passTimer -= dt;
      let desired = 0, follow = Infinity;
      // Overtaking lines are shrunk where the racing line is tight: no lunges mid-corner.
      const cornerScale = M.clamp((line.radius[this.target.i] - 200) / 700, 0.25, 1);
      if (blocker) {
        // Each side needs a car width plus margin between the blocker and the wall. The chosen
        // side is kept until it runs out of room (no weaving).
        const need = car.width + 16;
        const roomLeft = track.halfWidth + blocker.trackLat - blocker.width / 2;
        const roomRight = track.halfWidth - blocker.trackLat - blocker.width / 2;
        const roomOn = (side) => (side < 0 ? roomLeft : roomRight) >= need;
        if (this.passSide === 0 || (this.passTimer <= 0 && !roomOn(this.passSide))) {
          let side = blockerLat > 0 ? -1 : 1; // default: the side away from it
          if (!roomOn(side)) side = -side;
          if (!roomOn(side)) side = 0; // no room either side: follow
          this.passSide = side;
          this.passTimer = 1.0;
        }
        desired = this.passSide * P.passOffset * cornerScale;
        if (bestFwd < FOLLOW_GAP + 8 && Math.abs(blockerLat) < 26) {
          // Directly behind: hold a gap instead of leaning on its bumper; creep past a stopped car.
          const spacing = blockerV + (bestFwd - FOLLOW_GAP) * 2.5;
          follow = blockerV > 60 ? Math.max(0, spacing) : Math.max(60, spacing);
        }
      } else if (this.passTimer <= 0) {
        this.passSide = 0;
      }
      desired = M.clamp(desired + nudge * cornerScale, -P.passOffset, P.passOffset);
      this.offset = M.moveToward(this.offset, desired, P.offsetRate * dt);
      return follow;
    }

    _applyOffset(track, tgt) {
      tgt.x += tgt.nx * this.offset;
      tgt.y += tgt.ny * this.offset;
      const proj = track.project(tgt.x, tgt.y, this.car.trackIdx, {});
      const limit = track.halfWidth - 30;
      if (Math.abs(proj.lat) > limit) {
        const excess = proj.lat - M.clamp(proj.lat, -limit, limit);
        tgt.x -= track.nx[proj.i] * excess;
        tgt.y -= track.ny[proj.i] * excess;
      }
    }

    /** Mild, deterministic catch-up: AIs ease off when far ahead of the player, push when behind. */
    _rubberBand(world) {
      const strength = world.config.rubberBand, player = world.player;
      if (!strength || this.car === player || player.finished) return 1;
      const gap = player.raceDist - this.car.raceDist; // in checkpoint gates (~300 units each)
      return 1 + M.clamp(gap / 4, -1, 1) * strength;
    }
  }

  Racer.AI = {
    RacingLine, AIDriver, planRacingLine, planDetour, createNavigator, rollPersonality, AUTOPILOT_PERSONALITY,
    stringPull, nearestWalkable,
  };
})(globalThis.Racer = globalThis.Racer || {});
