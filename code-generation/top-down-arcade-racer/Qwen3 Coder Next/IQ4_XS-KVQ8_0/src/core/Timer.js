/**
 * Game Timer for Lap Timing
 * 
 * Provides high-precision timing for lap tracking,
 * including lap times, best times, and session timing.
 */
export class Timer {
    /**
     * Creates a new game timer instance
     */
    constructor() {
        this._startTime = 0;
        this._lapStartTime = 0;
        this._lastLapTime = 0;
        this._bestLapTime = Infinity;
        this._totalTime = 0;
        this._lapCount = 0;
        this._totalLaps = 0;
        this._running = false;
        this._lapValid = true;
    }

    /**
     * Starts the timer
     */
    start() {
        this._running = true;
        this._startTime = performance.now();
        this._lapStartTime = this._startTime;
        this._totalTime = 0;
        this._lapCount = 0;
        this._bestLapTime = Infinity;
    }

    /**
     * Stops the timer
     */
    stop() {
        this._running = false;
    }

    /**
     * Resets the timer to initial state
     */
    reset() {
        this._running = false;
        this._startTime = 0;
        this._lapStartTime = 0;
        this._lastLapTime = 0;
        this._bestLapTime = Infinity;
        this._totalTime = 0;
        this._lapCount = 0;
        this._lapValid = true;
    }

    /**
     * Starts a new lap
     */
    startLap() {
        this._lapStartTime = performance.now();
        this._lapCount++;
        this._lapValid = true;
    }

    /**
     * Completes the current lap
     * @returns {number} Lap time in milliseconds
     */
    completeLap() {
        if (!this._running) return 0;
        
        const currentTime = performance.now();
        const lapTime = currentTime - this._lapStartTime;
        
        this._lastLapTime = lapTime;
        this._totalTime += lapTime;
        
        if (lapTime < this._bestLapTime) {
            this._bestLapTime = lapTime;
        }
        
        this._lapCount++;
        this._lapStartTime = currentTime;
        this._lapValid = true;
        
        return lapTime;
    }

    /**
     * Marks a lap as invalid (e.g., cut track)
     */
    invalidateLap() {
        this._lapValid = false;
    }

    /**
     * Checks if the current lap is valid
     * @returns {boolean} True if lap is valid
     */
    isLapValid() {
        return this._lapValid;
    }

    /**
     * Gets the current session time
     * @returns {number} Total time in milliseconds
     */
    getTotalTime() {
        if (!this._running) return this._totalTime;
        
        const currentTime = performance.now();
        return this._totalTime + (currentTime - this._lapStartTime);
    }

    /**
     * Gets the current lap time
     * @returns {number} Lap time in milliseconds
     */
    getLapTime() {
        if (!this._running || this._lapCount === 0) return 0;
        
        const currentTime = performance.now();
        return currentTime - this._lapStartTime;
    }

    /**
     * Gets the last completed lap time
     * @returns {number} Last lap time in milliseconds
     */
    getLastLapTime() {
        return this._lastLapTime;
    }

    /**
     * Gets the best lap time
     * @returns {number} Best lap time in milliseconds
     */
    getBestLapTime() {
        return this._bestLapTime;
    }

    /**
     * Gets the current lap number
     * @returns {number} Current lap number (1-indexed)
     */
    getLapCount() {
        return this._lapCount;
    }

    /**
     * Sets the total number of laps
     * @param {number} laps - Total laps
     */
    setTotalLaps(laps) {
        this._totalLaps = laps;
    }

    /**
     * Gets the total number of laps
     * @returns {number} Total laps
     */
    getTotalLaps() {
        return this._totalLaps;
    }

    /**
     * Checks if the race is complete
     * @returns {boolean} True if race is complete
     */
    isRaceComplete() {
        return this._totalLaps > 0 && this._lapCount >= this._totalLaps;
    }

    /**
     * Formats a time value as a string
     * @param {number} time - Time in milliseconds
     * @returns {string} Formatted time (MM:SS.mmm)
     */
    static formatTime(time) {
        const minutes = Math.floor(time / 60000);
        const seconds = Math.floor((time % 60000) / 1000);
        const milliseconds = Math.floor(time % 1000);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    /**
     * Gets the current time formatted as a string
     * @returns {string} Formatted total time
     */
    getTotalTimeString() {
        return Timer.formatTime(this.getTotalTime());
    }

    /**
     * Gets the current lap time formatted as a string
     * @returns {string} Formatted lap time
     */
    getLapTimeString() {
        return Timer.formatTime(this.getLapTime());
    }

    /**
     * Gets the last lap time formatted as a string
     * @returns {string} Formatted last lap time
     */
    getLastLapTimeString() {
        return Timer.formatTime(this._lastLapTime);
    }

    /**
     * Gets the best lap time formatted as a string
     * @returns {string} Formatted best lap time
     */
    getBestLapTimeString() {
        if (this._bestLapTime === Infinity) return "--:--.---";
        return Timer.formatTime(this._bestLapTime);
    }
}