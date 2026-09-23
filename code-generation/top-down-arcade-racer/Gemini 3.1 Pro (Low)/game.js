// Deterministic RNG (Mulberry32)
function splitmix32(a) {
    return function() {
      a |= 0; a = a + 0x9e3779b9 | 0;
      let t = a ^ a >>> 16; t = Math.imul(t, 0x21f0aaad);
      t = t ^ t >>> 15; t = Math.imul(t, 0x735a2d97);
      return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
    }
}
const rngSeed = 42;
const random = splitmix32(rngSeed);

// Vector Math
class Vec2 {
    constructor(x=0, y=0) { this.x=x; this.y=y; }
    add(v) { return new Vec2(this.x+v.x, this.y+v.y); }
    sub(v) { return new Vec2(this.x-v.x, this.y-v.y); }
    mul(s) { return new Vec2(this.x*s, this.y*s); }
    div(s) { return new Vec2(this.x/s, this.y/s); }
    mag() { return Math.sqrt(this.x*this.x + this.y*this.y); }
    magSq() { return this.x*this.x + this.y*this.y; }
    norm() { const m=this.mag(); return m===0?new Vec2():new Vec2(this.x/m, this.y/m); }
    dot(v) { return this.x*v.x + this.y*v.y; }
    clone() { return new Vec2(this.x, this.y); }
    dist(v) { return this.sub(v).mag(); }
}

const CONSTANTS = {
    TICK_RATE: 60,
    PHYSICS_DT: 1/60,
    TOTAL_LAPS: 3,
};

const GAME = {
    width: 1024,
    height: 768,
    keys: {},
    cars: [],
    track: null,
    totalTime: 0,
    finished: false
};

class Track {
    constructor() {
        // Track represented primarily by a sequence of center points/waypoints
        this.waypoints = [
            new Vec2(150, 600), new Vec2(150, 400), new Vec2(150, 200),
            new Vec2(300, 100), new Vec2(500, 100), new Vec2(700, 100),
            new Vec2(850, 250), new Vec2(850, 450), new Vec2(700, 650),
            new Vec2(450, 650), new Vec2(300, 500), new Vec2(300, 700)
        ];
        this.width = 100; // Track width
        this.checkpoints = this.waypoints.map(w => w.clone());
    }

    draw(ctx) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = this.width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
        for(let i=1; i<=this.waypoints.length; i++) {
            const p = this.waypoints[i % this.waypoints.length];
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        
        // Inner and outer boundaries for visuals
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Start line
        const start = this.waypoints[0];
        const next = this.waypoints[1];
        const dir = next.sub(start).norm();
        const normal = new Vec2(-dir.y, dir.x);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        const p1 = start.add(normal.mul(this.width/2));
        const p2 = start.sub(normal.mul(this.width/2));
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
}

class Car {
    constructor(isPlayer, color, startPos) {
        this.isPlayer = isPlayer;
        this.color = color;
        this.pos = startPos.clone();
        this.vel = new Vec2(0, 0);
        this.angle = -Math.PI/2;
        this.angularVel = 0;
        
        // Physics props
        this.mass = 1200;
        this.radius = 12; // Collision radius
        this.maxSpeed = 400;
        this.accelerationEngine = 600;
        this.braking = 800;
        this.friction = 1.5;
        this.steerPower = 3.0; // Rads per sec
        this.grip = 0.95; // Lateral grip

        // Progress
        this.lap = 1;
        this.targetWaypoint = 1; // Index of next waypoint
        this.lapProgress = 0; // Float representation of progress
        this.finished = false;
        this.finishTime = 0;
    }

    update(dt) {
        let throttle = 0;
        let steer = 0;

        if (this.isPlayer && !this.finished) {
            if (GAME.keys['ArrowUp'] || GAME.keys['w'] || GAME.keys['W']) throttle = 1;
            if (GAME.keys['ArrowDown'] || GAME.keys['s'] || GAME.keys['S']) throttle = -0.5;
            if (GAME.keys['ArrowLeft'] || GAME.keys['a'] || GAME.keys['A']) steer = -1;
            if (GAME.keys['ArrowRight'] || GAME.keys['d'] || GAME.keys['D']) steer = 1;
        } else if (!this.finished) {
            // AI Logic: Waypoint following
            const target = GAME.track.checkpoints[this.targetWaypoint];
            const dirToTarget = target.sub(this.pos);
            const dist = dirToTarget.mag();
            const nDir = dirToTarget.norm();
            
            const forward = new Vec2(Math.cos(this.angle), Math.sin(this.angle));
            const right = new Vec2(-forward.y, forward.x);
            
            const cross = forward.x * nDir.y - forward.y * nDir.x; // essentially dot with right
            const dot = forward.dot(nDir);
            
            if (cross > 0.1) steer = 1;
            else if (cross < -0.1) steer = -1;
            
            // Adjust throttle based on cornering
            const speed = this.vel.mag();
            throttle = (dot > 0.5) ? 1 : 0.4;
            if (speed > 250 && dot < 0.7) throttle = -0.5; // brake for turns
            
            // Add some randomness to AI to make them distinct and not follow exactly same path
            // Very simple variance based on ID/seed handled by small offsets offline, here we just keep it simple

            if (dist < GAME.track.width * 0.8) {
                // Approximate waypoint reached
            }
        } else {
            // Finished, slow down
            throttle = -0.1;
        }

        // Apply steering
        const speed = this.vel.mag();
        if (speed > 10) {
            // Steer effectiveness scales down a bit at higher speeds, but mostly requires forward movement
            this.angle += steer * this.steerPower * dt * (speed > 20 ? 1 : speed/20) * (throttle < 0 && speed > 20 ? -1 : 1);
        }

        const forward = new Vec2(Math.cos(this.angle), Math.sin(this.angle));
        
        // Acceleration
        let accelScalar = throttle > 0 ? throttle * this.accelerationEngine : throttle * this.braking;
        let accelVec = forward.mul(accelScalar);
        
        // Apply friction
        accelVec = accelVec.sub(this.vel.mul(this.friction));
        
        this.vel = this.vel.add(accelVec.mul(dt));

        // Lateral grip (kill sideways velocity)
        const right = new Vec2(-forward.y, forward.x);
        const lateralVelocity = right.mul(this.vel.dot(right));
        // Remove a portion of lateral velocity per frame (drift mechanics)
        this.vel = this.vel.sub(lateralVelocity.mul(this.grip * dt * 60)); // pseudo exact cancel if grip = 1

        // Cap speed
        if (this.vel.mag() > this.maxSpeed) {
            this.vel = this.vel.norm().mul(this.maxSpeed);
        }

        this.pos = this.pos.add(this.vel.mul(dt));

        this.checkWaypoints();
    }

    checkWaypoints() {
        if (this.finished) return;

        const target = GAME.track.checkpoints[this.targetWaypoint];
        // simple radius check
        if (this.pos.dist(target) < GAME.track.width) {
            this.targetWaypoint = (this.targetWaypoint + 1) % GAME.track.checkpoints.length;
            if (this.targetWaypoint === 1) { // Passed starting point again
                this.lap++;
                if (this.lap > CONSTANTS.TOTAL_LAPS) {
                    this.finished = true;
                    this.finishTime = GAME.totalTime;
                }
            }
        }
        
        // Compute progress float for leaderboard
        const nextWp = this.targetWaypoint;
        const prevWp = (nextWp - 1 + GAME.track.checkpoints.length) % GAME.track.checkpoints.length;
        const prev = GAME.track.checkpoints[prevWp];
        const next = GAME.track.checkpoints[nextWp];
        
        const segment = next.sub(prev);
        const segLen = segment.mag();
        const curVec = this.pos.sub(prev);
        const proj = curVec.dot(segment.norm());
        
        let t = Math.max(0, Math.min(1, proj / segLen));
        this.lapProgress = (this.lap - 1) * GAME.track.checkpoints.length + prevWp + t;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);
        
        // Draw body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(-10, -6, 20, 12, 3);
        ctx.fill();
        
        // Outline
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Windshield
        ctx.fillStyle = '#000';
        ctx.fillRect(-2, -4, 6, 8);

        ctx.restore();
    }
}

// Simple impulse collision resolution
function resolveCollisions(dt) {
    // Car vs Car
    for (let i = 0; i < GAME.cars.length; i++) {
        for (let j = i + 1; j < GAME.cars.length; j++) {
            const a = GAME.cars[i];
            const b = GAME.cars[j];
            
            const n = b.pos.sub(a.pos);
            const dist = n.mag();
            const minRad = a.radius + b.radius;
            
            if (dist < minRad && dist > 0) {
                const normal = n.norm();
                // Positional correction
                const overlap = minRad - dist;
                const correction = normal.mul(overlap / 2);
                a.pos = a.pos.sub(correction);
                b.pos = b.pos.add(correction);

                // Impulse
                const relVel = b.vel.sub(a.vel);
                const velAlongNormal = relVel.dot(normal);
                if (velAlongNormal > 0) continue;
                
                const e = 0.5; // Restitution
                const j_impulse = -(1 + e) * velAlongNormal / (1/a.mass + 1/b.mass);
                const impulse = normal.mul(j_impulse);
                
                a.vel = a.vel.sub(impulse.mul(1/a.mass));
                b.vel = b.vel.add(impulse.mul(1/b.mass));
            }
        }
    }

    // Car vs Track boundary (very simplified point vs curve distance is hard, 
    // we will check distance to nearest track segment and push out if outside width)
    for (const car of GAME.cars) {
        let minDist = Infinity;
        let closestNormal = null;
        let closestP = null;

        for (let i = 0; i < GAME.track.waypoints.length; i++) {
            const A = GAME.track.waypoints[i];
            const B = GAME.track.waypoints[(i + 1) % GAME.track.waypoints.length];
            
            const AB = B.sub(A);
            const AP = car.pos.sub(A);
            const lenSq = AB.magSq();
            
            let t = AP.dot(AB) / lenSq;
            t = Math.max(0, Math.min(1, t));
            
            const closest = A.add(AB.mul(t));
            const distSq = car.pos.sub(closest).magSq();
            
            if (distSq < minDist) {
                minDist = distSq;
                closestP = closest;
            }
        }
        
        const distToCenter = Math.sqrt(minDist);
        const maxDist = GAME.track.width / 2 - car.radius;
        
        if (distToCenter > maxDist) {
            // Push back
            const n = car.pos.sub(closestP).norm();
            car.pos = closestP.add(n.mul(maxDist));
            
            // Reflect velocity
            const velAlongN = car.vel.dot(n);
            if (velAlongN > 0) {
                car.vel = car.vel.sub(n.mul(velAlongN * 1.5)); // Bounce
            }
        }
    }
}

function init() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    GAME.canvas = canvas;
    GAME.ctx = ctx;

    window.addEventListener('keydown', e => GAME.keys[e.key] = true);
    window.addEventListener('keyup', e => GAME.keys[e.key] = false);

    // Track
    GAME.track = new Track();

    // Cars
    const start = GAME.track.waypoints[0];
    const prev = GAME.track.waypoints[GAME.track.waypoints.length-1];
    const startDir = start.sub(prev).norm();
    
    // Player
    GAME.cars.push(new Car(true, '#ff0055', start.add(new Vec2(-20, -20))));
    
    // AI
    GAME.cars.push(new Car(false, '#00ccff', start.add(new Vec2(-20, 20))));
    GAME.cars.push(new Car(false, '#ffff00', start.add(new Vec2(-60, -20))));
    GAME.cars.push(new Car(false, '#00ff00', start.add(new Vec2(-60, 20))));

    // Spread AI starting speeds slightly to avoid initial clumping
    GAME.cars[1].vel = startDir.mul(50);
    GAME.cars[2].vel = startDir.mul(-10);

    let lastTime = performance.now();
    let accumulator = 0;

    function gameLoop(time) {
        requestAnimationFrame(gameLoop);
        
        const dt = (time - lastTime) / 1000;
        lastTime = time;
        
        if (dt > 0.25) return; // Cap dt to prevent spiral
        
        accumulator += dt;
        
        while (accumulator >= CONSTANTS.PHYSICS_DT) {
            update(CONSTANTS.PHYSICS_DT);
            accumulator -= CONSTANTS.PHYSICS_DT;
            if (!GAME.finished) GAME.totalTime += CONSTANTS.PHYSICS_DT;
        }
        
        render(ctx);
        updateHUD();
    }

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    for (const car of GAME.cars) {
        car.update(dt);
    }
    
    resolveCollisions(dt);

    GAME.cars.sort((a, b) => b.lapProgress - a.lapProgress);
    
    // Check global finish
    if (GAME.cars[0].isPlayer && GAME.cars[0].finished) {
        GAME.finished = true;
    }
}

function render(ctx) {
    // Clear
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(0, 0, GAME.width, GAME.height);

    // Camera follow player roughly
    const player = GAME.cars.find(c => c.isPlayer);
    
    // For this prototype, we'll keep the camera static as the track fits in view.
    // Uncomment to add camera translation
    // ctx.save();
    // ctx.translate(GAME.width/2 - player.pos.x, GAME.height/2 - player.pos.y);

    // Draw track
    GAME.track.draw(ctx);

    // Draw cars
    for (const car of GAME.cars) {
        car.draw(ctx);
    }

    // ctx.restore();
}

function updateHUD() {
    const player = GAME.cars.find(c => c.isPlayer);
    const pos = GAME.cars.indexOf(player) + 1;
    
    const lapDisp = Math.min(player.lap, CONSTANTS.TOTAL_LAPS);
    document.getElementById('hud-lap').textContent = `${lapDisp}/${CONSTANTS.TOTAL_LAPS}`;
    
    const posSuffix = ["", "st", "nd", "rd", "th"][Math.min(pos, 4)];
    document.getElementById('hud-pos').textContent = `${pos}${posSuffix}`;
    
    document.getElementById('hud-time').textContent = GAME.totalTime.toFixed(2);
}

window.onload = init;
