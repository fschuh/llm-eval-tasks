/**
 * Fixed timestep game loop for deterministic physics simulation.
 * 
 * This implementation uses a time accumulator pattern to ensure physics updates
 * run at a fixed rate (default 60Hz) regardless of the render frame rate.
 * This provides consistent, reproducible physics behavior across different hardware.
 * 
 * Features:
 * - Fixed timestep physics updates for determinism
 * - Time accumulator with max steps to prevent "spiral of death"
 * - Interpolation fraction (alpha) for smooth rendering between physics steps
 * - Pause/resume functionality
 * 
 * @module GameLoop
 */
class GameLoop {
    /**
     * Creates a new GameLoop instance.
     * @param {Function} updateFn - The physics/logic update function called at fixed timestep.
     *                              Receives the fixed delta time as argument.
     * @param {Function} renderFn - The rendering function called every frame.
     *                              Receives interpolation fraction (alpha) for smooth visuals.
     * @param {Object} options - Configuration options.
     * @param {number} [options.fixedDelta=1/60] - Fixed timestep in seconds (default: 60Hz).
     * @param {number} [options.maxSteps=5] - Maximum update steps per frame to prevent spiral of death.
     */
    constructor(updateFn, renderFn, options = {}) {
        this.update = updateFn;
        this.render = renderFn;

        // Physics runs at fixed timestep (default 60 Hz)
        this.fixedDelta = options.fixedDelta || 1 / 60;

        // Accumulator for time between frames
        this.timeAccumulator = 0;

        // Last frame timestamp
        this.lastTime = performance.now();

        // Maximum steps to prevent spiral of death (when system is overloaded)
        this.maxSteps = options.maxSteps || 5;

        // Animation frame ID for cleanup
        this.frameId = null;

        // Running state flags
        this.isRunning = false;
        this.isPaused = false;
    }

    /**
     * Starts the game loop.
     * Begins requesting animation frames and processing updates.
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        
        // Begin the loop
        this.loop(performance.now());
    }

    /**
     * Stops the game loop.
     * Cancels animation frame and clears internal state.
     */
    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    /**
     * Pauses the game loop.
     * Physics updates stop but the loop continues running for rendering.
     */
    pause() {
        if (!this.isRunning) return;
        this.isPaused = true;
    }

    /**
     * Resumes a paused game loop.
     * Restarts physics updates from where they left off.
     */
    resume() {
        if (!this.isRunning) return;
        this.isPaused = false;
        
        // Reset last time to avoid large delta on first frame after pause
        this.lastTime = performance.now();
    }

    /**
     * The main game loop function called via requestAnimationFrame.
     * @param {number} currentTime - Current timestamp from performance.now().
     */
    loop(currentTime) {
        // Schedule next frame
        this.frameId = requestAnimationFrame((time) => this.loop(time));

        if (this.isPaused) {
            // Still render when paused, but don't update physics
            this.render(0);
            return;
        }

        // Calculate delta time in seconds
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap delta time to prevent spiral of death
        // If we've fallen behind too much, skip updates and just render
        if (deltaTime > 0.25) {
            return;
        }

        // Add to accumulator
        this.timeAccumulator += deltaTime;

        // Update physics at fixed timestep
        let steps = 0;
        while (this.timeAccumulator >= this.fixedDelta && steps < this.maxSteps) {
            this.update(this.fixedDelta);
            this.timeAccumulator -= this.fixedDelta;
            steps++;
        }

        // Calculate interpolation fraction for smooth rendering between physics steps
        // Alpha represents how far we are into the current fixed timestep
        const alpha = this.timeAccumulator / this.fixedDelta;

        // Render with interpolation for smooth visuals
        this.render(alpha);
    }

    /**
     * Gets the current running state of the loop.
     * @returns {boolean} True if the loop is currently running.
     */
    getRunning() {
        return this.isRunning;
    }

    /**
     * Gets the current paused state of the loop.
     * @returns {boolean} True if the loop is currently paused.
     */
    getPaused() {
        return this.isPaused;
    }

    /**
     * Gets the fixed timestep value in seconds.
     * @returns {number} The fixed delta time used for physics updates.
     */
    getFixedDelta() {
        return this.fixedDelta;
    }

    /**
     * Gets the current interpolation fraction (alpha).
     * This represents progress between the last and next physics step.
     * @returns {number} A value between 0 and 1 indicating interpolation progress.
     */
    getAlpha() {
        return this.timeAccumulator / this.fixedDelta;
    }

    /**
     * Performs a single manual update step at the fixed timestep.
     * Useful for testing or when external control of updates is needed.
     */
    updateOnce() {
        if (this.update) {
            this.update(this.fixedDelta);
        }
    }

    /**
     * Performs a single render call with the current alpha value.
     * Useful for manual rendering outside the normal loop.
     */
    renderOnce() {
        if (this.render) {
            const alpha = this.timeAccumulator / this.fixedDelta;
            this.render(alpha);
        }
    }

    /**
     * Resets the game loop state.
     * Clears accumulator and resets timing for a fresh start.
     */
    reset() {
        this.timeAccumulator = 0;
        this.lastTime = performance.now();
    }
}

export default GameLoop;
