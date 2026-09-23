/*
 * Canvas 2D renderer. Draws the world at the interpolated pose between the last two fixed
 * ticks (alpha = accumulator / DT), so motion is smooth at any display refresh rate.
 *
 * Visual-only randomness (tree placement, sparks, smoke, camera shake) comes from its own seeded
 * streams and never touches simulation state, so rendering can't break determinism.
 */
(function (Racer) {
  'use strict';

  const PAL = {
    grass: '#3b7534',
    grassAlt: '#407d38',
    verge: '#58763c',
    asphalt: '#4a4d53',
    edgeLine: 'rgba(245,245,245,0.85)',
    curbRed: '#d6363c',
    curbWhite: '#f4f4f4',
    barrier: '#24272d',
    barrierStripe: '#dfe3e8',
    skid: 'rgba(18,18,20,0.30)',
    standBase: '#5a5f68',
    standEdge: '#c9ced6',
  };
  const CROWD = ['#e84a5f', '#2a9df4', '#f7d154', '#f4f4f4', '#7bd389', '#ff8c42', '#b388eb', '#222'];
  const MAX_SKIDS = 3000;

  // ---------------------------------------------------------------- helpers

  function pathFrom(xs, ys, closed = true) {
    const p = new Path2D();
    p.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) p.lineTo(xs[i], ys[i]);
    if (closed) p.closePath();
    return p;
  }

  function offsetLine(track, d) {
    const x = new Float64Array(track.n), y = new Float64Array(track.n);
    for (let i = 0; i < track.n; i++) {
      x[i] = track.cx[i] + track.nx[i] * d;
      y[i] = track.cy[i] + track.ny[i] * d;
    }
    return { x, y };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // ---------------------------------------------------------------- static scenery

  function buildScenery(track, seed) {
    const hw = track.halfWidth;
    const rng = new Racer.RNG(seed).derive('decor');
    const edges = [-1, 1].map((side) => offsetLine(track, side * (hw - 9)));
    const barriers = [-1, 1].map((side) => offsetLine(track, side * (hw + 4)));
    return {
      center: pathFrom(track.cx, track.cy),
      edgeLines: edges.map((l) => pathFrom(l.x, l.y)),
      barriers: barriers.map((l) => pathFrom(l.x, l.y)),
      curbs: buildCurbs(track),
      trees: buildTrees(track, rng),
      stands: buildStands(track, rng),
    };
  }

  /** Curb strips along both edges wherever the track bends noticeably. */
  function buildCurbs(track) {
    const path = new Path2D(), hw = track.halfWidth, n = track.n;
    for (const side of [-1, 1]) {
      let open = false;
      for (let k = 0; k <= n; k++) {
        const i = k % n;
        if (Math.abs(track.curv[i]) < 1 / 420) { open = false; continue; }
        const x = track.cx[i] + track.nx[i] * side * (hw - 4), y = track.cy[i] + track.ny[i] * side * (hw - 4);
        if (open) path.lineTo(x, y);
        else { path.moveTo(x, y); open = true; }
      }
    }
    return path;
  }

  function buildTrees(track, rng) {
    const b = track.bounds, pad = 700, trees = [];
    for (let k = 0; k < 2500 && trees.length < 320; k++) {
      const x = rng.range(b.minX - pad, b.maxX + pad), y = rng.range(b.minY - pad, b.maxY + pad);
      if (track.clearanceAt(x, y) > -80) continue;
      trees.push({ x, y, r: rng.range(15, 30), hue: rng.range(0, 1) });
    }
    trees.sort((a, b2) => a.y - b2.y);
    return trees;
  }

  /** A grandstand beside the start straight, on whichever side has room. */
  function buildStands(track, rng) {
    const hw = track.halfWidth;
    let turn = 0;
    for (let i = 0; i < track.n; i++) turn += track.curv[i];
    const outside = turn > 0 ? -1 : 1; // clockwise loop -> outside is on the left
    const fits = (side) => {
      for (let s = -300; s <= 220; s += 20) {
        const p = track.pointAt(s);
        for (const d of [hw + 36, hw + 110]) {
          if (track.clearanceAt(p.x + p.nx * side * d, p.y + p.ny * side * d) > -30) return false;
        }
      }
      return true;
    };
    const side = fits(outside) ? outside : fits(-outside) ? -outside : 0;
    if (!side) return null;
    const inner = [], outer = [], dots = [];
    for (let s = -300; s <= 220; s += 10) {
      const p = track.pointAt(s);
      inner.push([p.x + p.nx * side * (hw + 40), p.y + p.ny * side * (hw + 40)]);
      outer.push([p.x + p.nx * side * (hw + 104), p.y + p.ny * side * (hw + 104)]);
    }
    for (let s = -294; s <= 214; s += 7) {
      const p = track.pointAt(s);
      for (let row = 0; row < 8; row++) {
        if (rng.chance(0.12)) continue; // empty seats
        const d = hw + 48 + row * 7;
        dots.push({ x: p.x + p.nx * side * d, y: p.y + p.ny * side * d, c: rng.pick(CROWD) });
      }
    }
    const base = new Path2D();
    base.moveTo(inner[0][0], inner[0][1]);
    for (const q of inner) base.lineTo(q[0], q[1]);
    for (let i = outer.length - 1; i >= 0; i--) base.lineTo(outer[i][0], outer[i][1]);
    base.closePath();
    const front = new Path2D();
    front.moveTo(inner[0][0], inner[0][1]);
    for (const q of inner) front.lineTo(q[0], q[1]);
    const xs = inner.concat(outer).map((q) => q[0]), ys = inner.concat(outer).map((q) => q[1]);
    return {
      base, front, dots,
      box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    };
  }

  function makeGrassPattern(ctx, seed) {
    const rng = new Racer.RNG(seed).derive('grass');
    const size = 256, c = makeCanvas(size, size), g = c.getContext('2d');
    g.fillStyle = PAL.grass;
    g.fillRect(0, 0, size, size);
    g.fillStyle = PAL.grassAlt; // mowing stripes
    g.fillRect(0, 0, size / 2, size);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(20,60,20,0.18)' : 'rgba(150,200,110,0.10)';
      g.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(2, 5));
    }
    return ctx.createPattern(c, 'repeat');
  }

  // ---------------------------------------------------------------- effects

  /** Skid marks, sparks, smoke and camera shake, all driven by simulation ticks/events. */
  class Effects {
    reset(seed) {
      this.rng = new Racer.RNG(seed).derive('fx');
      this.particles = [];
      this.skids = new Float32Array(MAX_SKIDS * 4);
      this.skidHead = 0;
      this.skidCount = 0;
      this.wheels = [];
      this.shake = 0;
    }

    afterStep(world) {
      const rng = this.rng;
      for (const e of world.events) {
        if (e.type !== 'hit') continue;
        const n = Math.min(14, 2 + Math.floor(e.impulse / 18));
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2), v = rng.range(60, 90 + e.impulse * 1.5);
          this.particles.push({
            kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: rng.range(0.2, 0.45), max: 0.45, size: rng.range(1.5, 2.5),
          });
        }
        if (e.a === world.player.id || e.b === world.player.id) this.shake = Math.min(1, this.shake + e.impulse / 300);
      }
      for (const car of world.cars) {
        const back = car.length * 0.3, side = car.width * 0.38;
        const rx = car.x - car.c * back, ry = car.y - car.s * back;
        const ox = -car.s * side, oy = car.c * side;
        const w = { lx: rx - ox, ly: ry - oy, rx: rx + ox, ry: ry + oy };
        const prev = this.wheels[car.id];
        if (car.skidding && prev) {
          this._addSkid(prev.lx, prev.ly, w.lx, w.ly);
          this._addSkid(prev.rx, prev.ry, w.rx, w.ry);
          if (car.speed > 80 && world.tick % 3 === 0) {
            this.particles.push({
              kind: 'smoke', x: rx + rng.range(-4, 4), y: ry + rng.range(-4, 4),
              vx: -car.vx * 0.08 + rng.range(-10, 10), vy: -car.vy * 0.08 + rng.range(-10, 10),
              life: 0.9, max: 0.9, size: rng.range(6, 10),
            });
          }
        }
        this.wheels[car.id] = w;
      }
    }

    _addSkid(x1, y1, x2, y2) {
      const i = this.skidHead * 4;
      this.skids[i] = x1; this.skids[i + 1] = y1; this.skids[i + 2] = x2; this.skids[i + 3] = y2;
      this.skidHead = (this.skidHead + 1) % MAX_SKIDS;
      this.skidCount = Math.min(MAX_SKIDS, this.skidCount + 1);
    }

    update(dt) {
      const ps = this.particles;
      let w = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const drag = p.kind === 'spark' ? 4 : 1.5;
        p.vx -= p.vx * drag * dt;
        p.vy -= p.vy * drag * dt;
        if (p.kind === 'smoke') p.size += 14 * dt;
        ps[w++] = p;
      }
      ps.length = w;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    drawSkids(ctx) {
      if (!this.skidCount) return;
      ctx.beginPath();
      for (let k = 0; k < this.skidCount; k++) {
        const i = k * 4, s = this.skids;
        ctx.moveTo(s[i], s[i + 1]);
        ctx.lineTo(s[i + 2], s[i + 3]);
      }
      ctx.strokeStyle = PAL.skid;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        const t = p.life / p.max;
        if (p.kind === 'spark') {
          ctx.fillStyle = `rgba(255,${180 + Math.round(60 * t)},80,${Math.min(1, t * 2)})`;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          ctx.fillStyle = `rgba(210,210,210,${0.28 * t})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ---------------------------------------------------------------- cars

  function drawCar(ctx, car, x, y, angle) {
    const L = car.length, W = car.width, hl = L / 2, hw = W / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, -hl + 3, -hw + 4, L, W, 6);
    ctx.fill();
    // Tires (front ones follow the steering angle).
    ctx.fillStyle = '#111316';
    const wx = hl * 0.6, wy = hw - 2.5;
    ctx.fillRect(-wx - 5, -wy - 2.5, 10, 5);
    ctx.fillRect(-wx - 5, wy - 2.5, 10, 5);
    for (const sy of [-1, 1]) {
      ctx.save();
      ctx.translate(wx, sy * wy);
      ctx.rotate(car.steer);
      ctx.fillRect(-5, -2.5, 10, 5);
      ctx.restore();
    }
    ctx.fillStyle = car.color;
    roundRect(ctx, -hl, -hw + 2, L, W - 4, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; // side shading
    ctx.fillRect(-hl + 4, hw - 5, L - 10, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; // racing stripe
    ctx.fillRect(-hl + 2, -1.5, L - 4, 3);
    ctx.fillStyle = '#18202b'; // cockpit
    roundRect(ctx, -6, -hw + 5, 14, W - 10, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,200,255,0.6)'; // windscreen
    ctx.fillRect(6, -hw + 6, 3, W - 12);
    ctx.fillStyle = '#1d2026'; // rear wing
    ctx.fillRect(-hl - 1, -hw + 1, 4, W - 2);
    ctx.fillStyle = car.braking ? '#ff2a2a' : '#7c1818';
    ctx.fillRect(-hl, -hw + 3, 2, 4);
    ctx.fillRect(-hl, hw - 7, 2, 4);
    ctx.fillStyle = '#fff4c2';
    ctx.fillRect(hl - 2, -hw + 4, 2, 4);
    ctx.fillRect(hl - 2, hw - 8, 2, 4);
    ctx.restore();
  }

  // ---------------------------------------------------------------- renderer

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.cam = { x: 0, y: 0, zoom: 1 };
      this.fx = new Effects();
      this.hud = new Racer.Hud();
      this.debug = false;
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      if (this.world) this.minimap = this.hud.buildMinimap(this.world.track, this.dpr);
    }

    setWorld(world) {
      this.world = world;
      this.scenery = buildScenery(world.track, world.seed);
      this.grass = makeGrassPattern(this.ctx, world.seed);
      this.minimap = this.hud.buildMinimap(world.track, this.dpr);
      this.fx.reset(world.seed);
      this.hud.reset();
      this.cam.x = world.player.x;
      this.cam.y = world.player.y;
      this.cam.zoom = this.baseZoom();
    }

    afterStep(world) {
      this.fx.afterStep(world);
      this.hud.afterStep(world);
    }

    /** After a synchronous fast-forward: jump the camera to the player and expire transient messages. */
    skipTransitions(world) {
      this.cam.x = world.player.x;
      this.cam.y = world.player.y;
      this.hud.skip(10);
    }

    baseZoom() {
      return Math.max(0.5, Math.min(1.35, Math.min(this.w, this.h) / 820));
    }

    _updateCamera(world, alpha, dt) {
      const p = world.player;
      const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
      const tx = x + p.vx * 0.32, ty = y + p.vy * 0.32; // look ahead in the direction of travel
      const k = 1 - Math.exp(-dt * 6);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      const zt = this.baseZoom() * (1 - 0.2 * Math.min(1, p.speed / 520));
      this.cam.zoom += (zt - this.cam.zoom) * (1 - Math.exp(-dt * 1.5));
    }

    /** World -> CSS-pixel screen coordinates (ignores shake). */
    toScreen(x, y) {
      return { x: (x - this.cam.x) * this.cam.zoom + this.w / 2, y: (y - this.cam.y) * this.cam.zoom + this.h / 2 };
    }

    render(world, alpha, frameDt, ui) {
      const ctx = this.ctx, cam = this.cam, dpr = this.dpr, fx = this.fx;
      fx.update(frameDt);
      this.hud.update(frameDt);
      this._updateCamera(world, alpha, frameDt);

      const z = cam.zoom;
      const shake = fx.shake * fx.shake * 7;
      const sx = shake ? fx.rng.range(-shake, shake) : 0, sy = shake ? fx.rng.range(-shake, shake) : 0;
      const view = {
        x0: cam.x - this.w / 2 / z - 60, x1: cam.x + this.w / 2 / z + 60,
        y0: cam.y - this.h / 2 / z - 60, y1: cam.y + this.h / 2 / z + 60,
      };
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.w / 2 - cam.x * z + sx), dpr * (this.h / 2 - cam.y * z + sy));
      ctx.fillStyle = this.grass;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

      this._drawTrack(ctx, world, view);
      fx.drawSkids(ctx);
      this._drawStands(ctx, view);

      // Interpolated car poses; the player's car is drawn last so it stays on top.
      const order = world.cars.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
      this.poses = [];
      for (const car of order) {
        const x = car.prevX + (car.x - car.prevX) * alpha;
        const y = car.prevY + (car.y - car.prevY) * alpha;
        const a = car.prevAngle + (car.angle - car.prevAngle) * alpha;
        drawCar(ctx, car, x, y, a);
        this.poses[car.id] = { x, y };
      }
      fx.drawParticles(ctx);
      this._drawTrees(ctx, view);
      if (this.debug) this._drawDebug(ctx, world);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._drawTags(ctx, world);
      this.hud.draw(ctx, this, world, ui);
    }

    _drawTrack(ctx, world, view) {
      const tr = world.track, g = this.scenery;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      ctx.strokeStyle = PAL.verge;
      ctx.lineWidth = tr.width + 70;
      ctx.stroke(g.center);
      ctx.strokeStyle = PAL.asphalt;
      ctx.lineWidth = tr.width;
      ctx.stroke(g.center);
      ctx.strokeStyle = PAL.edgeLine;
      ctx.lineWidth = 2.5;
      for (const p of g.edgeLines) ctx.stroke(p);
      ctx.lineWidth = 8;
      ctx.strokeStyle = PAL.curbWhite;
      ctx.stroke(g.curbs);
      ctx.setLineDash([12, 12]);
      ctx.strokeStyle = PAL.curbRed;
      ctx.stroke(g.curbs);
      ctx.setLineDash([]);
      ctx.lineWidth = 8;
      ctx.strokeStyle = PAL.barrier;
      for (const p of g.barriers) ctx.stroke(p);
      ctx.setLineDash([9, 9]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = PAL.barrierStripe;
      for (const p of g.barriers) ctx.stroke(p);
      ctx.setLineDash([]);

      // Checkered start/finish line and grid boxes.
      const g0 = tr.gates[0], hw = tr.halfWidth, sq = 10;
      ctx.save();
      ctx.translate(g0.x, g0.y);
      ctx.rotate(Math.atan2(g0.ty, g0.tx));
      for (let k = 0; k * sq < tr.width; k++) {
        for (let row = 0; row < 2; row++) {
          ctx.fillStyle = (k + row) % 2 ? '#111' : '#f5f5f5';
          ctx.fillRect(row * sq - sq, -hw + k * sq, sq, Math.min(sq, tr.width - k * sq));
        }
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      for (const s of world.gridSlots) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.beginPath();
        ctx.moveTo(4, -16);
        ctx.lineTo(28, -16);
        ctx.lineTo(28, 16);
        ctx.lineTo(4, 16);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawStands(ctx, view) {
      const st = this.scenery.stands;
      if (!st || st.box.x1 < view.x0 || st.box.x0 > view.x1 || st.box.y1 < view.y0 || st.box.y0 > view.y1) return;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.save();
      ctx.translate(6, 8);
      ctx.fill(st.base);
      ctx.restore();
      ctx.fillStyle = PAL.standBase;
      ctx.fill(st.base);
      for (const d of st.dots) {
        ctx.fillStyle = d.c;
        ctx.fillRect(d.x - 2, d.y - 2, 4, 4);
      }
      ctx.strokeStyle = PAL.standEdge;
      ctx.lineWidth = 3;
      ctx.stroke(st.front);
    }

    _drawTrees(ctx, view) {
      for (const t of this.scenery.trees) {
        if (t.x + t.r < view.x0 || t.x - t.r > view.x1 || t.y + t.r < view.y0 || t.y - t.r > view.y1) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.arc(t.x + 6, t.y + 8, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.hue < 0.5 ? '#1f5a26' : '#26652b';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.hue < 0.5 ? '#2f7a33' : '#3a8a3a';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawTags(ctx, world) {
      ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const car of world.cars) {
        const pose = this.poses[car.id];
        const p = this.toScreen(pose.x, pose.y);
        const y = p.y - 34 * this.cam.zoom - 8;
        if (car.isPlayer) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(p.x - 6, y - 4);
          ctx.lineTo(p.x + 6, y - 4);
          ctx.lineTo(p.x, y + 4);
          ctx.closePath();
          ctx.fill();
          continue;
        }
        const label = `${car.position} ${car.name}`;
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(12,16,22,0.72)';
        roundRect(ctx, p.x - w / 2, y - 8, w, 16, 4);
        ctx.fill();
        ctx.fillStyle = car.color;
        ctx.fillRect(p.x - w / 2, y - 8, 3, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, p.x + 1, y + 0.5);
      }
    }

    _drawDebug(ctx, world) {
      const z = this.cam.zoom, tr = world.track;
      ctx.lineWidth = 1.5 / z;
      for (const g of tr.gates) {
        const next = g.k === world.player.gatesPassed % tr.gates.length;
        ctx.strokeStyle = g.k === 0 ? '#ffe14d' : next ? '#ff66ff' : 'rgba(0,210,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(g.ax, g.ay);
        ctx.lineTo(g.bx, g.by);
        ctx.stroke();
      }
      // Planned A* racing lines, look-ahead aim points and any runtime detours.
      for (const car of world.cars) {
        const d = car.driver, line = d.line;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = car.color;
        ctx.lineWidth = 2 / z;
        ctx.beginPath();
        ctx.moveTo(line.x[0], line.y[0]);
        for (let i = 1; i < line.n; i++) ctx.lineTo(line.x[i], line.y[i]);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (car.isPlayer && !car.finished && !world.config.autopilot) continue;
        ctx.beginPath();
        ctx.moveTo(car.x, car.y);
        ctx.lineTo(d.aim.x, d.aim.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(d.aim.x, d.aim.y, 5 / z, 0, Math.PI * 2);
        ctx.fillStyle = car.color;
        ctx.fill();
        if (d.detour) {
          ctx.setLineDash([6 / z, 6 / z]);
          ctx.strokeStyle = '#fff';
          ctx.beginPath();
          d.detour.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Collision boxes.
      const poly = Racer.Collision.makePoly(4);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1 / z;
      for (const car of world.cars) {
        Racer.Collision.setCarPoly(poly, car);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, poly.vx[i], poly.vy[i]);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  Racer.Renderer = Renderer;
  Racer.roundRect = roundRect;
  Racer.makeCanvas = makeCanvas;
})(globalThis.Racer = globalThis.Racer || {});
