import { Car } from './Car.js';
import { Vector2 } from '../math/Vector2.js';

/**
 * Player-controlled car with arcade physics
 * Extends the base Car class with player-specific input handling
 */
export class PlayerCar extends Car {
    /**
     * @param {Vector2} position - Initial position
     * @param {number} heading - Initial heading in radians
     */
    constructor(position = new Vector2(), heading = 0) {
        super(position, heading);

        // Player-specific physics properties
        this.maxSpeed = 300;
        this.accelerationForce = 220;
        this.brakingForce = 450;
        this.turningSpeed = 3.2;
        this.driftFactor = 0.92;
        this.friction = 0.97;

        // Input state
        this.input = {
            throttle: 0,
            steering: 0,
            brake: false
        };

        // Visual indicators
        this.color = '#e74c3c';
        this.hasDrifted = false;
        this.driftAngle = 0;
    }

    /**
     * Update car physics and process input
     * @param {number} dt - Time step in seconds
     * @param {Object} input - Input handler with throttle, steering, brake properties
     */
    update(dt, input) {
        // Process input and update internal state
        this.handleInput(input);

        // Update physics with processed input
        super.update(dt, this.input, true);

        // Track drift for visual effects
        this.updateDrift(dt);
    }

    /**
     * Process keyboard input and update input state
     * @param {Object} inputHandler - Input handler with key states
     */
    handleInput(inputHandler) {
        // Throttle: WASD or Arrow Keys
        // W or Up = positive throttle (forward)
        // S or Down = negative throttle (reverse)
        let throttle = 0;
        if (inputHandler.isDown('KeyW') || inputHandler.isDown('ArrowUp')) {
            throttle = 1;
        } else if (inputHandler.isDown('KeyS') || inputHandler.isDown('ArrowDown')) {
            throttle = -1;
        }

        // Steering: A or D or Left/Right arrows
        let steering = 0;
        if (inputHandler.isDown('KeyA') || inputHandler.isDown('ArrowLeft')) {
            steering = -1;
        } else if (inputHandler.isDown('KeyD') || inputHandler.isDown('ArrowRight')) {
            steering = 1;
        }

        // Brake: Space key
        const brake = inputHandler.isDown('Space');

        // Update input state
        this.input.throttle = throttle;
        this.input.steering = steering;
        this.input.brake = brake;
    }

    /**
     * Apply acceleration force
     * @param {number} forceMagnitude - Magnitude of force to apply
     */
    applyForce(forceMagnitude) {
        const forward = this.getForward();
        const force = forward.multiply(forceMagnitude);
        super.applyForce(force);
    }

    /**
     * Apply braking force
     * @param {number} brakeMagnitude - Magnitude of braking (0-1)
     */
    applyBraking(brakeMagnitude = 1) {
        const forward = this.getForward();
        const brakingForce = forward.multiply(-this.brakingForce * brakeMagnitude);
        super.applyForce(brakingForce);
    }

    /**
     * Apply steering input
     * @param {number} direction - Steering direction (-1 left, 0 straight, 1 right)
     * @param {number} dt - Time step
     * @returns {number} Steering angle applied
     */
    steer(direction, dt) {
        return super.steer(direction, dt);
    }

    /**
     * Update drift tracking for visual effects
     * @param {number} dt - Time step
     */
    updateDrift(dt) {
        const forward = this.getForward();
        const velocityDir = this.velocity.normalized();
        
        // Calculate angle between forward direction and velocity (drift angle)
        const dot = forward.dot(velocityDir);
        this.driftAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

        // Check if car is drifting significantly
        this.hasDrifted = this.driftAngle > 0.2 && this.speed > 50;
    }

    /**
     * Get the current drift angle in degrees
     * @returns {number} Drift angle in degrees
     */
    getDriftAngle() {
        return (this.driftAngle * 180) / Math.PI;
    }

    /**
     * Get the lateral velocity (sideways movement)
     * @returns {number} Lateral velocity magnitude
     */
    getLateralVelocity() {
        const forward = this.getForward();
        const forwardDot = this.velocity.dot(forward);
        const forwardVelocity = forward.clone().multiply(forwardDot);
        const lateralVelocity = this.velocity.clone().subtract(forwardVelocity);
        return lateralVelocity.length();
    }

    /**
     * Apply a power-up or temporary boost
     * @param {number} boostSpeed - Additional speed to add
     * @param {number} duration - Duration of boost in seconds
     */
    applyBoost(boostSpeed, duration) {
        // Store boost state (simplified implementation)
        this.maxSpeed += boostSpeed;
        setTimeout(() => {
            this.maxSpeed -= boostSpeed;
        }, duration * 1000);
    }

    /**
     * Reset car to starting position
     * @param {Vector2} position - New position
     * @param {number} heading - New heading
     */
    reset(position, heading) {
        super.reset();
        this.position = position.clone();
        this.velocity = new Vector2(0, 0);
        this.acceleration = new Vector2(0, 0);
        this.heading = heading;
        this.speed = 0;
        this.lap = 0;
        this.checkpointIndex = 0;
    }

    /**
     * Get car stats for debugging or UI
     * @returns {Object} Car statistics
     */
    getStats() {
        return {
            speed: Math.round(this.speed),
            maxSpeed: this.maxSpeed,
            throttle: this.input.throttle,
            steering: this.input.steering,
            brake: this.input.brake,
            driftAngle: Math.round(this.getDriftAngle()),
            lateralVelocity: Math.round(this.getLateralVelocity()),
            lap: this.lap,
            checkpointIndex: this.checkpointIndex
        };
    }

    /**
     * Check if car is on track and apply off-track penalties
     * @param {Vector2[]} trackPoints - Track center points
     * @param {number} trackWidth - Track width
     * @returns {boolean} True if car is on track
     */
    checkTrackLimits(trackPoints, trackWidth) {
        const onTrack = super.isOnTrack(trackPoints, trackWidth);

        if (!onTrack) {
            // Apply off-track penalty: reduce speed
            this.velocity = this.velocity.multiply(0.5);
            this.acceleration = new Vector2(0, 0);
        }

        return onTrack;
    }
}
