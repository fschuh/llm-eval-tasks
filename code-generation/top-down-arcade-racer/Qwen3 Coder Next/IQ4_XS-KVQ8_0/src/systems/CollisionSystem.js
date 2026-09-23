/**
 * Collision Detection and Resolution System
 * 
 * Implements collision detection between cars and track boundaries,
 * car-to-car collisions with impulse resolution, and positional
 * correction to prevent sinking.
 */

import { Vector2 } from '../core/Vector2.js';
import { Collision as PhysicsCollision } from '../physics/Collision.js';
import { PHYSICS_CONFIG } from '../physics/PhysicsBody.js';

/**
 * Collision event types
 */
export const CollisionEventType = {
    CAR_TO_CAR: 'car-to-car',
    CAR_TO_TRACK: 'car-to-track',
    CAR_TO_WALL: 'car-to-wall'
};

/**
 * Collision event structure
 */
export class CollisionEvent {
    /**
     * Creates a new collision event
     * @param {Object} options - Event options
     * @param {string} options.type - Collision type
     * @param {Car} options.carA - First car involved
     * @param {Car} options.carB - Second car involved (if applicable)
     * @param {Vector2} options.normal - Collision normal
     * @param {number} options.depth - Collision depth
     * @param {Vector2} options.position - Collision position
     */
    constructor({ type, carA, carB = null, normal, depth, position }) {
        this.type = type;
        this.carA = carA;
        this.carB = carB;
        this.normal = normal;
        this.depth = depth;
        this.position = position;
    }
}

/**
 * Collision system for detecting and resolving collisions
 */
export class CollisionSystem {
    /**
     * Creates a new collision system
     * @param {Object} options - Configuration options
     * @param {Track} options.track - The track for boundary detection
     * @param {number} options.restitution - Bounciness (0-1)
     * @param {number} options.trackFriction - Friction when hitting track boundaries
     */
    constructor({ track, restitution = 0.3, trackFriction = 0.5 } = {}) {
        /**
         * The track for boundary detection
         * @type {Track}
         */
        this.track = track;

        /**
         * Bounciness coefficient (0-1)
         * @type {number}
         */
        this.restitution = restitution;

        /**
         * Friction when hitting track boundaries
         * @type {number}
         */
        this.trackFriction = trackFriction;

        /**
         * List of registered cars
         * @type {Car[]}
         */
        this.cars = [];

        /**
         * Collision event callbacks
         * @type {Function[]}
         */
        this.onCollisionCallbacks = [];

        /**
         * Track boundary callbacks
         * @type {Function[]}
         */
        this.onTrackBoundaryCallbacks = [];

        /**
         * Car-to-car collision callbacks
         * @type {Function[]}
         */
        this.onCarCollisionCallbacks = [];
    }

    /**
     * Registers a car for collision detection
     * @param {Car} car - The car to register
     */
    registerCar(car) {
        if (!this.cars.includes(car)) {
            this.cars.push(car);
        }
    }

    /**
     * Unregisters a car from collision detection
     * @param {Car} car - The car to unregister
     */
    unregisterCar(car) {
        const index = this.cars.indexOf(car);
        if (index !== -1) {
            this.cars.splice(index, 1);
        }
    }

    /**
     * Updates collision detection for all registered cars
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Detect and resolve car-to-car collisions
        this._resolveCarCollisions();

        // Detect and resolve track boundary collisions
        this._resolveTrackCollisions(dt);
    }

    /**
     * Detects and resolves car-to-car collisions
     */
    _resolveCarCollisions() {
        const collisions = [];

        // Find all colliding pairs
        for (let i = 0; i < this.cars.length; i++) {
            for (let j = i + 1; j < this.cars.length; j++) {
                const carA = this.cars[i];
                const carB = this.cars[j];

                if (PhysicsCollision.checkCollision(carA.physics, carB.physics)) {
                    collisions.push({ carA, carB });
                }
            }
        }

        // Resolve each collision
        for (const pair of collisions) {
            this._resolveCarToCarCollision(pair.carA, pair.carB);
        }
    }

    /**
     * Resolves a car-to-car collision using impulse-based method
     * @param {Car} carA - First car
     * @param {Car} carB - Second car
     */
    _resolveCarToCarCollision(carA, carB) {
        const bodyA = carA.physics;
        const bodyB = carB.physics;

        // Calculate collision normal (from B to A)
        const dx = bodyA.position.x - bodyB.position.x;
        const dy = bodyA.position.y - bodyB.position.y;
        const distanceSq = dx * dx + dy * dy;

        // Handle zero distance case
        if (distanceSq === 0) {
            // Cars are at same position, use arbitrary normal
            const nx = 1;
            const ny = 0;
            this._applyCarCollisionImpulse(carA, carB, new Vector2(nx, ny));
            this._applyCarCollisionPositionCorrection(carA, carB, new Vector2(nx, ny), bodyA.radius + bodyB.radius);
            return;
        }

        const distance = Math.sqrt(distanceSq);
        const radiusSum = bodyA.radius + bodyB.radius;

        // Check if actually colliding
        if (distance >= radiusSum) return;

        // Calculate normal
        const nx = dx / distance;
        const ny = dy / distance;
        const normal = new Vector2(nx, ny);

        // Calculate penetration depth
        const penetration = radiusSum - distance;

        // Apply impulse resolution
        this._applyCarCollisionImpulse(carA, carB, normal);

        // Apply positional correction to prevent sinking
        this._applyCarCollisionPositionCorrection(carA, carB, normal, penetration);

        // Trigger collision events
        this._triggerCarCollisionEvent(carA, carB, normal, penetration);
    }

    /**
     * Applies impulse resolution for car-to-car collision
     * @param {Car} carA - First car
     * @param {Car} carB - Second car
     * @param {Vector2} normal - Collision normal
     */
    _applyCarCollisionImpulse(carA, carB, normal) {
        const bodyA = carA.physics;
        const bodyB = carB.physics;

        // Calculate relative velocity
        const rvx = bodyA.velocity.x - bodyB.velocity.x;
        const rvy = bodyA.velocity.y - bodyB.velocity.y;

        // Velocity along normal
        const velAlongNormal = rvx * normal.x + rvy * normal.y;

        // Do not resolve if velocities are separating
        if (velAlongNormal > 0) return;

        // Calculate impulse scalar
        let j = -(1 + this.restitution) * velAlongNormal;
        j /= (1 / bodyA.mass + 1 / bodyB.mass);

        // Apply impulse
        const impulseX = j * normal.x;
        const impulseY = j * normal.y;

        bodyA.velocity.x += impulseX / bodyA.mass;
        bodyA.velocity.y += impulseY / bodyA.mass;
        bodyB.velocity.x -= impulseX / bodyB.mass;
        bodyB.velocity.y -= impulseY / bodyB.mass;
    }

    /**
     * Applies positional correction to prevent sinking
     * @param {Car} carA - First car
     * @param {Car} carB - Second car
     * @param {Vector2} normal - Collision normal
     * @param {number} penetration - Penetration depth
     */
    _applyCarCollisionPositionCorrection(carA, carB, normal, penetration) {
        const bodyA = carA.physics;
        const bodyB = carB.physics;

        // Calculate correction amount
        const correction = penetration / (1 / bodyA.mass + 1 / bodyB.mass);
        const cx = correction * normal.x;
        const cy = correction * normal.y;

        // Apply positional correction
        bodyA.position.x += cx / bodyA.mass;
        bodyA.position.y += cy / bodyA.mass;
        bodyB.position.x -= cx / bodyB.mass;
        bodyB.position.y -= cy / bodyB.mass;
    }

    /**
     * Detects and resolves track boundary collisions
     * @param {number} dt - Time step in seconds
     */
    _resolveTrackCollisions(dt) {
        for (const car of this.cars) {
            this._resolveCarTrackCollision(car);
        }
    }

    /**
     * Resolves collision between a car and track boundaries
     * @param {Car} car - The car to check
     */
    _resolveCarTrackCollision(car) {
        const position = car.position;
        const closestIndex = this.track.getClosestWaypoint(position);
        const closestWaypoint = this.track.getWaypoint(closestIndex);
        const distance = position.distance(closestWaypoint);

        // Check if car is outside track boundaries
        if (distance > this.track.halfTrackWidth) {
            // Calculate how far outside the track
            const penetration = distance - this.track.halfTrackWidth;

            // Calculate normal (from track center to car)
            const dx = position.x - closestWaypoint.x;
            const dy = position.y - closestWaypoint.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq === 0) {
                // Car is exactly at waypoint, use arbitrary normal
                car.physics.position.x += 1;
                this._applyTrackFriction(car);
                this._triggerTrackBoundaryEvent(car, new Vector2(1, 0), penetration);
                return;
            }

            const distanceVal = Math.sqrt(distanceSq);
            const nx = dx / distanceVal;
            const ny = dy / distanceVal;
            const normal = new Vector2(nx, ny);

            // Apply positional correction (push car back onto track)
            const correction = penetration;
            car.physics.position.x -= nx * correction;
            car.physics.position.y -= ny * correction;

            // Apply friction to velocity (reduce speed when hitting boundaries)
            this._applyTrackFriction(car);

            // Trigger track boundary event
            this._triggerTrackBoundaryEvent(car, normal, penetration);
        }
    }

    /**
     * Applies friction when car hits track boundaries
     * @param {Car} car - The car to apply friction to
     */
    _applyTrackFriction(car) {
        const body = car.physics;
        body.velocity.x *= this.trackFriction;
        body.velocity.y *= this.trackFriction;
        body.angularVelocity *= this.trackFriction;
    }

    /**
     * Triggers car collision event
     * @param {Car} carA - First car
     * @param {Car} carB - Second car
     * @param {Vector2} normal - Collision normal
     * @param {number} depth - Collision depth
     */
    _triggerCarCollisionEvent(carA, carB, normal, depth) {
        const event = new CollisionEvent({
            type: CollisionEventType.CAR_TO_CAR,
            carA,
            carB,
            normal,
            depth,
            position: carA.position.added(carB.position).div(2)
        });

        for (const callback of this.onCarCollisionCallbacks) {
            callback(event);
        }

        for (const callback of this.onCollisionCallbacks) {
            callback(event);
        }
    }

    /**
     * Triggers track boundary event
     * @param {Car} car - The car that hit the boundary
     * @param {Vector2} normal - Collision normal
     * @param {number} depth - Collision depth
     */
    _triggerTrackBoundaryEvent(car, normal, depth) {
        const event = new CollisionEvent({
            type: CollisionEventType.CAR_TO_TRACK,
            carA: car,
            carB: null,
            normal,
            depth,
            position: car.position.sub(normal.clone().mul(depth / 2))
        });

        for (const callback of this.onTrackBoundaryCallbacks) {
            callback(event);
        }

        for (const callback of this.onCollisionCallbacks) {
            callback(event);
        }
    }

    /**
     * Adds a callback for any collision event
     * @param {Function} callback - Callback function(event)
     */
    onCollision(callback) {
        this.onCollisionCallbacks.push(callback);
    }

    /**
     * Adds a callback for track boundary collisions
     * @param {Function} callback - Callback function(event)
     */
    onTrackBoundary(callback) {
        this.onTrackBoundaryCallbacks.push(callback);
    }

    /**
     * Adds a callback for car-to-car collisions
     * @param {Function} callback - Callback function(event)
     */
    onCarCollision(callback) {
        this.onCarCollisionCallbacks.push(callback);
    }

    /**
     * Gets all registered cars
     * @returns {Car[]} List of registered cars
     */
    getCars() {
        return [...this.cars];
    }

    /**
     * Checks if two cars are colliding
     * @param {Car} carA - First car
     * @param {Car} carB - Second car
     * @returns {boolean} True if cars are colliding
     */
    areColliding(carA, carB) {
        return PhysicsCollision.checkCollision(carA.physics, carB.physics);
    }

    /**
     * Checks if a car is outside track boundaries
     * @param {Car} car - The car to check
     * @returns {boolean} True if car is off-track
     */
    isOffTrack(car) {
        const position = car.position;
        const closestIndex = this.track.getClosestWaypoint(position);
        const closestWaypoint = this.track.getWaypoint(closestIndex);
        const distance = position.distance(closestWaypoint);
        return distance > this.track.halfTrackWidth;
    }

    /**
     * Gets the distance from a car to the nearest track boundary
     * @param {Car} car - The car to check
     * @returns {number} Distance to nearest boundary (negative if off-track)
     */
    getDistanceToBoundary(car) {
        const position = car.position;
        const closestIndex = this.track.getClosestWaypoint(position);
        const closestWaypoint = this.track.getWaypoint(closestIndex);
        const distance = position.distance(closestWaypoint);
        return distance - this.track.halfTrackWidth;
    }

    /**
     * Resolves all collisions in the system
     */
    resolveAllCollisions() {
        this._resolveCarCollisions();
        this._resolveTrackCollisions(0);
    }

    /**
     * Resets the collision system
     */
    reset() {
        this.cars = [];
    }
}