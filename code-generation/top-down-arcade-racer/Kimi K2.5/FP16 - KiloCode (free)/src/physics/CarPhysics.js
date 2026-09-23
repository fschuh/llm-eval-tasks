import { Vector2 } from '../utils/Vector2.js';

/**
 * Car physics state container
 */
export class CarPhysics {
    constructor() {
        // Position and orientation
        this.position = new Vector2(0, 0);
        this.velocity = new Vector2(0, 0);
        this.heading = 0;           // Angle in radians (0 = facing right)
        this.angularVelocity = 0;   // Rotation speed

        // Physics properties
        this.mass = 1000;           // kg
        this.invMass = 1 / this.mass;
        this.inertia = 500;         // kg*m^2 (rotational inertia)
        this.invInertia = 1 / this.inertia;

        // Car dimensions (for collision)
        this.width = 20;            // pixels
        this.height = 36;           // pixels
        this.halfWidth = this.width / 2;
        this.halfHeight = this.height / 2;

        // Movement constants
        this.maxSpeed = 300;        // pixels/second
        this.maxReverseSpeed = 80;
        this.acceleration = 200;    // pixels/second^2
        this.braking = 400;         // pixels/second^2
        this.friction = 0.98;       // velocity multiplier per frame
        this.turnSpeed = 2.5;       // radians/second
        this.grip = 0.9;            // lateral friction multiplier

        // Current state
        this.speed = 0;             // Current speed magnitude
        this.isAccelerating = false;
        this.isBraking = false;
        this.steering = 0;          // -1 (left) to 1 (right)

        // Previous position for interpolation
        this.previousPosition = new Vector2(0, 0);
        this.previousHeading = 0;
    }

    /**
     * Store current state as previous for interpolation
     */
    storePreviousState() {
        this.previousPosition = this.position.clone();
        this.previousHeading = this.heading;
    }

    /**
     * Get interpolated position for smooth rendering
     */
    getInterpolatedPosition(alpha) {
        return new Vector2(
            this.previousPosition.x + (this.position.x - this.previousPosition.x) * alpha,
            this.previousPosition.y + (this.position.y - this.previousPosition.y) * alpha
        );
    }

    /**
     * Get interpolated heading for smooth rendering
     */
    getInterpolatedHeading(alpha) {
        // Handle angle wrapping for smooth interpolation
        let diff = this.heading - this.previousHeading;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return this.previousHeading + diff * alpha;
    }
}