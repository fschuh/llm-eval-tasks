import { Vector2D } from '../core/Vector2D.js';

/**
 * RigidBody - Physics body base class for entities
 */
export class RigidBody {
    /**
     * Create a new rigid body
     * @param {Object} config - Configuration object
     * @param {number} config.mass - Mass in kg
     * @param {number} config.radius - Collision radius
     * @param {Vector2D} config.position - Initial position
     * @param {number} config.rotation - Initial rotation in radians
     */
    constructor(config = {}) {
        // Identity
        this.id = config.id || `body_${Math.random().toString(36).substr(2, 9)}`;
        
        // Transform
        this.position = config.position ? config.position.clone() : new Vector2D(0, 0);
        this.rotation = config.rotation || 0;
        
        // Linear physics
        this.velocity = new Vector2D(0, 0);
        this.mass = config.mass || 1000;
        this.invMass = this.mass > 0 ? 1 / this.mass : 0;
        
        // Angular physics
        this.angularVelocity = 0;
        
        // Collision
        this.radius = config.radius || 15;
        this.restitution = config.restitution || 0.5;
        
        // For interpolation
        this.previousPosition = this.position.clone();
        this.previousRotation = this.rotation;
        
        // Forces accumulated for this frame
        this.forces = new Vector2D(0, 0);
        this.torque = 0;
        
        // Static flag (walls, barriers)
        this.isStatic = config.isStatic || false;
        if (this.isStatic) {
            this.invMass = 0;
            this.mass = Infinity;
        }
    }

    /**
     * Apply a force to the body
     * @param {Vector2D} force - Force vector
     */
    applyForce(force) {
        if (this.isStatic) return;
        this.forces = this.forces.add(force);
    }

    /**
     * Apply an impulse to the body (instant velocity change)
     * @param {Vector2D} impulse - Impulse vector
     */
    applyImpulse(impulse) {
        if (this.isStatic) return;
        this.velocity = this.velocity.add(impulse.mul(this.invMass));
    }

    /**
     * Apply angular impulse
     * @param {number} impulse - Angular impulse
     */
    applyAngularImpulse(impulse) {
        if (this.isStatic) return;
        this.angularVelocity += impulse * this.invMass;
    }

    /**
     * Integrate physics for one timestep
     * @param {number} dt - Delta time in seconds
     */
    integrate(dt) {
        if (this.isStatic) return;

        // Save previous state for interpolation
        this.previousPosition = this.position.clone();
        this.previousRotation = this.rotation;

        // Linear integration (Euler)
        const acceleration = this.forces.mul(this.invMass);
        this.velocity = this.velocity.add(acceleration.mul(dt));
        this.position = this.position.add(this.velocity.mul(dt));

        // Angular integration
        this.angularVelocity += this.torque * this.invMass * dt;
        this.rotation += this.angularVelocity * dt;

        // Clear forces
        this.forces = new Vector2D(0, 0);
        this.torque = 0;
    }

    /**
     * Get interpolated position for smooth rendering
     * @param {number} alpha - Interpolation factor [0, 1]
     * @returns {Vector2D} Interpolated position
     */
    getInterpolatedPosition(alpha) {
        return Vector2D.lerp(this.previousPosition, this.position, alpha);
    }

    /**
     * Get interpolated rotation for smooth rendering
     * @param {number} alpha - Interpolation factor [0, 1]
     * @returns {number} Interpolated rotation
     */
    getInterpolatedRotation(alpha) {
        // Simple lerp for rotation (works for small angles)
        return this.previousRotation * (1 - alpha) + this.rotation * alpha;
    }

    /**
     * Set position directly
     * @param {Vector2D} position - New position
     */
    setPosition(position) {
        this.previousPosition = this.position.clone();
        this.position = position.clone();
    }

    /**
     * Set rotation directly
     * @param {number} rotation - New rotation in radians
     */
    setRotation(rotation) {
        this.previousRotation = this.rotation;
        this.rotation = rotation;
    }

    /**
     * Reset the body to a specific state
     * @param {Vector2D} position - New position
     * @param {number} rotation - New rotation
     */
    reset(position, rotation) {
        this.position = position ? position.clone() : new Vector2D(0, 0);
        this.previousPosition = this.position.clone();
        this.rotation = rotation || 0;
        this.previousRotation = this.rotation;
        this.velocity = new Vector2D(0, 0);
        this.angularVelocity = 0;
        this.forces = new Vector2D(0, 0);
        this.torque = 0;
    }

    /**
     * Get kinetic energy
     * @returns {number} Kinetic energy
     */
    getKineticEnergy() {
        if (this.isStatic) return 0;
        const speedSq = this.velocity.magnitudeSquared();
        return 0.5 * this.mass * speedSq;
    }

    /**
     * Get speed (magnitude of velocity)
     * @returns {number} Speed
     */
    getSpeed() {
        return this.velocity.magnitude();
    }
}
