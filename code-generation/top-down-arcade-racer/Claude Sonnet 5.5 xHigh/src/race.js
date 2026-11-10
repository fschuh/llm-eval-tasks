/*
 * race.js — the deterministic simulation: grid, countdown, per-tick pipeline, lap
 * detection and standings. No DOM and no wall-clock time in here; the only inputs are the
 * seed and one input object per tick, which is what makes replays/tests exact.
 *
 * One tick (dt = CONFIG.DT):
 *   1. controls    player input, or the AIDriver for AI cars / the player after the flag
 *   2. dynamics    Car.step for every car
 *   3. collisions  `passes` x ( car-vs-barrier, car-vs-car ) with impulse resolution
 *   4. progress    closest centreline point, unrolled lap distance, gate crossings
 *   5. standings   finished cars by finish time, the rest by distance covered
 *
 * Lap detection: the circuit has GATES full-width checkpoint lines; gate 0 is the
 * start/finish line. A car must cross them in order (cp counts crossings); crossing a gate
 * backwards un-counts it, so reversing over the line can't be farmed. A lap completes when
 * gate 0 is crossed with cp = k * GATES + 1. Crossing times are interpolated inside the
 * tick, so lap times are exact to well below a millisecond.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});
  const CFG = R.CONFIG;
  const { RNG, Track, Car, AIDriver, Collision, buildRacingLine, parseSeed } = R;

  const NAMES = ['VEGA', 'NOVA', 'REX', 'JUNO', 'KATO', 'MIRA', 'ORION', 'ZED', 'LYRA', 'BOLT'];
  const AI_COLORS = ['#3aa0ff', '#ffb52e', '#a66bff'];
  const PLAYER_COLOR = '#ef3b47';
  const BUCKET = 50; // px of progress per timing bucket (for time gaps)
  const BUCKET_BASE = 8; // grid slots sit at negative progress; shift so indices stay >= 0

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  class Race {
    /**
     * @param {object} [opts]
     * @param {number|string} [opts.seed]
     * @param {number} [opts.laps]
     * @param {number} [opts.numAI]
     * @param {boolean} [opts.autoPlayer]  let the AI drive the player's car (demo / tests)
     */
    constructor(opts) {
      opts = opts || {};
      this.seed = parseSeed(opts.seed !== undefined ? opts.seed : CFG.DEFAULT_SEED);
      this.laps = opts.laps || CFG.LAPS;
      this.autoPlayer = !!opts.autoPlayer;
      this.numAI = opts.numAI !== undefined ? opts.numAI : CFG.NUM_AI;

      const root = new RNG(this.seed);
      const aiRng = root.fork('ai');
      const gridRng = root.fork('grid');

      this.track = Track.generate(this.seed);
      this.racingLine = buildRacingLine(this.track);

      this.tick = 0;
      this.startTick = Math.round(CFG.COUNTDOWN / CFG.DT);
      this.phase = 'countdown'; // 'countdown' -> 'racing'
      this.events = [];
      this.stats = { carHits: 0, wallHits: 0 };
      this.finishedCount = 0;
      this._frac = { frac: 0 };
      this._hit = { x: 0, y: 0 };
      this._q = { i: 0, t: 0, cx: 0, cy: 0, dist: 0, d: 0, s: 0 };

      // ---- cars ----
      this.cars = [];
      this.drivers = [];
      const names = aiRng.shuffle(NAMES);
      this.player = new Car(0, { name: 'YOU', color: PLAYER_COLOR, isPlayer: true });
      this.cars.push(this.player);
      this.drivers.push(new AIDriver(this.player, this, { skill: 0.97, bias: 0 }));
      for (let k = 0; k < this.numAI; k++) {
        const car = new Car(k + 1, { name: names[k % names.length], color: AI_COLORS[k % AI_COLORS.length] });
        this.cars.push(car);
        const skill = aiRng.range(CFG.AI.skill[0], CFG.AI.skill[1]);
        const bias = aiRng.range(-CFG.AI.bias, CFG.AI.bias);
        this.drivers.push(new AIDriver(car, this, { skill, bias }));
      }

      // ---- staggered grid behind the line, order drawn from the seeded RNG ----
      const slots = gridRng.shuffle(this.cars.map((c) => c.id));
      const G = CFG.GRID;
      const pt = {};
      slots.forEach((id, slot) => {
        const car = this.cars[id];
        const s = -(G.first + slot * G.spacing);
        const lat = (slot % 2 === 0 ? -1 : 1) * G.lateral;
        this.track.pointAt(s, lat, pt);
        car.place(pt.x, pt.y, pt.angle);
        this.track.locate(car.x, car.y, this._q);
        car.hint = this._q.i;
        car.s = car.sPrev = this._q.s;
        car.d = this._q.d;
        car.progress = s;
        car.gridSlot = slot;
        car.bucketTimes = [];
        car.bucketMax = -1;
      });

      this.order = this.cars.slice();
      this._updateOrder();
    }

    // ------------------------------------------------------------------ clocks

    raceTime() {
      return this.tick > this.startTick ? (this.tick - this.startTick) * CFG.DT : 0;
    }

    countdownLeft() {
      return this.phase === 'countdown' ? (this.startTick - this.tick) * CFG.DT : 0;
    }

    /** True once every car has taken the chequered flag. */
    get allFinished() {
      return this.finishedCount >= this.cars.length;
    }

    // -------------------------------------------------------------------- step

    /**
     * Advance exactly one fixed tick.
     * @param {{throttle:number, brake:number, steer:number, handbrake:number}} [playerInput]
     */
    step(playerInput) {
      const dt = CFG.DT;
      if (this.phase === 'countdown') {
        this.tick++;
        for (const car of this.cars) car.savePrev();
        if (this.tick >= this.startTick) {
          this.phase = 'racing';
          this._emit({ type: 'go' });
        }
        return;
      }

      const k = this.tick - this.startTick; // tick index since the lights went out

      // 1 + 2: controls and dynamics
      for (let c = 0; c < this.cars.length; c++) {
        const car = this.cars[c];
        if (car.isPlayer && !this.autoPlayer && !car.finished) {
          const inp = car.input;
          const src = playerInput || {};
          inp.throttle = src.throttle || 0;
          inp.brake = src.brake || 0;
          inp.steer = src.steer || 0;
          inp.handbrake = src.handbrake || 0;
        } else {
          this.drivers[c].update(dt);
        }
        car.savePrev();
        car.step(dt);
      }

      // 3: collisions
      const passes = CFG.COLLISION.passes;
      for (let p = 0; p < passes; p++) {
        for (let c = 0; c < this.cars.length; c++) {
          const car = this.cars[c];
          const j = Collision.solveCarWall(car, this.track, this._hit);
          if (j > 0 && p === 0) this._onImpact('wall', car, null, j, this._hit);
        }
        for (let a = 0; a < this.cars.length; a++) {
          for (let b = a + 1; b < this.cars.length; b++) {
            const j = Collision.solveCarCar(this.cars[a], this.cars[b], this._hit);
            if (j > 0 && p === 0) this._onImpact('car', this.cars[a], this.cars[b], j, this._hit);
          }
        }
      }

      // 4: progress / laps
      for (const car of this.cars) {
        car.refreshVelocityFrame();
        this._updateProgress(car, k);
      }

      // 5: standings
      this.tick++;
      this._updateOrder();
    }

    // ----------------------------------------------------------------- internals

    _emit(ev) {
      this.events.push(ev);
      if (this.events.length > 256) this.events.shift();
    }

    _onImpact(kind, a, b, impulse, at) {
      const strength = impulse * a.invMass; // delta-v on car A (px/s)
      if (strength < 45) return; // ignore scrapes / resting contact
      if (kind === 'wall') {
        this.stats.wallHits++;
        a.stats.wallHits++;
      } else {
        this.stats.carHits++;
        a.stats.carHits++;
        b.stats.carHits++;
      }
      this._emit({ type: 'hit', kind, x: at.x, y: at.y, strength, a: a.id, b: b ? b.id : -1 });
    }

    _updateProgress(car, k) {
      const track = this.track;
      const q = this._q;
      track.nearest(car.x, car.y, car.hint, 12, q);
      if (q.dist > track.wallHalf * 3) track.locate(car.x, car.y, q); // lost: global search
      car.hint = q.i;
      car.d = q.d;

      const L = track.length;
      let ds = q.s - car.sPrev;
      if (ds > L / 2) ds -= L;
      else if (ds < -L / 2) ds += L;
      car.progress += ds;
      car.sPrev = q.s;
      car.s = q.s;

      const along = Math.cos(car.angle) * track.tx[q.i] + Math.sin(car.angle) * track.ty[q.i];
      car.wrongWay = along < -0.3 && car.vF > 40;

      // time-gap buckets (the time at which this car first reached each 50 px of progress)
      const b = Math.floor(car.progress / BUCKET) + BUCKET_BASE;
      const tEnd = (k + 1) * CFG.DT;
      while (car.bucketMax < b) {
        car.bucketMax++;
        car.bucketTimes[car.bucketMax] = tEnd;
      }

      if (!car.finished) this._updateGates(car, k);
    }

    _updateGates(car, k) {
      const track = this.track;
      const G = track.gates.length;
      const r = this._frac;

      const fwd = track.gates[car.cp % G];
      if (track.gateCrossing(fwd, car.prevX, car.prevY, car.x, car.y, r) === 1) {
        const t = (k + r.frac) * CFG.DT;
        car.cp++;
        car.gateTimes[car.cp] = t;
        if (fwd.index === 0 && car.cp > 1) this._completeLap(car, t);
        return;
      }
      if (car.cp > 0) {
        const back = track.gates[(car.cp - 1) % G];
        if (track.gateCrossing(back, car.prevX, car.prevY, car.x, car.y, r) === -1) {
          if (back.index === 0 && car.cp > 1) {
            // reversed back over the line after finishing a lap: take that lap back
            car.lapsDone--;
            car.lapTimes.pop();
            car.lapStarts.pop();
            car.bestLap = car.lapTimes.length ? Math.min(...car.lapTimes) : Infinity;
          }
          car.cp--;
        }
      }
    }

    _completeLap(car, t) {
      const lapTime = t - car.lapStarts[car.lapsDone];
      car.lapTimes.push(lapTime);
      car.lapStarts.push(t);
      car.lapsDone++;
      if (lapTime < car.bestLap) car.bestLap = lapTime;
      this._emit({ type: 'lap', car: car.id, lap: car.lapsDone, time: lapTime });
      if (car.lapsDone >= this.laps) {
        car.finished = true;
        car.finishTime = t;
        car.finishOrder = ++this.finishedCount;
        this._emit({ type: 'finish', car: car.id, time: t, place: car.finishOrder });
      }
    }

    _updateOrder() {
      this.order.sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.finishTime - b.finishTime || a.id - b.id;
        return b.progress - a.progress || a.id - b.id;
      });
      for (let i = 0; i < this.order.length; i++) this.order[i].position = i + 1;
    }

    // ------------------------------------------------------------------ queries

    /** Mild rubber-banding: AI cars speed up when behind the human and ease off when far ahead. */
    rubberFactor(car) {
      const r = CFG.AI.rubber;
      const h = this.player;
      if (!r || car === h || h.finished || this.autoPlayer) return 1;
      return 1 + r * clamp((h.progress - car.progress) / 1200, -1, 1);
    }

    /**
     * Time gap (s) between `car` and `ref` at the point on track `car` has most recently
     * reached: positive = car reached it later than ref did. null if ref hasn't been there.
     */
    gap(car, ref) {
      const b = car.bucketMax;
      if (b < BUCKET_BASE || ref.bucketMax < b) return null;
      return car.bucketTimes[b] - ref.bucketTimes[b];
    }

    /** Current lap (1-based, capped at the race length) for display. */
    lapOf(car) {
      return Math.min(this.laps, car.lapsDone + 1);
    }

    currentLapTime(car) {
      if (car.finished) return car.lapTimes[car.lapTimes.length - 1] || 0;
      return Math.max(0, this.raceTime() - car.lapStarts[car.lapsDone]);
    }

    /** FNV-1a over the full dynamic state; equal hashes = bit-identical simulations. */
    stateHash() {
      const f = new Float64Array(1);
      const u = new Uint32Array(f.buffer);
      let h = 0x811c9dc5;
      const mix = (v) => {
        f[0] = v;
        h = Math.imul(h ^ u[0], 0x01000193);
        h = Math.imul(h ^ u[1], 0x01000193);
      };
      mix(this.tick);
      for (const c of this.cars) {
        mix(c.x);
        mix(c.y);
        mix(c.angle);
        mix(c.vx);
        mix(c.vy);
        mix(c.omega);
        mix(c.steerTan);
        mix(c.progress);
        mix(c.cp);
      }
      return h >>> 0;
    }
  }

  R.Race = Race;
})();
