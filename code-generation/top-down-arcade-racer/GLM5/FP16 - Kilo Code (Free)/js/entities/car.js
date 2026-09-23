import { Vector2 } from '../physics/vector2.js';
import { CONFIG } from '../config.js';

/**
 * Base Car Class
 * Handles car physics including acceleration, braking, and steering
 */
export class Car {
    constructor(x, y, angle, color, id = 0) {
        // Position and orientation
        this.position = new Vector2(x, y);
        this.velocity = new Vector2(0, 0);
        this.angle = angle;
        this.angularVelocity = 0;
        
        // Visual properties
        this.color = color;
        this.id = id;
        this.radius = CONFIG.CAR_RADIUS;
        
        // Physics properties
        this.acceleration = CONFIG.CAR_ACCELERATION;
        this.brakeForce = CONFIG.CAR_BRAKE_FORCE;
        this.maxSpeed = CONFIG.CAR_MAX_SPEED;
        this.turnRate = CONFIG.CAR_TURN_RATE;
        this.friction = CONFIG.CAR_FRICTION;
        this.angularFriction = CONFIG.CAR_ANGULAR_FRICTION;
        this.mass = CONFIG.CAR_MASS;
        
        // Race state
        this.currentCheckpoint = 0;
        this.lap = 0;
        this.totalCheckpointsPassed = 0;
        this.finished = false;
        this.finishTime = 0;
        
        // Input state (set by controller)
        this.inputThrottle = 0;
        this.inputBrake = 0;
        this.inputSteer = 0;
        
        // Previous state for interpolation
        this.previousPosition = this.position.clone();
        this.previousAngle = this.angle;
    }
    
    /**
     * Set input values
     */
    setInput(throttle, brake, steer) {
        this.inputThrottle = Math.max(0, Math.min(1, throttle));
        this.inputBrake = Math.max(0, Math.min(1, brake));
        this.inputSteer = Math.max(-1, Math.min(1, steer));
    }
    
    /**
     * Update car physics
     */
    update(dt) {
        // Store previous state for interpolation
        this.previousPosition.copy(this.position);
        this.previousAngle = this.angle;
        
        if (this.finished) return;
        
        // Get current speed
        const speed = this.velocity.length();
        
        // Calculate forward direction
        const forward = Vector2.fromAngle(this.angle);
        
        // Apply steering (only when moving)
        if (speed > 10) {
            // Steering is more effective at higher speeds, but limited
            const steerFactor = Math.min(1, speed / 100);
            const steerAmount = this.inputSteer * this.turnRate * steerFactor * dt;
            
            // Reverse steering when going backwards
            const forwardSpeed = this.velocity.dot(forward);
            if (forwardSpeed < 0) {
                this.angle -= steerAmount;
            } else {
                this.angle += steerAmount;
            }
        }
        
        // Apply acceleration
        if (this.inputThrottle > 0) {
            const accelForce = Vector2.multiply(forward, this.acceleration * this.inputThrottle * dt);
            this.velocity.add(accelForce);
        }
        
        // Apply braking/reverse
        if (this.inputBrake > 0) {
            const forwardSpeed = this.velocity.dot(forward);
            
            if (forwardSpeed > 0) {
                // Braking
                const brakeForce = Math.min(this.brakeForce * dt, forwardSpeed);
                this.velocity.subtract(Vector2.multiply(forward, brakeForce));
            } else {
                // Reverse
                const reverseForce = Vector2.multiply(forward, -CONFIG.CAR_REVERSE_SPEED * this.inputBrake * dt);
                this.velocity.add(reverseForce);
            }
        }
        
        // Apply friction
        this.velocity.multiply(this.friction);
        
        // Limit speed
        const currentSpeed = this.velocity.length();
        if (currentSpeed > this.maxSpeed) {
            this.velocity.normalize().multiply(this.maxSpeed);
        }
        
        // Update position
        this.position.add(Vector2.multiply(this.velocity, dt));
        
        // Apply angular friction
        this.angularVelocity *= this.angularFriction;
    }
    
    /**
     * Apply impulse from collision
     */
    applyImpulse(impulse, contactPoint) {
        this.velocity.add(Vector2.multiply(impulse, 1 / this.mass));
        
        // Apply angular impulse
        const r = Vector2.subtract(contactPoint, this.position);
        this.angularVelocity += r.cross(impulse) * 0.1;
    }
    
    /**
     * Get interpolated position for smooth rendering
     */
    getInterpolatedPosition(alpha) {
        return Vector2.lerp(this.previousPosition, this.position, alpha);
    }
    
    /**
     * Get interpolated angle for smooth rendering
     */
    getInterpolatedAngle(alpha) {
        return this.previousAngle + (this.angle - this.previousAngle) * alpha;
    }
    
    /**
     * Get forward direction vector
     */
    getForward() {
        return Vector2.fromAngle(this.angle);
    }
    
    /**
     * Get current speed
     */
    getSpeed() {
        return this.velocity.length();
    }
    
    /**
     * Get progress value for sorting positions
     */
    getProgress() {
        return this.lap * 1000 + this.totalCheckpointsPassed;
    }
    
    /**
     * Reset car to starting position
     */
    reset(x, y, angle) {
        this.position.set(x, y);
        this.velocity.set(0, 0);
        this.angle = angle;
        this.angularVelocity = 0;
        this.currentCheckpoint = 0;
        this.lap = 0;
        this.totalCheckpointsPassed = 0;
        this.finished = false;
        this.finishTime = 0;
        this.previousPosition.copy(this.position);
        this.previousAngle = this.angle;
    }
    
    /**
     * Render the car
     */
    render(ctx, alpha = 1) {
        const pos = this.getInterpolatedPosition(alpha);
        const angle = this.getInterpolatedAngle(alpha);
        
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        
        // Car body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        
        // Draw car as a rounded rectangle
        const length = this.radius * 2;
        const width = this.radius * 1.2;
        
        ctx.roundRect(-length / 2, -width / 2, length, width, 4);
        ctx.fill();
        
        // Car outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Front indicator
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(length / 2 - 6, -width / 4, 4, width / 2);
        
        // Rear indicators
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(-length / 2 + 2, -width / 4, 3, width / 2);
        
        ctx.restore();
        
        // Draw ID label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.id.toString(), pos.x, pos.y + 4);
    }
}
