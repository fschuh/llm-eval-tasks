import { Vector2 } from '../math/Vector2.js';

/**
 * Base Car class with arcade physics
 * Provides common functionality for player and AI cars
 */
export class Car {
    /**
     * @param {Vector2} position - Initial position
     * @param {number} heading - Initial heading in radians
     */
    constructor(position = new Vector2(), heading = 0) {
        // Physics properties
        this.position = position.clone();
        this.velocity = new Vector2(0, 0);
        this.acceleration = new Vector2(0, 0);
        this.heading = heading;
        this.speed = 0;

        // Car characteristics
        this.maxSpeed = 300;
        this.accelerationForce = 200;
        this.brakingForce = 400;
        this.turningSpeed = 3;
        this.driftFactor = 0.95;
        this.friction = 0.98;

        // Dimensions
        this.width = 20;
        this.height = 36;

        // Lap tracking
        this.lap = 0;
        this.checkpointIndex = 0;
        this.lastDistance = Infinity;
        
        // AI tracking
        this.aiTargetIndex = 0;
    }

    /**
     * Update car physics
     * @param {number} dt - Time step in seconds
     * @param {Object} input - Input object with throttle, steering, brake properties
     * @param {boolean} isPlayer - Whether this is the player car
     */
    update(dt, input, isPlayer) {
        // Calculate steering angle
        const steeringAngle = this.calculateSteering(input, dt, isPlayer);

        // Apply steering
        this.heading += steeringAngle;

        // Calculate throttle and braking
        const throttle = this.calculateThrottle(input, isPlayer);

        // Calculate forward and right vectors
        const forward = Vector2.fromPolar(1, this.heading);
        const right = Vector2.fromPolar(1, this.heading + Math.PI / 2);

        // Apply acceleration
        if (throttle > 0) {
            this.acceleration = forward.clone().multiply(throttle * this.accelerationForce);
        } else if (throttle < 0) {
            this.acceleration = forward.clone().multiply(throttle * this.brakingForce);
        } else {
            this.acceleration = new Vector2(0, 0);
        }

        // Apply drag/friction
        this.velocity = this.velocity.multiply(this.friction);

        // Update velocity
        this.velocity = this.velocity.add(this.acceleration.clone().multiply(dt));

        // Cap speed
        const speed = this.velocity.length();
        if (speed > this.maxSpeed) {
            this.velocity.normalize().multiply(this.maxSpeed);
        }

        // Apply drift (velocity doesn't instantly align with heading)
        const forwardDot = this.velocity.dot(forward);
        const lateralVelocity = this.velocity.clone().subtract(forward.clone().multiply(forwardDot));
        this.velocity = forward.clone().multiply(forwardDot).add(lateralVelocity.multiply(this.driftFactor));

        // Update position
        this.position = this.position.add(this.velocity.clone().multiply(dt));

        // Update speed for convenience
        this.speed = this.velocity.length();
    }

    /**
     * Calculate steering angle based on input
     * @param {Object} input - Input object
     * @param {number} dt - Time step
     * @param {boolean} isPlayer - Whether this is the player car
     * @returns {number} Steering angle in radians
     */
    calculateSteering(input, dt, isPlayer) {
        if (isPlayer) {
            return input.steering * this.turningSpeed * dt;
        }
        return 0;
    }

    /**
     * Calculate throttle based on input
     * @param {Object} input - Input object
     * @param {boolean} isPlayer - Whether this is the player car
     * @returns {number} Throttle value (-1 to 1)
     */
    calculateThrottle(input, isPlayer) {
        if (isPlayer) {
            let throttle = input.throttle;
            if (input.brake) {
                throttle = -1;
            }
            return throttle;
        }
        return 1; // AI always accelerates
    }

    /**
     * Apply a force to the car
     * @param {Vector2} force - Force vector to apply
     */
    applyForce(force) {
        this.acceleration = force.clone().divide(1); // Mass is 1 for now
    }

    /**
     * Apply braking force
     */
    applyBraking() {
        const forward = Vector2.fromPolar(1, this.heading);
        this.acceleration = forward.clone().multiply(-this.brakingForce);
    }

    /**
     * Apply steering input
     * @param {number} direction - Steering direction (-1 left, 1 right)
     * @param {number} dt - Time step
     * @returns {number} Steering angle applied
     */
    steer(direction, dt) {
        const steeringAngle = direction * this.turningSpeed * dt;
        this.heading += steeringAngle;
        return steeringAngle;
    }

    /**
     * Get the forward direction vector
     * @returns {Vector2} Forward vector
     */
    getForward() {
        return Vector2.fromPolar(1, this.heading);
    }

    /**
     * Get the right direction vector
     * @returns {Vector2} Right vector
     */
    getRight() {
        return Vector2.fromPolar(1, this.heading + Math.PI / 2);
    }

    /**
     * Check if car is on track
     * @param {Vector2[]} trackPoints - Track center points
     * @param {number} trackWidth - Track width
     * @returns {boolean} True if car is on track
     */
    isOnTrack(trackPoints, trackWidth) {
        let closestDist = Infinity;
        let closestIndex = 0;

        for (let i = 0; i < trackPoints.length; i++) {
            const dist = this.position.distanceSquared(trackPoints[i]);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }

        const trackCenter = trackPoints[closestIndex];
        const toCar = this.position.clone().subtract(trackCenter);
        const distFromCenter = toCar.length();
        const maxTrackRadius = trackWidth / 2;

        return distFromCenter <= maxTrackRadius;
    }

    /**
     * Get car bounds for collision detection
     * @returns {Object} Bounds object with center, width, height, and rotation
     */
    getBounds() {
        return {
            center: this.position,
            width: this.width,
            height: this.height,
            rotation: this.heading
        };
    }

    /**
     * Reset car to default state
     */
    reset() {
        this.velocity = new Vector2(0, 0);
        this.acceleration = new Vector2(0, 0);
        this.speed = 0;
    }
}
