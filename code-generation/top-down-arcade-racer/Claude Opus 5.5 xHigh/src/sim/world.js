/*
 * World: owns the track, the cars and the race rules, and advances them in fixed steps.
 *
 * Determinism contract: given the same config (seed, track, laps, ...) and the same sequence
 * of player input bitmasks, step() produces bit-identical state on every run and in every
 * engine. Accordingly the sim never reads wall-clock time or Math.random, it only uses the
 * deterministic math in dmath.js, it iterates in fixed array order, and every random choice
 * comes from a named stream derived from the seed.
 *
 * Lap detection: the track is split by checkpoint gates. A car must cross the gates in order,
 * in the forward direction (crossing the last gate backwards takes it back). A lap counts
 * when the start/finish gate is crossed with all other gates passed. Crossing times are
 * interpolated inside the tick, so lap times have sub-tick precision.
 */
(function (Racer) {
  'use strict';
  const M = Racer.M;

  const TPS = 120; // simulation ticks per second
  const DT = 1 / TPS;
  const COUNTDOWN_TICKS = 3 * TPS;
  const GATE_REACH = 30; // gates extend this far past the walls

  const INPUT = Object.freeze({ UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, HANDBRAKE: 16 });

  const DEFAULTS = Object.freeze({
    seed: 1337,
    track: 'classic',
    laps: 3,
    autopilot: false, // player car driven by the AI (demo / attract mode)
    rubberBand: 0.03, // max ±3% AI pace adjustment relative to the player
  });

  const ROSTER = [
    { name: 'YOU', color: '#2f9bff', isPlayer: true },
    { name: 'VEGA', color: '#ff5252' },
    { name: 'KATO', color: '#ffc43d' },
    { name: 'ROOK', color: '#3ad98a' },
  ];

  const hashView = new DataView(new ArrayBuffer(8));

  function hashFloat(h, v) {
    hashView.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) {
      h ^= hashView.getUint8(i);
      h = Math.imul(h, 0x01000193);
    }
    return h;
  }

  function applyInput(ctl, bits) {
    ctl.throttle = bits & INPUT.UP ? 1 : 0;
    ctl.brake = bits & INPUT.DOWN ? 1 : 0;
    ctl.steer = (bits & INPUT.RIGHT ? 1 : 0) - (bits & INPUT.LEFT ? 1 : 0);
    ctl.handbrake = (bits & INPUT.HANDBRAKE) !== 0;
  }

  /**
   * Fraction of the step (x0,y0)->(x1,y1) at which it crosses the gate in direction `dir`
   * (+1 forward, -1 backward), or -1 if it doesn't.
   */
  function gateCrossing(gate, x0, y0, x1, y1, dir, halfExtent) {
    const d0 = (x0 - gate.x) * gate.tx + (y0 - gate.y) * gate.ty;
    const d1 = (x1 - gate.x) * gate.tx + (y1 - gate.y) * gate.ty;
    if (dir > 0 ? !(d0 < 0 && d1 >= 0) : !(d0 >= 0 && d1 < 0)) return -1;
    const f = d0 / (d0 - d1);
    const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f;
    const lat = (cx - gate.x) * gate.nx + (cy - gate.y) * gate.ny;
    return Math.abs(lat) <= halfExtent ? f : -1;
  }

  class World {
    constructor(options = {}) {
      const cfg = Object.assign({}, DEFAULTS, options);
      cfg.seed = Racer.parseSeed(cfg.seed);
      cfg.laps = M.clamp(Math.floor(Number(cfg.laps)) || DEFAULTS.laps, 1, 50);
      this.config = cfg;
      this.seed = cfg.seed;

      const rng = new Racer.RNG(cfg.seed);
      this.track = Racer.buildTrack(cfg.track, rng.derive('track'), cfg.seed);
      this.nav = Racer.AI.createNavigator(this.track);
      this.tick = 0;
      this.startTick = COUNTDOWN_TICKS;
      this.phase = 'countdown'; // 'countdown' | 'racing' | 'finished'
      this.events = [];
      this.finishCount = 0;
      this._proj = {};

      this.cars = ROSTER.map((r, id) => new Racer.Car(id, r));
      this.player = this.cars[0];

      // Starting grid: AI order is shuffled by the seed; the player starts from the back.
      const order = rng.derive('grid').shuffle([1, 2, 3]).concat([0]);
      this.gridSlots = order.map((carId, slot) => {
        const p = this.gridSlot(slot);
        this.cars[carId].place(p.x, p.y, p.angle);
        return p;
      });

      // Each AI rolls a personality and plans its own racing line with A*. The player's car
      // gets a neutral autopilot, used in demo mode and after crossing the finish line.
      const aiRng = rng.derive('ai');
      for (const car of this.cars) {
        const personality = car.isPlayer ? Racer.AI.AUTOPILOT_PERSONALITY : Racer.AI.rollPersonality(aiRng);
        const line = Racer.AI.planRacingLine(this.track, personality.line);
        car.driver = new Racer.AI.AIDriver(car, line, personality);
      }
      for (const car of this.cars) this._initRaceState(car);
      this._updateStandings();
    }

    /** Staggered two-column grid behind the start line. */
    gridSlot(slot) {
      const tr = this.track;
      const row = slot >> 1, col = slot & 1;
      const p = tr.pointAt(-(70 + row * 80 + col * 40));
      const lat = (col === 0 ? -1 : 1) * tr.halfWidth * 0.4;
      return { x: p.x + p.nx * lat, y: p.y + p.ny * lat, angle: M.atan2(p.ty, p.tx) };
    }

    _initRaceState(car) {
      car.gatesPassed = 0; // net forward gate crossings (the start line is the first)
      car.lapsDone = 0; // completed laps (high-water mark, never decreases)
      car.lapStart = this.startTick; // tick (fractional) when the current lap began
      car.lapTimes = []; // ticks per completed lap
      car.gateTimes = [this.startTick]; // gateTimes[k]: tick when the car first reached k gates
      car.lastLap = 0;
      car.bestLap = Infinity;
      car.finished = false;
      car.finishTime = 0;
      car.position = 0;
      car.raceDist = 0; // gates passed + fraction toward the next gate; used for ranking
      car.wrongWay = 0; // seconds spent driving against the track direction
      const p = this.track.project(car.x, car.y, -1, this._proj);
      car.trackIdx = p.i;
      car.trackS = p.s;
      car.trackLat = p.lat;
      this._updateProgress(car);
    }

    /** Advances the simulation by exactly one fixed tick. */
    step(inputBits = 0) {
      this.events.length = 0;
      for (const car of this.cars) car.savePrev();

      if (this.phase === 'countdown') {
        this.tick++;
        if (this.tick >= this.startTick) {
          this.phase = 'racing';
          this.events.push({ type: 'go' });
        }
        return;
      }

      for (const car of this.cars) {
        if (car.isPlayer && !car.finished && !this.config.autopilot) applyInput(car.controls, inputBits);
        else car.driver.think(this, DT);
      }
      for (const car of this.cars) car.integrate(DT);
      Racer.Collision.resolveCollisions(this);
      for (const car of this.cars) this._updateRaceState(car);
      this._updateStandings();
      for (const e of this.events) if (e.type === 'finish') e.position = this.cars[e.car].position;
      this.tick++;
    }

    _updateRaceState(car) {
      const tr = this.track, G = tr.gates.length, reach = tr.halfWidth + GATE_REACH;
      const p = tr.project(car.x, car.y, car.trackIdx, this._proj);
      car.trackIdx = p.i;
      car.trackS = p.s;
      car.trackLat = p.lat;

      const next = tr.gates[car.gatesPassed % G];
      const f = gateCrossing(next, car.prevX, car.prevY, car.x, car.y, 1, reach);
      if (f >= 0) {
        car.gatesPassed++;
        if (car.gateTimes.length === car.gatesPassed) car.gateTimes.push(this.tick + f);
        if (next.k === 0) this._lineCrossed(car, this.tick + f);
      } else if (car.gatesPassed > 0) {
        const prev = tr.gates[(car.gatesPassed - 1) % G];
        if (gateCrossing(prev, car.prevX, car.prevY, car.x, car.y, -1, reach) >= 0) car.gatesPassed--;
      }

      this._updateProgress(car);

      const along = car.vx * tr.tx[p.i] + car.vy * tr.ty[p.i];
      car.wrongWay = along < -40 ? car.wrongWay + DT : Math.max(0, car.wrongWay - 2 * DT);
    }

    /** raceDist = gates passed + fraction of the way to the next gate (used for ranking). */
    _updateProgress(car) {
      const tr = this.track, G = tr.gates.length;
      const last = tr.gates[(((car.gatesPassed - 1) % G) + G) % G];
      const next = tr.gates[car.gatesPassed % G];
      const span = tr.wrapS(next.s - last.s) || tr.length;
      car.raceDist = car.gatesPassed + M.clamp(tr.deltaS(last.s, car.trackS) / span, 0, 0.999);
    }

    _lineCrossed(car, t) {
      const G = this.track.gates.length;
      const completed = Math.floor((car.gatesPassed - 1) / G);
      // The first crossing starts lap 1; re-crossing after backing over the line changes nothing;
      // finished cars keep driving, but their result is final.
      if (car.finished || completed <= car.lapsDone) return;
      const lapTicks = t - car.lapStart;
      car.lapsDone = completed;
      car.lapStart = t;
      car.lapTimes.push(lapTicks);
      car.lastLap = lapTicks;
      const best = lapTicks < car.bestLap;
      if (best) car.bestLap = lapTicks;
      const final = completed >= this.config.laps;
      this.events.push({ type: 'lap', car: car.id, lap: completed, ticks: lapTicks, best, final });
      if (final) {
        car.finished = true;
        car.finishTime = t;
        this.finishCount++;
        this.events.push({ type: 'finish', car: car.id, position: 0, ticks: t - this.startTick });
        if (this.finishCount === this.cars.length) this.phase = 'finished';
      }
    }

    _updateStandings() {
      this.standings = this.cars.slice().sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.finishTime - b.finishTime || a.id - b.id;
        return b.raceDist - a.raceDist || a.id - b.id;
      });
      this.standings.forEach((car, i) => { car.position = i + 1; });
    }

    /** Race clock in ticks (0 during the countdown). */
    raceTicks() {
      return Math.max(0, this.tick - this.startTick);
    }

    /**
     * Timing-loop gap to the leader in ticks: difference between the moments both cars reached
     * the last gate this car has passed (like sector timing in real racing). Null before the
     * first gate.
     */
    gapToLeader(car) {
      const leader = this.standings[0];
      if (car === leader) return 0;
      if (car.finished && leader.finished) return car.finishTime - leader.finishTime;
      const k = Math.min(car.gateTimes.length, leader.gateTimes.length) - 1;
      return k > 0 ? car.gateTimes[k] - leader.gateTimes[k] : null;
    }

    /** Current lap for display (1-based, capped at the lap count). */
    currentLap(car) {
      return Math.min(this.config.laps, car.lapsDone + 1);
    }

    /** 32-bit FNV-1a over the full physical and race state; equal hashes mean identical runs. */
    hash() {
      let h = 0x811c9dc5 ^ this.tick;
      for (const c of this.cars) {
        h = hashFloat(h, c.x); h = hashFloat(h, c.y); h = hashFloat(h, c.angle);
        h = hashFloat(h, c.vx); h = hashFloat(h, c.vy); h = hashFloat(h, c.av); h = hashFloat(h, c.steer);
        h = hashFloat(h, c.gatesPassed); h = hashFloat(h, c.lapsDone); h = hashFloat(h, c.finishTime);
        h = hashFloat(h, c.driver.offset); h = hashFloat(h, c.driver.idx);
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    }
  }

  Racer.World = World;
  Racer.INPUT = INPUT;
  Racer.TPS = TPS;
  Racer.DT = DT;
  Racer.WORLD_DEFAULTS = DEFAULTS;
  Racer.gateCrossing = gateCrossing;
})(globalThis.Racer = globalThis.Racer || {});
