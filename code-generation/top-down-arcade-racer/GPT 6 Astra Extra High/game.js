(function () {
  'use strict';
  const S = window.ApexSim;
  const $ = id => document.getElementById(id);
  const seedParam = new URLSearchParams(window.location.search).get('seed');
  const seed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : 2048;
  let race = S.createRace(seed);
  const renderer = new window.RaceRenderer($('race-canvas'), race);
  const heldKeys = new Set(), touch = new Set();
  const touchPointers = new Map();
  let lastFrame = null, finishShown = false, toastUntil = 0, toastText = '';
  let soundEnabled = false, audioContext = null, engineOscillator = null, engineGain = null;
  const formatTime = seconds => {
    if (seconds === null) return '--:--.---';
    const ms = Math.floor(Math.max(0, seconds) * 1000);
    return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  $('seed-label').textContent = String(seed);
  for (let i = 0; i < 14; i++) $('speed-bars').appendChild(document.createElement('i'));
  const speedBars = Array.from($('speed-bars').children);

  function readInput() {
    return {
      throttle: heldKeys.has('ArrowUp') || heldKeys.has('KeyW') || touch.has('throttle') ? 1 : 0,
      brake: heldKeys.has('ArrowDown') || heldKeys.has('KeyS') || touch.has('brake') ? 1 : 0,
      steer: Number(heldKeys.has('ArrowRight') || heldKeys.has('KeyD') || touch.has('right')) -
        Number(heldKeys.has('ArrowLeft') || heldKeys.has('KeyA') || touch.has('left')),
      handbrake: heldKeys.has('Space'),
    };
  }

  function clearInput() {
    heldKeys.clear(); touch.clear(); touchPointers.clear();
    document.querySelectorAll('.touch-controls button').forEach(button => button.classList.remove('pressed'));
  }

  function showCard(name) {
    $('overlay').classList.toggle('hidden', name === null);
    for (const id of ['start-card', 'pause-card', 'finish-card']) $(id).classList.toggle('hidden', name !== id);
  }

  function start() {
    S.startRace(race); showCard(null); clearInput();
    $('pause').disabled = false;
    const panel = document.querySelector('.race-panel');
    if (panel.getBoundingClientRect().bottom > window.innerHeight) {
      panel.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
    $('race-canvas').focus({ preventScroll: true });
  }

  function restart() {
    race = S.createRace(seed); renderer.reset(race);
    finishShown = false; toastUntil = 0; toastText = ''; lastFrame = null;
    stepper.reset(); clearInput();
    $('pause').textContent = 'Ⅱ'; $('pause').setAttribute('aria-label', 'Pause race');
    start(); updateHud();
  }

  function setPaused(paused) {
    if (race.phase === 'ready' || finishShown || race.phase === 'finished') return;
    race.paused = paused; clearInput(); stepper.reset(); lastFrame = null;
    $('pause').textContent = paused ? '▷' : 'Ⅱ';
    $('pause').setAttribute('aria-label', paused ? 'Resume race' : 'Pause race');
    showCard(paused ? 'pause-card' : null);
    if (paused) $('resume').focus({ preventScroll: true });
    else $('race-canvas').focus({ preventScroll: true });
    updateHud();
  }

  function toast(message, duration = 3) { toastText = message; toastUntil = race.time + duration; }

  const stepper = new S.FixedStepper(() => {
    const previousTick = race.ticks;
    S.stepRace(race, readInput());
    if (previousTick !== race.ticks) renderer.tick(race);
    for (const event of race.events) {
      if (event.type === 'lap' && event.carId === 0 && event.lap < race.totalLaps) {
        toast(`${event.lap === 2 ? 'FINAL LAP' : 'LAP ' + event.lap + ' COMPLETE'}  /  ${formatTime(event.time)}`);
      }
      if (event.type === 'finish' && event.carId === 0) {
        finishShown = true; clearInput(); showCard('finish-card');
        $('pause').disabled = true;
        $('race-again').focus({ preventScroll: true });
      }
    }
  });

  function updateHud() {
    const player = race.cars[0], order = S.standings(race);
    const position = order.findIndex(car => car.id === 0) + 1;
    const speed = Math.hypot(player.vx, player.vy);
    const lap = Math.min(player.lapsCompleted + 1, race.totalLaps);
    $('position').textContent = String(position);
    $('position-note').textContent = player.finished ? 'FINISHED' : race.phase === 'ready' || race.phase === 'countdown' ? 'ON THE GRID' : position === 1 ? 'LEADING' : 'KEEP PUSHING';
    $('lap').textContent = String(lap).padStart(2, '0');
    document.querySelectorAll('.lap-pips i').forEach((pip, i) => pip.classList.toggle('active', i < lap));
    $('race-time').textContent = formatTime(player.finished ? player.finishTime : race.time);
    $('best-lap').textContent = formatTime(player.bestLap);
    $('best-lap').classList.toggle('muted', player.bestLap === null);
    $('speed').textContent = String(Math.round(speed * .72));
    speedBars.forEach((bar, i) => bar.classList.toggle('on', i < speed / 355 * speedBars.length));
    const forward = player.vx * Math.cos(player.angle) + player.vy * Math.sin(player.angle);
    $('gear').textContent = speed < 3 ? 'N' : forward < -3 ? 'R' : String(Math.min(6, 1 + Math.floor(speed / 65)));
    $('surface').textContent = race.paused ? 'RACE PAUSED' : race.phase === 'ready' ? 'READY TO RACE' : player.finished ? 'CHECKERED FLAG' : player.offroad ? 'OFF THE LINE' : player.control.handbrake ? 'HANDBRAKE' : 'ON THE TARMAC';
    const standingsKey = order.map(car => `${car.id}:${car.finished}:${Math.floor(car.progress / 5)}`).join('|');
    if ($('standings').dataset.state !== standingsKey) {
      $('standings').dataset.state = standingsKey;
      $('standings').replaceChildren(...order.map((car, i) => {
        const row = document.createElement('li');
        if (car.id === 0) row.className = 'player';
        const gap = car.finished ? 'FIN' : i === 0 ? 'LEADER' : `−${Math.max(0, Math.round((order[0].progress - car.progress) * .2))} m`;
        // All values are internal constants or formatted simulation numbers.
        row.innerHTML = `<span class="driver-rank">${i + 1}</span><span class="driver-color" style="background:${car.color}"></span><span class="driver-name">${car.name}</span><span class="driver-gap">${gap}</span>`;
        return row;
      }));
    }
    $('countdown').textContent = race.paused ? '' : race.phase === 'countdown' ? String(Math.ceil(race.countdownTicks / 120)) : race.phase === 'racing' && race.time < .7 ? 'GO' : '';
    const wrongWay = player.wrongWayTicks > 100 && !player.finished;
    $('toast').textContent = wrongWay ? 'WRONG WAY  /  TURN AROUND' : toastText;
    $('toast').classList.toggle('show', !race.paused && (wrongWay || race.time < toastUntil));
    if (finishShown) {
      const suffix = ['', 'st', 'nd', 'rd', 'th'][player.finishPlace];
      $('finish-title').innerHTML = player.finishPlace === 1 ? 'That’s a win<span>.</span>' : 'Race complete<span>.</span>';
      $('finish-summary').textContent = `${player.finishPlace}${suffix} place · ${formatTime(player.finishTime)} · Best lap ${formatTime(player.bestLap)}`;
      $('finish-results').innerHTML = order.map((car, i) => `<div class="result-row ${car.id === 0 ? 'you' : ''}"><span>${String(i + 1).padStart(2, '0')} &nbsp; ${car.name}</span><span>${car.finished ? formatTime(car.finishTime) : 'LAP ' + Math.min(3, car.lapsCompleted + 1)}</span></div>`).join('');
    }
  }

  function updateAudio() {
    if (!audioContext || !engineOscillator) return;
    const active = soundEnabled && race.phase === 'racing' && !race.paused && !finishShown;
    const speed = Math.hypot(race.cars[0].vx, race.cars[0].vy);
    engineOscillator.frequency.setTargetAtTime(40 + speed * .48, audioContext.currentTime, .08);
    engineGain.gain.setTargetAtTime(active ? .017 + speed / 355 * .024 : 0, audioContext.currentTime, .08);
  }

  async function toggleSound() {
    soundEnabled = !soundEnabled;
    try {
      if (soundEnabled && !audioContext) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) throw new Error('Audio unavailable');
        audioContext = new AudioCtor(); engineOscillator = audioContext.createOscillator();
        engineGain = audioContext.createGain(); engineGain.gain.value = 0;
        engineOscillator.type = 'sawtooth';
        const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 550;
        engineOscillator.connect(filter); filter.connect(engineGain); engineGain.connect(audioContext.destination); engineOscillator.start();
      }
      if (soundEnabled) await audioContext.resume();
    } catch (_) { soundEnabled = false; toast('AUDIO IS UNAVAILABLE IN THIS BROWSER'); }
    $('sound').textContent = soundEnabled ? 'SOUND ON' : 'SOUND OFF';
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    updateAudio();
  }

  const driveKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (driveKeys.has(event.code) && !race.paused && !finishShown && race.phase !== 'ready') {
      event.preventDefault(); heldKeys.add(event.code);
    }
    if (event.repeat) return;
    if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); setPaused(!race.paused); }
    if (event.code === 'KeyR') { event.preventDefault(); restart(); }
    if (event.code === 'Enter' && race.phase === 'ready') { event.preventDefault(); start(); }
  });
  window.addEventListener('keyup', event => { heldKeys.delete(event.code); });
  window.addEventListener('blur', () => { clearInput(); setPaused(true); updateAudio(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); setPaused(true); updateAudio(); } });
  $('start').addEventListener('click', start);
  $('pause').addEventListener('click', () => setPaused(!race.paused));
  $('resume').addEventListener('click', () => setPaused(false));
  $('restart').addEventListener('click', restart);
  $('race-again').addEventListener('click', restart);
  $('sound').addEventListener('click', toggleSound);
  for (const button of document.querySelectorAll('[data-control]')) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      touchPointers.set(event.pointerId, button.dataset.control);
      touch.add(button.dataset.control); button.classList.add('pressed');
    });
    const release = event => {
      touchPointers.delete(event.pointerId);
      if (![...touchPointers.values()].includes(button.dataset.control)) {
        touch.delete(button.dataset.control); button.classList.remove('pressed');
      }
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }

  let hudElapsed = 0;
  function frame(timestamp) {
    const elapsed = lastFrame === null ? 0 : (timestamp - lastFrame) / 1000;
    lastFrame = timestamp;
    const { alpha } = stepper.advance(elapsed);
    renderer.render(race, race.paused || race.phase === 'ready' || race.phase === 'finished' ? 1 : alpha);
    hudElapsed += elapsed;
    if (hudElapsed > 1 / 30) { updateHud(); updateAudio(); hudElapsed = 0; }
    requestAnimationFrame(frame);
  }
  // Small inspection surface for replays, tuning, and automated verification.
  window.apex = { get race() { return race; }, restart, setPaused, formatTime };
  updateHud(); requestAnimationFrame(frame);
})();
