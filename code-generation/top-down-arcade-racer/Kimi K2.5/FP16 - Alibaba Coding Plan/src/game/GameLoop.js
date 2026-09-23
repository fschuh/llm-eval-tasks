import { TimeManager } from '../core/TimeManager.js';

/**
 * GameLoop - Fixed timestep game loop with interpolation
 */
export class GameLoop {
    /**
     * Create a new game loop
     * @param {Function} updateCallback - Called for each fixed timestep
     * @param {Function} renderCallback - Called for each frame
     */
    constructor(updateCallback, renderCallback) {
        this.updateCallback = updateCallback;
        this.renderCallback = renderCallback;
        
        this.timeManager = new TimeManager();
        this.running = false;
        this.animationFrameId = null;
        
        // Bind the run method
        this.run = this.run.bind(this);
    }

    /**
     * Start the game loop
     */
    start() {
        if (this.running) return;
        
        this.running = true;
        this.timeManager.init();
        this.animationFrameId = requestAnimationFrame(this.run);
    }

    /**
     * Stop the game loop
     */
    stop() {
        this.running = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Check if loop is running
     * @returns {boolean} True if running
     */
    isRunning() {
        return this.running;
    }

    /**
     * Set the fixed timestep
     * @param {number} dt - Timestep in seconds
     */
    setTimestep(dt) {
        this.timeManager.setFixedTimestep(dt);
    }

    /**
     * Main loop function
     * @param {number} timestamp - Current timestamp
     */
    run(timestamp) {
        if (!this.running) return;
        
        // Update time and get number of fixed steps to process
        const steps = this.timeManager.update(timestamp);
        
        // Process fixed timestep updates
        const dt = this.timeManager.getFixedTimestep();
        for (let i = 0; i < steps; i++) {
            this.updateCallback(dt);
        }
        
        // Get interpolation factor for smooth rendering
        const alpha = this.timeManager.getAlpha();
        
        // Render with interpolation
        this.renderCallback(alpha);
        
        // Schedule next frame
        this.animationFrameId = requestAnimationFrame(this.run);
    }

    /**
     * Get current FPS
     * @returns {number} Frames per second
     */
    getFPS() {
        return this.timeManager.getFPS();
    }

    /**
     * Get elapsed time
     * @returns {number} Elapsed time in seconds
     */
    getElapsedTime() {
        return this.timeManager.getElapsedTime();
    }

    /**
     * Get frame count
     * @returns {number} Number of frames processed
     */
    getFrameCount() {
        return this.timeManager.frameCount;
    }

    /**
     * Reset the loop
     */
    reset() {
        this.timeManager.reset();
    }
}
