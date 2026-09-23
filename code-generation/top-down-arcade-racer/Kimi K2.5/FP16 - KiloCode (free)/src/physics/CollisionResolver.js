import { Vector2 } from '../utils/Vector2.js';

/**
 * Collision resolver using impulse-based resolution
 */
export class CollisionResolver {
    /**
     * Resolve collision between two cars
     */
    static resolve(carA, carB, collision) {
        const physicsA = carA.physics;
        const physicsB = carB.physics;

        // Relative velocity
        const relativeVel = physicsB.velocity.subtract(physicsA.velocity);

        // Velocity along collision normal
        const velAlongNormal = relativeVel.dot(collision.axis);

        // Don't resolve if velocities are separating
        if (velAlongNormal > 0) return;

        // Restitution (bounciness)
        const restitution = 0.3; // Cars aren't very bouncy

        // Calculate impulse scalar
        let j = -(1 + restitution) * velAlongNormal;
        j /= physicsA.invMass + physicsB.invMass;

        // Apply impulse
        const impulse = collision.axis.multiply(j);
        physicsA.velocity = physicsA.velocity.subtract(impulse.multiply(physicsA.invMass));
        physicsB.velocity = physicsB.velocity.add(impulse.multiply(physicsB.invMass));

        // Apply friction (tangent impulse)
        const relativeVelAfter = physicsB.velocity.subtract(physicsA.velocity);
        const tangent = relativeVelAfter.subtract(collision.axis.multiply(relativeVelAfter.dot(collision.axis)));
        
        if (tangent.length() > 0.001) {
            const tangentNormalized = tangent.normalize();
            const friction = 0.4; // Friction coefficient
            let jt = -relativeVelAfter.dot(tangentNormalized);
            jt /= physicsA.invMass + physicsB.invMass;

            // Clamp friction impulse
            if (Math.abs(jt) > j * friction) {
                jt = jt > 0 ? j * friction : -j * friction;
            }

            const frictionImpulse = tangentNormalized.multiply(jt);
            physicsA.velocity = physicsA.velocity.subtract(frictionImpulse.multiply(physicsA.invMass));
            physicsB.velocity = physicsB.velocity.add(frictionImpulse.multiply(physicsB.invMass));
        }

        // Positional correction (prevent sinking)
        const percent = 0.8; // Penetration percentage to correct
        const slop = 0.01;   // Penetration allowance
        const correction = collision.axis.multiply(
            Math.max(collision.overlap - slop, 0) / (physicsA.invMass + physicsB.invMass) * percent
        );

        physicsA.position = physicsA.position.subtract(correction.multiply(physicsA.invMass));
        physicsB.position = physicsB.position.add(correction.multiply(physicsB.invMass));

        // Set collision cooldown
        carA.collisionCooldown = 10;
        carB.collisionCooldown = 10;
    }
}