/*
 * main.js — browser glue: keyboard input, the requestAnimationFrame loop and the
 * fixed-timestep driver. The simulation itself lives in race.js and knows nothing about
 * the browser.
 *
 * URL parameters:
 *   ?seed=<number|text>   deterministic seed (default CONFIG.DEFAULT_SEED)
 *   ?laps=<n>             race length
 *   ?auto=1               attract mode: the AI drives your car too
 *   ?skip=<seconds>       fast-forward the sim before the first frame (debugging / screenshots)
 *   ?debug=1              start with the AI / collider debug overlay on
 */
(function () {
  'use strict';
  const R = globalThis.Racer;
  const CFG = R.CONFIG;

  const params = new URLSearchParams(globalThis.location.search);
  const state = {
    seed: params.has('seed') ? R.parseSeed(params.get('seed')) : CFG.DEFAULT_SEED,
    laps: Math.max(1, Math.min(20, Number(params.get('laps')) || CFG.LAPS)),
    auto: params.get('auto') === '1',
    paused: false,
    help: true,
    debug: params.get('debug') === '1',
    fps: 60,
  };

  const canvas = document.getElementById('game');
  const renderer = new R.Renderer(canvas);
  const stepper = new R.FixedStepper(CFG.DT, CFG.MAX_FRAME);
  let race = null;

  // ------------------------------------------------------------------- input
  const down = new Set();
  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
  ]);

  function sampleInput() {
    const up = down.has('ArrowUp') || down.has('KeyW');
    const dn = down.has('ArrowDown') || down.has('KeyS');
    const lf = down.has('ArrowLeft') || down.has('KeyA');
    const rt = down.has('ArrowRight') || down.has('KeyD');
    return {
      throttle: up ? 1 : 0,
      brake: dn ? 1 : 0,
      steer: (rt ? 1 : 0) - (lf ? 1 : 0),
      handbrake: down.has('Space') ? 1 : 0,
    };
  }

  globalThis.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    switch (e.code) {
      case 'KeyR': newRace(state.seed); break;
      case 'KeyN': newRace(R.parseSeed(state.seed + 1)); break;
      case 'KeyP': case 'Escape': state.paused = !state.paused; break;
      case 'KeyV': state.debug = !state.debug; break;
      case 'KeyH': state.help = !state.help; break;
      default: break;
    }
  });
  globalThis.addEventListener('keyup', (e) => down.delete(e.code));
  globalThis.addEventListener('blur', () => down.clear()); // no stuck keys after alt-tab
  globalThis.addEventListener('resize', () => renderer.resize());

  // -------------------------------------------------------------------- race
  function newRace(seed) {
    state.seed = seed;
    race = new R.Race({ seed, laps: state.laps, autoPlayer: state.auto });
    stepper.reset();
    renderer.setRace(race);
    try {
      const u = new URL(globalThis.location.href);
      u.searchParams.set('seed', String(seed));
      globalThis.history.replaceState(null, '', u);
    } catch (e) {
      /* file:// in some browsers refuses replaceState; the seed is still shown in the HUD */
    }
  }

  // -------------------------------------------------------------------- loop
  let last = performance.now();
  let fpsAvg = 60;

  function frame(now) {
    const dtFrame = Math.min((now - last) / 1000, CFG.MAX_FRAME);
    last = now;
    if (dtFrame > 0) fpsAvg += (1 / dtFrame - fpsAvg) * 0.05;
    state.fps = fpsAvg;

    if (!state.paused) {
      // Whole number of fixed ticks per frame; the sim never sees the frame time.
      stepper.advance(dtFrame, () => race.step(sampleInput()));
    }
    renderer.draw(race, stepper.alpha, dtFrame, state);
    globalThis.requestAnimationFrame(frame);
  }

  newRace(state.seed);
  const skip = Number(params.get('skip')) || 0;
  for (let i = 0, n = Math.round(skip / CFG.DT); i < n; i++) race.step(sampleInput());

  // Handy for automated checks from the devtools console.
  globalThis.__racer = {
    get race() { return race; },
    renderer,
    state,
    newRace,
    /** Advance the simulation by `seconds` of fixed ticks without rendering. */
    fastForward(seconds, input) {
      for (let i = 0, n = Math.round(seconds / CFG.DT); i < n; i++) race.step(input || sampleInput());
    },
  };

  globalThis.requestAnimationFrame(frame);
})();
