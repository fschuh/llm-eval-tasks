(function () {
  'use strict';
  const S = window.ApexSim;
  const W = 1440, H = 900;
  const roundedRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  class RaceRenderer {
    constructor(canvas, race) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scenery = document.createElement('canvas');
      this.scenery.width = W * 1.5; this.scenery.height = H * 1.5;
      this.skids = [];
      this.particles = [];
      this.visualRng = S.seededRandom(race.seed ^ 0xF00D);
      this.drawScenery(race);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.resize();
    }

    resize() {
      const box = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(box.width * dpr);
      this.canvas.height = Math.round(box.height * dpr);
    }

    reset(race) {
      this.skids.length = 0; this.particles.length = 0;
      this.visualRng = S.seededRandom(race.seed ^ 0xF00D);
      this.drawScenery(race);
    }

    path(ctx, points, close = true) {
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (close) ctx.closePath();
    }

    drawScenery(race) {
      const ctx = this.scenery.getContext('2d'), track = race.track;
      ctx.setTransform(1.5, 0, 0, 1.5, 0, 0);
      const rng = S.seededRandom(race.seed ^ 0xA11CE);
      ctx.fillStyle = '#2b4033'; ctx.fillRect(0, 0, W, H);
      // Mown grass bands, slight grain, and a darkened perimeter.
      ctx.save(); ctx.translate(720, 450); ctx.rotate(-.4);
      ctx.fillStyle = '#314936';
      for (let x = -1200; x < 1400; x += 92) ctx.fillRect(x, -1100, 46, 2200);
      ctx.restore();
      for (let i = 0; i < 16000; i++) {
        const x = rng() * W, y = rng() * H;
        ctx.fillStyle = rng() > .5 ? '#93ae6b0b' : '#09241411';
        ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 2);
      }

      // Service paths and the paddock in the infield.
      ctx.strokeStyle = '#737c6530'; ctx.lineWidth = 15;
      ctx.beginPath(); ctx.moveTo(590, 520); ctx.lineTo(875, 520); ctx.lineTo(1110, 585); ctx.stroke();
      ctx.strokeStyle = '#424c3b'; ctx.lineWidth = 7; ctx.stroke();
      this.drawPaddock(ctx);

      // Full-width runoff, retaining barriers, tarmac, then individual curbs.
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      this.path(ctx, track.points);
      ctx.strokeStyle = '#17271c66'; ctx.lineWidth = 178; ctx.stroke();
      ctx.strokeStyle = '#657761'; ctx.lineWidth = 165; ctx.stroke();
      ctx.strokeStyle = '#374137'; ctx.lineWidth = 159; ctx.stroke();
      ctx.strokeStyle = '#8d8a702b'; ctx.lineWidth = 151; ctx.stroke();
      ctx.strokeStyle = '#232c29'; ctx.lineWidth = 130; ctx.stroke();
      ctx.strokeStyle = '#dedac5'; ctx.lineWidth = 117; ctx.stroke();
      ctx.strokeStyle = '#414640'; ctx.lineWidth = 112; ctx.stroke();
      ctx.strokeStyle = '#484c45'; ctx.lineWidth = 100; ctx.stroke();
      ctx.strokeStyle = '#4c5047'; ctx.lineWidth = 73; ctx.stroke();

      for (let s = 0; s < track.length; s += 14) {
        const p = S.sampleTrack(track, s), q = S.sampleTrack(track, s + 14.3);
        const next = S.sampleTrack(track, s + 60);
        const bend = Math.abs(S.angleDiff(next.angle, p.angle));
        for (const side of [-1, 1]) {
          if (bend < .09 && s > 130 && s < track.length - 180) continue;
          const inner = track.halfWidth - 2, outer = track.halfWidth + 9;
          ctx.beginPath();
          ctx.moveTo(p.x - p.ty * inner * side, p.y + p.tx * inner * side);
          ctx.lineTo(p.x - p.ty * outer * side, p.y + p.tx * outer * side);
          ctx.lineTo(q.x - q.ty * outer * side, q.y + q.tx * outer * side);
          ctx.lineTo(q.x - q.ty * inner * side, q.y + q.tx * inner * side);
          ctx.closePath(); ctx.fillStyle = Math.floor(s / 14) % 2 ? '#d9d9bd' : '#c8785f'; ctx.fill();
        }
      }
      // Fine speckle lives only on the asphalt.
      for (let i = 0; i < 11500; i++) {
        const p = S.sampleTrack(track, rng() * track.length, (rng() - .5) * 104);
        ctx.fillStyle = rng() > .5 ? '#d4d5b80c' : '#14291c13'; ctx.fillRect(p.x, p.y, 1.4, 1.4);
      }
      ctx.lineCap = 'butt'; ctx.setLineDash([17, 24]);
      this.path(ctx, track.points); ctx.strokeStyle = '#e0e5c423'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);

      // Trackside plants are seeded and kept outside the drivable corridor.
      const trees = [];
      for (let i = 0; i < 300; i++) {
        const x = 40 + rng() * (W - 80), y = 70 + rng() * (H - 110);
        const distance = S.nearestTrack(track, x, y).distance;
        if (distance < 107 || (x > 460 && x < 1070 && y > 420 && y < 610)) continue;
        // Keep the floating readouts and starting grid legible.
        if ((x > 1120 && y < 245) || (x < 230 && y > 730)) continue;
        trees.push({ x, y, size: 12 + rng() * 15, shade: rng() });
      }
      trees.sort((a, b) => a.y - b.y);
      trees.forEach(tree => this.drawTree(ctx, tree));
      this.drawGrandstand(ctx, 405, 823, 205, 34, -.06);
      this.drawGrandstand(ctx, 856, 101, 205, 32, .035);
      this.drawGrandstand(ctx, 76, 373, 37, 158, -.02);

      // Painted grid slots and a double checkered start/finish line.
      for (let i = 0; i < 6; i++) {
        const p = S.sampleTrack(track, -40 - Math.floor(i / 2) * 59, i % 2 ? 23 : -23);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.strokeStyle = '#dde0c955'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-22, -15); ctx.lineTo(23, -15); ctx.lineTo(23, 15); ctx.lineTo(-22, 15); ctx.stroke();
        ctx.fillStyle = '#e1e2c74d'; ctx.font = '9px monospace'; ctx.fillText(String(i + 1).padStart(2, '0'), -16, 3);
        ctx.restore();
      }
      const start = S.sampleTrack(track, 0);
      ctx.save(); ctx.translate(start.x, start.y); ctx.rotate(start.angle);
      for (let row = 0; row < 12; row++) for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#30382e' : '#e9e9d2';
        ctx.fillRect(col * 8 - 8, row * 9 - 54, 8, 9);
      }
      ctx.fillStyle = '#dde4c88c'; ctx.font = 'bold 9px monospace'; ctx.letterSpacing = '2px';
      ctx.fillText('START / FINISH', -58, 101); ctx.letterSpacing = '0px';
      ctx.restore();

      this.drawSign(ctx, 982, 624, 'APEX', '#d6f17b', -.14);
      this.drawSign(ctx, 454, 216, 'THE DRIVER’S CLUB', '#cacdb8', .86);
      this.drawSign(ctx, 1092, 166, 'GREENWOOD', '#d6f17b', .27);
      ctx.save(); ctx.translate(729, 570);
      ctx.fillStyle = '#b8cb9520'; ctx.textAlign = 'center';
      ctx.font = 'italic 900 62px Arial'; ctx.fillText('APEX', 0, 0);
      ctx.font = '10px monospace'; ctx.letterSpacing = '5px'; ctx.fillText('THE DRIVER’S CLUB', 0, 25); ctx.restore();
      const vignette = ctx.createRadialGradient(720, 445, 320, 720, 445, 820);
      vignette.addColorStop(0, '#0b231300'); vignette.addColorStop(1, '#0a1c1a70');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    }

    drawTree(ctx, { x, y, size, shade }) {
      ctx.fillStyle = '#11261a4d'; ctx.beginPath(); ctx.ellipse(x + 9, y + 11, size * 1.2, size * .83, .5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#162a20'; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade > .5 ? '#39543b' : '#3c573e';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(x + Math.cos(i * 1.26) * size * .4, y + Math.sin(i * 1.26) * size * .4, size * .57, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#4b684442'; ctx.beginPath(); ctx.arc(x - size * .21, y - size * .24, size * .51, 0, Math.PI * 2); ctx.fill();
    }

    drawPaddock(ctx) {
      ctx.fillStyle = '#24362b'; roundedRect(ctx, 827, 444, 182, 58, 4); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const x = 837 + i * 27;
        ctx.fillStyle = '#13281c55'; ctx.fillRect(x + 5, 460, 24, 35);
        ctx.fillStyle = i % 2 ? '#999c7d' : '#cccbb0'; ctx.fillRect(x, 451, 23, 33);
        ctx.fillStyle = i % 2 ? '#b0b28f' : '#d7d6b7'; ctx.fillRect(x + 2, 452, 9, 31);
        ctx.fillStyle = '#d6f17b'; ctx.fillRect(x, 481, 23, 3);
      }
      ctx.font = '8px monospace'; ctx.fillStyle = '#b1c39566'; ctx.letterSpacing = '2px';
      ctx.fillText('PADDOCK / CLUB SERIES', 840, 432); ctx.letterSpacing = '0px';
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = ['#aabc97', '#b8856e', '#809888', '#a1afb3', '#8a8374'][i];
        roundedRect(ctx, 858 + i * 26, 548, 11, 21, 2); ctx.fill();
        ctx.fillStyle = '#28382b'; ctx.fillRect(859 + i * 26, 554, 9, 7);
      }
    }

    drawGrandstand(ctx, x, y, w, h, angle) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#0e271959'; ctx.fillRect(5, 8, w, h);
      ctx.fillStyle = '#536352'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#94a084'; ctx.fillRect(0, 0, w, 4);
      for (let a = 5; a < w - 4; a += 8) for (let b = 8; b < h - 4; b += 7) {
        ctx.fillStyle = (a + b) % 3 ? '#abb59b80' : '#d2d5b2a0'; ctx.fillRect(a, b, 4, 3);
      }
      ctx.restore();
    }

    drawSign(ctx, x, y, text, color, angle) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.font = 'bold 10px Arial';
      const width = ctx.measureText(text).width + 25;
      ctx.fillStyle = '#15271eb0'; ctx.fillRect(-width / 2 + 3, -7, width, 19);
      ctx.fillStyle = color; ctx.fillRect(-width / 2, -10, width, 17);
      ctx.fillStyle = '#2b3825'; ctx.textAlign = 'center'; ctx.fillText(text, 0, 2); ctx.restore();
    }

    tick(race) {
      // Cosmetic randomness is consumed only on fixed ticks, never by rendering.
      for (const car of race.cars) {
        const speed = Math.hypot(car.vx, car.vy);
        const lateral = Math.abs(-car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle));
        if (speed > 55 && (lateral > 38 || car.control.handbrake || car.control.brake > .6)) {
          for (const side of [-1, 1]) {
            const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
            this.skids.push({ x1: car.prevX - fx * 12 - fy * 10 * side,
              y1: car.prevY - fy * 12 + fx * 10 * side,
              x2: car.x - fx * 12 - fy * 10 * side, y2: car.y - fy * 12 + fx * 10 * side });
          }
        }
        if (car.offroad && speed > 40 && race.ticks % 5 === 0) {
          this.particles.push({ x: car.x, y: car.y, vx: (this.visualRng() - .5) * 30,
            vy: (this.visualRng() - .5) * 30, life: .7, size: 3 + this.visualRng() * 5 });
        }
      }
      if (this.skids.length > 3000) this.skids.splice(0, this.skids.length - 3000);
      for (const p of this.particles) { p.life -= S.DT; p.x += p.vx * S.DT; p.y += p.vy * S.DT; }
      this.particles = this.particles.filter(p => p.life > 0);
    }

    render(race, alpha) {
      const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#24392e'; ctx.fillRect(0, 0, cw, ch);
      // Desktop shows the whole circuit. Narrow screens follow the player so
      // cars and corners remain readable instead of shrinking to a few pixels.
      const followPlayer = this.canvas.clientWidth <= 760 && race.phase !== 'ready';
      const scale = followPlayer ? cw / 600 : Math.min(cw / W, ch / H);
      let offsetX = (cw - W * scale) / 2, offsetY = (ch - H * scale) / 2;
      if (followPlayer) {
        const player = race.cars[0];
        const px = player.prevX + (player.x - player.prevX) * alpha;
        const py = player.prevY + (player.y - player.prevY) * alpha;
        const heading = player.prevAngle + S.angleDiff(player.angle, player.prevAngle) * alpha;
        offsetX = cw / 2 - (px + Math.cos(heading) * 65) * scale;
        offsetY = ch * .47 - (py + Math.sin(heading) * 65) * scale;
      }
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      ctx.drawImage(this.scenery, 0, 0, W, H);
      ctx.strokeStyle = '#19211b44'; ctx.lineWidth = 2.4; ctx.beginPath();
      for (const mark of this.skids) { ctx.moveTo(mark.x1, mark.y1); ctx.lineTo(mark.x2, mark.y2); } ctx.stroke();
      for (const p of this.particles) {
        ctx.fillStyle = `rgba(172, 167, 121, ${p.life * .24})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (1 - p.life) * 8, 0, Math.PI * 2); ctx.fill();
      }
      for (const car of race.cars.filter(c => c.id !== 0)) this.drawCar(ctx, car, alpha, race);
      this.drawCar(ctx, race.cars[0], alpha, race);
      this.drawStartLights(ctx, race);
    }

    drawCar(ctx, car, alpha, race) {
      const x = car.prevX + (car.x - car.prevX) * alpha;
      const y = car.prevY + (car.y - car.prevY) * alpha;
      const angle = car.prevAngle + S.angleDiff(car.angle, car.prevAngle) * alpha;
      const player = car.id === 0;
      if (player) {
        ctx.strokeStyle = '#d6f17b50'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#d6f17b'; ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.lineTo(x - 4, y - 46); ctx.lineTo(x + 4, y - 46); ctx.fill();
      }
      ctx.save(); ctx.translate(x + 4, y + 5); ctx.rotate(angle);
      ctx.fillStyle = '#10211980'; roundedRect(ctx, -23, -14, 45, 29, 7); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#17231d';
      for (const axle of [-12, 12]) for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(axle, side * 12);
        if (axle > 0) ctx.rotate(car.control.steer * .35);
        roundedRect(ctx, -5.5, -3, 11, 6, 1.5); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = '#17231d'; roundedRect(ctx, -22, -11, 44, 22, 5); ctx.fill();
      ctx.fillStyle = car.color; roundedRect(ctx, -20, -10.5, 40, 21, 5); ctx.fill();
      ctx.fillStyle = '#ffffff20'; roundedRect(ctx, -17, -9, 34, 6, 2); ctx.fill();
      ctx.fillStyle = '#314331'; ctx.fillRect(-16, -2, 34, 4);
      ctx.fillStyle = '#1e302d'; ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(3, -8.5); ctx.lineTo(3, 8.5); ctx.lineTo(9, 8); ctx.lineTo(11, 5); ctx.lineTo(11, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8db9b636'; ctx.fillRect(4, -7, 4, 14);
      ctx.fillStyle = '#273a30'; roundedRect(ctx, -12, -8, 6, 16, 1.5); ctx.fill();
      ctx.fillStyle = car.color; ctx.fillRect(-6, -7.5, 9, 15);
      ctx.fillStyle = '#1e312c'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center';
      ctx.save(); ctx.rotate(Math.PI / 2); ctx.fillText(String(car.id + 1).padStart(2, '0'), 0, 4); ctx.restore();
      ctx.fillStyle = '#e7ecc6'; ctx.fillRect(17, -8, 3, 4); ctx.fillRect(17, 4, 3, 4);
      ctx.fillStyle = car.control.brake > .1 || car.control.handbrake ? '#ff664b' : '#b85744'; ctx.fillRect(-21, -8, 2.5, 5); ctx.fillRect(-21, 3, 2.5, 5);
      ctx.fillStyle = '#1d2e23'; ctx.fillRect(-20, -13, 4, 26);
      ctx.fillStyle = car.color; ctx.fillRect(-20, -12, 2, 24);
      ctx.restore();
      if (player || race.phase === 'ready' || race.phase === 'countdown') {
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        const width = ctx.measureText(car.name).width + 11;
        ctx.fillStyle = '#18271cce'; roundedRect(ctx, x - width / 2, y + 29, width, 16, 3); ctx.fill();
        ctx.fillStyle = car.color; ctx.fillText(car.name, x, y + 40);
      }
    }

    drawStartLights(ctx, race) {
      const start = S.sampleTrack(race.track, 0);
      ctx.fillStyle = '#17291b'; roundedRect(ctx, start.x - 39, start.y - 103, 78, 18, 4); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const count = Math.ceil(race.countdownTicks / 120);
        ctx.fillStyle = race.phase === 'countdown' && i < 6 - count * 2 ? '#ef9675' : race.phase === 'racing' && race.time < 2 ? '#d6f17b' : '#495544';
        ctx.beginPath(); ctx.arc(start.x - 28 + i * 14, start.y - 94, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  window.RaceRenderer = RaceRenderer;
})();
