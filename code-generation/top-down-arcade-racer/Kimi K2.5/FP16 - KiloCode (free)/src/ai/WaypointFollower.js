import { Vector2 } from '../utils/Vector2.js';

/**
 * Waypoint follower for AI navigation with steering behaviors
 */
export class WaypointFollower {
    constructor(car, track, config) {
        this.car = car;
        this.track = track;
        this.config = config;
        this.currentWaypointIndex = 0;
        this.targetWaypoint = null;

        // AI tuning parameters
        this.lookaheadDistance = 60;        // Distance to look ahead for steering
        this.brakeDistance = 120;           // Distance to start braking
        this.maxSteerAngle = Math.PI / 4;   // Maximum steering angle (45 degrees)
        this.cornerSpeedFactor = 0.7;       // Speed multiplier for corners

        // State
        this.stuckTimer = 0;
        this.lastPosition = car.physics.position.clone();
    }

    /**
     * Reset the follower
     */
    reset() {
        this.currentWaypointIndex = 0;
        this.targetWaypoint = null;
        this.stuckTimer = 0;
        this.lastPosition = this.car.physics.position.clone();
    }

    /**
     * Update AI steering
     */
    update(dt) {
        if (!this.targetWaypoint) {
            this.findNearestWaypoint();
        }

        // Check if reached current waypoint
        if (this.hasReachedWaypoint()) {
            this.advanceToNextWaypoint();
        }

        // Calculate steering
        const steeringInput = this.calculateSteering();
        const throttleInput = this.calculateThrottle();

        // Apply to car
        this.car.physics.steering = steeringInput;
        this.car.physics.isAccelerating = throttleInput > 0;
        this.car.physics.isBraking = throttleInput < 0;

        // Check if stuck
        this.checkIfStuck();
    }

    /**
     * Find nearest waypoint to initialize
     */
    findNearestWaypoint() {
        let nearestDist = Infinity;
        let nearestIndex = 0;

        for (let i = 0; i < this.track.waypoints.length; i++) {
            const wp = this.track.waypoints[i];
            const dist = this.car.physics.position.distanceSquaredTo(wp.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIndex = i;
            }
        }

        this.currentWaypointIndex = nearestIndex;
        this.targetWaypoint = this.track.waypoints[nearestIndex];
    }

    /**
     * Check if car has reached the current waypoint
     */
    hasReachedWaypoint() {
        const dist = this.car.physics.position.distanceTo(this.targetWaypoint.position);
        return dist < this.lookaheadDistance;
    }

    /**
     * Advance to next waypoint
     */
    advanceToNextWaypoint() {
        this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.track.waypoints.length;
        this.targetWaypoint = this.track.waypoints[this.currentWaypointIndex];

        // Update car's checkpoint tracking
        if (this.targetWaypoint.isCheckpoint) {
            this.car.currentCheckpoint = this.currentWaypointIndex;
        }
    }

    /**
     * Calculate steering input (-1 to 1)
     */
    calculateSteering() {
        const carPos = this.car.physics.position;
        const targetPos = this.targetWaypoint.position;

        // Calculate desired direction
        const toTarget = targetPos.subtract(carPos).normalize();

        // Get car's forward vector
        const forward = new Vector2(Math.cos(this.car.physics.heading), Math.sin(this.car.physics.heading));

        // Calculate angle to target using cross and dot products
        // angle = atan2(cross(forward, toTarget), dot(forward, toTarget))
        const cross = forward.x * toTarget.y - forward.y * toTarget.x;
        const dot = forward.x * toTarget.x + forward.y * toTarget.y;
        let angle = Math.atan2(cross, dot);

        // Normalize angle to [-π, π] (already is from atan2)
        // Convert to steering input (-1 to 1)
        let steering = angle / this.maxSteerAngle;
        steering = Math.max(-1, Math.min(1, steering));

        // Add some noise based on AI skill
        if (this.config) {
            const error = this.config.getSteeringNoise();
            steering += error;
            steering = Math.max(-1, Math.min(1, steering));
        }

        return steering;
    }

    /**
     * Calculate throttle input (-1 for brake, 0 for coast, 1 for accelerate)
     */
    calculateThrottle() {
        const speed = this.car.physics.speed;
        const maxSpeed = this.car.physics.maxSpeed * (this.config ? this.config.maxSpeedVariation : 1);

        // Look ahead for sharp turns
        const turnAngle = this.calculateTurnAngle();

        // Slow down for sharp turns
        let targetSpeed = maxSpeed;
        if (turnAngle > Math.PI / 6) {
            targetSpeed *= this.cornerSpeedFactor;
        }
        if (turnAngle > Math.PI / 3) {
            targetSpeed *= 0.5;
        }

        // Distance to target
        const distToTarget = this.car.physics.position.distanceTo(this.targetWaypoint.position);

        // Brake if approaching turn too fast
        if (distToTarget < this.brakeDistance && speed > targetSpeed) {
            return -0.5; // Brake
        }

        // Accelerate if below target speed
        if (speed < targetSpeed * 0.9) {
            return 1; // Accelerate
        }

        // Coast
        return 0;
    }

    /**
     * Calculate angle of upcoming turn
     */
    calculateTurnAngle() {
        const current = this.targetWaypoint;
        const next = current.next;

        const currentDir = current.tangent;
        const nextDir = next.tangent;

        // Calculate angle between directions
        const dot = currentDir.dot(nextDir);
        // Clamp for numerical stability
        const clampedDot = Math.max(-1, Math.min(1, dot));
        return Math.acos(clampedDot);
    }

    /**
     * Check if car is stuck and handle it
     */
    checkIfStuck() {
        const moveDist = this.car.physics.position.distanceTo(this.lastPosition);

        if (moveDist < 1) {
            this.stuckTimer++;

            // If stuck for too long, reverse and try different angle
            if (this.stuckTimer > 60) { // 1 second at 60 FPS
                this.car.physics.isBraking = true;
                this.car.physics.isAccelerating = false;
                this.car.physics.steering = (this.stuckTimer % 20 < 10) ? 1 : -1;
            }
        } else {
            this.stuckTimer = 0;
        }

        this.lastPosition = this.car.physics.position.clone();
    }
}