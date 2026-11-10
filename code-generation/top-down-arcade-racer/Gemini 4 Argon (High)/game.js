/**
 * Top-Down 2D Arcade Racing Prototype
 *
 * Features:
 * - Deterministic PRNG (Mulberry32 + xmur3 hash; zero usage of Math.random)
 * - Fixed-timestep simulation loop (dt = 1/60s) with state interpolation
 * - Custom 2D rigid-body vehicle dynamics (acceleration, braking, reverse,
 *   speed-sensitive steering, lateral tire grip, drift/handbrake, surface drag)
 * - 3 AI opponents supporting both A* grid pathfinding and Waypoint following
 * - Multi-checkpoint & line-segment intersection lap detection and live standings
 * - Oriented Bounding Box (SAT) & boundary collision detection with linear + angular impulse resolution
 * - Live HUD displaying Position, Lap, Race/Best/Last Time, Speed, Standings, and Minimap
 *
 * Zero external dependencies or physics engines.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RacingPrototype = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ===========================================================================
  // 1. DETERMINISTIC PRNG (Mulberry32 + xmur3 string seed hash)
  // ===========================================================================

  class DeterministicRNG {
    /**
     * @param {number|string} seed
     */
    constructor(seed = 1337) {
      this.initialSeed = seed;
      this.setSeed(seed);
    }

    setSeed(seed) {
      this.initialSeed = seed;
      if (typeof seed === "string") {
        let h = 1779033703 ^ seed.length;
        for (let i = 0; i < seed.length; i++) {
          h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
          h = (h << 13) | (h >>> 19);
        }
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        this.state = (h ^= h >>> 16) >>> 0;
      } else {
        this.state = (Number(seed) >>> 0) || 1;
      }
      if (this.state === 0) this.state = 0xdeadbeef;
    }

    /** Returns float in [0, 1) */
    nextFloat() {
      let t = (this.state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Returns float in [min, max) */
    range(min, max) {
      return min + this.nextFloat() * (max - min);
    }

    /** Returns integer in [min, max] inclusive */
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    }

    /** Clone RNG state */
    clone() {
      const copy = new DeterministicRNG(this.initialSeed);
      copy.state = this.state;
      return copy;
    }
  }

  // ===========================================================================
  // 2. 2D VECTOR & MATH UTILITIES
  // ===========================================================================

  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }

    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }

    copy(v) {
      this.x = v.x;
      this.y = v.y;
      return this;
    }

    clone() {
      return new Vec2(this.x, this.y);
    }

    add(v) {
      return new Vec2(this.x + v.x, this.y + v.y);
    }

    sub(v) {
      return new Vec2(this.x - v.x, this.y - v.y);
    }

    scale(s) {
      return new Vec2(this.x * s, this.y * s);
    }

    dot(v) {
      return this.x * v.x + this.y * v.y;
    }

    cross(v) {
      return this.x * v.y - this.y * v.x;
    }

    lenSq() {
      return this.x * this.x + this.y * this.y;
    }

    len() {
      return Math.hypot(this.x, this.y);
    }

    normalize() {
      const l = this.len();
      return l > 1e-8 ? new Vec2(this.x / l, this.y / l) : new Vec2(0, 0);
    }

    perp() {
      return new Vec2(-this.y, this.x);
    }

    dist(v) {
      return Math.hypot(this.x - v.x, this.y - v.y);
    }

    distSq(v) {
      const dx = this.x - v.x;
      const dy = this.y - v.y;
      return dx * dx + dy * dy;
    }

    static fromAngle(angle) {
      return new Vec2(Math.cos(angle), Math.sin(angle));
    }
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function lerpAngle(a, b, t) {
    const diff = normalizeAngle(b - a);
    return normalizeAngle(a + diff * t);
  }

  /**
   * Line segment intersection: returns true if segment AB intersects segment CD.
   */
  function segmentsIntersect(a, b, c, d) {
    const ccw = (p1, p2, p3) =>
      (p3.y - p1.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p3.x - p1.x);
    const d1 = ccw(c, d, a);
    const d2 = ccw(c, d, b);
    const d3 = ccw(a, b, c);
    const d4 = ccw(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return false;
  }

  /**
   * Closest point on segment AB to point P, plus normalized parameter t in [0, 1].
   */
  function closestPointOnSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-8) {
      return { point: a.clone(), t: 0, distSq: p.distSq(a) };
    }
    const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
    const proj = new Vec2(a.x + abx * t, a.y + aby * t);
    return { point: proj, t, distSq: p.distSq(proj) };
  }

  // ===========================================================================
  // 3. TRACK GENERATION, CHECKPOINTS & NAVIGATION GRID FOR A*
  // ===========================================================================

  class Track {
    /**
     * Builds a closed-loop racing circuit with deterministic seed variation,
     * Catmull-Rom spline waypoints, checkpoint gates, and a 2D navigation grid for A*.
     * @param {DeterministicRNG} rng
     */
    constructor(rng) {
      this.worldWidth = 2200;
      this.worldHeight = 1500;
      this.roadHalfWidth = 92;
      this.curbWidth = 14;
      this.wallHalfWidth = 128; // Hard outer barrier distance from centerline

      // Base control points forming a technical Grand Prix circuit (clockwise)
      const baseControlPoints = [
        { x: 750, y: 1240 },  // 0: Main straight start
        { x: 1380, y: 1240 }, // 1: Main straight end
        { x: 1820, y: 1180 }, // 2: Turn 1 entry (sweeping right-hander Up)
        { x: 1920, y: 840 },  // 3: East hairpin apex
        { x: 1620, y: 660 },  // 4: Chicane entry
        { x: 1860, y: 340 },  // 5: North-East fast corner
        { x: 1450, y: 210 },  // 6: North straight start
        { x: 960, y: 260 },   // 7: North kink
        { x: 540, y: 200 },   // 8: North-West corner entry
        { x: 240, y: 420 },   // 9: West technical complex
        { x: 460, y: 740 },   // 10: Infield switchback
        { x: 240, y: 1040 },  // 11: South-West final turn
        { x: 440, y: 1240 },  // 12: Pit straight entry
      ];

      // Apply slight deterministic variation from RNG to non-straight corners
      // while keeping the start/finish straight (indices 0, 1, 12) crisp and level.
      this.controlPoints = baseControlPoints.map((pt, idx) => {
        if (idx === 0 || idx === 1 || idx === 12) {
          return new Vec2(pt.x, pt.y);
        }
        const jx = rng.range(-28, 28);
        const jy = rng.range(-28, 28);
        return new Vec2(
          clamp(pt.x + jx, 200, this.worldWidth - 200),
          clamp(pt.y + jy, 180, this.worldHeight - 180)
        );
      });

      // Sample Catmull-Rom closed spline into evenly-spaced waypoints
      this.waypoints = this._sampleCatmullRom(this.controlPoints, 8);
      this._computeWaypointMetrics();
      this._buildCheckpoints();
      this._buildNavGrid();
    }

    _sampleCatmullRom(points, subdivisionsPerSegment) {
      const n = points.length;
      const raw = [];
      for (let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];

        for (let s = 0; s < subdivisionsPerSegment; s++) {
          const t = s / subdivisionsPerSegment;
          const t2 = t * t;
          const t3 = t2 * t;

          const x =
            0.5 *
            (2 * p1.x +
              (-p0.x + p2.x) * t +
              (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
              (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
          const y =
            0.5 *
            (2 * p1.y +
              (-p0.y + p2.y) * t +
              (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
              (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
          raw.push(new Vec2(x, y));
        }
      }
      return raw;
    }

    _computeWaypointMetrics() {
      const n = this.waypoints.length;
      this.tangents = [];
      this.normals = [];
      this.curvatures = [];
      this.leftEdge = [];
      this.rightEdge = [];
      this.leftWall = [];
      this.rightWall = [];
      this.segmentLengths = [];
      this.cumulativeLengths = [0];
      this.totalLength = 0;

      for (let i = 0; i < n; i++) {
        const prev = this.waypoints[(i - 1 + n) % n];
        const curr = this.waypoints[i];
        const next = this.waypoints[(i + 1) % n];

        const dirNext = next.sub(curr);
        const segLen = dirNext.len();
        this.segmentLengths.push(segLen);
        this.totalLength += segLen;
        if (i < n - 1) {
          this.cumulativeLengths.push(this.totalLength);
        }

        const tangent = next.sub(prev).normalize();
        const normal = tangent.perp(); // Points right/outward relative to tangent
        this.tangents.push(tangent);
        this.normals.push(normal);

        const v1 = curr.sub(prev).normalize();
        const v2 = next.sub(curr).normalize();
        const angleDiff = Math.abs(normalizeAngle(Math.atan2(v2.y, v2.x) - Math.atan2(v1.y, v1.x)));
        this.curvatures.push(angleDiff);

        this.leftEdge.push(curr.sub(normal.scale(this.roadHalfWidth)));
        this.rightEdge.push(curr.add(normal.scale(this.roadHalfWidth)));
        this.leftWall.push(curr.sub(normal.scale(this.wallHalfWidth)));
        this.rightWall.push(curr.add(normal.scale(this.wallHalfWidth)));
      }

      // Compute recommended target speeds per waypoint based on upcoming curvature
      this.targetSpeeds = [];
      for (let i = 0; i < n; i++) {
        let weightedCurvature = 0;
        for (let look = 0; look <= 5; look++) {
          const w = look === 0 ? 1.0 : 0.85 / look;
          weightedCurvature += this.curvatures[(i + look) % n] * w;
        }
        // Map curvature to recommended speed in [180, 420] px/s
        const speed = clamp(425 - weightedCurvature * 520, 175, 420);
        this.targetSpeeds.push(speed);
      }
    }

    _buildCheckpoints() {
      // Create 12 evenly spaced checkpoint gates around the circuit.
      // Checkpoint 0 is the Start/Finish line on the main straight.
      const n = this.waypoints.length;
      const numCheckpoints = 12;
      const stride = Math.floor(n / numCheckpoints);
      this.checkpoints = [];

      for (let c = 0; c < numCheckpoints; c++) {
        const wpIdx = (c * stride) % n;
        const center = this.waypoints[wpIdx];
        const tangent = this.tangents[wpIdx];
        const normal = this.normals[wpIdx];
        const gateHalfWidth = this.wallHalfWidth + 15;
        this.checkpoints.push({
          index: c,
          wpIndex: wpIdx,
          center,
          forward: tangent,
          normal,
          left: center.sub(normal.scale(gateHalfWidth)),
          right: center.add(normal.scale(gateHalfWidth)),
        });
      }
    }

    _buildNavGrid() {
      // Discretize the world into a 2D grid for A* pathfinding
      this.gridCellSize = 40;
      this.gridCols = Math.ceil(this.worldWidth / this.gridCellSize);
      this.gridRows = Math.ceil(this.worldHeight / this.gridCellSize);
      // baseCost: Infinity if outside wall barrier, 1.0 near centerline, 1.4 near road edge, 3.5 on grass shoulder
      this.gridCost = new Float32Array(this.gridCols * this.gridRows);
      this.gridWpIndex = new Int16Array(this.gridCols * this.gridRows);

      for (let r = 0; r < this.gridRows; r++) {
        for (let c = 0; c < this.gridCols; c++) {
          const wx = (c + 0.5) * this.gridCellSize;
          const wy = (r + 0.5) * this.gridCellSize;
          const info = this.getClosestTrackInfo(new Vec2(wx, wy));
          const idx = r * this.gridCols + c;
          this.gridWpIndex[idx] = info.wpIndex;

          if (info.distance > this.wallHalfWidth - 14) {
            this.gridCost[idx] = Infinity; // Impassable barrier
          } else if (info.distance > this.roadHalfWidth) {
            this.gridCost[idx] = 3.6; // Grass runoff shoulder
          } else {
            // Prefer staying near the centerline/racing line
            const ratio = info.distance / this.roadHalfWidth;
            this.gridCost[idx] = 1.0 + ratio * ratio * 0.65;
          }
        }
      }
    }

    /**
     * Finds the closest point on the track centerline to a given world position.
     * @param {Vec2} pos
     */
    getClosestTrackInfo(pos) {
      const n = this.waypoints.length;
      let bestDistSq = Infinity;
      let bestPoint = this.waypoints[0];
      let bestWpIndex = 0;
      let bestSegT = 0;

      for (let i = 0; i < n; i++) {
        const a = this.waypoints[i];
        const b = this.waypoints[(i + 1) % n];
        const res = closestPointOnSegment(pos, a, b);
        if (res.distSq < bestDistSq) {
          bestDistSq = res.distSq;
          bestPoint = res.point;
          bestWpIndex = i;
          bestSegT = res.t;
        }
      }

      const distance = Math.sqrt(bestDistSq);
      const tangent = this.tangents[bestWpIndex];
      const normal = this.normals[bestWpIndex];
      const signedOffset = pos.sub(bestPoint).dot(normal);
      const progress =
        (this.cumulativeLengths[bestWpIndex] + bestSegT * this.segmentLengths[bestWpIndex]) /
        this.totalLength;

      return {
        point: bestPoint,
        wpIndex: bestWpIndex,
        segT: bestSegT,
        distance,
        signedOffset,
        tangent,
        normal,
        progress,
        onRoad: distance <= this.roadHalfWidth,
        outOfBounds: distance > this.wallHalfWidth,
      };
    }

    /**
     * Compute starting grid positions (2x2 staggered formation behind Start/Finish line).
     */
    getStartingGrid() {
      const startWp = 0;
      const startTangent = this.tangents[startWp];
      const startNormal = this.normals[startWp];
      const startCenter = this.waypoints[startWp];
      const heading = Math.atan2(startTangent.y, startTangent.x);

      // Place cars behind the start line (negative along tangent)
      const slots = [
        { back: 52, lat: -28 },  // P1 (Pole - AI 1)
        { back: 88, lat: 28 },   // P2 (AI 2)
        { back: 124, lat: -28 }, // P3 (AI 3)
        { back: 160, lat: 28 },  // P4 (Player starts 4th for exciting overtake action)
      ];

      return slots.map((s) => {
        const pos = startCenter
          .sub(startTangent.scale(s.back))
          .add(startNormal.scale(s.lat));
        return { position: pos, angle: heading };
      });
    }
  }

  // ===========================================================================
  // 4. A* PATHFINDING & WAYPOINT FOLLOWING AI CONTROLLER
  // ===========================================================================

  class AStarPlanner {
    /**
     * Grid-based A* pathfinder on the track navigation mesh.
     * Accounts for track surface costs, forward track direction, and dynamic car obstacles.
     * @param {Track} track
     */
    constructor(track) {
      this.track = track;
      const totalCells = track.gridCols * track.gridRows;
      this.gScore = new Float32Array(totalCells);
      this.fScore = new Float32Array(totalCells);
      this.cameFrom = new Int32Array(totalCells);
      this.closedStamp = new Int32Array(totalCells);
      this.openStamp = new Int32Array(totalCells);
      this.currentStamp = 1;
    }

    worldToCell(pos) {
      const cs = this.track.gridCellSize;
      const c = clamp(Math.floor(pos.x / cs), 0, this.track.gridCols - 1);
      const r = clamp(Math.floor(pos.y / cs), 0, this.track.gridRows - 1);
      return { c, r, idx: r * this.track.gridCols + c };
    }

    cellToWorld(idx) {
      const cols = this.track.gridCols;
      const cs = this.track.gridCellSize;
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      return new Vec2((c + 0.5) * cs, (r + 0.5) * cs);
    }

    /**
     * Finds an optimal 2D path from startPos to goalPos while avoiding obstacle cars.
     * @param {Vec2} startPos
     * @param {Vec2} goalPos
     * @param {Array<Car>} obstacleCars
     * @param {Car} selfCar
     * @returns {Array<Vec2>} World-space path nodes
     */
    findPath(startPos, goalPos, obstacleCars, selfCar) {
      const cols = this.track.gridCols;
      const rows = this.track.gridRows;
      const start = this.worldToCell(startPos);
      const goal = this.worldToCell(goalPos);

      if (start.idx === goal.idx) {
        return [goalPos.clone()];
      }

      this.currentStamp++;
      const stamp = this.currentStamp;

      // Precompute obstacle cell coordinates for dynamic avoidance cost
      const obsCells = [];
      for (let i = 0; i < obstacleCars.length; i++) {
        const other = obstacleCars[i];
        if (other === selfCar) continue;
        // Predict obstacle position slightly ahead (0.25s)
        const predPos = other.position.add(other.velocity.scale(0.25));
        if (predPos.distSq(startPos) < 340 * 340) {
          obsCells.push(predPos);
        }
      }

      // Binary min-heap over cell indices ordered by fScore
      const openHeap = [];
      const heapPush = (nodeIdx) => {
        openHeap.push(nodeIdx);
        let i = openHeap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (this.fScore[openHeap[i]] < this.fScore[openHeap[p]]) {
            const tmp = openHeap[i];
            openHeap[i] = openHeap[p];
            openHeap[p] = tmp;
            i = p;
          } else break;
        }
      };

      const heapPop = () => {
        const top = openHeap[0];
        const last = openHeap.pop();
        if (openHeap.length > 0) {
          openHeap[0] = last;
          let i = 0;
          const len = openHeap.length;
          while (true) {
            let l = 2 * i + 1;
            let r = l + 1;
            let smallest = i;
            if (l < len && this.fScore[openHeap[l]] < this.fScore[openHeap[smallest]]) {
              smallest = l;
            }
            if (r < len && this.fScore[openHeap[r]] < this.fScore[openHeap[smallest]]) {
              smallest = r;
            }
            if (smallest !== i) {
              const tmp = openHeap[i];
              openHeap[i] = openHeap[smallest];
              openHeap[smallest] = tmp;
              i = smallest;
            } else break;
          }
        }
        return top;
      };

      const heuristic = (c, r) => Math.hypot(c - goal.c, r - goal.r);

      this.gScore[start.idx] = 0;
      this.fScore[start.idx] = heuristic(start.c, start.r);
      this.cameFrom[start.idx] = -1;
      this.openStamp[start.idx] = stamp;
      heapPush(start.idx);

      // 8-connected neighbor offsets
      const dirs = [
        [-1, 0, 1.0],
        [1, 0, 1.0],
        [0, -1, 1.0],
        [0, 1, 1.0],
        [-1, -1, Math.SQRT2],
        [1, -1, Math.SQRT2],
        [-1, 1, Math.SQRT2],
        [1, 1, Math.SQRT2],
      ];

      let bestIdx = start.idx;
      let bestH = this.fScore[start.idx];
      let iterations = 0;
      const maxIterations = 260;

      while (openHeap.length > 0 && iterations < maxIterations) {
        iterations++;
        const current = heapPop();

        if (current === goal.idx) {
          bestIdx = current;
          break;
        }

        if (this.closedStamp[current] === stamp) continue;
        this.closedStamp[current] = stamp;

        const cr = Math.floor(current / cols);
        const cc = current % cols;
        const hCurr = heuristic(cc, cr);
        if (hCurr < bestH) {
          bestH = hCurr;
          bestIdx = current;
        }

        for (let d = 0; d < 8; d++) {
          const nc = cc + dirs[d][0];
          const nr = cr + dirs[d][1];
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

          const nIdx = nr * cols + nc;
          if (this.closedStamp[nIdx] === stamp) continue;

          let baseCost = this.track.gridCost[nIdx];
          if (!Number.isFinite(baseCost) && nIdx !== goal.idx) continue;
          if (!Number.isFinite(baseCost)) baseCost = 4.0;

          // Dynamic obstacle penalty near other cars
          let dynamicPenalty = 0;
          if (obsCells.length > 0) {
            const wx = (nc + 0.5) * this.track.gridCellSize;
            const wy = (nr + 0.5) * this.track.gridCellSize;
            for (let k = 0; k < obsCells.length; k++) {
              const dx = wx - obsCells[k].x;
              const dy = wy - obsCells[k].y;
              const distSq = dx * dx + dy * dy;
              if (distSq < 58 * 58) {
                dynamicPenalty += 8.5 * (1 - Math.sqrt(distSq) / 58);
              }
            }
          }

          const stepCost = dirs[d][2] * (baseCost + dynamicPenalty);
          const tentativeG = this.gScore[current] + stepCost;

          if (this.openStamp[nIdx] !== stamp || tentativeG < this.gScore[nIdx]) {
            this.cameFrom[nIdx] = current;
            this.gScore[nIdx] = tentativeG;
            this.fScore[nIdx] = tentativeG + heuristic(nc, nr) * 1.15;
            this.openStamp[nIdx] = stamp;
            heapPush(nIdx);
          }
        }
      }

      // Reconstruct path
      const path = [];
      let curr = bestIdx;
      while (curr !== -1 && curr !== start.idx) {
        path.push(this.cellToWorld(curr));
        curr = this.cameFrom[curr];
      }
      path.reverse();
      if (path.length === 0) {
        path.push(goalPos.clone());
      } else {
        path[path.length - 1] = goalPos.clone();
      }
      return path;
    }
  }

  class AIController {
    /**
     * AI Driver supporting both Waypoint Following and A* Pathfinding.
     * @param {Car} car
     * @param {Track} track
     * @param {AStarPlanner} astar
     * @param {DeterministicRNG} rng
     * @param {object} profile
     */
    constructor(car, track, astar, rng, profile = {}) {
      this.car = car;
      this.track = track;
      this.astar = astar;
      this.rng = rng;

      // Mode can be "hybrid-astar" (A* path planning to lookahead waypoint) or "waypoint" (pure waypoint following)
      this.mode = profile.mode || "hybrid-astar";

      // Deterministic driver personality traits
      this.skillSpeedScale = profile.speedScale || rng.range(0.94, 1.05);
      this.preferredLaneOffset = profile.laneOffset !== undefined
        ? profile.laneOffset
        : rng.range(-26, 26);
      this.lookaheadWaypoints = profile.lookahead || rng.int(5, 7);
      this.replanInterval = 6; // Recompute A* path every 6 fixed ticks (10 Hz)
      this.replanPhase = profile.replanPhase || 0;

      this.currentWaypointIndex = 0;
      this.plannedPath = [];
      this.targetPoint = car.position.clone();
      this.stuckTimer = 0;
      this.recoverTimer = 0;
    }

    /**
     * Updates AI controls (throttle, brake, steer, handbrake) for the current fixed tick.
     * @param {number} dt
     * @param {number} tickCount
     * @param {Array<Car>} allCars
     */
    update(dt, tickCount, allCars) {
      const n = this.track.waypoints.length;
      const trackInfo = this.track.getClosestTrackInfo(this.car.position);
      this.currentWaypointIndex = trackInfo.wpIndex;

      // Advance lookahead waypoint along track
      const shortLookWp = (this.currentWaypointIndex + 3) % n;
      const farLookWp = (this.currentWaypointIndex + this.lookaheadWaypoints) % n;

      // Dynamic lane adjustment for overtaking slower cars ahead
      let dynamicOffset = this.preferredLaneOffset;
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === this.car) continue;
        const rel = other.position.sub(this.car.position);
        const dist = rel.len();
        if (dist < 165) {
          const forwardHeading = Vec2.fromAngle(this.car.angle);
          const forwardDot = rel.dot(forwardHeading) / (dist || 1);
          if (forwardDot > 0.45) {
            const otherInfo = this.track.getClosestTrackInfo(other.position);
            // Steer to the side opposite of the car ahead
            dynamicOffset = otherInfo.signedOffset > 0 ? -38 : 38;
          }
        }
      }
      dynamicOffset = clamp(
        dynamicOffset,
        -(this.track.roadHalfWidth - 24),
        this.track.roadHalfWidth - 24
      );

      const wpGoalCenter = this.track.waypoints[farLookWp];
      const wpGoalNormal = this.track.normals[farLookWp];
      const goalPos = wpGoalCenter.add(wpGoalNormal.scale(dynamicOffset));

      if (this.mode === "hybrid-astar") {
        // Recompute A* path periodically or if path is empty
        if (
          this.plannedPath.length === 0 ||
          (tickCount + this.replanPhase) % this.replanInterval === 0
        ) {
          this.plannedPath = this.astar.findPath(
            this.car.position,
            goalPos,
            allCars,
            this.car
          );
        }

        // Advance along A* nodes as the car gets close to them
        while (
          this.plannedPath.length > 1 &&
          this.car.position.dist(this.plannedPath[0]) < 68
        ) {
          this.plannedPath.shift();
        }

        // Blend A* immediate node with smooth waypoint lookahead
        const astarTarget =
          this.plannedPath.length > 0 ? this.plannedPath[0] : goalPos;
        const smoothWpTarget = this.track.waypoints[shortLookWp].add(
          this.track.normals[shortLookWp].scale(dynamicOffset)
        );
        this.targetPoint = new Vec2(
          lerp(smoothWpTarget.x, astarTarget.x, 0.55),
          lerp(smoothWpTarget.y, astarTarget.y, 0.55)
        );
      } else {
        // Pure Waypoint Following mode
        const wpCenter = this.track.waypoints[shortLookWp];
        const wpNormal = this.track.normals[shortLookWp];
        this.targetPoint = wpCenter.add(wpNormal.scale(dynamicOffset));
        this.plannedPath = [this.targetPoint, goalPos];
      }

      // Check if stuck against a wall or spun out
      const speed = this.car.velocity.len();
      if (speed < 22 && this.car.controls.throttle > 0.5) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 1.1) {
          this.recoverTimer = 0.65;
          this.stuckTimer = 0;
        }
      } else {
        this.stuckTimer = Math.max(0, this.stuckTimer - dt * 0.5);
      }

      if (this.recoverTimer > 0) {
        this.recoverTimer -= dt;
        this.car.controls.throttle = 0;
        this.car.controls.brake = 0.85;
        this.car.controls.steer = trackInfo.signedOffset > 0 ? 1 : -1;
        this.car.controls.handbrake = false;
        return;
      }

      // Compute steering angle toward targetPoint
      const toTarget = this.targetPoint.sub(this.car.position);
      const desiredAngle = Math.atan2(toTarget.y, toTarget.x);
      const headingError = normalizeAngle(desiredAngle - this.car.angle);

      // Proportional + Derivative-like damping from angular velocity
      const steerCmd = clamp(
        headingError * 2.4 - this.car.angularVelocity * 0.12,
        -1,
        1
      );
      this.car.controls.steer = steerCmd;

      // Speed regulation based on upcoming corner curvature and heading error
      const recSpeed =
        this.track.targetSpeeds[this.currentWaypointIndex] *
        this.skillSpeedScale *
        (1 - Math.min(0.42, Math.abs(headingError) * 0.38));

      if (speed > recSpeed + 32) {
        this.car.controls.throttle = 0;
        this.car.controls.brake = clamp((speed - recSpeed) / 140, 0.15, 0.9);
      } else {
        this.car.controls.brake = 0;
        this.car.controls.throttle = clamp(
          1.0 - Math.abs(headingError) * 0.35,
          0.35,
          1.0
        );
      }

      this.car.controls.handbrake =
        Math.abs(headingError) > 1.15 && speed > 210;
    }
  }

  // ===========================================================================
  // 5. VEHICLE ENTITY & 2D RIGID-BODY DYNAMICS
  // ===========================================================================

  class Car {
    /**
     * @param {object} config
     */
    constructor(config) {
      this.id = config.id;
      this.name = config.name;
      this.color = config.color;
      this.accentColor = config.accentColor || "#ffffff";
      this.isPlayer = Boolean(config.isPlayer);

      // Physical dimensions & mass properties
      this.length = 42;
      this.width = 22;
      this.halfLength = this.length * 0.5;
      this.halfWidth = this.width * 0.5;
      this.boundingRadius = Math.hypot(this.halfLength, this.halfWidth);

      this.mass = 1200; // kg
      this.invMass = 1 / this.mass;
      // Rectangular box moment of inertia I = m * (w^2 + l^2) / 12
      this.inertia = (this.mass * (this.width * this.width + this.length * this.length)) / 12;
      this.invInertia = 1 / this.inertia;
      this.restitution = 0.42;

      // Dynamic state
      this.position = config.position ? config.position.clone() : new Vec2();
      this.prevPosition = this.position.clone();
      this.velocity = new Vec2(0, 0);
      this.angle = config.angle || 0;
      this.prevAngle = this.angle;
      this.angularVelocity = 0;
      this.wheelSteerAngle = 0;

      // Handling parameters
      this.engineForce = config.engineForce || 540; // px/s^2 acceleration
      this.brakeForce = 680;
      this.reverseForce = 290;
      this.maxForwardSpeed = config.maxSpeed || 415;
      this.maxReverseSpeed = 145;
      this.turnRate = 3.55; // rad/s base turn rate
      this.lateralGrip = 8.8; // Tire lateral friction multiplier

      // Control inputs in [-1, 1] / [0, 1]
      this.controls = {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
      };

      // Race progression state
      this.lap = 1;
      this.nextCheckpoint = 1; // Starts just behind checkpoint 0, so first crosses 0 then 1...
      this.crossedStartLine = false;
      this.checkpointsPassedInLap = 0;
      this.totalDistanceScore = 0;
      this.racePosition = 1;

      this.currentLapTime = 0;
      this.lastLapTime = null;
      this.bestLapTime = null;
      this.finishTime = null;
      this.finished = false;

      // Visual telemetry
      this.isDrifting = false;
      this.onGrass = false;
      this.collisionFlash = 0;
    }

    /**
     * Save current transform for fixed-timestep render interpolation
     */
    savePreviousState() {
      this.prevPosition.copy(this.position);
      this.prevAngle = this.angle;
    }

    /**
     * Integrate 2D vehicle physics over a single fixed timestep dt.
     * @param {number} dt
     * @param {Track} track
     */
    integratePhysics(dt, track) {
      this.savePreviousState();
      if (this.collisionFlash > 0) {
        this.collisionFlash = Math.max(0, this.collisionFlash - dt);
      }

      const trackInfo = track.getClosestTrackInfo(this.position);
      this.onGrass = !trackInfo.onRoad;

      // Local basis vectors
      const forward = Vec2.fromAngle(this.angle);
      const right = forward.perp();

      // Decompose current world velocity into car's local forward and lateral axes
      let forwardSpeed = this.velocity.dot(forward);
      let lateralSpeed = this.velocity.dot(right);

      const throttle = clamp(this.controls.throttle, 0, 1);
      const brake = clamp(this.controls.brake, 0, 1);
      const steer = clamp(this.controls.steer, -1, 1);
      const handbrake = Boolean(this.controls.handbrake);

      this.wheelSteerAngle = lerp(this.wheelSteerAngle, steer * 0.48, clamp(dt * 14, 0, 1));

      // Longitudinal acceleration / braking / reverse
      let longAccel = 0;
      if (throttle > 0) {
        longAccel += throttle * this.engineForce;
      }
      if (brake > 0) {
        if (forwardSpeed > 12) {
          longAccel -= brake * this.brakeForce;
        } else {
          // Engage reverse gear
          longAccel -= brake * this.reverseForce;
        }
      }

      if (handbrake) {
        longAccel -= Math.sign(forwardSpeed) * 320;
      }

      forwardSpeed += longAccel * dt;

      // Rolling resistance + quadratic aerodynamic & grass drag
      const rollingDrag = this.onGrass ? 1.85 : 0.42;
      const aeroDrag = this.onGrass ? 0.0024 : 0.00075;
      const speedSign = Math.sign(forwardSpeed);
      const dragDecel =
        rollingDrag * forwardSpeed +
        aeroDrag * forwardSpeed * Math.abs(forwardSpeed);
      forwardSpeed -= dragDecel * dt;

      // Stop micro-creep when idle
      if (throttle === 0 && brake === 0 && Math.abs(forwardSpeed) < 4) {
        forwardSpeed = 0;
      }

      const maxFwd = this.onGrass ? this.maxForwardSpeed * 0.72 : this.maxForwardSpeed;
      forwardSpeed = clamp(forwardSpeed, -this.maxReverseSpeed, maxFwd);

      // Lateral tire grip (cancels sideways slide unless drifting/handbraking)
      const gripFactor = handbrake
        ? this.lateralGrip * 0.28
        : this.onGrass
        ? this.lateralGrip * 0.55
        : this.lateralGrip;
      lateralSpeed *= Math.exp(-gripFactor * dt);

      this.isDrifting =
        Math.abs(lateralSpeed) > 48 ||
        (handbrake && Math.abs(forwardSpeed) > 95);

      // Reconstruct world velocity from local components
      this.velocity.x = forward.x * forwardSpeed + right.x * lateralSpeed;
      this.velocity.y = forward.y * forwardSpeed + right.y * lateralSpeed;

      // Steering angular dynamics (requires longitudinal motion to turn)
      const absSpeed = Math.abs(forwardSpeed);
      const speedTurnFactor = clamp(absSpeed / 85, 0, 1) *
        (1 - 0.25 * clamp(absSpeed / this.maxForwardSpeed, 0, 1));
      const reverseDir = forwardSpeed >= -2 ? 1 : -1;
      const driftTurnBoost = handbrake ? 1.25 : 1.0;

      const targetYawRate =
        steer * this.turnRate * speedTurnFactor * reverseDir * driftTurnBoost;

      // Blend controllable steering yaw with any impulse-induced angular velocity
      this.angularVelocity = lerp(
        this.angularVelocity,
        targetYawRate,
        clamp(dt * 11, 0, 1)
      );

      // Integrate position & orientation
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.angle = normalizeAngle(this.angle + this.angularVelocity * dt);
    }

    /**
     * Returns the 4 world-space vertices of the car's Oriented Bounding Box (OBB).
     */
    getOBBVertices() {
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      const hl = this.halfLength;
      const hw = this.halfWidth;

      const dxL = cos * hl;
      const dyL = sin * hl;
      const dxW = -sin * hw;
      const dyW = cos * hw;

      const cx = this.position.x;
      const cy = this.position.y;

      return [
        new Vec2(cx + dxL + dxW, cy + dyL + dyW), // Front-Right
        new Vec2(cx + dxL - dxW, cy + dyL - dyW), // Front-Left
        new Vec2(cx - dxL - dxW, cy - dyL - dyW), // Rear-Left
        new Vec2(cx - dxL + dxW, cy - dyL + dyW), // Rear-Right
      ];
    }

    /**
     * Interpolated state for smooth rendering between fixed physics ticks
     * @param {number} alpha in [0, 1]
     */
    getInterpolatedTransform(alpha) {
      return {
        x: lerp(this.prevPosition.x, this.position.x, alpha),
        y: lerp(this.prevPosition.y, this.position.y, alpha),
        angle: lerpAngle(this.prevAngle, this.angle, alpha),
      };
    }
  }

  // ===========================================================================
  // 6. COLLISION DETECTION (SAT OBB) & IMPULSE RESOLUTION
  // ===========================================================================

  class PhysicsSolver {
    /**
     * Separating Axis Theorem (SAT) collision test between two Oriented Bounding Boxes.
     * Returns null if separated, or { normal, depth, contactPoint } where normal points from A to B.
     * @param {Car} carA
     * @param {Car} carB
     */
    static detectCarCollisionSAT(carA, carB) {
      // Broadphase bounding circle check
      const maxR = carA.boundingRadius + carB.boundingRadius;
      if (carA.position.distSq(carB.position) > maxR * maxR) {
        return null;
      }

      const vertsA = carA.getOBBVertices();
      const vertsB = carB.getOBBVertices();

      const axes = [
        Vec2.fromAngle(carA.angle),
        Vec2.fromAngle(carA.angle).perp(),
        Vec2.fromAngle(carB.angle),
        Vec2.fromAngle(carB.angle).perp(),
      ];

      let minOverlap = Infinity;
      let smallestAxis = null;

      for (let i = 0; i < axes.length; i++) {
        const axis = axes[i];
        let minA = Infinity,
          maxA = -Infinity;
        let minB = Infinity,
          maxB = -Infinity;

        for (let v = 0; v < 4; v++) {
          const projA = vertsA[v].dot(axis);
          if (projA < minA) minA = projA;
          if (projA > maxA) maxA = projA;

          const projB = vertsB[v].dot(axis);
          if (projB < minB) minB = projB;
          if (projB > maxB) maxB = projB;
        }

        const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
        if (overlap <= 0) {
          return null; // Separating axis found -> no collision
        }

        if (overlap < minOverlap) {
          minOverlap = overlap;
          smallestAxis = axis;
        }
      }

      // Ensure collision normal points from carA to carB
      const centerDiff = carB.position.sub(carA.position);
      let normal = smallestAxis;
      if (centerDiff.dot(normal) < 0) {
        normal = normal.scale(-1);
      }

      // Approximate contact point near the midpoint between the two cars along the normal
      const contactPoint = carA.position.add(
        normal.scale(carA.halfLength * 0.65)
      );

      return {
        normal,
        depth: minOverlap,
        contactPoint,
      };
    }

    /**
     * Resolves a collision between two cars using linear + angular impulse resolution
     * and positional projection.
     * @param {Car} carA
     * @param {Car} carB
     * @param {object} manifold
     */
    static resolveCarCollision(carA, carB, manifold) {
      const { normal, depth, contactPoint } = manifold;
      const totalInvMass = carA.invMass + carB.invMass;
      if (totalInvMass === 0) return;

      // 1. Positional correction (prevent sinking / overlap)
      const slop = 0.5;
      const percent = 0.82;
      const correctionMag =
        (Math.max(depth - slop, 0) / totalInvMass) * percent;
      const correction = normal.scale(correctionMag);

      carA.position.x -= correction.x * carA.invMass;
      carA.position.y -= correction.y * carA.invMass;
      carB.position.x += correction.x * carB.invMass;
      carB.position.y += correction.y * carB.invMass;

      // 2. Relative velocity at contact point (including angular velocity lever arms)
      const rA = contactPoint.sub(carA.position);
      const rB = contactPoint.sub(carB.position);

      const velAtContactA = new Vec2(
        carA.velocity.x - carA.angularVelocity * rA.y,
        carA.velocity.y + carA.angularVelocity * rA.x
      );
      const velAtContactB = new Vec2(
        carB.velocity.x - carB.angularVelocity * rB.y,
        carB.velocity.y + carB.angularVelocity * rB.x
      );

      const relVel = velAtContactB.sub(velAtContactA);
      const velAlongNormal = relVel.dot(normal);

      // Do not resolve if velocities are already separating
      if (velAlongNormal > 0) return;

      const e = Math.min(carA.restitution, carB.restitution);
      const rACrossN = rA.cross(normal);
      const rBCrossN = rB.cross(normal);

      const denom =
        carA.invMass +
        carB.invMass +
        rACrossN * rACrossN * carA.invInertia +
        rBCrossN * rBCrossN * carB.invInertia;

      const j = (-(1 + e) * velAlongNormal) / denom;
      const impulse = normal.scale(j);

      // Apply normal impulse
      carA.velocity.x -= impulse.x * carA.invMass;
      carA.velocity.y -= impulse.y * carA.invMass;
      carA.angularVelocity = clamp(
        carA.angularVelocity - rA.cross(impulse) * carA.invInertia * 0.45,
        -6.5,
        6.5
      );

      carB.velocity.x += impulse.x * carB.invMass;
      carB.velocity.y += impulse.y * carB.invMass;
      carB.angularVelocity = clamp(
        carB.angularVelocity + rB.cross(impulse) * carB.invInertia * 0.45,
        -6.5,
        6.5
      );

      // 3. Tangent friction impulse (Coulomb friction)
      const tangent = relVel.sub(normal.scale(velAlongNormal)).normalize();
      if (tangent.lenSq() > 0.001) {
        const rACrossT = rA.cross(tangent);
        const rBCrossT = rB.cross(tangent);
        const denomT =
          carA.invMass +
          carB.invMass +
          rACrossT * rACrossT * carA.invInertia +
          rBCrossT * rBCrossT * carB.invInertia;

        let jt = -relVel.dot(tangent) / denomT;
        const mu = 0.24;
        jt = clamp(jt, -j * mu, j * mu);
        const frictionImpulse = tangent.scale(jt);

        carA.velocity.x -= frictionImpulse.x * carA.invMass;
        carA.velocity.y -= frictionImpulse.y * carA.invMass;
        carB.velocity.x += frictionImpulse.x * carB.invMass;
        carB.velocity.y += frictionImpulse.y * carB.invMass;
      }

      carA.collisionFlash = 0.2;
      carB.collisionFlash = 0.2;
    }

    /**
     * Resolves collision between a car and the outer track barrier walls using impulse resolution.
     * @param {Car} car
     * @param {Track} track
     */
    static resolveTrackBoundaryCollision(car, track) {
      const info = track.getClosestTrackInfo(car.position);
      const maxAllowedDist = track.wallHalfWidth - car.halfWidth;

      if (info.distance > maxAllowedDist) {
        const penetration = info.distance - maxAllowedDist;
        // Normal pointing from car back toward track centerline
        const toCenter = info.point.sub(car.position).normalize();

        // Positional projection back inside the barrier
        car.position.x += toCenter.x * penetration;
        car.position.y += toCenter.y * penetration;

        // Impulse against infinite-mass wall (invMassWall = 0)
        const vn = car.velocity.dot(toCenter);
        if (vn < 0) {
          const e = 0.35; // Wall restitution
          const j = -(1 + e) * vn * car.mass;
          const impulse = toCenter.scale(j);
          car.velocity.x += impulse.x * car.invMass;
          car.velocity.y += impulse.y * car.invMass;

          // Wall scraping friction along wall tangent
          const wallTangent = toCenter.perp();
          const vt = car.velocity.dot(wallTangent);
          car.velocity.x -= wallTangent.x * vt * 0.18;
          car.velocity.y -= wallTangent.y * vt * 0.18;

          // Align car slightly away from wall
          car.angularVelocity *= 0.5;
          car.collisionFlash = 0.2;
        }
      }
    }
  }

  // ===========================================================================
  // 7. RACE SIMULATION ENGINE (FIXED TIMESTEP, LAP DETECTION, STANDINGS)
  // ===========================================================================

  class RaceSimulation {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
      this.seed = options.seed !== undefined ? options.seed : 20260501;
      this.fixedDt = options.fixedDt || 1 / 60;
      this.totalLaps = options.totalLaps || 3;
      this.aiMode = options.aiMode || "hybrid-astar";

      this.reset(this.seed);
    }

    reset(newSeed = this.seed) {
      this.seed = newSeed;
      this.rng = new DeterministicRNG(this.seed);
      this.track = new Track(this.rng);
      this.astar = new AStarPlanner(this.track);

      this.tickCount = 0;
      this.raceTime = 0;
      this.countdown = 1.5; // 1.5s pre-start countdown
      this.raceStarted = false;
      this.raceCompleted = false;

      const grid = this.track.getStartingGrid();

      // Create 3 AI opponents + 1 Player car
      const aiConfigs = [
        {
          id: "ai-1",
          name: "APEX (AI 1)",
          color: "#ff3860",
          accentColor: "#ffe08a",
          slot: grid[0],
          profile: {
            mode: this.aiMode,
            speedScale: this.rng.range(0.98, 1.03),
            laneOffset: -18,
            lookahead: 6,
            replanPhase: 0,
          },
        },
        {
          id: "ai-2",
          name: "VORTEX (AI 2)",
          color: "#00d1b2",
          accentColor: "#ffffff",
          slot: grid[1],
          profile: {
            mode: this.aiMode,
            speedScale: this.rng.range(0.95, 1.01),
            laneOffset: 20,
            lookahead: 6,
            replanPhase: 2,
          },
        },
        {
          id: "ai-3",
          name: "BLITZ (AI 3)",
          color: "#ffdd57",
          accentColor: "#1a1a1a",
          slot: grid[2],
          profile: {
            mode: this.aiMode,
            speedScale: this.rng.range(0.92, 0.98),
            laneOffset: 0,
            lookahead: 5,
            replanPhase: 4,
          },
        },
      ];

      this.cars = [];
      this.aiControllers = [];

      for (let i = 0; i < aiConfigs.length; i++) {
        const cfg = aiConfigs[i];
        const aiCar = new Car({
          id: cfg.id,
          name: cfg.name,
          color: cfg.color,
          accentColor: cfg.accentColor,
          isPlayer: false,
          position: cfg.slot.position,
          angle: cfg.slot.angle,
          maxSpeed: 398,
          engineForce: 515,
        });
        this.cars.push(aiCar);
        this.aiControllers.push(
          new AIController(aiCar, this.track, this.astar, this.rng, cfg.profile)
        );
      }

      this.playerCar = new Car({
        id: "player",
        name: "PLAYER (YOU)",
        color: "#3273dc",
        accentColor: "#00ffff",
        isPlayer: true,
        position: grid[3].position,
        angle: grid[3].angle,
        maxSpeed: 425,
        engineForce: 560,
      });
      this.cars.push(this.playerCar);

      this.skidMarks = [];
      this.collisionEvents = [];
      this._updateStandings();
    }

    setAIMode(mode) {
      this.aiMode = mode;
      for (let i = 0; i < this.aiControllers.length; i++) {
        this.aiControllers[i].mode = mode;
      }
    }

    /**
     * Advance the entire simulation by exactly one fixed timestep (`fixedDt`).
     */
    step() {
      const dt = this.fixedDt;
      this.tickCount++;

      // Handle start countdown
      if (this.countdown > 0) {
        this.countdown = Math.max(0, this.countdown - dt);
        for (let i = 0; i < this.cars.length; i++) {
          this.cars[i].savePreviousState();
        }
        if (this.countdown === 0) {
          this.raceStarted = true;
        }
        return;
      }

      this.raceStarted = true;
      this.raceTime += dt;

      // 1. Update AI controllers
      for (let i = 0; i < this.aiControllers.length; i++) {
        this.aiControllers[i].update(dt, this.tickCount, this.cars);
      }

      // 2. Integrate vehicle physics & update lap timers
      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i];
        if (!car.finished) {
          car.currentLapTime += dt;
        }
        car.integratePhysics(dt, this.track);

        // Record skid marks when drifting
        if (car.isDrifting && this.tickCount % 2 === 0) {
          const rearDir = Vec2.fromAngle(car.angle);
          const rightDir = rearDir.perp();
          const rearCenter = car.position.sub(rearDir.scale(car.halfLength * 0.72));
          this.skidMarks.push(
            rearCenter.add(rightDir.scale(car.halfWidth * 0.7)),
            rearCenter.sub(rightDir.scale(car.halfWidth * 0.7))
          );
          if (this.skidMarks.length > 500) {
            this.skidMarks.splice(0, 2);
          }
        }
      }

      // 3. Resolve Car-to-Car Collisions (SAT OBB + Impulse Resolution)
      for (let i = 0; i < this.cars.length; i++) {
        for (let j = i + 1; j < this.cars.length; j++) {
          const carA = this.cars[i];
          const carB = this.cars[j];
          const manifold = PhysicsSolver.detectCarCollisionSAT(carA, carB);
          if (manifold) {
            PhysicsSolver.resolveCarCollision(carA, carB, manifold);
            this.collisionEvents.push({
              tick: this.tickCount,
              point: manifold.contactPoint.clone(),
              ttl: 0.25,
            });
          }
        }
      }

      // 4. Resolve Car-to-Track-Boundary Collisions
      for (let i = 0; i < this.cars.length; i++) {
        PhysicsSolver.resolveTrackBoundaryCollision(this.cars[i], this.track);
      }

      // Decay visual collision sparks
      for (let i = this.collisionEvents.length - 1; i >= 0; i--) {
        this.collisionEvents[i].ttl -= dt;
        if (this.collisionEvents[i].ttl <= 0) {
          this.collisionEvents.splice(i, 1);
        }
      }

      // 5. Lap & Checkpoint Detection
      for (let i = 0; i < this.cars.length; i++) {
        this._updateCarCheckpointsAndLaps(this.cars[i]);
      }

      // 6. Live Race Standings (1st - 4th)
      this._updateStandings();
    }

    /**
     * Checks checkpoint gate crossings and start/finish lap completions for a car.
     * @param {Car} car
     */
    _updateCarCheckpointsAndLaps(car) {
      const checkpoints = this.track.checkpoints;
      const numCheckpoints = checkpoints.length;
      const moveVec = car.position.sub(car.prevPosition);

      // Check initial start line crossing at the beginning of Lap 1
      if (!car.crossedStartLine) {
        const startGate = checkpoints[0];
        const crossedSeg = segmentsIntersect(
          car.prevPosition,
          car.position,
          startGate.left,
          startGate.right
        );
        const passedForward =
          car.position.sub(startGate.center).dot(startGate.forward) >= 0;
        if ((crossedSeg || passedForward) && moveVec.dot(startGate.forward) > 0) {
          car.crossedStartLine = true;
          car.nextCheckpoint = 1;
        }
      }

      // Check expected next checkpoint gate
      const targetGate = checkpoints[car.nextCheckpoint];
      const crossedGateSegment = segmentsIntersect(
        car.prevPosition,
        car.position,
        targetGate.left,
        targetGate.right
      );
      const distToGateCenter = car.position.dist(targetGate.center);
      const inForwardHalf =
        car.position.sub(targetGate.center).dot(targetGate.forward) >= 0 &&
        distToGateCenter < this.track.wallHalfWidth;
      const movingForward = moveVec.dot(targetGate.forward) > -0.01;

      if ((crossedGateSegment || inForwardHalf) && movingForward) {
        if (car.nextCheckpoint === 0 && car.checkpointsPassedInLap >= numCheckpoints - 1) {
          // Completed a full valid lap!
          if (!car.finished) {
            car.lastLapTime = car.currentLapTime;
            if (car.bestLapTime === null || car.lastLapTime < car.bestLapTime) {
              car.bestLapTime = car.lastLapTime;
            }
            car.currentLapTime = 0;

            if (car.lap >= this.totalLaps) {
              car.finished = true;
              car.finishTime = this.raceTime;
              if (car.isPlayer) {
                this.raceCompleted = true;
              }
            } else {
              car.lap++;
            }
          }
          car.checkpointsPassedInLap = 0;
          car.nextCheckpoint = 1;
        } else {
          car.checkpointsPassedInLap++;
          car.nextCheckpoint = (car.nextCheckpoint + 1) % numCheckpoints;
        }
      }
    }

    /**
     * Computes continuous race progress score and updates racePosition (1..4) for all cars.
     */
    _updateStandings() {
      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i];
        const info = this.track.getClosestTrackInfo(car.position);
        // Handle pre-start-line negative progress smoothly
        let lapProgress = info.progress;
        if (!car.crossedStartLine && lapProgress > 0.8) {
          lapProgress -= 1.0;
        }
        car.totalDistanceScore =
          (car.lap - 1) * 100 +
          car.checkpointsPassedInLap * (100 / this.track.checkpoints.length) +
          lapProgress * 8;
      }

      const sorted = this.cars.slice().sort((a, b) => {
        if (a.finished && b.finished) {
          return a.finishTime - b.finishTime;
        }
        if (a.finished !== b.finished) {
          return a.finished ? -1 : 1;
        }
        return b.totalDistanceScore - a.totalDistanceScore;
      });

      for (let rank = 0; rank < sorted.length; rank++) {
        sorted[rank].racePosition = rank + 1;
      }
      this.standings = sorted;
    }

    /**
     * Returns formatted HUD snapshot of the simulation state.
     */
    getHUDState() {
      const p = this.playerCar;
      const ordinals = ["1st", "2nd", "3rd", "4th"];
      return {
        position: p.racePosition,
        positionText: `${ordinals[p.racePosition - 1] || p.racePosition + "th"} / ${this.cars.length}`,
        lap: p.lap,
        totalLaps: this.totalLaps,
        lapText: `${Math.min(p.lap, this.totalLaps)} / ${this.totalLaps}`,
        raceTime: this.raceTime,
        currentLapTime: p.currentLapTime,
        lastLapTime: p.lastLapTime,
        bestLapTime: p.bestLapTime,
        speedKmh: Math.round(p.velocity.len() * 0.52),
        seed: this.seed,
        tickCount: this.tickCount,
        aiMode: this.aiMode,
        countdown: this.countdown,
        finished: p.finished,
        standings: this.standings.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          position: c.racePosition,
          lap: c.lap,
          finished: c.finished,
          finishTime: c.finishTime,
          isPlayer: c.isPlayer,
        })),
      };
    }
  }

  // ===========================================================================
  // 8. CANVAS RENDERER, CAMERA & HUD CONTROLLER (BROWSER RUNTIME)
  // ===========================================================================

  function formatTime(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
      return "--:--.---";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return (
      String(mins).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0") +
      "." +
      String(ms).padStart(3, "0")
    );
  }

  class ArcadeRacerApp {
    constructor(canvas, hudElements = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.hud = hudElements;

      this.sim = new RaceSimulation({
        seed: 20260501,
        fixedDt: 1 / 60,
        totalLaps: 3,
        aiMode: "hybrid-astar",
      });

      this.accumulator = 0;
      this.lastTimestamp = null;
      this.paused = false;
      this.showDebugOverlay = true;
      this.keys = Object.create(null);

      this.camera = {
        x: this.sim.playerCar.position.x,
        y: this.sim.playerCar.position.y,
        zoom: 1.0,
      };

      this._bindEvents();
      this._resizeCanvas();
    }

    _bindEvents() {
      if (typeof window === "undefined") return;

      window.addEventListener("resize", () => this._resizeCanvas());

      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
            e.code
          ) &&
          document.activeElement &&
          document.activeElement.tagName !== "INPUT"
        ) {
          e.preventDefault();
        }

        if (document.activeElement && document.activeElement.tagName === "INPUT") {
          return;
        }

        if (e.code === "KeyR") {
          this.restartRace();
        } else if (e.code === "KeyP") {
          this.togglePause();
        } else if (e.code === "KeyN" && this.paused) {
          this.stepSingleTick();
        } else if (e.code === "KeyV") {
          this.showDebugOverlay = !this.showDebugOverlay;
        } else if (e.code === "KeyM") {
          const nextMode =
            this.sim.aiMode === "hybrid-astar" ? "waypoint" : "hybrid-astar";
          this.sim.setAIMode(nextMode);
          this._updateDOMHUD();
        }
      });

      window.addEventListener("keyup", (e) => {
        this.keys[e.code] = false;
      });
    }

    _resizeCanvas() {
      if (!this.canvas || typeof window === "undefined") return;
      const rect = this.canvas.parentElement
        ? this.canvas.parentElement.getBoundingClientRect()
        : { width: window.innerWidth, height: window.innerHeight };
      this.canvas.width = Math.max(800, Math.floor(rect.width || window.innerWidth));
      this.canvas.height = Math.max(540, Math.floor(rect.height || window.innerHeight));
    }

    _pollPlayerInput() {
      const c = this.sim.playerCar.controls;
      const up = this.keys["ArrowUp"] || this.keys["KeyW"];
      const down = this.keys["ArrowDown"] || this.keys["KeyS"];
      const left = this.keys["ArrowLeft"] || this.keys["KeyA"];
      const right = this.keys["ArrowRight"] || this.keys["KeyD"];
      const space = this.keys["Space"];

      c.throttle = up ? 1 : 0;
      c.brake = down ? 1 : 0;
      c.steer = (right ? 1 : 0) - (left ? 1 : 0);
      c.handbrake = Boolean(space);
    }

    restartRace(customSeed) {
      const seedToUse =
        customSeed !== undefined ? customSeed : this.sim.seed;
      this.sim.reset(seedToUse);
      this.accumulator = 0;
      this.camera.x = this.sim.playerCar.position.x;
      this.camera.y = this.sim.playerCar.position.y;
      this._updateDOMHUD();
    }

    togglePause() {
      this.paused = !this.paused;
      this._updateDOMHUD();
    }

    stepSingleTick() {
      this._pollPlayerInput();
      this.sim.step();
      this._updateDOMHUD();
      this.render(1.0);
    }

    start() {
      const loop = (timestamp) => {
        if (this.lastTimestamp === null) {
          this.lastTimestamp = timestamp;
        }
        // Clamp frame delta to 0.25s to prevent spiral of death on tab switch
        const frameDelta = Math.min((timestamp - this.lastTimestamp) / 1000, 0.25);
        this.lastTimestamp = timestamp;

        if (!this.paused) {
          this.accumulator += frameDelta;
          const fixedDt = this.sim.fixedDt;
          while (this.accumulator >= fixedDt) {
            this._pollPlayerInput();
            this.sim.step();
            this.accumulator -= fixedDt;
          }
        }

        const alpha = this.paused ? 1.0 : this.accumulator / this.sim.fixedDt;
        this.render(alpha);
        this._updateDOMHUD();
        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    }

    _updateDOMHUD() {
      const state = this.sim.getHUDState();
      if (this.hud.position) this.hud.position.textContent = state.positionText;
      if (this.hud.lap) this.hud.lap.textContent = state.lapText;
      if (this.hud.raceTime)
        this.hud.raceTime.textContent = formatTime(state.raceTime);
      if (this.hud.currLapTime)
        this.hud.currLapTime.textContent = formatTime(state.currentLapTime);
      if (this.hud.bestLapTime)
        this.hud.bestLapTime.textContent = formatTime(state.bestLapTime);
      if (this.hud.lastLapTime)
        this.hud.lastLapTime.textContent = formatTime(state.lastLapTime);
      if (this.hud.speed) this.hud.speed.textContent = `${state.speedKmh} km/h`;
      if (this.hud.tick)
        this.hud.tick.textContent = `Tick #${state.tickCount} (60 Hz)`;
      if (this.hud.aiModeBtn) {
        this.hud.aiModeBtn.textContent =
          state.aiMode === "hybrid-astar"
            ? "AI: A* + Waypoints"
            : "AI: Pure Waypoints";
      }
      if (this.hud.standingsList) {
        this.hud.standingsList.innerHTML = state.standings
          .map(
            (s) => `
          <div class="standing-row ${s.isPlayer ? "is-player" : ""}">
            <span class="standing-rank">P${s.position}</span>
            <span class="standing-swatch" style="background:${s.color}"></span>
            <span class="standing-name">${s.name}</span>
            <span class="standing-lap">${
              s.finished ? formatTime(s.finishTime) : `L${Math.min(s.lap, state.totalLaps)}`
            }</span>
          </div>`
          )
          .join("");
      }
    }

    render(alpha) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const track = this.sim.track;

      // Smooth camera follow on interpolated player car position + slight velocity lookahead
      const pCar = this.sim.playerCar;
      const pInterp = pCar.getInterpolatedTransform(alpha);
      const targetCamX = pInterp.x + pCar.velocity.x * 0.22;
      const targetCamY = pInterp.y + pCar.velocity.y * 0.22;
      this.camera.x = lerp(this.camera.x, targetCamX, 0.14);
      this.camera.y = lerp(this.camera.y, targetCamY, 0.14);

      // 1. Clear & Background Grass Turf
      ctx.fillStyle = "#173c23";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w * 0.5 - this.camera.x, h * 0.5 - this.camera.y);

      // Subtle world turf grid
      this._drawWorldGrid(ctx, track);

      // 2. Draw Track Surface, Curbs, Centerline & Barriers
      this._drawTrack(ctx, track);

      // 3. Draw Tire Skid Marks
      this._drawSkidMarks(ctx);

      // 4. Optional Debug Overlay: Waypoints & AI A* Paths
      if (this.showDebugOverlay) {
        this._drawAIDebugPaths(ctx);
      }

      // 5. Draw All Cars
      for (let i = 0; i < this.sim.cars.length; i++) {
        this._drawCar(ctx, this.sim.cars[i], alpha);
      }

      // 6. Draw Collision Sparks
      this._drawCollisionSparks(ctx);

      ctx.restore();

      // 7. Draw Corner Minimap & Canvas Banner Overlays (Countdown / Finish)
      this._drawMinimap(ctx, w, h);
      this._drawCanvasOverlayBanners(ctx, w, h);
    }

    _drawWorldGrid(ctx, track) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.lineWidth = 1;
      const step = 120;
      ctx.beginPath();
      for (let x = 0; x <= track.worldWidth; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, track.worldHeight);
      }
      for (let y = 0; y <= track.worldHeight; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(track.worldWidth, y);
      }
      ctx.stroke();
    }

    _drawTrack(ctx, track) {
      const wps = track.waypoints;
      const n = wps.length;

      const traceLoop = () => {
        ctx.beginPath();
        ctx.moveTo(wps[0].x, wps[0].y);
        for (let i = 1; i < n; i++) {
          ctx.lineTo(wps[i].x, wps[i].y);
        }
        ctx.closePath();
      };

      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Outer barrier wall shadow & wall
      traceLoop();
      ctx.strokeStyle = "#0e2214";
      ctx.lineWidth = track.wallHalfWidth * 2 + 12;
      ctx.stroke();

      // Grass shoulder / runoff zone inside walls
      traceLoop();
      ctx.strokeStyle = "#1f4e2d";
      ctx.lineWidth = track.wallHalfWidth * 2 - 4;
      ctx.stroke();

      // Red & White Rumble Strips (Curbs)
      traceLoop();
      ctx.strokeStyle = "#d92b2b";
      ctx.lineWidth = (track.roadHalfWidth + track.curbWidth) * 2;
      ctx.stroke();

      traceLoop();
      ctx.save();
      ctx.setLineDash([26, 26]);
      ctx.strokeStyle = "#f2f4f8";
      ctx.lineWidth = (track.roadHalfWidth + track.curbWidth) * 2;
      ctx.stroke();
      ctx.restore();

      // Main Asphalt Road Surface
      traceLoop();
      ctx.strokeStyle = "#2b303a";
      ctx.lineWidth = track.roadHalfWidth * 2;
      ctx.stroke();

      // Subtle inner racing groove
      traceLoop();
      ctx.strokeStyle = "#242831";
      ctx.lineWidth = track.roadHalfWidth * 1.15;
      ctx.stroke();

      // Dashed Centerline
      traceLoop();
      ctx.save();
      ctx.setLineDash([20, 28]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Outer Guardrail Barrier Lines
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const pt = track.leftWall[i % n];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      for (let i = 0; i <= n; i++) {
        const pt = track.rightWall[i % n];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = "#8a99ad";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Checkpoint sector markers
      for (let c = 1; c < track.checkpoints.length; c++) {
        const cp = track.checkpoints[c];
        const lEdge = cp.center.sub(cp.normal.scale(track.roadHalfWidth));
        const rEdge = cp.center.add(cp.normal.scale(track.roadHalfWidth));
        ctx.beginPath();
        ctx.moveTo(lEdge.x, lEdge.y);
        ctx.lineTo(rEdge.x, rEdge.y);
        ctx.strokeStyle =
          c === this.sim.playerCar.nextCheckpoint
            ? "rgba(0, 255, 255, 0.42)"
            : "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Checkered Start / Finish Line at Checkpoint 0
      const startCp = track.checkpoints[0];
      const angle = Math.atan2(startCp.normal.y, startCp.normal.x);
      ctx.save();
      ctx.translate(startCp.center.x, startCp.center.y);
      ctx.rotate(angle);
      const squares = 16;
      const sqSize = (track.roadHalfWidth * 2) / squares;
      for (let r = -1; r <= 0; r++) {
        for (let s = 0; s < squares; s++) {
          ctx.fillStyle = (s + r) % 2 === 0 ? "#ffffff" : "#111111";
          ctx.fillRect(
            -track.roadHalfWidth + s * sqSize,
            r * sqSize,
            sqSize,
            sqSize
          );
        }
      }
      ctx.restore();
    }

    _drawSkidMarks(ctx) {
      const marks = this.sim.skidMarks;
      ctx.fillStyle = "rgba(15, 15, 18, 0.45)";
      for (let i = 0; i < marks.length; i++) {
        ctx.fillRect(marks[i].x - 2, marks[i].y - 2, 4, 4);
      }
    }

    _drawAIDebugPaths(ctx) {
      // Draw track centerline waypoints
      const wps = this.sim.track.waypoints;
      ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
      for (let i = 0; i < wps.length; i += 2) {
        ctx.beginPath();
        ctx.arc(wps[i].x, wps[i].y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw each AI's active A* / Waypoint path & target point
      for (let i = 0; i < this.sim.aiControllers.length; i++) {
        const ai = this.sim.aiControllers[i];
        const path = ai.plannedPath;
        if (path && path.length > 0) {
          ctx.beginPath();
          ctx.moveTo(ai.car.position.x, ai.car.position.y);
          for (let k = 0; k < path.length; k++) {
            ctx.lineTo(path[k].x, path[k].y);
          }
          ctx.strokeStyle = ai.car.color + "88";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (ai.targetPoint) {
          ctx.beginPath();
          ctx.arc(ai.targetPoint.x, ai.targetPoint.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = ai.car.color;
          ctx.fill();
        }
      }
    }

    _drawCar(ctx, car, alpha) {
      const t = car.getInterpolatedTransform(alpha);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);

      const hl = car.halfLength;
      const hw = car.halfWidth;

      // Drop shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.beginPath();
      ctx.roundRect(-hl + 3, -hw + 4, car.length, car.width, 6);
      ctx.fill();

      // 4 Wheels (front wheels rotate with steering angle)
      const wheelPositions = [
        { x: hl - 9, y: -hw - 1, front: true },
        { x: hl - 9, y: hw - 3, front: true },
        { x: -hl + 8, y: -hw - 1, front: false },
        { x: -hl + 8, y: hw - 3, front: false },
      ];
      ctx.fillStyle = "#111317";
      for (let i = 0; i < wheelPositions.length; i++) {
        const wp = wheelPositions[i];
        ctx.save();
        ctx.translate(wp.x, wp.y + 2);
        if (wp.front) ctx.rotate(car.wheelSteerAngle);
        ctx.fillRect(-5, -2.5, 10, 5);
        ctx.restore();
      }

      // Car Body Chassis
      ctx.fillStyle = car.collisionFlash > 0 ? "#ffffff" : car.color;
      ctx.beginPath();
      ctx.roundRect(-hl, -hw, car.length, car.width, 6);
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center Racing Stripe
      ctx.fillStyle = car.accentColor;
      ctx.fillRect(-hl + 4, -2.5, car.length - 8, 5);

      // Cockpit / Windshield
      ctx.fillStyle = "#182232";
      ctx.beginPath();
      ctx.roundRect(-6, -hw + 4, 16, car.width - 8, 3);
      ctx.fill();

      // Rear Spoiler
      ctx.fillStyle = "#16181d";
      ctx.fillRect(-hl + 1, -hw + 1, 4, car.width - 2);

      // Headlights
      ctx.fillStyle = "#fff9c4";
      ctx.fillRect(hl - 2, -hw + 3, 2, 4);
      ctx.fillRect(hl - 2, hw - 7, 2, 4);

      // Brake Lights
      if (car.controls.brake > 0 || car.controls.handbrake) {
        ctx.fillStyle = "#ff1744";
        ctx.shadowColor = "#ff1744";
        ctx.shadowBlur = 8;
        ctx.fillRect(-hl, -hw + 3, 2.5, 4.5);
        ctx.fillRect(-hl, hw - 7.5, 2.5, 4.5);
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // Overhead Driver Tag
      ctx.save();
      ctx.font = "bold 11px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(10, 14, 22, 0.78)";
      const label = `P${car.racePosition} ${car.isPlayer ? "YOU" : car.name.split(" ")[0]}`;
      const metrics = ctx.measureText(label);
      const bw = metrics.width + 10;
      ctx.fillRect(t.x - bw * 0.5, t.y - 34, bw, 16);
      ctx.fillStyle = car.isPlayer ? "#00ffff" : "#ffffff";
      ctx.fillText(label, t.x, t.y - 22);
      ctx.restore();
    }

    _drawCollisionSparks(ctx) {
      for (let i = 0; i < this.sim.collisionEvents.length; i++) {
        const ev = this.sim.collisionEvents[i];
        const radius = (0.25 - ev.ttl) * 75 + 6;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ev.point.x, ev.point.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 210, 80, ${ev.ttl * 4})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawMinimap(ctx, canvasW, canvasH) {
      const track = this.sim.track;
      const mapW = 210;
      const mapH = 145;
      const pad = 16;
      const x0 = canvasW - mapW - pad;
      const y0 = canvasH - mapH - pad;
      const scaleX = (mapW - 20) / track.worldWidth;
      const scaleY = (mapH - 20) / track.worldHeight;

      ctx.save();
      ctx.fillStyle = "rgba(12, 16, 24, 0.84)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x0, y0, mapW, mapH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.translate(x0 + 10, y0 + 10);

      // Minimap Track Outline
      ctx.beginPath();
      const wps = track.waypoints;
      for (let i = 0; i < wps.length; i++) {
        const mx = wps[i].x * scaleX;
        const my = wps[i].y * scaleY;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.closePath();
      ctx.strokeStyle = "#5c667a";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Start line dot
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(wps[0].x * scaleX - 2, wps[0].y * scaleY - 4, 4, 8);

      // Car dots
      for (let i = 0; i < this.sim.cars.length; i++) {
        const c = this.sim.cars[i];
        ctx.beginPath();
        ctx.arc(
          c.position.x * scaleX,
          c.position.y * scaleY,
          c.isPlayer ? 4.5 : 3.5,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = c.isPlayer ? "#00ffff" : c.color;
        ctx.fill();
      }
      ctx.restore();
    }

    _drawCanvasOverlayBanners(ctx, w, h) {
      if (this.sim.countdown > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 22, 0.65)";
        ctx.fillRect(w * 0.5 - 150, h * 0.25 - 40, 300, 76);
        ctx.font = "bold 36px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffdd57";
        const countNum = Math.ceil(this.sim.countdown * 2);
        ctx.fillText(`READY... ${countNum}`, w * 0.5, h * 0.25 + 10);
        ctx.restore();
      } else if (this.sim.raceTime < 1.0) {
        ctx.save();
        ctx.font = "bold 40px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#00ff9d";
        ctx.fillText("GO! GO! GO!", w * 0.5, h * 0.24);
        ctx.restore();
      }

      if (this.sim.playerCar.finished) {
        const st = this.sim.getHUDState();
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 24, 0.85)";
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(w * 0.5 - 210, h * 0.5 - 85, 420, 170, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText("RACE FINISHED!", w * 0.5, h * 0.5 - 38);

        ctx.fillStyle = "#00ffff";
        ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText(
          `Final Position: ${st.positionText}  |  Time: ${formatTime(this.sim.playerCar.finishTime)}`,
          w * 0.5,
          h * 0.5 + 4
        );

        ctx.fillStyle = "#b5c2d9";
        ctx.font = "15px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText(
          `Best Lap: ${formatTime(st.bestLapTime)} — Press [R] to Race Again`,
          w * 0.5,
          h * 0.5 + 44
        );
        ctx.restore();
      }
    }
  }

  // ===========================================================================
  // 9. AUTO-INITIALIZATION FOR BROWSER & CLI HEADLESS VERIFICATION
  // ===========================================================================

  function ensureDOMStructure() {
    if (document.getElementById("gameCanvas")) return;

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #0d1117; color: #e6edf3; font-family: system-ui, sans-serif; user-select: none; }
      .viewport { position: relative; width: 100vw; height: 100vh; }
      #gameCanvas { display: block; width: 100%; height: 100%; }
      .hud-top { position: absolute; top: 14px; left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; gap: 12px; }
      .hud-cards { display: flex; flex-wrap: wrap; gap: 10px; }
      .hud-card { background: rgba(12, 17, 26, 0.85); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; padding: 8px 14px; min-width: 112px; }
      .hud-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #8b9bb4; margin-bottom: 3px; }
      .hud-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; color: #fff; }
      .hud-value.accent-cyan { color: #00ffff; }
      .hud-value.accent-gold { color: #ffdd57; }
      .hud-value.accent-green { color: #00ff9d; }
      .hud-standings-card { background: rgba(12, 17, 26, 0.85); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; padding: 10px 14px; min-width: 235px; }
      .standing-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 4px; border-radius: 4px; }
      .standing-row.is-player { background: rgba(0, 255, 255, 0.14); font-weight: 700; color: #00ffff; }
      .standing-rank { width: 22px; font-weight: 700; }
      .standing-swatch { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
      .standing-name { flex: 1; }
      .standing-lap { color: #b5c2d9; font-weight: 600; }
      .hud-bottom { position: absolute; bottom: 16px; left: 16px; display: flex; flex-direction: column; gap: 8px; background: rgba(12, 17, 26, 0.85); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; padding: 10px 14px; }
      .controls-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .seed-label { font-size: 12px; font-weight: 600; color: #8b9bb4; }
      .seed-input { background: #161f30; border: 1px solid rgba(255, 255, 255, 0.22); color: #fff; border-radius: 5px; padding: 4px 8px; font-size: 12px; width: 110px; font-family: monospace; }
      .hud-btn { background: #233149; border: 1px solid rgba(255, 255, 255, 0.2); color: #e6edf3; border-radius: 5px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
      .help-text { font-size: 11px; color: #9fb0c9; }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "viewport";
    container.innerHTML = `
      <canvas id="gameCanvas"></canvas>
      <header class="hud-top">
        <div class="hud-cards">
          <div class="hud-card"><span class="hud-label">Position</span><span class="hud-value accent-cyan" id="hudPosition">4th / 4</span></div>
          <div class="hud-card"><span class="hud-label">Lap</span><span class="hud-value accent-gold" id="hudLap">1 / 3</span></div>
          <div class="hud-card"><span class="hud-label">Race Time</span><span class="hud-value" id="hudRaceTime">00:00.000</span></div>
          <div class="hud-card"><span class="hud-label">Current Lap</span><span class="hud-value" id="hudCurrLap">00:00.000</span></div>
          <div class="hud-card"><span class="hud-label">Best Lap</span><span class="hud-value accent-green" id="hudBestLap">--:--.---</span></div>
          <div class="hud-card"><span class="hud-label">Last Lap</span><span class="hud-value" id="hudLastLap">--:--.---</span></div>
          <div class="hud-card"><span class="hud-label">Speed</span><span class="hud-value accent-cyan" id="hudSpeed">0 km/h</span></div>
        </div>
        <div class="hud-standings-card">
          <span class="hud-label">Live Standings</span>
          <div id="hudStandings"></div>
        </div>
      </header>
      <footer class="hud-bottom">
        <div class="controls-row">
          <label class="seed-label" for="seedInput">RNG Seed:</label>
          <input id="seedInput" class="seed-input" type="text" value="20260501" />
          <button id="btnRestart" class="hud-btn" type="button">Restart w/ Seed (R)</button>
          <button id="btnAiMode" class="hud-btn" type="button">AI: A* + Waypoints</button>
          <button id="btnDebug" class="hud-btn" type="button">Toggle Path Overlay (V)</button>
          <span class="seed-label" id="hudTick">Tick #0 (60 Hz)</span>
        </div>
        <div class="help-text">
          Controls: W/Up Accelerate | S/Down Brake/Reverse | A/D/Left/Right Steer | Space Handbrake | P Pause (N Step)
        </div>
      </footer>
    `;
    document.body.appendChild(container);
  }

  function initBrowserGame() {
    if (typeof document === "undefined" || !document.body) return null;
    ensureDOMStructure();
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return null;

    const hudElements = {
      position: document.getElementById("hudPosition"),
      lap: document.getElementById("hudLap"),
      raceTime: document.getElementById("hudRaceTime"),
      currLapTime: document.getElementById("hudCurrLap"),
      bestLapTime: document.getElementById("hudBestLap"),
      lastLapTime: document.getElementById("hudLastLap"),
      speed: document.getElementById("hudSpeed"),
      tick: document.getElementById("hudTick"),
      standingsList: document.getElementById("hudStandings"),
      aiModeBtn: document.getElementById("btnAiMode"),
    };

    const app = new ArcadeRacerApp(canvas, hudElements);

    // Wire UI buttons if present
    const seedInput = document.getElementById("seedInput");
    const btnRestart = document.getElementById("btnRestart");
    const btnAiMode = document.getElementById("btnAiMode");
    const btnDebug = document.getElementById("btnDebug");

    if (btnRestart) {
      btnRestart.addEventListener("click", () => {
        const val = seedInput && seedInput.value.trim() ? seedInput.value.trim() : 20260501;
        const parsed = Number.isNaN(Number(val)) ? val : Number(val);
        app.restartRace(parsed);
      });
    }

    if (btnAiMode) {
      btnAiMode.addEventListener("click", () => {
        const nextMode =
          app.sim.aiMode === "hybrid-astar" ? "waypoint" : "hybrid-astar";
        app.sim.setAIMode(nextMode);
        app._updateDOMHUD();
      });
    }

    if (btnDebug) {
      btnDebug.addEventListener("click", () => {
        app.showDebugOverlay = !app.showDebugOverlay;
      });
    }

    app.start();
    window.racerApp = app;
    return app;
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initBrowserGame);
    } else {
      initBrowserGame();
    }
  } else if (
    typeof require === "function" &&
    typeof module === "object" &&
    require.main === module
  ) {
    // Headless deterministic CLI verification run when executed directly with Node
    const sim = new RaceSimulation({
      seed: 20260501,
      fixedDt: 1 / 60,
      totalLaps: 2,
      aiMode: "hybrid-astar",
    });
    for (let tick = 0; tick < 3000; tick++) {
      // Simple autopilot for player car in CLI demo
      const info = sim.track.getClosestTrackInfo(sim.playerCar.position);
      const targetWp =
        sim.track.waypoints[(info.wpIndex + 4) % sim.track.waypoints.length];
      const desiredAngle = Math.atan2(
        targetWp.y - sim.playerCar.position.y,
        targetWp.x - sim.playerCar.position.x
      );
      const err = normalizeAngle(desiredAngle - sim.playerCar.angle);
      sim.playerCar.controls = {
        throttle: 0.92,
        brake: Math.abs(err) > 0.65 ? 0.4 : 0,
        steer: clamp(err * 2.2, -1, 1),
        handbrake: false,
      };
      sim.step();
    }
    const hud = sim.getHUDState();
    console.log(
      `[Top-Down 2D Arcade Racer] Completed ${hud.tickCount} fixed ticks (dt=1/60s) with seed=${hud.seed}`
    );
    for (const s of hud.standings) {
      console.log(
        `  P${s.position}: ${s.name.padEnd(15)} | Lap ${s.lap} | Finished: ${
          s.finished ? formatTime(s.finishTime) : "In Progress"
        }`
      );
    }
  }

  return {
    DeterministicRNG,
    Vec2,
    Track,
    AStarPlanner,
    AIController,
    Car,
    PhysicsSolver,
    RaceSimulation,
    ArcadeRacerApp,
    formatTime,
  };
});
