import { Vector2D } from '../utils/vector2d.js';

/**
 * Lap Detector - Tracks lap progress and race positions
 */
export class LapDetector {
    /**
     * @param {Track} track - The track with checkpoints
     * @param {number} totalLaps - Number of laps to complete
     */
    constructor(track, totalLaps = 3) {
        this.track = track;
        this.totalLaps = totalLaps;
        this.checkpoints = track.checkpoints;
        
        // Start line checkpoint index (bottom of track)
        this.startLineIndex = 2; // Corresponds to angle PI (bottom)
    }

    /**
     * Update lap progress for all cars
     * @param {Array<Car>} cars - Array of cars
     * @param {number} raceTime - Current race time
     */
    update(cars, raceTime) {
        for (const car of cars) {
            if (car.finished) continue;
            
            this.checkCheckpoints(car, raceTime);
        }
    }

    /**
     * Check if car crossed any checkpoints
     * @param {Car} car - Car to check
     * @param {number} raceTime - Current race time
     */
    checkCheckpoints(car, raceTime) {
        const checkpoints = this.checkpoints;
        const nextCheckpoint = (car.lastCheckpoint + 1) % checkpoints.length;
        
        const cp = checkpoints[nextCheckpoint];
        
        // Check if car crossed this checkpoint
        if (this.crossedCheckpoint(car, cp)) {
            car.lastCheckpoint = nextCheckpoint;
            
            // Check if completed a lap (crossed start line)
            if (nextCheckpoint === this.startLineIndex) {
                car.currentLap++;
                
                // Check if race complete
                if (car.currentLap >= this.totalLaps) {
                    car.finished = true;
                    car.finishTime = raceTime;
                }
            }
        }
    }

    /**
     * Check if car crossed a checkpoint line
     * @param {Car} car - Car to check
     * @param {Object} checkpoint - Checkpoint {x1, y1, x2, y2}
     * @returns {boolean} True if crossed
     */
    crossedCheckpoint(car, checkpoint) {
        // Simple point-to-line segment distance check
        const pos = car.position;
        const p1 = new Vector2D(checkpoint.x1, checkpoint.y1);
        const p2 = new Vector2D(checkpoint.x2, checkpoint.y2);
        
        // Calculate distance to line
        const line = Vector2D.sub(p2, p1);
        const len = line.length();
        
        if (len === 0) return false;
        
        // Project car position onto line
        const t = Math.max(0, Math.min(1, 
            Vector2D.sub(pos, p1).dot(line) / (len * len)));
        
        const closestPoint = Vector2D.add(p1, Vector2D.mul(line, t));
        const dist = pos.distanceTo(closestPoint);
        
        // Consider crossed if within threshold
        const threshold = 30;
        return dist < threshold;
    }

    /**
     * Calculate race positions for all cars
     * @param {Array<Car>} cars - Array of cars
     * @returns {Array<Car>} Cars sorted by position
     */
    calculatePositions(cars) {
        // Sort by: finished first, then by lap, then by checkpoint, then by distance to next
        const sorted = [...cars].sort((a, b) => {
            // Finished cars come first
            if (a.finished && b.finished) {
                return a.finishTime - b.finishTime;
            }
            if (a.finished) return -1;
            if (b.finished) return 1;
            
            // Compare laps
            if (a.currentLap !== b.currentLap) {
                return b.currentLap - a.currentLap;
            }
            
            // Compare checkpoints
            if (a.lastCheckpoint !== b.lastCheckpoint) {
                return b.lastCheckpoint - a.lastCheckpoint;
            }
            
            // Compare distance to next checkpoint
            const nextCheckpoint = (a.lastCheckpoint + 1) % this.checkpoints.length;
            const cp = this.checkpoints[nextCheckpoint];
            const cpCenter = new Vector2D(
                (cp.x1 + cp.x2) / 2,
                (cp.y1 + cp.y2) / 2
            );
            
            const distA = a.position.distanceToSq(cpCenter);
            const distB = b.position.distanceToSq(cpCenter);
            
            return distA - distB;
        });
        
        // Assign positions
        sorted.forEach((car, index) => {
            car.position = index + 1;
        });
        
        return sorted;
    }

    /**
     * Get progress percentage through current lap
     * @param {Car} car - Car to check
     * @returns {number} Progress (0-1)
     */
    getLapProgress(car) {
        const checkpointProgress = (car.lastCheckpoint + 1) / this.checkpoints.length;
        return checkpointProgress;
    }

    /**
     * Reset lap detector state
     */
    reset() {
        // Lap detector state is stored on cars, nothing to reset here
    }
}