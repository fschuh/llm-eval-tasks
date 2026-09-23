/**
 * Collision Resolver - Impulse-based collision response
 * 
 * Implements impulse-based collision resolution with positional correction
 * to prevent objects from sinking into each other. Supports infinite mass
 * (static) objects.
 */

import { Vector2 } from '../core/vector2.js';

/**
 * Collision information structure
 * @typedef {Object} CollisionInfo
 * @property {boolean} collision - Whether a collision occurred
 * @property {Vector2} normal - Collision normal pointing from A to B
 * @property {number} penetration - Penetration depth
 * @property {Vector2} contactPoint - Contact point (optional)
 */

/**
 * Configuration for collision resolution
 */
export const CollisionConfig = {
    /** Default restitution (bounciness) - 0 = inelastic, 1 = elastic */
    DEFAULT_RESTITUTION: 0.2,
    
    /** Percentage of penetration to correct per frame (0-1) */
    PENETRATION_PERCENT: 0.8,
    
    /** Penetration allowance before correction is applied */
    PENETRATION_SLOP: 0.01,
    
    /** Spin impulse factor for rotational effect */
    SPIN_IMPULSE_FACTOR: 0.1
};

/**
 * Resolves a collision between two rigidbodies using impulse-based response
 * @param {Rigidbody} bodyA - First rigidbody
 * @param {Rigidbody} bodyB - Second rigidbody
 * @param {CollisionInfo} collisionInfo - Collision information from detector
 * @param {number} [restitution] - Restitution coefficient (default: 0.2)
 */
export function resolveCollision(bodyA, bodyB, collisionInfo, restitution = CollisionConfig.DEFAULT_RESTITUTION) {
    if (!collisionInfo || !collisionInfo.collision) {
        return;
    }

    const { normal, penetration } = collisionInfo;

    // Calculate relative velocity
    const relativeVelocity = bodyB.velocity.sub(bodyA.velocity);
    const velocityAlongNormal = relativeVelocity.dot(normal);

    // Do not resolve if velocities are separating
    if (velocityAlongNormal > 0) {
        return;
    }

    // Calculate inverse masses (handle infinite mass)
    const invMassA = bodyA.hasInfiniteMass() ? 0 : bodyA.getInverseMass();
    const invMassB = bodyB.hasInfiniteMass() ? 0 : bodyB.getInverseMass();

    // If both bodies have infinite mass, no impulse can be applied
    if (invMassA === 0 && invMassB === 0) {
        return;
    }

    // Calculate impulse scalar
    // j = -(1 + e) * v_rel · n / (1/mA + 1/mB)
    let impulseScalar = -(1 + restitution) * velocityAlongNormal;
    impulseScalar /= (invMassA + invMassB);

    // Apply impulse along the normal
    const impulse = normal.multiply(impulseScalar);

    // Update velocities
    if (!bodyA.hasInfiniteMass()) {
        bodyA.velocity = bodyA.velocity.sub(impulse.multiply(invMassA));
    }
    if (!bodyB.hasInfiniteMass()) {
        bodyB.velocity = bodyB.velocity.add(impulse.multiply(invMassB));
    }

    // Apply positional correction to prevent sinking
    applyPositionalCorrection(bodyA, bodyB, normal, penetration, invMassA, invMassB);

    // Apply spin impulse for rotational effect
    applySpinImpulse(bodyA, bodyB, relativeVelocity, normal, invMassA, invMassB);
}

/**
 * Applies positional correction to separate overlapping bodies
 * @param {Rigidbody} bodyA - First rigidbody
 * @param {Rigidbody} bodyB - Second rigidbody
 * @param {Vector2} normal - Collision normal
 * @param {number} penetration - Penetration depth
 * @param {number} invMassA - Inverse mass of body A
 * @param {number} invMassB - Inverse mass of body B
 */
function applyPositionalCorrection(bodyA, bodyB, normal, penetration, invMassA, invMassB) {
    const totalInvMass = invMassA + invMassB;
    
    // Calculate correction amount
    const correctionMagnitude = Math.max(penetration - CollisionConfig.PENETRATION_SLOP, 0) 
        * CollisionConfig.PENETRATION_PERCENT 
        / totalInvMass;
    
    const correction = normal.multiply(correctionMagnitude);

    // Apply correction to positions
    if (!bodyA.hasInfiniteMass()) {
        bodyA.position = bodyA.position.sub(correction.multiply(invMassA));
    }
    if (!bodyB.hasInfiniteMass()) {
        bodyB.position = bodyB.position.add(correction.multiply(invMassB));
    }
}

/**
 * Applies a small spin impulse perpendicular to collision normal
 * This simulates rotational effects from collisions
 * @param {Rigidbody} bodyA - First rigidbody
 * @param {Rigidbody} bodyB - Second rigidbody
 * @param {Vector2} relativeVelocity - Relative velocity between bodies
 * @param {Vector2} normal - Collision normal
 * @param {number} invMassA - Inverse mass of body A
 * @param {number} invMassB - Inverse mass of body B
 */
function applySpinImpulse(bodyA, bodyB, relativeVelocity, normal, invMassA, invMassB) {
    // Calculate tangent vector (perpendicular to normal)
    const tangent = new Vector2(-normal.y, normal.x);
    
    // Project relative velocity onto tangent
    const velocityAlongTangent = relativeVelocity.dot(tangent);
    
    // Calculate spin impulse
    const spinImpulseMagnitude = velocityAlongTangent * CollisionConfig.SPIN_IMPULSE_FACTOR;
    const spinImpulse = tangent.multiply(spinImpulseMagnitude);

    // Apply spin impulse to velocities
    if (!bodyA.hasInfiniteMass()) {
        bodyA.velocity = bodyA.velocity.sub(spinImpulse.multiply(invMassA));
    }
    if (!bodyB.hasInfiniteMass()) {
        bodyB.velocity = bodyB.velocity.add(spinImpulse.multiply(invMassB));
    }

    // Apply angular velocity changes based on the collision
    // Simplified model: add some angular velocity based on impact position
    const angularImpulse = spinImpulseMagnitude * 0.001; // Scale factor for angular effect
    
    if (!bodyA.hasInfiniteMass()) {
        bodyA.angularVelocity -= angularImpulse * invMassA * 1000; // Scale back up by mass
    }
    if (!bodyB.hasInfiniteMass()) {
        bodyB.angularVelocity += angularImpulse * invMassB * 1000;
    }
}

/**
 * Resolves multiple collisions sequentially
 * This helps with stability when multiple collisions occur simultaneously
 * @param {Array<{bodyA: Rigidbody, bodyB: Rigidbody, collisionInfo: CollisionInfo}>} collisions - Array of collision pairs
 * @param {number} [iterations=3] - Number of solver iterations
 * @param {number} [restitution] - Restitution coefficient
 */
export function resolveCollisionsSequential(collisions, iterations = 3, restitution = CollisionConfig.DEFAULT_RESTITUTION) {
    for (let i = 0; i < iterations; i++) {
        for (const { bodyA, bodyB, collisionInfo } of collisions) {
            resolveCollision(bodyA, bodyB, collisionInfo, restitution);
        }
    }
}

/**
 * CollisionResolver class for managing collision resolution
 * Can be used as an alternative to standalone functions
 */
export class CollisionResolver {
    /**
     * Create a new CollisionResolver
     * @param {Object} [config] - Configuration options
     * @param {number} [config.restitution=0.2] - Default restitution
     * @param {number} [config.penetrationPercent=0.8] - Penetration correction percentage
     * @param {number} [config.penetrationSlop=0.01] - Penetration allowance
     * @param {number} [config.spinImpulseFactor=0.1] - Spin impulse factor
     */
    constructor(config = {}) {
        this.restitution = config.restitution ?? CollisionConfig.DEFAULT_RESTITUTION;
        this.penetrationPercent = config.penetrationPercent ?? CollisionConfig.PENETRATION_PERCENT;
        this.penetrationSlop = config.penetrationSlop ?? CollisionConfig.PENETRATION_SLOP;
        this.spinImpulseFactor = config.spinImpulseFactor ?? CollisionConfig.SPIN_IMPULSE_FACTOR;
    }

    /**
     * Resolve a single collision
     * @param {Rigidbody} bodyA - First rigidbody
     * @param {Rigidbody} bodyB - Second rigidbody
     * @param {CollisionInfo} collisionInfo - Collision information
     */
    resolve(bodyA, bodyB, collisionInfo) {
        resolveCollision(bodyA, bodyB, collisionInfo, this.restitution);
    }

    /**
     * Resolve multiple collisions with iterations
     * @param {Array} collisions - Array of collision pairs
     * @param {number} [iterations=3] - Number of solver iterations
     */
    resolveAll(collisions, iterations = 3) {
        resolveCollisionsSequential(collisions, iterations, this.restitution);
    }

    /**
     * Set the restitution coefficient
     * @param {number} value - New restitution value (0-1)
     */
    setRestitution(value) {
        this.restitution = Math.max(0, Math.min(1, value));
    }

    /**
     * Get current restitution coefficient
     * @returns {number} Current restitution
     */
    getRestitution() {
        return this.restitution;
    }
}
