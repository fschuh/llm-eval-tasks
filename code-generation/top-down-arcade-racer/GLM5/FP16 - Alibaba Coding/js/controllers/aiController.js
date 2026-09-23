import { Vector2D } from '../utils/vector2d.js';

/**
 * AI Controller - Waypoint following AI for opponent cars
 */
export class AIController {
    /**
     * @param {Car} car - The car to control
     * @param {Track} track - The track to navigate
     * @param {SeededRNG} rng - Seeded RNG for deterministic behavior
     */
    constructor(car, track, rng) {
        this.car = car;
        this.track = track;
        this.rng = rng;
        
        // Waypoint state
        this.currentWaypointIndex = 0;
        this.targetWaypoint = track.waypoints[0].clone();
        
        // AI behavior parameters
        this.lookAheadDistance = 50;
        this.steeringSmoothing = 0.15;
        this.targetSteering = 0;
        this.targetThrottle = 1;
        
        // Speed control
        this.maxTurnSpeed = 150;  // Slow down for sharp turns
        this.turnDeceleration = 200;
        
        // Reaction time (adds slight delay for more natural behavior)
        this.reactionDelay = 0.05 + rng.nextFloat(0, 0.05);
        this.reactionTimer = 0;
    }

    /**
     * Update AI behavior
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Update reaction timer
        this.reactionTimer += dt;
        if (this.reactionTimer < this.reactionDelay) {
            // Apply current inputs
            this.car.setInput(this.targetThrottle, 0, this.targetSteering);
            return;
        }
        this.reactionTimer = 0;
        
        // Find the best waypoint to target
        this.updateTargetWaypoint();
        
        // Calculate steering
        this.calculateSteering();
        
        // Calculate throttle/braking
        this.calculateThrottle();
        
        // Apply inputs
        this.car.setInput(this.targetThrottle, 0, this.targetSteering);
    }

    /**
     * Update the target waypoint based on current position
     */
    updateTargetWaypoint() {
        const pos = this.car.position;
        const currentWp = this.track.waypoints[this.currentWaypointIndex];
        
        // Check if we've reached the current waypoint
        const distToWp = pos.distanceTo(currentWp);
        
        if (distToWp < this.lookAheadDistance) {
            // Move to next waypoint
            this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.track.waypoints.length;
            this.targetWaypoint = this.track.waypoints[this.currentWaypointIndex].clone();
        } else {
            this.targetWaypoint = currentWp.clone();
        }
        
        // Look ahead to next waypoint for smoother turning
        const nextIndex = (this.currentWaypointIndex + 1) % this.track.waypoints.length;
        const nextWp = this.track.waypoints[nextIndex];
        
        // Interpolate between current and next waypoint based on distance
        const t = 1 - (distToWp / this.lookAheadDistance);
        if (t > 0) {
            this.targetWaypoint.lerp(nextWp, t * 0.5);
        }
    }

    /**
     * Calculate steering towards target waypoint
     */
    calculateSteering() {
        // Vector to target
        const toTarget = Vector2D.sub(this.targetWaypoint, this.car.position);
        const targetAngle = toTarget.angle();
        
        // Current car angle
        const carAngle = this.car.angle;
        
        // Calculate angle difference
        let angleDiff = targetAngle - carAngle;
        
        // Normalize angle difference to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Calculate steering amount
        const steeringStrength = Math.min(1, Math.abs(angleDiff) / 0.5);
        let steering = angleDiff > 0 ? steeringStrength : -steeringStrength;
        
        // Smooth steering
        this.targetSteering = this.targetSteering + 
            (steering - this.targetSteering) * this.steeringSmoothing;
        
        // Clamp steering
        this.targetSteering = Math.max(-1, Math.min(1, this.targetSteering));
    }

    /**
     * Calculate throttle based on upcoming turns
     */
    calculateThrottle() {
        const speed = this.car.getSpeed();
        
        // Check angle to next few waypoints
        const nextIndex = (this.currentWaypointIndex + 1) % this.track.waypoints.length;
        const nextWp = this.track.waypoints[nextIndex];
        
        // Calculate turn sharpness
        const toCurrent = Vector2D.sub(this.track.waypoints[this.currentWaypointIndex], this.car.position);
        const toNext = Vector2D.sub(nextWp, this.track.waypoints[this.currentWaypointIndex]);
        
        const angle1 = toCurrent.angle();
        const angle2 = toNext.angle();
        
        let turnAngle = Math.abs(angle2 - angle1);
        while (turnAngle > Math.PI) turnAngle -= Math.PI * 2;
        turnAngle = Math.abs(turnAngle);
        
        // Slow down for sharp turns
        if (turnAngle > 0.5 && speed > this.maxTurnSpeed) {
            this.targetThrottle = 0.3;
        } else if (turnAngle > 0.3 && speed > this.maxTurnSpeed * 1.2) {
            this.targetThrottle = 0.5;
        } else {
            this.targetThrottle = 1;
        }
        
        // If off track, slow down
        if (!this.track.isOnTrack(this.car.position)) {
            this.targetThrottle = 0.5;
        }
    }

    /**
     * Reset AI state
     */
    reset() {
        this.currentWaypointIndex = 0;
        this.targetWaypoint = this.track.waypoints[0].clone();
        this.targetSteering = 0;
        this.targetThrottle = 1;
        this.reactionTimer = 0;
    }
}