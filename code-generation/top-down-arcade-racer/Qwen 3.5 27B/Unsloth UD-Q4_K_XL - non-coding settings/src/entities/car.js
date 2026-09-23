/**
 * Car entity class representing a race car with full physics simulation.
 * Implements acceleration, braking, steering, friction, and collision detection.
 * Physics constants follow the specifications from the architecture document.
 * 
 * @module Car
 */
import Vector2 from '../core/vector2.js';

// Physics constants from architecture document section 3
const PHYSICS_CONFIG = {
    MAX_SPEED: 400,           // pixels per second
    ACCELERATION: 800,        // pixels per second²
    BRAKING_FORCE: 1200,      // pixels per second²
    FRICTION: 5.0,            // friction coefficient (converted from multiplier)
    LATERAL_FRICTION: 0.8,    // reduces sideways sliding
    MAX_STEER_ANGLE: Math.PI / 6,  // 30 degrees in radians
    STEER_SPEED: 5,           // radians per second
    MIN_STEER_SPEED: 10,      // minimum speed to enable steering
    RESTITUTION: 0.5          // bounciness (0-1)
};

class Car {
    /**
     * Creates a new Car instance with the specified configuration.
     * 
     * @param {Object} config - Configuration object for car properties
     * @param {Vector2|number} [config.position] - Starting position as Vector2 or x coordinate
     * @param {number} [config.y] - Y coordinate if position is not a Vector2
     * @param {Vector2} [config.velocity=new Vector2(0,0)] - Initial velocity vector
     * @param {Vector2} [config.acceleration=new Vector2(0,0)] - Current acceleration vector
     * @param {number} [config.angle=0] - Car orientation in radians (0 = facing right)
     * @param {number} [config.angularVelocity=0] - Angular velocity in rad/s
     * @param {number} [config.width=20] - Car width in pixels
     * @param {number} [config.height=36] - Car height in pixels
     * @param {number} [config.mass=1500] - Car mass for collision physics
     * @param {number} [config.maxSpeed] - Maximum speed (defaults to PHYSICS_CONFIG.MAX_SPEED)
     * @param {number} [config.accelerationForce] - Acceleration force (defaults to PHYSICS_CONFIG.ACCELERATION)
     * @param {number} [config.brakingForce] - Braking force (defaults to PHYSICS_CONFIG.BRAKING_FORCE)
     * @param {number} [config.steeringAngle] - Max steering angle in radians (defaults to PHYSICS_CONFIG.MAX_STEER_ANGLE)
     * @param {number} [config.frictionCoefficient] - Friction coefficient (defaults to PHYSICS_CONFIG.FRICTION)
     * @param {number} [config.restitution] - Bounciness 0-1 (defaults to PHYSICS_CONFIG.RESTITUTION)
     */
    constructor(config = {}) {
        // Position and orientation
        if (config.position instanceof Vector2) {
            /** @type {Vector2} Current position of the car center */
            this.position = config.position.clone();
        } else {
            this.position = new Vector2(config.position || 0, config.y || 0);
        }
        
        /** @type {Vector2} Current velocity vector */
        this.velocity = (config.velocity instanceof Vector2) 
            ? config.velocity.clone() 
            : new Vector2(0, 0);
        
        /** @type {Vector2} Current acceleration vector */
        this.acceleration = (config.acceleration instanceof Vector2)
            ? config.acceleration.clone()
            : new Vector2(0, 0);
        
        /** @type {number} Car orientation in radians (0 = facing right/east) */
        this.angle = config.angle || 0;
        
        /** @type {number} Angular velocity in radians per second */
        this.angularVelocity = config.angularVelocity || 0;
        
        // Dimensions and mass
        /** @type {number} Car width in pixels */
        this.width = config.width !== undefined ? config.width : 20;
        
        /** @type {number} Car height in pixels */
        this.height = config.height !== undefined ? config.height : 36;
        
        /** @type {number} Car mass for collision physics calculations */
        this.mass = config.mass || 1500;
        
        // Physics parameters (use config values or defaults from PHYSICS_CONFIG)
        /** @type {number} Maximum forward velocity in pixels per second */
        this.maxSpeed = config.maxSpeed !== undefined ? config.maxSpeed : PHYSICS_CONFIG.MAX_SPEED;
        
        /** @type {number} Forward acceleration rate in pixels per second² */
        this.accelerationForce = config.accelerationForce !== undefined 
            ? config.accelerationForce 
            : PHYSICS_CONFIG.ACCELERATION;
        
        /** @type {number} Deceleration when braking in pixels per second² */
        this.brakingForce = config.brakingForce !== undefined 
            ? config.brakingForce 
            : PHYSICS_CONFIG.BRAKING_FORCE;
        
        /** @type {number} Maximum steering angle from forward direction in radians */
        this.steeringAngle = config.steeringAngle !== undefined 
            ? config.steeringAngle 
            : PHYSICS_CONFIG.MAX_STEER_ANGLE;
        
        /** @type {number} Friction coefficient for velocity damping */
        this.frictionCoefficient = config.frictionCoefficient !== undefined 
            ? config.frictionCoefficient 
            : PHYSICS_CONFIG.FRICTION;
        
        /** @type {number} Coefficient of restitution (bounciness) 0-1 */
        this.restitution = config.restitution !== undefined 
            ? config.restitution 
            : PHYSICS_CONFIG.RESTITUTION;
        
        // Input state flags
        /** @type {boolean} True if accelerate input is active */
        this._accelerate = false;
        
        /** @type {boolean} True if brake input is active */
        this._brake = false;
        
        /** @type {boolean} True if steer left input is active */
        this._steerLeft = false;
        
        /** @type {boolean} True if steer right input is active */
        this._steerRight = false;
    }

    /**
     * Sets the control input flags for the car.
     * These flags are read during physics updates to determine behavior.
     * 
     * @param {boolean} accelerate - Set true to apply forward acceleration
     * @param {boolean} brake - Set true to apply braking force
     * @param {boolean} steerLeft - Set true to turn left
     * @param {boolean} steerRight - Set true to turn right
     */
    setControls(accelerate, brake, steerLeft, steerRight) {
        this._accelerate = !!accelerate;
        this._brake = !!brake;
        this._steerLeft = !!steerLeft;
        this._steerRight = !!steerRight;
    }

    /**
     * Updates the car's physics state for a given time step.
     * Applies acceleration, braking, steering, and friction based on current controls.
     * 
     * @param {number} deltaTime - Time elapsed since last update in seconds
     */
    update(deltaTime) {
        // Calculate forward direction vector based on car angle
        const forward = new Vector2(Math.cos(this.angle), Math.sin(this.angle));
        
        // Calculate right (perpendicular) direction for lateral velocity
        const right = forward.perpendicular();
        
        // Apply acceleration or braking to forward speed
        let speedChange = 0;
        
        if (this._accelerate) {
            speedChange += this.accelerationForce * deltaTime;
        }
        
        if (this._brake) {
            speedChange -= this.brakingForce * deltaTime;
        }
        
        // Get current forward velocity component using dot product
        const currentForwardSpeed = this.velocity.dot(forward);
        
        // Update forward velocity with acceleration/braking
        let newForwardSpeed = currentForwardSpeed + speedChange;
        
        // Clamp to max speed (forward only, allow negative for reverse)
        if (newForwardSpeed > this.maxSpeed) {
            newForwardSpeed = this.maxSpeed;
        } else if (newForwardSpeed < -this.maxSpeed / 2) {
            newForwardSpeed = -this.maxSpeed / 2; // Allow slower reverse speed
        }
        
        // Get current lateral velocity component (sideways movement)
        const currentLateralSpeed = this.velocity.dot(right);
        
        // Apply lateral friction to reduce sliding
        const newLateralSpeed = currentLateralSpeed * PHYSICS_CONFIG.LATERAL_FRICTION;
        
        // Reconstruct velocity vector from forward and lateral components
        const newForwardVector = forward.multiply(newForwardSpeed);
        const newLateralVector = right.multiply(newLateralSpeed);
        this.velocity = newForwardVector.add(newLateralVector);
        
        // Apply general friction/drag to slow car down when no input
        if (!this._accelerate && !this._brake) {
            // Use exponential decay for more realistic friction
            const frictionFactor = Math.exp(-this.frictionCoefficient * deltaTime);
            this.velocity = this.velocity.multiply(frictionFactor);
        }
        
        // Update steering (only effective when moving)
        this._updateSteering(deltaTime, forward);
        
        // Update position using Euler integration: position += velocity * dt
        this.position = this.position.add(this.velocity.multiply(deltaTime));
    }

    /**
     * Updates the car's angle based on steering input.
     * Steering effectiveness scales with speed for realistic handling.
     * 
     * @param {number} deltaTime - Time elapsed since last update in seconds
     * @param {Vector2} forward - Current forward direction vector
     */
    _updateSteering(deltaTime, forward) {
        // Determine steering direction from input flags
        let steerDirection = 0;
        
        if (this._steerLeft) {
            steerDirection = -1;
        } else if (this._steerRight) {
            steerDirection = 1;
        }
        
        // Calculate current speed magnitude
        const speed = this.velocity.magnitude();
        
        // Only allow steering when moving above minimum threshold
        if (speed > PHYSICS_CONFIG.MIN_STEER_SPEED) {
            // Steering effectiveness scales with speed (more effective at higher speeds)
            const steerEffectiveness = Math.min(speed / 200, 1);
            
            // Calculate angle change based on input and steering parameters
            const targetAngleChange = steerDirection * this.steeringAngle;
            const actualAngleChange = targetAngleChange * steerEffectiveness * PHYSICS_CONFIG.STEER_SPEED * deltaTime;
            
            // Update car angle
            this.angle += actualAngleChange;
        }
        
        // Normalize angle to [0, 2π) range for consistency
        while (this.angle < 0) {
            this.angle += Math.PI * 2;
        }
        while (this.angle >= Math.PI * 2) {
            this.angle -= Math.PI * 2;
        }
    }

    /**
     * Returns the axis-aligned bounding box for collision detection.
     * This is a simplified AABB that doesn't account for rotation.
     * For rotated cars, use getOBB() instead.
     * 
     * @returns {{x: number, y: number, width: number, height: number}} The AABB bounds
     */
    getAABB() {
        return {
            x: this.position.x - this.width / 2,
            y: this.position.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }

    /**
     * Returns the oriented bounding box with all four corner positions.
     * This accounts for car rotation and provides accurate collision bounds.
     * 
     * @returns {{center: Vector2, corners: Vector2[], width: number, height: number}} The OBB data
     */
    getOBB() {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        
        // Calculate the four corners relative to center (before rotation)
        const localCorners = [
            new Vector2(-halfWidth, -halfHeight), // Top-left
            new Vector2(halfWidth, -halfHeight),  // Top-right
            new Vector2(halfWidth, halfHeight),   // Bottom-right
            new Vector2(-halfWidth, halfHeight)   // Bottom-left
        ];
        
        // Rotate each corner by car angle and translate to world position
        const corners = localCorners.map(corner => {
            // Apply rotation matrix: x' = x*cos(θ) - y*sin(θ), y' = x*sin(θ) + y*cos(θ)
            const cos = Math.cos(this.angle);
            const sin = Math.sin(this.angle);
            
            const rotatedX = corner.x * cos - corner.y * sin;
            const rotatedY = corner.x * sin + corner.y * cos;
            
            // Translate to world position
            return this.position.add(new Vector2(rotatedX, rotatedY));
        });
        
        return {
            center: this.position.clone(),
            corners: corners,
            width: this.width,
            height: this.height
        };
    }

    /**
     * Resets the car to a specified starting position and angle.
     * Clears velocity and angular velocity for a clean restart.
     * 
     * @param {Vector2|number} position - Starting position as Vector2 or x coordinate
     * @param {number} [y] - Y coordinate if position is not a Vector2
     * @param {number} angle - Starting orientation in radians
     */
    reset(position, angle) {
        if (position instanceof Vector2) {
            this.position = position.clone();
        } else {
            this.position = new Vector2(position, y);
        }
        
        this.velocity = new Vector2(0, 0);
        this.acceleration = new Vector2(0, 0);
        this.angle = angle || 0;
        this.angularVelocity = 0;
        
        // Reset controls
        this._accelerate = false;
        this._brake = false;
        this._steerLeft = false;
        this._steerRight = false;
    }

    /**
     * Returns a string representation of the car for debugging.
     * Format: "Car(x, y, angle=θ°, speed=S)"
     * 
     * @returns {string} String representation of the car state
     */
    toString() {
        const degrees = (this.angle * 180 / Math.PI).toFixed(1);
        const speed = this.velocity.magnitude().toFixed(1);
        return `Car(${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)}, angle=${degrees}°, speed=${speed})`;
    }
}

export default Car;
