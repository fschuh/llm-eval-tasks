/*
 * car.js — arcade car dynamics (rigid body + simple tyre model).
 *
 * The body has position, heading, linear velocity and yaw rate. Every fixed tick the
 * velocity is split into the car's own frame (forward vF, sideways vL) and:
 *
 *   forward  : engine (tapering towards top speed) / brakes / reverse, minus rolling
 *              resistance and quadratic drag
 *   sideways : the tyres remove sideways velocity with a stiff exponential, but never
 *              faster than the friction budget allows. Beyond that the car slides
 *              (drift / understeer). The budget is an ellipse shared with the
 *              longitudinal force, so hard braking or accelerating reduces cornering grip
 *   steering : the road-wheel angle is rate limited and its lock is reduced with speed so
 *              full lock asks for ~the grip limit; yaw rate follows v * tan(delta) / wheelbase
 *
 * Collisions (collision.js) act directly on vx, vy and omega, so a hit transfers
 * momentum and spin and the tyre model then settles the car again.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});
  const P = R.CONFIG.CAR;
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function moveToward(v, target, maxDelta) {
    if (target > v) return Math.min(v + maxDelta, target);
    return Math.max(v - maxDelta, target);
  }

  class Car {
    constructor(id, opts) {
      opts = opts || {};
      this.id = id;
      this.name = opts.name || 'CAR ' + id;
      this.color = opts.color || '#e63946';
      this.isPlayer = !!opts.isPlayer;

      // rigid body
      this.x = 0;
      this.y = 0;
      this.angle = 0;
      this.vx = 0;
      this.vy = 0;
      this.omega = 0;
      this.mass = P.mass;
      this.invMass = 1 / P.mass;
      this.inertia = (P.mass * (P.length * P.length + P.width * P.width)) / 12;
      this.invInertia = 1 / this.inertia;

      // previous-tick pose, for render interpolation
      this.prevX = 0;
      this.prevY = 0;
      this.prevAngle = 0;

      // controls (all set each tick by the player input or the AI driver)
      this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
      this.steerTan = 0; // tan(road-wheel angle), the smoothed steering state

      // derived, refreshed every step
      this.vF = 0;
      this.vL = 0;
      this.speed = 0;
      this.aLong = 0;
      this.skid = 0; // 0..1, how much the tyres are sliding (drives skid marks)
      this.offFrac = 0; // fraction of the body on grass (set by the collision pass)

      // track / race bookkeeping (owned by Race)
      this.hint = 0;
      this.s = 0;
      this.d = 0;
      this.sPrev = 0;
      this.progress = 0;
      this.cp = 0;
      this.lapsDone = 0;
      this.lapStarts = [0];
      this.lapTimes = [];
      this.bestLap = Infinity;
      this.gateTimes = [];
      this.finished = false;
      this.finishTime = 0;
      this.position = 1;
      this.wrongWay = false;
      this.stats = { wallHits: 0, carHits: 0, maxSpeed: 0 };
    }

    place(x, y, angle) {
      this.x = this.prevX = x;
      this.y = this.prevY = y;
      this.angle = this.prevAngle = angle;
      this.vx = this.vy = this.omega = 0;
      this.steerTan = 0;
    }

    savePrev() {
      this.prevX = this.x;
      this.prevY = this.y;
      this.prevAngle = this.angle;
    }

    /** World position of collision circle k. */
    circleX(k) {
      return this.x + Math.cos(this.angle) * P.circleOffsets[k];
    }
    circleY(k) {
      return this.y + Math.sin(this.angle) * P.circleOffsets[k];
    }

    // ------------------------------------------------- static helpers (used by AI too)

    /** Net forward acceleration at speed v with the throttle floored, on asphalt. */
    static netAccel(v) {
      const u = v / P.maxSpeed;
      return P.accel * Math.max(0, 1 - u * u) - P.rolling - P.drag * v * v;
    }

    /** Speed at which full throttle no longer accelerates the car. */
    static terminalSpeed() {
      let lo = 0;
      let hi = P.maxSpeed;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if (Car.netAccel(mid) > 0) lo = mid;
        else hi = mid;
      }
      return lo;
    }

    /** Max tan(steer) at forward speed vF: lock shrinks so full lock ~= the grip limit. */
    static steerLimit(vF, gripMul) {
      const g = P.steerOverGrip * P.gripLat * (gripMul === undefined ? 1 : gripMul) * P.wheelbase;
      return Math.min(P.maxTanSteer, g / Math.max(vF * vF, 1));
    }

    // ------------------------------------------------------------------- dynamics

    step(dt) {
      const inp = this.input;
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      let vF = this.vx * c + this.vy * s; // along the heading
      let vL = -this.vx * s + this.vy * c; // sideways (+ = towards the car's right)

      const off = this.offFrac;
      const G = P.grass;
      const vmax = P.maxSpeed * (1 - off * (1 - G.speed));
      const gripMul = 1 - off * (1 - G.grip);
      const rollMul = 1 + off * (G.rolling - 1);
      const accelMul = 1 - off * (1 - G.accel);
      const hb = inp.handbrake > 0.5;

      // ---- longitudinal ----
      const thr = clamp(inp.throttle, 0, 1);
      const brk = clamp(inp.brake, 0, 1);
      let aLong = 0;
      if (thr > 0) {
        if (vF < -15) {
          aLong += P.brake * thr; // throttle while rolling backwards = braking
        } else {
          const u = Math.max(vF, 0) / vmax;
          aLong += P.accel * accelMul * thr * Math.max(0, 1 - u * u);
        }
      }
      if (brk > 0) {
        if (vF > 15) {
          aLong -= P.brake * brk;
        } else {
          const u = Math.max(-vF, 0) / P.reverseMax; // brake pedal doubles as reverse
          aLong -= P.reverseAccel * brk * Math.max(0, 1 - u * u);
        }
      }
      vF += aLong * dt;
      const resist = (P.rolling * rollMul + P.drag * vF * vF + (hb ? P.handbrake.decel : 0)) * dt;
      if (vF > 0) vF = Math.max(0, vF - resist);
      else if (vF < 0) vF = Math.min(0, vF + resist);

      // ---- lateral (tyre grip) ----
      const lonFrac = Math.min(Math.abs(aLong) / P.gripLong, 0.95);
      let latCap = P.gripLat * gripMul * Math.sqrt(1 - lonFrac * lonFrac);
      let K = P.gripK * (0.6 + 0.4 * gripMul);
      if (hb) {
        latCap *= P.handbrake.grip;
        K = P.handbrake.K;
      }
      const want = vL * (1 - Math.exp(-K * dt));
      const maxDv = latCap * dt;
      vL -= clamp(want, -maxDv, maxDv);
      // how hard are the tyres working beyond their limit? (cosmetic: skid marks)
      let skid = clamp((Math.abs(vL) - 40) / 70, 0, 1);
      if (hb && Math.abs(vF) > 120) skid = Math.max(skid, 0.8);
      this.skid = skid;

      // ---- steering / yaw ----
      const tanLim = Car.steerLimit(vF, gripMul);
      const target = clamp(inp.steer, -1, 1) * tanLim;
      const towardsMore = Math.abs(target) > Math.abs(this.steerTan) && target * this.steerTan >= 0;
      this.steerTan = moveToward(this.steerTan, target, (towardsMore ? P.steerRate : P.steerReturnRate) * dt);
      this.steerTan = clamp(this.steerTan, -tanLim, tanLim);
      let wTarget = (vF * this.steerTan) / P.wheelbase;
      if (hb) wTarget *= P.handbrake.yaw;
      this.omega += (wTarget - this.omega) * (1 - Math.exp(-P.yawResponse * dt));

      // ---- integrate (semi-implicit Euler) ----
      this.vx = c * vF - s * vL;
      this.vy = s * vF + c * vL;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle += this.omega * dt;
      if (this.angle > Math.PI) this.angle -= TAU;
      else if (this.angle < -Math.PI) this.angle += TAU;

      this.vF = vF;
      this.vL = vL;
      this.speed = Math.hypot(this.vx, this.vy);
      this.aLong = aLong;
      if (this.speed > this.stats.maxSpeed) this.stats.maxSpeed = this.speed;
    }

    /** Refresh vF / vL / speed after something external (a collision) changed the velocity. */
    refreshVelocityFrame() {
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      this.vF = this.vx * c + this.vy * s;
      this.vL = -this.vx * s + this.vy * c;
      this.speed = Math.hypot(this.vx, this.vy);
    }
  }

  R.Car = Car;
})();
