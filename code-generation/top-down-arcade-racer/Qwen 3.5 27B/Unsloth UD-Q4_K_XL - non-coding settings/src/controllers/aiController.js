/**
 * AI Car Controller for waypoint-based racing.
 * Implements intelligent car control with waypoint following, speed adjustment for turns,
 * and deterministic behavior using SeededRNG for reproducible AI actions.
 * 
 * @module AIController
 */
import Vector2 from '../core/vector2.js';
import SeededRNG from '../core/rng.js';

/**
 * AI Controller that manages an AI car's movement along a track using waypoints.
 * The controller calculates steering and throttle based on waypoint navigation,
 * with configurable speed multiplier, reaction delay, and line variance for varied behavior.
 */
class AIController {
    /**
     * Creates a new AIController instance.
     * 
     * @param {Car} car - The Car entity to control
     * @param {Track} track - The Track containing waypoints to follow
     * @param {Object} config - Configuration options for AI behavior
     * @param {number} [config.speedMultiplier=0.85] - Speed multiplier (0.7-1.0) relative to car's maxSpeed
     * @param {number} [config.reactionDelay=20] - Reaction delay in milliseconds (0-50ms)
     * @param {number} [config.lineVariance=0] - Lateral offset from center line (-20 to 20px) for varied racing lines
     * @param {SeededRNG} [config.rng] - Optional SeededRNG instance for deterministic randomness
     * @param {string|number} [config.seed] - Seed for creating a new RNG if rng not provided
     */
    constructor(car, track, config = {}) {
        /** @type {Car} The car entity being controlled */
        this.car = car;
        
        /** @type {Track} The track to follow */
        this.track = track;
        
        // Configuration with defaults
        /** @type {number} Speed multiplier (0.7-1.0) - clamped during initialization */
        this.speedMultiplier = Math.max(0.7, Math.min(1.0, config.speedMultiplier || 0.85));
        
        /** @type {number} Reaction delay in milliseconds (0-50ms) - clamped during initialization */
        this.reactionDelay = Math.max(0, Math.min(50, config.reactionDelay || 20));
        
        /** @type {number} Line variance offset from center (-20 to 20px) - clamped during initialization */
        this.lineVariance = Math.max(-20, Math.min(20, config.lineVariance || 0));
        
        // RNG for deterministic randomness
        if (config.rng instanceof SeededRNG) {
            /** @type {SeededRNG} Random number generator for varied but reproducible behavior */
            this.rng = config.rng;
        } else {
            const seed = config.seed !== undefined ? config.seed : `ai_${car.id || Math.random()}`;
            this.rng = new SeededRNG(seed);
        }
        
        // Navigation state
        /** @type {number} Index of the current target waypoint */
        this.currentWaypointIndex = 0;
        
        /** @type {number} Target speed based on car's maxSpeed and speedMultiplier */
        this.targetSpeed = car.maxSpeed * this.speedMultiplier;
        
        /** @type {number} Current steering angle target in radians */
        this.steeringTarget = 0;
        
        // State machine for AI behavior
        /** @type {'following'|'recovering'} Current AI state */
        this.state = 'following';
        
        // Timing for reaction delay simulation
        /** @type {number} Timestamp when last action was queued */
        this.lastActionTime = 0;
        
        // Initialize RNG-based variance offset (deterministic per car)
        /** @type {number} Randomized line offset within the configured variance range */
        this.offset = this.rng.range(this.lineVariance - 10, this.lineVariance + 10);
    }

    /**
     * Main update loop called each frame.
     * Calculates steering and throttle based on waypoint navigation,
     * applies reaction delay simulation, and manages state transitions.
     * 
     * @param {number} deltaTime - Time elapsed since last update in seconds
     */
    update(deltaTime) {
        // Simulate reaction delay by checking if enough time has passed
        const currentTime = performance.now();
        if (currentTime - this.lastActionTime < this.reactionDelay) {
            return; // Wait for reaction delay to pass
        }
        
        this.lastActionTime = currentTime;
        
        // Get current and next waypoints
        const currentWaypoint = this.track.waypoints[this.currentWaypointIndex];
        const nextWaypoint = this.track.getNextWaypoint(currentWaypoint);
        
        if (!currentWaypoint || !nextWaypoint) {
            return; // Invalid track state
        }
        
        // Check distance to next waypoint and advance if close enough
        const distanceToNext = this.car.position.distanceTo(nextWaypoint.position);
        const detectionRadius = nextWaypoint.radius || 30;
        
        if (distanceToNext < detectionRadius) {
            this.currentWaypointIndex = this.track.getNextWaypointIndex(this.currentWaypointIndex);
            
            // Check for lap completion (passed waypoint 0 after completing track)
            if (this.currentWaypointIndex === 0 && this.car.lapsCompleted !== undefined) {
                // Lap completed - emit event or handle as needed
                this.onLapComplete();
            }
        }
        
        // Update steering based on current state
        switch (this.state) {
            case 'following':
                this._updateFollowingState(currentWaypoint, nextWaypoint);
                break;
            case 'recovering':
                this._updateRecoveringState(currentWaypoint, nextWaypoint);
                break;
        }
        
        // Apply controls to the car
        this._applyControls();
    }

    /**
     * Updates AI behavior when in 'following' state.
     * Calculates steering angle toward next waypoint and adjusts speed for turns.
     * 
     * @param {Waypoint} currentWaypoint - Current target waypoint
     * @param {Waypoint} nextWaypoint - Next waypoint to navigate toward
     */
    _updateFollowingState(currentWaypoint, nextWaypoint) {
        // Calculate the angle needed to reach the next waypoint
        this.steeringTarget = this.getNextSteeringAngle(currentWaypoint, nextWaypoint);
        
        // Check if we should slow down for upcoming turns
        const afterNextWaypoint = this.track.getNextWaypoint(nextWaypoint);
        const shouldSlowDown = this.shouldSlowDownForTurn(nextWaypoint, afterNextWaypoint);
        
        // Adjust target speed based on turn sharpness and distance to waypoint
        const distanceToNext = this.car.position.distanceTo(nextWaypoint.position);
        let effectiveTargetSpeed = this.targetSpeed;
        
        if (shouldSlowDown && distanceToNext < 200) {
            // Reduce speed for sharp turns, more reduction when closer
            const slowFactor = Math.max(0.4, 1 - (distanceToNext / 200));
            effectiveTargetSpeed *= slowFactor;
        }
        
        // Determine throttle based on current speed vs target speed
        const currentSpeed = this.car.velocity.magnitude();
        
        if (currentSpeed < effectiveTargetSpeed * 0.95) {
            // Accelerate to reach target speed
            this._accelerate = true;
            this._brake = false;
        } else if (currentSpeed > effectiveTargetSpeed * 1.05) {
            // Brake if exceeding target speed
            this._accelerate = false;
            this._brake = true;
        } else {
            // Maintain current speed
            this._accelerate = false;
            this._brake = false;
        }
    }

    /**
     * Updates AI behavior when in 'recovering' state.
     * Attempts to get back on track by steering toward the nearest waypoint.
     * 
     * @param {Waypoint} currentWaypoint - Current target waypoint
     * @param {Waypoint} nextWaypoint - Next waypoint to navigate toward
     */
    _updateRecoveringState(currentWaypoint, nextWaypoint) {
        // In recovery mode, prioritize getting back on track
        this.steeringTarget = this.getNextSteeringAngle(currentWaypoint, nextWaypoint);
        
        // Accelerate moderately while recovering
        this._accelerate = true;
        this._brake = false;
        
        // Check if we're back on a reasonable path to the waypoint
        const distanceToNext = this.car.position.distanceTo(nextWaypoint.position);
        if (distanceToNext < 100) {
            // Recovered - switch back to following state
            this.state = 'following';
        }
    }

    /**
     * Calculates the steering angle needed to reach the next waypoint.
     * Uses vector math to determine the direction from car position to target.
     * 
     * @param {Waypoint} currentWaypoint - Current waypoint being approached
     * @param {Waypoint} nextWaypoint - Target waypoint to steer toward
     * @returns {number} Steering angle in radians (positive = right, negative = left)
     */
    getNextSteeringAngle(currentWaypoint, nextWaypoint) {
        // Calculate target position with line variance offset
        const directionToNext = nextWaypoint.position.subtract(currentWaypoint.position);
        const perpendicular = directionToNext.perpendicular().normalize();
        
        // Apply offset for varied racing lines (deterministic per car via RNG)
        const targetPosition = nextWaypoint.position.add(perpendicular.multiply(this.offset));
        
        // Vector from car to target waypoint
        const toTarget = targetPosition.subtract(this.car.position);
        
        // Car's forward direction
        const forward = new Vector2(Math.cos(this.car.angle), Math.sin(this.car.angle));
        
        // Calculate angle difference using cross product for signed result
        // Cross product gives us the sign (left or right)
        const crossProduct = toTarget.cross(forward);
        
        // Normalize vectors for dot product calculation
        const normalizedToTarget = toTarget.normalize();
        const dotProduct = normalizedToTarget.dot(forward);
        
        // Calculate angle using atan2 for full range [-π, π]
        let angleDiff = Math.atan2(crossProduct, dotProduct);
        
        // Clamp steering to car's maximum steering angle
        const maxSteerAngle = this.car.steeringAngle || Math.PI / 6;
        if (angleDiff > maxSteerAngle) {
            angleDiff = maxSteerAngle;
        } else if (angleDiff < -maxSteerAngle) {
            angleDiff = -maxSteerAngle;
        }
        
        return angleDiff;
    }

    /**
     * Determines if the AI should slow down for an upcoming turn.
     * Uses dot product of consecutive waypoint vectors to calculate turn sharpness.
     * 
     * @param {Waypoint} nextWaypoint - The waypoint at the turn
     * @param {Waypoint} afterNextWaypoint - The waypoint after the turn
     * @returns {boolean} True if the turn is sharp enough to warrant slowing down (> 45 degrees)
     */
    shouldSlowDownForTurn(nextWaypoint, afterNextWaypoint) {
        if (!afterNextWaypoint) {
            return false; // No upcoming turn data available
        }
        
        // Calculate vectors for the two segments around the turn
        const prevWaypoint = this.track.getPreviousWaypoint(nextWaypoint);
        if (!prevWaypoint) {
            return false; // Cannot calculate turn angle without previous waypoint
        }
        
        // Vector from previous waypoint to current (incoming direction)
        const incomingVector = nextWaypoint.position.subtract(prevWaypoint.position).normalize();
        
        // Vector from current waypoint to next (outgoing direction)
        const outgoingVector = afterNextWaypoint.position.subtract(nextWaypoint.position).normalize();
        
        // Calculate turn angle using dot product
        // dot = cos(angle), so angle = acos(dot)
        const dotProduct = incomingVector.dot(outgoingVector);
        
        // Clamp to valid range for acos (floating point errors can push slightly outside [-1, 1])
        const clampedDot = Math.max(-1, Math.min(1, dotProduct));
        const turnAngle = Math.acos(clampedDot);
        
        // Convert to degrees for comparison
        const turnAngleDegrees = turnAngle * (180 / Math.PI);
        
        // Slow down if turn angle > 45 degrees
        return turnAngleDegrees > 45;
    }

    /**
     * Applies calculated steering and throttle controls to the car.
     * Converts steering target into left/right input flags based on sign.
     */
    _applyControls() {
        // Determine steering direction from steeringTarget angle
        if (this.steeringTarget > 0.1) {
            // Steer right
            this.car.setControls(this._accelerate, this._brake, false, true);
        } else if (this.steeringTarget < -0.1) {
            // Steer left
            this.car.setControls(this._accelerate, this._brake, true, false);
        } else {
            // Go straight
            this.car.setControls(this._accelerate, this._brake, false, false);
        }
    }

    /**
     * Resets the AI controller to the start of the track.
     * Called when race is restarted or car needs to be reset.
     */
    reset() {
        // Reset waypoint index to start
        this.currentWaypointIndex = 0;
        
        // Reset state machine
        this.state = 'following';
        
        // Reset timing
        this.lastActionTime = performance.now();
        
        // Clear any pending controls
        this._accelerate = false;
        this._brake = false;
        this.steeringTarget = 0;
    }

    /**
     * Callback when a lap is completed.
     * Can be overridden to add custom lap completion behavior.
     */
    onLapComplete() {
        // Default implementation - can be extended by subclasses
        // Increment laps if the car tracks them
        if (this.car.lapsCompleted !== undefined) {
            this.car.lapsCompleted++;
        }
    }

    /**
     * Returns a string representation of the AI controller for debugging.
     * Format: "AIController(carId, waypointIndex, state)"
     * 
     * @returns {string} String representation of the controller
     */
    toString() {
        return `AIController(carId:${this.car.id || 'unknown'}, waypoint:${this.currentWaypointIndex}, state:${this.state})`;
    }
}

export default AIController;
