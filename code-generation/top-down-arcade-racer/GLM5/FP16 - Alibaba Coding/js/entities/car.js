import { Vector2D } from '../utils/vector2d.js';

/**
 * Car class with physics for acceleration, braking, and steering
 */
export class Car {
    /**
     * @param {number} id - Car identifier
     * @param {string} color - Car color
     * @param {boolean} isPlayer - Whether this is the player's car
     */
    constructor(id, color, isPlayer = false) {
        this.id = id;
        this.color = color;
        this.isPlayer = isPlayer;
        
        // Transform
        this.position = new Vector2D(0, 0);
        this.velocity = new Vector2D(0, 0);
        this.angle = 0; // Radians, 0 = facing right (positive X)
        this.angularVelocity = 0;
        
        // Dimensions
        this.width = 20;
        this.height = 35;
        
        // Physics constants
        this.mass = 1.0;
        this.friction = 0.98;
        this.angularFriction = 0.95;
        this.acceleration = 400;
        this.brakingForce = 300;
        this.reverseForce = 150;
        this.maxSpeed = 300;
        this.maxReverseSpeed = 100;
        this.turnRate = 3.5;
        this.minSpeedForSteering = 10;
        this.driftFactor = 0.92;
        
        // Input state
        this.throttle = 0;
        this.brake = 0;
        this.steering = 0;
        
        // Race state
        this.currentLap = 0;
        this.lastCheckpoint = -1;
        this.finished = false;
        this.finishTime = 0;
        this.position = 0; // Race position (1st, 2nd, etc.)
        
        // Collision state
        this.collisionCooldown = 0;
    }

    /**
     * Get the car's four corners in world coordinates
     * @returns {Array<Vector2D>} Array of corner positions
     */
    getCorners() {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        const hw = this.width / 2;
        const hh = this.height / 2;
        
        // Local corners (front is positive Y in local space)
        const localCorners = [
            new Vector2D(-hw, -hh), // Back left
            new Vector2D(hw, -hh),  // Back right
            new Vector2D(hw, hh),   // Front right
            new Vector2D(-hw, hh)   // Front left
        ];
        
        return localCorners.map(corner => {
            return new Vector2D(
                this.position.x + corner.x * cos - corner.y * sin,
                this.position.y + corner.x * sin + corner.y * cos
            );
        });
    }

    /**
     * Get the car's axis-aligned bounding box
     * @returns {Object} AABB {minX, minY, maxX, maxY}
     */
    getAABB() {
        const corners = this.getCorners();
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const corner of corners) {
            minX = Math.min(minX, corner.x);
            minY = Math.min(minY, corner.y);
            maxX = Math.max(maxX, corner.x);
            maxY = Math.max(maxY, corner.y);
        }
        
        return { minX, minY, maxX, maxY };
    }

    /**
     * Get the car's forward direction vector
     * @returns {Vector2D} Forward direction
     */
    getForward() {
        return Vector2D.fromAngle(this.angle);
    }

    /**
     * Get the car's right direction vector
     * @returns {Vector2D} Right direction
     */
    getRight() {
        return Vector2D.fromAngle(this.angle + Math.PI / 2);
    }

    /**
     * Get current speed (velocity magnitude)
     * @returns {number} Speed in units/second
     */
    getSpeed() {
        return this.velocity.length();
    }

    /**
     * Get forward speed (positive = forward, negative = reverse)
     * @returns {number} Forward speed
     */
    getForwardSpeed() {
        const forward = this.getForward();
        return this.velocity.dot(forward);
    }

    /**
     * Set input values
     * @param {number} throttle - Throttle input (0-1)
     * @param {number} brake - Brake input (0-1)
     * @param {number} steering - Steering input (-1 to 1)
     */
    setInput(throttle, brake, steering) {
        this.throttle = Math.max(0, Math.min(1, throttle));
        this.brake = Math.max(0, Math.min(1, brake));
        this.steering = Math.max(-1, Math.min(1, steering));
    }

    /**
     * Update car physics
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Apply acceleration in facing direction
        const forward = this.getForward();
        const forwardSpeed = this.getForwardSpeed();
        
        // Calculate acceleration
        if (this.throttle > 0) {
            // Forward acceleration
            const accelForce = this.acceleration * this.throttle;
            this.velocity.add(Vector2D.mul(forward, accelForce * dt));
        }
        
        // Braking / Reverse
        if (this.brake > 0) {
            if (forwardSpeed > this.minSpeedForSteering) {
                // Braking - apply force opposite to velocity
                const brakeForce = this.brakingForce * this.brake;
                const brakingDecel = Vector2D.mul(forward, -brakeForce * dt);
                this.velocity.add(brakingDecel);
            } else {
                // Reverse
                const reverseForce = this.reverseForce * this.brake;
                this.velocity.add(Vector2D.mul(forward, -reverseForce * dt));
            }
        }
        
        // Steering (only when moving)
        const speed = this.getSpeed();
        if (speed > this.minSpeedForSteering) {
            // Steering is more effective at lower speeds
            const speedFactor = Math.min(1, 150 / speed);
            const turnAmount = this.steering * this.turnRate * speedFactor * dt;
            
            // Determine steering direction based on forward/reverse
            const steerDirection = forwardSpeed >= 0 ? 1 : -1;
            this.angle += turnAmount * steerDirection;
        }
        
        // Apply drift/lateral friction
        const right = this.getRight();
        const lateralSpeed = this.velocity.dot(right);
        const lateralFriction = lateralSpeed * (1 - this.driftFactor);
        this.velocity.sub(Vector2D.mul(right, lateralFriction));
        
        // Apply general friction
        this.velocity.mul(this.friction);
        
        // Clamp velocity
        const currentSpeed = this.getSpeed();
        if (currentSpeed > this.maxSpeed) {
            this.velocity.mul(this.maxSpeed / currentSpeed);
        } else if (currentSpeed > this.maxReverseSpeed && this.getForwardSpeed() < 0) {
            // Clamp reverse speed
            this.velocity.mul(this.maxReverseSpeed / currentSpeed);
        }
        
        // Update position
        this.position.add(Vector2D.mul(this.velocity, dt));
        
        // Update collision cooldown
        if (this.collisionCooldown > 0) {
            this.collisionCooldown -= dt;
        }
    }

    /**
     * Apply an impulse to the car
     * @param {Vector2D} impulse - Impulse vector
     */
    applyImpulse(impulse) {
        this.velocity.add(Vector2D.div(impulse, this.mass));
    }

    /**
     * Reset car to starting state
     * @param {Vector2D} position - Starting position
     * @param {number} angle - Starting angle
     */
    reset(position, angle) {
        this.position.copy(position);
        this.angle = angle;
        this.velocity.set(0, 0);
        this.angularVelocity = 0;
        this.throttle = 0;
        this.brake = 0;
        this.steering = 0;
        this.currentLap = 0;
        this.lastCheckpoint = -1;
        this.finished = false;
        this.finishTime = 0;
        this.collisionCooldown = 0;
    }

    /**
     * Render the car
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);
        
        // Car body
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        
        // Rounded rectangle body
        this.roundRect(ctx, -this.width / 2, -this.height / 2, 
                       this.width, this.height, 4);
        ctx.fill();
        ctx.stroke();
        
        // Front indicator (windshield)
        ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
        this.roundRect(ctx, -this.width / 2 + 3, this.height / 2 - 12, 
                       this.width - 6, 8, 2);
        ctx.fill();
        
        // Rear spoiler
        ctx.fillStyle = '#333333';
        ctx.fillRect(-this.width / 2 + 2, -this.height / 2 + 2, 
                     this.width - 4, 4);
        
        // Side racing stripes
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(-this.width / 2 + 2, -this.height / 2 + 8, 3, this.height - 16);
        ctx.fillRect(this.width / 2 - 5, -this.height / 2 + 8, 3, this.height - 16);
        
        // Number on car
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.id.toString(), 0, 0);
        
        // Player indicator
        if (this.isPlayer) {
            ctx.fillStyle = '#ffdd00';
            ctx.beginPath();
            ctx.arc(0, -this.height / 2 - 8, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    /**
     * Draw rounded rectangle
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} w - Width
     * @param {number} h - Height
     * @param {number} r - Corner radius
     */
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * Create a clone of this car's state
     * @returns {Car} Cloned car
     */
    clone() {
        const clone = new Car(this.id, this.color, this.isPlayer);
        clone.position = this.position.clone();
        clone.velocity = this.velocity.clone();
        clone.angle = this.angle;
        clone.angularVelocity = this.angularVelocity;
        clone.throttle = this.throttle;
        clone.brake = this.brake;
        clone.steering = this.steering;
        clone.currentLap = this.currentLap;
        clone.lastCheckpoint = this.lastCheckpoint;
        clone.finished = this.finished;
        clone.finishTime = this.finishTime;
        clone.collisionCooldown = this.collisionCooldown;
        return clone;
    }
}