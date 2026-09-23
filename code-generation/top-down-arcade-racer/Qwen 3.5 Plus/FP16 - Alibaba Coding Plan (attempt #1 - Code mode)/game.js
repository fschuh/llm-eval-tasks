// ============================================
// Top-Down Arcade Racer - Main Game File
// ============================================

// ============================================
// Deterministic RNG (Mulberry32)
// ============================================
class SeededRandom {
    constructor(seed = 12345) {
        this.seed = seed;
    }

    next() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    range(min, max) {
        return min + this.next() * (max - min);
    }

    reset(seed) {
        this.seed = seed;
    }
}

// ============================================
// Vector2D Utility Class
// ============================================
class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vec2(this.x * s, this.y * s); }
    div(s) { return new Vec2(this.x / s, this.y / s); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    lengthSq() { return this.x * this.x + this.y * this.y; }
    normalize() {
        const len = this.length();
        return len > 0 ? this.div(len) : new Vec2(0, 0);
    }
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vec2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
    }
    distance(v) { return this.sub(v).length(); }
    clone() { return new Vec2(this.x, this.y); }
}

// ============================================
// Fixed Timestep Game Loop
// ============================================
class GameLoop {
    constructor(updateFn, renderFn, fps = 60) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;
        this.fixedDt = 1 / fps;
        this.accumulator = 0;
        this.lastTime = performance.now();
        this.running = false;
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this.loop();
    }

    stop() {
        this.running = false;
    }

    loop() {
        if (!this.running) return;

        const now = performance.now();
        let frameTime = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Cap frame time to prevent spiral of death
        frameTime = Math.min(frameTime, 0.25);

        this.accumulator += frameTime;

        while (this.accumulator >= this.fixedDt) {
            this.updateFn(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }

        this.renderFn(this.accumulator / this.fixedDt);
        requestAnimationFrame(() => this.loop());
    }
}

// ============================================
// Track Definition with Waypoints
// ============================================
class Track {
    constructor() {
        // Track boundaries (outer and inner edges)
        this.outerBoundary = [
            new Vec2(100, 100), new Vec2(500, 80), new Vec2(900, 100),
            new Vec2(950, 200), new Vec2(920, 400), new Vec2(950, 600),
            new Vec2(900, 700), new Vec2(500, 720), new Vec2(100, 700),
            new Vec2(50, 600), new Vec2(80, 400), new Vec2(50, 200)
        ];
        this.innerBoundary = [
            new Vec2(200, 200), new Vec2(400, 180), new Vec2(600, 200),
            new Vec2(750, 250), new Vec2(780, 400), new Vec2(750, 550),
            new Vec2(600, 600), new Vec2(400, 620), new Vec2(200, 600),
            new Vec2(150, 550), new Vec2(180, 400), new Vec2(150, 250)
        ];

        // Waypoints for AI navigation (center of track)
        this.waypoints = [
            new Vec2(150, 150), new Vec2(450, 130), new Vec2(825, 150),
            new Vec2(850, 225), new Vec2(850, 400), new Vec2(850, 575),
            new Vec2(825, 650), new Vec2(450, 670), new Vec2(150, 650),
            new Vec2(115, 575), new Vec2(115, 400), new Vec2(115, 225)
        ];

        // Start/finish line
        this.startLine = {
            point: new Vec2(300, 150),
            direction: new Vec2(0, 1) // Normal pointing up
        };

        // Track width for collision
        this.trackWidth = 100;
    }

    // Check if point is on track
    isOnTrack(point) {
        return this.isInsidePolygon(point, this.outerBoundary) &&
               !this.isInsidePolygon(point, this.innerBoundary);
    }

    isInsidePolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // Get closest waypoint index
    getClosestWaypointIndex(position) {
        let minDist = Infinity;
        let index = 0;
        for (let i = 0; i < this.waypoints.length; i++) {
            const dist = position.distance(this.waypoints[i]);
            if (dist < minDist) {
                minDist = dist;
                index = i;
            }
        }
        return index;
    }

    // Draw track
    draw(ctx) {
        // Draw track surface
        ctx.fillStyle = '#3a3a5a';
        ctx.beginPath();
        ctx.moveTo(this.outerBoundary[0].x, this.outerBoundary[0].y);
        for (let i = 1; i < this.outerBoundary.length; i++) {
            ctx.lineTo(this.outerBoundary[i].x, this.outerBoundary[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Cut out inner hole
        ctx.fillStyle = '#2d2d44';
        ctx.beginPath();
        ctx.moveTo(this.innerBoundary[0].x, this.innerBoundary[0].y);
        for (let i = 1; i < this.innerBoundary.length; i++) {
            ctx.lineTo(this.innerBoundary[i].x, this.innerBoundary[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw start/finish line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(this.startLine.point.x - 50, this.startLine.point.y);
        ctx.lineTo(this.startLine.point.x + 50, this.startLine.point.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw waypoints (debug)
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        for (const wp of this.waypoints) {
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ============================================
// Car Physics
// ============================================
class Car {
    constructor(x, y, color, isPlayer = false) {
        this.position = new Vec2(x, y);
        this.velocity = new Vec2(0, 0);
        this.angle = 0; // Radians, 0 = pointing right
        this.angularVelocity = 0;

        // Car dimensions
        this.width = 40;
        this.height = 20;

        // Physics properties
        this.mass = 1;
        this.maxSpeed = 300;
        this.acceleration = 200;
        this.brakeForce = 400;
        this.steerSpeed = 3;
        this.friction = 0.98;
        this.angularFriction = 0.9;

        // State
        this.isPlayer = isPlayer;
        this.color = color;
        this.inputs = { up: false, down: false, left: false, right: false };

        // AI properties
        this.currentWaypoint = 0;
        this.aiSpeed = isPlayer ? 1 : 0.85 + Math.random() * 0.1;

        // Lap tracking
        this.lap = 1;
        this.lastWaypointIndex = 0;
        this.lapStartTime = 0;
        this.currentLapTime = 0;
        this.bestLapTime = Infinity;
        this.finished = false;
        this.finishTime = 0;
        this.totalLaps = 3;
    }

    update(dt, track) {
        if (this.finished) {
            this.velocity = this.velocity.mul(0.95);
            this.position = this.position.add(this.velocity.mul(dt));
            return;
        }

        if (this.isPlayer) {
            this.handlePlayerInput(dt);
        } else {
            this.handleAI(dt, track);
        }

        // Apply physics
        this.velocity = this.velocity.mul(this.friction);
        this.angularVelocity *= this.angularFriction;

        // Limit speed
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity = this.velocity.normalize().mul(this.maxSpeed);
        }

        // Update position
        this.position = this.position.add(this.velocity.mul(dt));
        this.angle += this.angularVelocity * dt;

        // Keep angle normalized
        while (this.angle > Math.PI) this.angle -= Math.PI * 2;
        while (this.angle < -Math.PI) this.angle += Math.PI * 2;

        // Track boundaries collision
        this.handleTrackCollision(track);

        // Update lap tracking
        this.updateLapTracking(track);
    }

    handlePlayerInput(dt) {
        const forward = new Vec2(Math.cos(this.angle), Math.sin(this.angle));

        if (this.inputs.up) {
            this.velocity = this.velocity.add(forward.mul(this.acceleration * dt));
        }
        if (this.inputs.down) {
            this.velocity = this.velocity.sub(forward.mul(this.brakeForce * dt));
        }

        // Steering (only when moving)
        if (this.velocity.length() > 10) {
            const steerFactor = Math.min(1, this.velocity.length() / 100);
            if (this.inputs.left) {
                this.angularVelocity -= this.steerSpeed * steerFactor;
            }
            if (this.inputs.right) {
                this.angularVelocity += this.steerSpeed * steerFactor;
            }
        }
    }

    handleAI(dt, track) {
        const targetWaypoint = track.waypoints[this.currentWaypoint];
        const toTarget = targetWaypoint.sub(this.position);
        const distance = toTarget.length();

        // Steer towards waypoint
        const targetAngle = Math.atan2(toTarget.y, toTarget.x);
        let angleDiff = targetAngle - this.angle;

        // Normalize angle difference
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const steerDirection = Math.sign(angleDiff);
        const steerFactor = Math.min(1, Math.abs(angleDiff) / 0.5);

        this.angularVelocity += steerDirection * this.steerSpeed * this.aiSpeed * steerFactor * dt * 60;

        // Accelerate based on corner sharpness
        const speedFactor = 1 - Math.min(1, Math.abs(angleDiff) / 1.5) * 0.5;
        const forward = new Vec2(Math.cos(this.angle), Math.sin(this.angle));
        this.velocity = this.velocity.add(forward.mul(this.acceleration * this.aiSpeed * speedFactor * dt));

        // Advance waypoint
        if (distance < 80) {
            this.currentWaypoint = (this.currentWaypoint + 1) % track.waypoints.length;
        }
    }

    handleTrackCollision(track) {
        if (!track.isOnTrack(this.position)) {
            // Simple bounce back
            this.velocity = this.velocity.mul(-0.5);
            this.position = this.position.add(this.velocity.mul(0.1));
        }
    }

    updateLapTracking(track) {
        const closestWP = track.getClosestWaypointIndex(this.position);

        // Check for lap completion (crossing start line after completing waypoints)
        if (this.lastWaypointIndex > closestWP && this.lastWaypointIndex >= track.waypoints.length - 2) {
            // Check if crossing start line
            const toStart = this.position.sub(track.startLine.point);
            if (Math.abs(toStart.x) < 60 && Math.abs(toStart.y) < 30) {
                this.completeLap();
            }
        }

        this.lastWaypointIndex = closestWP;
        this.currentLapTime = performance.now() - this.lapStartTime;
    }

    completeLap() {
        if (this.currentLapTime < this.bestLapTime) {
            this.bestLapTime = this.currentLapTime;
        }

        this.lap++;
        if (this.lap > this.totalLaps) {
            this.finished = true;
            this.finishTime = performance.now();
        } else {
            this.lapStartTime = performance.now();
            this.currentLapTime = 0;
        }
    }

    // Get car corners for collision detection
    getCorners() {
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const corners = [
            new Vec2(halfW, halfH),
            new Vec2(halfW, -halfH),
            new Vec2(-halfW, -halfH),
            new Vec2(-halfW, halfH)
        ];
        return corners.map(c => c.rotate(this.angle).add(this.position));
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        // Car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Windshield
        ctx.fillStyle = '#88ccff';
        ctx.fillRect(5, -this.height / 2 + 2, 10, this.height - 4);

        // Headlights
        ctx.fillStyle = '#ffff88';
        ctx.fillRect(this.width / 2 - 2, -this.height / 2 + 2, 2, 4);
        ctx.fillRect(this.width / 2 - 2, this.height / 2 - 6, 2, 4);

        // Player indicator
        if (this.isPlayer) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(-this.width / 2 - 3, -this.height / 2 - 3, this.width + 6, this.height + 6);
        }

        ctx.restore();
    }
}

// ============================================
// Collision Detection and Response
// ============================================
class CollisionSystem {
    // SAT collision detection for convex polygons
    static detectCollision(car1, car2) {
        const corners1 = car1.getCorners();
        const corners2 = car2.getCorners();

        // Get all edge normals
        const normals = this.getEdgeNormals(corners1).concat(this.getEdgeNormals(corners2));

        let minOverlap = Infinity;
        let minAxis = null;

        for (const normal of normals) {
            const proj1 = this.projectPolygon(corners1, normal);
            const proj2 = this.projectPolygon(corners2, normal);

            const overlap = this.getOverlap(proj1, proj2);
            if (overlap === null) return null; // No collision

            if (overlap < minOverlap) {
                minOverlap = overlap;
                minAxis = normal;
            }
        }

        // Determine collision normal direction
        const direction = car1.position.sub(car2.position);
        if (direction.dot(minAxis) < 0) {
            minAxis = minAxis.mul(-1);
        }

        return {
            normal: minAxis,
            overlap: minOverlap,
            contacts: this.findContactPoints(corners1, corners2)
        };
    }

    static getEdgeNormals(corners) {
        const normals = [];
        for (let i = 0; i < corners.length; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % corners.length];
            const edge = p2.sub(p1);
            const normal = new Vec2(-edge.y, edge.x).normalize();
            normals.push(normal);
        }
        return normals;
    }

    static projectPolygon(corners, axis) {
        let min = Infinity;
        let max = -Infinity;
        for (const corner of corners) {
            const proj = corner.dot(axis);
            min = Math.min(min, proj);
            max = Math.max(max, proj);
        }
        return { min, max };
    }

    static getOverlap(proj1, proj2) {
        const overlap = Math.min(proj1.max - proj2.min, proj2.max - proj1.min);
        return overlap > 0 ? overlap : null;
    }

    static findContactPoints(corners1, corners2) {
        // Simplified: return center points
        return [];
    }

    // Impulse-based collision response
    static resolveCollision(car1, car2, collision) {
        const normal = collision.normal;
        const relVel = car1.velocity.sub(car2.velocity);
        const velAlongNormal = relVel.dot(normal);

        // Don't resolve if velocities are separating
        if (velAlongNormal > 0) return;

        // Coefficient of restitution (bounciness)
        const e = 0.5;

        // Calculate impulse scalar
        let j = -(1 + e) * velAlongNormal;
        j /= (1 / car1.mass + 1 / car2.mass);

        // Apply impulse
        const impulse = normal.mul(j);
        car1.velocity = car1.velocity.add(impulse.div(car1.mass));
        car2.velocity = car2.velocity.sub(impulse.div(car2.mass));

        // Positional correction to prevent sinking
        const percent = 0.8;
        const slop = 0.01;
        const correction = normal.mul(Math.max(collision.overlap - slop, 0) / (1 / car1.mass + 1 / car2.mass) * percent);
        car1.position = car1.position.add(correction.mul(1 / car1.mass));
        car2.position = car2.position.sub(correction.mul(1 / car2.mass));

        // Add some angular velocity based on collision
        car1.angularVelocity += (Math.random() - 0.5) * 2;
        car2.angularVelocity += (Math.random() - 0.5) * 2;
    }
}

// ============================================
// HUD Management
// ============================================
class HUD {
    constructor() {
        this.lapDisplay = document.getElementById('lapDisplay');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.positionDisplay = document.getElementById('positionDisplay');
        this.bestLapDisplay = document.getElementById('bestLapDisplay');
    }

    update(player, cars) {
        // Lap display
        this.lapDisplay.textContent = `${Math.min(player.lap, player.totalLaps)} / ${player.totalLaps}`;

        // Time display
        const time = player.currentLapTime / 1000;
        const minutes = Math.floor(time / 60);
        const seconds = (time % 60).toFixed(3);
        this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(6, '0')}`;

        // Position display
        const position = this.getPlayerPosition(player, cars);
        this.positionDisplay.textContent = `${position} / ${cars.length}`;

        // Best lap display
        if (player.bestLapTime < Infinity) {
            const bestTime = player.bestLapTime / 1000;
            const bestMinutes = Math.floor(bestTime / 60);
            const bestSeconds = (bestTime % 60).toFixed(3);
            this.bestLapDisplay.textContent = `${bestMinutes.toString().padStart(2, '0')}:${bestSeconds.padStart(6, '0')}`;
        }
    }

    getPlayerPosition(player, cars) {
        // Calculate position based on current waypoint and distance to next
        const positions = cars.map((car, index) => ({
            index,
            waypoint: car.currentWaypoint || car.lastWaypointIndex || 0,
            laps: car.lap,
            finished: car.finished
        }));

        // Sort by laps completed, then waypoint, then distance to next waypoint
        positions.sort((a, b) => {
            if (a.finished && !b.finished) return -1;
            if (!a.finished && b.finished) return 1;
            if (a.laps !== b.laps) return b.laps - a.laps;
            return b.waypoint - a.waypoint;
        });

        for (let i = 0; i < positions.length; i++) {
            if (positions[i].index === 0) return i + 1;
        }
        return 1;
    }
}

// ============================================
// Main Game Class
// ============================================
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.rng = new SeededRandom(42); // Deterministic seed
        this.track = new Track();
        this.hud = new HUD();

        // Create cars
        this.cars = [
            new Car(300, 120, '#ff4444', true), // Player
            new Car(300, 160, '#44ff44'),       // AI 1
            new Car(300, 200, '#4444ff'),       // AI 2
            new Car(300, 240, '#ffff44')        // AI 3
        ];

        // Set up input handling
        this.setupInput();

        // Create game loop
        this.gameLoop = new GameLoop(
            (dt) => this.update(dt),
            (alpha) => this.render(alpha)
        );

        this.gameOver = false;
    }

    setupInput() {
        const player = this.cars[0];

        document.addEventListener('keydown', (e) => {
            switch (e.key.toLowerCase()) {
                case 'w': case 'arrowup': player.inputs.up = true; break;
                case 's': case 'arrowdown': player.inputs.down = true; break;
                case 'a': case 'arrowleft': player.inputs.left = true; break;
                case 'd': case 'arrowright': player.inputs.right = true; break;
                case 'r': this.restart(); break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.key.toLowerCase()) {
                case 'w': case 'arrowup': player.inputs.up = false; break;
                case 's': case 'arrowdown': player.inputs.down = false; break;
                case 'a': case 'arrowleft': player.inputs.left = false; break;
                case 'd': case 'arrowright': player.inputs.right = false; break;
            }
        });
    }

    update(dt) {
        if (this.gameOver) return;

        // Update all cars
        for (const car of this.cars) {
            car.update(dt, this.track);
        }

        // Check car-to-car collisions
        for (let i = 0; i < this.cars.length; i++) {
            for (let j = i + 1; j < this.cars.length; j++) {
                const collision = CollisionSystem.detectCollision(this.cars[i], this.cars[j]);
                if (collision) {
                    CollisionSystem.resolveCollision(this.cars[i], this.cars[j], collision);
                }
            }
        }

        // Check for race completion
        const player = this.cars[0];
        if (player.finished) {
            this.gameOver = true;
            setTimeout(() => {
                alert(`Race Complete! Position: ${this.hud.getPlayerPosition(player, this.cars)}/${this.cars.length}`);
            }, 100);
        }

        // Update HUD
        this.hud.update(player, this.cars);
    }

    render(alpha) {
        // Clear canvas
        this.ctx.fillStyle = '#2d2d44';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw track
        this.track.draw(this.ctx);

        // Draw cars with interpolation
        for (const car of this.cars) {
            // Interpolate position for smooth rendering
            const renderPos = car.position.add(
                car.velocity.mul(alpha / 60)
            );
            const renderAngle = car.angle + car.angularVelocity * alpha / 60;

            this.ctx.save();
            this.ctx.translate(renderPos.x, renderPos.y);
            this.ctx.rotate(renderAngle);

            // Car body
            this.ctx.fillStyle = car.color;
            this.ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);

            // Windshield
            this.ctx.fillStyle = '#88ccff';
            this.ctx.fillRect(5, -car.height / 2 + 2, 10, car.height - 4);

            // Headlights
            this.ctx.fillStyle = '#ffff88';
            this.ctx.fillRect(car.width / 2 - 2, -car.height / 2 + 2, 2, 4);
            this.ctx.fillRect(car.width / 2 - 2, car.height / 2 - 6, 2, 4);

            // Player indicator
            if (car.isPlayer) {
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-car.width / 2 - 3, -car.height / 2 - 3, car.width + 6, car.height + 6);
            }

            this.ctx.restore();
        }

        // Draw finish overlay if game over
        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('RACE COMPLETE', this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press R to restart', this.canvas.width / 2, this.canvas.height / 2 + 40);
        }
    }

    restart() {
        this.rng.reset(42);
        this.cars = [
            new Car(300, 120, '#ff4444', true),
            new Car(300, 160, '#44ff44'),
            new Car(300, 200, '#4444ff'),
            new Car(300, 240, '#ffff44')
        ];
        this.gameOver = false;
        this.cars[0].inputs = this.cars[0].inputs; // Preserve input handlers
        this.setupInput();
    }

    start() {
        this.gameLoop.start();
    }
}

// ============================================
// Initialize Game
// ============================================
window.addEventListener('load', () => {
    const game = new Game();
    game.start();
});
