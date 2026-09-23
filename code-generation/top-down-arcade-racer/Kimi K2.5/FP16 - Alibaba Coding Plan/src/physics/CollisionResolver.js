import { Vector2D } from '../core/Vector2D.js';

/**
 * CollisionResolver - Resolves collisions using impulse-based resolution
 */
export class CollisionResolver {
    /**
     * Resolve a single collision contact
     * @param {CollisionContact} contact - Contact to resolve
     * @param {number} restitution - Bounciness (0-1)
     */
    static resolve(contact, restitution = 0.5) {
        const a = contact.bodyA;
        const b = contact.bodyB;
        const normal = contact.normal;

        // Relative velocity
        const relativeVel = b.velocity.sub(a.velocity);
        const velAlongNormal = relativeVel.dot(normal);

        // Don't resolve if separating
        if (velAlongNormal > 0) return;

        // Use combined restitution
        const aRestitution = a.restitution !== undefined ? a.restitution : restitution;
        const bRestitution = b.restitution !== undefined ? b.restitution : restitution;
        const combinedRestitution = Math.min(aRestitution, bRestitution);

        // Calculate impulse scalar
        let impulseScalar = -(1 + combinedRestitution) * velAlongNormal;
        
        // Add mass influence
        const totalInvMass = a.invMass + b.invMass;
        if (totalInvMass === 0) return; // Both are static
        
        impulseScalar /= totalInvMass;

        // Apply impulse
        const impulse = normal.mul(impulseScalar);
        a.velocity = a.velocity.sub(impulse.mul(a.invMass));
        b.velocity = b.velocity.add(impulse.mul(b.invMass));

        // Positional correction to prevent sinking
        this.positionalCorrection(contact);
    }

    /**
     * Resolve all collision contacts
     * @param {CollisionContact[]} contacts - Array of contacts
     * @param {number} restitution - Bounciness (0-1)
     * @param {number} iterations - Number of solver iterations
     */
    static resolveAll(contacts, restitution = 0.5, iterations = 3) {
        if (contacts.length === 0) return;

        // Run multiple iterations for stability
        for (let i = 0; i < iterations; i++) {
            for (const contact of contacts) {
                this.resolve(contact, restitution);
            }
        }
    }

    /**
     * Apply positional correction to prevent objects from sinking into each other
     * @param {CollisionContact} contact - Contact to correct
     * @param {number} percent - Percentage of penetration to correct
     * @param {number} slop - Threshold to ignore small penetrations
     */
    static positionalCorrection(contact, percent = 0.4, slop = 0.01) {
        const a = contact.bodyA;
        const b = contact.bodyB;
        const normal = contact.normal;
        const penetration = contact.penetration;

        const totalInvMass = a.invMass + b.invMass;
        if (totalInvMass === 0) return;

        const correction = Math.max(penetration - slop, 0) / totalInvMass * percent;
        const correctionVector = normal.mul(correction);

        if (!a.isStatic) {
            a.position = a.position.sub(correctionVector.mul(a.invMass));
        }
        if (!b.isStatic) {
            b.position = b.position.add(correctionVector.mul(b.invMass));
        }
    }

    /**
     * Apply friction to collision response (optional)
     * @param {CollisionContact} contact - Contact
     * @param {number} friction - Friction coefficient
     */
    static applyFriction(contact, friction = 0.1) {
        const a = contact.bodyA;
        const b = contact.bodyB;
        const normal = contact.normal;

        // Relative velocity
        const relativeVel = b.velocity.sub(a.velocity);
        
        // Tangential velocity (perpendicular to normal)
        const tangent = relativeVel.sub(normal.mul(relativeVel.dot(normal)));
        
        // Skip if tangential velocity is negligible
        if (tangent.magnitudeSquared() < 0.0001) return;

        const tangentNormal = tangent.normalize();
        
        // Friction impulse
        const velAlongTangent = relativeVel.dot(tangentNormal);
        let frictionImpulseScalar = -velAlongTangent;
        
        const totalInvMass = a.invMass + b.invMass;
        if (totalInvMass === 0) return;
        
        frictionImpulseScalar /= totalInvMass;
        
        // Clamp friction impulse
        const maxFriction = friction * Math.abs(contact.impulseScalar || 0);
        frictionImpulseScalar = Math.max(-maxFriction, Math.min(frictionImpulseScalar, maxFriction));

        // Apply friction impulse
        const frictionImpulse = tangentNormal.mul(frictionImpulseScalar);
        a.velocity = a.velocity.sub(frictionImpulse.mul(a.invMass));
        b.velocity = b.velocity.add(frictionImpulse.mul(b.invMass));
    }
}
