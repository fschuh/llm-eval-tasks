/**
 * Collision Detection and Resolution
 * 
 * Implements collision detection (circle-circle, AABB) and impulse-based
 * collision resolution for physics bodies in the racing game.
 */

import { Vector2 } from '../core/Vector2.js';
import { PHYSICS_CONFIG } from './PhysicsBody.js';

/**
 * Collision pair structure
 */
export class CollisionPair {
    /**
     * Creates a new collision pair
     * @param {PhysicsBody} bodyA - First physics body
     * @param {PhysicsBody} bodyB - Second physics body
     */
    constructor(bodyA, bodyB) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
    }
}

/**
 * Collision detection and resolution utilities
 */
export class Collision {
    /**
     * Checks if two circles collide
     * @param {PhysicsBody} a - First physics body
     * @param {PhysicsBody} b - Second physics body
     * @returns {boolean} True if circles collide
     */
    static checkCircleCircle(a, b) {
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const distanceSq = dx * dx + dy * dy;
        const radiusSum = a.radius + b.radius;
        return distanceSq < radiusSum * radiusSum;
    }

    /**
     * Checks if two AABBs collide
     * @param {PhysicsBody} a - First physics body
     * @param {PhysicsBody} b - Second physics body
     * @returns {boolean} True if AABBs collide
     */
    static checkAABB(a, b) {
        // For cars, use a simple box approximation based on radius
        const widthA = a.radius * 2;
        const heightA = a.radius * 2;
        const widthB = b.radius * 2;
        const heightB = b.radius * 2;

        return Math.abs(a.position.x - b.position.x) < (widthA + widthB) / 2 &&
               Math.abs(a.position.y - b.position.y) < (heightA + heightB) / 2;
    }

    /**
     * Checks collision between two physics bodies
     * Uses circle-circle for cars
     * @param {PhysicsBody} a - First physics body
     * @param {PhysicsBody} b - Second physics body
     * @returns {boolean} True if bodies collide
     */
    static checkCollision(a, b) {
        return this.checkCircleCircle(a, b);
    }

    /**
     * Calculates collision normal and penetration depth for two circles
     * @param {PhysicsBody} a - First physics body
     * @param {PhysicsBody} b - Second physics body
     * @returns {Object} Collision information with normal and penetration
     */
    static getCircleCollisionInfo(a, b) {
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const distanceSq = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSq);
        const radiusSum = a.radius + b.radius;

        // Check if colliding
        if (distance >= radiusSum) {
            return null;
        }

        // Calculate normal (from b to a)
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate penetration depth
        const penetration = radiusSum - distance;

        return {
            normal: new Vector2(nx, ny),
            penetration: penetration,
            distance: distance
        };
    }

    /**
     * Resolves collision between two bodies using impulse-based method
     * @param {PhysicsBody} a - First physics body
     * @param {PhysicsBody} b - Second physics body
     */
    static resolveCollision(a, b) {
        const info = this.getCircleCollisionInfo(a, b);
        if (!info) return;

        const { normal, penetration } = info;

        // Calculate relative velocity
        const rvx = a.velocity.x - b.velocity.x;
        const rvy = a.velocity.y - b.velocity.y;

        // Velocity along normal
        const velAlongNormal = rvx * normal.x + rvy * normal.y;

        // Do not resolve if velocities are separating
        if (velAlongNormal > 0) return;

        // Calculate impulse scalar
        let j = -(1 + a.restitution) * velAlongNormal;
        j /= (1 / a.mass + 1 / b.mass);

        // Apply impulse
        const impulseX = j * normal.x;
        const impulseY = j * normal.y;

        a.velocity.x += impulseX / a.mass;
        a.velocity.y += impulseY / a.mass;
        b.velocity.x -= impulseX / b.mass;
        b.velocity.y -= impulseY / b.mass;

        // Positional correction (prevent sinking)
        const correction = penetration / (1 / a.mass + 1 / b.mass);
        const cx = correction * normal.x;
        const cy = correction * normal.y;

        a.position.x += cx / a.mass;
        a.position.y += cy / a.mass;
        b.position.x -= cx / b.mass;
        b.position.y -= cy / b.mass;
    }

    /**
     * Resolves collision with positional only correction (for static objects)
     * @param {PhysicsBody} body - Moving body
     * @param {Vector2} position - Static position
     * @param {number} radius - Static radius
     */
    static resolveStaticCollision(body, position, radius) {
        const dx = body.position.x - position.x;
        const dy = body.position.y - position.y;
        const distanceSq = dx * dx + dy * dy;
        const radiusSum = body.radius + radius;
        const distance = Math.sqrt(distanceSq);

        if (distance >= radiusSum) return;

        // Calculate normal
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate penetration
        const penetration = radiusSum - distance;

        // Positional correction only (static object has infinite mass)
        body.position.x += nx * penetration;
        body.position.y += ny * penetration;
    }

    /**
     * Gets all collisions between a list of physics bodies
     * @param {PhysicsBody[]} bodies - List of physics bodies
     * @returns {CollisionPair[]} List of collision pairs
     */
    static getCollisions(bodies) {
        const collisions = [];
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                if (this.checkCollision(bodies[i], bodies[j])) {
                    collisions.push(new CollisionPair(bodies[i], bodies[j]));
                }
            }
        }
        return collisions;
    }

    /**
     * Resolves all collisions in a list of bodies
     * @param {PhysicsBody[]} bodies - List of physics bodies
     */
    static resolveAllCollisions(bodies) {
        const collisions = this.getCollisions(bodies);
        for (const pair of collisions) {
            this.resolveCollision(pair.bodyA, pair.bodyB);
        }
    }

    /**
     * Checks if a point is inside a circle
     * @param {Vector2} point - Point to check
     * @param {Vector2} center - Circle center
     * @param {number} radius - Circle radius
     * @returns {boolean} True if point is inside circle
     */
    static pointInCircle(point, center, radius) {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const distanceSq = dx * dx + dy * dy;
        return distanceSq < radius * radius;
    }

    /**
     * Checks if a point is inside an AABB
     * @param {Vector2} point - Point to check
     * @param {Vector2} center - AABB center
     * @param {number} width - AABB width
     * @param {number} height - AABB height
     * @returns {boolean} True if point is inside AABB
     */
    static pointInAABB(point, center, width, height) {
        return point.x >= center.x - width / 2 &&
               point.x <= center.x + width / 2 &&
               point.y >= center.y - height / 2 &&
               point.y <= center.y + height / 2;
    }
}