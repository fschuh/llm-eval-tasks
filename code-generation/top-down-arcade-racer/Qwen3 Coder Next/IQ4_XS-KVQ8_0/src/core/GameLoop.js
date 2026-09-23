/**
 * Fixed Timestep Game Loop
 * 
 * Implements a fixed timestep game loop with 60Hz updates and
 * interpolation for smooth rendering between updates.
 */
export class GameLoop {
    /**
     * Creates a new game loop instance
     * @param {Object} options - Configuration options
     * @param {number} options.targetFPS - Target frames per second (default: 60)
     * @param {Function} options.update - Update callback(dt)
     * @param {Function} options.render - Render callback(interpolation)
     */
    constructor({ targetFPS = 60, update, render } = {}) {
        this._targetFPS = targetFPS;
        this._fixedTimeStep = 1.0 / targetFPS;
        this._accumulator = 0;
        this._previousTime = 0;
        this._running = false;
        this._updateCallback = update || (() => {});
        this._renderCallback = render || (() => {});
    }

    /**
     * Gets the target FPS
     * @returns {number} Target frames per second
     */
    get targetFPS() {
        return this._targetFPS;
    }

    /**
     * Gets the fixed time step in seconds
     * @returns {number} Time step in seconds
     */
    get fixedTimeStep() {
        return this._fixedTimeStep;
    }

    /**
     * Gets the current accumulator value
     * @returns {number} Accumulator value
     */
    get accumulator() {
        return this._accumulator;
    }

    /**
     * Starts the game loop
     */
    start() {
        if (this._running) return;
        
        this._running = true;
        this._previousTime = performance.now() / 1000;
        this._accumulator = 0;
        
        this._loop();
    }

    /**
     * Stops the game loop
     */
    stop() {
        this._running = false;
    }

    /**
     * Checks if the game loop is running
     * @returns {boolean} True if running
     */
    isRunning() {
        return this._running;
    }

    /**
     * Resets the game loop
     */
    reset() {
        this._accumulator = 0;
        this._previousTime = performance.now() / 1000;
    }

    /**
     * Main game loop
     * @private
     */
    _loop() {
        if (!this._running) return;

        const currentTime = performance.now() / 1000;
        const frameTime = currentTime - this._previousTime;
        this._previousTime = currentTime;
        
        // Cap frame time to prevent spiral of death
        const cappedFrameTime = Math.min(frameTime, 0.25);
        this._accumulator += cappedFrameTime;

        // Update at fixed time steps
        while (this._accumulator >= this._fixedTimeStep) {
            this._updateCallback(this._fixedTimeStep);
            this._accumulator -= this._fixedTimeStep;
        }

        // Calculate interpolation factor
        const interpolation = this._accumulator / this._fixedTimeStep;

        // Render with interpolation
        this._renderCallback(interpolation);

        requestAnimationFrame(() => this._loop());
    }

    /**
     * Sets the update callback
     * @param {Function} callback - Update callback(dt)
     */
    setUpdateCallback(callback) {
        this._updateCallback = callback;
    }

    /**
     * Sets the render callback
     * @param {Function} callback - Render callback(interpolation)
     */
    setRenderCallback(callback) {
        this._renderCallback = callback;
    }

    /**
     * Sets all callbacks at once
     * @param {Object} callbacks - Callback objects
     * @param {Function} callbacks.update - Update callback(dt)
     * @param {Function} callbacks.render - Render callback(interpolation)
     */
    setCallbacks({ update, render } = {}) {
        if (update) this._updateCallback = update;
        if (render) this._renderCallback = render;
    }
}