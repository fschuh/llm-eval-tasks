/*
 * Car model: a rigid body (position, velocity, heading, angular velocity) driven by a
 * simple arcade tire model:
 *   - longitudinal: engine force that fades toward top speed, brakes, reverse gear,
 *     rolling resistance and quadratic aero drag;
 *   - lateral: tires cancel sideways velocity up to a grip limit (beyond it the car slides);
 *   - yaw: the kinematic bicycle model gives a target yaw rate from the steering angle, capped
 *     by front grip (understeer), and the tires pull the angular velocity toward it with
 *     limited torque. That last step matters: collision impulses can spin the car and
 *     the tires then have to recover, instead of the heading being set directly.
 * All units are world units / seconds (≈10 units per metre).
 */
(function (Racer) {
  'use strict';
  const M = Racer.M;

  const CAR_SPEC = Object.freeze({
    length: 44,
    width: 22,
    wheelBase: 28,
    mass: 1,
    engineAccel: 270, // at standstill; fades linearly to zero at maxSpeed
    maxSpeed: 620, // engine cut-off; drag keeps the real top speed near 520
    reverseAccel: 170,
    maxReverse: 150,
    gearSwitchSpeed: 8, // below this, "brake" engages reverse and "throttle" drives forward
    brakeDecel: 720,
    rollResist: 22,
    dragK: 1.1e-4,
    grip: 720, // max lateral acceleration the tires can supply
    handbrakeGrip: 250,
    handbrakeDecel: 240,
    handbrakeYawGain: 1.6,
    frontGrip: 780, // caps yaw rate at frontGrip / speed (understeer at the limit)
    yawAccel: 16, // how quickly tires can change the yaw rate (rad/s^2)
    slideDrag: 150, // extra deceleration while sliding sideways
    maxSteerLow: 0.62, // wheel lock (rad) at standstill...
    maxSteerHigh: 0.19, // ...and at steerFadeSpeed and above
    steerFadeSpeed: 460,
    steerRate: 4.0, // rad/s the wheels turn toward the input
    steerReturnRate: 6.5,
    skidThreshold: 55,
  });

  class Car {
    constructor(id, opts = {}) {
      this.id = id;
      this.name = opts.name || 'CAR ' + id;
      this.color = opts.color || '#ccc';
      this.isPlayer = !!opts.isPlayer;
      this.spec = opts.spec || CAR_SPEC;
      const P = this.spec;
      this.length = P.length;
      this.width = P.width;
      this.mass = P.mass;
      this.invMass = 1 / P.mass;
      this.inertia = (P.mass * (P.length * P.length + P.width * P.width)) / 12;
      this.invI = 1 / this.inertia;
      this.radius = Math.sqrt(P.length * P.length + P.width * P.width) / 2;

      this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      this.driver = null; // AI controller (also used as autopilot for the player)
      this.place(0, 0, 0);
    }

    place(x, y, angle) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.vx = 0;
      this.vy = 0;
      this.av = 0;
      this.steer = 0;
      this.speed = 0;
      this.slip = 0;
      this.skidding = false;
      this.braking = false;
      this.updateTrig();
      this.savePrev();
    }

    savePrev() {
      this.prevX = this.x;
      this.prevY = this.y;
      this.prevAngle = this.angle;
    }

    updateTrig() {
      this.c = M.cos(this.angle);
      this.s = M.sin(this.angle);
    }

    forwardSpeed() {
      return this.vx * this.c + this.vy * this.s;
    }

    /** Current steering lock (depends on speed). */
    maxSteer() {
      const P = this.spec;
      const t = M.clamp(Math.abs(this.forwardSpeed()) / P.steerFadeSpeed, 0, 1);
      return P.maxSteerLow + (P.maxSteerHigh - P.maxSteerLow) * t;
    }

    integrate(dt) {
      const P = this.spec, ctl = this.controls;
      const c = this.c, s = this.s;
      let vf = this.vx * c + this.vy * s; // forward
      let vl = -this.vx * s + this.vy * c; // lateral (+ = right)
      const absVf = Math.abs(vf);

      // Steering: speed-sensitive lock, rate-limited wheel angle (returns to center faster).
      const targetSteer = M.clamp(ctl.steer, -1, 1) * this.maxSteer();
      const rate = Math.abs(targetSteer) < Math.abs(this.steer) ? P.steerReturnRate : P.steerRate;
      this.steer = M.moveToward(this.steer, targetSteer, rate * dt);

      // Longitudinal forces: `drive` pushes, `resist` always opposes motion without overshooting 0.
      const throttle = M.clamp(ctl.throttle, 0, 1), brake = M.clamp(ctl.brake, 0, 1);
      let drive = 0;
      let resist = P.rollResist + P.dragK * vf * vf + P.slideDrag * M.clamp(Math.abs(vl) / 60, 0, 1);
      this.braking = false;
      if (throttle > 0) {
        if (vf > -P.gearSwitchSpeed) drive += P.engineAccel * throttle * Math.max(0, 1 - vf / P.maxSpeed);
        else { resist += P.brakeDecel * throttle; this.braking = true; }
      }
      if (brake > 0) {
        if (vf > P.gearSwitchSpeed) { resist += P.brakeDecel * brake; this.braking = true; }
        else if (throttle === 0) drive -= P.reverseAccel * brake * Math.max(0, 1 + vf / P.maxReverse);
      }
      if (ctl.handbrake) { resist += P.handbrakeDecel; this.braking = true; }
      vf += drive * dt;
      vf = M.moveToward(vf, 0, resist * dt);

      // Lateral grip: tires remove at most grip*dt of sideways velocity per step.
      const maxDv = (ctl.handbrake ? P.handbrakeGrip : P.grip) * dt;
      this.slip = vl;
      vl = M.moveToward(vl, 0, maxDv);
      this.skidding = Math.abs(this.slip) > P.skidThreshold || (this.braking && brake > 0.9 && absVf > 160);

      // Yaw: bicycle-model target, capped by front grip, reached with finite tire torque.
      let targetYaw = (vf * M.tan(this.steer)) / P.wheelBase;
      const yawLimit = P.frontGrip / Math.max(absVf, 40);
      targetYaw = M.clamp(targetYaw, -yawLimit, yawLimit);
      if (ctl.handbrake) targetYaw *= P.handbrakeYawGain;
      this.av = M.moveToward(this.av, targetYaw, P.yawAccel * dt);

      // Semi-implicit Euler: new velocity first, then pose.
      this.vx = vf * c - vl * s;
      this.vy = vf * s + vl * c;
      this.angle += this.av * dt;
      this.updateTrig();
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.speed = M.len(this.vx, this.vy);
    }
  }

  Racer.Car = Car;
  Racer.CAR_SPEC = CAR_SPEC;
})(globalThis.Racer = globalThis.Racer || {});
