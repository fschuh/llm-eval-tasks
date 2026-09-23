import { Vector2 } from '../math/Vector2.js';

/**
 * Collision detection and impulse resolution system
 * Handles car-to-car and car-to-track collisions using circle-based physics
 */
export class Collision {
    /**
     * @param {Object} options - Collision configuration options
     */
    constructor(options = {}) {
        // Collision configuration
        this.restitution = options.restitution ?? 0.3; // Bounciness (0 = no bounce, 1 = full bounce)
        this.friction = options.friction ?? 0.5; // Friction during collision
        this.minSeparationSpeed = options.minSeparationSpeed ?? 5; // Minimum speed to apply separation
        this.carRadius = options.carRadius ?? 18; // Collision radius for cars
    }

    /**
     * Check collision between two cars
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @returns {Object|null} Collision information or null if no collision
     */
    checkCarToCar(car1, car2) {
        const car1Pos = car1.position;
        const car2Pos = car2.position;

        // Calculate distance between car centers
        const toCar = car2Pos.clone().subtract(car1Pos);
        const distanceSquared = toCar.lengthSquared();
        const radiusSum = this.carRadius + this.carRadius;
        const radiusSumSquared = radiusSum * radiusSum;

        // Check if cars are colliding
        if (distanceSquared < radiusSumSquared && distanceSquared > 0) {
            const distance = Math.sqrt(distanceSquared);
            const normal = toCar.clone().divide(distance);

            // Calculate penetration depth
            const penetrationDepth = radiusSum - distance;

            return {
                car1,
                car2,
                normal, // Normal vector pointing from car1 to car2
                penetrationDepth,
                distance,
                contactPoint: car1Pos.clone().add(normal.clone().multiply(this.carRadius))
            };
        }

        return null;
    }

    /**
     * Resolve collision between two cars using impulse-based physics
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @returns {Object} Collision resolution results
     */
    resolveCarToCar(car1, car2) {
        const collision = this.checkCarToCar(car1, car2);

        if (!collision) {
            return { collided: false };
        }

        const { normal, penetrationDepth, contactPoint } = collision;

        // Separate cars to prevent sticking (position correction)
        this.separateCars(car1, car2, normal, penetrationDepth);

        // Calculate relative velocity at contact point
        const relativeVelocity = this.getRelativeVelocity(car1, car2, contactPoint, normal);

        // Calculate impulse scalar
        const impulse = this.calculateImpulse(car1, car2, normal, relativeVelocity);

        // Apply impulses to both cars
        this.applyImpulse(car1, impulse, normal, contactPoint);
        this.applyImpulse(car2, -impulse, normal, contactPoint);

        return {
            collided: true,
            normal,
            penetrationDepth,
            impulse
        };
    }

    /**
     * Check if car collides with track boundaries
     * @param {Car} car - The car to check
     * @param {Track} track - The track object
     * @returns {Object|null} Collision information or null if no collision
     */
    checkCarToTrack(car, track) {
        // Find closest track center point
        let closestDist = Infinity;
        let closestIndex = 0;

        for (let i = 0; i < track.centerPoints.length; i++) {
            const dist = car.position.distanceSquared(track.centerPoints[i]);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }

        const trackCenter = track.centerPoints[closestIndex];
        const toCar = car.position.clone().subtract(trackCenter);
        const distFromCenter = toCar.length();
        const maxTrackRadius = track.trackWidth / 2;

        // Check if car is outside track boundaries
        if (distFromCenter > maxTrackRadius) {
            // Calculate boundary normal (pointing inward from boundary to center)
            const boundaryNormal = toCar.clone().normalize().negate();

            // Calculate penetration depth (how far outside the track)
            const penetrationDepth = distFromCenter - maxTrackRadius;

            return {
                car,
                normal: boundaryNormal, // Normal pointing inward from boundary
                penetrationDepth,
                contactPoint: trackCenter.clone().add(boundaryNormal.clone().multiply(-maxTrackRadius))
            };
        }

        return null;
    }

    /**
     * Resolve car-to-track collision
     * @param {Car} car - The car to resolve
     * @param {Track} track - The track object
     * @returns {Object} Collision resolution results
     */
    resolveCarToTrack(car, track) {
        const collision = this.checkCarToTrack(car, track);

        if (!collision) {
            return { collided: false };
        }

        const { normal, penetrationDepth, contactPoint } = collision;

        // Separate car from boundary
        this.separateCarFromTrack(car, normal, penetrationDepth);

        // Calculate relative velocity (with stationary track)
        const relativeVelocity = this.getCarVelocityAlongNormal(car, normal);

        // Only resolve if car is moving toward the boundary
        if (relativeVelocity < -this.minSeparationSpeed) {
            // Calculate impulse (track has infinite mass)
            const impulse = -relativeVelocity * (1 + this.restitution);

            // Apply impulse to car
            this.applyImpulse(car, impulse, normal, contactPoint);
        }

        return {
            collided: true,
            normal,
            penetrationDepth,
            impulse: relativeVelocity * (1 + this.restitution)
        };
    }

    /**
     * Apply collision impulse to a car
     * @param {Car} car - The car to apply impulse to
     * @param {number} impulse - Impulse scalar magnitude
     * @param {Vector2} normal - Collision normal vector
     * @param {Vector2} contactPoint - Point of contact (optional)
     */
    applyImpulse(car, impulse, normal, contactPoint = null) {
        // Apply impulse to velocity
        const impulseVector = normal.clone().multiply(impulse);
        car.velocity.add(impulseVector);

        // Apply friction (tangential impulse)
        if (contactPoint) {
            this.applyFriction(car, impulse, normal, contactPoint);
        }
    }

    /**
     * Separate two overlapping cars to prevent sticking
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @param {Vector2} normal - Collision normal (from car1 to car2)
     * @param {number} penetrationDepth - Depth of penetration
     */
    separateCars(car1, car2, normal, penetrationDepth) {
        // Split separation equally between both cars
        const separation = normal.clone().multiply(penetrationDepth / 2);

        car1.position.subtract(separation);
        car2.position.add(separation);
    }

    /**
     * Separate car from track boundary
     * @param {Car} car - The car to separate
     * @param {Vector2} normal - Boundary normal (pointing inward)
     * @param {number} penetrationDepth - How far outside the track
     */
    separateCarFromTrack(car, normal, penetrationDepth) {
        // Move car inward by penetration depth
        const separation = normal.clone().multiply(penetrationDepth);
        car.position.add(separation);
    }

    /**
     * Calculate relative velocity between two cars at a contact point
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @param {Vector2} contactPoint - Point of contact
     * @param {Vector2} normal - Collision normal
     * @returns {number} Relative velocity along the normal
     */
    getRelativeVelocity(car1, car2, contactPoint, normal) {
        // Get velocity vectors
        const v1 = car1.velocity;
        const v2 = car2.velocity;

        // Calculate relative velocity
        const relativeVelocity = v2.clone().subtract(v1);

        // Project onto normal
        return relativeVelocity.dot(normal);
    }

    /**
     * Get car velocity along a normal
     * @param {Car} car - The car
     * @param {Vector2} normal - Normal vector
     * @returns {number} Velocity along the normal
     */
    getCarVelocityAlongNormal(car, normal) {
        return car.velocity.dot(normal);
    }

    /**
     * Calculate impulse scalar for collision resolution
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @param {Vector2} normal - Collision normal
     * @param {number} relativeVelocity - Relative velocity along normal
     * @returns {number} Impulse scalar
     */
    calculateImpulse(car1, car2, normal, relativeVelocity) {
        // Default mass of 1 for all cars
        const mass1 = 1;
        const mass2 = 1;

        // Calculate impulse scalar
        // j = -(1 + e) * v_rel / (1/m1 + 1/m2)
        const restitution = this.restitution;
        const inverseMassSum = 1 / mass1 + 1 / mass2;

        if (inverseMassSum === 0) return 0;

        const impulse = -(1 + restitution) * relativeVelocity / inverseMassSum;

        return Math.max(impulse, 0); // Ensure impulse is non-negative
    }

    /**
     * Apply friction impulse to reduce lateral velocity
     * @param {Car} car - The car to apply friction to
     * @param {number} normalImpulse - Impulse along normal
     * @param {Vector2} normal - Collision normal
     * @param {Vector2} contactPoint - Point of contact
     */
    applyFriction(car, normalImpulse, normal, contactPoint) {
        // Get tangent direction (perpendicular to normal)
        const tangent = normal.perpendicular();

        // Calculate velocity along tangent
        const tangentVelocity = car.velocity.dot(tangent);

        // Apply friction impulse opposite to tangent velocity
        const frictionImpulse = -tangentVelocity * this.friction;

        // Limit friction by normal impulse (Coulomb friction)
        const maxFriction = normalImpulse * this.friction;
        const clampedFriction = Math.max(-maxFriction, Math.min(maxFriction, frictionImpulse));

        // Apply friction to velocity
        const frictionVector = tangent.clone().multiply(clampedFriction);
        car.velocity.add(frictionVector);
    }

    /**
     * Check all car-to-car collisions
     * @param {Car[]} cars - Array of cars to check
     * @returns {Object[]} Array of collision results
     */
    checkAllCarToCar(cars) {
        const results = [];

        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                const collision = this.checkCarToCar(cars[i], cars[j]);
                if (collision) {
                    results.push(collision);
                }
            }
        }

        return results;
    }

    /**
     * Resolve all car-to-car collisions
     * @param {Car[]} cars - Array of cars
     * @returns {Object[]} Array of resolution results
     */
    resolveAllCarToCar(cars) {
        const results = [];

        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                const result = this.resolveCarToCar(cars[i], cars[j]);
                if (result.collided) {
                    results.push(result);
                }
            }
        }

        return results;
    }

    /**
     * Resolve all collisions for a set of cars on a track
     * @param {Car[]} cars - Array of cars
     * @param {Track} track - The track
     * @returns {Object} All collision results
     */
    resolveAll(cars, track) {
        const carToCarResults = this.resolveAllCarToCar(cars);
        const carToTrackResults = [];

        for (const car of cars) {
            const result = this.resolveCarToTrack(car, track);
            if (result.collided) {
                carToTrackResults.push(result);
            }
        }

        return {
            carToCar: carToCarResults,
            carToTrack: carToTrackResults
        };
    }
}
