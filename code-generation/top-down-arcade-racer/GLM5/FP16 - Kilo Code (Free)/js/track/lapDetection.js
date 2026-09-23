import { Vector2 } from '../physics/vector2.js';
import { CONFIG } from '../config.js';

/**
 * Lap Detection System
 * Tracks car progress through checkpoints and detects lap completion
 */
export class LapDetectionSystem {
    constructor(track) {
        this.track = track;
        this.totalLaps = CONFIG.TOTAL_LAPS;
        this.checkpoints = track.checkpoints;
        
        // Car tracking data
        this.carData = new Map();
    }
    
    /**
     * Register a car for tracking
     */
    registerCar(car) {
        this.carData.set(car, {
            currentCheckpoint: 0,
            lap: 0,
            totalCheckpointsPassed: 0,
            finished: false,
            finishTime: 0,
            lastCheckpointTime: 0,
            checkpointHistory: []
        });
    }
    
    /**
     * Update lap detection for all registered cars
     */
    update(cars, raceTime) {
        for (const car of cars) {
            const data = this.carData.get(car);
            if (!data || data.finished) continue;
            
            this.checkCheckpoint(car, data, raceTime);
        }
    }
    
    /**
     * Check if car has passed through a checkpoint
     */
    checkCheckpoint(car, data, raceTime) {
        const currentIdx = data.currentCheckpoint;
        const checkpoint = this.checkpoints[currentIdx];
        
        if (!checkpoint) return;
        
        // Check if car crossed the checkpoint line
        if (this.crossedCheckpoint(car, checkpoint)) {
            // Passed checkpoint
            data.totalCheckpointsPassed++;
            data.lastCheckpointTime = raceTime;
            data.checkpointHistory.push({
                checkpoint: currentIdx,
                time: raceTime
            });
            
            // Move to next checkpoint
            data.currentCheckpoint = (currentIdx + 1) % this.checkpoints.length;
            
            // Check for lap completion
            if (data.currentCheckpoint === 0) {
                data.lap++;
                
                // Check for race completion
                if (data.lap >= this.totalLaps) {
                    data.finished = true;
                    data.finishTime = raceTime;
                    car.finished = true;
                    car.finishTime = raceTime;
                }
            }
            
            // Update car's checkpoint info
            car.currentCheckpoint = data.currentCheckpoint;
            car.lap = data.lap;
            car.totalCheckpointsPassed = data.totalCheckpointsPassed;
        }
    }
    
    /**
     * Check if car crossed a checkpoint line
     */
    crossedCheckpoint(car, checkpoint) {
        // Get car position relative to checkpoint line
        const toStart = Vector2.subtract(car.position, checkpoint.start);
        const toEnd = Vector2.subtract(car.position, checkpoint.end);
        
        // Check if car is near the checkpoint line
        const lineVec = Vector2.subtract(checkpoint.end, checkpoint.start);
        const lineLength = lineVec.length();
        
        // Project car position onto line
        const t = toStart.dot(lineVec) / (lineLength * lineLength);
        
        // Check if projection is on the line segment
        if (t < 0 || t > 1) return false;
        
        // Calculate distance to line
        const projection = Vector2.add(checkpoint.start, Vector2.multiply(lineVec, t));
        const distance = car.position.distanceTo(projection);
        
        // Check if close enough to checkpoint
        return distance < car.radius + 20;
    }
    
    /**
     * Get race positions for all cars
     */
    getPositions(cars) {
        // Sort cars by progress
        const sorted = [...cars].sort((a, b) => {
            const dataA = this.carData.get(a);
            const dataB = this.carData.get(b);
            
            if (!dataA || !dataB) return 0;
            
            // Finished cars first, sorted by finish time
            if (dataA.finished && dataB.finished) {
                return dataA.finishTime - dataB.finishTime;
            }
            if (dataA.finished) return -1;
            if (dataB.finished) return 1;
            
            // Sort by lap
            if (dataA.lap !== dataB.lap) {
                return dataB.lap - dataA.lap;
            }
            
            // Sort by checkpoint
            if (dataA.currentCheckpoint !== dataB.currentCheckpoint) {
                return dataB.currentCheckpoint - dataA.currentCheckpoint;
            }
            
            // Sort by distance to next checkpoint
            const nextCheckpointA = this.checkpoints[dataA.currentCheckpoint];
            const nextCheckpointB = this.checkpoints[dataB.currentCheckpoint];
            
            if (nextCheckpointA && nextCheckpointB) {
                const distA = a.position.distanceTo(nextCheckpointA.position);
                const distB = b.position.distanceTo(nextCheckpointB.position);
                return distA - distB;
            }
            
            return 0;
        });
        
        // Create position map
        const positions = new Map();
        for (let i = 0; i < sorted.length; i++) {
            positions.set(sorted[i], i + 1);
        }
        
        return positions;
    }
    
    /**
     * Get car's current lap data
     */
    getCarData(car) {
        return this.carData.get(car);
    }
    
    /**
     * Check if race is complete (all cars finished or player finished)
     */
    isRaceComplete(cars, playerCar) {
        // Check if player finished
        const playerData = this.carData.get(playerCar);
        if (playerData && playerData.finished) {
            return true;
        }
        
        // Check if all cars finished
        let allFinished = true;
        for (const car of cars) {
            const data = this.carData.get(car);
            if (!data || !data.finished) {
                allFinished = false;
                break;
            }
        }
        
        return allFinished;
    }
    
    /**
     * Reset all tracking data
     */
    reset() {
        for (const [car, data] of this.carData) {
            data.currentCheckpoint = 0;
            data.lap = 0;
            data.totalCheckpointsPassed = 0;
            data.finished = false;
            data.finishTime = 0;
            data.lastCheckpointTime = 0;
            data.checkpointHistory = [];
            
            car.currentCheckpoint = 0;
            car.lap = 0;
            car.totalCheckpointsPassed = 0;
            car.finished = false;
            car.finishTime = 0;
        }
    }
}
