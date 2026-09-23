/*
 * Keyboard input. Driving keys are sampled once per simulation tick as a bitmask (that bitmask
 * is also exactly what gets recorded for replays); other keys are edge-triggered presses.
 * Physical key codes (KeyW, ...) are used so WASD works on any keyboard layout.
 */
(function (Racer) {
  'use strict';
  const INPUT = Racer.INPUT;

  const DRIVE_BINDINGS = {
    ArrowUp: INPUT.UP, KeyW: INPUT.UP,
    ArrowDown: INPUT.DOWN, KeyS: INPUT.DOWN,
    ArrowLeft: INPUT.LEFT, KeyA: INPUT.LEFT,
    ArrowRight: INPUT.RIGHT, KeyD: INPUT.RIGHT,
    Space: INPUT.HANDBRAKE,
  };
  const SWALLOW = new Set(['F3', 'Tab']); // keep the browser from acting on these

  class Keyboard {
    constructor(target) {
      this.held = new Set();
      this.presses = [];
      target.addEventListener('keydown', (e) => {
        if (DRIVE_BINDINGS[e.code] !== undefined || SWALLOW.has(e.code)) e.preventDefault();
        if (!e.repeat) this.presses.push(e.code);
        this.held.add(e.code);
      });
      target.addEventListener('keyup', (e) => this.held.delete(e.code));
      // Releasing keys while the window is unfocused would otherwise leave them "stuck".
      window.addEventListener('blur', () => this.held.clear());
    }

    /** Driving input for this tick. */
    bits() {
      let b = 0;
      for (const code of this.held) b |= DRIVE_BINDINGS[code] || 0;
      return b;
    }

    isHeld(code) {
      return this.held.has(code);
    }

    /** Key codes pressed since the last call. */
    takePresses() {
      const p = this.presses;
      this.presses = [];
      return p;
    }
  }

  Racer.Keyboard = Keyboard;
})(globalThis.Racer = globalThis.Racer || {});
