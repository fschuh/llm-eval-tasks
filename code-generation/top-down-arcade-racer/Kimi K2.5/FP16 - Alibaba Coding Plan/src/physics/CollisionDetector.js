import { Vector2D } from '../core/Vector2D.js';

/**
 * Collision contact information
 */
export class CollisionContact {
    /**
     * @param {RigidBody} bodyA - First colliding body
     * @param {RigidBody} bodyB - Second colliding body
     * @param {Vector2D} normal - Collision normal (points from A to B)
     * @param {number} penetration - Overlap depth
     * @param {Vector2D} contactPoint - Point of contact
     */
    constructor(bodyA, bodyB, normal, penetration, contactPoint) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.normal = normal;
        this.penetration = penetration;
        this.contactPoint = contactPoint;
    }
}

/**
 * CollisionDetector - Detects collisions between physics bodies
 */
export class CollisionDetector {
    /**
     * Check collision between two circles
     * @param {RigidBody} a - First body (circle)
     * @param {RigidBody} b - Second body (circle)
     * @returns {CollisionContact|null} Contact info or null if no collision
     */
    static checkCircleCircle(a, b) {
        const diff = b.position.sub(a.position);
        const distanceSq = diff.magnitudeSquared();
        const combinedRadius = a.radius + b.radius;
        const combinedRadiusSq = combinedRadius * combinedRadius;

        // No collision
        if (distanceSq >= combinedRadiusSq) {
            return null;
        }

        const distance = Math.sqrt(distanceSq);
        
        // Handle case where centers are exactly on top of each other
        let normal;
        if (distance === 0) {
            normal = new Vector2D(1, 0); // Arbitrary direction
        } else {
            normal = diff.div(distance).normalize();
        }

        const penetration = combinedRadius - distance;
        
        // Contact point is along the normal from A's center
        const contactPoint = a.position.add(normal.mul(a.radius));

        return new CollisionContact(a, b, normal, penetration, contactPoint);
    }

    /**
     * Check collision between a circle and a wall (static circle)
     * @param {RigidBody} circle - Moving circle body
     * @param {Object} wall - Wall object with position and radius
     * @param {Vector2D} wall.position - Wall position
     * @param {number} wall.radius - Wall radius
     * @returns {CollisionContact|null} Contact info or null if no collision
     */
    static checkCircleWall(circle, wall) {
        const wallPosition = wall.position;
        const wallRadius = wall.radius;
        
        const diff = wallPosition.sub(circle.position);
        const distanceSq = diff.magnitudeSquared();
        const combinedRadius = circle.radius + wallRadius;
        const combinedRadiusSq = combinedRadius * combinedRadius;

        // No collision
        if (distanceSq >= combinedRadiusSq) {
            return null;
        }

        const distance = Math.sqrt(distanceSq);
        
        // Normal points from circle to wall
        let normal;
        if (distance === 0) {
            normal = new Vector2D(1, 0);
        } else {
            normal = diff.div(distance).normalize();
        }

        const penetration = combinedRadius - distance;
        const contactPoint = circle.position.add(normal.mul(circle.radius));

        // Create a fake static body for the wall
        const wallBody = {
            id: 'wall',
            position: wallPosition,
            velocity: new Vector2D(0, 0),
            mass: Infinity,
            invMass: 0,
            radius: wallRadius,
            restitution: wall.restitution || 0.5,
            isStatic: true,
            applyImpulse: () => {},
            previousPosition: wallPosition,
            previousRotation: 0
        };

        return new CollisionContact(circle, wallBody, normal, penetration, contactPoint);
    }

    /**
     * Detect all collisions in a list of bodies
     * @param {RigidBody[]} bodies - Array of physics bodies
     * @returns {CollisionContact[]} Array of collision contacts
     */
    static detectAll(bodies) {
        const contacts = [];
        const count = bodies.length;

        // O(n²) pairwise checks - acceptable for small numbers of bodies
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const contact = this.checkCircleCircle(bodies[i], bodies[j]);
                if (contact) {
                    contacts.push(contact);
                }
            }
        }

        return contacts;
    }

    /**
     * Detect collisions between bodies and walls
     * @param {RigidBody[]} bodies - Array of physics bodies
     * @param {Object[]} walls - Array of wall objects
     * @returns {CollisionContact[]} Array of collision contacts
     */
    static detectWalls(bodies, walls) {
        const contacts = [];

        for (const body of bodies) {
            for (const wall of walls) {
                const contact = this.checkCircleWall(body, wall);
                if (contact) {
                    contacts.push(contact);
                }
            }
        }

        return contacts;
    }

    /**
     * Check if a point is inside a circle
     * @param {Vector2D} point - Point to check
     * @param {Vector2D} center - Circle center
     * @param {number} radius - Circle radius
     * @returns {boolean} True if point is inside
     */
    static pointInCircle(point, center, radius) {
        return point.distanceSquared(center) <= radius * radius;
    }

    /**
     * Check if two circles overlap (simple boolean check)
     * @param {Vector2D} centerA - First circle center
     * @param {number} radiusA - First circle radius
     * @param {Vector2D} centerB - Second circle center
     * @param {number} radiusB - Second circle radius
     * @returns {boolean} True if circles overlap
     */
    static circlesOverlap(centerA, radiusA, centerB, radiusB) {
        const combinedRadius = radiusA + radiusB;
        return centerA.distanceSquared(centerB) <= combinedRadius * combinedRadius;
    }
}
