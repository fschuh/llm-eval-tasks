import { Vector2 } from './math/Vector2.js';
import { RNG } from './math/RNG.js';
import { PlayerCar } from './entities/PlayerCar.js';
import { Car } from './entities/Car.js';
import { AICar } from './entities/AICar.js';
import { Track } from './track/Track.js';
import { LapSystem } from './track/LapSystem.js';
import { Collision } from './collision/Collision.js';
import { HUD } from './ui/HUD.js';

/**
 * Input handler for keyboard controls
 */
class InputHandler {
    constructor() {
        this.keys = {};
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    isDown(code) {
        return this.keys[code] === true;
    }

    get throttle() {
        if (this.isDown('KeyW') || this.isDown('ArrowUp')) return 1;
        if (this.isDown('KeyS') || this.isDown('ArrowDown')) return -1;
        return 0;
    }

    get steering() {
        if (this.isDown('KeyA') || this.isDown('ArrowLeft')) return -1;
        if (this.isDown('KeyD') || this.isDown('ArrowRight')) return 1;
        return 0;
    }

    get brake() {
        return this.isDown('Space');
    }

    get reset() {
        return this.isDown('KeyR');
    }
}

/**
 * Main Game class with fixed timestep loop
 */
export class Game {
    /**
     * @param {HTMLCanvasElement} canvas - Canvas element for rendering
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Game configuration
        this.config = {
            physicsTimestep: 1 / 60, // 60 Hz physics
            maxPhysicsSteps: 5, // Prevent spiral of death
            trackWidth: 100,
            carSize: { width: 20, height: 36 }
        };

        // Systems
        this.input = new InputHandler();
        this.rng = new RNG(42); // Deterministic seed for reproducibility

        // Game state
        this.lastTime = 0;
        this.accumulator = 0;
        this.isRunning = false;
        this.frameCount = 0;

        // Systems
        this.lapSystem = null;
        this.collision = null;
        this.hud = null;

        // Entities
        this.cars = [];
        this.track = null;
        this.playerCar = null;

        // Initialize
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Resize canvas to fit window
     */
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.center = new Vector2(this.canvas.width / 2, this.canvas.height / 2);
    }

    /**
     * Initialize all game systems
     */
    init() {
        this.createTrack();
        this.createCars();
        this.createCollisionSystem();
        this.frameCount = 0;
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }

    /**
     * Create track using Track class
     */
    createTrack() {
        // Create track centered on screen
        this.track = new Track({ trackWidth: this.config.trackWidth });
        
        // Offset track to center of screen
        const offsetX = this.center.x;
        const offsetY = this.center.y;
        
        // Offset all center points
        for (let i = 0; i < this.track.centerPoints.length; i++) {
            this.track.centerPoints[i].x += offsetX;
            this.track.centerPoints[i].y += offsetY;
        }
        
        // Offset all waypoints
        for (let i = 0; i < this.track.waypoints.length; i++) {
            this.track.waypoints[i].x += offsetX;
            this.track.waypoints[i].y += offsetY;
        }
        
        // Offset all boundary points
        for (let i = 0; i < this.track.innerBoundary.length; i++) {
            this.track.innerBoundary[i].x += offsetX;
            this.track.innerBoundary[i].y += offsetY;
        }
        for (let i = 0; i < this.track.outerBoundary.length; i++) {
            this.track.outerBoundary[i].x += offsetX;
            this.track.outerBoundary[i].y += offsetY;
        }
        
        // Offset checkpoints
        for (let i = 0; i < this.track.checkpoints.length; i++) {
            this.track.checkpoints[i].x += offsetX;
            this.track.checkpoints[i].y += offsetY;
        }
        
        // Initialize lap system
        this.lapSystem = new LapSystem(this.track);
        this.lapSystem.playerCar = this.playerCar;
        
        // Initialize HUD
        this.hud = new HUD();
    }

    /**
     * Create player and AI cars
     */
    createCars() {
        // Player car
        this.playerCar = new PlayerCar(this.track.waypoints[0].clone(), 0);
        // Initialize lap data for player car
        this.lapSystem.initCarLapData(this.playerCar);

        // AI cars
        for (let i = 0; i < 3; i++) {
            const offset = (i + 1) * 40;
            const startPos = this.track.waypoints[0].clone().add(new Vector2(0, offset));
            const aiCar = new AICar(startPos, 0, this.track.waypoints, {
                aggression: 0.6 + i * 0.1,
                steeringGain: 2.5,
                speedGain: 0.5,
                brakingDistance: 100,
                waypointProximity: 30,
                seed: 1000 + i
            });
            
            // Set AI-specific properties
            aiCar.maxSpeed = 280;
            aiCar.accelerationForce = 180;
            aiCar.brakingForce = 350;
            aiCar.turningSpeed = 2.8;
            aiCar.driftFactor = 0.93;
            aiCar.color = this.rng.nextFloatRange(0.4, 0.8) < 0.5 ? '#3498db' : '#9b59b6';
            
            // Initialize lap data for AI car
            this.lapSystem.initCarLapData(aiCar);
            
            this.cars.push(aiCar);
        }
    }

    /**
     * Create collision detection system
     */
    createCollisionSystem() {
        this.collision = new Collision({
            restitution: 0.3,
            friction: 0.5,
            minSeparationSpeed: 5,
            carRadius: 18
        });
    }

    /**
     * Main game loop with fixed timestep
     * @param {number} currentTime - Current time in milliseconds
     */
    loop(currentTime) {
        if (!this.isRunning) return;

        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap deltaTime to prevent spiral of death
        const cappedDelta = Math.min(deltaTime, 0.25);
        this.accumulator += cappedDelta;

        // Update physics with fixed timestep
        let physicsSteps = 0;
        while (this.accumulator >= this.config.physicsTimestep && physicsSteps < this.config.maxPhysicsSteps) {
            this.update(this.config.physicsTimestep);
            this.accumulator -= this.config.physicsTimestep;
            physicsSteps++;
        }

        // Render with interpolation
        const alpha = this.accumulator / this.config.physicsTimestep;
        this.render(alpha);

        this.frameCount++;
        requestAnimationFrame((time) => this.loop(time));
    }

    /**
     * Update game state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Update player car
        this.updateCar(this.playerCar, dt, true);

        // Update AI cars
        this.cars.forEach(car => this.updateCar(car, dt, false));

        // Resolve all collisions
        this.resolveCollisions(dt);

        // Check for reset
        if (this.input.reset) {
            this.resetGame();
        }
    }

    /**
     * Update a single car's physics
     * @param {Object} car - Car object to update
     * @param {number} dt - Time step
     * @param {boolean} isPlayer - Whether this is the player car
     */
    updateCar(car, dt, isPlayer) {
        // For player car, use the PlayerCar class update method
        if (isPlayer) {
            car.update(dt, this.input, true);
        } else {
            // For AI cars, use the AICar class update method which handles its own AI logic
            if (car instanceof AICar) {
                car.update(dt, {});
            } else {
                // Fallback for non-AI cars
                const aiInput = { throttle: 1, steering: 0, brake: false };
                car.update(dt, aiInput, false);
            }
        }

        // Update lap system
        this.lapSystem.update(car, dt);

        // Keep car on track (simple boundary check)
        this.keepOnTrack(car);
    }

    /**
     * Resolve all collisions
     * @param {number} dt - Time step
     */
    resolveCollisions(dt) {
        if (!this.collision || !this.track) return;

        // Combine all cars for collision checking
        const allCars = [this.playerCar, ...this.cars];

        // Resolve car-to-car collisions
        this.collision.resolveAllCarToCar(allCars);

        // Resolve car-to-track collisions
        allCars.forEach(car => this.collision.resolveCarToTrack(car, this.track));
    }

    /**
     * Keep car on track (simple boundary enforcement)
     * @param {Object} car - Car to constrain
     */
    keepOnTrack(car) {
        if (!this.track) return;

        // Find closest track center point
        let closestDist = Infinity;
        let closestIndex = 0;

        for (let i = 0; i < this.track.centerPoints.length; i++) {
            const dist = car.position.distanceSquared(this.track.centerPoints[i]);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }

        // Calculate distance from track center
        const trackCenter = this.track.centerPoints[closestIndex];
        const toCar = car.position.clone().subtract(trackCenter);
        const distFromCenter = toCar.length();

        // If too far from track, push back
        const maxTrackRadius = this.config.trackWidth / 2;
        if (distFromCenter > maxTrackRadius) {
            const pushBack = toCar.normalize().multiply(distFromCenter - maxTrackRadius);
            car.position = car.position.subtract(pushBack);
            car.velocity = car.velocity.multiply(0.5); // Lose speed when going off-track
        }
    }

    /**
     * Render the game
     * @param {number} alpha - Interpolation factor (0-1)
     */
    render(alpha) {
        // Clear screen
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grass background
        this.ctx.fillStyle = '#27ae60';
        this.ctx.fillRect(50, 50, this.canvas.width - 100, this.canvas.height - 100);

        // Draw track
        this.drawTrack();

        // Draw cars
        this.drawCar(this.playerCar, true);
        this.cars.forEach(car => this.drawCar(car, false));

        // Draw UI
        this.drawUI();
    }

    /**
     * Draw the track
     */
    drawTrack() {
        if (!this.track) return;

        // Draw track border
        this.ctx.strokeStyle = '#ecf0f1';
        this.ctx.lineWidth = this.config.trackWidth + 20;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        this.ctx.beginPath();
        if (this.track.centerPoints.length > 0) {
            this.ctx.moveTo(this.track.centerPoints[0].x, this.track.centerPoints[0].y);
            for (let i = 1; i < this.track.centerPoints.length; i++) {
                this.ctx.lineTo(this.track.centerPoints[i].x, this.track.centerPoints[i].y);
            }
            this.ctx.closePath();
        }
        this.ctx.stroke();

        // Draw track surface
        this.ctx.strokeStyle = '#7f8c8d';
        this.ctx.lineWidth = this.config.trackWidth;
        this.ctx.stroke();

        // Draw start/finish line
        const startLine = this.track.centerPoints[0];
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.fillRect(startLine.x - 5, startLine.y - this.config.trackWidth / 2, 10, this.config.trackWidth);

        // Draw checkerered pattern on start line
        this.ctx.fillStyle = '#000';
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 6; j++) {
                if ((i + j) % 2 === 0) {
                    this.ctx.fillRect(
                        startLine.x - 5 + (i * 2.5),
                        startLine.y - this.config.trackWidth / 2 + (j * (this.config.trackWidth / 6)),
                        2.5,
                        this.config.trackWidth / 6
                    );
                }
            }
        }

        // Draw waypoints for debugging
        this.ctx.fillStyle = '#f1c40f';
        for (let i = 0; i < this.track.waypoints.length; i++) {
            const wp = this.track.waypoints[i];
            this.ctx.beginPath();
            this.ctx.arc(wp.x, wp.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw waypoint numbers
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(i, wp.x + 5, wp.y);
            this.ctx.fillStyle = '#f1c40f';
        }
    }

    /**
     * Draw a car
     * @param {Object} car - Car to draw
     * @param {boolean} isPlayer - Whether this is the player
     */
    drawCar(car, isPlayer) {
        this.ctx.save();
        this.ctx.translate(car.position.x, car.position.y);
        this.ctx.rotate(car.heading);

        // Draw car body
        this.ctx.fillStyle = isPlayer ? '#e74c3c' : car.color;
        this.ctx.fillRect(
            -this.config.carSize.width / 2,
            -this.config.carSize.height / 2,
            this.config.carSize.width,
            this.config.carSize.height
        );

        // Draw windshield
        this.ctx.fillStyle = '#3498db';
        this.ctx.fillRect(
            -this.config.carSize.width / 2 + 2,
            -this.config.carSize.height / 4,
            this.config.carSize.width - 4,
            this.config.carSize.height / 4
        );

        // Draw wheels
        this.ctx.fillStyle = '#000';
        const wheelWidth = 6;
        const wheelHeight = 8;
        this.ctx.fillRect(
            -this.config.carSize.width / 2 - 2,
            -this.config.carSize.height / 2 + 2,
            wheelWidth,
            wheelHeight
        );
        this.ctx.fillRect(
            this.config.carSize.width / 2 - 4,
            -this.config.carSize.height / 2 + 2,
            wheelWidth,
            wheelHeight
        );
        this.ctx.fillRect(
            -this.config.carSize.width / 2 - 2,
            this.config.carSize.height / 2 - wheelHeight - 2,
            wheelWidth,
            wheelHeight
        );
        this.ctx.fillRect(
            this.config.carSize.width / 2 - 4,
            this.config.carSize.height / 2 - wheelHeight - 2,
            wheelWidth,
            wheelHeight
        );

        // Draw player indicator
        if (isPlayer) {
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    /**
     * Draw UI elements
     */
    drawUI() {
        // Update HUD with current game state
        const allCars = [this.playerCar, ...this.cars];
        this.hud.update(this.lapSystem, allCars, this.lapSystem.getTotalTime());
        
        // Draw HUD
        this.hud.draw(this.ctx);
    }

    /**
     * Reset game state
     */
    resetGame() {
        // Reset lap system
        this.lapSystem.resetLaps();
        
        // Re-initialize lap data for all cars
        this.lapSystem.initCarLapData(this.playerCar);
        this.cars.forEach(car => this.lapSystem.initCarLapData(car));

        // Reset player car
        if (this.playerCar) {
            this.playerCar.reset();
            this.playerCar.position = this.track.waypoints[0].clone();
            this.playerCar.heading = 0;
        }

        // Reset AI cars
        this.cars.forEach((car, i) => {
            car.reset();
            const offset = (i + 1) * 40;
            car.position = this.track.waypoints[0].clone().add(new Vector2(0, offset));
            car.heading = 0;
            car.currentWaypointIndex = 0;
        });
    }

    /**
     * Start the game
     */
    start() {
        this.init();
    }

    /**
     * Stop the game
     */
    stop() {
        this.isRunning = false;
    }
    
    /**
     * Get total game time
     * @returns {number} Total time in seconds
     */
    getTotalTime() {
        return this.lapSystem ? this.lapSystem.getTotalTime() : 0;
    }
}
