/*
 * Deterministic math for the simulation.
 *
 * ECMAScript pins down +, -, *, / and Math.sqrt exactly (IEEE-754 round-to-nearest),
 * but Math.sin / cos / tan / atan2 / exp / pow / hypot (and the ** operator) are
 * "implementation-approximated" and may differ in the last bits between JS engines.
 * Simulation code only uses the functions below, which are built purely from exactly
 * specified operations, so a seed + input log replays bit-for-bit in any browser.
 * Rendering code is free to use Math.* directly.
 */
(function (Racer) {
  'use strict';

  const PI = 3.141592653589793;
  const TAU = 6.283185307179586;
  const HALF_PI = 1.5707963267948966;
  const SQRT3 = 1.7320508075688772;
  const TAN_PI_12 = 0.2679491924311227;
  const PI_6 = 0.5235987755982988;

  /** Wrap an angle into [-PI, PI). */
  function wrapAngle(a) {
    return a - TAU * Math.floor((a + PI) / TAU);
  }

  function sin(x) {
    let r = wrapAngle(x);
    if (r > HALF_PI) r = PI - r;
    else if (r < -HALF_PI) r = -PI - r;
    const r2 = r * r;
    // Taylor series through x^15: |error| < 1e-11 on [-PI/2, PI/2].
    return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 +
      r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))));
  }

  function cos(x) {
    return sin(x + HALF_PI);
  }

  function tan(x) {
    return sin(x) / cos(x);
  }

  /** atan(z) for z in [0, 1]. */
  function atanUnit(z) {
    let offset = 0;
    if (z > TAN_PI_12) {
      // atan(z) = PI/6 + atan((z*sqrt3 - 1) / (z + sqrt3)) maps (tan(PI/12), 1] into |z| <= tan(PI/12).
      z = (z * SQRT3 - 1) / (z + SQRT3);
      offset = PI_6;
    }
    const z2 = z * z;
    return offset + z * (1 - z2 * (1 / 3 - z2 * (1 / 5 - z2 * (1 / 7 - z2 * (1 / 9 -
      z2 * (1 / 11 - z2 * (1 / 13 - z2 / 15)))))));
  }

  function atan2(y, x) {
    const ax = Math.abs(x), ay = Math.abs(y);
    if (ax === 0 && ay === 0) return 0;
    let a = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
    if (x < 0) a = PI - a;
    return y < 0 ? -a : a;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Move v toward target by at most maxDelta (never overshoots). */
  function moveToward(v, target, maxDelta) {
    if (v < target) return v + maxDelta < target ? v + maxDelta : target;
    return v - maxDelta > target ? v - maxDelta : target;
  }

  function len(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function sign(v) {
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
    const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
    return Math.sqrt(dx * dx + dy * dy);
  }

  Racer.M = {
    PI, TAU, HALF_PI,
    wrapAngle, sin, cos, tan, atan2,
    clamp, lerp, moveToward, len, sign, distToSegment,
  };
})(globalThis.Racer = globalThis.Racer || {});
