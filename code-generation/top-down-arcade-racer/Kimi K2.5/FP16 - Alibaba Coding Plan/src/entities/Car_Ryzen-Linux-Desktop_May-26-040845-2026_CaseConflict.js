import { RigidBody } from '../physics/RigidBody.js';
import { Vector2D } from '../core/Vector2D.js';
import { DEFAULT_CAR_CONFIG } from '../config/GameConfig.js';

/**
 * Car - Race car entity with arcade physics
 */
export class Car extends RigidBody {
    /**
     * Create a new car
     * @param {string} id - Unique identifier
     * @param {boolean} isPlayer - Whether this is the player car
     * @param {Object} config - Car configuration
     */
    constructor(id, isPlayer = false, config = {}) {
        // Merge config with defaults
        const mergedConfig = { ...DEFAULT_CAR_CONFIG, ...config };
        
        super({
            id,
            mass: mergedConfig.mass,
            radius: mergedConfig.radius,
            position: new Vector2D(0, 0),
            rotation: 0
        });

        this.isPlayer = isPlayer;
        
        // Car physics state
        this.speed = 0;  // Forward speed (scalar)
        this.heading = new Vector2D(1, 0);  // Forward direction
        
        // Car configuration
        this.config = {
            maxSpeed: mergedConfig.maxSpeed,
            maxReverseSpeed: mergedConfig.maxReverseSpeed,
            acceleration: mergedConfig.acceleration,
            braking: mergedConfig.braking,
            friction: mergedConfig.friction,
            turnSpeed: mergedConfig.turnSpeed,
            grip: mergedConfig.grip
        };

        // Control inputs
        this.input = {
            throttle: 0,  // 0.0 to 1.0
            brake: 0,     // 0.0 to 1.0
            steering: 0   // -1.0 (left) to 1.0 (right)
        };

        // Race state
        this.raceState = {
            currentLap: 0,
            lapStartTime: 0,
            bestLapTime: Infinity,
            totalTime: 0,
            currentWaypoint: 0,
            distanceToNextWaypoint: 0,
            finished: false,
            finalPosition: 0
        };

        // Visual properties
        this.color = isPlayer ? '#00FF00' : '#FF0000';
        this.width = 20;
        this.length = 30;
    }

    /**
     * Set control inputs
     * @param {number} throttle - Throttle input [0, 1]
     * @param {number} brake - Brake input [0, 1]
     * @param {number} steering - Steering input [-1, 1]
     */
    setInput(throttle, brake, steering) {
        this.input.throttle = Math.max(0, Math.min(1, throttle));
        this.input.brake = Math.max(0, Math.min(1, brake));
        this.input.steering = Math.max(-1, Math.min(1, steering));
    }

    /**
     * Update car physics (arcade style)
     * @param {number} dt - Delta time in seconds
     * @param {Object} externalInput - Optional external input (from AI)
     */
    updatePhysics(dt, externalInput = null) {
        // Use external input if provided (AI), otherwise use set inputs
        const input = externalInput || this.input;

        // 1. Update speed based on throttle/brake
        if (input.throttle > 0) {
            this.speed += this.config.acceleration * input.throttle * dt;
        } else if (input.brake > 0) {
            this.speed -= this.config.braking * input.brake * dt;
        }

        // 2. Apply natural friction/deceleration
        const frictionFactor = 1 - (this.config.friction * dt);
        this.speed *= frictionFactor;

        // 3. Clamp to max speeds
        this.speed = Math.max(-this.config.maxReverseSpeed, 
                              Math.min(this.config.maxSpeed, this.speed));

        // Stop completely if very slow
        if (Math.abs(this.speed) < 1) {
            this.speed = 0;
        }

        // 4. Update rotation based on steering and speed
        // Steering is more effective at higher speeds
        const speedFactor = Math.abs(this.speed) / this.config.maxSpeed;
        const effectiveTurnSpeed = this.config.turnSpeed * (0.3 + 0.7 * speedFactor);
        const turnAmount = input.steering * effectiveTurnSpeed * dt;
        
        // Only turn if moving
        if (Math.abs(this.speed) > 5) {
            this.rotation += turnAmount * Math.sign(this.speed);
        }

        // 5. Update heading vector
        this.heading = Vector2D.fromAngle(this.rotation);

        // 6. Calculate velocity from heading and speed
        this.velocity = this.heading.mul(this.speed);

        // 7. Apply lateral friction (grip - prevents infinite sliding)
        // In arcade physics, we mostly move in heading direction
        // But we add some lateral friction for drift feel
        const lateralFriction = this.config.grip * dt;
        // Simplified: velocity is already aligned with heading in this model

        // 8. Integrate position
        this.previousPosition = this.position.clone();
        this.previousRotation = this.rotation;
        this.position = this.position.add(this.velocity.mul(dt));

        // 9. Update race state timing
        if (!this.raceState.finished) {
            this.raceState.totalTime += dt;
        }
    }

    /**
     * Get current lap state
     * @returns {Object} Lap state info
     */
    getLapState() {
        return {
            currentLap: this.raceState.currentLap,
            bestLapTime: this.raceState.bestLapTime,
            totalTime: this.raceState.totalTime,
            currentWaypoint: this.raceState.currentWaypoint,
            finished: this.raceState.finished
        };
    }

    /**
     * Complete a lap
     * @param {number} currentTime - Current race time
     */
    completeLap(currentTime) {
        const lapTime = currentTime - this.raceState.lapStartTime;
        
        if (this.raceState.currentLap > 0) {
            // Update best lap time
            if (lapTime < this.raceState.bestLapTime) {
                this.raceState.bestLapTime = lapTime;
            }
        }

        this.raceState.currentLap++;
        this.raceState.lapStartTime = currentTime;
    }

    /**
     * Reset car to starting state
     * @param {Vector2D} position - New position
     * @param {number} rotation - New rotation
     */
    reset(position, rotation) {
        super.reset(position, rotation);
        
        this.speed = 0;
        this.heading = Vector2D.fromAngle(rotation);
        this.velocity = new Vector2D(0, 0);
        this.angularVelocity = 0;
        
        this.input = { throttle: 0, brake: 0, steering: 0 };
        
        this.raceState = {
            currentLap: 0,
            lapStartTime: 0,
            bestLapTime: Infinity,
            totalTime: 0,
            currentWaypoint: 0,
            distanceToNextWaypoint: 0,
            finished: false,
            finalPosition: 0
        };
    }

    /**
     * Mark car as finished
     * @param {number} finalPosition - Final race position
     */
    finish(finalPosition) {
        this.raceState.finished = true;
        this.raceState.finalPosition = finalPosition;
        this.input = { throttle: 0, brake: 0, steering: 0 };
    }

    /**
     * Get forward speed (positive = forward, negative = reverse)
     * @returns {number} Speed
     */
    getForwardSpeed() {
        return this.speed;
    }

    /**
     * Get speed in km/h for display
     * @returns {number} Speed in km/h
     */
    getSpeedKmh() {
        // Scale: 300 pixels/sec ≈ 200 km/h
        return Math.abs(this.speed) * 0.67;
    }

    /**
     * Get the four corners of the car for rendering
     * @returns {Vector2D[]} Array of corner positions
     */
    getCorners() {
        const halfLength = this.length / 2;
        const halfWidth = this.width / 2;
        
        // Local corners
        const corners = [
            new Vector2D(halfLength, halfWidth),      // Front right
            new Vector2D(halfLength, -halfWidth),     // Front left
            new Vector2D(-halfLength, -halfWidth),    // Rear left
            new Vector2D(-halfLength, halfWidth)      // Rear right
        ];
        
        // Transform to world space
        return corners.map(corner => {
            const rotated = corner.rotate(this.rotation);
            return this.position.add(rotated);
        });
    }
}
