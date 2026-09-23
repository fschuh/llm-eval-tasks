import { Vector2 } from '../math/Vector2.js';

/**
 * Lap detection and tracking system for racing
 * Handles checkpoint-based lap detection, lap timing, and position tracking
 */
export class LapSystem {
    /**
     * @param {Track} track - Track object with checkpoints
     * @param {Object} options - Lap system configuration options
     */
    constructor(track, options = {}) {
        this.track = track;
        
        // Configuration
        this.checkpointDistanceThreshold = options.checkpointDistanceThreshold ?? 150;
        this.lapCompletionThreshold = options.lapCompletionThreshold ?? 100;
        
        // Lap data storage per car
        this.carLapData = new Map();
        
        // Total race time
        this.totalTime = 0;
        
        // Last checkpoint crossing times for lap time calculation
        this.lastCheckpointTime = new Map();
        
        // Player car reference
        this.playerCar = null;
    }
    
    /**
     * Initialize lap data for a car
     * @param {Car} car - Car to initialize
     * @param {number} startTime - Optional start time (defaults to current totalTime)
     */
    initCarLapData(car, startTime = null) {
        if (!this.carLapData.has(car)) {
            this.carLapData.set(car, {
                lap: 1,
                checkpointIndex: 0,
                checkpointsPassed: [],
                lapStartTime: startTime ?? this.totalTime,
                currentLapTime: 0,
                bestLapTime: null,
                lastCheckpointTime: startTime ?? this.totalTime,
                totalDistance: 0,
                lastPosition: null
            });
            
            // Initialize last checkpoint time for lap time calculation
            this.lastCheckpointTime.set(car, startTime ?? this.totalTime);
        }
    }
    
    /**
     * Update lap system each frame
     * @param {Car} car - Car to update
     * @param {number} dt - Time step in seconds
     */
    update(car, dt) {
        // Initialize car lap data if not already done
        if (!this.carLapData.has(car)) {
            this.initCarLapData(car);
        }
        
        const lapData = this.carLapData.get(car);
        
        // Update total time
        this.totalTime += dt;
        
        // Update current lap time
        lapData.currentLapTime = this.totalTime - lapData.lapStartTime;
        
        // Check for checkpoint crossings
        this.checkCheckpointCrossings(car, lapData);
        
        // Check for lap completion
        this.checkLapProgress(car, lapData);
        
        // Update last position for distance calculation
        lapData.lastPosition = car.position.clone();
    }
    
    /**
     * Check if car has crossed any checkpoints
     * @param {Car} car - Car to check
     * @param {Object} lapData - Lap data for the car
     */
    checkCheckpointCrossings(car, lapData) {
        const checkpoints = this.track.getCheckpoints();
        if (checkpoints.length === 0) return;
        
        // Get current checkpoint index
        let currentCheckpointIndex = lapData.checkpointIndex;
        
        // Check if car has crossed the current checkpoint
        const currentCheckpoint = checkpoints[currentCheckpointIndex];
        const distanceToCheckpoint = car.position.distance(currentCheckpoint);
        
        if (distanceToCheckpoint < this.checkpointDistanceThreshold) {
            // Car has crossed the current checkpoint
            lapData.checkpointsPassed.push(currentCheckpointIndex);
            lapData.lastCheckpointTime = this.totalTime;
            
            // Move to next checkpoint (wrap around)
            lapData.checkpointIndex = (currentCheckpointIndex + 1) % checkpoints.length;
            
            // Store checkpoint crossing time for lap time calculation
            this.lastCheckpointTime.set(car, this.totalTime);
        }
    }
    
    /**
     * Check if car completed a lap
     * @param {Car} car - Car to check
     * @param {Object} lapData - Lap data for the car
     * @returns {boolean} True if lap was completed
     */
    checkLapProgress(car, lapData = null) {
        if (lapData === null) {
            lapData = this.carLapData.get(car);
            if (!lapData) return false;
        }
        
        const checkpoints = this.track.getCheckpoints();
        if (checkpoints.length === 0) return false;
        
        // Get the start/finish checkpoint (first checkpoint)
        const startCheckpoint = checkpoints[0];
        const distanceToStart = car.position.distance(startCheckpoint);
        
        // Check if car has crossed the start/finish line
        // A lap is completed when:
        // 1. Car has passed all checkpoints (checkpointIndex == 0 after wrapping)
        // 2. Car is near the start/finish line
        
        // Check if car has returned to start after passing all other checkpoints
        if (lapData.checkpointIndex === 0 && lapData.checkpointsPassed.length > 1) {
            // Car has passed all checkpoints and is back at start
            if (distanceToStart < this.lapCompletionThreshold) {
                // Lap completed!
                this.completeLap(car, lapData);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Handle lap completion
     * @param {Car} car - Car that completed the lap
     * @param {Object} lapData - Lap data for the car
     */
    completeLap(car, lapData) {
        // Record lap time
        const lapTime = this.totalTime - lapData.lapStartTime;
        
        // Update best lap time
        if (lapData.bestLapTime === null || lapTime < lapData.bestLapTime) {
            lapData.bestLapTime = lapTime;
        }
        
        // Increment lap count
        lapData.lap++;
        
        // Reset for next lap
        lapData.lapStartTime = this.totalTime;
        lapData.checkpointsPassed = [];
        lapData.checkpointIndex = 0;
        
        // Store checkpoint crossing time for next lap
        this.lastCheckpointTime.set(car, this.totalTime);
    }
    
    /**
     * Get current lap time for a car
     * @param {Car} car - Car to get lap time for
     * @returns {number} Current lap time in seconds
     */
    getLapTime(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return 0;
        return lapData.currentLapTime;
    }
    
    /**
     * Get best lap time for a car
     * @param {Car} car - Car to get best lap time for
     * @returns {number|null} Best lap time in seconds, or null if no laps completed
     */
    getBestLap(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return null;
        return lapData.bestLapTime;
    }
    
    /**
     * Get total race time
     * @returns {number} Total race time in seconds
     */
    getTotalTime() {
        return this.totalTime;
    }
    
    /**
     * Get car position based on lap and progress
     * @param {Car} car - Car to get position for
     * @param {Car[]} allCars - All cars in the race
     * @returns {number} Position (1st, 2nd, etc.)
     */
    getPosition(car, allCars) {
        // Create array of cars with their lap progress scores
        const carScores = allCars.map(otherCar => {
            const otherLapData = this.carLapData.get(otherCar);
            const currentLapData = this.carLapData.get(car);
            
            if (!otherLapData || !currentLapData) {
                return { car: otherCar, score: 0 };
            }
            
            // Calculate lap progress score
            // Higher score = better position
            // Score = (lap * 1000) + checkpointProgress + trackProgress
            
            const checkpoints = this.track.getCheckpoints();
            const checkpointProgress = otherLapData.checkpointIndex / checkpoints.length;
            
            // Calculate track progress for more accurate positioning
            const trackProgress = this.track.getTrackProgress(otherCar.position);
            
            // Combine lap and progress into a single score
            const score = (otherLapData.lap * 1000) + (otherLapData.checkpointIndex * 10) + trackProgress;
            
            return { car: otherCar, score: score };
        });
        
        // Sort by score descending
        carScores.sort((a, b) => b.score - a.score);
        
        // Find this car's position
        const position = carScores.findIndex(c => c.car === car) + 1;
        return position;
    }
    
    /**
     * Get lap count for a car
     * @param {Car} car - Car to get lap count for
     * @returns {number} Current lap number (1, 2, 3, etc.)
     */
    getLapCount(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return 0;
        return lapData.lap;
    }
    
    /**
     * Get total laps completed
     * @param {Car} car - Car to get total laps for
     * @returns {number} Total laps completed
     */
    getTotalLaps(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return 0;
        return lapData.lap - 1;
    }
    
    /**
     * Get checkpoint index for a car
     * @param {Car} car - Car to get checkpoint index for
     * @returns {number} Current checkpoint index
     */
    getCheckpointIndex(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return 0;
        return lapData.checkpointIndex;
    }
    
    /**
     * Get number of checkpoints passed in current lap
     * @param {Car} car - Car to get checkpoints passed for
     * @returns {number} Number of checkpoints passed
     */
    getCheckpointsPassed(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return 0;
        return lapData.checkpointsPassed.length;
    }
    
    /**
     * Reset all lap data
     */
    resetLaps() {
        this.carLapData.clear();
        this.totalTime = 0;
        this.lastCheckpointTime.clear();
    }
    
    /**
     * Reset lap data for a specific car
     * @param {Car} car - Car to reset
     */
    resetCarLaps(car) {
        this.carLapData.delete(car);
        this.lastCheckpointTime.delete(car);
    }
    
    /**
     * Check if car is on correct side of checkpoint line
     * Used to prevent cheating by going backwards through checkpoints
     * @param {Car} car - Car to check
     * @param {number} checkpointIndex - Index of checkpoint to check
     * @returns {boolean} True if car is on correct side
     */
    isOnCorrectSideOfCheckpoint(car, checkpointIndex) {
        const checkpoints = this.track.getCheckpoints();
        if (checkpoints.length < 2) return true;
        
        const currentCheckpoint = checkpoints[checkpointIndex];
        const nextCheckpoint = checkpoints[(checkpointIndex + 1) % checkpoints.length];
        
        // Create checkpoint line vector
        const checkpointLine = nextCheckpoint.clone().subtract(currentCheckpoint);
        
        // Create vector from checkpoint to car
        const carVector = car.position.clone().subtract(currentCheckpoint);
        
        // Calculate cross product to determine which side of line car is on
        // For counter-clockwise track, car should be on left side (positive cross product)
        const crossProduct = checkpointLine.x * carVector.y - checkpointLine.y * carVector.x;
        
        // Allow some tolerance for drifting
        return crossProduct > -50; // -50 unit tolerance for drifting
    }
    
    /**
     * Get lap completion percentage for a car
     * @param {Car} car - Car to get completion percentage for
     * @returns {number} Completion percentage (0 to 100)
     */
    getLapCompletionPercent(car) {
        const lapData = this.carLapData.get(car);
        if (!lapData) return 0;
        
        const checkpoints = this.track.getCheckpoints();
        if (checkpoints.length === 0) return 0;
        
        // Calculate completion based on checkpoint index
        const checkpointProgress = lapData.checkpointIndex / checkpoints.length;
        
        // Add small increment for checkpoints passed
        const checkpointsPassedProgress = lapData.checkpointsPassed.length / checkpoints.length;
        
        return (checkpointProgress + checkpointsPassedProgress) * 50;
    }
    
    /**
     * Get time since last checkpoint crossing
     * @param {Car} car - Car to get time since last checkpoint for
     * @returns {number} Time since last checkpoint in seconds
     */
    getTimeSinceLastCheckpoint(car) {
        const lastTime = this.lastCheckpointTime.get(car);
        if (lastTime === undefined) return 0;
        return this.totalTime - lastTime;
    }
    
    /**
     * Get all lap data for debugging
     * @param {Car} car - Car to get data for
     * @returns {Object|null} Lap data object or null if not tracked
     */
    getLapData(car) {
        return this.carLapData.get(car) || null;
    }
    
    /**
     * Get lap data for a car (alias for getLapData)
     * @param {Car} car - Car to get data for
     * @returns {Object|null} Lap data object or null if not tracked
     */
    getCarLapData(car) {
        return this.carLapData.get(car) || null;
    }
    
    /**
     * Set number of laps for the race
     * @param {number} numLaps - Number of laps
     */
    setNumLaps(numLaps) {
        this.numLaps = numLaps;
    }
    
    /**
     * Check if race is finished for a car
     * @param {Car} car - Car to check
     * @returns {boolean} True if race is finished
     */
    isRaceFinished(car) {
        if (this.numLaps === undefined) return false;
        const lapData = this.carLapData.get(car);
        if (!lapData) return false;
        return lapData.lap > this.numLaps;
    }
    
    /**
     * Get total race time
     * @returns {number} Total time in seconds
     */
    getTotalTime() {
        return this.totalTime;
    }
    
    /**
     * Reset all laps for all cars
     */
    resetLaps() {
        this.carLapData.clear();
        this.lastCheckpointTime.clear();
        this.totalTime = 0;
    }
    
    /**
     * Update lap data for a car (alias for update)
     * @param {Car} car - Car to update
     * @param {number} dt - Time step
     */
    updateCarLapData(car, dt) {
        this.update(car, dt);
    }
}
