/**
 * Physics Body Component
 * 
 * Implements physics properties for entities including position,
 * velocity, acceleration, and angular velocity for 2D physics simulation.
 */

import { Vector2 } from '../core/Vector2.js';

/**
 * Physics configuration constants
 */
export const PHYSICS_CONFIG = {
    linearDrag: 0.95,
    angularDrag: 0.90,
    maxSpeed: 300,
    acceleration: 150,
    brakeForce: 300,
    turnSpeed: 3.0,
    restitution: 0.3,
    mass: 1.0,
    carRadius: 15
};

/**
 * Physics body component for entities
 * Handles position, velocity, acceleration, and angular physics
 */
export class PhysicsBody {
    /**
     * Creates a new physics body
     * @param {Object} options - Configuration options
     * @param {Vector2} options.position - Initial position
     * @param {Vector2} options.velocity - Initial velocity
     * @param {number} options.angle - Initial angle in radians
     * @param {number} options.angularVelocity - Initial angular velocity
     * @param {number} options.mass - Mass of the body
     * @param {number} options.radius - Collision radius for circle collision
     */
    constructor({ position = new Vector2(), velocity = new Vector2(), angle = 0, angularVelocity = 0, mass = PHYSICS_CONFIG.mass, radius = PHYSICS_CONFIG.carRadius } = {}) {
        /**
         * Current position
         * @type {Vector2}
         */
        this.position = position.clone();

        /**
         * Current velocity
         * @type {Vector2}
         */
        this.velocity = velocity.clone();

        /**
         * Current acceleration
         * @type {Vector2}
         */
        this.acceleration = new Vector2();

        /**
         * Current angle in radians
         * @type {number}
         */
        this.angle = angle;

        /**
         * Current angular velocity in radians per second
         * @type {number}
         */
        this.angularVelocity = angularVelocity;

        /**
         * Current angular acceleration
         * @type {number}
         */
        this.angularAcceleration = 0;

        /**
         * Mass of the body
         * @type {number}
         */
        this.mass = mass;

        /**
         * Inverse mass (1/mass) for optimization
         * @type {number}
         */
        this.inverseMass = mass !== 0 ? 1 / mass : 0;

        /**
         * Collision radius for circle collision detection
         * @type {number}
         */
        this.radius = radius;

        /**
         * Restitution (bounciness) for collisions
         * @type {number}
         */
        this.restitution = PHYSICS_CONFIG.restitution;

        /**
         * Linear drag factor
         * @type {number}
         */
        this.linearDrag = PHYSICS_CONFIG.linearDrag;

        /**
         * Angular drag factor
         * @type {number}
         */
        this.angularDrag = PHYSICS_CONFIG.angularDrag;

        /**
         * Maximum speed limit
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
         * Turn speed for steering
         * @type {number}
         */
        this.turnSpeed = PHYSICS_CONFIG.turnSpeed;

        /**
         * Previous position for interpolation
         * @type {Vector2}
         */
        this.previousPosition = position.clone();

        /**
         * Previous angle for interpolation
         * @type {number}
         */
        this.previousAngle = angle;
    }

    /**
     * Gets the current speed (scalar magnitude of velocity)
     * @returns {number} Current speed
     */
    get speed() {
        return this.velocity.length();
    }

    /**
     * Gets the forward direction vector based on current angle
     * @returns {Vector2} Forward direction vector
     */
    get forward() {
        return new Vector2(Math.cos(this.angle), Math.sin(this.angle));
    }

    /**
     * Gets the right direction vector based on current angle
     * @returns {Vector2} Right direction vector
     */
    get right() {
        return new Vector2(-Math.sin(this.angle), Math.cos(this.angle));
    }

    /**
     * Updates physics state with fixed time step
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Store previous state for interpolation
        this.previousPosition = this.position.clone();
        this.previousAngle = this.angle;

        // Apply acceleration to velocity
        this.velocity.add(this.acceleration.clone().mul(dt));

        // Apply angular acceleration to angular velocity
        this.angularVelocity += this.angularAcceleration * dt;

        // Apply drag
        this.velocity.mul(this.linearDrag);
        this.angularVelocity *= this.angularDrag;

        // Clamp speed to maximum
        if (this.speed > this.maxSpeed) {
            this.velocity.normalize().mul(this.maxSpeed);
        }

        // Update position
        this.position.add(this.velocity.clone().mul(dt));

        // Update angle
        this.angle += this.angularVelocity * dt;

        // Reset accelerations
        this.acceleration.set(0, 0);
        this.angularAcceleration = 0;
    }

    /**
     * Applies a force to the body
     * @param {Vector2} force - Force vector to apply
     */
    applyForce(force) {
        // F = ma, so a = F/m
        this.acceleration.add(force.clone().mul(this.inverseMass));
    }

    /**
     * Applies a torque to the body
     * @param {number} torque - Torque to apply
     */
    applyTorque(torque) {
        // τ = Iα, assuming I = 1 for simplicity, so α = τ
        this.angularAcceleration += torque;
    }

    /**
     * Sets velocity directly
     * @param {Vector2} velocity - New velocity vector
     */
    setVelocity(velocity) {
        this.velocity = velocity.clone();
    }

    /**
     * Sets angular velocity directly
     * @param {number} angularVelocity - New angular velocity
     */
    setAngularVelocity(angularVelocity) {
        this.angularVelocity = angularVelocity;
    }

    /**
     * Clamps speed to maximum
     */
    clampSpeed() {
        if (this.speed > this.maxSpeed) {
            this.velocity.normalize().mul(this.maxSpeed);
        }
    }

    /**
     * Rotates the body by a given angle
     * @param {number} angle - Angle to rotate by in radians
     */
    rotate(angle) {
        this.angle += angle;
    }

    /**
     * Creates a deep copy of the physics body
     * @returns {PhysicsBody} Copy of this physics body
     */
    clone() {
        const clone = new PhysicsBody({
            position: this.position.clone(),
            velocity: this.velocity.clone(),
            angle: this.angle,
            angularVelocity: this.angularVelocity,
            mass: this.mass,
            radius: this.radius
        });

        clone.acceleration = this.acceleration.clone();
        clone.angularAcceleration = this.angularAcceleration;
        clone.restitution = this.restitution;
        clone.linearDrag = this.linearDrag;
        clone.angularDrag = this.angularDrag;
        clone.maxSpeed = this.maxSpeed;
        clone.accelerationForce = this.accelerationForce;
        clone.brakeForce = this.brakeForce;
        clone.turnSpeed = this.turnSpeed;
        clone.previousPosition = this.previousPosition.clone();
        clone.previousAngle = this.previousAngle;

        return clone;
    }
}