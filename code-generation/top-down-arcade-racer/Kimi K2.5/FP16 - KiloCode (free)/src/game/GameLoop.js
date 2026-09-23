import { CarPhysicsController } from '../physics/CarPhysicsController.js';
import { CollisionDetector } from '../physics/CollisionDetector.js';
import { CollisionResolver } from '../physics/CollisionResolver.js';

/**
 * Game loop with fixed timestep for deterministic physics
 */
export class GameLoop {
    constructor(gameState, renderer, inputHandler) {
        this.gameState = gameState;
        this.renderer = renderer;
        this.inputHandler = inputHandler;

        // Timing
        this.fixedTimestep = 1 / 60;  // 60 physics updates per second
        this.maxSubsteps = 5;         // Prevent spiral of death
        this.accumulator = 0;

        // Frame tracking
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.lastFpsTime = 0;

        // State
        this.isRunning = false;
        this.rafId = null;
    }

    /**
     * Start the game loop
     */
    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        this.loop();
    }

    /**
     * Stop the game loop
     */
    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
    }

    /**
     * Main game loop
     */
    loop() {
        if (!this.isRunning) return;

        this.rafId = requestAnimationFrame(() => this.loop());

        const currentTime = performance.now();
        const frameTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        // Cap frame time to prevent spiral of death
        const maxFrameTime = this.fixedTimestep * this.maxSubsteps;
        const dt = Math.min(frameTime, maxFrameTime);

        // Accumulate time
        this.accumulator += dt;

        // Fixed timestep updates
        let substeps = 0;
        while (this.accumulator >= this.fixedTimestep && substeps < this.maxSubsteps) {
            this.update(this.fixedTimestep);
            this.accumulator -= this.fixedTimestep;
            substeps++;
        }

        // Calculate interpolation factor for smooth rendering
        const alpha = this.accumulator / this.fixedTimestep;

        // Render with interpolation
        this.render(alpha);

        // Update FPS counter
        this.updateFPS(currentTime);

        // Clear per-frame input state
        this.inputHandler.clearFrame();
    }

    /**
     * Update game state for a single timestep
     */
    update(dt) {
        const state = this.gameState;

        // Handle restart
        if (this.inputHandler.wasActionPressed('restart')) {
            this.restartRace();
            return;
        }

        // Handle countdown
        if (state.raceState === 'COUNTDOWN') {
            state.countdownTime -= dt;
            if (state.countdownTime <= 0) {
                state.startRace();
            }
        }

        // Update race timer
        if (state.raceState === 'RACING') {
            state.raceTime += dt;
        }

        // Update player input
        if (state.player && state.raceState !== 'FINISHED') {
            state.player.update(dt);
        }

        // Update AI
        for (const aiCar of state.aiCars) {
            if (!aiCar.finished) {
                aiCar.update(dt);
            }
        }

        // Update physics for all cars
        for (const car of state.allCars) {
            CarPhysicsController.update(car, dt);
        }

        // Check collisions
        this.updateCollisions();

        // Update lap detection
        if (state.lapDetector) {
            for (const car of state.allCars) {
                state.lapDetector.update(car, dt);
            }
        }

        // Update leaderboard
        state.updateLeaderboard();

        // Update camera
        this.updateCamera();

        // Check race end
        this.checkRaceEnd();
    }

    /**
     * Check and resolve collisions between all cars
     */
    updateCollisions() {
        const cars = this.gameState.allCars;

        // Check all pairs
        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                const carA = cars[i];
                const carB = cars[j];

                // Skip if either car is in cooldown
                if (carA.collisionCooldown > 0 || carB.collisionCooldown > 0) continue;

                const collision = CollisionDetector.checkCarCollision(carA, carB);
                if (collision) {
                    CollisionResolver.resolve(carA, carB, collision);
                }
            }
        }

        // Decrement cooldowns
        for (const car of cars) {
            if (car.collisionCooldown > 0) {
                car.collisionCooldown--;
            }
        }
    }

    /**
     * Update camera position to follow target
     */
    updateCamera() {
        const camera = this.gameState.camera;
        const target = camera.target || this.gameState.player;

        if (target) {
            // Smooth camera follow
            const targetPos = target.physics.position;
            const lerpFactor = 0.1;

            camera.position.x += (targetPos.x - camera.position.x) * lerpFactor;
            camera.position.y += (targetPos.y - camera.position.y) * lerpFactor;
        }
    }

    /**
     * Check if race has ended
     */
    checkRaceEnd() {
        const state = this.gameState;

        if (state.raceState === 'RACING' && state.isRaceFinished()) {
            state.raceState = 'FINISHED';
        }
    }

    /**
     * Restart the race
     */
    restartRace() {
        const state = this.gameState;

        // Reset state
        state.reset();

        // Get start position
        const startWaypoint = state.track.waypoints[state.track.startLine];
        const startPos = startWaypoint.position.clone();
        const startHeading = Math.atan2(startWaypoint.tangent.y, startWaypoint.tangent.x);

        // Reset all cars
        const cars = state.allCars;
        for (let i = 0; i < cars.length; i++) {
            const offset = new Vector2(-startWaypoint.normal.y, startWaypoint.normal.x).multiply((i - 1) * 25);
            cars[i].reset(startPos.add(offset), startHeading);
        }

        // Start countdown
        state.startCountdown();
    }

    /**
     * Render the game
     */
    render(alpha) {
        this.renderer.render(this.gameState, alpha);
    }

    /**
     * Update FPS counter
     */
    updateFPS(currentTime) {
        this.frameCount++;

        if (currentTime - this.lastFpsTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = currentTime;
        }
    }
}