/*
 * render.js — presentation layer: camera, track/cars/effects drawing and HUD.
 *
 * Reads simulation state, never writes it. Visual-only randomness (scenery,
 * particles) comes from separate seeded RNG streams and is advanced on the
 * same fixed ticks, so even the effects are reproducible.
 */
(function () {
  'use strict';

  const S = window.RacerSim;
  const { CAR, TOP_SPEED, TICK_RATE, DT, COUNTDOWN_TICKS, clamp, lerp, wrapAngle } = S;
  const TAU = Math.PI * 2;

  const FONT_UI = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  const FONT_NUM = '"Cascadia Mono", Consolas, "SF Mono", "Roboto Mono", "DejaVu Sans Mono", Menlo, monospace';

  const COL = {
    grassA: '#4a8c3b', grassB: '#458537', verge: '#69a850',
    road: '#50545b', groove: 'rgba(20,22,26,0.16)', edge: '#e9e9e4',
    kerbRed: '#d8423b', kerbWhite: '#f1f1ec',
    panel: 'rgba(11,15,21,0.74)', panelEdge: 'rgba(255,255,255,0.09)',
    text: '#f4f6f8', dim: '#9aa4b1', accent: '#ffcf3f', good: '#5fe08a', bad: '#ff5d5d',
  };

  const SKID_PPM = 5;                         // skid-mark layer resolution (px per metre)
  const MAX_PARTICLES = 420;
  const WHEELS = [[1.32, -0.84], [1.32, 0.84], [-1.3, -0.84], [-1.3, 0.84]];   // FL FR RL RR (car frame)

  // ───────────────────────────── helpers ─────────────────────────────

  function shade(hex, f) {
    const v = parseInt(hex.slice(1), 16);
    let r = v >> 16, g = (v >> 8) & 255, b = v & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  /** m:ss.cc (truncated, so the display never rounds up past the real time). */
  function fmtTime(t) {
    if (!(t > 0)) return '-:--.--';
    const cs = Math.floor(t * 100);
    const m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }

  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ───────────────────────────── renderer ─────────────────────────────

  class Renderer {
    constructor(canvas, seed) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.track = S.getTrack();
      this.mode = 'fixed';                    // 'fixed' (north-up) | 'chase' (heading-up)
      this.debug = false;
      this.cam = { x: 0, y: 0, h: 100, rot: 0, anchor: 0.5 };
      this.camPrev = { x: 0, y: 0, h: 100, rot: 0, anchor: 0.5 };
      this.shake = 0; this.shakeX = 0; this.shakeY = 0;
      this.particles = [];
      this.banner = null;
      this.goTicks = -1;                      // ticks since the green light (for the lights)
      this.carPaint = new Map();
      this.buildTrackPaths();
      this.buildSkidLayer();
      this.setSeed(seed);
      this.resize();
    }

    // ── static geometry ──

    buildTrackPaths() {
      const t = this.track, n = t.n;
      const centre = new Path2D(), groove = new Path2D();
      for (let i = 0; i < n; i++) {
        const gx = t.px[i] + t.nx[i] * t.lineOff[i], gy = t.py[i] + t.ny[i] * t.lineOff[i];
        if (i === 0) { centre.moveTo(t.px[i], t.py[i]); groove.moveTo(gx, gy); }
        else { centre.lineTo(t.px[i], t.py[i]); groove.lineTo(gx, gy); }
      }
      centre.closePath(); groove.closePath();
      this.centrePath = centre; this.groovePath = groove;

      // kerbs: red/white blocks along both edges wherever the track bends
      const mark = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (Math.abs(t.curv[i]) > 0.017) for (let k = -5; k <= 5; k++) mark[(i + k + n) % n] = 1;
      }
      const red = new Path2D(), white = new Path2D();
      const a0 = t.roadHalf - 0.25, a1 = t.roadHalf + 0.85;
      for (let i = 0; i < n; i++) {
        if (!mark[i]) continue;
        const j = (i + 1) % n, path = (i >> 1) & 1 ? red : white;
        for (let side = -1; side <= 1; side += 2) {
          path.moveTo(t.px[i] + t.nx[i] * side * a0, t.py[i] + t.ny[i] * side * a0);
          path.lineTo(t.px[j] + t.nx[j] * side * a0, t.py[j] + t.ny[j] * side * a0);
          path.lineTo(t.px[j] + t.nx[j] * side * a1, t.py[j] + t.ny[j] * side * a1);
          path.lineTo(t.px[i] + t.nx[i] * side * a1, t.py[i] + t.ny[i] * side * a1);
          path.closePath();
        }
      }
      this.kerbRed = red; this.kerbWhite = white;

      const b = t.bounds, pad = t.wallHalf + 4;
      this.world = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
      this.startAngle = Math.atan2(t.ty[0], t.tx[0]);
    }

    buildSkidLayer() {
      const w = this.world;
      const c = this.skidCanvas = document.createElement('canvas');
      c.width = Math.ceil(w.w * SKID_PPM); c.height = Math.ceil(w.h * SKID_PPM);
      const g = this.skidCtx = c.getContext('2d');
      g.setTransform(SKID_PPM, 0, 0, SKID_PPM, -w.x * SKID_PPM, -w.y * SKID_PPM);
      g.lineCap = 'round';
    }

    /** Scenery is generated from the race seed (its own RNG stream). */
    setSeed(seed) {
      const t = this.track, rng = new S.RNG(seed, 7), loc = {};
      this.fxRng = new S.RNG(seed, 99);
      // grandstand on the outside of the main straight
      const gs = this.stand = { x: 104, y: t.py[0] + t.wallHalf + 3.5, w: 136, h: 11, crowd: [] };
      const shirts = ['#e8e8e8', '#e23b3b', '#3d8bff', '#ffb62e', '#35c46a', '#f08bd0', '#9aa4b1'];
      for (let row = 0; row < 5; row++) {
        for (let x = gs.x + 1.2; x < gs.x + gs.w - 1; x += 1.25) {
          if (rng.next() < 0.78) gs.crowd.push({ x: x + rng.range(-0.2, 0.2), y: gs.y + 1.6 + row * 1.9, c: shirts[rng.int(shirts.length)] });
        }
      }
      // trees in clumps, kept clear of the track and the stand
      const trees = this.trees = [], w = this.world;
      const tones = [['#2f6b2c', '#3c8436', '#55a348'], ['#2a6338', '#357a45', '#4b9a59'], ['#3b6e25', '#4d8a2f', '#6aa83f']];
      for (let clump = 0; clump < 85; clump++) {
        const cx = rng.range(w.x - 45, w.x + w.w + 45), cy = rng.range(w.y - 45, w.y + w.h + 45);
        const count = 1 + rng.int(5);
        for (let k = 0; k < count; k++) {
          const x = cx + rng.range(-9, 9), y = cy + rng.range(-9, 9), r = rng.range(2.3, 4.4);
          const tone = tones[rng.int(tones.length)];
          t.locate(x, y, -1, loc);
          if (loc.dist < t.wallHalf + r + 2.5) continue;
          if (x > gs.x - 6 && x < gs.x + gs.w + 6 && y > gs.y - 6 && y < gs.y + gs.h + 8) continue;
          trees.push({ x, y, r, tone });
        }
      }
      trees.sort((a, b) => a.y - b.y);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(320, window.innerWidth), ch = Math.max(240, window.innerHeight);
      this.canvas.width = Math.floor(cw * dpr);
      this.canvas.height = Math.floor(ch * dpr);
      this.u = dpr * clamp(Math.min(cw / 1280, ch / 720), 0.62, 1.5);     // HUD scale
    }

    // ── per-race state ──

    reset(race, overview) {
      const w = this.world;
      this.skidCtx.clearRect(w.x, w.y, w.w, w.h);
      this.particles.length = 0;
      this.fxRng = new S.RNG(race.seed, 99);
      this.banner = null;
      this.goTicks = -1;
      this.shake = 0;
      this.carPaint.clear();
      for (const c of race.cars) this.carPaint.set(c.id, { base: c.color, dark: shade(c.color, -0.35), light: shade(c.color, 0.3) });
      this.updateCamera(race, overview, true);
    }

    toggleCamera() { this.mode = this.mode === 'fixed' ? 'chase' : 'fixed'; return this.mode; }

    flash(title, sub, seconds, color) {
      this.banner = { title, sub: sub || '', ticks: Math.round(seconds * TICK_RATE), total: Math.round(seconds * TICK_RATE), color: color || COL.text };
    }

    overviewHeight() {
      const W = this.canvas.width, H = this.canvas.height, w = this.world;
      const ppm = Math.min(W / (w.w + 24), H / (w.h + 24));
      return Math.min(W, H) / ppm;
    }

    updateCamera(race, overview, snap) {
      const cam = this.cam, prev = this.camPrev, w = this.world;
      prev.x = cam.x; prev.y = cam.y; prev.h = cam.h; prev.rot = cam.rot; prev.anchor = cam.anchor;
      let tx, ty, th, trot = 0, tanchor = 0.5;
      if (overview) {
        tx = w.x + w.w / 2; ty = w.y + w.h / 2; th = this.overviewHeight();
      } else {
        const p = race.player;
        let lx = p.vx * 0.5, ly = p.vy * 0.5;
        const l = Math.sqrt(lx * lx + ly * ly);
        if (l > 22) { lx *= 22 / l; ly *= 22 / l; }
        th = 76 + 40 * clamp(p.speed / TOP_SPEED, 0, 1);
        if (this.mode === 'chase') { trot = p.angle + Math.PI / 2; tanchor = 0.64; lx *= 0.3; ly *= 0.3; }
        tx = p.x + lx; ty = p.y + ly;
      }
      if (snap) {
        cam.x = prev.x = tx; cam.y = prev.y = ty; cam.h = prev.h = th;
        cam.rot = prev.rot = trot; cam.anchor = prev.anchor = tanchor;
        return;
      }
      const kp = 1 - Math.exp(-5 * DT), kz = 1 - Math.exp(-1.8 * DT), kr = 1 - Math.exp(-4.5 * DT);
      cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp;
      cam.h += (th - cam.h) * kz;
      cam.rot = wrapAngle(cam.rot + wrapAngle(trot - cam.rot) * kr);
      cam.anchor += (tanchor - cam.anchor) * kz;
    }

    // ── fixed-tick visual update: camera, skid marks, particles, banners ──

    tick(race, overview) {
      const rng = this.fxRng, player = race.player;
      this.updateCamera(race, overview, false);
      if (this.banner && --this.banner.ticks <= 0) this.banner = null;
      if (this.goTicks >= 0) this.goTicks++;

      for (const e of race.events) {
        if (e.type === 'go') { this.goTicks = 0; }
        else if (e.type === 'hit' || e.type === 'wall') {
          const count = Math.min(14, 2 + Math.floor(e.power * 0.9));
          for (let k = 0; k < count; k++) {
            const a = rng.range(0, TAU), sp = rng.range(3, 9 + e.power * 0.8);
            this.spawn(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, rng.range(0.15, 0.4), 0.12, 0.05, 'spark');
          }
          if (e.a === player.id || e.b === player.id) this.shake = Math.min(1.3, this.shake + e.power * 0.07);
        } else if (e.type === 'lap' && e.car === player.id && !overview) {
          if (e.lap < race.laps) {
            const final = e.lap + 1 === race.laps;
            this.flash(final ? 'FINAL LAP' : 'LAP ' + (e.lap + 1), 'lap ' + e.lap + '  ' + fmtTime(e.time) + (e.best && e.lap > 1 ? '  ·  best lap' : ''), 2.6, final ? COL.accent : COL.text);
          }
        } else if (e.type === 'finish' && e.car === player.id && !overview) {
          this.flash('FINISH', ordinal(e.place) + ' place  ·  ' + fmtTime(e.time), 2.4, e.place === 1 ? COL.accent : COL.text);
        }
      }

      const g = this.skidCtx;
      for (const c of race.cars) {
        const onGrass = c.grass >= 0.5;
        const brakeMark = c.braking && c.inBrake > 0.85 && c.speed > 14 ? 0.3 : 0;
        const mark = Math.max(c.skid, brakeMark);
        if ((mark > 0.08 || (onGrass && c.speed > 4)) && c.speed > 2) {
          const c0 = Math.cos(c.prevAngle), s0 = Math.sin(c.prevAngle), c1 = Math.cos(c.angle), s1 = Math.sin(c.angle);
          g.beginPath();
          for (let k = (c.skid > 0.55 || onGrass || brakeMark > 0) ? 0 : 2; k < 4; k++) {
            const lx = WHEELS[k][0], ly = WHEELS[k][1];
            g.moveTo(c.prevX + c0 * lx - s0 * ly, c.prevY + s0 * lx + c0 * ly);
            g.lineTo(c.x + c1 * lx - s1 * ly, c.y + s1 * lx + c1 * ly);
          }
          g.lineWidth = 0.34;
          g.strokeStyle = onGrass ? 'rgba(74,58,30,0.16)' : 'rgba(14,14,16,' + (0.07 + 0.2 * mark).toFixed(3) + ')';
          g.stroke();
        }
        // tyre smoke / grass dust from the rear axle
        const smoke = onGrass ? (c.speed > 6 ? 0.3 : 0) : c.skid * 0.4;
        if (smoke > 0 && rng.next() < smoke) {
          const cs = Math.cos(c.angle), sn = Math.sin(c.angle), wy = rng.next() < 0.5 ? -0.84 : 0.84;
          const x = c.x + cs * -1.5 - sn * wy, y = c.y + sn * -1.5 + cs * wy;
          this.spawn(x, y, c.vx * 0.25 + rng.range(-1, 1), c.vy * 0.25 + rng.range(-1, 1), rng.range(0.5, 0.95), 0.5, rng.range(1.5, 2.4), onGrass ? 'dust' : 'smoke');
        }
      }

      // particles
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= DT;
        if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        const damp = p.kind === 'spark' ? 0.985 : 0.97;
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * DT; p.y += p.vy * DT;
      }

      if (this.shake > 0.01) {
        this.shakeX = rng.range(-1, 1) * this.shake; this.shakeY = rng.range(-1, 1) * this.shake;
        this.shake *= Math.exp(-9 * DT);
      } else { this.shake = 0; this.shakeX = 0; this.shakeY = 0; }
    }

    spawn(x, y, vx, vy, life, r0, r1, kind) {
      if (this.particles.length >= MAX_PARTICLES) return;
      this.particles.push({ x, y, vx, vy, life, max: life, r0, r1, kind });
    }

    // ───────────────────────────── drawing ─────────────────────────────

    draw(race, alpha, ui) {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      const cam = this.cam, prev = this.camPrev, t = this.track;
      const cx = lerp(prev.x, cam.x, alpha) + this.shakeX, cy = lerp(prev.y, cam.y, alpha) + this.shakeY;
      const vh = lerp(prev.h, cam.h, alpha);
      const rot = prev.rot + wrapAngle(cam.rot - prev.rot) * alpha;
      const anchor = lerp(prev.anchor, cam.anchor, alpha);
      const ppm = Math.min(W, H) / vh;
      const ox = W / 2, oy = H * anchor;
      const viewR = Math.sqrt(W * W + H * H) * (0.5 + Math.abs(anchor - 0.5)) / ppm + 6;
      this.view = { cx, cy, rot, ppm, ox, oy };

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL.grassA;
      ctx.fillRect(0, 0, W, H);

      ctx.translate(ox, oy);
      ctx.scale(ppm, ppm);
      ctx.rotate(-rot);
      ctx.translate(-cx, -cy);

      // mown-grass checker
      const G = 14;
      ctx.fillStyle = COL.grassB;
      for (let gx = Math.floor((cx - viewR) / G); gx <= Math.floor((cx + viewR) / G); gx++) {
        for (let gy = Math.floor((cy - viewR) / G); gy <= Math.floor((cy + viewR) / G); gy++) {
          if ((gx + gy) & 1) ctx.fillRect(gx * G, gy * G, G, G);
        }
      }

      // track, built from layered strokes of the centre line
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      const wallW = 2 * t.wallHalf + 1.5;
      ctx.save(); ctx.translate(0.7, 0.9);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = wallW; ctx.stroke(this.centrePath);
      ctx.restore();
      ctx.strokeStyle = '#eceeea'; ctx.lineWidth = wallW; ctx.stroke(this.centrePath);          // barrier: white…
      ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = '#cf3f38'; ctx.stroke(this.centrePath);                                   // …and red blocks
      ctx.setLineDash([]);
      ctx.strokeStyle = COL.verge; ctx.lineWidth = 2 * t.wallHalf; ctx.stroke(this.centrePath);   // grass verge
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 2 * t.roadHalf + 0.6; ctx.stroke(this.centrePath);
      ctx.strokeStyle = COL.road; ctx.lineWidth = 2 * t.roadHalf; ctx.stroke(this.centrePath);    // tarmac
      ctx.strokeStyle = COL.groove; ctx.lineWidth = 3.4; ctx.stroke(this.groovePath);             // rubbered-in line
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.22; ctx.stroke(this.centrePath);
      ctx.setLineDash([]);
      ctx.fillStyle = COL.kerbWhite; ctx.fill(this.kerbWhite);
      ctx.fillStyle = COL.kerbRed; ctx.fill(this.kerbRed);

      this.drawStartLine(ctx, race);
      ctx.drawImage(this.skidCanvas, this.world.x, this.world.y, this.world.w, this.world.h);
      this.drawStand(ctx, cx, cy, viewR);
      if (this.debug) this.drawDebugWorld(ctx, race);

      // cars: shadows first, then bodies
      const cars = race.cars;
      for (let i = 0; i < cars.length; i++) this.drawCar(ctx, cars[i], alpha, true);
      for (let i = 0; i < cars.length; i++) this.drawCar(ctx, cars[i], alpha, false);

      this.drawParticles(ctx);
      this.drawGantry(ctx, race);
      this.drawTrees(ctx, cx, cy, viewR);

      // ── screen space ──
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (ui.screen !== 'title') this.drawNameTags(ctx, race, alpha);
      this.drawHud(ctx, race, ui);
    }

    worldToScreen(x, y) {
      const v = this.view, dx = x - v.cx, dy = y - v.cy, c = Math.cos(-v.rot), s = Math.sin(-v.rot);
      return [v.ox + v.ppm * (dx * c - dy * s), v.oy + v.ppm * (dx * s + dy * c)];
    }

    drawStartLine(ctx, race) {
      const t = this.track, pt = { x: 0, y: 0, angle: 0 };
      ctx.save();
      ctx.translate(t.px[0], t.py[0]); ctx.rotate(this.startAngle);
      const sq = 0.8125, cols = Math.round(2 * t.roadHalf / sq);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-sq, -t.roadHalf, 2 * sq, 2 * t.roadHalf);
      ctx.fillStyle = '#16181b';
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
        if ((r + c) & 1) ctx.fillRect(-sq + r * sq, -t.roadHalf + c * sq, sq, sq);
      }
      ctx.restore();
      // grid boxes
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.22;
      for (let slot = 0; slot < race.cars.length; slot++) {
        t.pointAt(t.length - (7 + slot * 7.5), slot % 2 === 0 ? -2.7 : 2.7, pt);
        ctx.save();
        ctx.translate(pt.x, pt.y); ctx.rotate(pt.angle);
        ctx.beginPath();
        ctx.moveTo(1.2, -1.5); ctx.lineTo(2.8, -1.5); ctx.lineTo(2.8, 1.5); ctx.lineTo(1.2, 1.5);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawGantry(ctx, race) {
      const t = this.track, span = t.wallHalf + 1.2;
      ctx.save();
      ctx.translate(t.px[0], t.py[0]); ctx.rotate(this.startAngle);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(2.6, -span + 0.8, 1.5, 2 * span);          // shadow
      ctx.fillStyle = '#23272e'; ctx.fillRect(1.6, -span, 1.5, 2 * span);
      ctx.fillStyle = '#3a4049'; ctx.fillRect(1.1, -span - 0.6, 2.5, 1.5); ctx.fillRect(1.1, span - 0.9, 2.5, 1.5);
      // lights mirror the start sequence
      const sec = race.tick / TICK_RATE, live = race.phase !== 'countdown';
      const green = live && this.goTicks >= 0 && this.goTicks < 2.5 * TICK_RATE;
      for (let k = 0; k < 3; k++) {
        const lit = !live && sec >= k;
        ctx.fillStyle = green ? '#48f07a' : lit ? '#ff3b30' : '#0c0d0f';
        ctx.beginPath(); ctx.arc(2.35, (k - 1) * 1.7, 0.46, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    drawStand(ctx, cx, cy, viewR) {
      const s = this.stand;
      if (s.x > cx + viewR || s.x + s.w < cx - viewR || s.y > cy + viewR || s.y + s.h < cy - viewR) return;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(s.x + 1, s.y + 1.3, s.w, s.h);
      ctx.fillStyle = '#6b7079'; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#585d66';
      for (let row = 0; row < 5; row++) ctx.fillRect(s.x + 0.6, s.y + 0.8 + row * 1.9, s.w - 1.2, 0.5);
      for (const p of s.crowd) { ctx.fillStyle = p.c; ctx.fillRect(p.x - 0.38, p.y - 0.38, 0.76, 0.76); }
      ctx.fillStyle = '#c9342e'; ctx.fillRect(s.x, s.y + s.h - 1.3, s.w, 1.3);
    }

    drawTrees(ctx, cx, cy, viewR) {
      for (const tr of this.trees) {
        if (Math.abs(tr.x - cx) > viewR + 6 || Math.abs(tr.y - cy) > viewR + 6) continue;
        const r = tr.r;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.arc(tr.x + r * 0.4, tr.y + r * 0.5, r, 0, TAU); ctx.fill();
        ctx.fillStyle = tr.tone[0];
        ctx.beginPath(); ctx.arc(tr.x, tr.y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = tr.tone[1];
        ctx.beginPath(); ctx.arc(tr.x - r * 0.16, tr.y - r * 0.18, r * 0.74, 0, TAU); ctx.fill();
        ctx.fillStyle = tr.tone[2];
        ctx.beginPath(); ctx.arc(tr.x - r * 0.3, tr.y - r * 0.34, r * 0.38, 0, TAU); ctx.fill();
      }
    }

    drawCar(ctx, c, alpha, shadowPass) {
      const x = lerp(c.prevX, c.x, alpha), y = lerp(c.prevY, c.y, alpha);
      const ang = c.prevAngle + wrapAngle(c.angle - c.prevAngle) * alpha;
      const L = CAR.halfLen, Wd = CAR.halfWid;
      ctx.save();
      if (shadowPass) {
        ctx.translate(x + 0.45, y + 0.6); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        roundRect(ctx, -L, -Wd, 2 * L, 2 * Wd, 0.55); ctx.fill();
        ctx.restore();
        return;
      }
      const paint = this.carPaint.get(c.id);
      ctx.translate(x, y); ctx.rotate(ang);
      // wheels (fronts turn with the steering)
      ctx.fillStyle = '#121416';
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.translate(WHEELS[k][0], WHEELS[k][1] * 1.08);
        if (k < 2) ctx.rotate(c.steer * 0.5);
        ctx.fillRect(-0.42, -0.2, 0.84, 0.4);
        ctx.restore();
      }
      // body
      ctx.fillStyle = paint.base;
      roundRect(ctx, -L, -Wd, 2 * L, 2 * Wd, 0.55); ctx.fill();
      ctx.fillStyle = paint.dark;                                   // sills
      ctx.fillRect(-1.5, -Wd, 2.6, 0.16); ctx.fillRect(-1.5, Wd - 0.16, 2.6, 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';                     // bonnet stripes
      ctx.fillRect(0.5, -0.3, 1.6, 0.17); ctx.fillRect(0.5, 0.13, 1.6, 0.17);
      ctx.fillStyle = '#19212b';                                    // glass
      roundRect(ctx, -1.25, -0.8, 2.05, 1.6, 0.32); ctx.fill();
      ctx.fillStyle = paint.light;                                  // roof
      roundRect(ctx, -0.85, -0.68, 1.15, 1.36, 0.24); ctx.fill();
      ctx.fillStyle = '#fff5c4';                                    // headlights
      ctx.fillRect(L - 0.24, -Wd + 0.14, 0.2, 0.42); ctx.fillRect(L - 0.24, Wd - 0.56, 0.2, 0.42);
      ctx.fillStyle = c.braking ? '#ff2e24' : '#7d1512';            // tail lights (lit under braking)
      ctx.fillRect(-L + 0.03, -Wd + 0.12, 0.2, 0.5); ctx.fillRect(-L + 0.03, Wd - 0.62, 0.2, 0.5);
      if (c.braking) {
        ctx.fillStyle = 'rgba(255,60,40,0.3)';
        ctx.fillRect(-L - 0.3, -Wd, 0.5, 0.75); ctx.fillRect(-L - 0.3, Wd - 0.75, 0.5, 0.75);
      }
      ctx.restore();
    }

    drawParticles(ctx) {
      const ps = this.particles;
      ctx.lineCap = 'round';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i], k = p.life / p.max;
        if (p.kind === 'spark') {
          ctx.globalAlpha = k;
          ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 0.14;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
        } else {
          ctx.globalAlpha = (p.kind === 'dust' ? 0.34 : 0.26) * k;
          ctx.fillStyle = p.kind === 'dust' ? '#8f7a4c' : '#e6e8ea';
          ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.r1, p.r0, k), 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }

    drawDebugWorld(ctx, race) {
      const t = this.track, box = new Float64Array(8);
      ctx.lineWidth = 0.25;
      ctx.strokeStyle = '#3ff'; ctx.beginPath();                    // lap gates
      for (const g of t.gates) {
        ctx.moveTo(g.x - g.nx * t.wallHalf, g.y - g.ny * t.wallHalf);
        ctx.lineTo(g.x + g.nx * t.wallHalf, g.y + g.ny * t.wallHalf);
      }
      ctx.stroke();
      for (const c of race.cars) {
        const d = c.driver;
        ctx.fillStyle = c.color;                                    // this driver's waypoints
        for (let i = 0; i < t.n; i += 3) ctx.fillRect(t.px[i] + t.nx[i] * d.off[i] - 0.2, t.py[i] + t.ny[i] * d.off[i] - 0.2, 0.4, 0.4);
        if (!c.isPlayer || race.autopilot || c.finished) {          // pursuit target
          ctx.strokeStyle = c.color; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.targetX, d.targetY); ctx.stroke();
          ctx.beginPath(); ctx.arc(d.targetX, d.targetY, 0.7, 0, TAU); ctx.stroke();
        }
        S.cornersOf(c, box);                                        // collision box
        ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(box[0], box[1]);
        for (let k = 2; k < 8; k += 2) ctx.lineTo(box[k], box[k + 1]);
        ctx.closePath(); ctx.stroke();
      }
    }

    // ───────────────────────────── HUD ─────────────────────────────

    text(str, x, y, size, color, align, font, weight) {
      const ctx = this.ctx;
      ctx.font = (weight || '600') + ' ' + Math.round(size) + 'px ' + (font || FONT_UI);
      ctx.textAlign = align || 'left';
      ctx.fillStyle = color || COL.text;
      ctx.fillText(str, Math.round(x), Math.round(y));
    }

    panel(x, y, w, h) {
      const ctx = this.ctx;
      roundRect(ctx, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 10 * this.u);
      ctx.fillStyle = COL.panel; ctx.fill();
      ctx.strokeStyle = COL.panelEdge; ctx.lineWidth = Math.max(1, this.u); ctx.stroke();
    }

    drawNameTags(ctx, race, alpha) {
      const u = this.u, early = race.tick < COUNTDOWN_TICKS + 4 * TICK_RATE;
      for (const c of race.cars) {
        if (c.isPlayer && !early) continue;
        const p = this.worldToScreen(lerp(c.prevX, c.x, alpha), lerp(c.prevY, c.y, alpha));
        const label = c.isPlayer ? 'YOU' : c.place + '  ' + c.name;
        const y = p[1] - (3.4 * this.view.ppm + 6 * u);
        ctx.font = '700 ' + Math.round(11 * u) + 'px ' + FONT_UI;
        const w = ctx.measureText(label).width + 12 * u;
        roundRect(ctx, p[0] - w / 2, y - 12 * u, w, 16 * u, 4 * u);
        ctx.fillStyle = 'rgba(11,15,21,0.6)'; ctx.fill();
        ctx.fillStyle = c.color; ctx.fillRect(p[0] - w / 2, y + 2.5 * u, w, 1.5 * u);
        this.text(label, p[0], y, 11 * u, COL.text, 'center', FONT_UI, '700');
      }
    }

    drawHud(ctx, race, ui) {
      const W = this.canvas.width, H = this.canvas.height, u = this.u;
      ctx.textBaseline = 'alphabetic';
      if (ui.screen === 'title') { this.drawTitle(ctx, race, ui); return; }

      const p = race.player, m = 16 * u;

      // lap
      this.panel(m, m, 196 * u, 104 * u);
      this.text('LAP', m + 14 * u, m + 24 * u, 12 * u, COL.dim, 'left', FONT_UI, '700');
      const lapNow = String(clamp(p.lap, 1, race.laps));
      this.text(lapNow, m + 14 * u, m + 64 * u, 42 * u, COL.text, 'left', FONT_UI, '800');
      const lw = ctx.measureText(lapNow).width;
      this.text('/ ' + race.laps, m + 20 * u + lw, m + 64 * u, 22 * u, COL.dim, 'left', FONT_UI, '700');
      this.text('LAST', m + 14 * u, m + 82 * u, 11 * u, COL.dim, 'left', FONT_UI, '700');
      this.text(fmtTime(p.lastLap), m + 56 * u, m + 82 * u, 13 * u, COL.text, 'left', FONT_NUM, '600');
      this.text('BEST', m + 14 * u, m + 97 * u, 11 * u, COL.dim, 'left', FONT_UI, '700');
      this.text(fmtTime(p.bestLap), m + 56 * u, m + 97 * u, 13 * u, p.bestLap > 0 ? COL.good : COL.text, 'left', FONT_NUM, '600');

      // race clock
      const tw = 216 * u;
      this.panel(W / 2 - tw / 2, m, tw, 70 * u);
      this.text(ui.replay ? 'REPLAY  ' + ui.replaySpeed + '×' : 'TIME', W / 2, m + 24 * u, 12 * u, ui.replay ? COL.accent : COL.dim, 'center', FONT_UI, '700');
      this.text(fmtTime(p.finished ? p.finishTime : race.time).replace('-:--.--', '0:00.00'), W / 2, m + 58 * u, 32 * u, COL.text, 'center', FONT_NUM, '700');

      // position
      const pw = 168 * u, px = W - m - pw;
      this.panel(px, m, pw, 104 * u);
      this.text('POSITION', px + 14 * u, m + 24 * u, 12 * u, COL.dim, 'left', FONT_UI, '700');
      const pos = ordinal(p.place);
      this.text(pos.slice(0, -2), px + 14 * u, m + 72 * u, 54 * u, p.place === 1 ? COL.accent : COL.text, 'left', FONT_UI, '800');
      const nw = ctx.measureText(pos.slice(0, -2)).width;
      this.text(pos.slice(-2), px + 17 * u + nw, m + 50 * u, 20 * u, p.place === 1 ? COL.accent : COL.text, 'left', FONT_UI, '800');
      this.text('of ' + race.cars.length, px + 17 * u + nw, m + 72 * u, 15 * u, COL.dim, 'left', FONT_UI, '700');

      this.drawStandings(ctx, race, m, m + 114 * u);
      this.drawMinimap(ctx, race, m, H - m - 150 * u, 226 * u, 150 * u);
      this.drawSpeedo(ctx, p, W - m - 74 * u, H - m - 70 * u, 62 * u);

      if (race.phase === 'countdown' || (this.goTicks >= 0 && this.goTicks < 1.4 * TICK_RATE)) this.drawLights(ctx, race);
      if (p.wrongWay > 0.9 * TICK_RATE && !p.finished && Math.floor(p.wrongWay / 42) % 2 === 0) {
        this.bigText('WRONG WAY', '', H * 0.3, COL.bad, 1);
      } else if (this.banner && !ui.results) {
        const b = this.banner, fade = clamp(b.ticks / (0.4 * TICK_RATE), 0, 1) * clamp((b.total - b.ticks) / (0.12 * TICK_RATE), 0, 1);
        this.bigText(b.title, b.sub, H * 0.27, b.color, fade);
      }

      if (race.tick < COUNTDOWN_TICKS + 6 * TICK_RATE && !ui.replay && !race.autopilot) {
        this.hint('↑ accelerate    ↓ brake / reverse    ← → steer    ·    P pause    R restart    C camera    H debug', H - m);
      }
      if (ui.verify !== null && ui.verify !== undefined) {
        const ok = ui.verify;
        this.hint(ok ? '✔ replay verified — state hash ' + ui.refHash + ' reproduced at tick ' + ui.refTick
                     : '✘ replay diverged from the recorded run', m + 96 * u, ok ? COL.good : COL.bad);
      } else if (ui.replay) {
        this.hint('re-simulating from seed ' + race.seed + ' + recorded inputs   ·   V speed   ·   R race again', m + 96 * u, COL.dim);
      }
      if (this.debug) this.drawDebugHud(ctx, race, ui);
      if (ui.results) this.drawResults(ctx, race, ui);
      if (ui.paused) {
        ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.fillRect(0, 0, W, H);
        this.bigText('PAUSED', 'press P to resume', H * 0.46, COL.text, 1);
      }
    }

    bigText(title, sub, y, color, alpha) {
      const ctx = this.ctx, W = this.canvas.width, u = this.u;
      ctx.globalAlpha = alpha;
      ctx.font = 'italic 800 ' + Math.round(50 * u) + 'px ' + FONT_UI;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7 * u; ctx.strokeStyle = 'rgba(8,10,14,0.8)';
      ctx.strokeText(title, W / 2, y);
      ctx.fillStyle = color; ctx.fillText(title, W / 2, y);
      if (sub) {
        ctx.font = '600 ' + Math.round(18 * u) + 'px ' + FONT_UI;
        ctx.lineWidth = 5 * u; ctx.strokeText(sub, W / 2, y + 30 * u);
        ctx.fillStyle = COL.text; ctx.fillText(sub, W / 2, y + 30 * u);
      }
      ctx.globalAlpha = 1;
    }

    hint(str, y, color) {
      const ctx = this.ctx, W = this.canvas.width, u = this.u;
      ctx.font = '600 ' + Math.round(13 * u) + 'px ' + FONT_UI;
      const w = ctx.measureText(str).width + 28 * u;
      roundRect(ctx, W / 2 - w / 2, y - 26 * u, w, 26 * u, 13 * u);
      ctx.fillStyle = COL.panel; ctx.fill();
      this.text(str, W / 2, y - 8 * u, 13 * u, color || COL.text, 'center', FONT_UI, '600');
    }

    drawStandings(ctx, race, x, y) {
      const u = this.u, rowH = 23 * u, w = 196 * u, order = race.order, leader = order[0];
      this.panel(x, y, w, rowH * order.length + 14 * u);
      for (let i = 0; i < order.length; i++) {
        const c = order[i], ry = y + 7 * u + i * rowH;
        if (c.isPlayer) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 4 * u, ry, w - 8 * u, rowH); }
        this.text(String(i + 1), x + 14 * u, ry + 16 * u, 13 * u, COL.dim, 'left', FONT_NUM, '700');
        ctx.fillStyle = c.color; ctx.fillRect(x + 32 * u, ry + 6 * u, 4 * u, 12 * u);
        this.text(c.name, x + 44 * u, ry + 16 * u, 13 * u, COL.text, 'left', FONT_UI, c.isPlayer ? '800' : '600');
        let gap;
        if (c.finished) gap = c === leader ? fmtTime(c.finishTime) : '+' + (c.finishTime - leader.finishTime).toFixed(2) + 's';
        else if (i === 0) gap = 'leader';
        else gap = leader.finished ? '' : '+' + Math.max(0, leader.dist - c.dist).toFixed(0) + ' m';
        this.text(gap, x + w - 12 * u, ry + 16 * u, 12 * u, COL.dim, 'right', FONT_NUM, '600');
      }
    }

    drawMinimap(ctx, race, x, y, w, h) {
      const u = this.u, wd = this.world, t = this.track;
      this.panel(x, y, w, h);
      const s = Math.min((w - 16 * u) / wd.w, (h - 16 * u) / wd.h);
      const ox = x + w / 2 - (wd.x + wd.w / 2) * s, oy = y + h / 2 - (wd.y + wd.h / 2) * s;
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(s, s);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.4 * u / s; ctx.stroke(this.centrePath);
      ctx.strokeStyle = '#30353d'; ctx.lineWidth = 1.8 * u / s; ctx.stroke(this.centrePath);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * u / s;                              // start/finish tick
      ctx.beginPath();
      ctx.moveTo(t.px[0] - t.nx[0] * 13, t.py[0] - t.ny[0] * 13); ctx.lineTo(t.px[0] + t.nx[0] * 13, t.py[0] + t.ny[0] * 13);
      ctx.stroke();
      ctx.restore();
      const order = race.order;
      for (let i = order.length - 1; i >= 0; i--) {                                        // leader drawn last (on top)
        const c = order[i], cx = ox + c.x * s, cy = oy + c.y * s, r = (c.isPlayer ? 4.6 : 3.6) * u;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
        ctx.fillStyle = c.color; ctx.fill();
        ctx.lineWidth = (c.isPlayer ? 1.8 : 1) * u; ctx.strokeStyle = c.isPlayer ? '#fff' : 'rgba(0,0,0,0.6)'; ctx.stroke();
      }
    }

    drawSpeedo(ctx, p, cx, cy, r) {
      const u = this.u, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      const frac = clamp(p.speed / TOP_SPEED, 0, 1);
      ctx.beginPath(); ctx.arc(cx, cy, r + 8 * u, 0, TAU); ctx.fillStyle = COL.panel; ctx.fill();
      ctx.lineCap = 'round';
      ctx.lineWidth = 7 * u;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, r - 6 * u, a0, a1); ctx.stroke();
      ctx.strokeStyle = p.grass > 0.4 ? '#c59b4a' : frac > 0.85 ? COL.bad : COL.accent;
      ctx.beginPath(); ctx.arc(cx, cy, r - 6 * u, a0, a0 + (a1 - a0) * Math.max(frac, 0.002)); ctx.stroke();
      ctx.lineCap = 'butt';
      this.text(String(Math.round(p.speed * 3.6)), cx, cy + 9 * u, 30 * u, COL.text, 'center', FONT_NUM, '700');
      this.text(p.vf < -0.5 ? 'REVERSE' : 'km/h', cx, cy + 28 * u, 11 * u, COL.dim, 'center', FONT_UI, '700');
    }

    drawLights(ctx, race) {
      const W = this.canvas.width, H = this.canvas.height, u = this.u;
      const live = race.phase !== 'countdown', sec = race.tick / TICK_RATE;
      const fade = live ? clamp(1 - (this.goTicks / TICK_RATE - 0.9) / 0.5, 0, 1) : 1;
      const bw = 216 * u, bh = 78 * u, bx = W / 2 - bw / 2, by = H * 0.2;
      ctx.globalAlpha = fade;
      roundRect(ctx, bx, by, bw, bh, 16 * u); ctx.fillStyle = 'rgba(11,15,21,0.9)'; ctx.fill();
      for (let k = 0; k < 3; k++) {
        const lit = live || sec >= k, col = live ? '#48f07a' : '#ff3b30';
        const lx = W / 2 + (k - 1) * 64 * u, ly = by + bh / 2;
        if (lit) { ctx.beginPath(); ctx.arc(lx, ly, 31 * u, 0, TAU); ctx.fillStyle = live ? 'rgba(72,240,122,0.22)' : 'rgba(255,59,48,0.22)'; ctx.fill(); }
        ctx.beginPath(); ctx.arc(lx, ly, 23 * u, 0, TAU); ctx.fillStyle = lit ? col : '#262b33'; ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (live) this.bigText('GO!', '', by + bh + 62 * u, '#48f07a', fade);
    }

    drawResults(ctx, race, ui) {
      const W = this.canvas.width, H = this.canvas.height, u = this.u, order = race.order, p = race.player;
      const w = 520 * u, rowH = 34 * u, h = 196 * u + rowH * order.length;
      const x = W / 2 - w / 2, y = H / 2 - h / 2 + 14 * u;
      ctx.fillStyle = 'rgba(8,10,14,0.4)'; ctx.fillRect(0, 0, W, H);
      this.panel(x, y, w, h);
      this.text(p.place === 1 ? 'YOU WIN!' : 'YOU FINISHED ' + ordinal(p.finishPlace).toUpperCase(), W / 2, y + 48 * u, 32 * u, p.place === 1 ? COL.accent : COL.text, 'center', FONT_UI, 'italic 800');
      const c1 = x + 28 * u, c2 = x + 76 * u, c3 = x + w - 170 * u, c4 = x + w - 28 * u, top = y + 84 * u;
      this.text('POS', c1, top, 11 * u, COL.dim, 'left', FONT_UI, '700');
      this.text('DRIVER', c2, top, 11 * u, COL.dim, 'left', FONT_UI, '700');
      this.text('RACE TIME', c3, top, 11 * u, COL.dim, 'right', FONT_UI, '700');
      this.text('BEST LAP', c4, top, 11 * u, COL.dim, 'right', FONT_UI, '700');
      let fastest = Infinity;
      for (const c of order) if (c.bestLap > 0 && c.bestLap < fastest) fastest = c.bestLap;
      for (let i = 0; i < order.length; i++) {
        const c = order[i], ry = top + 10 * u + i * rowH;
        if (c.isPlayer) { ctx.fillStyle = 'rgba(255,255,255,0.09)'; roundRect(ctx, x + 14 * u, ry, w - 28 * u, rowH - 4 * u, 6 * u); ctx.fill(); }
        this.text(String(i + 1), c1 + 4 * u, ry + 21 * u, 17 * u, COL.text, 'left', FONT_NUM, '700');
        ctx.fillStyle = c.color; ctx.fillRect(c2 - 14 * u, ry + 7 * u, 5 * u, 16 * u);
        this.text(c.name, c2, ry + 21 * u, 17 * u, COL.text, 'left', FONT_UI, c.isPlayer ? '800' : '600');
        this.text(c.finished ? fmtTime(c.finishTime) : 'still racing…', c3, ry + 21 * u, 16 * u, c.finished ? COL.text : COL.dim, 'right', FONT_NUM, '600');
        this.text(fmtTime(c.bestLap), c4, ry + 21 * u, 16 * u, c.bestLap === fastest ? '#c98bff' : COL.text, 'right', FONT_NUM, '600');
      }
      const fy = top + 10 * u + order.length * rowH + 30 * u;
      this.text(ui.replay ? 'R  race again     N  next seed' : 'R  race again     V  watch replay     N  next seed', W / 2, fy, 15 * u, COL.accent, 'center', FONT_UI, '700');
      this.text('seed ' + race.seed + '  ·  ' + TICK_RATE + ' Hz fixed step  ·  state hash ' + ui.hash + ' @ tick ' + race.tick, W / 2, fy + 28 * u, 11.5 * u, COL.dim, 'center', FONT_NUM, '500');
    }

    drawTitle(ctx, race, ui) {
      const W = this.canvas.width, H = this.canvas.height, u = this.u;
      ctx.fillStyle = 'rgba(8,10,14,0.5)'; ctx.fillRect(0, 0, W, H);
      const w = 600 * u, h = 356 * u, x = W / 2 - w / 2, y = H / 2 - h / 2;
      this.panel(x, y, w, h);
      this.text('TARMAC SPRINT', W / 2, y + 70 * u, 52 * u, COL.text, 'center', FONT_UI, 'italic 800');
      ctx.fillStyle = COL.accent; ctx.fillRect(W / 2 - 150 * u, y + 84 * u, 300 * u, 3 * u);
      this.text('top-down racing prototype  ·  ' + race.laps + ' laps  ·  3 AI opponents', W / 2, y + 112 * u, 15 * u, COL.dim, 'center', FONT_UI, '600');
      const rows = [['↑  /  W', 'accelerate'], ['↓  /  S', 'brake · reverse'], ['← →  /  A D', 'steer'],
                    ['P', 'pause'], ['R', 'restart'], ['C', 'camera: north-up / chase'], ['H', 'debug: waypoints, gates, hash']];
      for (let i = 0; i < rows.length; i++) {
        const ry = y + 146 * u + i * 21 * u;
        this.text(rows[i][0], W / 2 - 22 * u, ry, 14 * u, COL.text, 'right', FONT_NUM, '700');
        this.text(rows[i][1], W / 2 + 2 * u, ry, 14 * u, COL.dim, 'left', FONT_UI, '600');
      }
      if (Math.floor(ui.now / 550) % 2 === 0) this.text('PRESS ENTER TO RACE', W / 2, y + h - 40 * u, 21 * u, COL.accent, 'center', FONT_UI, '800');
      this.text('seed ' + ui.seed + '  ·  ' + TICK_RATE + ' Hz fixed timestep  ·  N: next seed', W / 2, y + h - 16 * u, 11.5 * u, COL.dim, 'center', FONT_NUM, '500');
    }

    drawDebugHud(ctx, race, ui) {
      const u = this.u, W = this.canvas.width, pw = 318 * u, x = W - 16 * u - pw, y = 132 * u;
      const lines = [
        'seed ' + race.seed + '   tick ' + race.tick,
        'hash ' + ui.hash + '   ' + ui.fps + ' fps',
        'phase ' + race.phase + '   steps/frame ' + ui.steps,
      ];
      for (const c of race.cars) {
        lines.push(c.name.padEnd(6) + ' lap ' + c.lap + ' gate ' + c.nextGate + ' ' + (c.speed * 3.6).toFixed(0).padStart(3) + ' km/h' +
          (c.isPlayer && !race.autopilot && !c.finished ? '' : ' pace ' + c.driver.pace.toFixed(2)));
      }
      this.panel(x, y, pw, (lines.length * 16 + 12) * u);
      for (let i = 0; i < lines.length; i++) this.text(lines[i], x + 10 * u, y + (20 + i * 16) * u, 11.5 * u, COL.text, 'left', FONT_NUM, '500');
    }
  }

  window.RacerRender = { Renderer, fmtTime, ordinal };
})();
