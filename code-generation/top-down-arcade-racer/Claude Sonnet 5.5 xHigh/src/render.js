/*
 * render.js — Canvas 2D renderer and HUD. Reads the simulation, never writes to it.
 *
 * Everything cosmetic (camera smoothing, particles, skid marks, screen shake, banners) lives
 * here and uses its own seeded RNG stream, so the visuals never feed back into the sim.
 * Cars are drawn at a pose interpolated between the previous and current physics tick
 * (alpha from the fixed-step accumulator) so motion stays smooth at any refresh rate.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});
  const CFG = R.CONFIG;
  const CAR = CFG.CAR;
  const { RNG, wrapAngle } = R;
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const MAX_PIXELS = 3.6e6; // backing-store budget (about 2400x1500 at 1x)
  const SPEED_UNIT = 0.5; // px/s -> displayed km/h (arcade scale)
  const FONT_UI = "600 14px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const FONT_NUM = "700 14px ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
  const ORDINAL = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];

  function fmtTime(t) {
    if (t === undefined || t === null || !isFinite(t)) return '-:--.---';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }

  function fmtGap(g) {
    if (g === null || g === undefined) return '';
    return (g >= 0 ? '+' : '-') + Math.abs(g).toFixed(2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.cam = { x: 0, y: 0, zoom: 1, shake: 0 };
      this.now = 0; // accumulated frame time (s), cosmetic clock
      this.banner = null;
      this.resize();
    }

    resize() {
      this.w = this.canvas.clientWidth || globalThis.innerWidth || 960;
      this.h = this.canvas.clientHeight || globalThis.innerHeight || 600;
      // Render at device resolution, but never more than MAX_PIXELS: on a big hi-dpi window a
      // full-resolution backing store is slow to fill, and a slightly soft image is a better
      // trade than a low frame rate. (The simulation is unaffected either way.)
      let dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const px = this.w * this.h * dpr * dpr;
      if (px > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (this.w * this.h));
      this.dpr = dpr;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
    }

    // ------------------------------------------------------------ per-race setup

    setRace(race) {
      this.race = race;
      const track = race.track;
      this.fx = new RNG(race.seed).fork('fx');
      this.particles = [];
      this.skids = new Array(1600);
      this.skidHead = 0;
      this.skidCount = 0;
      this.lastSkid = race.cars.map(() => null);
      this.banner = null;
      this.finishShownAt = -1;
      this.cam.shake = 0;
      this.camInit = false;
      this.topV = 0;

      // world paths
      const mk = (off) => {
        const p = new Path2D();
        for (let i = 0; i < track.n; i++) {
          const x = track.px[i] + track.nx[i] * off;
          const y = track.py[i] + track.ny[i] * off;
          if (i === 0) p.moveTo(x, y);
          else p.lineTo(x, y);
        }
        p.closePath();
        return p;
      };
      this.pathCenter = mk(0);
      this.pathEdgeL = mk(track.halfWidth - 3);
      this.pathEdgeR = mk(-(track.halfWidth - 3));
      this.pathKerb = this._buildKerbs(track);

      this._buildGrass();
      this._buildDecor(track);
      this._buildMinimap(track);
    }

    _buildKerbs(track) {
      // kerbs on both edges wherever the circuit is turning hard
      const path = new Path2D();
      const off = track.halfWidth + 4;
      const thr = 1 / 520;
      const n = track.n;
      for (const side of [1, -1]) {
        let open = false;
        for (let i = 0; i <= n; i++) {
          const k = i % n;
          const hot = Math.abs(track.curv[k]) > thr;
          if (hot) {
            const x = track.px[k] + track.nx[k] * off * side;
            const y = track.py[k] + track.ny[k] * off * side;
            if (!open) {
              path.moveTo(x, y);
              open = true;
            } else path.lineTo(x, y);
          } else open = false;
        }
      }
      return path;
    }

    _buildGrass() {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#2d6a3b';
      g.fillRect(0, 0, 256, 256);
      const rng = new RNG(this.race.seed).fork('grass');
      for (let i = 0; i < 420; i++) {
        const x = rng.range(0, 256);
        const y = rng.range(0, 256);
        const r = rng.range(3, 16);
        const light = rng.chance(0.5);
        g.fillStyle = light ? 'rgba(120,190,100,0.07)' : 'rgba(10,50,30,0.09)';
        for (const ox of [-256, 0, 256]) {
          for (const oy of [-256, 0, 256]) {
            g.beginPath();
            g.arc(x + ox, y + oy, r, 0, TAU);
            g.fill();
          }
        }
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = rng.chance(0.5) ? 'rgba(160,220,120,0.18)' : 'rgba(0,40,20,0.16)';
        g.fillRect(rng.range(0, 256), rng.range(0, 256), 1.5, 3);
      }
      this.grass = this.ctx.createPattern(c, 'repeat');
    }

    _buildDecor(track) {
      const rng = new RNG(this.race.seed).fork('decor');
      const b = track.bounds;
      const pad = 500;
      this.trees = [];
      const minD = track.wallHalf + 45;
      let tries = 0;
      while (this.trees.length < 380 && tries++ < 6000) {
        const x = rng.range(b.minX - pad, b.maxX + pad);
        const y = rng.range(b.minY - pad, b.maxY + pad);
        let ok = true;
        for (let i = 0; i < track.n; i += 3) {
          const dx = x - track.px[i];
          const dy = y - track.py[i];
          if (dx * dx + dy * dy < minD * minD) {
            ok = false;
            break;
          }
        }
        if (ok) this.trees.push({ x, y, r: rng.range(14, 30), tone: rng.int(0, 2) });
      }
    }

    _buildMinimap(track) {
      const b = track.bounds;
      this.mm = { minX: b.minX + 140, minY: b.minY + 140, w: b.maxX - b.minX - 280, h: b.maxY - b.minY - 280 };
    }

    // -------------------------------------------------------------- frame entry

    /**
     * @param {Race} race
     * @param {number} alpha  interpolation factor from the fixed-step accumulator
     * @param {number} frameDt  real seconds since the last frame (cosmetics only)
     * @param {{paused:boolean, help:boolean, debug:boolean, fps:number}} ui
     */
    draw(race, alpha, frameDt, ui) {
      if (race !== this.race) this.setRace(race);
      const ctx = this.ctx;
      this.now += frameDt;
      this._consumeEvents(race);
      this._updateCamera(race, alpha, frameDt);
      this._updateEffects(race, alpha, frameDt);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#1d4a2a';
      ctx.fillRect(0, 0, this.w, this.h);

      this._drawWorld(race, alpha, ui);
      this._drawHud(race, ui);
    }

    // ------------------------------------------------------------------ camera

    _poseOf(car, alpha) {
      return {
        x: car.prevX + (car.x - car.prevX) * alpha,
        y: car.prevY + (car.y - car.prevY) * alpha,
        a: car.prevAngle + wrapAngle(car.angle - car.prevAngle) * alpha,
      };
    }

    _updateCamera(race, alpha, dt) {
      const cam = this.cam;
      const p = this._poseOf(race.player, alpha);
      const lead = 0.32;
      const tx = p.x + race.player.vx * lead;
      const ty = p.y + race.player.vy * lead;
      const tz = 1.12 - 0.34 * clamp(race.player.speed / 520, 0, 1);
      if (!this.camInit) {
        cam.x = tx;
        cam.y = ty;
        cam.zoom = tz;
        this.camInit = true;
      } else {
        const k = 1 - Math.exp(-dt * 6);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        cam.zoom += (tz - cam.zoom) * (1 - Math.exp(-dt * 2.5));
      }
      cam.shake *= Math.exp(-dt * 7);
    }

    get scale() {
      return (Math.min(this.w, this.h) / 720) * this.cam.zoom;
    }

    // ------------------------------------------------------------------ effects

    _consumeEvents(race) {
      const ev = race.events;
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        if (e.type === 'hit') {
          const n = clamp(Math.round(e.strength / 18), 3, 14);
          for (let k = 0; k < n; k++) {
            const a = this.fx.range(0, TAU);
            const sp = this.fx.range(60, 260) * clamp(e.strength / 140, 0.5, 1.6);
            this.particles.push({
              x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 0, max: this.fx.range(0.18, 0.45), r: 1.6, kind: 'spark',
            });
          }
          for (let k = 0; k < 3; k++) {
            this.particles.push({
              x: e.x, y: e.y, vx: this.fx.range(-40, 40), vy: this.fx.range(-40, 40),
              life: 0, max: this.fx.range(0.5, 0.9), r: this.fx.range(5, 9), kind: 'smoke',
            });
          }
          if (e.a === 0 || e.b === 0) this.cam.shake = Math.max(this.cam.shake, clamp(e.strength / 35, 1.5, 9));
        } else if (e.type === 'go') {
          this.banner = { text: 'GO!', sub: '', t: this.now, dur: 1.1, color: '#7dff9a' };
        } else if (e.type === 'lap' && e.car === 0) {
          const car = race.player;
          if (!car.finished) {
            const best = car.bestLap === e.time;
            this.banner = {
              text: 'LAP ' + e.lap + ' COMPLETE',
              sub: fmtTime(e.time) + (best ? '  ★ BEST' : ''),
              t: this.now, dur: 2.2, color: best ? '#ffd84a' : '#ffffff',
            };
          }
        } else if (e.type === 'finish' && e.car === 0) {
          this.finishShownAt = this.now;
        }
      }
      ev.length = 0;
    }

    _updateEffects(race, alpha, dt) {
      // particles
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) {
          ps[i] = ps[ps.length - 1];
          ps.pop();
          continue;
        }
        const drag = Math.exp(-dt * (p.kind === 'smoke' ? 2.2 : 3));
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      // skid marks + dust, per car
      for (let c = 0; c < race.cars.length; c++) {
        const car = race.cars[c];
        const pose = this._poseOf(car, alpha);
        const cs = Math.cos(pose.a);
        const sn = Math.sin(pose.a);
        const rear = -CAR.length * 0.3;
        const half = CAR.width * 0.42;
        const lx = pose.x + cs * rear + sn * half;
        const ly = pose.y + sn * rear - cs * half;
        const rx = pose.x + cs * rear - sn * half;
        const ry = pose.y + sn * rear + cs * half;
        const onTrack = car.offFrac < 0.5;
        if (car.skid > 0.3 && onTrack && race.phase === 'racing') {
          const prev = this.lastSkid[c];
          if (prev) this._pushSkid(prev[0], prev[1], lx, ly, prev[2], prev[3], rx, ry);
          this.lastSkid[c] = [lx, ly, rx, ry];
          if (car.skid > 0.6 && this.fx.chance(0.5)) {
            this.particles.push({
              x: pose.x - cs * 16, y: pose.y - sn * 16, vx: this.fx.range(-20, 20), vy: this.fx.range(-20, 20),
              life: 0, max: this.fx.range(0.4, 0.8), r: this.fx.range(4, 8), kind: 'smoke',
            });
          }
        } else {
          this.lastSkid[c] = null;
        }
        if (car.offFrac > 0.4 && car.speed > 90 && this.fx.chance(0.7)) {
          this.particles.push({
            x: pose.x - cs * 14, y: pose.y - sn * 14, vx: this.fx.range(-30, 30) - car.vx * 0.1,
            vy: this.fx.range(-30, 30) - car.vy * 0.1, life: 0, max: this.fx.range(0.35, 0.7),
            r: this.fx.range(3, 7), kind: 'dust',
          });
        }
      }
    }

    _pushSkid(x0, y0, x1, y1, a0, b0, a1, b1) {
      this.skids[this.skidHead] = [x0, y0, x1, y1];
      this.skidHead = (this.skidHead + 1) % this.skids.length;
      this.skids[this.skidHead] = [a0, b0, a1, b1];
      this.skidHead = (this.skidHead + 1) % this.skids.length;
      this.skidCount = Math.min(this.skidCount + 2, this.skids.length);
    }

    // -------------------------------------------------------------------- world

    _drawWorld(race, alpha, ui) {
      const ctx = this.ctx;
      const track = race.track;
      const cam = this.cam;
      const sc = this.scale;
      const shx = cam.shake ? this.fx.range(-1, 1) * cam.shake : 0;
      const shy = cam.shake ? this.fx.range(-1, 1) * cam.shake : 0;

      ctx.save();
      ctx.translate(this.w / 2 + shx, this.h / 2 + shy);
      ctx.scale(sc, sc);
      ctx.translate(-cam.x, -cam.y);

      const vx0 = cam.x - this.w / 2 / sc - 40;
      const vy0 = cam.y - this.h / 2 / sc - 40;
      const vw = this.w / sc + 80;
      const vh = this.h / sc + 80;

      // grass
      ctx.fillStyle = this.grass;
      ctx.fillRect(vx0, vy0, vw, vh);

      // trees (shadow + canopy), culled to the view
      const tones = ['#245c30', '#2b6e38', '#1d4f2a'];
      for (const t of this.trees) {
        if (t.x < vx0 - 40 || t.x > vx0 + vw + 40 || t.y < vy0 - 40 || t.y > vy0 + vh + 40) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.arc(t.x + 6, t.y + 8, t.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = tones[t.tone];
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,230,130,0.16)';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, TAU);
        ctx.fill();
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      // barrier (light top, darker inner face), gravel run-off, kerbs, asphalt
      ctx.strokeStyle = '#d7d9de';
      ctx.lineWidth = track.wallHalf * 2 + 16;
      ctx.stroke(this.pathCenter);
      ctx.strokeStyle = '#6f737b';
      ctx.lineWidth = track.wallHalf * 2 + 5;
      ctx.stroke(this.pathCenter);
      ctx.strokeStyle = '#b9a876';
      ctx.lineWidth = track.wallHalf * 2;
      ctx.stroke(this.pathCenter);
      ctx.strokeStyle = 'rgba(80,60,30,0.10)';
      ctx.lineWidth = track.wallHalf * 2 - 10;
      ctx.stroke(this.pathCenter);

      ctx.lineWidth = 9;
      ctx.setLineDash([20, 20]);
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineDashOffset = 0;
      ctx.stroke(this.pathKerb);
      ctx.strokeStyle = '#d9322f';
      ctx.lineDashOffset = 20;
      ctx.stroke(this.pathKerb);
      ctx.setLineDash([]);

      ctx.strokeStyle = '#3c3f46';
      ctx.lineWidth = track.halfWidth * 2;
      ctx.stroke(this.pathCenter);
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 46;
      ctx.stroke(this.pathCenter);

      // lane lines
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke(this.pathEdgeL);
      ctx.stroke(this.pathEdgeR);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 38]);
      ctx.stroke(this.pathCenter);
      ctx.setLineDash([]);

      this._drawStartLine(track);

      // skid marks
      if (this.skidCount) {
        ctx.strokeStyle = 'rgba(10,10,12,0.38)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < this.skidCount; i++) {
          const s = this.skids[i];
          if (!s) continue;
          if (s[0] < vx0 - 20 || s[0] > vx0 + vw + 20 || s[1] < vy0 - 20 || s[1] > vy0 + vh + 20) continue;
          ctx.moveTo(s[0], s[1]);
          ctx.lineTo(s[2], s[3]);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      // dust / smoke under cars
      this._drawParticles(false);

      // cars: back to front by y is unnecessary in top-down; draw AI first, player last
      const cars = race.cars;
      for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        const p = this._poseOf(car, alpha);
        this._drawCar(car, p.x, p.y, p.a);
      }

      this._drawParticles(true);

      if (ui && ui.debug) this._drawDebug(race, alpha);

      ctx.restore();
    }

    _drawStartLine(track) {
      const ctx = this.ctx;
      const g = track.gates[0];
      const cell = 11;
      const cols = Math.ceil((track.halfWidth * 2) / cell);
      const ang = Math.atan2(g.ty, g.tx);
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(ang);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#101114' : '#f5f5f5';
          const span = Math.min(cell, track.halfWidth * 2 - c * cell); // last cell may be partial
          ctx.fillRect(-cell + r * cell, -track.halfWidth + c * cell, cell, span);
        }
      }
      // grid boxes behind the line
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      const G = CFG.GRID;
      for (let slot = 0; slot < this.race.cars.length; slot++) {
        const s = -(G.first + slot * G.spacing);
        const lat = (slot % 2 === 0 ? -1 : 1) * G.lateral;
        const L = CAR.length + 6;
        const W = CAR.width + 8;
        ctx.beginPath();
        // U-shaped slot marking (open at the front)
        ctx.moveTo(s + L / 2, lat - W / 2);
        ctx.lineTo(s - L / 2, lat - W / 2);
        ctx.lineTo(s - L / 2, lat + W / 2);
        ctx.lineTo(s + L / 2, lat + W / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawParticles(top) {
      const ctx = this.ctx;
      for (const p of this.particles) {
        const t = p.life / p.max;
        const isTop = p.kind === 'spark';
        if (isTop !== top) continue;
        if (p.kind === 'spark') {
          ctx.strokeStyle = 'rgba(255,' + Math.round(210 - 120 * t) + ',80,' + (1 - t).toFixed(2) + ')';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
        } else {
          const a = (p.kind === 'dust' ? 0.35 : 0.3) * (1 - t);
          ctx.fillStyle = p.kind === 'dust' ? 'rgba(190,170,120,' + a.toFixed(3) + ')' : 'rgba(230,230,230,' + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 + t * 1.4), 0, TAU);
          ctx.fill();
        }
      }
    }

    _drawCar(car, x, y, ang) {
      const ctx = this.ctx;
      const L = CAR.length;
      const W = CAR.width;
      // shadow
      ctx.save();
      ctx.translate(x + 3, y + 4);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(ctx, -L / 2, -W / 2, L, W, 6);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);

      // wheels (fronts steer)
      const steer = Math.atan(car.steerTan);
      ctx.fillStyle = '#0d0d0f';
      const wheels = [[13, -W / 2, steer], [13, W / 2, steer], [-13, -W / 2, 0], [-13, W / 2, 0]];
      for (const [wx, wy, wa] of wheels) {
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(wa);
        roundRect(ctx, -4.5, -2.6, 9, 5.2, 1.5);
        ctx.fill();
        ctx.restore();
      }

      // body
      ctx.beginPath();
      ctx.moveTo(-L / 2 + 3, -W / 2);
      ctx.lineTo(L / 2 - 13, -W / 2);
      ctx.quadraticCurveTo(L / 2, -W / 2 + 1, L / 2, -W / 4);
      ctx.lineTo(L / 2, W / 4);
      ctx.quadraticCurveTo(L / 2, W / 2 - 1, L / 2 - 13, W / 2);
      ctx.lineTo(-L / 2 + 3, W / 2);
      ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W / 2 - 3);
      ctx.lineTo(-L / 2, -W / 2 + 3);
      ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + 3, -W / 2);
      ctx.closePath();
      ctx.fillStyle = car.color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.stroke();

      // racing stripe, glass, rear wing
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-L / 2 + 3, -1.6, L - 6, 3.2);
      ctx.fillStyle = 'rgba(14,18,26,0.92)';
      roundRect(ctx, -7, -6.4, 15, 12.8, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,200,255,0.25)';
      roundRect(ctx, 0, -5, 6.5, 10, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-L / 2 - 1.5, -W / 2 - 1, 4.5, W + 2);

      // brake lights
      const braking = car.input.brake > 0.1 && car.vF > 5 ? true : car.aLong < -300;
      ctx.fillStyle = braking ? '#ff3b30' : '#7d1b17';
      ctx.fillRect(-L / 2 - 0.5, -W / 2 + 1, 2, 4);
      ctx.fillRect(-L / 2 - 0.5, W / 2 - 5, 2, 4);
      if (braking) {
        ctx.fillStyle = 'rgba(255,60,40,0.35)';
        ctx.beginPath();
        ctx.arc(-L / 2 - 2, -W / 2 + 3, 5, 0, TAU);
        ctx.arc(-L / 2 - 2, W / 2 - 3, 5, 0, TAU);
        ctx.fill();
      }
      // head lamps
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(L / 2 - 2, -W / 2 + 2, 2, 3);
      ctx.fillRect(L / 2 - 2, W / 2 - 5, 2, 3);
      ctx.restore();
    }

    _drawDebug(race, alpha) {
      const ctx = this.ctx;
      const track = race.track;
      const rl = race.racingLine;
      // racing line (the AI's waypoints), shaded by target speed
      ctx.lineWidth = 3;
      const topV = this.topV || (this.topV = rl.speed.reduce((m, v) => (v > m ? v : m), 0));
      for (let i = 0; i < track.n; i += 2) {
        const j = (i + 2) % track.n;
        const t = rl.speed[i] / topV;
        ctx.strokeStyle = 'hsla(' + Math.round(t * 120) + ',90%,55%,0.85)';
        ctx.beginPath();
        ctx.moveTo(rl.x[i], rl.y[i]);
        ctx.lineTo(rl.x[j], rl.y[j]);
        ctx.stroke();
      }
      // gates
      ctx.lineWidth = 2;
      for (const g of track.gates) {
        ctx.strokeStyle = g.index === 0 ? '#ffffff' : 'rgba(120,200,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(g.x - g.nx * g.halfExtent, g.y - g.ny * g.halfExtent);
        ctx.lineTo(g.x + g.nx * g.halfExtent, g.y + g.ny * g.halfExtent);
        ctx.stroke();
      }
      // collision circles + AI aim points
      for (let c = 0; c < race.cars.length; c++) {
        const car = race.cars[c];
        const p = this._poseOf(car, alpha);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        for (const off of CAR.circleOffsets) {
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(p.a) * off, p.y + Math.sin(p.a) * off, CAR.circleRadius, 0, TAU);
          ctx.stroke();
        }
        const d = race.drivers[c];
        if (d && (!car.isPlayer || race.autoPlayer || car.finished)) {
          ctx.strokeStyle = car.color;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(d.targetX, d.targetY);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(d.targetX, d.targetY, 5, 0, TAU);
          ctx.stroke();
        }
      }
    }

    // ---------------------------------------------------------------------- HUD

    _text(str, x, y, size, color, align, font) {
      const ctx = this.ctx;
      ctx.font = (font || FONT_UI).replace(/\d+px/, size + 'px');
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = color || '#fff';
      ctx.fillText(str, x, y);
    }

    _panel(x, y, w, h) {
      const ctx = this.ctx;
      roundRect(ctx, x, y, w, h, 10);
      ctx.fillStyle = 'rgba(12,14,20,0.62)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();
    }

    _drawHud(race, ui) {
      const ctx = this.ctx;
      const u = clamp(Math.min(this.w, this.h) / 720, 0.8, 1.5);
      const W = this.w / u;
      const H = this.h / u;
      const me = race.player;

      ctx.save();
      ctx.scale(u, u);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';

      this._hudStats(race, me);
      this._hudStandings(race, me);
      this._hudMinimap(race, W);
      this._hudSpeed(race, me, W, H);
      this._hudTags(race, u);
      this._hudCenter(race, me, W, H);
      if (race.player.finished) this._hudResults(race, W, H);
      this._hudFooter(race, ui, W, H);
      if (ui && ui.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        this._text('PAUSED', W / 2, H / 2, 44, '#fff', 'center', FONT_UI.replace('600', '800'));
        this._text('press P to resume', W / 2, H / 2 + 30, 16, '#cfd3dc', 'center');
      }
      ctx.restore();
    }

    _hudStats(race, me) {
      const x = 16;
      const y = 16;
      this._panel(x, y, 236, 128);
      const pos = me.position;
      this._text(ORDINAL[pos - 1] || pos + 'TH', x + 14, y + 46, 40, pos === 1 ? '#ffd84a' : '#ffffff', 'left', FONT_UI.replace('600', '800'));
      this._text('/ ' + race.cars.length, x + 88, y + 46, 18, '#9aa3b5', 'left');
      this._text('LAP', x + 150, y + 24, 12, '#9aa3b5', 'left');
      this._text(race.lapOf(me) + ' / ' + race.laps, x + 150, y + 46, 26, '#ffffff', 'left', FONT_NUM);

      const total = me.finished ? me.finishTime : race.raceTime();
      this._text('TIME', x + 14, y + 74, 12, '#9aa3b5', 'left');
      this._text(fmtTime(total), x + 14, y + 96, 24, '#ffffff', 'left', FONT_NUM);
      this._text('LAP', x + 150, y + 74, 12, '#9aa3b5', 'left');
      this._text(fmtTime(race.currentLapTime(me)), x + 150, y + 90, 14, '#ffffff', 'left', FONT_NUM);
      this._text('BEST ' + (me.bestLap === Infinity ? '-:--.---' : fmtTime(me.bestLap)), x + 14, y + 118, 12, '#ffd84a', 'left', FONT_NUM);
      const last = me.lapTimes.length ? me.lapTimes[me.lapTimes.length - 1] : null;
      this._text('LAST ' + (last === null ? '-:--.---' : fmtTime(last)), x + 126, y + 118, 12, '#cfd3dc', 'left', FONT_NUM);
    }

    _hudStandings(race, me) {
      const x = 16;
      const y = 152;
      const rowH = 26;
      const n = race.order.length;
      this._panel(x, y, 236, 14 + rowH * n);
      const leader = race.order[0];
      for (let i = 0; i < n; i++) {
        const car = race.order[i];
        const ry = y + 12 + rowH * i;
        if (car.isPlayer) {
          this.ctx.fillStyle = 'rgba(255,255,255,0.12)';
          roundRect(this.ctx, x + 6, ry - 2, 224, rowH - 2, 6);
          this.ctx.fill();
        }
        this._text(String(i + 1), x + 16, ry + 16, 14, '#cfd3dc', 'center', FONT_NUM);
        this.ctx.fillStyle = car.color;
        roundRect(this.ctx, x + 30, ry + 4, 6, 14, 2);
        this.ctx.fill();
        this._text(car.name, x + 44, ry + 16, 14, '#ffffff', 'left');
        let right = '';
        let colour = '#cfd3dc';
        if (car.finished) {
          right = fmtTime(car.finishTime);
          colour = '#7dff9a';
        } else if (race.phase === 'racing') {
          if (i === 0) {
            right = 'LAP ' + race.lapOf(car);
          } else {
            const lapDiff = Math.floor((leader.progress - car.progress) / race.track.length);
            const g = race.gap(car, leader);
            right = lapDiff >= 1 ? '+' + lapDiff + ' LAP' : g === null ? '' : fmtGap(g);
          }
        }
        this._text(right, x + 226, ry + 16, 13, colour, 'right', FONT_NUM);
      }
    }

    _hudMinimap(race, W) {
      const ctx = this.ctx;
      const track = race.track;
      const mw = 190;
      const mh = 150;
      const x = W - mw - 16;
      const y = 16;
      this._panel(x, y, mw, mh);
      const mm = this.mm;
      const sc = Math.min((mw - 24) / mm.w, (mh - 24) / mm.h);
      const ox = x + (mw - mm.w * sc) / 2 - mm.minX * sc;
      const oy = y + (mh - mm.h * sc) / 2 - mm.minY * sc;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(sc, sc);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 9 / sc;
      ctx.stroke(this.pathCenter);
      ctx.strokeStyle = '#aab0bd';
      ctx.lineWidth = 5 / sc;
      ctx.stroke(this.pathCenter);
      // start / finish tick
      const g = track.gates[0];
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 / sc;
      ctx.beginPath();
      ctx.moveTo(g.x - g.nx * 60, g.y - g.ny * 60);
      ctx.lineTo(g.x + g.nx * 60, g.y + g.ny * 60);
      ctx.stroke();
      for (const car of race.cars) {
        const r = (car.isPlayer ? 5.5 : 4.2) / sc;
        ctx.fillStyle = car.color;
        ctx.beginPath();
        ctx.arc(car.x, car.y, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = (car.isPlayer ? 2 : 1.2) / sc;
        ctx.strokeStyle = car.isPlayer ? '#ffffff' : 'rgba(0,0,0,0.7)';
        ctx.stroke();
      }
      ctx.restore();
    }

    _hudSpeed(race, me, W, H) {
      const ctx = this.ctx;
      const kmh = Math.round(me.speed * SPEED_UNIT);
      const cx = W / 2;
      const y = H - 74;
      this._panel(cx - 130, y, 260, 58);
      this._text(String(kmh), cx - 20, y + 42, 38, '#ffffff', 'right', FONT_NUM);
      this._text('KM/H', cx - 12, y + 42, 13, '#9aa3b5', 'left');
      const frac = clamp(me.speed / 520, 0, 1);
      const bx = cx + 40;
      const bw = 80;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(ctx, bx, y + 16, bw, 8, 4);
      ctx.fill();
      ctx.fillStyle = frac > 0.9 ? '#ff6b4a' : '#7dd3ff';
      roundRect(ctx, bx, y + 16, Math.max(8, bw * frac), 8, 4);
      ctx.fill();
      // pedals
      const inp = me.input;
      ctx.fillStyle = inp.throttle > 0.1 ? '#7dff9a' : 'rgba(255,255,255,0.14)';
      roundRect(ctx, bx, y + 32, 36, 8, 4);
      ctx.fill();
      ctx.fillStyle = inp.brake > 0.1 ? '#ff6b4a' : 'rgba(255,255,255,0.14)';
      roundRect(ctx, bx + 44, y + 32, 36, 8, 4);
      ctx.fill();
    }

    _hudTags(race, u) {
      const cam = this.cam;
      const sc = this.scale;
      for (const car of race.cars) {
        if (car.isPlayer) continue;
        const sx = ((car.x - cam.x) * sc + this.w / 2) / u;
        const sy = ((car.y - cam.y) * sc + this.h / 2) / u;
        const label = car.position + ' ' + car.name;
        this.ctx.font = FONT_UI.replace(/\d+px/, '12px');
        const tw = this.ctx.measureText(label).width + 12;
        const ty = sy - 36 * (sc / u) - 8;
        this.ctx.fillStyle = 'rgba(10,12,18,0.7)';
        roundRect(this.ctx, sx - tw / 2, ty - 12, tw, 18, 6);
        this.ctx.fill();
        this._text(label, sx, ty + 1, 12, car.color, 'center');
      }
    }

    _hudCenter(race, me, W, H) {
      const ctx = this.ctx;
      if (race.phase === 'countdown') {
        const left = race.countdownLeft();
        const n = Math.ceil(left);
        const frac = n - left; // 0..1 within the current second
        const size = 120 + 40 * (1 - frac);
        ctx.globalAlpha = clamp(1.4 - frac * 0.9, 0, 1);
        this._text(String(n), W / 2, H * 0.36 + size * 0.3, size, '#ffffff', 'center', FONT_UI.replace('600', '900'));
        ctx.globalAlpha = 1;
        // start lights
        const lit = 3 - n + 1;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < lit ? '#ff2d2d' : 'rgba(60,10,10,0.8)';
          ctx.beginPath();
          ctx.arc(W / 2 + (i - 1) * 44, H * 0.18, 16, 0, TAU);
          ctx.fill();
        }
        this._text('GET READY', W / 2, H * 0.62, 16, '#cfd3dc', 'center');
      }
      const b = this.banner;
      if (b) {
        const t = this.now - b.t;
        if (t > b.dur) this.banner = null;
        else {
          const a = t < 0.15 ? t / 0.15 : t > b.dur - 0.5 ? (b.dur - t) / 0.5 : 1;
          ctx.globalAlpha = clamp(a, 0, 1);
          this._text(b.text, W / 2, H * 0.3, 54, b.color, 'center', FONT_UI.replace('600', '900'));
          if (b.sub) this._text(b.sub, W / 2, H * 0.3 + 34, 22, '#ffffff', 'center', FONT_NUM);
          ctx.globalAlpha = 1;
        }
      }
      if (me.wrongWay && race.phase === 'racing' && !me.finished) {
        const blink = Math.floor(this.now * 3) % 2 === 0;
        if (blink) this._text('WRONG WAY', W / 2, H * 0.22, 40, '#ff4d4d', 'center', FONT_UI.replace('600', '900'));
      }
    }

    _hudResults(race, W, H) {
      if (this.now - this.finishShownAt < 0.8 && this.finishShownAt >= 0) return; // let the lap banner breathe
      const ctx = this.ctx;
      const pw = 480;
      const ph = 120 + race.order.length * 34;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2 - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      this._panel(x, y, pw, ph);
      const me = race.player;
      const place = me.position;
      this._text(place === 1 ? 'VICTORY!' : 'RACE COMPLETE', W / 2, y + 46, 34, place === 1 ? '#ffd84a' : '#ffffff', 'center', FONT_UI.replace('600', '900'));
      this._text('You finished ' + ORDINAL[place - 1] + '  ·  seed ' + race.seed, W / 2, y + 72, 15, '#cfd3dc', 'center');
      for (let i = 0; i < race.order.length; i++) {
        const car = race.order[i];
        const ry = y + 98 + i * 34;
        if (car.isPlayer) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          roundRect(ctx, x + 14, ry - 20, pw - 28, 30, 8);
          ctx.fill();
        }
        this._text(String(i + 1), x + 34, ry, 16, '#cfd3dc', 'center', FONT_NUM);
        ctx.fillStyle = car.color;
        roundRect(ctx, x + 52, ry - 13, 7, 16, 2);
        ctx.fill();
        this._text(car.name, x + 70, ry, 16, '#ffffff', 'left');
        this._text('best ' + fmtTime(car.bestLap), x + 220, ry, 13, '#ffd84a', 'left', FONT_NUM);
        const right = car.finished ? fmtTime(car.finishTime) : 'LAP ' + race.lapOf(car) + '/' + race.laps;
        this._text(right, x + pw - 30, ry, 16, car.finished ? '#7dff9a' : '#9aa3b5', 'right', FONT_NUM);
      }
      this._text('R  restart   ·   N  next seed', W / 2, y + ph - 18, 14, '#cfd3dc', 'center');
    }

    _hudFooter(race, ui, W, H) {
      const dbg = ui && ui.debug;
      const line = 'SEED ' + race.seed + (dbg ? '   TICK ' + race.tick + '   HASH ' + race.stateHash().toString(16).padStart(8, '0') + '   ' + Math.round(ui.fps || 0) + ' FPS   ' + (CFG.DT * 1000).toFixed(2) + ' ms STEP' : '');
      this._text(line, W - 16, H - 14, 12, 'rgba(255,255,255,0.55)', 'right', FONT_NUM);
      if (ui && ui.help) {
        const x = 16;
        const y = H - 150;
        this._panel(x, y, 270, 134);
        const rows = [
          ['\u2191 / W', 'accelerate'],
          ['\u2193 / S', 'brake / reverse'],
          ['\u2190 \u2192 / A D', 'steer'],
          ['SPACE', 'handbrake (drift)'],
          ['R / N', 'restart / next seed'],
          ['P / V / H', 'pause / AI debug / help'],
        ];
        rows.forEach((r, i) => {
          this._text(r[0], x + 14, y + 26 + i * 19, 12, '#ffd84a', 'left', FONT_NUM);
          this._text(r[1], x + 112, y + 26 + i * 19, 12, '#e6e9f0', 'left');
        });
      }
    }
  }

  R.Renderer = Renderer;
  R.fmtTime = fmtTime;
})();
