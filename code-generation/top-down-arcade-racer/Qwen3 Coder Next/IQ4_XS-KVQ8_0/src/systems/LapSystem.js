/**
 * Lap Detection System
 * 
 * Implements checkpoint-based lap detection for cars in the racing game.
 * Tracks car progress around the track, detects lap completions, and
 * maintains lap counts and lap times.
 */

import { Vector2 } from '../core/Vector2.js';

/**
 * Lap system for tracking car progress around the track
 */
export class LapSystem {
    /**
     * Creates a new lap system
     * @param {Object} options - Configuration options
     * @param {Track} options.track - The track to use for lap detection
     * @param {number} options.checkpointDistanceThreshold - Distance threshold for checkpoint detection
     * @param {number} options.finishLineDistanceThreshold - Distance threshold for finish line detection
     */
    constructor({ track, checkpointDistanceThreshold = 50, finishLineDistanceThreshold = 50 } = {}) {
        /**
         * The track to use for lap detection
         * @type {Track}
         */
        this.track = track;

        /**
         * Distance threshold for checkpoint detection
         * @type {number}
         */
        this.checkpointDistanceThreshold = checkpointDistanceThreshold;

        /**
         * Distance threshold for finish line detection
         * @type {number}
         */
        this.finishLineDistanceThreshold = finishLineDistanceThreshold;

        /**
         * Map of car IDs to lap tracking data
         * @type {Map<number, Object>}
         */
        this.carLapData = new Map();

        /**
         * Lap completion callbacks
         * @type {Function[]}
         */
        this.onLapCompleteCallbacks = [];

        /**
         * Checkpoint crossed callbacks
         * @type {Function[]}
         */
        this.onCheckpointCrossedCallbacks = [];
    }

    /**
     * Registers a car for lap tracking
     * @param {Car} car - The car to register
     */
    registerCar(car) {
        if (this.carLapData.has(car.id)) {
            return; // Already registered
        }

        const carData = {
            car: car,
            currentCheckpoint: 0,
            lastCheckpoint: 0,
            currentLap: 1,
            lastWaypointIndex: -1,
            lapStartTime: 0,
            lastLapTime: null,
            totalRaceTime: 0,
            checkpointsVisited: new Set([0]),
            backwardMovementCount: 0,
            lastPosition: car.position.clone(),
            lastAngle: car.angle
        };

        this.carLapData.set(car.id, carData);
    }

    /**
     * Unregisters a car from lap tracking
     * @param {Car} car - The car to unregister
     */
    unregisterCar(car) {
        this.carLapData.delete(car.id);
    }

    /**
     * Updates lap tracking for all registered cars
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        for (const carData of this.carLapData.values()) {
            this._updateCarLapData(carData, dt);
        }
    }

    /**
     * Updates lap tracking for a single car
     * @param {Object} carData - The car's lap data
     * @param {number} dt - Time step in seconds
     */
    _updateCarLapData(carData, dt) {
        const car = carData.car;
        const position = car.position;
        const closestWaypointIndex = this.track.getClosestWaypoint(position);

        // Check for backward movement (cutting corners)
        this._checkBackwardMovement(carData, closestWaypointIndex);

        // Check if car has crossed any checkpoints
        this._checkCheckpointCrossings(carData, closestWaypointIndex);

        // Update lap time
        carData.totalRaceTime += dt;

        // Update last position and angle
        carData.lastPosition = position.clone();
        carData.lastAngle = car.angle;
    }

    /**
     * Checks for backward movement (cutting corners)
     * @param {Object} carData - The car's lap data
     * @param {number} closestWaypointIndex - Index of closest waypoint
     */
    _checkBackwardMovement(carData, closestWaypointIndex) {
        const car = carData.car;
        const lastPosition = carData.lastPosition;
        const currentLap = carData.currentLap;

        // Calculate direction from last position to current position
        const movementVector = car.position.sub(lastPosition);
        const movementDistance = movementVector.length();

        if (movementDistance < 1) return; // Car hasn't moved

        // Get the expected direction based on current checkpoint
        const currentCheckpointIndex = carData.currentCheckpoint;
        const checkpointPos = this.track.getWaypoint(currentCheckpointIndex);
        const nextCheckpointIndex = (currentCheckpointIndex + 1) % this.track.waypoints.length;
        const nextCheckpointPos = this.track.getWaypoint(nextCheckpointIndex);

        // Calculate expected direction (from current checkpoint to next)
        const expectedDirection = nextCheckpointPos.sub(checkpointPos).normalized();

        // Calculate actual movement direction
        const movementDirection = movementVector.normalized();

        // Check if car is moving away from expected direction
        const dotProduct = expectedDirection.dot(movementDirection);

        // If car is moving significantly away from expected direction and
        // hasn't crossed the next checkpoint yet, count it as backward movement
        if (dotProduct < -0.5 && closestWaypointIndex !== nextCheckpointIndex) {
            carData.backwardMovementCount++;
        }
    }

    /**
     * Checks if car has crossed any checkpoints
     * @param {Object} carData - The car's lap data
     * @param {number} closestWaypointIndex - Index of closest waypoint
     */
    _checkCheckpointCrossings(carData, closestWaypointIndex) {
        const car = carData.car;
        const currentCheckpoint = carData.currentCheckpoint;
        const lastCheckpoint = carData.lastCheckpoint;
        const waypoints = this.track.waypoints;

        // If car has moved significantly, check for checkpoint crossings
        const distanceMoved = car.position.distance(carData.lastPosition);
        if (distanceMoved < 1) return;

        // Check if car crossed the finish line (from last waypoint to first)
        if (currentCheckpoint === waypoints.length - 1) {
            const finishLinePos = waypoints[0];
            const distanceToFinish = car.position.distance(finishLinePos);

            if (distanceToFinish <= this.finishLineDistanceThreshold) {
                this._completeLap(carData);
                return;
            }
        }

        // Check if car crossed any other checkpoint
        const nextCheckpoint = (currentCheckpoint + 1) % waypoints.length;

        // Check if car is now closer to the next checkpoint than to current
        const currentCheckpointPos = waypoints[currentCheckpoint];
        const nextCheckpointPos = waypoints[nextCheckpoint];

        const distanceToCurrent = car.position.distance(currentCheckpointPos);
        const distanceToNext = car.position.distance(nextCheckpointPos);

        // If car is closer to next checkpoint and has moved past it
        if (distanceToNext < distanceToCurrent && distanceToNext <= this.checkpointDistanceThreshold) {
            // Verify car is actually moving toward the next checkpoint
            const toNext = nextCheckpointPos.sub(car.position);
            const velocity = car.physics.velocity;
            const dot = toNext.dot(velocity);

            if (dot > 0) {
                this._crossCheckpoint(carData, nextCheckpoint);
            }
        }
    }

    /**
     * Handles checkpoint crossing
     * @param {Object} carData - The car's lap data
     * @param {number} checkpointIndex - Index of crossed checkpoint
     */
    _crossCheckpoint(carData, checkpointIndex) {
        const car = carData.car;

        // Update checkpoint
        carData.lastCheckpoint = carData.currentCheckpoint;
        carData.currentCheckpoint = checkpointIndex;
        carData.checkpointsVisited.add(checkpointIndex);

        // Trigger callbacks
        for (const callback of this.onCheckpointCrossedCallbacks) {
            callback(car, checkpointIndex, carData.currentLap);
        }
    }

    /**
     * Handles lap completion
     * @param {Object} carData - The car's lap data
     */
    _completeLap(carData) {
        const car = carData.car;

        // Calculate lap time
        const lapTime = carData.totalRaceTime - carData.lapStartTime;
        carData.lastLapTime = lapTime;

        // Update lap count
        carData.currentLap++;
        carData.lapStartTime = carData.totalRaceTime;

        // Reset checkpoint to first
        carData.currentCheckpoint = 0;
        carData.lastCheckpoint = this.track.waypoints.length - 1;

        // Trigger callbacks
        for (const callback of this.onLapCompleteCallbacks) {
            callback(car, carData.currentLap, lapTime);
        }
    }

    /**
     * Gets lap data for a specific car
     * @param {Car} car - The car to get data for
     * @returns {Object|null} Lap data or null if not registered
     */
    getCarLapData(car) {
        return this.carLapData.get(car.id);
    }

    /**
     * Gets the current lap for a car
     * @param {Car} car - The car to get lap for
     * @returns {number} Current lap number
     */
    getCurrentLap(car) {
        const carData = this.carLapData.get(car.id);
        return carData ? carData.currentLap : 0;
    }

    /**
     * Gets the current checkpoint for a car
     * @param {Car} car - The car to get checkpoint for
     * @returns {number} Current checkpoint index
     */
    getCurrentCheckpoint(car) {
        const carData = this.carLapData.get(car.id);
        return carData ? carData.currentCheckpoint : 0;
    }

    /**
     * Gets the lap time for a car
     * @param {Car} car - The car to get lap time for
     * @returns {number} Lap time in seconds
     */
    getLapTime(car) {
        const carData = this.carLapData.get(car.id);
        return carData ? carData.totalRaceTime - carData.lapStartTime : 0;
    }

    /**
     * Gets the last lap time for a car
     * @param {Car} car - The car to get last lap time for
     * @returns {number|null} Last lap time in seconds or null if not completed
     */
    getLastLapTime(car) {
        const carData = this.carLapData.get(car.id);
        return carData ? carData.lastLapTime : null;
    }

    /**
     * Gets the total race time for a car
     * @param {Car} car - The car to get total time for
     * @returns {number} Total race time in seconds
     */
    getTotalRaceTime(car) {
        const carData = this.carLapData.get(car.id);
        return carData ? carData.totalRaceTime : 0;
    }

    /**
     * Calculates car position based on lap progress
     * @param {Car} car - The car to calculate position for
     * @param {Car[]} allCars - All cars in the race
     * @returns {number} Position (1 = leader)
     */
    calculatePosition(car, allCars) {
        const carData = this.carLapData.get(car.id);
        if (!carData) return 0;

        // Sort cars by lap (descending), then checkpoint (descending)
        const sortedCars = [...allCars].sort((a, b) => {
            const aData = this.carLapData.get(a.id);
            const bData = this.carLapData.get(b.id);

            if (!aData || !bData) return 0;

            // Compare lap first
            if (aData.currentLap !== bData.currentLap) {
                return bData.currentLap - aData.currentLap;
            }

            // Then compare checkpoint
            if (aData.currentCheckpoint !== bData.currentCheckpoint) {
                return bData.currentCheckpoint - aData.currentCheckpoint;
            }

            // If same checkpoint, compare distance to next checkpoint
            const aNextIndex = (aData.currentCheckpoint + 1) % this.track.waypoints.length;
            const bNextIndex = (bData.currentCheckpoint + 1) % this.track.waypoints.length;

            const aDistance = a.position.distance(this.track.getWaypoint(aNextIndex));
            const bDistance = b.position.distance(this.track.getWaypoint(bNextIndex));

            return aDistance - bDistance;
        });

        return sortedCars.indexOf(car) + 1;
    }

    /**
     * Gets lap progress as a value between 0 and 1
     * @param {Car} car - The car to get progress for
     * @returns {number} Lap progress (0 = start, 1 = finish)
     */
    getLapProgress(car) {
        const carData = this.carLapData.get(car.id);
        if (!carData) return 0;

        const currentCheckpoint = carData.currentCheckpoint;
        const nextCheckpoint = (currentCheckpoint + 1) % this.track.waypoints.length;

        const currentPos = this.track.getWaypoint(currentCheckpoint);
        const nextPos = this.track.getWaypoint(nextCheckpoint);
        const carPos = car.position;

        // Calculate progress along the current segment
        const segmentVector = nextPos.sub(currentPos);
        const segmentLength = segmentVector.length();

        if (segmentLength === 0) return 0;

        const toCar = carPos.sub(currentPos);
        const progress = toCar.dot(segmentVector) / (segmentLength * segmentLength);

        // Normalize to 0-1 range for the entire lap
        const checkpointsPerLap = this.track.waypoints.length;
        const checkpointProgress = currentCheckpoint / checkpointsPerLap;
        const segmentProgress = progress / checkpointsPerLap;

        return checkpointProgress + segmentProgress;
    }

    /**
     * Adds a callback for lap completion
     * @param {Function} callback - Callback function(car, lapNumber, lapTime)
     */
    onLapComplete(callback) {
        this.onLapCompleteCallbacks.push(callback);
    }

    /**
     * Adds a callback for checkpoint crossing
     * @param {Function} callback - Callback function(car, checkpointIndex, lapNumber)
     */
    onCheckpointCrossed(callback) {
        this.onCheckpointCrossedCallbacks.push(callback);
    }

    /**
     * Resets lap data for a car
     * @param {Car} car - The car to reset
     */
    resetCar(car) {
        const carData = this.carLapData.get(car.id);
        if (carData) {
            carData.currentLap = 1;
            carData.currentCheckpoint = 0;
            carData.lastCheckpoint = 0;
            carData.totalRaceTime = 0;
            carData.lapStartTime = 0;
            carData.lastLapTime = null;
            carData.checkpointsVisited.clear();
            carData.checkpointsVisited.add(0);
            carData.backwardMovementCount = 0;
            carData.lastPosition = car.position.clone();
            carData.lastAngle = car.angle;
        }
    }

    /**
     * Resets all lap data
     */
    resetAll() {
        this.carLapData.clear();
    }
}