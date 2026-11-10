/*
 * ai.js — waypoint-following opponents.
 *
 * 1. buildRacingLine(track): once per track, relax a lateral offset for every centreline
 *    sample so the path straightens through corners (shortest/min-curvature style, clamped
 *    to stay inside the asphalt). The result is a dense list of waypoints.
 * 2. A speed profile over those waypoints: corner speed from curvature and the tyre
 *    budget, then a backward pass (braking zones) and a forward pass (acceleration limit)
 *    so the AI brakes early enough and never asks for more than the car can do.
 * 3. AIDriver: every tick aim at a waypoint a speed-dependent distance ahead (pure
 *    pursuit), follow the speed profile with a throttle/brake controller, shift the
 *    aim laterally to pass/avoid other cars, and run a reverse manoeuvre if stuck.
 *
 * The AI drives exactly the same Car model as the player through the same input
 * object ({throttle, brake, steer, handbrake}); it has no extra grip or power.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});
  const CFG = R.CONFIG;
  const CAR = CFG.CAR;
  const A = CFG.AI;
  const { Car, wrapAngle } = R;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // --------------------------------------------------------------- racing line

  function buildRacingLine(track) {
    const n = track.n;
    const maxOff = track.halfWidth - A.edgeMargin;
    let off = new Float64Array(n);
    let next = new Float64Array(n);
    const X = new Float64Array(n);
    const Y = new Float64Array(n);
    const k = A.lineStencil;

    for (let it = 0; it < A.lineIterations; it++) {
      for (let i = 0; i < n; i++) {
        X[i] = track.px[i] + track.nx[i] * off[i];
        Y[i] = track.py[i] + track.ny[i] * off[i];
      }
      for (let i = 0; i < n; i++) {
        const a = (i - k + n) % n;
        const b = (i + k) % n;
        // where the chord midpoint lies, measured along this sample's normal
        const mx = 0.5 * (X[a] + X[b]) - track.px[i];
        const my = 0.5 * (Y[a] + Y[b]) - track.py[i];
        const target = mx * track.nx[i] + my * track.ny[i];
        next[i] = clamp(off[i] + A.lineRelax * (target - off[i]), -maxOff, maxOff);
      }
      [off, next] = [next, off];
    }
    // final [1 2 1] smoothing so the offsets are jitter free
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < n; i++) next[i] = 0.25 * off[(i + n - 1) % n] + 0.5 * off[i] + 0.25 * off[(i + 1) % n];
      [off, next] = [next, off];
    }

    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = track.px[i] + track.nx[i] * off[i];
      y[i] = track.py[i] + track.ny[i] * off[i];
    }

    // curvature of the racing line (Menger: 1/R of the circle through 3 points)
    const kappa = new Float64Array(n);
    const m = 3;
    for (let i = 0; i < n; i++) {
      const a = (i - m + n) % n;
      const b = (i + m) % n;
      const abx = x[i] - x[a];
      const aby = y[i] - y[a];
      const bcx = x[b] - x[i];
      const bcy = y[b] - y[i];
      const cross = Math.abs(abx * bcy - aby * bcx);
      const la = Math.hypot(abx, aby);
      const lb = Math.hypot(bcx, bcy);
      const lc = Math.hypot(x[b] - x[a], y[b] - y[a]);
      kappa[i] = (2 * cross) / Math.max(la * lb * lc, 1e-9);
    }

    // ---- speed profile ----
    const aLat = A.latFrac * CAR.gripLat;
    const aBrake = A.brakeFrac * CAR.brake;
    const vTop = A.topFrac * Car.terminalSpeed();
    const seg = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      seg[i] = Math.hypot(x[j] - x[i], y[j] - y[i]);
    }
    const speed = new Float64Array(n);
    for (let i = 0; i < n; i++) speed[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(kappa[i], 1e-6)));
    for (let pass = 0; pass < 2; pass++) {
      // braking zones: what speed can we carry here and still make the next sample's limit?
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        speed[i] = Math.min(speed[i], Math.sqrt(speed[j] * speed[j] + 2 * aBrake * seg[i]));
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      // acceleration limit out of slow corners
      for (let i = 0; i < n; i++) {
        const p = (i + n - 1) % n;
        const acc = Math.max(30, Car.netAccel(speed[p]));
        speed[i] = Math.min(speed[i], Math.sqrt(speed[p] * speed[p] + 2 * acc * seg[p]));
      }
    }
    return { offset: off, x, y, kappa, speed, maxOffset: maxOff };
  }

  // ------------------------------------------------------------------- driver

  class AIDriver {
    /**
     * @param {Car} car
     * @param {Race} race
     * @param {{skill:number, bias:number}} personality
     */
    constructor(car, race, personality) {
      this.car = car;
      this.race = race;
      this.skill = personality.skill;
      this.bias = personality.bias;
      this.shift = 0; // lateral avoidance offset (slewed)
      this.avoidId = -1;
      this.avoidDir = 1;
      this.obstacleCap = Infinity;
      this.stuckTimer = 0;
      this.reverseTimer = 0;
      this.reverseSteer = 0;
      this.reversals = 0; // how many times the stuck-recovery manoeuvre fired (diagnostics)
      this.targetX = 0; // exposed for the debug overlay
      this.targetY = 0;
    }

    _avoidance(dt, jOff) {
      const race = this.race;
      const track = race.track;
      const rl = race.racingLine;
      const me = this.car;
      const L = track.length;
      const n = track.n;
      let other = null;
      let otherAhead = 0;
      let nearest = Infinity;
      for (let q = 0; q < race.cars.length; q++) {
        const o = race.cars[q];
        if (o === me) continue;
        let ahead = o.s - me.s;
        if (ahead > L / 2) ahead -= L;
        else if (ahead < -L / 2) ahead += L;
        if (ahead < -A.avoidBehind || ahead > A.avoidAhead) continue;
        if (Math.abs(o.d - me.d) > A.avoidWidth + 14) continue;
        // the car that is closest in front matters most; cars alongside count as "ahead = 0"
        const key = Math.abs(ahead < 0 ? ahead * 2 : ahead);
        if (key < nearest) {
          nearest = key;
          other = o;
          otherAhead = ahead;
        }
      }

      this.obstacleCap = Infinity;
      const maxOff = rl.maxOffset;
      const baseOff = rl.offset[(me.hint + jOff) % n] + this.bias;
      let shiftTarget = 0;
      if (other) {
        // How much lateral clearance could I get on each side of that car, given the walls?
        const roomLeft = Math.min(maxOff, other.d + A.avoidClear) - other.d;
        const roomRight = other.d - Math.max(-maxOff, other.d - A.avoidClear);
        const roomKept = this.avoidDir > 0 ? roomLeft : roomRight;
        if (other.id !== this.avoidId || roomKept < A.avoidClear * 0.8) {
          // (re)choose: the side with more room; on a tie, the side I'm already on
          if (Math.abs(roomLeft - roomRight) < 3) this.avoidDir = me.d >= other.d ? 1 : -1;
          else this.avoidDir = roomLeft > roomRight ? 1 : -1;
          this.avoidId = other.id;
        }
        const want = clamp(other.d + this.avoidDir * A.avoidClear, -maxOff, maxOff);
        shiftTarget = want - baseOff;
        // can't get around yet and about to touch: match their speed
        const gap = otherAhead - CAR.length;
        if (otherAhead > 0 && gap < 90 && Math.abs(other.d - me.d) < A.avoidWidth - 6) {
          this.obstacleCap = Math.max(40, other.vF + gap * 1.6 - 18);
        }
      } else {
        this.avoidId = -1;
      }
      const maxStep = A.avoidSlew * dt;
      this.shift += clamp(shiftTarget - this.shift, -maxStep, maxStep);
    }

    update(dt) {
      const car = this.car;
      const race = this.race;
      const track = race.track;
      const rl = race.racingLine;
      const inp = car.input;
      const n = track.n;
      inp.handbrake = 0;

      if (race.phase !== 'racing') {
        inp.throttle = 0;
        inp.brake = 0;
        inp.steer = 0;
        return;
      }

      // ---- reverse manoeuvre (stuck against something) ----
      if (this.reverseTimer > 0) {
        this.reverseTimer -= dt;
        inp.throttle = 0;
        inp.brake = 1;
        inp.steer = this.reverseSteer;
        return;
      }

      const speed = Math.max(car.vF, 0);
      const i = car.hint;
      const look = A.lookMin + A.lookGain * speed;
      const jOff = Math.max(2, Math.round(look / track.ds));
      const j = (i + jOff) % n;

      this._avoidance(dt, jOff);

      // ---- steering: pure pursuit towards a point on the (shifted) racing line ----
      const lat = clamp(rl.offset[j] + this.bias + this.shift, -rl.maxOffset, rl.maxOffset);
      const tx = track.px[j] + track.nx[j] * lat;
      const ty = track.py[j] + track.ny[j] * lat;
      this.targetX = tx;
      this.targetY = ty;
      const dx = tx - car.x;
      const dy = ty - car.y;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const alpha = wrapAngle(Math.atan2(dy, dx) - car.angle);
      const sinA = Math.abs(alpha) > Math.PI / 2 ? Math.sign(alpha) : Math.sin(alpha);
      const tanCmd = (2 * CAR.wheelbase * sinA) / dist;
      const tanLim = Car.steerLimit(Math.max(car.vF, 1), 1 - car.offFrac * 0.45);
      const raw = tanCmd / tanLim;
      inp.steer = clamp(raw, -1, 1);

      // ---- speed: follow the profile ----
      const lead = Math.round((speed * A.brakeLead) / track.ds);
      let vT = rl.speed[(i + lead) % n] * this.skill * race.rubberFactor(car);
      if (car.finished) vT = Math.min(vT, A.cooldownSpeed);
      vT = Math.min(vT, this.obstacleCap);
      if (Math.abs(alpha) > 1.0) vT = Math.min(vT, 110); // badly pointed: crawl round
      if (car.offFrac > 0.3) vT = Math.min(vT, 260); // on the grass: get back on the road

      const err = vT - car.vF;
      if (err >= 0) {
        inp.throttle = clamp(err / A.throttleGain, 0, 1);
        inp.brake = 0;
      } else {
        inp.throttle = 0;
        inp.brake = err < -A.coastBand && car.vF > 40 ? clamp(-err / A.brakeGain, 0, 1) : 0;
      }
      // asking for more steering than the tyres can give at this speed -> lift
      if (Math.abs(raw) > 1.12 && speed > 140) {
        inp.throttle = 0;
        inp.brake = Math.max(inp.brake, Math.min(0.5, Math.abs(raw) - 1.12));
      }

      // ---- stuck detection ----
      if (Math.abs(car.vF) < 20 && race.raceTime() > 1.5 && !car.finished) {
        this.stuckTimer += dt;
        if (this.stuckTimer > A.stuckTime) {
          this.reverseTimer = A.reverseTime;
          this.reversals++;
          this.reverseSteer = -Math.sign(raw || 1);
          this.stuckTimer = 0;
        }
      } else {
        this.stuckTimer = 0;
      }
    }
  }

  R.buildRacingLine = buildRacingLine;
  R.AIDriver = AIDriver;
})();
