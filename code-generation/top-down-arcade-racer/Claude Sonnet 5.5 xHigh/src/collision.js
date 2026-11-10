/*
 * collision.js — contact detection and impulse-based response.
 *
 * Shapes:  each car is a row of overlapping circles along its axis (see CAR.circleOffsets);
 *          the track barrier is a static wall running parallel to the centreline at
 *          distance `track.wallHalf` on both sides (so a circle touches it when its centre
 *          is further than wallHalf - r from the centreline).
 *
 * Response (the classic "simple impulse resolution"):
 *   for a contact with normal n (pointing out of B, into A) at point p:
 *       v_rel  = (vA + wA x rA) - (vB + wB x rB)
 *       j      = -(1 + e) (v_rel . n) / (1/mA + 1/mB + (rA x n)^2/IA + (rB x n)^2/IB)
 *       vA += j n / mA ,  wA += (rA x j n) / IA        (and the opposite for B)
 *   followed by a Coulomb friction impulse along the tangent (|jt| <= mu j), a few
 *   sequential-impulse passes for stacked contacts, and a small positional correction
 *   (with slop) so bodies don't sink into one another.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});
  const CFG = R.CONFIG;
  const CAR = CFG.CAR;
  const C = CFG.COLLISION;

  const NC = CAR.circleOffsets.length;
  const RAD = CAR.circleRadius;
  const MAX_CONTACTS = NC * NC;

  // Scratch buffers (no per-tick allocation).
  const contacts = [];
  for (let i = 0; i < MAX_CONTACTS; i++) contacts.push({ x: 0, y: 0, nx: 0, ny: 0, pen: 0 });
  const Q = { i: 0, t: 0, cx: 0, cy: 0, dist: 0, d: 0, s: 0 };

  /**
   * Apply one impulse to car A (and B unless B is null = static) for a contact.
   * Returns the normal impulse magnitude (0 if the bodies were already separating).
   */
  function applyContactImpulse(A, B, px, py, nx, ny, e, mu) {
    const rax = px - A.x;
    const ray = py - A.y;
    let rbx = 0;
    let rby = 0;
    let vbx = 0;
    let vby = 0;
    let invMb = 0;
    let invIb = 0;
    if (B) {
      rbx = px - B.x;
      rby = py - B.y;
      vbx = B.vx - B.omega * rby;
      vby = B.vy + B.omega * rbx;
      invMb = B.invMass;
      invIb = B.invInertia;
    }
    // relative velocity of the contact point on A w.r.t. B
    let rvx = A.vx - A.omega * ray - vbx;
    let rvy = A.vy + A.omega * rax - vby;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0; // separating

    const raN = rax * ny - ray * nx; // rA x n
    const rbN = rbx * ny - rby * nx;
    const denom = A.invMass + invMb + raN * raN * A.invInertia + rbN * rbN * invIb;
    const rest = vn < -C.bounceThreshold ? e : 0;
    const j = (-(1 + rest) * vn) / denom;

    A.vx += j * nx * A.invMass;
    A.vy += j * ny * A.invMass;
    A.omega += raN * j * A.invInertia;
    if (B) {
      B.vx -= j * nx * invMb;
      B.vy -= j * ny * invMb;
      B.omega -= rbN * j * invIb;
    }

    // ---- Coulomb friction along the contact tangent ----
    rvx = A.vx - A.omega * ray - (B ? B.vx - B.omega * rby : 0);
    rvy = A.vy + A.omega * rax - (B ? B.vy + B.omega * rbx : 0);
    const tx0 = rvx - (rvx * nx + rvy * ny) * nx;
    const ty0 = rvy - (rvx * nx + rvy * ny) * ny;
    const tl = Math.hypot(tx0, ty0);
    if (tl > 1e-6) {
      const tx = tx0 / tl;
      const ty = ty0 / tl;
      const raT = rax * ty - ray * tx;
      const rbT = rbx * ty - rby * tx;
      const denomT = A.invMass + invMb + raT * raT * A.invInertia + rbT * rbT * invIb;
      let jt = -tl / denomT;
      const lim = mu * j;
      if (jt > lim) jt = lim;
      else if (jt < -lim) jt = -lim;
      A.vx += jt * tx * A.invMass;
      A.vy += jt * ty * A.invMass;
      A.omega += raT * jt * A.invInertia;
      if (B) {
        B.vx -= jt * tx * invMb;
        B.vy -= jt * ty * invMb;
        B.omega -= rbT * jt * invIb;
      }
    }
    return j;
  }

  /**
   * Car vs car. Returns the largest normal impulse applied (0 = no contact), and fills
   * `hit` (if given) with the world position of the strongest contact.
   */
  function solveCarCar(a, b, hit) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (dx * dx + dy * dy > C.pairRange * C.pairRange) return 0;

    // --- detect: every circle of A against every circle of B ---
    const ca = Math.cos(a.angle);
    const sa = Math.sin(a.angle);
    const cb = Math.cos(b.angle);
    const sb = Math.sin(b.angle);
    let count = 0;
    let deepest = -1;
    const rr = RAD + RAD;
    for (let i = 0; i < NC; i++) {
      const ax = a.x + ca * CAR.circleOffsets[i];
      const ay = a.y + sa * CAR.circleOffsets[i];
      for (let k = 0; k < NC; k++) {
        const bx = b.x + cb * CAR.circleOffsets[k];
        const by = b.y + sb * CAR.circleOffsets[k];
        const ddx = ax - bx;
        const ddy = ay - by;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const ct = contacts[count];
        if (d > 1e-6) {
          ct.nx = ddx / d;
          ct.ny = ddy / d;
        } else {
          ct.nx = 1;
          ct.ny = 0;
        }
        ct.pen = rr - d;
        // midpoint of the overlap lens
        ct.x = bx + ct.nx * (RAD - ct.pen * 0.5);
        ct.y = by + ct.ny * (RAD - ct.pen * 0.5);
        if (deepest < 0 || ct.pen > contacts[deepest].pen) deepest = count;
        count++;
      }
    }
    if (count === 0) return 0;

    // --- velocity solve: a few sequential passes ---
    let maxJ = 0;
    for (let it = 0; it < C.iterations; it++) {
      for (let c = 0; c < count; c++) {
        const ct = contacts[c];
        const j = applyContactImpulse(a, b, ct.x, ct.y, ct.nx, ct.ny, C.carRestitution, C.carFriction);
        if (j > maxJ) {
          maxJ = j;
          if (hit) {
            hit.x = ct.x;
            hit.y = ct.y;
          }
        }
      }
    }

    // --- positional correction along the deepest contact, split by inverse mass ---
    const dp = contacts[deepest];
    const corr = Math.max(dp.pen - C.slop, 0) * C.percent;
    if (corr > 0) {
      const w = a.invMass + b.invMass;
      a.x += dp.nx * corr * (a.invMass / w);
      a.y += dp.ny * corr * (a.invMass / w);
      b.x -= dp.nx * corr * (b.invMass / w);
      b.y -= dp.ny * corr * (b.invMass / w);
    }
    return maxJ;
  }

  /**
   * Car vs the track barrier. Also updates car.offFrac (share of the circles on grass).
   * Returns the largest normal impulse applied (0 = no contact).
   */
  function solveCarWall(car, track, hit) {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    let off = 0;
    let maxJ = 0;
    let worstPen = 0;
    let wnx = 0;
    let wny = 0;
    for (let k = 0; k < NC; k++) {
      const cx = car.x + c * CAR.circleOffsets[k];
      const cy = car.y + s * CAR.circleOffsets[k];
      track.nearest(cx, cy, car.hint, 10, Q);
      if (Q.dist > track.halfWidth) off++;
      const pen = Q.dist + RAD - track.wallHalf;
      if (pen <= 0) continue;
      // wall normal points from the wall back towards the centreline
      const nx = (Q.cx - cx) / Q.dist;
      const ny = (Q.cy - cy) / Q.dist;
      const j = applyContactImpulse(car, null, cx - nx * RAD, cy - ny * RAD, nx, ny, C.wallRestitution, C.wallFriction);
      if (j > maxJ) {
        maxJ = j;
        if (hit) {
          hit.x = cx - nx * RAD;
          hit.y = cy - ny * RAD;
        }
      }
      if (pen > worstPen) {
        worstPen = pen;
        wnx = nx;
        wny = ny;
      }
    }
    car.offFrac = off / NC;
    if (worstPen > 0) {
      const corr = Math.max(worstPen - C.slop * 0.5, 0);
      car.x += wnx * corr;
      car.y += wny * corr;
    }
    return maxJ;
  }

  R.Collision = { solveCarCar, solveCarWall, applyContactImpulse };
})();
