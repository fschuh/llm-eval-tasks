/**
 * Lap Detection System for validating lap completion using checkpoints.
 * Prevents cheating by requiring cars to pass checkpoints in sequential order.
 * Tracks progress per car and validates checkpoint sequences before counting laps.
 * 
 * @module LapDetector
 */

/**
 * Configuration options for the LapDetector system.
 * @typedef {Object} LapDetectorConfig
 * @param {number} [config.checkpointsPerLap=3] - Number of checkpoints to require per lap (every Nth waypoint)
 * @param {boolean} [config.strictMode=true] - If true, cars must hit all checkpoints in order; if false, only finish line matters
 */

/**
 * Lap progress data for a single car.
 * @typedef {Object} CarProgress
 * @param {number} lapsCompleted - Number of complete laps finished
 * @param {number} currentCheckpoint - Index of the last checkpoint passed (0-based)
 * @param {number} totalCheckpoints - Total number of checkpoints required per lap
 * @param {number[]} checkpointsPassed - Array of checkpoint indices passed in current lap
 */

/**
 * Lap Detector system that validates lap completion using a checkpoint-based approach.
 * Cars must pass through checkpoints in sequential order to prevent shortcuts and cheating.
 * Checkpoints are derived from track waypoints at configurable intervals.
 */
class LapDetector {
    /**
     * Creates a new LapDetector instance for the given track.
     * 
     * @param {Track} track - The Track containing waypoints used as checkpoints
     * @param {LapDetectorConfig} [config] - Configuration options for checkpoint behavior
     */
    constructor(track, config = {}) {
        /** @type {Track} The track this detector is monitoring */
        this.track = track;
        
        // Configuration with defaults
        /** @type {number} Number of waypoints between checkpoints (every Nth waypoint) */
        this.checkpointsInterval = config.checkpointsPerLap || 3;
        
        /** @type {boolean} Whether to enforce strict sequential checkpoint validation */
        this.strictMode = config.strictMode !== false; // Default true
        
        // Derive checkpoints from track waypoints
        /** @type {Waypoint[]} Array of checkpoint waypoints (subset of all waypoints) */
        this.checkpoints = this._deriveCheckpoints();
        
        /** @type {number} Total number of checkpoints per lap */
        this.totalCheckpointsPerLap = this.checkpoints.length;
        
        // Per-car progress tracking using Map for efficient lookups
        /** @type {Map<number, CarProgress>} Progress data keyed by car ID */
        this.carProgress = new Map();
    }

    /**
     * Derives checkpoint waypoints from the track's full waypoint list.
     * Selects every Nth waypoint based on checkpointsInterval configuration.
     * 
     * @returns {Waypoint[]} Array of checkpoint waypoints
     * @private
     */
    _deriveCheckpoints() {
        if (!this.track.waypoints || this.track.waypoints.length === 0) {
            return [];
        }
        
        const checkpoints = [];
        const totalWaypoints = this.track.waypoints.length;
        
        // Select every Nth waypoint as a checkpoint
        for (let i = 0; i < totalWaypoints; i++) {
            if (i % this.checkpointsInterval === 0) {
                checkpoints.push(this.track.waypoints[i]);
            }
        }
        
        // Ensure we have at least the start/finish line as a checkpoint
        if (checkpoints.length === 0 || 
            !checkpoints.some(cp => cp.index === 0)) {
            const startWaypoint = this.track.waypoints.find(wp => wp.index === 0);
            if (startWaypoint && !checkpoints.includes(startWaypoint)) {
                checkpoints.unshift(startWaypoint);
            }
        }
        
        return checkpoints;
    }

    /**
     * Checks if a car has completed a lap by validating checkpoint sequence.
     * Updates the car's progress and returns true if a lap was just completed.
     * 
     * @param {Car} car - The car to check for lap completion
     * @param {Car[]} cars - All cars in the race (for position validation)
     * @returns {boolean} True if the car just completed a lap, false otherwise
     */
    checkLapCompletion(car, cars = []) {
        // Initialize progress for this car if not already tracked
        if (!this.carProgress.has(car.id)) {
            this._initializeCarProgress(car.id);
        }
        
        const progress = this.carProgress.get(car.id);
        
        // Find the next expected checkpoint based on current progress
        const nextCheckpointIndex = (progress.currentCheckpoint + 1) % this.totalCheckpointsPerLap;
        const nextCheckpoint = this.checkpoints[nextCheckpointIndex];
        
        if (!nextCheckpoint) {
            return false; // No valid checkpoint to check against
        }
        
        // Calculate distance from car to the next checkpoint
        const distanceToCheckpoint = car.position.distanceTo(nextCheckpoint.position);
        const detectionRadius = nextCheckpoint.radius || 30;
        
        // Check if car has reached the checkpoint
        if (distanceToCheckpoint < detectionRadius) {
            // Validate checkpoint sequence in strict mode
            if (this.strictMode) {
                // Verify this is the expected next checkpoint
                const expectedIndex = progress.currentCheckpoint + 1;
                
                // Handle wraparound case (last checkpoint to first)
                if (expectedIndex >= this.totalCheckpointsPerLap) {
                    // Checkpoint passed was the last one - lap complete!
                    return this._completeLap(car, progress);
                }
            } else {
                // Non-strict mode: just check if we passed any checkpoint
                // and track it for progress calculation
            }
            
            // Update progress to reflect checkpoint passage
            progress.checkpointsPassed.push(nextCheckpointIndex);
            progress.currentCheckpoint = nextCheckpointIndex;
            
            // Check for lap completion (passed all checkpoints)
            if (progress.checkpointsPassed.length >= this.totalCheckpointsPerLap) {
                return this._completeLap(car, progress);
            }
        }
        
        return false;
    }

    /**
     * Handles lap completion logic.
     * Increments lap count and resets checkpoint tracking for the next lap.
     * 
     * @param {Car} car - The car that completed the lap
     * @param {CarProgress} progress - The car's current progress data
     * @returns {boolean} Always returns true (lap was completed)
     * @private
     */
    _completeLap(car, progress) {
        // Increment completed laps count
        if (car.lapsCompleted !== undefined) {
            car.lapsCompleted++;
        }
        
        // Reset checkpoint tracking for the new lap
        progress.checkpointsPassed = [];
        progress.currentCheckpoint = -1; // Will be updated on first checkpoint pass
        
        return true;
    }

    /**
     * Gets the current progress data for a specific car.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {CarProgress|null} Progress data if tracked, null otherwise
     */
    getCarProgress(carId) {
        const progress = this.carProgress.get(carId);
        
        if (!progress) {
            return null;
        }
        
        // Return a copy to prevent external modification
        return {
            lapsCompleted: progress.lapsCompleted,
            currentCheckpoint: progress.currentCheckpoint,
            totalCheckpoints: this.totalCheckpointsPerLap,
            checkpointsPassed: [...progress.checkpointsPassed]
        };
    }

    /**
     * Resets the lap progress for a specific car.
     * Useful when a car needs to restart without affecting other cars.
     * 
     * @param {number} carId - The unique identifier of the car to reset
     * @returns {boolean} True if car was found and reset, false if not tracked
     */
    resetCarProgress(carId) {
        return this._initializeCarProgress(carId);
    }

    /**
     * Resets progress tracking for all cars.
     * Called when starting a new race or session.
     */
    resetAll() {
        this.carProgress.clear();
    }

    /**
     * Initializes or resets progress data for a specific car.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {boolean} True if initialized/reset successfully
     * @private
     */
    _initializeCarProgress(carId) {
        const progress = {
            lapsCompleted: 0,
            currentCheckpoint: -1, // No checkpoints passed yet (-1 means before first checkpoint)
            totalCheckpoints: this.totalCheckpointsPerLap,
            checkpointsPassed: []
        };
        
        this.carProgress.set(carId, progress);
        return true;
    }

    /**
     * Gets the lap progress as a decimal value between 0 and 1.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {number} Progress from 0.0 (start) to 1.0 (complete), or -1 if not tracked
     */
    getLapProgress(carId) {
        const progress = this.carProgress.get(carId);
        
        if (!progress || this.totalCheckpointsPerLap === 0) {
            return -1;
        }
        
        // Calculate progress based on checkpoints passed
        const checkpointsPassedCount = progress.checkpointsPassed.length;
        return Math.min(1.0, checkpointsPassedCount / this.totalCheckpointsPerLap);
    }

    /**
     * Gets the next checkpoint a car needs to reach.
     * 
     * @param {number} carId - The unique identifier of the car
     * @returns {Waypoint|null} The next checkpoint waypoint, or null if not tracked/complete
     */
    getNextCheckpoint(carId) {
        const progress = this.carProgress.get(carId);
        
        if (!progress || this.totalCheckpointsPerLap === 0) {
            return null;
        }
        
        // Calculate next checkpoint index (handle wraparound)
        let nextIndex = progress.currentCheckpoint + 1;
        if (nextIndex >= this.totalCheckpointsPerLap) {
            nextIndex = 0; // Wrap to first checkpoint after completing lap
        }
        
        return this.checkpoints[nextIndex] || null;
    }

    /**
     * Updates the checkpoints based on a new track configuration.
     * Call this if the track waypoints have changed.
     * 
     * @param {Track} newTrack - The updated Track instance
     */
    updateTrack(newTrack) {
        this.track = newTrack;
        this.checkpoints = this._deriveCheckpoints();
        this.totalCheckpointsPerLap = this.checkpoints.length;
        
        // Reset all car progress since track changed
        this.resetAll();
    }

    /**
     * Returns a string representation of the LapDetector for debugging.
     * Format: "LapDetector(checkpoints: N, trackedCars: M)"
     * 
     * @returns {string} String representation of the detector
     */
    toString() {
        return `LapDetector(checkpoints:${this.totalCheckpointsPerLap}, trackedCars:${this.carProgress.size})`;
    }
}

export default LapDetector;
