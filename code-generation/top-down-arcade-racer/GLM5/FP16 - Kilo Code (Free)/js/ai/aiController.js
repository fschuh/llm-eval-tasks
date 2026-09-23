import { Vector2 } from '../physics/vector2.js';
import { CONFIG } from '../config.js';

/**
 * AI Controller
 * Controls AI cars using A* pathfinding and steering behaviors
 */
export class AIController {
    constructor(car, track, astar, rng) {
        this.car = car;
        this.track = track;
        this.astar = astar;
        this.rng = rng;
        
        // Path following
        this.currentPath = [];
        this.currentWaypointIndex = 0;
        this.pathUpdateTimer = 0;
        this.pathUpdateInterval = CONFIG.AI_UPDATE_INTERVAL;
        
        // Lookahead distance for steering
        this.lookaheadDistance = CONFIG.AI_LOOKAHEAD_DISTANCE;
        
        // Steering parameters
        this.steeringStrength = CONFIG.AI_STEERING_STRENGTH;
        this.throttleStrength = CONFIG.AI_THROTTLE_STRENGTH;
        
        // Add some personality variation
        this.skillLevel = 0.8 + rng.next() * 0.2; // 0.8 - 1.0
        this.reactionTime = 0.05 + rng.next() * 0.1;
        this.aggressiveness = 0.7 + rng.next() * 0.3;
        
        // Target position
        this.targetPosition = new Vector2();
        
        // Stuck detection
        this.stuckTimer = 0;
        this.lastPosition = car.position.clone();
        this.stuckThreshold = 2; // seconds
    }
    
    /**
     * Update AI decision making
     */
    update(dt) {
        if (this.car.finished) return;
        
        // Update path periodically
        this.pathUpdateTimer += dt;
        if (this.pathUpdateTimer >= this.pathUpdateInterval) {
            this.pathUpdateTimer = 0;
            this.updatePath();
        }
        
        // Check if stuck
        this.checkStuck(dt);
        
        // Follow path
        this.followPath(dt);
    }
    
    /**
     * Update the path to the next checkpoint
     */
    updatePath() {
        // Get target checkpoint
        const targetCheckpoint = this.getNextTargetCheckpoint();
        
        if (targetCheckpoint) {
            // Find path to checkpoint
            const path = this.astar.findPath(
                this.car.position.x,
                this.car.position.y,
                targetCheckpoint.position.x,
                targetCheckpoint.position.y
            );
            
            if (path && path.length > 0) {
                this.currentPath = path;
                this.currentWaypointIndex = 0;
            }
        }
    }
    
    /**
     * Get the next target checkpoint
     */
    getNextTargetCheckpoint() {
        const checkpoints = this.track.checkpoints;
        const nextIndex = (this.car.currentCheckpoint + 2) % checkpoints.length;
        return checkpoints[nextIndex];
    }
    
    /**
     * Follow the current path
     */
    followPath(dt) {
        if (this.currentPath.length === 0) {
            // No path, just try to go towards next checkpoint
            const checkpoint = this.track.checkpoints[this.car.currentCheckpoint];
            if (checkpoint) {
                this.steerTowards(checkpoint.position, dt);
            }
            return;
        }
        
        // Find the lookahead point on the path
        const lookaheadPoint = this.getLookaheadPoint();
        
        if (lookaheadPoint) {
            this.targetPosition.copy(lookaheadPoint);
            this.steerTowards(lookaheadPoint, dt);
        }
    }
    
    /**
     * Get the lookahead point on the path
     */
    getLookaheadPoint() {
        if (this.currentPath.length === 0) return null;
        
        // Find the point on the path at lookahead distance
        let accumulatedDistance = 0;
        
        for (let i = this.currentWaypointIndex; i < this.currentPath.length - 1; i++) {
            const current = this.currentPath[i];
            const next = this.currentPath[i + 1];
            const segmentLength = current.distanceTo(next);
            
            if (accumulatedDistance + segmentLength >= this.lookaheadDistance) {
                // Interpolate along this segment
                const remaining = this.lookaheadDistance - accumulatedDistance;
                const t = remaining / segmentLength;
                return Vector2.lerp(current, next, t);
            }
            
            accumulatedDistance += segmentLength;
            
            // Update current waypoint index
            if (this.car.position.distanceTo(next) < 30) {
                this.currentWaypointIndex = i + 1;
            }
        }
        
        // Return the last point if we're near the end
        return this.currentPath[this.currentPath.length - 1];
    }
    
    /**
     * Steer towards a target position
     */
    steerTowards(target, dt) {
        // Calculate direction to target
        const toTarget = Vector2.subtract(target, this.car.position);
        const distance = toTarget.length();
        
        if (distance < 1) return;
        
        toTarget.normalize();
        
        // Get car's forward direction
        const forward = this.car.getForward();
        
        // Calculate angle to target
        const targetAngle = toTarget.angle();
        let angleDiff = targetAngle - this.car.angle;
        
        // Normalize angle difference to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Calculate steering input
        let steer = 0;
        if (Math.abs(angleDiff) > 0.05) {
            steer = Math.sign(angleDiff) * Math.min(1, Math.abs(angleDiff) * this.steeringStrength);
        }
        
        // Calculate throttle based on angle and distance
        let throttle = this.throttleStrength * this.skillLevel;
        
        // Slow down for sharp turns
        const turnSharpness = Math.abs(angleDiff);
        if (turnSharpness > 0.5) {
            throttle *= Math.max(0.3, 1 - turnSharpness * 0.5);
        }
        
        // Slow down when close to target
        if (distance < 50) {
            throttle *= distance / 50;
        }
        
        // Apply inputs
        this.car.setInput(throttle, 0, steer);
    }
    
    /**
     * Check if the car is stuck
     */
    checkStuck(dt) {
        const distanceMoved = this.car.position.distanceTo(this.lastPosition);
        
        if (distanceMoved < 5) {
            this.stuckTimer += dt;
            
            if (this.stuckTimer > this.stuckThreshold) {
                // We're stuck, try to reverse
                this.handleStuck();
                this.stuckTimer = 0;
            }
        } else {
            this.stuckTimer = 0;
        }
        
        this.lastPosition.copy(this.car.position);
    }
    
    /**
     * Handle being stuck
     */
    handleStuck() {
        // Reverse and turn
        this.car.setInput(0, 1, this.rng.nextBool() ? 1 : -1);
        
        // Force path recalculation
        this.currentPath = [];
        this.pathUpdateTimer = this.pathUpdateInterval;
    }
    
    /**
     * Render AI debug info
     */
    render(ctx) {
        if (!window.DEBUG_MODE) return;
        
        // Draw current path
        if (this.currentPath.length > 0) {
            this.astar.renderPath(ctx, this.currentPath, 'rgba(255, 255, 0, 0.5)');
        }
        
        // Draw target position
        ctx.fillStyle = 'lime';
        ctx.beginPath();
        ctx.arc(this.targetPosition.x, this.targetPosition.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}
