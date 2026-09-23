/*
 * Application shell: fixed-timestep game loop, input recording / replay, key commands.
 *
 * Loop: real frame time goes into an accumulator and the simulation advances in exact
 * DT = 1/120 s ticks. The renderer interpolates between the last two ticks with
 * alpha = accumulator / DT. Frame time is clamped, and the number of ticks per frame is
 * capped, so a stalled tab can't cause a "spiral of death".
 *
 * Replay: every tick's input bitmask is recorded, along with a state hash every 60 ticks.
 * Replaying re-simulates from the same seed with the recorded inputs, and the hashes are
 * compared as it goes, which verifies determinism live.
 */
(function (Racer) {
  'use strict';

  const DT = Racer.DT;
  const MAX_FRAME_TIME = 0.25; // seconds
  const MAX_STEPS_PER_FRAME = 30; // at 1x speed (0.25 s of simulation)
  const HASH_EVERY = 60; // ticks between recorded state hashes
  const FAST_FORWARD = 4;

  function readParams() {
    const q = new URLSearchParams(location.search);
    const config = {};
    if (q.has('seed')) config.seed = Racer.parseSeed(q.get('seed'));
    if (q.has('track')) config.track = Racer.TRACK_IDS.includes(q.get('track')) ? q.get('track') : 'classic';
    if (q.has('laps')) config.laps = Number(q.get('laps'));
    if (q.has('autopilot')) config.autopilot = q.get('autopilot') !== '0';
    const warp = Math.max(0, Math.min(600, Number(q.get('warp')) || 0)); // seconds to fast-forward on load
    const flag = (name) => q.has(name) && q.get(name) !== '0';
    return { config, debug: flag('debug'), paused: flag('paused'), warp };
  }

  class Recording {
    constructor(config) {
      this.config = config;
      this.inputs = new Uint8Array(1 << 14);
      this.length = 0;
      this.hashes = [];
      this.finalHash = null;
    }

    push(bits) {
      if (this.length === this.inputs.length) {
        const grown = new Uint8Array(this.inputs.length * 2);
        grown.set(this.inputs);
        this.inputs = grown;
      }
      this.inputs[this.length++] = bits;
    }
  }

  class App {
    constructor(canvas) {
      const params = readParams();
      this.keyboard = new Racer.Keyboard(window);
      this.renderer = new Racer.Renderer(canvas);
      this.renderer.debug = params.debug;
      this.fps = 60;
      this.last = null;
      this.newRace(Object.assign({}, Racer.WORLD_DEFAULTS, params.config));
      if (params.warp > 0) {
        for (let i = Math.round(params.warp * Racer.TPS); i > 0; i--) this.stepOnce();
        this.renderer.skipTransitions(this.world);
      }
      this.paused = params.paused;
      // Losing focus mid-race (alt-tab) pauses instead of letting the car coast into a wall.
      window.addEventListener('blur', () => {
        if (!this.replay && this.world.phase !== 'finished' && !this.world.player.finished) this.paused = true;
      });
      requestAnimationFrame((t) => this.frame(t));
    }

    newRace(config) {
      this.world = new Racer.World(config);
      this.config = Object.assign({}, this.world.config);
      this.recording = new Recording(this.config);
      this.replay = null;
      this.acc = 0;
      this.paused = false;
      this.renderer.setWorld(this.world);
      this.syncUrl();
    }

    /** Re-simulates the current run (or restarts the replay being watched) from its input log. */
    startReplay() {
      let rec = this.replay ? this.replay.rec : this.recording;
      if (!this.replay) {
        if (rec.length === 0) return;
        rec.finalHash = this.world.hash();
      }
      this.world = new Racer.World(rec.config);
      this.replay = { rec, length: rec.length, done: false, match: false, hash: rec.finalHash, mismatchTick: -1 };
      this.acc = 0;
      this.paused = false;
      this.renderer.setWorld(this.world);
    }

    stepOnce() {
      const w = this.world, rp = this.replay;
      let bits;
      if (rp) {
        if (w.tick >= rp.length) {
          rp.done = true;
          rp.match = rp.mismatchTick < 0 && w.hash() === rp.hash;
          if (!rp.match && rp.mismatchTick < 0) rp.mismatchTick = w.tick;
          return false;
        }
        bits = rp.rec.inputs[w.tick];
      } else {
        bits = this.keyboard.bits();
        this.recording.push(bits);
      }
      w.step(bits);
      this.renderer.afterStep(w);
      if (w.tick % HASH_EVERY === 0) {
        const h = w.hash(), k = w.tick / HASH_EVERY;
        if (!rp) this.recording.hashes[k] = h;
        else if (rp.rec.hashes[k] !== undefined && rp.rec.hashes[k] !== h && rp.mismatchTick < 0) rp.mismatchTick = w.tick;
      }
      return true;
    }

    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      const dt = this.last === null ? 1 / 60 : Math.min(MAX_FRAME_TIME, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
      this.handleKeys();

      let steps = 0;
      const rp = this.replay;
      if (!this.paused && !(rp && rp.done)) {
        const canFastForward = rp || this.world.player.finished || this.world.config.autopilot;
        const speed = canFastForward && this.keyboard.isHeld('KeyF') ? FAST_FORWARD : 1;
        const maxSteps = MAX_STEPS_PER_FRAME * speed;
        this.acc += dt * speed;
        while (this.acc >= DT && steps < maxSteps) {
          if (!this.stepOnce()) break;
          this.acc -= DT;
          steps++;
        }
        if (steps >= maxSteps) this.acc = 0; // drop the backlog instead of spiralling
      }
      const alpha = Math.min(1, this.acc / DT);
      this.renderer.render(this.world, alpha, dt, { paused: this.paused, replay: this.replay, fps: this.fps, steps });
    }

    handleKeys() {
      for (const code of this.keyboard.takePresses()) {
        switch (code) {
          case 'Escape':
            this.paused = !this.paused;
            break;
          case 'KeyR':
            this.newRace(this.config);
            break;
          case 'KeyN':
            this.newRace(Object.assign({}, this.config, { seed: (this.config.seed + 1) >>> 0 }));
            break;
          case 'KeyT':
            this.newRace(Object.assign({}, this.config, { track: this.config.track === 'classic' ? 'procedural' : 'classic' }));
            break;
          case 'KeyP':
            this.startReplay();
            break;
          case 'F3':
          case 'Backquote':
            this.renderer.debug = !this.renderer.debug;
            break;
          default:
            break;
        }
      }
    }

    /** Keeps the URL in sync so a reload (or a shared link) reproduces the same race. */
    syncUrl() {
      try {
        const q = new URLSearchParams(location.search);
        q.set('seed', String(this.config.seed));
        q.set('track', this.config.track);
        if (this.config.laps !== Racer.WORLD_DEFAULTS.laps) q.set('laps', String(this.config.laps));
        else q.delete('laps');
        history.replaceState(null, '', '?' + q.toString());
      } catch (e) {
        // Some browsers refuse replaceState on file:// URLs; the game works without it.
      }
    }
  }

  function showError(err) {
    const el = document.getElementById('error');
    if (el) {
      el.hidden = false;
      el.textContent = 'Something went wrong: ' + ((err && err.stack) || err);
    }
    console.error(err);
  }

  try {
    window.app = new App(document.getElementById('game'));
  } catch (err) {
    showError(err);
  }
  window.addEventListener('error', (e) => showError(e.error || e.message));
})(globalThis.Racer = globalThis.Racer || {});
