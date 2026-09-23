/**
 * TOP-DOWN ARCADE RACER
 * Core game logic, physics, and rendering.
 */

// --- DETERMINISTIC RNG ---

/**
 * sfc32 (Simple Fast Counter) - A fast, seedable 32-bit PRNG.
 */
function sfc32(a, b, c, d) {
    return function() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        var t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}

// Global RNG used for game variety (AI stats, etc.)
let rng = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, 1);

function resetRNG() {
    rng = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, 1);
}

// --- CONFIGURATION ---

const TOTAL_LAPS = 3;
let isRaceOver = false;
let winner = null;

// --- CAR CLASS ---

class Car {
    constructor(x, y, color = '#ff4444', isAI = false, name = "Player") {
        this.x = x;
        this.y = y;
        this.velocity = 0;
        this.heading = 0;

        // Physics Constants
        this.ACCELERATION = 400;
        this.BRAKING = 700;
        this.DRAG = 0.0015;
        this.FRICTION = 0.6;
        this.STEER_SPEED = 4.5;
        this.MAX_SPEED = 850;
        this.RESTITUTION = 0.7; // Bounciness

        // AI Tuning
        this.isAI = isAI;
        this.name = name;
        this.nextWaypointIndex = 0;
        this.STEER_SENSITIVITY = 2.5;
        this.MAX_AI_SPEED = 600;

        // Visuals & Collision
        this.width = 36;
        this.height = 18;
        this.radius = 14;
        this.color = color;
        this.trail = [];
        this.maxTrail = 30;

        // Race Progress
        this.lapsCompleted = 0;
        this.lapTimes = [];
        this.currentLapStartTime = 0;
        this.isFinished = false;
        this.racePosition = 0;
        this.score = 0;
    }

    /**
     * Updates car physics and trail.
     */
    update(dt, input, track, raceTime) {
        const { accelerationInput, steeringInput, brakingInput } = input;

        // 1. Velocity Update
        if (brakingInput) {
            this.velocity -= this.BRAKING * dt;
        } else if (accelerationInput !== 0) {
            this.velocity += accelerationInput * this.ACCELERATION * dt;
        }

        // Apply Forces (Drag and Friction)
        const dragForce = this.DRAG * this.velocity * Math.abs(this.velocity) * dt;
        this.velocity -= dragForce;
        this.velocity -= this.FRICTION * this.velocity * dt;

        // Clamp speed
        if (Math.abs(this.velocity) > this.MAX_SPEED) {
            this.velocity = Math.sign(this.velocity) * this.MAX_SPEED;
        }
        if (Math.abs(this.velocity) < 1) this.velocity = 0;

        // 2. Steering (Scales with speed)
        const steerEffectiveness = Math.min(1.0, Math.abs(this.velocity) / 300);
        this.heading += steeringInput * this.STEER_SPEED * steerEffectiveness * dt;

        // 3. Position Update
        this.x += Math.cos(this.heading) * this.velocity * dt;
        this.y += Math.sin(this.heading) * this.velocity * dt;

        // 4. Trail Logic
        if (Math.abs(this.velocity) > 50) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.maxTrail) this.trail.shift();
        } else if (this.trail.length > 0) {
            this.trail.shift();
        }

        // 5. Race Progress
        if (!this.isFinished) {
            this.updateRaceProgress(track, raceTime);
        }
    }

    updateRaceProgress(track, raceTime) {
        if (!track.waypoints.length) return;

        const target = track.waypoints[this.nextWaypointIndex];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToNext = Math.sqrt(dx * dx + dy * dy);

        // Passed waypoint threshold
        if (distanceToNext < 100) {
            this.nextWaypointIndex = (this.nextWaypointIndex + 1) % track.waypoints.length;
            
            // Check for lap completion (waypoint 0 is the start/finish)
            if (this.nextWaypointIndex === 1) {
                if (this.currentLapStartTime !== 0) {
                    this.lapTimes.push(raceTime - this.currentLapStartTime);
                }
                this.currentLapStartTime = raceTime;
                this.lapsCompleted++;

                if (this.lapsCompleted > TOTAL_LAPS) {
                    this.isFinished = true;
                    this.velocity *= 0.4;
                    if (!winner) winner = this;
                }
            }
        }

        // Global score for positioning
        let progress = (this.lapsCompleted * track.waypoints.length) + this.nextWaypointIndex;
        this.score = progress - (distanceToNext / 1000);
    }

    /**
     * AI Logic: Simple waypoint following.
     */
    getAIInput(track) {
        if (!this.isAI || !track.waypoints.length || this.isFinished) {
            return { accelerationInput: 0, steeringInput: 0, brakingInput: false };
        }

        const target = track.waypoints[this.nextWaypointIndex];
        const targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
        const angleDiff = normalizeAngle(targetAngle - this.heading);
        
        const steeringInput = Math.max(-1, Math.min(1, angleDiff * this.STEER_SENSITIVITY));
        
        let accelerationInput = 0.9;
        let brakingInput = false;

        // Slow down for sharp turns
        if (Math.abs(angleDiff) > 0.4) {
            accelerationInput = 0.3;
            if (this.velocity > this.MAX_AI_SPEED * 0.6) brakingInput = true;
        }

        if (this.velocity > this.MAX_AI_SPEED) accelerationInput = 0;

        return { accelerationInput, steeringInput, brakingInput };
    }

    draw(ctx) {
        // Tire Tracks
        if (this.trail.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.lineWidth = this.height * 0.8;
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let p of this.trail) ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.heading);
        
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(-this.width/2 + 3, -this.height/2 + 3, this.width, this.height);

        // Body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Windshield
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(this.width/2 - 10, -this.height/2 + 2, 6, this.height - 4);

        ctx.restore();

        // Label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x, this.y - 20);
    }
}

// --- UTILITIES ---

function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

// --- TRACK SYSTEM ---

const track = { inner: [], outer: [], waypoints: [] };

function generateTrack(cx, cy, innerR, outerR, points = 50) {
    track.inner = []; track.outer = []; track.waypoints = [];
    // Fixed seed for track geometry consistency
    const trackRNG = sfc32(0x11223344, 0x55667788, 0x99AABBCC, 0xDDFFEE00);

    for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const noise = (trackRNG() * 0.25) - 0.125;
        const varFactor = 1 + Math.sin(angle * 4) * 0.15 + noise;
        
        const rIn = innerR * varFactor;
        const rOut = outerR * varFactor;
        const rMid = (rIn + rOut) / 2;

        track.inner.push({ x: cx + Math.cos(angle) * rIn, y: cy + Math.sin(angle) * rIn });
        track.outer.push({ x: cx + Math.cos(angle) * rOut, y: cy + Math.sin(angle) * rOut });
        track.waypoints.push({ x: cx + Math.cos(angle) * rMid, y: cy + Math.sin(angle) * rMid });
    }
}

// --- PHYSICS & COLLISIONS ---

function resolveCollision(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = a.radius + b.radius;

    if (dist < minDist && dist > 0) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minDist - dist) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;

        const vA = a.velocity * (Math.cos(a.heading) * nx + Math.sin(a.heading) * ny);
        const vB = b.velocity * (Math.cos(b.heading) * nx + Math.sin(b.heading) * ny);
        const relV = vA - vB;

        if (relV > 0) {
            const impulse = relV * (1 + a.RESTITUTION);
            a.velocity -= impulse * 0.6;
            b.velocity += impulse * 0.6;
        }
    }
}

function resolveWall(car, boundary) {
    for (let i = 0; i < boundary.length - 1; i++) {
        const p1 = boundary[i], p2 = boundary[i+1];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const l2 = dx*dx + dy*dy;
        if (l2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((car.x - p1.x) * dx + (car.y - p1.y) * dy) / l2));
        const closest = { x: p1.x + t * dx, y: p1.y + t * dy };
        
        const distDx = car.x - closest.x, distDy = car.y - closest.y;
        const dist = Math.sqrt(distDx * distDx + distDy * distDy);

        if (dist < car.radius && dist > 0) {
            const nx = distDx / dist, ny = distDy / dist;
            car.x += nx * (car.radius - dist);
            const dot = Math.cos(car.heading) * nx + Math.sin(car.heading) * ny;
            if (dot < 0) car.velocity *= (1 + dot * 0.8);
        }
    }
}

// --- INPUT & STATE ---

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function getPlayerInput() {
    if (isRaceOver || playerCar.isFinished) return { accelerationInput: 0, steeringInput: 0, brakingInput: true };
    return {
        accelerationInput: keys['ArrowUp'] ? 1 : (keys['ArrowDown'] ? -0.5 : 0),
        steeringInput: keys['ArrowLeft'] ? -1 : (keys['ArrowRight'] ? 1 : 0),
        brakingInput: keys['Space']
    };
}

// --- ENGINE ---

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let playerCar, aiCars = [], allCars = [], totalRaceTime = 0;

function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const minDim = Math.min(canvas.width, canvas.height);
    generateTrack(canvas.width / 2, canvas.height / 2, minDim * 0.22, minDim * 0.45);

    const start = track.waypoints[0];
    const next = track.waypoints[1];
    const heading = Math.atan2(next.y - start.y, next.x - start.x);

    resetRNG();
    playerCar = new Car(start.x, start.y, '#ff4444', false, "Player");
    playerCar.heading = heading;

    aiCars = [];
    const colors = ['#4444ff', '#44ff44', '#ffff44'];
    for (let i = 0; i < 3; i++) {
        const ai = new Car(start.x, start.y, colors[i], true, `CPU ${i+1}`);
        ai.heading = heading;
        ai.MAX_AI_SPEED = 500 + rng() * 150;
        ai.STEER_SENSITIVITY = 2.0 + rng() * 1.5;
        // Offset starting positions
        const sideX = -Math.sin(heading) * (i + 1) * 30;
        const sideY = Math.cos(heading) * (i + 1) * 30;
        ai.x += sideX; ai.y += sideY;
        aiCars.push(ai);
    }
    allCars = [playerCar, ...aiCars];
}

function update(dt) {
    if (!isRaceOver) totalRaceTime += dt;

    playerCar.update(dt, getPlayerInput(), track, totalRaceTime);
    for (let ai of aiCars) ai.update(dt, ai.getAIInput(track), track, totalRaceTime);

    // Collisions
    for (let i = 0; i < allCars.length; i++) {
        for (let j = i + 1; j < allCars.length; j++) resolveCollision(allCars[i], allCars[j]);
        resolveWall(allCars[i], track.inner);
        resolveWall(allCars[i], track.outer);
    }

    // Rankings
    allCars.sort((a, b) => b.score - a.score);
    allCars.forEach((c, i) => c.racePosition = i + 1);

    if (playerCar.isFinished && !isRaceOver) isRaceOver = true;
}

function render() {
    ctx.fillStyle = '#2d5a27'; // Grass
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Asphalt
    ctx.fillStyle = '#333';
    ctx.beginPath();
    for (let p of track.outer) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    for (let p of track.inner) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill('evenodd');

    // Curbs
    ctx.setLineDash([]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    for (let p of track.outer) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    for (let p of track.inner) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();

    // Checkered Line
    const pIn = track.inner[0], pOut = track.outer[0];
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pIn.x, pIn.y);
    ctx.lineTo(pOut.x, pOut.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let c of allCars) c.draw(ctx);

    drawHUD();
    if (isRaceOver) drawGameOver();
}

function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 20, 180, 100);
    ctx.fillStyle = 'white';
    ctx.font = '16px monospace';
    ctx.fillText(`LAP: ${Math.min(TOTAL_LAPS, playerCar.lapsCompleted + 1)}/${TOTAL_LAPS}`, 40, 50);
    ctx.fillText(`POS: ${playerCar.racePosition}/${allCars.length}`, 40, 75);
    ctx.fillText(`SPD: ${Math.floor(playerCar.velocity/5)} MPH`, 40, 100);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'gold';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("RACE FINISHED", canvas.width/2, canvas.height/2 - 100);
    
    ctx.fillStyle = 'white';
    ctx.font = '20px monospace';
    allCars.forEach((c, i) => {
        const time = c.lapTimes.length ? (c.lapTimes.reduce((a,b)=>a+b,0)).toFixed(2) + "s" : "DNF";
        ctx.fillText(`${i+1}. ${c.name.padEnd(10)} - ${time}`, canvas.width/2, canvas.height/2 - 20 + i*30);
    });
}

// --- LOOP ---
let lastTime = performance.now();
function loop(t) {
    const dt = Math.min((t - lastTime) / 1000, 0.1);
    lastTime = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
}

window.addEventListener('resize', setup);
setup();
requestAnimationFrame(loop);
