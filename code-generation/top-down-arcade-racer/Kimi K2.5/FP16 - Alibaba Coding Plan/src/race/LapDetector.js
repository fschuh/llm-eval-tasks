import { EventBusInstance as EventBus } from '../core/EventBus.js';

/**
 * LapDetector - Validates lap completion using waypoints
 */
export class LapDetector {
    /**
     * Create a new lap detector
     * @param {Track} track - Track to detect laps on
     */
    constructor(track) {
        this.track = track;
        this.cars = [];
        this.carWaypointProgress = new Map(); // carId -> last validated waypoint
    }

    /**
     * Register a car for lap detection
     * @param {Car} car - Car to register
     */
    registerCar(car) {
        if (!this.cars.includes(car)) {
            this.cars.push(car);
            this.carWaypointProgress.set(car.id, 0);
        }
    }

    /**
     * Unregister a car
     * @param {Car} car - Car to unregister
     */
    unregisterCar(car) {
        const index = this.cars.indexOf(car);
        if (index > -1) {
            this.cars.splice(index, 1);
            this.carWaypointProgress.delete(car.id);
        }
    }

    /**
     * Update lap detection for all cars
     * @param {number} currentTime - Current race time
     */
    update(currentTime) {
        for (const car of this.cars) {
            if (car.raceState.finished) continue;
            
            this.checkCarProgress(car, currentTime);
        }
    }

    /**
     * Check a car's waypoint progress
     * @param {Car} car - Car to check
     * @param {number} currentTime - Current race time
     */
    checkCarProgress(car, currentTime) {
        const currentWaypoint = car.raceState.currentWaypoint;
        const expectedWaypoint = this.carWaypointProgress.get(car.id) || 0;
        const totalWaypoints = this.track.getTotalWaypoints();

        // Check if car hit the expected next waypoint
        if (currentWaypoint === expectedWaypoint) {
            // Validate this waypoint
            this.validateWaypointProgress(car, currentWaypoint, currentTime);
        }

        // Check for track cuts (skipped waypoints)
        const waypointDiff = (currentWaypoint - expectedWaypoint + totalWaypoints) % totalWaypoints;
        if (waypointDiff > 1 && waypointDiff < totalWaypoints / 2) {
            // Possible track cut
            this.flagTrackCut(car, expectedWaypoint, currentWaypoint);
        }
    }

    /**
     * Validate waypoint progress
     * @param {Car} car - Car that hit waypoint
     * @param {number} waypointIndex - Waypoint index
     * @param {number} currentTime - Current race time
     * @returns {boolean} True if valid
     */
    validateWaypointProgress(car, waypointIndex, currentTime) {
        const totalWaypoints = this.track.getTotalWaypoints();
        const expectedWaypoint = this.carWaypointProgress.get(car.id) || 0;

        // Check if this is the expected waypoint
        if (waypointIndex !== expectedWaypoint) {
            return false;
        }

        // Advance expected waypoint
        const nextWaypoint = (waypointIndex + 1) % totalWaypoints;
        this.carWaypointProgress.set(car.id, nextWaypoint);

        // Emit checkpoint event
        EventBus.emit('car:checkpoint', {
            carId: car.id,
            waypointIndex: waypointIndex,
            isStartFinish: waypointIndex === 0
        });

        // Check if completed lap (passed start/finish)
        if (waypointIndex === 0 && car.raceState.currentLap > 0) {
            this.completeLap(car, currentTime);
        }

        return true;
    }

    /**
     * Complete a lap
     * @param {Car} car - Car completing lap
     * @param {number} currentTime - Current race time
     */
    completeLap(car, currentTime) {
        const lapTime = currentTime - car.raceState.lapStartTime;
        
        // Validate lap time (must be reasonable - not too fast)
        const minLapTime = 5; // Minimum 5 seconds
        if (lapTime < minLapTime) {
            // Invalid lap - too fast (possible cheating)
            return;
        }

        // Update car's lap state
        car.completeLap(currentTime);

        // Emit lap completed event
        EventBus.emit('race:lapCompleted', {
            carId: car.id,
            lapTime: lapTime,
            lapNumber: car.raceState.currentLap
        });
    }

    /**
     * Flag a track cut (car skipped waypoints)
     * @param {Car} car - Car that cut track
     * @param {number} expected - Expected waypoint
     * @param {number} actual - Actual waypoint hit
     */
    flagTrackCut(car, expected, actual) {
        // For now, just log the track cut
        // In a full game, this could invalidate the lap or apply a penalty
        EventBus.emit('car:trackCut', {
            carId: car.id,
            expectedWaypoint: expected,
            actualWaypoint: actual
        });

        // Update expected to actual to prevent multiple flags
        this.carWaypointProgress.set(car.id, actual);
    }

    /**
     * Reset lap detection for a car
     * @param {Car} car - Car to reset
     */
    resetCar(car) {
        this.carWaypointProgress.set(car.id, 0);
    }

    /**
     * Reset all cars
     */
    resetAll() {
        for (const car of this.cars) {
            this.carWaypointProgress.set(car.id, 0);
        }
    }

    /**
     * Clear all registered cars
     */
    clear() {
        this.cars = [];
        this.carWaypointProgress.clear();
    }

    /**
     * Get car's expected next waypoint
     * @param {string} carId - Car ID
     * @returns {number} Expected waypoint index
     */
    getExpectedWaypoint(carId) {
        return this.carWaypointProgress.get(carId) || 0;
    }

    /**
     * Check if car has valid lap progress
     * @param {Car} car - Car to check
     * @returns {boolean} True if progress is valid
     */
    hasValidProgress(car) {
        const expected = this.carWaypointProgress.get(car.id) || 0;
        const current = car.raceState.currentWaypoint;
        const total = this.track.getTotalWaypoints();
        
        // Valid if current matches expected or is one behind (normal)
        const diff = (current - expected + total) % total;
        return diff <= 1;
    }
}
