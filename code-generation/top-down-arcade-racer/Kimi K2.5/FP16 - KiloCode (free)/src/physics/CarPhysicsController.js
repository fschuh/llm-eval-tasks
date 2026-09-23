import { Vector2 } from '../utils/Vector2.js';

/**
 * Car physics controller - updates car physics state each frame
 */
export class CarPhysicsController {
    /**
     * Update car physics for a single timestep
     */
    static update(car, dt) {
        const physics = car.physics;

        // Store previous state for interpolation
        physics.storePreviousState();

        // Calculate forward and right vectors
        const forward = new Vector2(Math.cos(physics.heading), Math.sin(physics.heading));
        const right = new Vector2(-Math.sin(physics.heading), Math.cos(physics.heading));

        // Decompose velocity into forward and lateral components
        const velForward = physics.velocity.dot(forward);
        const velLateral = physics.velocity.dot(right);

        // Apply acceleration/braking
        let accelInput = 0;
        if (physics.isAccelerating) accelInput = 1;
        else if (physics.isBraking) accelInput = -1;

        // Calculate longitudinal force
        let longitudinalForce = 0;
        if (accelInput > 0) {
            // Accelerating
            longitudinalForce = physics.acceleration * accelInput;
        } else if (accelInput < 0) {
            // Braking/reversing
            if (velForward > 0) {
                // Braking while moving forward
                longitudinalForce = physics.braking * accelInput;
            } else {
                // Reversing
                longitudinalForce = physics.acceleration * 0.5 * accelInput;
            }
        }

        // Apply drag/friction when no input
        if (accelInput === 0) {
            longitudinalForce = -velForward * 2; // Rolling resistance
        }

        // Update forward velocity
        const newVelForward = velForward + longitudinalForce * dt;

        // Clamp to max speeds
        let clampedVelForward = newVelForward;
        if (newVelForward > physics.maxSpeed) clampedVelForward = physics.maxSpeed;
        if (newVelForward < -physics.maxReverseSpeed) clampedVelForward = -physics.maxReverseSpeed;

        // Apply lateral grip (friction)
        const gripForce = -velLateral * physics.grip * 5; // Grip coefficient
        const newVelLateral = velLateral + gripForce * dt;

        // Reconstruct velocity from components
        physics.velocity = forward.multiply(clampedVelForward).add(right.multiply(newVelLateral));

        // Apply general friction/drag
        physics.velocity = physics.velocity.multiply(physics.friction);

        // Update position
        physics.position = physics.position.add(physics.velocity.multiply(dt));

        // Update rotation (steering)
        if (Math.abs(velForward) > 10) { // Can only steer when moving
            // Steering is speed-sensitive: slower = more responsive
            const speedFactor = Math.min(1, 100 / Math.abs(velForward));
            const turnAmount = physics.steering * physics.turnSpeed * speedFactor * dt;

            // Reverse steering when going backward
            const direction = velForward >= 0 ? 1 : -1;
            physics.heading += turnAmount * direction;

            // Normalize heading to [0, 2π)
            physics.heading = ((physics.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        }

        // Update speed magnitude
        physics.speed = physics.velocity.length();
    }
}