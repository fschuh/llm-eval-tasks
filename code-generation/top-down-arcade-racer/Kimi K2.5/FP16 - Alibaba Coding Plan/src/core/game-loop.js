/**
 * FixedTimestepLoop - Game loop with fixed timestep physics and variable rendering
 * 
 * Implements the accumulator pattern for deterministic physics updates
 * while maintaining smooth visual rendering through interpolation.
 */
export class FixedTimestepLoop {
    /**
     * Create a new FixedTimestepLoop
     * @param {Function} updateFn - Called with (dt) for physics updates at fixed timestep
     * @param {Function} renderFn - Called with (interpolation, deltaTime) for rendering
     * @param {Object} options - Configuration options
     * @param {number} options.timestep - Fixed timestep in ms (default: 1000/60 ≈ 16.67ms)
     * @param {number} options.maxFrames - Maximum frames to process per tick (default: 240)
     */
    constructor(updateFn, renderFn, options = {}) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;
        
        // Configuration
        this.timestep = options.timestep || (1000 / 60);  // Default 60 FPS
        this.maxFrames = options.maxFrames || 240;         // Prevent spiral of death
        
        // State
        this.running = false;
        this.frameId = null;
        this.lastTime = 0;
        this.accumulator = 0;
        
        // Debug metrics
        this.fps = 0;
        this.deltaTime = 0;
        this._fpsFrameCount = 0;
        this._fpsLastTime = 0;
        
        // Bind the loop method to preserve 'this' context
        this._loop = this._loop.bind(this);
    }
    
    /**
     * Start the game loop
     */
    start() {
        if (this.running) return;
        
        this.running = true;
        this.lastTime = performance.now();
        this._fpsLastTime = this.lastTime;
        this._fpsFrameCount = 0;
        this.accumulator = 0;
        
        this.frameId = requestAnimationFrame(this._loop);
    }
    
    /**
     * Stop the game loop
     */
    stop() {
        this.running = false;
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
    
    /**
     * Check if the loop is currently running
     * @returns {boolean}
     */
    isRunning() {
        return this.running;
    }
    
    /**
     * Get current FPS
     * @returns {number}
     */
    getFPS() {
        return this.fps;
    }
    
    /**
     * Get last frame delta time in milliseconds
     * @returns {number}
     */
    getDeltaTime() {
        return this.deltaTime;
    }
    
    /**
     * Main loop callback
     * @private
     */
    _loop(currentTime) {
        if (!this.running) return;
        
        // Calculate elapsed time since last frame
        this.deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Update FPS counter
        this._updateFPS(currentTime);
        
        // Accumulate time for fixed timestep updates
        // Clamp delta time to prevent spiral of death after tab switch
        const maxDelta = this.timestep * this.maxFrames;
        const clampedDelta = Math.min(this.deltaTime, maxDelta);
        this.accumulator += clampedDelta;
        
        // Process fixed timestep updates
        let updateCount = 0;
        while (this.accumulator >= this.timestep && updateCount < this.maxFrames) {
            this.updateFn(this.timestep);
            this.accumulator -= this.timestep;
            updateCount++;
        }
        
        // Calculate interpolation factor for smooth rendering
        // This represents how far we are into the next physics step
        const interpolation = this.accumulator / this.timestep;
        
        // Render with interpolation
        this.renderFn(interpolation, this.deltaTime);
        
        // Schedule next frame
        this.frameId = requestAnimationFrame(this._loop);
    }
    
    /**
     * Update FPS calculation
     * @private
     */
    _updateFPS(currentTime) {
        this._fpsFrameCount++;
        
        const elapsed = currentTime - this._fpsLastTime;
        if (elapsed >= 1000) {
            this.fps = Math.round((this._fpsFrameCount * 1000) / elapsed);
            this._fpsFrameCount = 0;
            this._fpsLastTime = currentTime;
        }
    }
}
