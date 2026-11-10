/*
 * main.js — game shell: keyboard input, fixed-timestep loop, screens, replay.
 *
 * The simulation only ever advances in whole 1/120 s ticks. Each tick consumes
 * one byte of player input, which is also appended to a log; replaying that
 * log against the same seed reproduces the race bit-for-bit (press V on the
 * results screen — the state hash is compared against the live run).
 *
 * URL parameters: ?seed=123  ?laps=5  ?auto=1 (AI drives your car)
 *                 ?start=1 (skip title)  ?ff=N (pre-simulate N ticks)  ?debug=1  ?cam=chase
 */
(function () {
  'use strict';

  const S = window.RacerSim, R = window.RacerRender;
  const { DT, TICK_RATE, IN_UP, IN_DOWN, IN_LEFT, IN_RIGHT } = S;

  const params = new URLSearchParams(window.location.search);
  let seed = params.has('seed') ? (parseInt(params.get('seed'), 10) || 0) >>> 0 : S.DEFAULT_SEED;
  const laps = S.clamp(parseInt(params.get('laps'), 10) || S.DEFAULT_LAPS, 1, 99);
  const autopilot = params.get('auto') === '1';

  const canvas = document.getElementById('game');
  const renderer = new R.Renderer(canvas, seed);
  if (params.get('debug') === '1') renderer.debug = true;
  if (params.get('cam') === 'chase') renderer.toggleCamera();

  // ───────────────────────────── state ─────────────────────────────

  let screen = 'title';                 // 'title' (attract mode) | 'race'
  let race = null;
  let paused = false;
  let replay = false, replaySpeed = 1;
  let inputLog = new Uint8Array(TICK_RATE * 300), logLen = 0;   // one byte per tick
  let ref = null;                       // { tick, hash, len } of the live run, for replay verification
  let verify = null;                    // null = not checked yet, true/false = replay matched?

  function startDemo() {
    screen = 'title'; paused = false; replay = false; verify = null; ref = null;
    race = new S.Race({ seed, laps, autopilot: true });
    renderer.reset(race, true);
  }

  function startRace(flyIn) {
    screen = 'race'; paused = false; replay = false; replaySpeed = 1; verify = null; ref = null;
    logLen = 0;
    race = new S.Race({ seed, laps, autopilot });
    renderer.reset(race, flyIn);        // flyIn: camera starts at the overview and swoops to the grid
  }

  function startReplay() {
    if (!ref) ref = { tick: race.tick, hash: race.hash(), len: logLen };
    replay = true; replaySpeed = 1; verify = null; paused = false;
    race = new S.Race({ seed, laps, autopilot });
    renderer.reset(race, false);
  }

  // ───────────────────────────── input ─────────────────────────────

  const KEYMAP = {
    ArrowUp: IN_UP, KeyW: IN_UP, ArrowDown: IN_DOWN, KeyS: IN_DOWN,
    ArrowLeft: IN_LEFT, KeyA: IN_LEFT, ArrowRight: IN_RIGHT, KeyD: IN_RIGHT,
  };
  const held = new Set();

  function readInput() {
    let bits = 0;
    for (const code of held) bits |= KEYMAP[code];
    return bits;
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (KEYMAP[code]) { held.add(code); e.preventDefault(); return; }
    if (code === 'Space' || code === 'Enter') e.preventDefault();
    if (e.repeat) return;
    switch (code) {
      case 'Enter': case 'Space':
        if (screen === 'title') startRace(true);
        break;
      case 'KeyR':
        if (screen === 'race') startRace(false);
        break;
      case 'KeyP': case 'Escape':
        if (screen === 'race') paused = !paused;
        break;
      case 'KeyC': renderer.toggleCamera(); break;
      case 'KeyH': renderer.debug = !renderer.debug; break;
      case 'KeyV':
        if (screen === 'race' && race.player.finished) {
          if (!replay) startReplay();
          else replaySpeed = replaySpeed >= 8 ? 1 : replaySpeed * 2;
        }
        break;
      case 'KeyN':
        seed = (seed + 1) >>> 0;
        renderer.setSeed(seed);
        if (screen === 'title') startDemo(); else startRace(false);
        break;
    }
  });
  window.addEventListener('keyup', (e) => { held.delete(e.code); });
  window.addEventListener('blur', () => { held.clear(); });
  canvas.addEventListener('pointerdown', () => { if (screen === 'title') startRace(true); });
  window.addEventListener('resize', () => renderer.resize());

  // ───────────────────────────── fixed-timestep loop ─────────────────────────────

  function step() {
    let bits = 0;
    if (screen === 'race') {
      if (replay) bits = race.tick < ref.len ? inputLog[race.tick] : 0;
      else {
        bits = readInput();
        if (logLen === inputLog.length) {
          const grown = new Uint8Array(inputLog.length * 2);
          grown.set(inputLog);
          inputLog = grown;
        }
        inputLog[logLen++] = bits;
      }
    }
    race.step(bits);
    renderer.tick(race, screen === 'title');
    if (replay && verify === null && race.tick === ref.tick) verify = race.hash() === ref.hash;
    // attract mode: start a fresh demo a while after everyone has finished
    if (screen === 'title' && race.over && race.time > race.order[race.order.length - 1].finishTime + 8) startDemo();
  }

  let last = performance.now(), acc = 0, fps = 60, steps = 0;
  const ui = {
    screen, paused, replay, replaySpeed, verify, results: false,
    refHash: '', refTick: 0, hash: '', fps: 60, steps: 0, seed, now: 0,
  };

  function frame(now) {
    window.requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0) fps += (1 / elapsed - fps) * 0.05;
    if (elapsed > 0.1) elapsed = 0.1;          // long frame / hidden tab: drop time instead of spiralling
    steps = 0;
    if (!paused) {
      acc += elapsed * (replay ? replaySpeed : 1);
      while (acc >= DT) { step(); acc -= DT; steps++; }
    }

    const p = race.player;
    ui.screen = screen; ui.paused = paused; ui.replay = replay; ui.replaySpeed = replaySpeed; ui.verify = verify;
    ui.results = screen === 'race' && p.finished && race.time - p.finishTime > 2.6;
    ui.refHash = ref ? ref.hash.toString(16).padStart(8, '0') : ''; ui.refTick = ref ? ref.tick : 0;
    ui.hash = (ui.results || renderer.debug) ? race.hash().toString(16).padStart(8, '0') : '';
    ui.fps = Math.round(fps); ui.steps = steps; ui.seed = seed; ui.now = now;
    renderer.draw(race, acc / DT, ui);         // interpolate between the last two ticks
  }

  startDemo();
  if (params.get('start') === '1') startRace(false);
  const ff = parseInt(params.get('ff'), 10) || 0;
  for (let i = 0; i < ff; i++) step();

  // handy in the console: tarmac.race.hash(), tarmac.race.cars, …
  window.tarmac = {
    get race() { return race; }, renderer, sim: S,
    get state() { return { screen, paused, replay, replaySpeed, verify, seed, logLen }; },
  };

  window.requestAnimationFrame(frame);
})();
