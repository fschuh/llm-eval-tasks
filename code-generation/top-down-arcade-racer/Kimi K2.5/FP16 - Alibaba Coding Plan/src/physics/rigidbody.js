/**
 * Rigidbody - Physics component for entities
 * 
 * Handles physics properties including position, velocity, mass,
 * rotation, angular velocity, drag, and restitution.
 * Uses semi-implicit Euler integration for deterministic physics.
 */

import { Vector2 } from '../core/vector2.js';

/**
 * Rigidbody class representing a physics body in the game world
 */
export class Rigidbody {
    /**
     * Create a new Rigidbody
     * @param {Object} options - Configuration options
     * @param {Vector2} options.position - Initial position (default: Vector2.zero())
     * @param {Vector2} options.velocity - Initial velocity (default: Vector2.zero())
     * @param {number} options.mass - Mass in kg (default: 1)
     * @param {number} options.rotation - Rotation in radians (default: 0)
     * @param {number} options.angularVelocity - Angular velocity in rad/s (default: 0)
     * @param {number} options.drag - Drag coefficient (default: 0.01)
     * @param {number} options.angularDrag - Angular drag coefficient (default: 0.01)
     * @param {number} options.restitution - Restitution/bounciness (0-1, default: 0.2)
     * @param {boolean} options.isStatic - If true, body has infinite mass (default: false)
     */
    constructor(options = {}) {
        /** @type {Vector2} Position in world coordinates */
        this.position = options.position ? options.position.copy() : new Vector2(0, 0);
        
        /** @type {Vector2} Linear velocity */
        this.velocity = options.velocity ? options.velocity.copy() : new Vector2(0, 0);
        
        /** @type {number} Mass in kg */
        this.mass = options.mass !== undefined ? options.mass : 1;
        
        /** @type {number} Inverse mass (1/mass, 0 for static objects) */
        this.invMass = this.mass > 0 ? 1 / this.mass : 0;
        
        /** @type {number} Rotation in radians */
        this.rotation = options.rotation !== undefined ? options.rotation : 0;
        
        /** @type {number} Angular velocity in radians per second */
        this.angularVelocity = options.angularVelocity !== undefined ? options.angularVelocity : 0;
        
        /** @type {number} Linear drag coefficient */
        this.drag = options.drag !== undefined ? options.drag : 0.01;
        
        /** @type {number} Angular drag coefficient */
        this.angularDrag = options.angularDrag !== undefined ? options.angularDrag : 0.01;
        
        /** @type {number} Restitution (bounciness, 0-1) */
        this.restitution = options.restitution !== undefined ? options.restitution : 0.2;
        
        /** @type {boolean} Whether this body is static (infinite mass) */
        this.isStatic = options.isStatic !== undefined ? options.isStatic : false;
        
        if (this.isStatic) {
            this.mass = Infinity;
            this.invMass = 0;
        }
        
        /** @type {Vector2} Accumulated force for this frame */
        this._forceAccumulator = new Vector2(0, 0);
        
        /** @type {number} Accumulated torque for this frame */
        this._torqueAccumulator = 0;
    }

    /**
     * Apply a continuous force to the rigidbody
     * Force is applied at the center of mass (no torque)
     * @param {Vector2} force - Force vector to apply
     */
    applyForce(force) {
        if (this.isStatic) return;
        this._forceAccumulator = this._forceAccumulator.add(force);
    }

    /**
     * Apply an impulse (instantaneous change in momentum)
     * @param {Vector2} impulse - Impulse vector to apply
     * @param {Vector2} [contactPoint] - Point of application (optional, for torque)
     */
    applyImpulse(impulse, contactPoint = null) {
        if (this.isStatic) return;
        
        // Change in velocity: Δv = impulse / mass
        this.velocity = this.velocity.add(impulse.mul(this.invMass));
        
        // Apply torque if contact point is provided
        if (contactPoint) {
            const r = contactPoint.sub(this.position);
            const torque = r.cross(impulse);
            this.applyTorqueImpulse(torque);
        }
    }

    /**
     * Apply a continuous torque
     * @param {number} torque - Torque to apply
     */
    applyTorque(torque) {
        if (this.isStatic) return;
        this._torqueAccumulator += torque;
    }

    /**
     * Apply an angular impulse
     * @param {number} torqueImpulse - Angular impulse to apply
     */
    applyTorqueImpulse(torqueImpulse) {
        if (this.isStatic) return;
        // For 2D: I = m * r^2, simplified as I = m for unit dimensions
        const momentOfInertia = this.mass;
        this.angularVelocity += torqueImpulse / momentOfInertia;
    }

    /**
     * Get the forward direction vector based on rotation
     * @returns {Vector2} Forward direction unit vector
     */
    getForward() {
        return new Vector2(Math.cos(this.rotation), Math.sin(this.rotation));
    }

    /**
     * Get the right/perpendicular direction vector
     * @returns {Vector2} Right direction unit vector
     */
    getRight() {
        return new Vector2(-Math.sin(this.rotation), Math.cos(this.rotation));
    }

    /**
     * Set the velocity directly
     * @param {Vector2} velocity - New velocity
     */
    setVelocity(velocity) {
        this.velocity = velocity.copy();
    }

    /**
     * Set the position directly
     * @param {Vector2} position - New position
     */
    setPosition(position) {
        this.position = position.copy();
    }

    /**
     * Set the rotation directly
     * @param {number} rotation - New rotation in radians
     */
    setRotation(rotation) {
        this.rotation = rotation;
    }

    /**
     * Get current speed (magnitude of velocity)
     * @returns {number} Speed in units per second
     */
    getSpeed() {
        return this.velocity.length();
    }

    /**
     * Get kinetic energy of the body
     * @returns {number} Kinetic energy
     */
    getKineticEnergy() {
        if (this.isStatic) return 0;
        const vSq = this.velocity.dot(this.velocity);
        return 0.5 * this.mass * vSq;
    }

    /**
     * Integrate physics state using semi-implicit Euler method
     * This method is deterministic and stable for game physics
     * @param {number} dt - Delta time in seconds
     */
    integrate(dt) {
        if (this.isStatic) return;

        // Semi-implicit Euler integration:
        // 1. Calculate acceleration from accumulated forces: a = F / m
        // 2. Update velocity: v = v + a * dt
        // 3. Apply drag: v = v * (1 - drag * dt)
        // 4. Update position: p = p + v * dt

        // Linear motion
        const acceleration = this._forceAccumulator.mul(this.invMass);
        this.velocity = this.velocity.add(acceleration.mul(dt));
        
        // Apply linear drag
        const dragFactor = Math.max(0, 1 - this.drag * dt);
        this.velocity = this.velocity.mul(dragFactor);
        
        // Update position
        this.position = this.position.add(this.velocity.mul(dt));

        // Angular motion
        const angularAcceleration = this._torqueAccumulator / this.mass;
        this.angularVelocity += angularAcceleration * dt;
        
        // Apply angular drag
        const angularDragFactor = Math.max(0, 1 - this.angularDrag * dt);
        this.angularVelocity *= angularDragFactor;
        
        // Update rotation
        this.rotation += this.angularVelocity * dt;
        
        // Normalize rotation to [-PI, PI]
        while (this.rotation > Math.PI) this.rotation -= 2 * Math.PI;
        while (this.rotation < -Math.PI) this.rotation += 2 * Math.PI;

        // Clear accumulators for next frame
        this.clearForces();
    }

    /**
     * Clear all accumulated forces and torques
     */
    clearForces() {
        this._forceAccumulator = new Vector2(0, 0);
        this._torqueAccumulator = 0;
    }

    /**
     * Make this body static (infinite mass)
     */
    makeStatic() {
        this.isStatic = true;
        this.mass = Infinity;
        this.invMass = 0;
        this.velocity = new Vector2(0, 0);
        this.angularVelocity = 0;
    }

    /**
     * Make this body dynamic (finite mass)
     * @param {number} mass - New mass value
     */
    makeDynamic(mass = 1) {
        this.isStatic = false;
        this.mass = mass;
        this.invMass = mass > 0 ? 1 / mass : 0;
    }

    /**
     * Create a copy of this rigidbody
     * @returns {Rigidbody} Copy of the rigidbody
     */
    copy() {
        const rb = new Rigidbody({
            position: this.position,
            velocity: this.velocity,
            mass: this.mass,
            rotation: this.rotation,
            angularVelocity: this.angularVelocity,
            drag: this.drag,
            angularDrag: this.angularDrag,
            restitution: this.restitution,
            isStatic: this.isStatic
        });
        return rb;
    }
}
