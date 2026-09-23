// ═══════════════════════════════════════════════════════════════════════════════
// TOP-DOWN ARCADE RACER — game.js
// All-in-one: deterministic RNG, fixed-timestep loop, track, car physics,
// collision resolution, AI waypoint following, lap detection, HUD.
// No external physics engines.
// ═══════════════════════════════════════════════════════════════════════════════

"use strict";

// ─── Canvas Setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 1280;
canvas.height = 720;

// ─── DOM References ────────────────────────────────────────────────────────────
const hudPosition = document.getElementById("hud-position");
const hudLap = document.getElementById("hud-lap");
const hudTime = document.getElementById("hud-time");
const hudSpeed = document.getElementById("hud-speed");
const countdownEl = document.getElementById("countdown");
const raceResultEl = document.getElementById("race-result");
const resultText = document.getElementById("result-text");
const resultTime = document.getElementById("result-time");

// ═══════════════════════════════════════════════════════════════════════════════
// §1  DETERMINISTIC RNG  (Mulberry32)
// ═══════════════════════════════════════════════════════════════════════════════
const RNG_SEED = 42;

function mulberry32(seed) {
    let s = seed | 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let rng = mulberry32(RNG_SEED);

// ═══════════════════════════════════════════════════════════════════════════════
// §2  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const DT = 1 / 60;          // Fixed timestep (seconds)
const MAX_LAPS = 3;
const TRACK_WIDTH = 100;             // Half-width of road surface
const CAR_LENGTH = 30;
const CAR_WIDTH = 16;

// Physics tuning
const MAX_SPEED = 420;
const ACCELERATION = 280;
const BRAKE_FORCE = 380;
const REVERSE_MAX = 120;
const DRAG = 0.35;            // Linear drag coefficient
const TURN_RATE = 2.8;             // Radians/sec at moderate speed
const GRIP = 6.0;             // Lateral friction
const BOUNCE_RESTITUTION = 0.35;
const CAR_MASS = 1.0;

// AI tuning
const AI_LOOK_AHEAD = 140;
const AI_BRAKE_ANGLE = 0.7;           // rad – start braking above this
const AI_SPEED_FACTOR = 0.88;          // Slightly slower top speed than player

// ═══════════════════════════════════════════════════════════════════════════════
// §3  TRACK DEFINITION  (closed loop of waypoints)
// ═══════════════════════════════════════════════════════════════════════════════

// Waypoints form the center-line of the track, stored as {x, y}.
// The track is a closed-loop circuit rendered as a wide path.
const WAYPOINTS = [
    // Start/finish straight (top)
    { x: 300, y: 140 },
    { x: 450, y: 130 },
    { x: 600, y: 125 },
    { x: 750, y: 130 },
    // First curve (right)
    { x: 900, y: 155 },
    { x: 1000, y: 210 },
    { x: 1060, y: 290 },
    { x: 1080, y: 380 },
    // Right straight → bottom-right bend
    { x: 1060, y: 470 },
    { x: 1000, y: 540 },
    { x: 910, y: 590 },
    // Bottom straight
    { x: 780, y: 610 },
    { x: 640, y: 620 },
    { x: 500, y: 610 },
    // Bottom-left hairpin
    { x: 380, y: 580 },
    { x: 290, y: 520 },
    { x: 240, y: 440 },
    // Left chicane
    { x: 220, y: 360 },
    { x: 240, y: 280 },
    { x: 220, y: 210 },
    // Rejoining start
    { x: 200, y: 160 },
];

const NUM_WP = WAYPOINTS.length;

// Pre-compute segment lengths and cumulative distance for progress tracking
const segLengths = [];
let totalTrackLength = 0;
const cumDist = [0];

for (let i = 0; i < NUM_WP; i++) {
    const a = WAYPOINTS[i];
    const b = WAYPOINTS[(i + 1) % NUM_WP];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    segLengths.push(d);
    totalTrackLength += d;
    cumDist.push(totalTrackLength);
}

// Checkpoint at waypoint index 0 (start/finish line)
const FINISH_LINE_WP = 0;
// A "gate" midway through the track, so players can't cheat by just crossing the line
const HALFWAY_WP = Math.floor(NUM_WP / 2);

// ─── Track normals (outward-pointing perpendicular at each waypoint) ───────
function computeTrackNormals() {
    const normals = [];
    for (let i = 0; i < NUM_WP; i++) {
        const prev = WAYPOINTS[(i - 1 + NUM_WP) % NUM_WP];
        const next = WAYPOINTS[(i + 1) % NUM_WP];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        // Left-hand normal
        normals.push({ x: -dy / len, y: dx / len });
    }
    return normals;
}
const trackNormals = computeTrackNormals();

// ═══════════════════════════════════════════════════════════════════════════════
// §4  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Returns { segIndex, t, dist } — closest point on track center-line
function closestTrackPoint(px, py) {
    let bestDist = Infinity;
    let bestSeg = 0;
    let bestT = 0;
    for (let i = 0; i < NUM_WP; i++) {
        const a = WAYPOINTS[i];
        const b = WAYPOINTS[(i + 1) % NUM_WP];
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : clamp(((px - a.x) * dx + (py - a.y) * dy) / lenSq, 0, 1);
        const cx = a.x + t * dx, cy = a.y + t * dy;
        const d = Math.hypot(px - cx, py - cy);
        if (d < bestDist) { bestDist = d; bestSeg = i; bestT = t; }
    }
    return { segIndex: bestSeg, t: bestT, dist: bestDist };
}

// Total distance along the track for a position
function trackProgress(px, py) {
    const { segIndex, t } = closestTrackPoint(px, py);
    return cumDist[segIndex] + t * segLengths[segIndex];
}

// ═══════════════════════════════════════════════════════════════════════════════
// §5  CAR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class Car {
    constructor(x, y, angle, color, name, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;         // Heading (radians, 0 = right)
        this.speed = 0;             // Forward speed (px/s)
        this.vx = 0;                // Velocity components (for collision)
        this.vy = 0;
        this.color = color;
        this.name = name;
        this.isPlayer = isPlayer;

        this.width = CAR_WIDTH;
        this.length = CAR_LENGTH;
        this.mass = CAR_MASS;

        // Lap tracking
        this.lap = 0;
        this.passedHalfway = false;
        this.raceFinished = false;
        this.finishTime = 0;

        // For rendering tyre marks
        this.driftAmount = 0;
    }

    // Returns oriented bounding-box corners
    getCorners() {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        const hw = this.width / 2;
        const hl = this.length / 2;
        return [
            { x: this.x + cos * hl - sin * hw, y: this.y + sin * hl + cos * hw },
            { x: this.x + cos * hl + sin * hw, y: this.y + sin * hl - cos * hw },
            { x: this.x - cos * hl + sin * hw, y: this.y - sin * hl - cos * hw },
            { x: this.x - cos * hl - sin * hw, y: this.y - sin * hl + cos * hw },
        ];
    }

    // SAT-based AABB-ish overlap check for car-car collision
    overlaps(other) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const dist = Math.hypot(dx, dy);
        const minDist = (this.length + other.length) / 2;
        return dist < minDist;
    }

    update(throttle, brake, steer, dt) {
        // ── Acceleration / braking ────────────────────────
        if (throttle) {
            this.speed += ACCELERATION * dt;
        }
        if (brake) {
            if (this.speed > 10) {
                this.speed -= BRAKE_FORCE * dt;
            } else {
                this.speed -= ACCELERATION * 0.5 * dt;
            }
        }

        // Natural drag
        this.speed -= this.speed * DRAG * dt;

        // Speed clamping
        const maxSpd = this.isPlayer ? MAX_SPEED : MAX_SPEED * AI_SPEED_FACTOR;
        this.speed = clamp(this.speed, -REVERSE_MAX, maxSpd);

        // ── Steering ──────────────────────────────────────
        const speedFactor = clamp(Math.abs(this.speed) / 150, 0.15, 1);
        const turnAmount = steer * TURN_RATE * speedFactor * dt;
        this.angle += turnAmount;

        // ── Lateral grip (kills sideways velocity) ────────
        const forwardX = Math.cos(this.angle);
        const forwardY = Math.sin(this.angle);
        // Compute velocity from speed
        this.vx = forwardX * this.speed;
        this.vy = forwardY * this.speed;

        // Lateral component
        const latDot = -forwardY * this.vx + forwardX * this.vy;
        this.driftAmount = Math.abs(latDot);
        this.vx += forwardY * latDot * GRIP * dt;
        this.vy -= forwardX * latDot * GRIP * dt;

        // ── Position integration ──────────────────────────
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Re-derive speed from velocity (after grip adjustment)
        this.speed = forwardX * this.vx + forwardY * this.vy;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6  COLLISION RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

function resolveCarCarCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = (a.length + b.length) / 2;

    if (dist >= minDist || dist === 0) return;

    // Normalised contact direction
    const nx = dx / dist;
    const ny = dy / dist;

    // Overlap
    const overlap = minDist - dist;

    // Separate equally
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;

    // Relative velocity along contact normal
    const dvx = a.vx - b.vx;
    const dvy = a.vy - b.vy;
    const relVelNormal = dvx * nx + dvy * ny;

    // Only resolve if objects are approaching
    if (relVelNormal <= 0) return;

    // Impulse scalar
    const j = -(1 + BOUNCE_RESTITUTION) * relVelNormal / (1 / a.mass + 1 / b.mass);

    // Apply impulse
    a.vx += (j / a.mass) * nx;
    a.vy += (j / a.mass) * ny;
    b.vx -= (j / b.mass) * nx;
    b.vy -= (j / b.mass) * ny;

    // Update linear speed from new velocity
    a.speed = Math.cos(a.angle) * a.vx + Math.sin(a.angle) * a.vy;
    b.speed = Math.cos(b.angle) * b.vx + Math.sin(b.angle) * b.vy;
}

// Keep car on road — push back toward center if too far from center-line
function enforceTrackBounds(car) {
    const { segIndex, t, dist } = closestTrackPoint(car.x, car.y);
    if (dist > TRACK_WIDTH) {
        const a = WAYPOINTS[segIndex];
        const b = WAYPOINTS[(segIndex + 1) % NUM_WP];
        const cx = a.x + t * (b.x - a.x);
        const cy = a.y + t * (b.y - a.y);
        const dx = car.x - cx;
        const dy = car.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const pushBack = dist - TRACK_WIDTH + 2;
        car.x -= (dx / d) * pushBack;
        car.y -= (dy / d) * pushBack;
        // Reduce speed on wall contact
        car.speed *= 0.7;
        // Bounce velocity
        const nx = dx / d;
        const ny = dy / d;
        const velDotN = car.vx * nx + car.vy * ny;
        if (velDotN > 0) {
            car.vx -= 1.5 * velDotN * nx;
            car.vy -= 1.5 * velDotN * ny;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §7  LAP DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function updateLapDetection(car, raceTime) {
    if (car.raceFinished) return;

    const { segIndex } = closestTrackPoint(car.x, car.y);

    // Must pass the halfway point before a lap counts
    const halfLo = (HALFWAY_WP - 2 + NUM_WP) % NUM_WP;
    const halfHi = (HALFWAY_WP + 2) % NUM_WP;
    const inHalfZone = isInWaypointRange(segIndex, halfLo, halfHi);
    if (inHalfZone) {
        car.passedHalfway = true;
    }

    // Check if near the finish line
    const finLo = (FINISH_LINE_WP - 1 + NUM_WP) % NUM_WP;
    const finHi = (FINISH_LINE_WP + 1) % NUM_WP;
    const inFinishZone = isInWaypointRange(segIndex, finLo, finHi);
    if (inFinishZone && car.passedHalfway) {
        car.lap++;
        car.passedHalfway = false;
        if (car.lap >= MAX_LAPS) {
            car.raceFinished = true;
            car.finishTime = raceTime;
        }
    }
}

function isInWaypointRange(seg, lo, hi) {
    if (lo <= hi) return seg >= lo && seg <= hi;
    return seg >= lo || seg <= hi; // wraps around
}

// ═══════════════════════════════════════════════════════════════════════════════
// §8  AI CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════

function computeAI(car) {
    // Find the target waypoint ahead on the track
    const { segIndex, t } = closestTrackPoint(car.x, car.y);

    // Aim some distance ahead along the center-line
    let targetDist = trackProgress(car.x, car.y) + AI_LOOK_AHEAD;
    if (targetDist >= totalTrackLength) targetDist -= totalTrackLength;

    // Convert distance back to a point
    let remaining = targetDist;
    let wpIdx = 0;
    for (let i = 0; i < NUM_WP; i++) {
        if (remaining <= segLengths[i]) {
            wpIdx = i;
            break;
        }
        remaining -= segLengths[i];
    }
    const frac = segLengths[wpIdx] > 0 ? remaining / segLengths[wpIdx] : 0;
    const wa = WAYPOINTS[wpIdx];
    const wb = WAYPOINTS[(wpIdx + 1) % NUM_WP];
    const tx = lerp(wa.x, wb.x, frac);
    const ty = lerp(wa.y, wb.y, frac);

    // Steering toward target
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = angleDiff(car.angle, desired);

    let steer = clamp(diff * 3.0, -1, 1);

    // Throttle / brake logic
    let throttle = true;
    let brake = false;

    // Look further ahead for upcoming sharp curves
    let futureIdx = (wpIdx + 3) % NUM_WP;
    const futurePt = WAYPOINTS[futureIdx];
    const futureAngle = Math.atan2(futurePt.y - car.y, futurePt.x - car.x);
    const futureDiff = Math.abs(angleDiff(car.angle, futureAngle));

    if (futureDiff > AI_BRAKE_ANGLE && Math.abs(car.speed) > 180) {
        throttle = false;
        brake = true;
    }

    // Gentle speed variations per AI (seeded)
    return { throttle, brake, steer };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §9  RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function drawTrack() {
    // ── Road surface ────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
    for (let i = 1; i <= NUM_WP; i++) {
        const wp = WAYPOINTS[i % NUM_WP];
        ctx.lineTo(wp.x, wp.y);
    }
    ctx.closePath();
    ctx.lineWidth = TRACK_WIDTH * 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2a2a35";
    ctx.stroke();

    // ── Road edge markings (outer) ──────────────────────
    ctx.lineWidth = TRACK_WIDTH * 2 + 6;
    ctx.strokeStyle = "#444460";
    ctx.stroke();

    // ── Center-line dashes ──────────────────────────────
    ctx.setLineDash([12, 18]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Track edge curbs (alternating red/white) ────────
    drawCurbs();

    // ── Start/finish line ───────────────────────────────
    drawFinishLine();
}

function drawCurbs() {
    const curbWidth = 8;
    // Outer edge
    for (let i = 0; i < NUM_WP; i++) {
        const a = WAYPOINTS[i];
        const b = WAYPOINTS[(i + 1) % NUM_WP];
        const na = trackNormals[i];
        const nb = trackNormals[(i + 1) % NUM_WP];

        const segments = 6;
        for (let s = 0; s < segments; s++) {
            const t0 = s / segments;
            const t1 = (s + 1) / segments;
            const isRed = s % 2 === 0;

            ctx.beginPath();
            // Outer curb
            const ox0 = lerp(a.x, b.x, t0) + lerp(na.x, nb.x, t0) * TRACK_WIDTH;
            const oy0 = lerp(a.y, b.y, t0) + lerp(na.y, nb.y, t0) * TRACK_WIDTH;
            const ox1 = lerp(a.x, b.x, t1) + lerp(na.x, nb.x, t1) * TRACK_WIDTH;
            const oy1 = lerp(a.y, b.y, t1) + lerp(na.y, nb.y, t1) * TRACK_WIDTH;

            ctx.moveTo(ox0, oy0);
            ctx.lineTo(ox1, oy1);
            ctx.lineWidth = curbWidth;
            ctx.strokeStyle = isRed ? "#e6303088" : "#ffffff44";
            ctx.stroke();

            // Inner curb
            const ix0 = lerp(a.x, b.x, t0) - lerp(na.x, nb.x, t0) * TRACK_WIDTH;
            const iy0 = lerp(a.y, b.y, t0) - lerp(na.y, nb.y, t0) * TRACK_WIDTH;
            const ix1 = lerp(a.x, b.x, t1) - lerp(na.x, nb.x, t1) * TRACK_WIDTH;
            const iy1 = lerp(a.y, b.y, t1) - lerp(na.y, nb.y, t1) * TRACK_WIDTH;

            ctx.beginPath();
            ctx.moveTo(ix0, iy0);
            ctx.lineTo(ix1, iy1);
            ctx.stroke();
        }
    }
}

function drawFinishLine() {
    const wp = WAYPOINTS[FINISH_LINE_WP];
    const n = trackNormals[FINISH_LINE_WP];

    const x1 = wp.x + n.x * TRACK_WIDTH * 0.85;
    const y1 = wp.y + n.y * TRACK_WIDTH * 0.85;
    const x2 = wp.x - n.x * TRACK_WIDTH * 0.85;
    const y2 = wp.y - n.y * TRACK_WIDTH * 0.85;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    const hl = car.length / 2;
    const hw = car.width / 2;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(-hl + 2, -hw + 2, car.length, car.width);

    // Body
    ctx.fillStyle = car.color;
    ctx.fillRect(-hl, -hw, car.length, car.width);

    // Windshield
    ctx.fillStyle = "rgba(100,200,255,0.4)";
    ctx.fillRect(hl * 0.1, -hw + 2, hl * 0.45, car.width - 4);

    // Nose accent
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(hl * 0.6, -hw + 1, hl * 0.35, car.width - 2);

    // Tail lights
    ctx.fillStyle = "#ff3030";
    ctx.fillRect(-hl, -hw, 3, 5);
    ctx.fillRect(-hl, hw - 5, 3, 5);

    // Headlights
    ctx.fillStyle = "#ffee80";
    ctx.fillRect(hl - 3, -hw + 1, 3, 4);
    ctx.fillRect(hl - 3, hw - 5, 3, 4);

    ctx.restore();

    // Name label (AI only)
    if (!car.isPlayer) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "10px 'Rajdhani', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(car.name, car.x, car.y - car.width - 4);
    }
}

// ── Background grass + decorative elements ────────────────────────────────────
function drawBackground() {
    // Grass-green fill
    ctx.fillStyle = "#1a2816";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid pattern
    ctx.strokeStyle = "rgba(40, 60, 35, 0.3)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function drawMinimap(cars) {
    const mapW = 160, mapH = 90;
    const mx = canvas.width - mapW - 12;
    const my = canvas.height - mapH - 12;
    const scaleX = mapW / canvas.width;
    const scaleY = mapH / canvas.height;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "rgba(0,5,0,0.65)";
    ctx.strokeStyle = "rgba(0,255,160,0.3)";
    ctx.lineWidth = 1;
    ctx.fillRect(mx, my, mapW, mapH);
    ctx.strokeRect(mx, my, mapW, mapH);

    // Track outline
    ctx.beginPath();
    ctx.moveTo(mx + WAYPOINTS[0].x * scaleX, my + WAYPOINTS[0].y * scaleY);
    for (let i = 1; i <= NUM_WP; i++) {
        const wp = WAYPOINTS[i % NUM_WP];
        ctx.lineTo(mx + wp.x * scaleX, my + wp.y * scaleY);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(100,255,180,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Cars
    for (const car of cars) {
        ctx.fillStyle = car.isPlayer ? "#fff" : car.color;
        ctx.beginPath();
        ctx.arc(mx + car.x * scaleX, my + car.y * scaleY, car.isPlayer ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════════
// §10  GAME STATE
// ═══════════════════════════════════════════════════════════════════════════════

const COLORS = ["#00ccff", "#ff4444", "#44dd44", "#ffaa22"];
const AI_NAMES = ["Blaze", "Viper", "Ghost"];

let playerCar;
let aiCars = [];
let allCars = [];
let raceTime = 0;
let raceStarted = false;
let raceOver = false;
let countdownTimer = 0;
let countdownPhase = 0; // 0 = not started, 1-3 = counting, 4 = GO

// ─── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener("keydown", e => { keys[e.key] = true; e.preventDefault(); });
window.addEventListener("keyup", e => { keys[e.key] = false; });

// ═══════════════════════════════════════════════════════════════════════════════
// §11  INIT / RESET
// ═══════════════════════════════════════════════════════════════════════════════

function initRace() {
    rng = mulberry32(RNG_SEED); // Reset RNG for determinism

    // Place cars on the start/finish straight, staggered
    const startWP = WAYPOINTS[FINISH_LINE_WP];
    const nextWP = WAYPOINTS[(FINISH_LINE_WP + 1) % NUM_WP];
    const startAngle = Math.atan2(nextWP.y - startWP.y, nextWP.x - startWP.x);
    const n = trackNormals[FINISH_LINE_WP];

    // Stagger positions: 2×2 grid behind the start line
    const staggerPositions = [
        { along: -10, across: 25 },  // Player
        { along: -50, across: -25 },  // AI 1
        { along: -90, across: 25 },  // AI 2
        { along: -130, across: -25 },  // AI 3
    ];

    const fwd = { x: Math.cos(startAngle), y: Math.sin(startAngle) };

    playerCar = new Car(
        startWP.x + fwd.x * staggerPositions[0].along + n.x * staggerPositions[0].across,
        startWP.y + fwd.y * staggerPositions[0].along + n.y * staggerPositions[0].across,
        startAngle, COLORS[0], "You", true
    );

    aiCars = [];
    for (let i = 0; i < 3; i++) {
        const p = staggerPositions[i + 1];
        const ai = new Car(
            startWP.x + fwd.x * p.along + n.x * p.across,
            startWP.y + fwd.y * p.along + n.y * p.across,
            startAngle, COLORS[i + 1], AI_NAMES[i]
        );
        aiCars.push(ai);
    }

    allCars = [playerCar, ...aiCars];
    raceTime = 0;
    raceStarted = false;
    raceOver = false;
    countdownTimer = 0;
    countdownPhase = 0;

    raceResultEl.classList.add("hidden");
    countdownEl.classList.remove("hidden");
}

// ═══════════════════════════════════════════════════════════════════════════════
// §12  MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════════

let lastTime = 0;
let accumulator = 0;

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    // Convert to seconds
    const frameTime = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    accumulator += frameTime;

    // Fixed-timestep physics updates
    while (accumulator >= DT) {
        accumulator -= DT;
        fixedUpdate(DT);
    }

    render();
}

function fixedUpdate(dt) {
    // ── Countdown phase ─────────────────────────────────
    if (!raceStarted) {
        countdownTimer += dt;
        const phase = Math.floor(countdownTimer);
        if (phase !== countdownPhase && phase <= 4) {
            countdownPhase = phase;
            if (phase < 3) {
                countdownEl.textContent = 3 - phase;
                countdownEl.classList.remove("go");
            } else if (phase === 3) {
                countdownEl.textContent = "GO!";
                countdownEl.classList.add("go");
                raceStarted = true;
            }
        }
        if (phase >= 4) {
            countdownEl.classList.add("hidden");
        }
        return;
    }

    if (raceOver) return;

    raceTime += dt;

    // ── Player input ────────────────────────────────────
    const throttle = keys["ArrowUp"] || keys["w"] || keys["W"];
    const brake = keys["ArrowDown"] || keys["s"] || keys["S"];
    let steer = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) steer -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) steer += 1;

    playerCar.update(throttle, brake, steer, dt);

    // ── AI updates ──────────────────────────────────────
    for (const ai of aiCars) {
        const cmd = computeAI(ai);
        ai.update(cmd.throttle, cmd.brake, cmd.steer, dt);
    }

    // ── Collision resolution ────────────────────────────
    for (let i = 0; i < allCars.length; i++) {
        for (let j = i + 1; j < allCars.length; j++) {
            resolveCarCarCollision(allCars[i], allCars[j]);
        }
    }

    // ── Track bounds enforcement ────────────────────────
    for (const car of allCars) {
        enforceTrackBounds(car);
    }

    // ── Lap detection ───────────────────────────────────
    for (const car of allCars) {
        updateLapDetection(car, raceTime);
    }

    // ── Check race end ──────────────────────────────────
    if (playerCar.raceFinished && !raceOver) {
        raceOver = true;
        showFinish();
    }
    // If player hasn't finished but all AI have, keep racing
    // (player must cross the finish line to end the race)
}

function showFinish() {
    raceResultEl.classList.remove("hidden");
    const pos = getPosition(playerCar);
    const suffix = pos === 1 ? "st" : pos === 2 ? "nd" : pos === 3 ? "rd" : "th";
    resultText.textContent = `${pos}${suffix} PLACE`;
    resultTime.textContent = `Time: ${formatTime(playerCar.raceFinished ? playerCar.finishTime : raceTime)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §13  POSITION & HUD HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function raceProgress(car) {
    // Total progress = completed laps × track length + current progress
    return car.lap * totalTrackLength + trackProgress(car.x, car.y);
}

function getPosition(targetCar) {
    const targetProg = raceProgress(targetCar);
    let pos = 1;
    for (const car of allCars) {
        if (car === targetCar) continue;
        if (raceProgress(car) > targetProg) pos++;
    }
    return pos;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs.toFixed(2)}`;
}

function updateHUD() {
    const pos = getPosition(playerCar);
    const suffix = pos === 1 ? "st" : pos === 2 ? "nd" : pos === 3 ? "rd" : "th";
    hudPosition.textContent = `POS: ${pos}${suffix}`;

    const currentLap = Math.min(playerCar.lap + 1, MAX_LAPS);
    hudLap.textContent = `LAP: ${currentLap}/${MAX_LAPS}`;

    hudTime.textContent = `TIME: ${formatTime(raceTime)}`;

    const speedKmh = Math.abs(playerCar.speed * 0.6).toFixed(0);
    hudSpeed.textContent = `${speedKmh} km/h`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §14  RENDER
// ═══════════════════════════════════════════════════════════════════════════════

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawTrack();

    // Draw cars (render player on top)
    for (const ai of aiCars) drawCar(ai);
    drawCar(playerCar);

    drawMinimap(allCars);
    updateHUD();
}

// ═══════════════════════════════════════════════════════════════════════════════
// §15  RESTART HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener("keydown", e => {
    if (e.key === "Enter" && raceOver) {
        initRace();
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// §16  START
// ═══════════════════════════════════════════════════════════════════════════════

initRace();
requestAnimationFrame(gameLoop);
