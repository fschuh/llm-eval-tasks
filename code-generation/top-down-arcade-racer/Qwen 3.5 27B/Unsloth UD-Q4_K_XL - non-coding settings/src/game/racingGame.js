/**
 * Main Racing Game class that integrates all components into a playable racing prototype.
 * Orchestrates the game loop, manages cars (player + AI), handles input, collision detection,
 * lap tracking, and rendering to an HTML5 Canvas element.
 * 
 * @module RacingGame
 */

import Vector2 from '../core/vector2.js';
import SeededRNG from '../core/rng.js';
import GameLoop from '../core/gameLoop.js';
import Car from '../entities/car.js';
import Waypoint from '../entities/waypoint.js';
import Track from '../entities/track.js';
import { checkOBB, resolveCollision, getCarOBB } from '../physics/collision.js';
import AIController from '../controllers/aiController.js';
import LapDetector from '../systems/lapDetector.js';
import HUD from '../systems/hud.js';

/**
 * Configuration for creating an AI car.
 * @typedef {Object} AICarConfig
 * @param {number} speedMultiplier - Speed multiplier relative to player (0.7-1.0)
 * @param {string} color - Display color for the car
 */

/**
 * Main Racing Game class that orchestrates all game systems.
 * Manages the race with one player-controlled car and multiple AI opponents,
 * handling physics updates, collision detection, lap tracking, and rendering.
 */
class RacingGame {
    /**
     * Creates a new RacingGame instance.
     * 
     * @param {HTMLCanvasElement} canvas - The HTML5 Canvas element to render the game on
     * @param {number|string} [seed=12345] - Seed for deterministic RNG (for reproducible AI behavior)
     */
    constructor(canvas, seed = 12345) {
        /** @type {HTMLCanvasElement} The canvas element for rendering */
        this.canvas = canvas;
        
        /** @type {CanvasRenderingContext2D} Canvas 2D rendering context */
        this.context = canvas.getContext('2d');
        
        // Initialize RNG with seed for deterministic behavior
        /** @type {SeededRNG} Random number generator for AI and game logic */
        this.rng = new SeededRNG(seed);
        
        // Game entities (initialized in initialize())
        /** @type {Track|null} The race track with waypoints */
        this.track = null;
        
        /** @type {Car|null} The player-controlled car */
        this.playerCar = null;
        
        /** @type {Array<{car: Car, controller: AIController}>} Array of AI cars and their controllers */
        this.aiCars = [];
        
        /** @type {LapDetector|null} System for tracking lap completion */
        this.lapDetector = null;
        
        /** @type {HUD|null} Heads-up display system */
        this.hud = null;
        
        // Game loop (initialized in initialize())
        /** @type {GameLoop|null} The fixed timestep game loop */
        this.gameLoop = null;
        
        // Input state tracking
        /** @type {{accelerate: boolean, brake: boolean, steerLeft: boolean, steerRight: boolean}} Current input state */
        this.inputState = {
            accelerate: false,
            brake: false,
            steerLeft: false,
            steerRight: false
        };
        
        // Game configuration
        /** @type {number} Total laps to race (0 = endless) */
        this.totalLaps = 5;
        
        /** @type {boolean} Whether the game is currently running */
        this.isRunning = false;
    }

    /**
     * Initializes the game by setting up all systems and entities.
     * Creates the track, player car, AI opponents, lap detector, HUD, and game loop.
     * Should be called once at startup before starting the game loop.
     */
    initialize() {
        // Create the race track with waypoints
        this.createTrack();
        
        // Initialize lap detector with the track
        this.lapDetector = new LapDetector(this.track, {
            checkpointsPerLap: 3,
            strictMode: true
        });
        
        // Find starting position (near first waypoint)
        const startWaypoint = this.track.waypoints[0];
        const startPos = startWaypoint.position.clone();
        const startAngle = this._calculateStartAngle();
        
        // Create player car at starting position
        this.playerCar = this.createPlayerCar(startPos, startAngle);
        
        // Create AI cars with varied configurations
        this.createAICars(3, startPos, startAngle);
        
        // Initialize HUD with canvas and all cars
        const allCars = [this.playerCar, ...this.aiCars.map(ai => ai.car)];
        this.hud = new HUD(this.canvas);
        this.hud.initializeTimers(allCars);
        
        // Create game loop with update and render functions bound to this instance
        this.gameLoop = new GameLoop(
            (deltaTime) => this.update(deltaTime),
            (alpha) => this.render(alpha),
            { fixedDelta: 1 / 60, maxSteps: 5 }
        );
        
        // Set up keyboard event listeners for player input
        this._setupInputHandlers();
        
        // Mark game as initialized and ready to run
        this.isRunning = true;
    }

    /**
     * Creates a sample oval/figure-8 track with at least 12 waypoints.
     * The track is designed to be challenging but fair, with varying turn angles.
     */
    createTrack() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Create an oval/figure-8 style track with 16 waypoints
        // Outer dimensions of the track area
        const halfWidth = Math.min(centerX - 50, 300);
        const halfHeight = Math.min(centerY - 50, 200);
        
        // Waypoint positions for an oval track with a figure-8 crossover
        const waypointPositions = [
            // Starting line area (bottom center)
            { x: centerX, y: centerY + halfHeight - 30 },
            
            // Right side of outer loop
            { x: centerX + halfWidth - 50, y: centerY + halfHeight - 80 },
            { x: centerX + halfWidth, y: centerY + halfHeight / 2 },
            { x: centerX + halfWidth - 50, y: centerY - 30 },
            
            // Top of outer loop
            { x: centerX + halfWidth / 2, y: centerY - halfHeight },
            { x: centerX, y: centerY - halfHeight + 30 },
            { x: centerX - halfWidth / 2, y: centerY - halfHeight },
            
            // Left side of outer loop
            { x: centerX - halfWidth, y: centerY - halfHeight / 2 },
            { x: centerX - halfWidth + 50, y: centerY - 30 },
            
            // Figure-8 crossover (center)
            { x: centerX - halfWidth / 4, y: centerY },
            
            // Inner loop section
            { x: centerX - halfWidth / 2, y: centerY + halfHeight / 3 },
            { x: centerX, y: centerY + halfHeight * 0.7 },
            
            // Back to starting area
            { x: centerX + halfWidth / 4, y: centerY + halfHeight - 50 },
            { x: centerX + halfWidth / 2, y: centerY + halfHeight - 80 },
            
            // Final approach to start/finish
            { x: centerX + halfWidth / 3, y: centerY + halfHeight - 60 },
        ];
        
        // Create Track with waypoints
        this.track = new Track();
        
        waypointPositions.forEach((pos, index) => {
            const waypoint = new Waypoint(pos.x, pos.y);
            waypoint.index = index;
            
            // Add to track and link properly
            if (index === 0) {
                this.track.waypoints.push(waypoint);
            } else {
                this.track.addWaypoint(pos.x, pos.y);
            }
        });
        
        // Ensure we have at least 12 waypoints
        while (this.track.waypoints.length < 12) {
            const extraIndex = this.track.waypoints.length;
            const angle = (extraIndex / 16) * Math.PI * 2;
            const x = centerX + Math.cos(angle) * halfWidth * 0.8;
            const y = centerY + Math.sin(angle) * halfHeight * 0.8;
            this.track.addWaypoint(x, y);
        }
    }

    /**
     * Calculates the starting angle based on track geometry.
     * @returns {number} Starting angle in radians
     */
    _calculateStartAngle() {
        if (this.track.waypoints.length < 2) return 0;
        
        const startWaypoint = this.track.waypoints[0];
        const nextWaypoint = this.track.waypoints[1];
        
        // Calculate angle from start to next waypoint
        const dx = nextWaypoint.position.x - startWaypoint.position.x;
        const dy = nextWaypoint.position.y - startWaypoint.position.y;
        
        return Math.atan2(dy, dx);
    }

    /**
     * Creates the player-controlled car at the specified position and angle.
     * 
     * @param {Vector2} startPos - Starting position vector
     * @param {number} startAngle - Starting orientation in radians
     * @returns {Car} The created player car
     */
    createPlayerCar(startPos, startAngle) {
        const car = new Car({
            position: startPos.clone(),
            angle: startAngle,
            width: 24,
            height: 36,
            maxSpeed: 400,
            accelerationForce: 800,
            brakingForce: 1200,
            steeringAngle: Math.PI / 6,
            frictionCoefficient: 5.0,
            restitution: 0.5
        });
        
        // Mark as player car and assign ID
        car.isPlayer = true;
        car.id = 0;
        car.color = '#FFD700'; // Yellow for player
        
        return car;
    }

    /**
     * Creates AI-controlled cars with varied configurations.
     * Each AI has different speed multipliers (0.85, 0.9, 0.95) and distinct colors.
     * 
     * @param {number} count - Number of AI cars to create (typically 3)
     * @param {Vector2} startPos - Base starting position vector
     * @param {number} startAngle - Starting orientation in radians
     */
    createAICars(count, startPos, startAngle) {
        // Configuration for each AI car with different speeds and colors
        const aiConfigs = [
            { speedMultiplier: 0.85, color: '#FF4444', name: 'Red' },   // Slower red car
            { speedMultiplier: 0.90, color: '#4444FF', name: 'Blue' },  // Medium blue car
            { speedMultiplier: 0.95, color: '#44FF44', name: 'Green' }  // Faster green car
        ];
        
        for (let i = 0; i < count && i < aiConfigs.length; i++) {
            const config = aiConfigs[i];
            
            // Offset starting position slightly for each AI to avoid overlap
            const offsetStartPos = new Vector2(
                startPos.x + (i - 1) * 30,  // Spread horizontally
                startPos.y + (i % 2 === 0 ? 20 : -20)  // Alternate vertically
            );
            
            // Create AI car with speed multiplier applied to maxSpeed
            const aiCar = new Car({
                position: offsetStartPos,
                angle: startAngle,
                width: 24,
                height: 36,
                maxSpeed: 400 * config.speedMultiplier,
                accelerationForce: 800 * config.speedMultiplier,
                brakingForce: 1200,
                steeringAngle: Math.PI / 6,
                frictionCoefficient: 5.0,
                restitution: 0.5
            });
            
            aiCar.id = i + 1; // AI cars have IDs 1, 2, 3...
            aiCar.color = config.color;
            aiCar.isPlayer = false;
            
            // Create AI controller for this car with unique seed
            const aiController = new AIController(aiCar, this.track, {
                speedMultiplier: config.speedMultiplier,
                reactionDelay: this.rng.rangeInt(15, 30),
                lineVariance: this.rng.range(-10, 10),
                seed: `ai_${config.name}_${i}`
            });
            
            // Store both car and controller together
            this.aiCars.push({ car: aiCar, controller: aiController });
        }
    }

    /**
     * Main game update function called at fixed timestep.
     * Processes player input, updates all cars, checks collisions, and updates lap detection.
     * 
     * @param {number} deltaTime - Time elapsed since last update in seconds
     */
    update(deltaTime) {
        if (!this.playerCar || !this.track) return;
        
        // Update player car physics with current input state
        this.playerCar.update(deltaTime);
        
        // Update AI cars and their controllers
        for (const ai of this.aiCars) {
            ai.controller.update(deltaTime);
            ai.car.update(deltaTime);
            
            // Reset AI controls after update to prevent carryover
            ai.car.setControls(false, false, false, false);
        }
        
        // Check collisions between all car pairs using OBB collision detection
        this._checkCollisions();
        
        // Update lap detection for all cars
        const allCars = [this.playerCar, ...this.aiCars.map(ai => ai.car)];
        for (const car of allCars) {
            this.lapDetector.checkLapCompletion(car, allCars);
        }
        
        // Update HUD with current race state
        if (this.hud) {
            this.hud.update(allCars, this.lapDetector);
        }
    }

    /**
     * Checks for collisions between all pairs of cars and resolves them.
     * Uses OBB collision detection via the Separating Axis Theorem.
     */
    _checkCollisions() {
        const allCars = [this.playerCar, ...this.aiCars.map(ai => ai.car)];
        
        // Check each unique pair of cars
        for (let i = 0; i < allCars.length; i++) {
            for (let j = i + 1; j < allCars.length; j++) {
                const carA = allCars[i];
                const carB = allCars[j];
                
                // Get OBB data for both cars
                const obbA = getCarOBB(carA);
                const obbB = getCarOBB(carB);
                
                // Check for collision using SAT
                const collisionResult = checkOBB(obbA, obbB);
                
                if (collisionResult) {
                    // Resolve the collision with impulse-based physics
                    resolveCollision(carA, carB, collisionResult);
                }
            }
        }
    }

    /**
     * Renders the game to canvas.
     * Draws the track, waypoints, finish line, all cars, and HUD.
     * 
     * @param {number} alpha - Interpolation fraction for smooth rendering (0-1)
     */
    render(alpha) {
        const ctx = this.context;
        const canvas = this.canvas;
        
        // Clear canvas with dark background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (!this.track) return;
        
        // Draw track as connected lines
        this._drawTrack(ctx);
        
        // Draw waypoints as small circles
        this._drawWaypoints(ctx);
        
        // Draw finish line across the first waypoint
        this._drawFinishLine(ctx);
        
        // Draw all cars (AI cars first, then player on top)
        for (const ai of this.aiCars) {
            this._drawCar(ctx, ai.car);
        }
        if (this.playerCar) {
            this._drawCar(ctx, this.playerCar);
        }
        
        // Draw HUD overlay
        if (this.hud) {
            this.hud.render();
        }
    }

    /**
     * Draws the track as connected lines between waypoints.
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     */
    _drawTrack(ctx) {
        if (!this.track.waypoints || this.track.waypoints.length < 2) return;
        
        // Draw main track path
        ctx.strokeStyle = '#4a4a6a';
        ctx.lineWidth = 80;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        const firstWp = this.track.waypoints[0];
        ctx.moveTo(firstWp.position.x, firstWp.position.y);
        
        for (let i = 1; i < this.track.waypoints.length; i++) {
            const wp = this.track.waypoints[i];
            ctx.lineTo(wp.position.x, wp.position.y);
        }
        
        // Close the loop back to start
        ctx.closePath();
        ctx.stroke();
        
        // Draw inner track line for visual detail
        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 70;
        ctx.beginPath();
        ctx.moveTo(firstWp.position.x, firstWp.position.y);
        
        for (let i = 1; i < this.track.waypoints.length; i++) {
            const wp = this.track.waypoints[i];
            ctx.lineTo(wp.position.x, wp.position.y);
        }
        
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * Draws waypoints as small circles at each checkpoint.
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     */
    _drawWaypoints(ctx) {
        if (!this.track.waypoints) return;
        
        this.track.waypoints.forEach((wp, index) => {
            // Draw waypoint circle
            ctx.fillStyle = '#6a6a8a';
            ctx.beginPath();
            ctx.arc(wp.position.x, wp.position.y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Highlight checkpoints (every Nth waypoint)
            if (index % 3 === 0) {
                ctx.fillStyle = '#8a8aaa';
                ctx.beginPath();
                ctx.arc(wp.position.x, wp.position.y, 12, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    /**
     * Draws the finish line across the first waypoint.
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     */
    _drawFinishLine(ctx) {
        if (!this.track.waypoints || this.track.waypoints.length === 0) return;
        
        const startWaypoint = this.track.waypoints[0];
        const nextWaypoint = this.track.waypoints[1] || this.track.waypoints[this.track.waypoints.length - 1];
        
        // Calculate perpendicular direction to the track at start line
        const dx = nextWaypoint.position.x - startWaypoint.position.x;
        const dy = nextWaypoint.position.y - startWaypoint.position.y;
        const angle = Math.atan2(dy, dx);
        
        // Draw checkered finish line pattern
        const lineWidth = 100;
        const halfLine = lineWidth / 2;
        
        ctx.save();
        ctx.translate(startWaypoint.position.x, startWaypoint.position.y);
        ctx.rotate(angle + Math.PI / 2);
        
        // Draw checkered pattern
        const checkerSize = 8;
        const numCheckers = Math.ceil(lineWidth / checkerSize);
        
        for (let i = -numCheckers / 2; i < numCheckers / 2; i++) {
            ctx.fillStyle = (Math.abs(i) % 2 === 0) ? '#FFFFFF' : '#000000';
            ctx.fillRect(i * checkerSize, -5, checkerSize, 10);
        }
        
        ctx.restore();
    }

    /**
     * Draws a car as a rotated rectangle with its color.
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     * @param {Car} car - The car to render
     */
    _drawCar(ctx, car) {
        ctx.save();
        
        // Translate to car position and rotate by car angle
        ctx.translate(car.position.x, car.position.y);
        ctx.rotate(car.angle);
        
        // Draw car body as rectangle
        ctx.fillStyle = car.color || '#FFFFFF';
        const halfWidth = car.width / 2;
        const halfHeight = car.height / 2;
        
        // Main body
        ctx.fillRect(-halfWidth, -halfHeight, car.width, car.height);
        
        // Draw windshield (front)
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(-halfWidth + 4, -halfHeight + 10, car.width - 8, 8);
        
        // Draw rear window
        ctx.fillRect(-halfWidth + 4, halfHeight - 14, car.width - 8, 6);
        
        // Draw headlights (front corners)
        ctx.fillStyle = '#FFFF99';
        ctx.fillRect(-halfWidth + 2, -halfHeight, 5, 4);
        ctx.fillRect(halfWidth - 7, -halfHeight, 5, 4);
        
        // Draw taillights (rear corners)
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(-halfWidth + 2, halfHeight - 4, 5, 4);
        ctx.fillRect(halfWidth - 7, halfHeight - 4, 5, 4);
        
        // Draw position indicator for player car
        if (car.isPlayer) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('P', 0, 4);
        } else {
            // Draw AI number
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(String(car.id), 0, 4);
        }
        
        ctx.restore();
    }

    /**
     * Resets the entire race to starting positions.
     * Clears all cars' velocities and returns them to the start line.
     */
    reset() {
        if (!this.track || !this.playerCar) return;
        
        const startWaypoint = this.track.waypoints[0];
        const startPos = startWaypoint.position.clone();
        const startAngle = this._calculateStartAngle();
        
        // Reset player car
        this.playerCar.reset(startPos, startAngle);
        
        // Reset AI cars with offset positions
        for (let i = 0; i < this.aiCars.length; i++) {
            const ai = this.aiCars[i];
            const offsetStartPos = new Vector2(
                startPos.x + (i - 1) * 30,
                startPos.y + (i % 2 === 0 ? 20 : -20)
            );
            
            ai.car.reset(offsetStartPos, startAngle);
            ai.controller.reset();
        }
        
        // Reset lap detector
        if (this.lapDetector) {
            this.lapDetector.resetAll();
        }
        
        // Reset HUD cache
        if (this.hud) {
            this.hud.invalidateCache();
        }
    }

    /**
     * Handles keyboard input for player car control.
     * Maps key codes to accelerate, brake, and steering inputs.
     * 
     * @param {'keydown'|'keyup'} eventType - The type of keyboard event
     * @param {number} keyCode - The numeric code of the pressed/released key
     */
    handleInput(eventType, keyCode) {
        const isKeyDown = eventType === 'keydown';
        
        // W or Up Arrow = accelerate
        if (keyCode === 87 || keyCode === 38) { // W or ArrowUp
            this.inputState.accelerate = isKeyDown;
        }
        
        // S or Down Arrow = brake/reverse
        if (keyCode === 83 || keyCode === 40) { // S or ArrowDown
            this.inputState.brake = isKeyDown;
        }
        
        // A or Left Arrow = steer left
        if (keyCode === 65 || keyCode === 37) { // A or ArrowLeft
            this.inputState.steerLeft = isKeyDown;
        }
        
        // D or Right Arrow = steer right
        if (keyCode === 68 || keyCode === 39) { // D or ArrowRight
            this.inputState.steerRight = isKeyDown;
        }
        
        // Apply current input state to player car
        if (this.playerCar) {
            this.playerCar.setControls(
                this.inputState.accelerate,
                this.inputState.brake,
                this.inputState.steerLeft,
                this.inputState.steerRight
            );
        }
    }

    /**
     * Sets up keyboard event listeners for player input.
     * Attaches keydown and keyup handlers to the window object.
     * @private
     */
    _setupInputHandlers() {
        // Keyboard event handlers
        const handleKeyDown = (e) => this.handleInput('keydown', e.keyCode || e.which);
        const handleKeyUp = (e) => this.handleInput('keyup', e.keyCode || e.which);
        
        // Attach listeners to window
        window.addEventListener('keydown', handleKeyDown, false);
        window.addEventListener('keyup', handleKeyUp, false);
    }

    /**
     * Starts the game loop.
     * Begins rendering and updating at fixed timestep.
     */
    start() {
        if (this.gameLoop && !this.gameLoop.getRunning()) {
            this.gameLoop.start();
        }
    }

    /**
     * Stops the game loop.
     * Halts updates and rendering.
     */
    stop() {
        if (this.gameLoop) {
            this.gameLoop.stop();
        }
        this.isRunning = false;
    }

    /**
     * Gets all cars in the race including player and AI.
     * @returns {Car[]} Array of all Car entities
     */
    getAllCars() {
        if (!this.playerCar) return [];
        return [this.playerCar, ...this.aiCars.map(ai => ai.car)];
    }

    /**
     * Returns a string representation of the game state for debugging.
     * @returns {string} String representation of RacingGame
     */
    toString() {
        const carCount = this.getAllCars().length;
        return `RacingGame(cars:${carCount}, trackWaypoints:${this.track?.waypoints.length || 0}, running:${this.isRunning})`;
    }
}

export default RacingGame;
