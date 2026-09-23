import { CONFIG } from '../config.js';

/**
 * Fixed Timestep Game Loop
 * Ensures deterministic physics simulation regardless of frame rate
 */
export class GameLoop {
    constructor(updateCallback, renderCallback) {
        this.updateCallback = updateCallback;
        this.renderCallback = renderCallback;
        
        this.fixedTimestep = CONFIG.FIXED_TIMESTEP;
        this.accumulator = 0;
        this.previousTime = 0;
        this.isRunning = false;
        this.frameId = null;
        
        // Statistics
        this.fps = 0;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
        this.totalTime = 0;
        this.updateCount = 0;
    }
    
    /**
     * Start the game loop
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.accumulator = 0;
        this.previousTime = performance.now();
        this.fpsUpdateTime = this.previousTime;
        this.frameCount = 0;
        this.totalTime = 0;
        this.updateCount = 0;
        
        this.frameId = requestAnimationFrame((time) => this.loop(time));
    }
    
    /**
     * Stop the game loop
     */
    stop() {
        this.isRunning = false;
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
    
    /**
     * Main loop function
     */
    loop(currentTime) {
        if (!this.isRunning) return;
        
        // Calculate delta time in seconds
        let deltaTime = (currentTime - this.previousTime) / 1000;
        this.previousTime = currentTime;
        
        // Clamp delta time to prevent spiral of death
        if (deltaTime > 0.25) {
            deltaTime = 0.25;
        }
        
        this.totalTime += deltaTime;
        
        // Accumulate time for fixed timestep
        this.accumulator += deltaTime;
        
        // Fixed timestep updates
        while (this.accumulator >= this.fixedTimestep) {
            this.updateCallback(this.fixedTimestep);
            this.updateCount++;
            this.accumulator -= this.fixedTimestep;
        }
        
        // Calculate interpolation factor for smooth rendering
        const alpha = this.accumulator / this.fixedTimestep;
        
        // Render with interpolation
        this.renderCallback(alpha);
        
        // FPS calculation
        this.frameCount++;
        if (currentTime - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = currentTime;
        }
        
        // Schedule next frame
        this.frameId = requestAnimationFrame((time) => this.loop(time));
    }
    
    /**
     * Get current FPS
     */
    getFPS() {
        return this.fps;
    }
    
    /**
     * Get total elapsed time
     */
    getTotalTime() {
        return this.totalTime;
    }
    
    /**
     * Get total update count
     */
    getUpdateCount() {
        return this.updateCount;
    }
    
    /**
     * Check if loop is running
     */
    getIsRunning() {
        return this.isRunning;
    }
}
