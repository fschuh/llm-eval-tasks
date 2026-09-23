import { GameConfig } from '../core/Constants.js';

export class LapDetector {
    constructor(track) {
        this.track = track;
        this.state = new Map();
        this.lapCompletionCallbacks = new Map(); // CarId -> callback functions
    }
    
    initializeCar(car) {
        if (!this.state.has(car.id)) {
            this.state.set(car.id, {
                currentLap: 0,
                totalRaceTime: 0,
                lapTimes: [],
                bestLapTime: null,
                raceStartTime: null,
                lastCheckpoint: -1,
                checkpointsPassed: new Set(),
                hasCrossedStartForward: false,
                hasStartedRace: false,
                lastPosition: car.position.clone()
            });
        }
    }
    
    update(car, dt, raceTime) {
        this.initializeCar(car);
        const carState = this.state.get(car.id);
        
        // Store current position for next frame
        const currentPosition = car.position.clone();
        const previousPosition = carState.lastPosition.clone();
        carState.lastPosition = currentPosition;
        
        // Initialize race start time on first update
        if (carState.raceStartTime === null) {
            carState.raceStartTime = raceTime;
        }
        
        // Update total race time
        carState.totalRaceTime = raceTime - carState.raceStartTime;
        
        // Check finish line crossing (direction matters!)
        const finishLine = this.track.getFinishLine();
        if (finishLine) {
            const crossedForward = this.checkLineCrossingDirection(
                previousPosition,
                currentPosition,
                finishLine,
                true // Check forward direction
            );
            const crossedBackward = this.checkLineCrossingDirection(
                previousPosition,
                currentPosition,
                finishLine,
                false // Check backward direction
            );
            
            if (crossedForward) {
                // Valid forward crossing of finish line
                if (!carState.hasStartedRace) {
                    // First crossing starts the race
                    carState.hasStartedRace = true;
                    carState.hasCrossedStartForward = true;
                } else if (carState.hasStartedRace && this.hasCompletedAllCheckpoints(carState)) {
                    // Completed a full lap
                    this.completeLap(car, carState, raceTime);
                }
            } else if (crossedBackward) {
                // Backward crossing - invalidate lap progress
                carState.checkpointsPassed.clear();
                carState.lastCheckpoint = -1;
            }
        }
        
        // Check regular checkpoint crossings
        for (const checkpoint of this.track.checkpoints) {
            if (this.checkLineCrossingDirection(previousPosition, currentPosition, checkpoint, true)) {
                carState.checkpointsPassed.add(checkpoint.id);
                carState.lastCheckpoint = checkpoint.id;
            }
        }
    }
    
    checkLineCrossingDirection(prevPos, currPos, lineSegment, checkForward) {
        // Line segment intersection test
        const p1 = prevPos;
        const p2 = currPos;
        const p3 = lineSegment.start;
        const p4 = lineSegment.end;
        
        const d1 = this.direction(p3, p4, p1);
        const d2 = this.direction(p3, p4, p2);
        const d3 = this.direction(p1, p2, p3);
        const d4 = this.direction(p1, p2, p4);
        
        let intersects = false;
        
        // Check proper intersection
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            intersects = true;
        }
        
        // Check colinear cases
        if (!intersects && (this.onSegment(p3, p4, p1) || this.onSegment(p3, p4, p2) ||
                           this.onSegment(p1, p2, p3) || this.onSegment(p1, p2, p4))) {
            intersects = true;
        }
        
        if (!intersects) {
            return false;
        }
        
        // Check direction using the line's normal vector
        const movementVector = currPos.subtract(prevPos);
        const dotProduct = movementVector.dot(lineSegment.normal);
        
        if (checkForward) {
            return dotProduct > 0; // Moving in direction of normal
        } else {
            return dotProduct < 0; // Moving opposite to normal
        }
    }
    
    direction(p1, p2, p3) {
        return (p3.y - p1.y) * (p2.x - p1.x) - (p3.x - p1.x) * (p2.y - p1.y);
    }
    
    onSegment(p1, p2, p3) {
        return p3.x <= Math.max(p1.x, p2.x) && p3.x >= Math.min(p1.x, p2.x) &&
               p3.y <= Math.max(p1.y, p2.y) && p3.y >= Math.min(p1.y, p2.y);
    }
    
    hasCompletedAllCheckpoints(carState) {
        return carState.checkpointsPassed.size === this.track.checkpoints.length;
    }
    
    completeLap(car, carState, raceTime) {
        carState.currentLap++;
        
        // Calculate lap time
        const lapTime = carState.totalRaceTime -
                       (carState.lapTimes.reduce((sum, time) => sum + time, 0) || 0);
        carState.lapTimes.push(lapTime);
        
        // Update best lap time
        if (carState.bestLapTime === null || lapTime < carState.bestLapTime) {
            carState.bestLapTime = lapTime;
        }
        
        // Reset checkpoint progress for next lap
        carState.checkpointsPassed.clear();
        carState.lastCheckpoint = -1;
        
        // Trigger lap completion callback if registered
        if (this.lapCompletionCallbacks.has(car.id)) {
            this.lapCompletionCallbacks.get(car.id)(carState.currentLap, lapTime);
        }
        
        // Check if race is finished
        if (carState.currentLap >= GameConfig.TOTAL_LAPS) {
            // Race completed
        }
    }
    
    getCarState(carId) {
        return this.state.get(carId) || null;
    }
    
    getCurrentLap(carId) {
        const state = this.getCarState(carId);
        return state ? state.currentLap : 0;
    }
    
    getTotalRaceTime(carId) {
        const state = this.getCarState(carId);
        return state ? state.totalRaceTime : 0;
    }
    
    getBestLapTime(carId) {
        const state = this.getCarState(carId);
        return state ? state.bestLapTime : null;
    }
    
    getLapTimes(carId) {
        const state = this.getCarState(carId);
        return state ? [...state.lapTimes] : [];
    }
    
    hasStartedRace(carId) {
        const state = this.getCarState(carId);
        return state ? state.hasStartedRace : false;
    }
    
    isRaceFinished(carId) {
        const state = this.getCarState(carId);
        return state ? state.currentLap >= GameConfig.TOTAL_LAPS : false;
    }
    
    registerLapCallback(carId, callback) {
        this.lapCompletionCallbacks.set(carId, callback);
    }
    
    getProgress(carId) {
        const state = this.getCarState(carId);
        if (!state) return 0;
        
        const totalCheckpoints = this.track.checkpoints.length;
        const currentProgress = state.currentLap * totalCheckpoints + state.checkpointsPassed.size;
        const totalRequired = GameConfig.TOTAL_LAPS * totalCheckpoints;
        
        return Math.min(currentProgress / totalRequired, 1);
    }
}