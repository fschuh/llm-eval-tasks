/**
 * TimeManager - Time utilities and fixed timestep accumulator
 */
export class TimeManager {
    constructor() {
        this.fixedTimestep = 1 / 60; // 60 FPS physics
        this.maxFrameTime = 0.25;    // Prevent spiral of death
        this.accumulator = 0;
        this.lastTime = 0;
        this.currentTime = 0;
        this.deltaTime = 0;
        this.frameCount = 0;
        this.startTime = 0;
    }

    /**
     * Initialize the time manager
     */
    init() {
        this.startTime = performance.now();
        this.lastTime = this.startTime;
        this.currentTime = this.startTime;
        this.accumulator = 0;
        this.frameCount = 0;
    }

    /**
     * Update time tracking - call at start of frame
     * @param {number} timestamp - Current timestamp from requestAnimationFrame
     * @returns {number} Number of fixed timesteps to process
     */
    update(timestamp) {
        // Calculate frame time in seconds
        this.deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        this.currentTime = timestamp;
        this.frameCount++;

        // Clamp to prevent spiral of death
        if (this.deltaTime > this.maxFrameTime) {
            this.deltaTime = this.maxFrameTime;
        }

        // Accumulate time
        this.accumulator += this.deltaTime;

        // Count how many fixed timesteps we need to process
        let steps = 0;
        while (this.accumulator >= this.fixedTimestep) {
            steps++;
            this.accumulator -= this.fixedTimestep;
        }

        return steps;
    }

    /**
     * Get interpolation factor for smooth rendering
     * @returns {number} Alpha value [0, 1)
     */
    getAlpha() {
        return this.accumulator / this.fixedTimestep;
    }

    /**
     * Get elapsed time since start
     * @returns {number} Elapsed time in seconds
     */
    getElapsedTime() {
        return (this.currentTime - this.startTime) / 1000;
    }

    /**
     * Get current delta time
     * @returns {number} Delta time in seconds
     */
    getDeltaTime() {
        return this.deltaTime;
    }

    /**
     * Get fixed timestep value
     * @returns {number} Fixed timestep in seconds
     */
    getFixedTimestep() {
        return this.fixedTimestep;
    }

    /**
     * Set fixed timestep
     * @param {number} dt - Timestep in seconds
     */
    setFixedTimestep(dt) {
        this.fixedTimestep = dt;
    }

    /**
     * Get current FPS
     * @returns {number} Frames per second
     */
    getFPS() {
        if (this.deltaTime === 0) return 0;
        return 1 / this.deltaTime;
    }

    /**
     * Reset the time manager
     */
    reset() {
        this.accumulator = 0;
        this.lastTime = performance.now();
        this.currentTime = this.lastTime;
        this.deltaTime = 0;
        this.frameCount = 0;
        this.startTime = this.lastTime;
    }

    /**
     * Format time as MM:SS.ms
     * @param {number} timeSeconds - Time in seconds
     * @returns {string} Formatted time string
     */
    static formatTime(timeSeconds) {
        if (timeSeconds === Infinity || timeSeconds === undefined || timeSeconds === null) {
            return "--:--.--";
        }
        
        const minutes = Math.floor(timeSeconds / 60);
        const seconds = Math.floor(timeSeconds % 60);
        const milliseconds = Math.floor((timeSeconds % 1) * 100);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    /**
     * Format time as SS.ms (for lap times under a minute)
     * @param {number} timeSeconds - Time in seconds
     * @returns {string} Formatted time string
     */
    static formatLapTime(timeSeconds) {
        if (timeSeconds === Infinity || timeSeconds === undefined || timeSeconds === null) {
            return "--.--";
        }
        
        const seconds = Math.floor(timeSeconds % 60);
        const milliseconds = Math.floor((timeSeconds % 1) * 100);
        
        return `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }
}
