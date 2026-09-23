/**
 * Base Car Class
 * 
 * Implements car physics integration including acceleration, braking,
 * steering, and friction for the racing game.
 */

import { Entity } from './Entity.js';
import { PhysicsBody, PHYSICS_CONFIG } from '../physics/PhysicsBody.js';
import { Vector2 } from '../core/Vector2.js';

/**
 * Car class with physics integration
 */
export class Car extends Entity {
    /**
     * Creates a new car
     * @param {Object} options - Configuration options
     * @param {Vector2} options.position - Initial position
     * @param {number} options.angle - Initial angle in radians
     * @param {number} options.color - Car color
     */
    constructor({ position = new Vector2(), angle = 0, color = '#ff0000' } = {}) {
        super({ position, angle });

        this.tag = 'car';

        /**
         * Physics body for the car
         * @type {PhysicsBody}
         */
        this.physics = new PhysicsBody({
            position: position.clone(),
            angle: angle
        });

        /**
         * Car color for rendering
         * @type {string}
         */
        this.color = color;

        /**
         * Car width (for rendering)
         * @type {number}
         */
        this.width = PHYSICS_CONFIG.carRadius * 2;

        /**
         * Car height (for rendering)
         * @type {number}
         */
        this.height = PHYSICS_CONFIG.carRadius * 2;

        /**
         * Current throttle input (0 to 1)
         * @type {number}
         */
        this.throttle = 0;

        /**
         * Current brake input (0 to 1)
         * @type {number}
         */
        this.brake = 0;

        /**
         * Current steering input (-1 to 1)
         * @type {number}
         */
        this.steering = 0;

        /**
         * Maximum speed for this car
         * @type {number}
         */
        this.maxSpeed = PHYSICS_CONFIG.maxSpeed;

        /**
         * Acceleration force
         * @type {number}
         */
        this.accelerationForce = PHYSICS_CONFIG.acceleration;

        /**
         * Brake force
         * @type {number}
         */
        this.brakeForce = PHYSICS_CONFIG.brakeForce;

        /**
         * Turn speed
         * @type {number}
         */
        this.turnSpeed = PHYSICS_CONFIG.turnSpeed;

        /**
         * Lap count
         * @type {number}
         */
        this.lap = 0;

        /**
         * Current checkpoint index
         * @type {number}
         */
        this.checkpoint = 0;

        /**
         * Lap time
         * @type {number}
         */
        this.lapTime = 0;

        /**
         * Total race time
         * @type {number}
         */
        this.totalTime = 0;

        /**
         * Lap start position
         * @type {Vector2}
         */
        this.lapStartPosition = position.clone();
    }

    /**
     * Gets the current speed
     * @returns {number} Current speed
     */
    get speed() {
        return this.physics.speed;
    }

    /**
     * Gets the forward direction vector
     * @returns {Vector2} Forward direction
     */
    get forward() {
        return this.physics.forward;
    }

    /**
     * Gets the right direction vector
     * @returns {Vector2} Right direction
     */
    get right() {
        return this.physics.right;
    }

    /**
     * Updates the car state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Apply physics
        this._applyPhysics(dt);

        // Update base entity
        super.update(dt);
    }

    /**
     * Applies physics to the car
     * @param {number} dt - Time step in seconds
     */
    _applyPhysics(dt) {
        // Get forward and right vectors
        const forward = this.physics.forward;
        const right = this.physics.right;

        // Apply acceleration force
        const accelForce = this.accelerationForce * this.throttle;
        const accelVector = forward.clone().mul(accelForce);
        this.physics.applyForce(accelVector);

        // Apply braking force
        const brakeForce = this.brakeForce * this.brake;
        const brakeVector = forward.clone().mul(-brakeForce);
        this.physics.applyForce(brakeVector);

        // Apply steering torque
        const steerTorque = this.turnSpeed * this.steering;
        this.physics.applyTorque(steerTorque);

        // Update physics body
        this.physics.update(dt);

        // Update entity position and angle
        this.position = this.physics.position.clone();
        this.angle = this.physics.angle;
    }

    /**
     * Accelerates the car
     * @param {number} amount - Acceleration amount (0 to 1)
     */
    accelerate(amount) {
        this.throttle = Math.max(0, Math.min(1, amount));
    }

    /**
     * Brakes the car
     * @param {number} amount - Braking amount (0 to 1)
     */
    brake(amount) {
        this.brake = Math.max(0, Math.min(1, amount));
    }

    /**
     * Steers the car
     * @param {number} amount - Steering amount (-1 to 1)
     */
    steer(amount) {
        this.steering = Math.max(-1, Math.min(1, amount));
    }

    /**
     * Sets car input from a control object
     * @param {Object} input - Input object
     * @param {number} input.throttle - Throttle value (0 to 1)
     * @param {number} input.brake - Brake value (0 to 1)
     * @param {number} input.steer - Steering value (-1 to 1)
     */
    setInput({ throttle = 0, brake = 0, steer = 0 } = {}) {
        this.throttle = Math.max(0, Math.min(1, throttle));
        this.brake = Math.max(0, Math.min(1, brake));
        this.steering = Math.max(-1, Math.min(1, steer));
    }

    /**
     * Renders the car
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        // Draw car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Draw car details (windshield, etc.)
        ctx.fillStyle = '#0000ff';
        ctx.fillRect(0, -this.height / 4, this.width / 2, this.height / 2);

        // Draw steering indicator
        if (this.steering !== 0) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const steerOffset = this.steering * 10;
            ctx.moveTo(0, 0);
            ctx.lineTo(steerOffset, -this.height / 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Resets the car to initial state
     */
    reset() {
        super.reset();
        this.physics.position = this.position.clone();
        this.physics.velocity.set(0, 0);
        this.physics.angularVelocity = 0;
        this.throttle = 0;
        this.brake = 0;
        this.steering = 0;
        this.lap = 0;
        this.checkpoint = 0;
        this.lapTime = 0;
        this.totalTime = 0;
        this.lapStartPosition = this.position.clone();
    }

    /**
     * Serializes car state to JSON
     * @returns {Object} Serialized state
     */
    serialize() {
        const base = super.serialize();
        return {
            ...base,
            physics: {
                position: { x: this.physics.position.x, y: this.physics.position.y },
                velocity: { x: this.physics.velocity.x, y: this.physics.velocity.y },
                angle: this.physics.angle,
                angularVelocity: this.physics.angularVelocity
            },
            color: this.color,
            width: this.width,
            height: this.height,
            throttle: this.throttle,
            brake: this.brake,
            steering: this.steering,
            maxSpeed: this.maxSpeed,
            accelerationForce: this.accelerationForce,
            brakeForce: this.brakeForce,
            turnSpeed: this.turnSpeed,
            lap: this.lap,
            checkpoint: this.checkpoint,
            lapTime: this.lapTime,
            totalTime: this.totalTime
        };
    }

    /**
     * Deserializes car state from JSON
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        super.deserialize(data);
        this.physics.position.set(data.physics.position.x, data.physics.position.y);
        this.physics.velocity.set(data.physics.velocity.x, data.physics.velocity.y);
        this.physics.angle = data.physics.angle;
        this.physics.angularVelocity = data.physics.angularVelocity;
        this.color = data.color;
        this.width = data.width;
        this.height = data.height;
        this.throttle = data.throttle;
        this.brake = data.brake;
        this.steering = data.steering;
        this.maxSpeed = data.maxSpeed;
        this.accelerationForce = data.accelerationForce;
        this.brakeForce = data.brakeForce;
        this.turnSpeed = data.turnSpeed;
        this.lap = data.lap;
        this.checkpoint = data.checkpoint;
        this.lapTime = data.lapTime;
        this.totalTime = data.totalTime;
    }
}