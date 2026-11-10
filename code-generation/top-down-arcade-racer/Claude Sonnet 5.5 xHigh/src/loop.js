/*
 * loop.js — fixed-timestep accumulator ("Fix Your Timestep").
 *
 * Real frame times are noisy and vary with the display refresh rate; the simulation must
 * not. The stepper turns "N seconds of wall-clock time passed" into a whole number of
 * fixed-size sim ticks and keeps the remainder in `acc`, which the renderer uses as an
 * interpolation factor (alpha) between the previous and current physics state.
 *
 * Because sim state only ever advances in exact DT increments, two runs with the same
 * seed and input produce identical results regardless of frame rate.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});

  class FixedStepper {
    constructor(dt, maxFrame) {
      this.dt = dt;
      this.maxFrame = maxFrame; // spiral-of-death guard: never try to catch up more than this
      this.acc = 0;
    }

    /**
     * @param {number} frameSeconds  real time since the previous frame
     * @param {() => void} stepFn    advances the simulation by exactly `dt`
     * @returns {number} how many ticks ran
     */
    advance(frameSeconds, stepFn) {
      this.acc += Math.min(Math.max(frameSeconds, 0), this.maxFrame);
      let n = 0;
      while (this.acc >= this.dt) {
        stepFn();
        this.acc -= this.dt;
        n++;
      }
      return n;
    }

    /** 0..1: how far we are between the last two sim states (for render interpolation). */
    get alpha() {
      return this.acc / this.dt;
    }

    reset() {
      this.acc = 0;
    }
  }

  R.FixedStepper = FixedStepper;
})();
