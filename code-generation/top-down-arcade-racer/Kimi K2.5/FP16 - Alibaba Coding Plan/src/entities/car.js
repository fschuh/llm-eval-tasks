/**
 * Car - Racing car entity with physics components
 * 
 * Combines Rigidbody and Collider to create a drivable racing car.
 * Implements car-specific physics including acceleration, braking,
 * steering, and friction using a simplified bicycle model.
 */

import { Vector2 } from '../core/vector2.js';
import { Rigidbody } from '../physics/rigidbody.js';
import { Collider } from '../physics/collider.js';

/**
 * Car entity class for the racing game
 */
export class Car {
    /**
     * Create a new Car
     * @param {number} id - Unique identifier for this car
     * @param {boolean} isPlayer - Whether this is the player-controlled car
     * @param {Vector2} startPosition - Initial position
     * @param {number} startRotation - Initial rotation in radians (default: 0)
     */
    constructor(id, isPlayer = false, startPosition = new Vector2(), startRotation = 0) {
        // Identity
        this.id = id;
        this.isPlayer = isPlayer;

        // Physics components
        this.rigidbody = new Rigidbody(startPosition, 1000); // Default mass: 1000kg
        this.rigidbody.rotation = startRotation;
        this.collider = new Collider(24, 14); // Racing car proportions: width=24, height=14

        // Car specifications
        this.specs = {
            maxSpeed: 300,              // pixels/second
            maxReverseSpeed: 100,       // pixels/second
            acceleration: 200,          // pixels/second^2
            braking: 400,               // pixels/second^2
            maxSteeringAngle: Math.PI / 4,  // 45 degrees
            wheelbase: 30,              // distance between axles (pixels)
            mass: 1000,                 // kg
            friction: 0.98,             // lateral friction coefficient
            drag: 0.995                 // air resistance/drag coefficient
        };

        // Sync rigidbody with specs
        this.rigidbody.mass = this.specs.mass;
        this.rigidbody.drag = this.specs.drag;

        // Input state
        this.throttle = 0;   // 0 to 1
        this.brake = 0;      // 0 to 1
        this.steering = 0;   // -1 to 1 (left to right)

        // Derived physics state
        this.speed = 0;      // Forward speed (signed)

        // Race state
        this.lap = 0;
        this.checkpointIndex = 0;
        this.raceTime = 0;
        this.bestLapTime = Infinity;
        this.currentLapStartTime = 0;

        // AI state (only used if !isPlayer)
        this.aiState = {
            currentWaypoint: 0,
            targetWaypoint: 1,
            reactionTimer: 0,
            overtaking: false,
            skillLevel: 1.0  // 0.8 to 1.2
        };
    }

    /**
     * Update car physics for one timestep
     * @param {number} dt - Delta time in seconds
     */
    updatePhysics(dt) {
        // Update longitudinal forces (acceleration/braking)
        this._updateLongitudinal(dt);

        // Update lateral forces and steering
        this._updateLateral(dt);

        // Apply velocity to rigidbody
        const forward = this.getForward();
        this.rigidbody.velocity.x = forward.x * this.speed;
        this.rigidbody.velocity.y = forward.y * this.speed;

        // Integrate rigidbody physics
        this.rigidbody.integrate(dt);

        // Update race time
        this.raceTime += dt;
    }

    /**
     * Update longitudinal forces (engine, braking, drag)
     * @private
     * @param {number} dt - Delta time in seconds
     */
    _updateLongitudinal(dt) {
        // Engine force
        const engineForce = this.throttle * this.specs.acceleration * this.specs.mass;

        // Braking force (can brake while moving forward or backward)
        let brakeForce = 0;
        if (this.brake > 0) {
            const brakeDir = this.speed > 0 ? -1 : 1;
            brakeForce = this.brake * this.specs.braking * this.specs.mass * brakeDir;
        }

        // Rolling resistance / drag (simplified)
        const dragForce = -0.5 * 0.3 * 1.225 * 2.0 * this.speed * Math.abs(this.speed);

        // Net longitudinal force
        const netForce = engineForce + brakeForce + dragForce;
        const acceleration = netForce / this.specs.mass;

        // Update speed
        this.speed += acceleration * dt;

        // Apply speed limits
        if (this.speed > this.specs.maxSpeed) {
            this.speed = this.specs.maxSpeed;
        }
        if (this.speed < -this.specs.maxReverseSpeed) {
            this.speed = -this.specs.maxReverseSpeed;
        }

        // Natural deceleration when no input
        if (this.throttle === 0 && this.brake === 0) {
            this.speed *= this.specs.drag;
        }

        // Stop completely at very low speeds
        if (Math.abs(this.speed) < 1) {
            this.speed = 0;
        }
    }

    /**
     * Update lateral forces and steering
     * @private
     * @param {number} dt - Delta time in seconds
     */
    _updateLateral(dt) {
        // Calculate steering angle
        const steeringAngle = this.steering * this.specs.maxSteeringAngle;

        // Calculate turning rate based on speed
        // At low speeds, reduce turning effectiveness
        const speedFactor = Math.min(Math.abs(this.speed) / 50, 1);
        
        // Bicycle model: turnRate = (speed * tan(steeringAngle)) / wheelbase
        let turnRate = 0;
        if (Math.abs(steeringAngle) > 0.001) {
            turnRate = (this.speed * Math.tan(steeringAngle)) / this.specs.wheelbase;
        }
        turnRate *= speedFactor;

        // Update rotation
        this.rigidbody.rotation += turnRate * dt;

        // Normalize rotation to [-PI, PI]
        while (this.rigidbody.rotation > Math.PI) {
            this.rigidbody.rotation -= 2 * Math.PI;
        }
        while (this.rigidbody.rotation < -Math.PI) {
            this.rigidbody.rotation += 2 * Math.PI;
        }
    }

    /**
     * Get the forward direction vector
     * @returns {Vector2} Forward direction unit vector
     */
    getForward() {
        return new Vector2(
            Math.cos(this.rigidbody.rotation),
            Math.sin(this.rigidbody.rotation)
        );
    }

    /**
     * Get the right/perpendicular direction vector
     * @returns {Vector2} Right direction unit vector
     */
    getRight() {
        return new Vector2(
            -Math.sin(this.rigidbody.rotation),
            Math.cos(this.rigidbody.rotation)
        );
    }

    /**
     * Get current position
     * @returns {Vector2} Current position
     */
    getPosition() {
        return this.rigidbody.position.copy();
    }

    /**
     * Get current rotation in radians
     * @returns {number} Rotation angle
     */
    getRotation() {
        return this.rigidbody.rotation;
    }

    /**
     * Get current velocity
     * @returns {Vector2} Current velocity vector
     */
    getVelocity() {
        return this.rigidbody.velocity.copy();
    }

    /**
     * Set car position directly
     * @param {Vector2} position - New position
     */
    setPosition(position) {
        this.rigidbody.position.x = position.x;
        this.rigidbody.position.y = position.y;
    }

    /**
     * Set car rotation directly
     * @param {number} rotation - New rotation in radians
     */
    setRotation(rotation) {
        this.rigidbody.rotation = rotation;
    }

    /**
     * Apply an external force to the car
     * @param {Vector2} force - Force vector to apply
     */
    applyForce(force) {
        this.rigidbody.applyForce(force);
    }

    /**
     * Apply an impulse to the car
     * @param {Vector2} impulse - Impulse vector to apply
     */
    applyImpulse(impulse) {
        this.rigidbody.applyImpulse(impulse);
    }

    /**
     * Get axis-aligned bounding box for broad-phase collision
     * @returns {Object} AABB with minX, maxX, minY, maxY
     */
    getAABB() {
        const halfW = this.collider.width / 2;
        const halfH = this.collider.height / 2;
        return {
            minX: this.rigidbody.position.x - halfW,
            maxX: this.rigidbody.position.x + halfW,
            minY: this.rigidbody.position.y - halfH,
            maxY: this.rigidbody.position.y + halfH
        };
    }

    /**
     * Get oriented bounding box corners for narrow-phase collision
     * @returns {Vector2[]} Array of 4 corner points in world space
     */
    getOBB() {
        return this.collider.getCorners(this.rigidbody.position, this.rigidbody.rotation);
    }

    /**
     * Start a new lap
     */
    startLap() {
        const now = this.raceTime;
        if (this.currentLapStartTime > 0) {
            const lapTime = now - this.currentLapStartTime;
            if (lapTime < this.bestLapTime) {
                this.bestLapTime = lapTime;
            }
        }
        this.currentLapStartTime = now;
        this.lap++;
        this.checkpointIndex = 0;
    }

    /**
     * Reset car to initial state
     * @param {Vector2} position - Reset position
     * @param {number} rotation - Reset rotation
     */
    reset(position, rotation) {
        this.rigidbody.position = position.copy();
        this.rigidbody.rotation = rotation;
        this.rigidbody.velocity = new Vector2(0, 0);
        this.rigidbody.angularVelocity = 0;
        this.rigidbody.force = new Vector2(0, 0);
        this.speed = 0;
        this.throttle = 0;
        this.brake = 0;
        this.steering = 0;
        this.lap = 0;
        this.checkpointIndex = 0;
        this.raceTime = 0;
        this.bestLapTime = Infinity;
        this.currentLapStartTime = 0;
    }
}
