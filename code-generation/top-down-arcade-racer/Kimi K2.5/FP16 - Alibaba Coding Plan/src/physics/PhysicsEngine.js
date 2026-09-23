import { RigidBody } from './RigidBody.js';
import { CollisionDetector } from './CollisionDetector.js';
import { CollisionResolver } from './CollisionResolver.js';

/**
 * PhysicsEngine - Main physics coordinator
 */
export class PhysicsEngine {
    /**
     * Create a new physics engine
     */
    constructor() {
        this.bodies = [];
        this.walls = [];
        this.timestep = 1 / 60;
        this.iterations = 3;
        this.restitution = 0.5;
        this.gravity = 0; // Top-down, no gravity
    }

    /**
     * Set the fixed timestep
     * @param {number} dt - Timestep in seconds
     */
    setTimestep(dt) {
        this.timestep = dt;
    }

    /**
     * Set solver iterations for stability
     * @param {number} count - Number of iterations
     */
    setIterations(count) {
        this.iterations = count;
    }

    /**
     * Set global restitution (bounciness)
     * @param {number} restitution - Restitution value (0-1)
     */
    setRestitution(restitution) {
        this.restitution = restitution;
    }

    /**
     * Add a body to the simulation
     * @param {RigidBody} body - Body to add
     */
    addBody(body) {
        if (!this.bodies.includes(body)) {
            this.bodies.push(body);
        }
    }

    /**
     * Remove a body from the simulation
     * @param {RigidBody} body - Body to remove
     */
    removeBody(body) {
        const index = this.bodies.indexOf(body);
        if (index > -1) {
            this.bodies.splice(index, 1);
        }
    }

    /**
     * Add a wall/barrier
     * @param {Object} wall - Wall object with position, radius, restitution
     */
    addWall(wall) {
        this.walls.push(wall);
    }

    /**
     * Remove all walls
     */
    clearWalls() {
        this.walls = [];
    }

    /**
     * Get all bodies
     * @returns {RigidBody[]} Array of bodies
     */
    getBodies() {
        return this.bodies;
    }

    /**
     * Get body count
     * @returns {number} Number of bodies
     */
    getBodyCount() {
        return this.bodies.length;
    }

    /**
     * Step the physics simulation
     * @param {number} dt - Delta time (should be fixed timestep)
     * @param {Object} inputs - Optional inputs for bodies (by id)
     */
    step(dt, inputs = {}) {
        // 1. Apply inputs and update physics for each body
        for (const body of this.bodies) {
            // Apply custom physics update if body has one (like Car)
            if (body.updatePhysics) {
                const bodyInput = inputs[body.id] || null;
                body.updatePhysics(dt, bodyInput);
            } else {
                // Standard rigid body integration
                body.integrate(dt);
            }
        }

        // 2. Detect collisions between bodies
        const bodyContacts = CollisionDetector.detectAll(this.bodies);

        // 3. Detect collisions with walls
        const wallContacts = CollisionDetector.detectWalls(this.bodies, this.walls);

        // 4. Combine all contacts
        const allContacts = [...bodyContacts, ...wallContacts];

        // 5. Resolve collisions
        if (allContacts.length > 0) {
            CollisionResolver.resolveAll(allContacts, this.restitution, this.iterations);
        }

        return allContacts;
    }

    /**
     * Clear all bodies and walls
     */
    clear() {
        this.bodies = [];
        this.walls = [];
    }

    /**
     * Raycast from start to end (simple implementation)
     * @param {Vector2D} start - Start point
     * @param {Vector2D} end - End point
     * @returns {Object|null} Hit info or null
     */
    raycast(start, end) {
        // Simple raycast against circles
        const direction = end.sub(start);
        const distance = direction.magnitude();
        const normalizedDir = direction.div(distance);

        let closestHit = null;
        let closestDistance = distance;

        for (const body of this.bodies) {
            const toBody = body.position.sub(start);
            const projection = toBody.dot(normalizedDir);

            // Skip if behind ray start
            if (projection < 0) continue;

            // Skip if beyond ray end
            if (projection > distance) continue;

            // Calculate closest point on ray to circle center
            const closestPoint = start.add(normalizedDir.mul(projection));
            const distToCenter = closestPoint.distance(body.position);

            // Check if ray passes through circle
            if (distToCenter <= body.radius) {
                // Calculate entry point
                const offset = Math.sqrt(body.radius * body.radius - distToCenter * distToCenter);
                const hitDistance = projection - offset;

                if (hitDistance < closestDistance && hitDistance >= 0) {
                    closestDistance = hitDistance;
                    const hitPoint = start.add(normalizedDir.mul(hitDistance));
                    const normal = hitPoint.sub(body.position).normalize();
                    
                    closestHit = {
                        body: body,
                        point: hitPoint,
                        normal: normal,
                        distance: hitDistance
                    };
                }
            }
        }

        return closestHit;
    }

    /**
     * Get total kinetic energy of the system
     * @returns {number} Total kinetic energy
     */
    getTotalKineticEnergy() {
        return this.bodies.reduce((total, body) => total + body.getKineticEnergy(), 0);
    }
}
