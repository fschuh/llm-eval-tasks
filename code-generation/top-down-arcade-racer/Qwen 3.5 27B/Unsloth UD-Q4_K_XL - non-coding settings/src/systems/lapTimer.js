/**
 * Lap Timing System for tracking lap times per car.
 * Records start and completion times, calculates lap durations,
 * and provides access to best lap times and current lap elapsed time.
 * 
 * @module LapTimer
 */

/**
 * Timer data structure for a single car.
 * @typedef {Object} CarTimerData
 * @param {number|null} startTime - Timestamp when the first lap started (milliseconds)
 * @param {number|null} currentLapStartTime - Timestamp when current lap started (milliseconds)
 * @param {number[]} lapTimes - Array of completed lap times in milliseconds
 * @param {number|null} bestLapTime - Best (lowest) lap time across all laps, or null if no laps completed
 */

/**
 * Lap Timer system that tracks timing data for multiple cars.
 * Each car has its own timer with independent lap tracking.
 * Times are stored in milliseconds for precision.
 */
class LapTimer {
    /**
     * Creates a new LapTimer instance.
     * Initializes empty timer data structures for all cars.
     */
    constructor() {
        // Per-car timer data using Map for efficient lookups by car ID
        /** @type {Map<number, CarTimerData>} Timer data keyed by car ID */
        this.carTimers = new Map();
        
        // Global timing reference (optional, for race-wide timing)
        /** @type {number|null} Timestamp when the race started (milliseconds), or null if not started */
        this.raceStartTime = null;
    }

    /**
     * Starts timing a lap for a specific car.
     * Records the current timestamp as the start of the lap.
     * If this is the first lap, also records the race start time.
     * 
     * @param {number} carId - The unique identifier of the car starting a lap
     */
    startLap(carId) {
        // Initialize timer data for this car if not already present
        if (!this.carTimers.has(carId)) {
            this._initializeCarTimer(carId);
        }
        
        const timer = this.carTimers.get(carId);
        
        // Record current time as lap start
        timer.currentLapStartTime = Date.now();
        
        // If this is the first lap, also set race start time
        if (timer.startTime === null) {
            timer.startTime = timer.currentLapStartTime;
            
            // Also update global race start time if not set
            if (this.raceStartTime === null) {
                this.raceStartTime = timer.startTime;
            }
        }
    }

    /**
     * Completes a lap for a specific car.
     * Calculates the lap duration and stores it, then starts timing the next lap immediately.
     * 
     * @param {number} carId - The unique identifier of the car completing a lap
     * @returns {number|null} The completed lap time in milliseconds, or null if no lap was in progress
     */
    completeLap(carId) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || timer.currentLapStartTime === null) {
            return null; // No active lap to complete
        }
        
        // Calculate lap duration
        const currentTime = Date.now();
        const lapTime = currentTime - timer.currentLapStartTime;
        
        // Store the completed lap time
        timer.lapTimes.push(lapTime);
        
        // Update best lap time if this is a new personal best
        if (timer.bestLapTime === null || lapTime < timer.bestLapTime) {
            timer.bestLapTime = lapTime;
        }
        
        // Immediately start timing the next lap
        timer.currentLapStartTime = currentTime;
        
        return lapTime;
    }

    /**
     * Gets a specific lap time for a car.
     * 
     * @param {number} carId - The unique identifier of the car
     * @param {number} lapNumber - The 1-based lap number to retrieve (1 = first lap)
     * @returns {number|null} The lap time in milliseconds, or null if not available
     */
    getLapTime(carId, lapNumber) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || !timer.lapTimes) {
            return null;
        }
        
        // Convert 1-based lap number to 0-based array index
        const index = lapNumber - 1;
        
        if (index < 0 || index >= timer.lapTimes.length) {
            return null; // Lap doesn't exist yet or invalid number
        }
        
        return timer.lapTimes[index];
    }

    /**
     * Gets the best (lowest) lap time for a car across all completed laps.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {number|null} Best lap time in milliseconds, or null if no laps completed
     */
    getBestLapTime(carId) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || timer.bestLapTime === null) {
            return null;
        }
        
        return timer.bestLapTime;
    }

    /**
     * Gets the elapsed time for a car's current (in-progress) lap.
     * Returns 0 if no lap is currently being timed.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {number} Elapsed time in milliseconds for current lap, or 0 if not timing
     */
    getCurrentLapTime(carId) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || timer.currentLapStartTime === null) {
            return 0; // No active lap
        }
        
        return Date.now() - timer.currentLapStartTime;
    }

    /**
     * Gets the total number of completed laps for a car.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {number} Number of completed laps, or 0 if not tracked
     */
    getLapCount(carId) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || !timer.lapTimes) {
            return 0;
        }
        
        return timer.lapTimes.length;
    }

    /**
     * Gets all lap times for a car.
     * Returns a copy of the array to prevent external modification.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {number[]} Array of lap times in milliseconds (in order completed)
     */
    getAllLapTimes(carId) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || !timer.lapTimes) {
            return [];
        }
        
        // Return a copy to prevent external modification
        return [...timer.lapTimes];
    }

    /**
     * Gets the average lap time for a car across all completed laps.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {number|null} Average lap time in milliseconds, or null if no laps completed
     */
    getAverageLapTime(carId) {
        const timer = this.carTimers.get(carId);
        
        if (!timer || !timer.lapTimes || timer.lapTimes.length === 0) {
            return null;
        }
        
        const sum = timer.lapTimes.reduce((a, b) => a + b, 0);
        return sum / timer.lapTimes.length;
    }

    /**
     * Resets the timer data for a specific car.
     * Clears all lap times and resets timing state.
     * 
     * @param {number} carId - The unique identifier of the car to reset
     * @returns {boolean} True if car was found and reset, false if not tracked
     */
    resetCar(carId) {
        if (!this.carTimers.has(carId)) {
            return false; // Car wasn't being tracked
        }
        
        this._initializeCarTimer(carId);
        return true;
    }

    /**
     * Resets all timer data for all cars.
     * Called when starting a new race or session.
     */
    resetAll() {
        this.carTimers.clear();
        this.raceStartTime = null;
    }

    /**
     * Initializes timer data for a specific car.
     * Creates fresh timer state with no lap times recorded.
     * 
     * @param {number} carId - The unique identifier of the car
     * @private
     */
    _initializeCarTimer(carId) {
        this.carTimers.set(carId, {
            startTime: null,
            currentLapStartTime: null,
            lapTimes: [],
            bestLapTime: null
        });
    }

    /**
     * Formats a time in milliseconds to a human-readable string.
     * Format: "MM:SS.cc" (minutes:seconds.centiseconds)
     * 
     * @param {number} milliseconds - Time in milliseconds to format
     * @returns {string} Formatted time string
     */
    static formatTime(milliseconds) {
        if (milliseconds === null || isNaN(milliseconds)) {
            return "--:--.--";
        }
        
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        const centiseconds = Math.floor((milliseconds % 1000) / 10);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
    }

    /**
     * Gets the race elapsed time from when the first car started.
     * 
     * @returns {number} Elapsed time in milliseconds since race start, or 0 if not started
     */
    getRaceElapsedTime() {
        if (this.raceStartTime === null) {
            return 0;
        }
        
        return Date.now() - this.raceStartTime;
    }

    /**
     * Gets timer data for all tracked cars.
     * Returns a Map with car IDs as keys and timer summaries as values.
     * 
     * @returns {Map<number, Object>} Map of car ID to timer summary objects
     */
    getAllTimers() {
        const result = new Map();
        
        for (const [carId, timer] of this.carTimers) {
            result.set(carId, {
                lapsCompleted: timer.lapTimes.length,
                bestLapTime: timer.bestLapTime,
                currentLapTime: this.getCurrentLapTime(carId),
                startTime: timer.startTime
            });
        }
        
        return result;
    }

    /**
     * Returns a string representation of the LapTimer for debugging.
     * Format: "LapTimer(trackedCars: N, raceStarted: Y/N)"
     * 
     * @returns {string} String representation of the timer system
     */
    toString() {
        const raceStarted = this.raceStartTime !== null ? 'yes' : 'no';
        return `LapTimer(trackedCars:${this.carTimers.size}, raceStarted:${raceStarted})`;
    }
}

export default LapTimer;
