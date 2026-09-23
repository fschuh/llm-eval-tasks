/*
 * Collision detection and response (no external physics engine).
 *
 * Detection: separating-axis test between convex polygons. A car is an oriented box and a
 * wall segment is a two-vertex "polygon" (two faces with opposite normals). When the shapes
 * overlap, the incident edge is clipped against the reference face (the Box2D-lite approach),
 * which gives up to two contact points. They are merged into one point at their centre, with
 * the depth of the deepest one.
 *
 * Response: a single normal impulse j = -(1+e)·vn / (1/mA + 1/mB + (rA×n)²/IA + (rB×n)²/IB)
 * at the contact, a Coulomb-clamped friction impulse along the tangent, and a positional
 * correction that removes most of the penetration. Walls are static bodies (infinite mass).
 * Every pass runs in fixed array order, which keeps the result deterministic.
 */
(function (Racer) {
  'use strict';
  const M = Racer.M;

  const WALL_RESTITUTION = 0.3;
  const WALL_FRICTION = 0.3;
  const CAR_RESTITUTION = 0.35;
  const CAR_FRICTION = 0.1;
  const BOUNCE_THRESHOLD = 40; // slower approaches are resolved inelastically (prevents jitter)
  const SLOP = 0.25; // penetration tolerated without positional correction
  const CORRECTION = 0.8; // fraction of the remaining penetration removed per pass
  const ITERATIONS = 3;
  const EVENT_MIN_IMPULSE = 25;

  function makePoly(maxVerts) {
    return {
      count: 0,
      vx: new Float64Array(maxVerts), vy: new Float64Array(maxVerts),
      nx: new Float64Array(maxVerts), ny: new Float64Array(maxVerts),
    };
  }

  /** Oriented box; edge i runs from vertex i to i+1 and has outward normal i. */
  function setCarPoly(p, car) {
    const c = car.c, s = car.s, hl = car.length / 2, hw = car.width / 2;
    const fx = c * hl, fy = s * hl; // half forward axis
    const rx = -s * hw, ry = c * hw; // half right axis
    p.count = 4;
    p.vx[0] = car.x + fx + rx; p.vy[0] = car.y + fy + ry; p.nx[0] = -s; p.ny[0] = c; // right side
    p.vx[1] = car.x - fx + rx; p.vy[1] = car.y - fy + ry; p.nx[1] = -c; p.ny[1] = -s; // rear
    p.vx[2] = car.x - fx - rx; p.vy[2] = car.y - fy - ry; p.nx[2] = s; p.ny[2] = -c; // left side
    p.vx[3] = car.x + fx - rx; p.vy[3] = car.y + fy - ry; p.nx[3] = c; p.ny[3] = s; // front
    return p;
  }

  function setWallPoly(p, w) {
    p.count = 2;
    p.vx[0] = w.ax; p.vy[0] = w.ay; p.nx[0] = w.nx; p.ny[0] = w.ny;
    p.vx[1] = w.bx; p.vy[1] = w.by; p.nx[1] = -w.nx; p.ny[1] = -w.ny;
    return p;
  }

  const sepOut = { sep: 0, edge: 0 };

  /** Largest separation of B's vertices along A's face normals (SAT). */
  function maxSeparation(A, B) {
    let bestSep = -Infinity, bestEdge = 0;
    for (let i = 0; i < A.count; i++) {
      const nx = A.nx[i], ny = A.ny[i], vx = A.vx[i], vy = A.vy[i];
      let minD = Infinity;
      for (let j = 0; j < B.count; j++) {
        const d = nx * (B.vx[j] - vx) + ny * (B.vy[j] - vy);
        if (d < minD) minD = d;
      }
      if (minD > bestSep) { bestSep = minD; bestEdge = i; }
    }
    sepOut.sep = bestSep;
    sepOut.edge = bestEdge;
  }

  /**
   * Polygon vs polygon. On overlap fills m with the normal (pointing from A to B), a contact
   * point and penetration depth, and returns true.
   */
  function collide(A, B, m) {
    maxSeparation(A, B);
    const sepA = sepOut.sep, edgeA = sepOut.edge;
    if (sepA > 0) return false;
    maxSeparation(B, A);
    const sepB = sepOut.sep, edgeB = sepOut.edge;
    if (sepB > 0) return false;

    let ref = A, inc = B, e = edgeA, flip = false;
    if (sepB > sepA + 0.01) { ref = B; inc = A; e = edgeB; flip = true; }

    const nx = ref.nx[e], ny = ref.ny[e];
    const e2 = (e + 1) % ref.count;
    const v1x = ref.vx[e], v1y = ref.vy[e], v2x = ref.vx[e2], v2y = ref.vy[e2];

    // Incident edge: the face on the other shape most opposed to the reference normal.
    let ie = 0, minDot = Infinity;
    for (let i = 0; i < inc.count; i++) {
      const d = nx * inc.nx[i] + ny * inc.ny[i];
      if (d < minDot) { minDot = d; ie = i; }
    }
    const ie2 = (ie + 1) % inc.count;
    let c0x = inc.vx[ie], c0y = inc.vy[ie], c1x = inc.vx[ie2], c1y = inc.vy[ie2];

    // Clip the incident edge to the reference face's side planes.
    let tx = v2x - v1x, ty = v2y - v1y;
    const tl = M.len(tx, ty);
    tx /= tl; ty /= tl;
    const lo = tx * v1x + ty * v1y, hi = tx * v2x + ty * v2y;
    let d0 = tx * c0x + ty * c0y, d1 = tx * c1x + ty * c1y;
    if (d0 < lo) {
      if (d1 < lo) return false;
      const u = (lo - d0) / (d1 - d0);
      c0x += (c1x - c0x) * u; c0y += (c1y - c0y) * u; d0 = lo;
    } else if (d1 < lo) {
      const u = (lo - d1) / (d0 - d1);
      c1x += (c0x - c1x) * u; c1y += (c0y - c1y) * u; d1 = lo;
    }
    if (d0 > hi) {
      if (d1 > hi) return false;
      const u = (d0 - hi) / (d0 - d1);
      c0x += (c1x - c0x) * u; c0y += (c1y - c0y) * u;
    } else if (d1 > hi) {
      const u = (d1 - hi) / (d1 - d0);
      c1x += (c0x - c1x) * u; c1y += (c0y - c1y) * u;
    }

    // Keep clipped points that lie behind the reference face.
    const front = nx * v1x + ny * v1y;
    const s0 = nx * c0x + ny * c0y - front, s1 = nx * c1x + ny * c1y - front;
    let count = 0, px = 0, py = 0, depth = 0;
    if (s0 <= 0) { px += c0x; py += c0y; depth = Math.max(depth, -s0); count++; }
    if (s1 <= 0) { px += c1x; py += c1y; depth = Math.max(depth, -s1); count++; }
    if (count === 0) return false;
    m.x = px / count;
    m.y = py / count;
    m.depth = depth;
    m.nx = flip ? -nx : nx;
    m.ny = flip ? -ny : ny;
    return true;
  }

  /**
   * Impulse resolution for one contact. The normal points from A to B.
   * Returns the normal impulse magnitude.
   */
  function resolve(A, B, m, restitution, friction) {
    const nx = m.nx, ny = m.ny;
    const rAx = m.x - A.x, rAy = m.y - A.y, rBx = m.x - B.x, rBy = m.y - B.y;
    let jn = 0;

    // Relative velocity of B with respect to A at the contact point (v + ω × r).
    let rvx = B.vx - B.av * rBy - (A.vx - A.av * rAy);
    let rvy = B.vy + B.av * rBx - (A.vy + A.av * rAx);
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const rAn = rAx * ny - rAy * nx, rBn = rBx * ny - rBy * nx;
      const kn = A.invMass + B.invMass + rAn * rAn * A.invI + rBn * rBn * B.invI;
      const e = -vn > BOUNCE_THRESHOLD ? restitution : 0;
      jn = (-(1 + e) * vn) / kn;
      applyImpulse(A, -jn * nx, -jn * ny, rAx, rAy);
      applyImpulse(B, jn * nx, jn * ny, rBx, rBy);

      // Coulomb friction along the tangential relative velocity.
      rvx = B.vx - B.av * rBy - (A.vx - A.av * rAy);
      rvy = B.vy + B.av * rBx - (A.vy + A.av * rAx);
      const vn2 = rvx * nx + rvy * ny;
      let tx = rvx - vn2 * nx, ty = rvy - vn2 * ny;
      const vt = M.len(tx, ty);
      if (vt > 1e-9) {
        tx /= vt; ty /= vt;
        const rAt = rAx * ty - rAy * tx, rBt = rBx * ty - rBy * tx;
        const kt = A.invMass + B.invMass + rAt * rAt * A.invI + rBt * rBt * B.invI;
        const jt = M.clamp(-vt / kt, -friction * jn, friction * jn);
        applyImpulse(A, -jt * tx, -jt * ty, rAx, rAy);
        applyImpulse(B, jt * tx, jt * ty, rBx, rBy);
      }
    }

    // Positional correction (split by inverse mass) so objects don't sink into each other.
    const invSum = A.invMass + B.invMass;
    if (invSum > 0) {
      const corr = (Math.max(m.depth - SLOP, 0) * CORRECTION) / invSum;
      A.x -= nx * corr * A.invMass; A.y -= ny * corr * A.invMass;
      B.x += nx * corr * B.invMass; B.y += ny * corr * B.invMass;
    }
    return jn;
  }

  function applyImpulse(body, jx, jy, rx, ry) {
    if (body.invMass === 0) return;
    body.vx += jx * body.invMass;
    body.vy += jy * body.invMass;
    body.av += (rx * jy - ry * jx) * body.invI;
  }

  // Scratch state, reused every tick (collision runs synchronously, so sharing is safe).
  const STATIC_BODY = { x: 0, y: 0, vx: 0, vy: 0, av: 0, invMass: 0, invI: 0 };
  const polyA = makePoly(4), polyB = makePoly(4), wallPoly = makePoly(2);
  const manifold = { x: 0, y: 0, depth: 0, nx: 0, ny: 0 };
  const nearbyWalls = [];

  /** Car-vs-wall and car-vs-car collisions for one tick. Hit events are pushed to world.events. */
  function resolveCollisions(world) {
    const cars = world.cars, track = world.track;
    for (let it = 0; it < ITERATIONS; it++) {
      for (const car of cars) {
        const r = car.radius + 2;
        track.wallIndex.query(car.x - r, car.y - r, car.x + r, car.y + r, nearbyWalls);
        setCarPoly(polyA, car);
        for (const wall of nearbyWalls) {
          if (!collide(polyA, setWallPoly(wallPoly, wall), manifold)) continue;
          const j = resolve(car, STATIC_BODY, manifold, WALL_RESTITUTION, WALL_FRICTION);
          setCarPoly(polyA, car);
          if (it === 0 && j > EVENT_MIN_IMPULSE) {
            world.events.push({ type: 'hit', x: manifold.x, y: manifold.y, impulse: j, a: car.id, b: -1 });
          }
        }
      }
      for (let i = 0; i < cars.length; i++) {
        for (let k = i + 1; k < cars.length; k++) {
          const A = cars[i], B = cars[k];
          const dx = B.x - A.x, dy = B.y - A.y, rr = A.radius + B.radius;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (!collide(setCarPoly(polyA, A), setCarPoly(polyB, B), manifold)) continue;
          const j = resolve(A, B, manifold, CAR_RESTITUTION, CAR_FRICTION);
          if (it === 0 && j > EVENT_MIN_IMPULSE) {
            world.events.push({ type: 'hit', x: manifold.x, y: manifold.y, impulse: j, a: A.id, b: B.id });
          }
        }
      }
    }
  }

  Racer.Collision = { makePoly, setCarPoly, setWallPoly, collide, resolve, resolveCollisions, STATIC_BODY };
})(globalThis.Racer = globalThis.Racer || {});
