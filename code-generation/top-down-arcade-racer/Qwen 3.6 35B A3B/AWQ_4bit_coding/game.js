/**
 * Top-Down Arcade Racer
 * A complete 2D racing game with AI opponents, collision detection,
 * lap detection, and fixed timestep game loop.
 */

// ============================================================
// 1. DETERMINISTIC RNG - Mulberry32 Seeded PRNG
// ============================================================
class SeededRNG {
    /**
     * Creates a new seeded random number generator
     * @param {number} seed - The seed value for reproducibility
     */
    constructor(seed = 42) {
        this.seed = seed;
    }

    /**
     * Generates a random float between 0 (inclusive) and 1 (exclusive)
     * @returns {number} Random float in [0, 1)
     */
    next() {
        let t = (this.seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Generates a random integer between min (inclusive) and max (exclusive)
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (exclusive)
     * @returns {number} Random integer in [min, max)
     */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min)) + min;
    }

    /**
     * Generates a random value within a range with bias toward center
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {number} bias - Bias toward center (0 = uniform, 1 = normal-like)
     * @returns {number} Random value
     */
    nextBiased(min, max, bias = 0.5) {
        if (bias <= 0) return this.next() * (max - min) + min;
        // Use sum of randoms for bell-curve distribution
        let sum = 0;
        const rolls = Math.max(2, Math.floor(bias * 6));
        for (let i = 0; i < rolls; i++) {
            sum += this.next();
        }
        const avg = sum / rolls;
        return avg * (max - min) + min;
    }
}

// Global RNG instance with configurable seed
const gameRNG = new SeededRNG(12345);

// ============================================================
// 2. INPUT HANDLER
// ============================================================
class InputHandler {
    constructor() {
        this.keys = {};
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;
            
            // Prevent scrolling with arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });
    }

    /**
     * Gets the acceleration input (-1 to 1)
     * @returns {number} Acceleration value
     */
    getAcceleration() {
        if (this.keys['arrowup'] || this.keys['w']) return 1;
        if (this.keys['arrowdown'] || this.keys['s']) return -1;
        return 0;
    }

    /**
     * Gets the steering input (-1 to 1)
     * @returns {number} Steering value (-1 = left, 1 = right)
     */
    getSteering() {
        if (this.keys['arrowleft'] || this.keys['a']) return -1;
        if (this.keys['arrowright'] || this.keys['d']) return 1;
        return 0;
    }

    /**
     * Checks if a specific key is pressed
     * @param {string} key - The key to check
     * @returns {boolean}
     */
    isPressed(key) {
        return this.keys[key.toLowerCase()] || this.keys[key];
    }
}

// ============================================================
// 3. VECTOR MATH UTILITIES
// ============================================================
const Vec2 = {
    /** Distance between two points */
    dist: (a, b) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2),

    /** Squared distance (avoids sqrt for performance) */
    distSq: (a, b) => (b.x - a.x) ** 2 + (b.y - a.y) ** 2,

    /** Vector subtraction */
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),

    /** Vector addition */
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),

    /** Scalar multiplication */
    mul: (v, s) => ({ x: v.x * s, y: v.y * s }),

    /** Dot product */
    dot: (a, b) => a.x * b.x + a.y * b.y,

    /** Cross product (2D returns scalar) */
    cross: (a, b) => a.x * b.y - a.y * b.x,

    /** Normalize vector, returns {x, y, length} */
    normalize: (v) => {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        if (len === 0) return { x: 0, y: 0, length: 0 };
        return { x: v.x / len, y: v.y / len, length: len };
    },

    /** Angle of vector in radians */
    angle: (v) => Math.atan2(v.y, v.x),

    /** Rotate vector by angle (radians) */
    rotate: (v, angle) => ({
        x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
        y: v.x * Math.sin(angle) + v.y * Math.cos(angle)
    }),

    /** Distance from point to line segment, returns closest point */
    closestPointOnSegment: (p, a, b) => {
        const ab = Vec2.sub(b, a);
        const ap = Vec2.sub(p, a);
        const lenSq = Vec2.dot(ab, ab);
        if (lenSq === 0) return a;
        let t = Vec2.dot(ap, ab) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Vec2.add(a, Vec2.mul(ab, t));
    }
};

// ============================================================
// 4. TRACK & WAYPOINT SYSTEM
// ============================================================
class Track {
    constructor() {
        this.waypoints = this.createTrack();
        this.trackWidth = 120;
        this.outerEdge = [];
        this.innerEdge = [];
        this.computeEdges();
        this.startLinePos = this.waypoints[0];
        this.startLineAngle = this.getWaypointAngle(0);
    }

    /**
     * Creates a closed-loop race track with waypoints
     * Track features: straights, gentle curves, and sharp turns
     * @returns {Array<{x: number, y: number}>} Waypoint array
     */
    createTrack() {
        // Define a varied race track with interesting geometry
        const waypoints = [
            // Start/finish straight (bottom)
            { x: 400, y: 700 },
            { x: 800, y: 700 },
            { x: 1200, y: 700 },
            
            // Gentle right curve
            { x: 1400, y: 650 },
            { x: 1500, y: 550 },
            
            // Long straight up the right side
            { x: 1550, y: 400 },
            { x: 1550, y: 250 },
            
            // Sharp left turn
            { x: 1450, y: 150 },
            { x: 1300, y: 100 },
            
            // Top straight
            { x: 1100, y: 100 },
            { x: 900, y: 100 },
            
            // Gentle left curve
            { x: 750, y: 120 },
            { x: 650, y: 180 },
            
            // Middle section - figure-eight-like element
            { x: 550, y: 280 },
            { x: 500, y: 400 },
            
            // Sharp right turn
            { x: 520, y: 520 },
            { x: 600, y: 600 },
            
            // Back to start area
            { x: 700, y: 680 },
        ];

        // Smooth the waypoints using Catmull-Rom spline interpolation
        return this.smoothTrack(waypoints, 10);
    }

    /**
     * Smooths track waypoints using Catmull-Rom spline
     * @param {Array} points - Original waypoints
     * @param {number} segments - Interpolation segments per curve
     * @returns {Array} Smoothed waypoints
     */
    smoothTrack(points, segments) {
        const smoothed = [];
        const n = points.length;

        for (let i = 0; i < n; i++) {
            const p0 = points[(i - 1 + n) % n];
            const p1 = points[i];
            const p2 = points[(i + 1) % n];
            const p3 = points[(i + 2) % n];

            for (let j = 0; j < segments; j++) {
                const t = j / segments;
                const t2 = t * t;
                const t3 = t2 * t;

                const x = 0.5 * (
                    (2 * p1.x) +
                    (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
                );

                const y = 0.5 * (
                    (2 * p1.y) +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
                );

                smoothed.push({ x, y });
            }
        }

        return smoothed;
    }

    /**
     * Computes inner and outer track edges from waypoints
     */
    computeEdges() {
        const halfWidth = this.trackWidth / 2;
        this.outerEdge = [];
        this.innerEdge = [];

        for (let i = 0; i < this.waypoints.length; i++) {
            const prev = this.waypoints[(i - 1 + this.waypoints.length) % this.waypoints.length];
            const next = this.waypoints[(i + 1) % this.waypoints.length];
            
            // Calculate normal direction
            const dir = Vec2.normalize(Vec2.sub(next, prev));
            const normal = { x: -dir.y, y: dir.x };

            const center = this.waypoints[i];
            this.outerEdge.push({
                x: center.x + normal.x * halfWidth,
                y: center.y + normal.y * halfWidth
            });
            this.innerEdge.push({
                x: center.x - normal.x * halfWidth,
                y: center.y - normal.y * halfWidth
            });
        }
    }

    /**
     * Gets the angle between two consecutive waypoints
     * @param {number} index - Waypoint index
     * @returns {number} Angle in radians
     */
    getWaypointAngle(index) {
        const next = this.waypoints[(index + 1) % this.waypoints.length];
        const current = this.waypoints[index];
        return Math.atan2(next.y - current.y, next.x - current.x);
    }

    /**
     * Checks if a point is on the track
     * @param {{x: number, y: number}} point - Point to check
     * @returns {boolean} True if point is on track
     */
    isPointOnTrack(point) {
        // Check distance to nearest waypoint
        let minDist = Infinity;
        for (let i = 0; i < this.waypoints.length; i += 3) { // Sample for performance
            const dist = Vec2.dist(point, this.waypoints[i]);
            if (dist < minDist) minDist = dist;
        }
        return minDist < this.trackWidth / 2;
    }

    /**
     * Finds the nearest waypoint index to a point
     * @param {{x: number, y: number}} point - Point to check
     * @returns {number} Nearest waypoint index
     */
    findNearestWaypoint(point) {
        let minDist = Infinity;
        let nearestIndex = 0;
        
        for (let i = 0; i < this.waypoints.length; i += 2) { // Sample for performance
            const dist = Vec2.distSq(point, this.waypoints[i]);
            if (dist < minDist) {
                minDist = dist;
                nearestIndex = i;
            }
        }
        return nearestIndex;
    }

    /**
     * Draws the track on the canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    draw(ctx) {
        // Draw grass/background
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw track border (outer edge)
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(this.outerEdge[0].x, this.outerEdge[0].y);
        for (let i = 1; i < this.outerEdge.length; i++) {
            ctx.lineTo(this.outerEdge[i].x, this.outerEdge[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw track border (inner edge)
        ctx.beginPath();
        ctx.moveTo(this.innerEdge[0].x, this.innerEdge[0].y);
        for (let i = 1; i < this.innerEdge.length; i++) {
            ctx.lineTo(this.innerEdge[i].x, this.innerEdge[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw track surface
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = this.trackWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
        for (let i = 1; i < this.waypoints.length; i++) {
            ctx.lineTo(this.waypoints[i].x, this.waypoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw center line (dashed)
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
        for (let i = 1; i < this.waypoints.length; i++) {
            ctx.lineTo(this.waypoints[i].x, this.waypoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw start/finish line
        this.drawStartLine(ctx);
    }

    /**
     * Draws the start/finish line
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawStartLine(ctx) {
        const wp = this.waypoints[0];
        const angle = this.startLineAngle + Math.PI / 2;
        const halfWidth = this.trackWidth / 2;

        const x1 = wp.x + Math.cos(angle) * halfWidth;
        const y1 = wp.y + Math.sin(angle) * halfWidth;
        const x2 = wp.x - Math.cos(angle) * halfWidth;
        const y2 = wp.y - Math.sin(angle) * halfWidth;

        // Checkered pattern
        const segments = 8;
        const segLength = this.trackWidth / segments;

        for (let i = 0; i < segments; i++) {
            const t1 = i / segments;
            const t2 = (i + 1) / segments;
            
            ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : '#000000';
            ctx.lineWidth = 4;
            
            const px1 = x1 + (x2 - x1) * t1;
            const py1 = y1 + (y2 - y1) * t1;
            const px2 = x1 + (x2 - x1) * t2;
            const py2 = y1 + (y2 - y1) * t2;
            
            ctx.beginPath();
            ctx.moveTo(px1, py1);
            ctx.lineTo(px2, py2);
            ctx.stroke();
        }
    }

    /**
     * Draws debug view showing waypoints
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawDebug(ctx) {
        // Draw waypoints
        ctx.fillStyle = '#ffff00';
        for (let i = 0; i < this.waypoints.length; i += 10) {
            ctx.beginPath();
            ctx.arc(this.waypoints[i].x, this.waypoints[i].y, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw waypoint numbers
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        for (let i = 0; i < this.waypoints.length; i += 50) {
            ctx.fillText(i, this.waypoints[i].x + 8, this.waypoints[i].y - 8);
        }
    }
}

// ============================================================
// 5. CAR CLASS - Physics, Rendering, Collision
// ============================================================
class Car {
    /**
     * Creates a new car
     * @param {number} x - Initial x position
     * @param {number} y - Initial y position
     * @param {number} angle - Initial angle (radians)
     * @param {string} color - Car color
     * @param {string} name - Car name
     * @param {boolean} isPlayer - Is this the player car?
     * @param {object} performance - Performance characteristics
     */
    constructor(x, y, angle, color, name, isPlayer = false, performance = {}) {
        // Position
        this.x = x;
        this.y = y;
        
        // Velocity
        this.vx = 0;
        this.vy = 0;
        
        // Rotation and angular velocity
        this.angle = angle;
        this.angularVelocity = 0;
        
        // Physical properties
        this.width = 24;
        this.height = 40;
        this.radius = 18; // For collision detection
        this.mass = 1.0;
        
        // Performance characteristics (AI variation)
        this.maxSpeed = performance.maxSpeed || 350; // pixels per second
        this.acceleration = performance.acceleration || 200;
        this.turnSpeed = performance.turnSpeed || 3.5; // radians per second at max speed
        this.grip = performance.grip || 0.92; // How quickly lateral velocity decays (0-1)
        
        // Visual
        this.color = color;
        this.name = name;
        this.isPlayer = isPlayer;
        
        // Lap tracking
        this.currentWaypoint = 0;
        this.lap = 0;
        this.waypointsVisited = new Set();
        this.lastLapTime = 0;
        this.totalTime = 0;
        this.lapStartTime = 0;
        this.raceStartTime = 0;
        this.raceFinished = false;
        this.finishTime = 0;
        
        // Input (player only)
        this.throttle = 0;
        this.steer = 0;
        
        // Visual effects
        this.skidMarks = [];
        this.currentSkidStrength = 0;
    }

    /**
     * Updates car physics
     * @param {number} dt - Delta time in seconds
     * @param {Track} track - The race track
     * @param {Car[]} otherCars - Other cars for collision
     */
    update(dt, track, otherCars = []) {
        if (this.raceFinished) return;

        // Apply input (player) or AI control
        if (this.isPlayer) {
            this.throttle = 0;
            this.steer = 0;
        }
        // AI controls are set by the AI controller before update

        // Calculate speed magnitude
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        // Calculate direction car is facing
        const forwardX = Math.cos(this.angle);
        const forwardY = Math.sin(this.angle);

        // Decompose velocity into forward and lateral components
        const forwardSpeed = this.vx * forwardX + this.vy * forwardY;
        const lateralSpeed = this.vx * (-forwardY) + this.vy * forwardX;

        // Apply throttle/brake acceleration
        if (this.throttle !== 0) {
            const accelX = forwardX * this.throttle * this.acceleration;
            const accelY = forwardY * this.throttle * this.acceleration;
            this.vx += accelX * dt;
            this.vy += accelY * dt;
        }

        // Apply steering (affects rotation based on speed)
        if (this.steer !== 0 && speed > 10) {
            // Reverse steering at low speeds for realism
            const steerFactor = this.steer * this.turnSpeed * Math.min(speed / 100, 1);
            // Reverse direction when going backward
            const direction = forwardSpeed > 0 ? 1 : -1;
            this.angle += steerFactor * dt * direction;
        }

        // Apply grip (lateral friction - prevents sliding)
        const newLateralSpeed = lateralSpeed * this.grip;
        
        // Recombine velocity
        this.vx = forwardX * forwardSpeed + (-forwardY) * newLateralSpeed;
        this.vy = forwardY * forwardSpeed + forwardX * newLateralSpeed;

        // Apply drag/rolling resistance
        const dragFactor = 0.995; // Slight air resistance
        this.vx *= dragFactor;
        this.vy *= dragFactor;

        // Clamp speed
        const newSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (newSpeed > this.maxSpeed) {
            const scale = this.maxSpeed / newSpeed;
            this.vx *= scale;
            this.vy *= scale;
        }

        // Update position
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Track boundary collision
        this.handleTrackCollision(track);

        // Car-to-car collisions
        for (const other of otherCars) {
            if (other !== this) {
                this.handleCarCollision(other);
            }
        }

        // Update skid marks
        this.updateSkids(speed, forwardX, forwardY);

        // Update lap tracking
        this.updateLapTracking(track);
    }

    /**
     * Handles collision with track boundaries
     * @param {Track} track - The race track
     */
    handleTrackCollision(track) {
        // Find nearest waypoint
        const nearestIdx = track.findNearestWaypoint({ x: this.x, y: this.y });
        
        // Check if on track
        if (!track.isPointOnTrack({ x: this.x, y: this.y })) {
            // Get direction toward track center
            const trackCenter = track.waypoints[nearestIdx];
            const toCenter = Vec2.normalize(Vec2.sub(trackCenter, { x: this.x, y: this.y }));
            
            // Push car back onto track and reflect velocity
            const overlap = track.trackWidth / 2 - Vec2.dist({ x: this.x, y: this.y }, trackCenter);
            
            if (overlap > 0) {
                this.x += toCenter.x * overlap;
                this.y += toCenter.y * overlap;
            }
            
            // Reflect velocity (damped)
            const normal = toCenter;
            const velDotNormal = this.vx * normal.x + this.vy * normal.y;
            
            if (velDotNormal < 0) {
                this.vx -= 1.5 * velDotNormal * normal.x;
                this.vy -= 1.5 * velDotNormal * normal.y;
                
                // Add some energy loss
                this.vx *= 0.7;
                this.vy *= 0.7;
            }
        }
    }

    /**
     * Handles collision with another car using impulse-based resolution
     * @param {Car} other - The other car
     */
    handleCarCollision(other) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = this.radius + other.radius;

        if (dist < minDist && dist > 0) {
            // Collision normal
            const nx = dx / dist;
            const ny = dy / dist;

            // Relative velocity
            const dvx = other.vx - this.vx;
            const dvy = other.vy - this.vy;
            
            // Relative velocity along normal
            const dVn = dvx * nx + dvy * ny;

            // Don't resolve if cars are moving apart
            if (dVn > 0) return;

            // Impulse scalar (elastic collision with some damping)
            const restitution = 0.8;
            const impulse = -(1 + restitution) * dVn / (1 / this.mass + 1 / other.mass);

            // Apply impulse to both cars
            this.vx -= (impulse / this.mass) * nx * 0.5;
            this.vy -= (impulse / this.mass) * ny * 0.5;
            other.vx += (impulse / other.mass) * nx * 0.5;
            other.vy += (impulse / other.mass) * ny * 0.5;

            // Separate overlapping cars
            const overlap = minDist - dist;
            const totalMass = this.mass + other.mass;
            const sepX = (overlap * nx * other.mass) / totalMass;
            const sepY = (overlap * ny * other.mass) / totalMass;
            
            this.x -= sepX;
            this.y -= sepY;
            other.x += sepX;
            other.y += sepY;
        }
    }

    /**
     * Updates skid marks when turning hard
     * @param {number} speed - Current speed
     * @param {number} forwardX - Forward vector x
     * @param {number} forwardY - Forward vector y
     */
    updateSkids(speed, forwardX, forwardY) {
        // Calculate lateral force
        const lateralSpeed = Math.abs(
            this.vx * (-forwardY) + this.vy * forwardX
        );
        
        this.currentSkidStrength = Math.min(lateralSpeed / 100, 1);

        if (this.currentSkidStrength > 0.3 && speed > 50) {
            // Add skid marks at rear wheels
            const rearOffset = -15;
            const wheelOffsets = [8, -8]; // Left and right
            
            for (const offset of wheelOffsets) {
                const wheelPos = {
                    x: this.x + forwardX * rearOffset + (-forwardY) * offset,
                    y: this.y + forwardY * rearOffset + forwardX * offset
                };
                
                this.skidMarks.push({
                    x: wheelPos.x,
                    y: wheelPos.y,
                    alpha: this.currentSkidStrength * 0.5,
                    age: 0
                });
            }
        }

        // Age skid marks
        for (let i = this.skidMarks.length - 1; i >= 0; i--) {
            this.skidMarks[i].age++;
            if (this.skidMarks[i].age > 100) {
                this.skidMarks.splice(i, 1);
            }
        }

        // Limit skid marks
        if (this.skidMarks.length > 500) {
            this.skidMarks.splice(0, this.skidMarks.length - 500);
        }
    }

    /**
     * Updates lap tracking based on waypoint progress
     * @param {Track} track - The race track
     */
    updateLapTracking(track) {
        const totalWaypoints = track.waypoints.length;
        const sampleInterval = Math.floor(totalWaypoints / 50); // Sample 50 points

        // Find nearest waypoint
        let nearestIdx = 0;
        let minDist = Infinity;
        
        for (let i = 0; i < totalWaypoints; i += sampleInterval) {
            const dist = Vec2.distSq({ x: this.x, y: this.y }, track.waypoints[i]);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }

        // Check if we've visited enough waypoints to count a lap
        const waypointsAhead = 100;
        const expectedNext = (this.currentWaypoint + 1) % totalWaypoints;
        
        // Handle wrapping - check if we're near waypoint 0 after being near the end
        let isNext = false;
        if (nearestIdx === expectedNext) {
            isNext = true;
        } else if (expectedNext === 0 && nearestIdx > totalWaypoints - waypointsAhead) {
            // Near the end, next should be 0
            isNext = true;
        } else if (this.currentWaypoint > totalWaypoints - waypointsAhead && nearestIdx < waypointsAhead) {
            // Passed the "wrap point", counted as reaching waypoint 0
            isNext = true;
        }

        if (isNext) {
            this.waypointsVisited.add(this.currentWaypoint);
            this.currentWaypoint = expectedNext;

            // Check if all waypoints have been visited (lap complete)
            if (this.waypointsVisited.size >= 40) { // At least 40% of track
                this.lap++;
                this.lastLapTime = performance.now() - this.lapStartTime;
                this.lapStartTime = performance.now();
                this.waypointsVisited.clear();
                this.currentWaypoint = 0;

                // Check race finish
                if (this.totalLaps && this.lap >= this.totalLaps) {
                    this.raceFinished = true;
                    this.finishTime = performance.now() - this.raceStartTime;
                }
            }
        }
    }

    /**
     * Draws the car on the canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    draw(ctx) {
        // Draw skid marks first
        if (this.skidMarks.length > 0) {
            for (const mark of this.skidMarks) {
                ctx.fillStyle = `rgba(30, 30, 30, ${mark.alpha * (1 - mark.age / 100)})`;
                ctx.beginPath();
                ctx.arc(mark.x, mark.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Save context and apply transform
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(-this.width / 2 + 3, -this.height / 2 + 3, this.width, this.height);

        // Draw car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Draw car outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Draw windshield
        ctx.fillStyle = '#333';
        ctx.fillRect(-this.width / 2 + 3, -this.height / 4, this.width - 6, this.height / 5);

        // Draw front indicator (direction)
        ctx.fillStyle = this.isPlayer ? '#ffff00' : '#ff6600';
        ctx.fillRect(-this.width / 2 + 2, -this.height / 2, 6, 4);
        ctx.fillRect(this.width / 2 - 8, -this.height / 2, 6, 4);

        // Draw rear lights
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-this.width / 2 + 2, this.height / 2 - 4, 6, 4);
        ctx.fillRect(this.width / 2 - 8, this.height / 2 - 4, 6, 4);

        // Draw number/name
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.isPlayer ? '1' : '', 0, 5);

        ctx.restore();

        // Draw name above car (not rotated)
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.name, this.x, this.y - this.height / 2 - 8);
        ctx.fillText(this.name, this.x, this.y - this.height / 2 - 8);
    }
}

// ============================================================
// 6. AI CONTROLLER - Waypoint Following
// ============================================================
class AIController {
    constructor(car, track, rng) {
        this.car = car;
        this.track = track;
        this.rng = rng;
        
        // AI personality traits
        this.aggressiveness = rng.nextBiased(0.3, 0.8, 0.5);
        this.racingLineOffset = rng.nextBiased(-20, 20, 0.5); // Offset from center of track
        this.consistency = rng.nextBiased(0.7, 1.0, 0.8);
        
        // Target speed varies with track conditions
        this.targetSpeed = car.maxSpeed * this.rng.nextBiased(0.85, 0.98, 0.7);
        
        // Current target waypoint
        this.targetWaypoint = 0;
    }

    /**
     * Updates AI decision making
     * @param {Track} track - The race track
     */
    update(track) {
        const car = this.car;
        
        // Find target waypoint
        const nearestIdx = track.findNearestWaypoint({ x: car.x, y: car.y });
        
        // Target is some waypoints ahead based on speed
        const lookAhead = Math.floor(5 + (car.maxSpeed / this.targetSpeed) * 10);
        this.targetWaypoint = (nearestIdx + lookAhead) % track.waypoints.length;
        
        const target = track.waypoints[this.targetWaypoint];
        
        // Calculate desired direction
        const toTarget = Vec2.sub(target, { x: car.x, y: car.y });
        const desiredAngle = Vec2.angle(toTarget);
        
        // Calculate angle difference (handle wrapping)
        let angleDiff = desiredAngle - car.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Determine steering
        const steerThreshold = 0.1;
        if (Math.abs(angleDiff) > steerThreshold) {
            car.steer = angleDiff > 0 ? 1 : -1;
        } else {
            car.steer = 0;
        }

        // Check if we need to slow down for a turn
        const distToTarget = Vec2.dist({ x: car.x, y: car.y }, target);
        const sharpTurn = Math.abs(angleDiff) > 0.4;
        
        // Calculate speed factor based on turn sharpness
        let speedFactor = 1.0;
        if (sharpTurn) {
            speedFactor = Math.max(0.4, 1.0 - Math.abs(angleDiff) * 0.8);
        }

        // Check distance to target - slow down when close to waypoint
        if (distToTarget < 100) {
            speedFactor *= 0.7;
        }

        // Apply consistency variation
        speedFactor *= this.consistency;

        // Determine throttle
        const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
        const speedRatio = currentSpeed / this.targetSpeed;
        
        if (speedRatio < speedFactor) {
            car.throttle = Math.min(1, speedFactor * (0.8 + this.aggressiveness * 0.2));
        } else {
            car.throttle = 0.3; // Coast
        }

        // Brake on very sharp turns
        if (Math.abs(angleDiff) > 0.8) {
            car.throttle = 0;
            car.steer = angleDiff > 0 ? 1 : -1;
        }
    }
}

// ============================================================
// 7. CAMERA - Follows player with smooth movement
// ============================================================
class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.smoothing = 5; // Smoothing factor per second
    }

    /**
     * Updates camera to follow target
     * @param {{x: number, y: number}} target - Target position
     * @param {number} dt - Delta time
     */
    update(target, dt) {
        this.targetX = target.x;
        this.targetY = target.y;
        
        // Smooth follow
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        
        this.x += dx * this.smoothing * dt;
        this.y += dy * this.smoothing * dt;
    }

    /**
     * Applies camera transform to canvas context
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    apply(ctx) {
        const offsetX = this.canvasWidth / 2 - this.x;
        const offsetY = this.canvasHeight / 2 - this.y;
        
        ctx.translate(offsetX, offsetY);
    }

    /**
     * Resets camera transform
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    reset(ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

// ============================================================
// 8. HUD MANAGER - Displays race information
// ============================================================
class HUDManager {
    constructor() {
        this.elements = {
            position: document.getElementById('position-display'),
            lap: document.getElementById('lap-display'),
            lapTime: document.getElementById('lap-time-display'),
            totalTime: document.getElementById('total-time-display'),
            speed: document.getElementById('speed-display')
        };
    }

    /**
     * Updates HUD with current race data
     * @param {object} data - Race data
     */
    update(data) {
        if (!this.elements.position) return;

        this.elements.position.textContent = `Position: ${this.formatPosition(data.position)}`;
        this.elements.lap.textContent = `Lap: ${Math.min(data.lap + 1, data.totalLaps)}/${data.totalLaps}`;
        this.elements.lapTime.textContent = `Lap Time: ${this.formatTime(data.lapTime)}`;
        this.elements.totalTime.textContent = `Total Time: ${this.formatTime(data.totalTime)}`;
        
        const speedKmh = Math.round(data.speed * 0.5);
        this.elements.speed.textContent = `Speed: ${speedKmh} km/h`;
    }

    /**
     * Formats position ordinal
     * @param {number} pos - Position number
     * @returns {string} Formatted position
     */
    formatPosition(pos) {
        if (pos === 1) return '1st';
        if (pos === 2) return '2nd';
        if (pos === 3) return '3rd';
        return `${pos}th`;
    }

    /**
     * Formats time as MM:SS.ms
     * @param {number} ms - Time in milliseconds
     * @returns {string} Formatted time
     */
    formatTime(ms) {
        if (ms <= 0) return '00:00.0';
        
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000) / 100);
        
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${milliseconds}`;
    }

    /**
     * Shows the HUD
     */
    show() {
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = 'flex';
    }

    /**
     * Hides the HUD
     */
    hide() {
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = 'none';
    }
}

// ============================================================
// 9. MAIN GAME CLASS
// ============================================================
class Game {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        // Game constants
        this.FIXED_TIMESTEP = 1000 / 60; // 60 FPS physics
        this.TRACE_LENGTH = 3; // Number of frames to trace
        
        // Game state
        this.state = 'menu'; // menu, racing, finished
        this.lastTime = 0;
        this.accumulator = 0;
        this.frameTime = 0;
        
        // Game objects
        this.track = null;
        this.cars = [];
        this.aiControllers = [];
        this.camera = null;
        this.input = new InputHandler();
        this.hud = new HUDManager();
        
        // Race settings
        this.totalLaps = 3;
        
        // Debug
        this.showDebug = false;
        
        // Setup
        this.setupEventListeners();
        this.initRace();
        
        // Start game loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    resizeCanvas() {
        const container = document.getElementById('game-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.state === 'menu') {
                    this.startRace();
                } else if (this.state === 'finished') {
                    this.resetRace();
                }
            }
            if (e.key === 'd' || e.key === 'D') {
                this.showDebug = !this.showDebug;
            }
        });
    }

    /**
     * Initializes a new race
     */
    initRace() {
        this.track = new Track();
        this.camera = new Camera(this.canvas.width, this.canvas.height);
        
        // Create player car at start position
        const startWP = this.track.waypoints[0];
        const startAngle = this.track.getWaypointAngle(0);
        
        this.player = new Car(
            startWP.x,
            startWP.y,
            startAngle,
            '#0088ff',
            'YOU',
            true,
            {
                maxSpeed: 380,
                acceleration: 220,
                turnSpeed: 3.8,
                grip: 0.93
            }
        );

        // Create AI cars with different positions and characteristics
        const aiConfigs = [
            {
                color: '#ff3333',
                name: 'RED RACER',
                maxSpeed: 365,
                acceleration: 210,
                turnSpeed: 3.6,
                grip: 0.91
            },
            {
                color: '#33cc33',
                name: 'GREEN BEAST',
                maxSpeed: 370,
                acceleration: 200,
                turnSpeed: 3.4,
                grip: 0.94
            },
            {
                color: '#ff9900',
                name: 'ORACLE',
                maxSpeed: 355,
                acceleration: 230,
                turnSpeed: 3.3,
                grip: 0.90
            }
        ];

        this.cars = [this.player];
        this.aiControllers = [];

        // Position AI cars behind player on the track
        for (let i = 0; i < aiConfigs.length; i++) {
            const config = aiConfigs[i];
            const offset = (i + 1) * 80;
            const wpIndex = Math.max(0, this.track.waypoints.length - Math.floor(offset / 10));
            const wp = this.track.waypoints[wpIndex % this.track.waypoints.length];
            const wpAngle = this.track.getWaypointAngle(wpIndex % this.track.waypoints.length);
            
            const aiCar = new Car(
                wp.x,
                wp.y,
                wpAngle,
                config.color,
                config.name,
                false,
                config
            );
            
            this.cars.push(aiCar);
            this.aiControllers.push(new AIController(aiCar, this.track, gameRNG));
        }
    }

    /**
     * Starts the race
     */
    startRace() {
        this.totalLaps = parseInt(document.getElementById('lap-count').value) || 3;
        this.state = 'racing';
        
        // Set total laps on all cars
        for (const car of this.cars) {
            car.totalLaps = this.totalLaps;
            car.lapStartTime = performance.now();
            car.raceStartTime = performance.now();
            car.raceFinished = false;
        }
        
        // Hide screens, show HUD
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('race-complete').style.display = 'none';
        this.hud.show();
    }

    /**
     * Resets the race to menu state
     */
    resetRace() {
        this.state = 'menu';
        this.initRace();
        
        document.getElementById('start-screen').style.display = 'flex';
        document.getElementById('race-complete').style.display = 'none';
        this.hud.hide();
    }

    /**
     * Calculates car position in race
     * @param {Car} car - The car to calculate position for
     * @returns {number} Progress value (higher is better)
     */
    calculateProgress(car) {
        return car.lap * 10000 + car.waypointsVisited.size * 100 + car.currentWaypoint;
    }

    /**
     * Gets current race positions
     * @returns {Car[]} Cars sorted by position
     */
    getPositions() {
        return [...this.cars].sort((a, b) => {
            return this.calculateProgress(b) - this.calculateProgress(a);
        });
    }

    /**
     * Main game loop with fixed timestep
     * @param {number} timestamp - Current timestamp
     */
    gameLoop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        
        let frameTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Clamp frame time to prevent spiral of death
        if (frameTime > 1000 / 30) {
            frameTime = 1000 / 30;
        }
        
        this.frameTime = frameTime;
        this.accumulator += frameTime;
        
        // Fixed timestep physics updates
        let updates = 0;
        while (this.accumulator >= this.FIXED_TIMESTEP && updates < this.TRACE_LENGTH) {
            this.update(this.FIXED_TIMESTEP / 1000);
            this.accumulator -= this.FIXED_TIMESTEP;
            updates++;
        }
        
        // Render with interpolation
        const interpolation = this.accumulator / this.FIXED_TIMESTEP;
        this.render(interpolation);
        
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    /**
     * Updates game state
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (this.state !== 'racing') return;

        // Update player input
        this.player.throttle = this.input.getAcceleration();
        this.player.steer = this.input.getSteering();

        // Update AI controllers
        for (const ai of this.aiControllers) {
            ai.update(this.track);
        }

        // Update all cars
        for (const car of this.cars) {
            const otherCars = this.cars.filter(c => c !== car);
            car.update(dt, this.track, otherCars);
        }

        // Update camera to follow player
        this.camera.update(this.player, dt);

        // Check race finish
        if (this.player.raceFinished && this.state === 'racing') {
            this.finishRace();
        }

        // Check if all AI cars finished (player can still race)
    }

    /**
     * Handles race completion
     */
    finishRace() {
        this.state = 'finished';
        
        const positions = this.getPositions();
        const playerPosition = positions.indexOf(this.player) + 1;
        
        // Show race complete screen
        const resultsDiv = document.getElementById('race-results');
        let resultsHTML = `<p style="font-size: 28px; color: ${playerPosition === 1 ? '#ffd700' : '#fff'}; margin-bottom: 20px;">You finished ${this.hud.formatPosition(playerPosition)}!</p>`;
        resultsHTML += '<p>Your Time: ' + this.hud.formatTime(this.player.finishTime) + '</p>';
        resultsHTML += '<hr style="margin: 15px 0; border-color: #444;">';
        
        for (let i = 0; i < positions.length; i++) {
            const car = positions[i];
            const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
            resultsHTML += `<p>${medal}${car.name}: ${car.raceFinished ? this.hud.formatTime(car.finishTime) : 'DNF'}</p>`;
        }
        
        resultsDiv.innerHTML = resultsHTML;
        document.getElementById('race-complete').style.display = 'flex';
    }

    /**
     * Renders the game
     * @param {number} interpolation - Interpolation factor (0-1)
     */
    render(interpolation) {
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (!this.track) return;
        
        // Apply camera transform
        ctx.save();
        this.camera.apply(ctx);
        
        // Draw track
        this.track.draw(ctx);
        
        // Draw debug info if enabled
        if (this.showDebug) {
            this.track.drawDebug(ctx);
        }
        
        // Draw cars (sort by y for pseudo-depth)
        const sortedCars = [...this.cars].sort((a, b) => a.y - b.y);
        for (const car of sortedCars) {
            car.draw(ctx);
        }
        
        // Reset transform
        ctx.restore();
        
        // Draw minimap
        this.drawMinimap(ctx);
        
        // Update HUD
        if (this.state === 'racing') {
            const positions = this.getPositions();
            const playerPos = positions.indexOf(this.player) + 1;
            const speed = Math.sqrt(this.player.vx ** 2 + this.player.vy ** 2);
            
            this.hud.update({
                position: playerPos,
                lap: this.player.lap,
                totalLaps: this.totalLaps,
                lapTime: this.player.lapStartTime > 0 ? performance.now() - this.player.lapStartTime : 0,
                totalTime: performance.now() - this.player.raceStartTime,
                speed: speed
            });
        }
    }

    /**
     * Draws a minimap in the corner
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawMinimap(ctx) {
        const minimapSize = 150;
        const margin = 20;
        
        // Find track bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const wp of this.track.waypoints) {
            minX = Math.min(minX, wp.x);
            minY = Math.min(minY, wp.y);
            maxX = Math.max(maxX, wp.x);
            maxY = Math.max(maxY, wp.y);
        }
        
        const trackWidth = maxX - minX;
        const trackHeight = maxY - minY;
        const scale = (minimapSize - 20) / Math.max(trackWidth, trackHeight);
        
        const offsetX = this.canvas.width - minimapSize - margin;
        const offsetY = this.canvas.height - minimapSize - margin;
        
        // Draw minimap background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(offsetX - 5, offsetY - 5, minimapSize + 10, minimapSize + 10);
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(offsetX, offsetY, minimapSize, minimapSize);
        ctx.clip();
        
        // Draw track on minimap
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < this.track.waypoints.length; i += 5) {
            const wp = this.track.waypoints[i];
            const x = offsetX + 10 + (wp.x - minX) * scale;
            const y = offsetY + 10 + (wp.y - minY) * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw cars on minimap
        for (const car of this.cars) {
            const x = offsetX + 10 + (car.x - minX) * scale;
            const y = offsetY + 10 + (car.y - minY) * scale;
            
            ctx.fillStyle = car.isPlayer ? '#0088ff' : car.color;
            ctx.beginPath();
            ctx.arc(x, y, car.isPlayer ? 4 : 3, 0, Math.PI * 2);
            ctx.fill();
            
            if (car.isPlayer) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
}

// ============================================================
// 10. GAME INITIALIZATION
// ============================================================
let game;

window.addEventListener('load', () => {
    game = new Game();
});
