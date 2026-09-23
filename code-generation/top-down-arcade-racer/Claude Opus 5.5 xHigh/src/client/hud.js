/*
 * Heads-up display, drawn in screen space (CSS pixels): lap / time panel, position and
 * standings with timing gaps, speedometer, minimap, start lights, messages and overlays
 * (results, pause, replay).
 */
(function (Racer) {
  'use strict';

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  const PANEL = 'rgba(12,16,22,0.72)';
  const DIM = 'rgba(255,255,255,0.55)';

  function fmtTime(ticks) {
    if (!Number.isFinite(ticks)) return '-:--.---';
    const ms = Math.max(0, Math.round((ticks * 1000) / Racer.TPS));
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, r = ms % 1000;
    return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
  }

  function fmtGap(ticks) {
    return '+' + (Math.max(0, ticks) / Racer.TPS).toFixed(3);
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = PANEL;
    Racer.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
  }

  function text(ctx, str, x, y, font, color, align = 'left', baseline = 'alphabetic') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
  }

  class Hud {
    constructor() {
      this.reset();
    }

    reset() {
      this.messages = [];
      this.time = 0;
      this.finishedAt = -1;
    }

    flash(str, color, duration, size = 36) {
      this.messages.push({ str, color, t: duration, duration, size });
    }

    afterStep(world) {
      const p = world.player, laps = world.config.laps;
      for (const e of world.events) {
        if (e.type === 'go') this.flash('GO!', '#5dff8f', 1.0, 64);
        if (e.car !== p.id) continue;
        if (e.type === 'lap' && !e.final) {
          this.flash(e.lap + 1 === laps ? 'FINAL LAP' : `LAP ${e.lap + 1}/${laps}`, '#ffffff', 1.8);
          if (e.best && e.lap > 1) this.flash(`NEW BEST  ${fmtTime(e.ticks)}`, '#d7a6ff', 2.2, 24);
        }
        if (e.type === 'finish') {
          this.flash(`FINISHED ${ordinal(e.position)}`, '#ffd24d', 2.5, 56);
          this.finishedAt = this.time;
        }
      }
    }

    /** Advances the HUD clock without rendering (used after fast-forwarding the simulation). */
    skip(seconds) {
      this.update(seconds);
    }

    update(dt) {
      this.time += dt;
      for (const m of this.messages) m.t -= dt;
      this.messages = this.messages.filter((m) => m.t > 0);
    }

    buildMinimap(track, dpr) {
      const b = track.bounds, maxW = 210, maxH = 150, pad = 10;
      const tw = b.maxX - b.minX, th = b.maxY - b.minY;
      const scale = Math.min((maxW - 2 * pad) / tw, (maxH - 2 * pad) / th);
      const w = Math.ceil(tw * scale + 2 * pad), h = Math.ceil(th * scale + 2 * pad);
      const canvas = Racer.makeCanvas(w * dpr, h * dpr), g = canvas.getContext('2d');
      g.scale(dpr, dpr);
      panel(g, 0, 0, w, h);
      const ox = pad - b.minX * scale, oy = pad - b.minY * scale;
      g.translate(ox, oy);
      g.scale(scale, scale);
      const path = new Path2D();
      path.moveTo(track.cx[0], track.cy[0]);
      for (let i = 1; i < track.n; i++) path.lineTo(track.cx[i], track.cy[i]);
      path.closePath();
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = track.width + 6 / scale;
      g.stroke(path);
      g.strokeStyle = '#8f99a5';
      g.lineWidth = Math.max(track.width, 4 / scale);
      g.stroke(path);
      const g0 = track.gates[0];
      g.strokeStyle = '#fff';
      g.lineWidth = 2.5 / scale;
      g.beginPath();
      g.moveTo(g0.x - g0.nx * track.halfWidth * 1.4, g0.y - g0.ny * track.halfWidth * 1.4);
      g.lineTo(g0.x + g0.nx * track.halfWidth * 1.4, g0.y + g0.ny * track.halfWidth * 1.4);
      g.stroke();
      return { canvas, w, h, scale, ox, oy };
    }

    draw(ctx, r, world, ui) {
      const W = r.w, H = r.h, p = world.player;
      this._lapPanel(ctx, world, p);
      this._positionPanel(ctx, world, p, W);
      this._minimap(ctx, r, world, H);
      this._speedo(ctx, p, W, H);
      this._startLights(ctx, world, W);
      this._messages(ctx, W, H);
      if (p.wrongWay > 0.75 && !p.finished && !ui.replay && Math.floor(this.time * 3) % 2 === 0) {
        text(ctx, 'WRONG WAY', W / 2, H * 0.62, `800 40px ${FONT}`, '#ff4d4d', 'center');
      }
      const racingTime = (world.tick - world.startTick) / Racer.TPS;
      if (!ui.replay && racingTime < 8 && !ui.paused) this._help(ctx, W, H, racingTime);
      if (ui.replay) this._replayBanner(ctx, world, ui.replay, W);
      if (p.finished && this.finishedAt >= 0 && this.time - this.finishedAt > 1.2 && !ui.replay) this._results(ctx, world, W, H);
      if (ui.paused) this._pause(ctx, W, H);
      text(ctx, `seed ${world.seed} · ${world.track.name} · ${world.config.laps} laps · fixed ${Racer.TPS} Hz`,
        W / 2, H - 10, `500 11px ${FONT}`, 'rgba(255,255,255,0.45)', 'center');
      if (r.debug) this._debug(ctx, world, ui, W);
    }

    _lapPanel(ctx, world, p) {
      const x = 16, y = 16, w = 214, h = 132;
      panel(ctx, x, y, w, h);
      const laps = world.config.laps;
      text(ctx, 'LAP', x + 14, y + 26, `700 12px ${FONT}`, DIM);
      text(ctx, `${world.currentLap(p)}`, x + 14, y + 58, `800 34px ${FONT}`, '#fff');
      const lw = ctx.measureText(`${world.currentLap(p)}`).width;
      text(ctx, `/${laps}`, x + 18 + lw, y + 58, `700 18px ${FONT}`, DIM);
      const racing = world.phase !== 'countdown';
      const now = world.tick;
      const total = p.finished ? p.finishTime - world.startTick : world.raceTicks();
      const current = p.finished ? p.lastLap : racing ? now - p.lapStart : 0;
      const rows = [
        ['TIME', fmtTime(total), '#fff'],
        ['LAP', fmtTime(current), '#fff'],
        ['LAST', p.lapTimes.length ? fmtTime(p.lastLap) : '-:--.---', DIM],
        ['BEST', fmtTime(p.bestLap), Number.isFinite(p.bestLap) ? '#d7a6ff' : DIM],
      ];
      rows.forEach(([label, val, color], i) => {
        const ry = y + 26 + i * 25;
        text(ctx, label, x + 92, ry, `700 11px ${FONT}`, DIM);
        text(ctx, val, x + w - 14, ry, `600 15px ${MONO}`, color, 'right');
      });
    }

    _positionPanel(ctx, world, p, W) {
      const w = 212, x = W - 16 - w, y = 16, rowH = 22;
      const h = 70 + world.cars.length * rowH;
      panel(ctx, x, y, w, h);
      text(ctx, 'POSITION', x + 14, y + 24, `700 12px ${FONT}`, DIM);
      text(ctx, `${p.position}`, x + 14, y + 58, `800 38px ${FONT}`, '#fff');
      const pw = ctx.measureText(`${p.position}`).width;
      text(ctx, `/${world.cars.length}`, x + 18 + pw, y + 58, `700 18px ${FONT}`, DIM);
      world.standings.forEach((car, i) => {
        const ry = y + 76 + i * rowH;
        if (car.isPlayer) {
          ctx.fillStyle = 'rgba(47,155,255,0.22)';
          ctx.fillRect(x + 6, ry - 15, w - 12, rowH - 2);
        }
        text(ctx, `${i + 1}`, x + 14, ry, `700 13px ${FONT}`, DIM);
        ctx.fillStyle = car.color;
        ctx.fillRect(x + 30, ry - 11, 5, 13);
        text(ctx, car.name, x + 42, ry, `700 13px ${FONT}`, '#fff');
        let info;
        if (car.finished) info = fmtTime(car.finishTime - world.startTick);
        else if (i === 0) info = `LAP ${world.currentLap(car)}/${world.config.laps}`;
        else {
          const gap = world.gapToLeader(car);
          info = gap === null ? '—' : fmtGap(gap);
        }
        text(ctx, info, x + w - 14, ry, `600 12px ${MONO}`, car.finished ? '#ffd24d' : 'rgba(255,255,255,0.8)', 'right');
      });
    }

    _minimap(ctx, r, world, H) {
      const mm = r.minimap;
      if (!mm) return;
      const x = 16, y = H - 28 - mm.h;
      ctx.drawImage(mm.canvas, x, y, mm.w, mm.h);
      const cars = world.cars.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
      for (const car of cars) {
        const cx = x + mm.ox + car.x * mm.scale, cy = y + mm.oy + car.y * mm.scale;
        ctx.beginPath();
        ctx.arc(cx, cy, car.isPlayer ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = car.color;
        ctx.fill();
        ctx.lineWidth = car.isPlayer ? 2 : 1;
        ctx.strokeStyle = car.isPlayer ? '#fff' : 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }
    }

    _speedo(ctx, p, W, H) {
      const w = 172, h = 76, x = W - 16 - w, y = H - 28 - h;
      panel(ctx, x, y, w, h);
      const kmh = Math.round(p.speed * 0.36); // 10 units = 1 m
      text(ctx, `${kmh}`, x + w - 60, y + 46, `800 36px ${MONO}`, '#fff', 'right');
      text(ctx, 'km/h', x + w - 54, y + 46, `700 12px ${FONT}`, DIM);
      const frac = Math.min(1, p.speed / 520);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 14, y + 58, w - 28, 6);
      ctx.fillStyle = frac > 0.92 ? '#ff5a5a' : frac > 0.7 ? '#ffc43d' : '#5dff8f';
      ctx.fillRect(x + 14, y + 58, (w - 28) * frac, 6);
      const ctl = p.controls;
      text(ctx, p.forwardSpeed() < -5 ? 'R' : 'D', x + 16, y + 44, `800 22px ${FONT}`, p.forwardSpeed() < -5 ? '#ffc43d' : DIM);
      if (ctl.handbrake) text(ctx, 'HB', x + 16, y + 20, `800 11px ${FONT}`, '#ff8c42');
    }

    _startLights(ctx, world, W) {
      const t = world.tick, start = world.startTick, tps = Racer.TPS;
      if (t > start + tps * 0.8) return;
      const lit = t >= start ? 3 : Math.min(3, Math.floor(t / tps) + 1);
      const go = t >= start;
      const w = 176, h = 64, x = W / 2 - w / 2, y = 22;
      panel(ctx, x, y, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 38 + i * 50, y + h / 2, 17, 0, Math.PI * 2);
        ctx.fillStyle = i < lit ? (go ? '#39e072' : '#ff3131') : '#2a2f37';
        ctx.fill();
      }
    }

    _messages(ctx, W, H) {
      let y = H * 0.3;
      for (const m of this.messages) {
        const age = m.duration - m.t;
        const alpha = Math.min(1, age * 6, m.t * 3);
        const scale = 1 + Math.max(0, 0.25 - age) * 0.8;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, y);
        ctx.scale(scale, scale);
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 12;
        text(ctx, m.str, 0, 0, `800 ${m.size}px ${FONT}`, m.color, 'center', 'middle');
        ctx.restore();
        y += m.size * 1.15;
      }
    }

    _help(ctx, W, H, racingTime) {
      const alpha = racingTime < 6 ? 1 : Math.max(0, (8 - racingTime) / 2);
      const items = [
        ['↑ / W', 'throttle'], ['↓ / S', 'brake · reverse'], ['← → / A D', 'steer'], ['Space', 'handbrake'],
        ['Esc', 'pause'], ['R', 'restart'], ['P', 'replay'], ['F3', 'debug'],
      ];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `600 12px ${FONT}`;
      const parts = items.map(([k, v]) => `${k} ${v}`);
      const total = parts.reduce((s, t) => s + ctx.measureText(t).width + 22, 0);
      const w = Math.min(W - 32, total + 12), x = W / 2 - w / 2, y = H - 76;
      panel(ctx, x, y, w, 30);
      let cx = x + 16;
      for (const [k, v] of items) {
        text(ctx, k, cx, y + 20, `800 12px ${FONT}`, '#fff');
        cx += ctx.measureText(k).width + 5;
        text(ctx, v, cx, y + 20, `500 12px ${FONT}`, DIM);
        cx += ctx.measureText(v).width + 17;
      }
      ctx.restore();
    }

    _results(ctx, world, W, H) {
      const w = Math.min(520, W - 32), rowH = 30, h = 128 + world.cars.length * rowH;
      const x = W / 2 - w / 2, y = Math.max(170, H / 2 - h / 2);
      ctx.fillStyle = 'rgba(8,11,16,0.86)';
      Racer.roundRect(ctx, x, y, w, h, 12);
      ctx.fill();
      const done = world.phase === 'finished';
      text(ctx, done ? 'RACE RESULTS' : 'RESULTS · race still running', x + 20, y + 34, `800 18px ${FONT}`, '#fff');
      const cols = [x + 20, x + 60, x + w - 210, x + w - 20];
      text(ctx, 'POS', cols[0], y + 62, `700 11px ${FONT}`, DIM);
      text(ctx, 'DRIVER', cols[1], y + 62, `700 11px ${FONT}`, DIM);
      text(ctx, 'BEST LAP', cols[2], y + 62, `700 11px ${FONT}`, DIM, 'right');
      text(ctx, 'TIME', cols[3], y + 62, `700 11px ${FONT}`, DIM, 'right');
      const winner = world.standings[0];
      world.standings.forEach((car, i) => {
        const ry = y + 92 + i * rowH;
        if (car.isPlayer) {
          ctx.fillStyle = 'rgba(47,155,255,0.2)';
          ctx.fillRect(x + 10, ry - 20, w - 20, rowH - 2);
        }
        text(ctx, ordinal(i + 1), cols[0], ry, `800 15px ${FONT}`, '#fff');
        ctx.fillStyle = car.color;
        ctx.fillRect(cols[1], ry - 13, 5, 16);
        text(ctx, car.name, cols[1] + 14, ry, `700 15px ${FONT}`, '#fff');
        text(ctx, fmtTime(car.bestLap), cols[2], ry, `600 14px ${MONO}`, '#d7a6ff', 'right');
        let t;
        if (!car.finished) t = `lap ${world.currentLap(car)}/${world.config.laps}`;
        else if (car === winner) t = fmtTime(car.finishTime - world.startTick);
        else t = fmtGap(car.finishTime - winner.finishTime);
        text(ctx, t, cols[3], ry, `600 14px ${MONO}`, car.finished ? '#fff' : DIM, 'right');
      });
      const hint = done ? '[R] race again   [N] next seed   [T] switch track   [P] watch replay'
        : '[R] race again   [P] watch replay   hold [F] fast-forward the rest';
      text(ctx, hint, W / 2, y + h - 18, `600 12px ${FONT}`, DIM, 'center');
    }

    _pause(ctx, W, H) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, 'PAUSED', W / 2, H / 2 - 90, `800 44px ${FONT}`, '#fff', 'center');
      const lines = [
        ['↑ / W', 'accelerate'], ['↓ / S', 'brake, then reverse'], ['← → / A D', 'steer'], ['Space', 'handbrake (slide)'],
        ['Esc', 'resume'], ['R', 'restart race (same seed)'], ['N', 'next seed'], ['T', 'switch track (classic / procedural)'],
        ['P', 'replay this run from its input log'], ['F3', 'debug view: A* lines, gates, hitboxes'],
      ];
      lines.forEach(([k, v], i) => {
        const y = H / 2 - 40 + i * 22;
        text(ctx, k, W / 2 - 16, y, `800 14px ${FONT}`, '#fff', 'right');
        text(ctx, v, W / 2 + 4, y, `500 14px ${FONT}`, 'rgba(255,255,255,0.75)');
      });
    }

    _replayBanner(ctx, world, rp, W) {
      const w = Math.min(520, W - 32), h = rp.done ? 64 : 44, x = W / 2 - w / 2, y = 96;
      panel(ctx, x, y, w, h);
      const t = `${fmtTime(Math.max(0, world.tick - world.startTick))} / ${fmtTime(Math.max(0, rp.length - world.startTick))}`;
      text(ctx, '▶ REPLAY', x + 16, y + 28, `800 15px ${FONT}`, '#ff5a5a');
      text(ctx, t, x + 112, y + 28, `600 13px ${MONO}`, '#fff');
      text(ctx, rp.done ? '[P] watch again · [R] race' : 'hold F: 4× speed', x + w - 16, y + 28, `600 12px ${FONT}`, DIM, 'right');
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 16, y + 36, w - 32, 3);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(x + 16, y + 36, (w - 32) * Math.min(1, world.tick / rp.length), 3);
      if (rp.done) {
        const msg = rp.match
          ? `Determinism check passed: state hash ${rp.hash} matches the live run`
          : `Determinism check FAILED: diverged at tick ${rp.mismatchTick}`;
        text(ctx, msg, x + w / 2, y + 56, `700 12px ${FONT}`, rp.match ? '#5dff8f' : '#ff5a5a', 'center');
      }
    }

    _debug(ctx, world, ui, W) {
      const lines = [
        `tick ${world.tick}  hash ${world.hash()}`,
        `fps ${ui.fps.toFixed(0)}  steps/frame ${ui.steps}`,
        ...world.cars.map((c) => `${c.name.padEnd(5)} ${(c.isPlayer && !c.finished && !world.config.autopilot ? 'human' : c.driver.mode).padEnd(8)} gates ${c.gatesPassed}`),
      ];
      const x = 16, y = 160, h = 14 + lines.length * 15;
      panel(ctx, x, y, 214, h);
      lines.forEach((l, i) => text(ctx, l, x + 10, y + 18 + i * 15, `500 11px ${MONO}`, '#cfe8ff'));
    }
  }

  Racer.Hud = Hud;
  Racer.fmtTime = fmtTime;
})(globalThis.Racer = globalThis.Racer || {});
