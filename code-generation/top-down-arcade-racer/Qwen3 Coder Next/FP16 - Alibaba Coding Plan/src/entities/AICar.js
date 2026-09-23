import { Car } from './Car.js';
import { Vector2 } from '../math/Vector2.js';
import { RNG } from '../math/RNG.js';

/**
 * AI-controlled car with waypoint following
 * Extends the base Car class with autonomous navigation capabilities
 */
export class AICar extends Car {
    /**
     * @param {Vector2} position - Initial position
     * @param {number} heading - Initial heading in radians
     * @param {Vector2[]} waypoints - Array of waypoints for the AI to follow
     * @param {Object} options - AI behavior options
     */
    constructor(position = new Vector2(), heading = 0, waypoints = [], options = {}) {
        super(position, heading);
        
        // Waypoint navigation
        this.waypoints = waypoints;
        this.currentWaypointIndex = 0;
        
        // AI behavior parameters
        this.aggression = options.aggression ?? 0.7; // 0 to 1, higher is more aggressive
        this.steeringGain = options.steeringGain ?? 2.5;
        this.speedGain = options.speedGain ?? 0.5;
        this.brakingDistance = options.brakingDistance ?? 100;
        this.waypointProximity = options.waypointProximity ?? 30;
        
        // Randomness for varied driving styles
        this.randomness = new RNG(options.seed ?? Math.floor(Math.random() * 10000));
        this.drivingStyle = {
            aggression: this.aggression + (this.randomness.nextFloat() - 0.5) * 0.2,
            reactionTime: 0.1 + this.randomness.nextFloat() * 0.2,
            maxSteering: 2 + this.randomness.nextFloat() * 1
        };
        
        // Smooth steering with PID-like approach
        this.steeringErrorSum = 0;
        this.lastSteeringError = 0;
        this.steeringDerivative = 0;
        
        // Speed control
        this.speedErrorSum = 0;
        this.lastSpeedError = 0;
        
        // Track awareness
        this.trackCurvature = 0;
        this.lastHeading = heading;
        
        // Lap tracking
        this.lap = 0;
        this.checkpointIndex = 0;
    }
    
    /**
     * Update AI logic
     * @param {number} dt - Time step in seconds
     * @param {Object} input - Input object to populate with AI commands
     */
    update(dt, input = {}) {
        // Find the next waypoint to target
        this.findNextWaypoint();
        
        // Calculate steering input
        const steering = this.calculateSteering();
        
        // Calculate speed input
        const throttle = this.calculateSpeed();
        
        // Apply inputs
        input.steering = steering;
        input.throttle = throttle;
        input.brake = throttle < 0;
        
        // Update last heading for curvature calculation
        this.lastHeading = this.heading;
        
        // Call parent update with AI input
        super.update(dt, input, false);
    }
    
    /**
     * Find the next waypoint to target
     * Advances through waypoints in order, wrapping around for lap completion
     */
    findNextWaypoint() {
        if (this.waypoints.length === 0) return;
        
        const targetWaypoint = this.waypoints[this.currentWaypointIndex];
        const distanceToWaypoint = this.position.distance(targetWaypoint);
        
        // Check if we've reached the current waypoint
        if (distanceToWaypoint < this.waypointProximity) {
            this.onWaypointReached();
        }
        
        // Update track curvature based on heading change
        this.updateTrackCurvature();
    }
    
    /**
     * Handle waypoint completion
     * Advances to next waypoint and handles lap completion
     */
    onWaypointReached() {
        this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
        
        // Check for lap completion (wrapped around to start)
        if (this.currentWaypointIndex === 0) {
            this.lap++;
        }
    }
    
    /**
     * Calculate steering input based on waypoint position
     * Uses PID-like control for smooth steering
     * @returns {number} Steering value (-1 to 1)
     */
    calculateSteering() {
        if (this.waypoints.length === 0) return 0;
        
        const targetWaypoint = this.waypoints[this.currentWaypointIndex];
        
        // Calculate vector to target waypoint
        const toTarget = targetWaypoint.clone().subtract(this.position);
        const distanceToTarget = toTarget.length();
        
        // Calculate desired heading toward waypoint
        const desiredHeading = Math.atan2(toTarget.y, toTarget.x);
        
        // Calculate steering error (difference between current and desired heading)
        let steeringError = desiredHeading - this.heading;
        
        // Normalize steering error to [-PI, PI]
        while (steeringError > Math.PI) steeringError -= Math.PI * 2;
        while (steeringError < -Math.PI) steeringError += Math.PI * 2;
        
        // Adjust steering based on distance to waypoint
        // Tighter turns when closer to waypoint
        const distanceFactor = Math.min(distanceToTarget / 100, 1);
        
        // Calculate curvature of track ahead
        const curvature = this.calculateCurvature(targetWaypoint);
        
        // Reduce steering for sharp turns
        const turnFactor = this.getTurnFactor(curvature);
        
        // PID-like steering control
        const steeringProportional = steeringError * this.steeringGain * this.drivingStyle.maxSteering;
        this.steeringErrorSum += steeringError * 0.01;
        this.steeringDerivative = (steeringError - this.lastSteeringError) / 0.016;
        
        // Apply PID terms
        let steering = 
            steeringProportional * distanceFactor * turnFactor +
            this.steeringErrorSum * 0.1 +
            this.steeringDerivative * 0.05;
        
        // Add randomness for varied driving styles
        const randomSteering = (this.randomness.nextFloat() - 0.5) * 0.1 * (1 - this.drivingStyle.aggression);
        steering += randomSteering;
        
        // Clamp steering to valid range
        steering = Math.max(-1, Math.min(1, steering));
        
        // Update last error for derivative calculation
        this.lastSteeringError = steeringError;
        
        return steering;
    }
    
    /**
     * Calculate speed input based on track conditions
     * @returns {number} Throttle value (-1 to 1)
     */
    calculateSpeed() {
        if (this.waypoints.length === 0) return 1;
        
        const targetWaypoint = this.waypoints[this.currentWaypointIndex];
        const distanceToWaypoint = this.position.distance(targetWaypoint);
        
        // Calculate track curvature
        const curvature = this.calculateCurvature(targetWaypoint);
        
        // Determine target speed based on curvature
        // Higher curvature = lower target speed
        const turnFactor = this.getTurnFactor(curvature);
        const baseSpeed = this.maxSpeed * turnFactor;
        
        // Adjust target speed based on aggression
        // Aggressive drivers take turns faster but still slow down for sharp turns
        const targetSpeed = baseSpeed * (0.8 + 0.2 * this.drivingStyle.aggression);
        
        // Calculate speed error
        const speedError = targetSpeed - this.speed;
        
        // PID-like speed control
        this.speedErrorSum += speedError * 0.01;
        const speedDerivative = (speedError - this.lastSpeedError) / 0.016;
        
        let throttle = 
            speedError * this.speedGain * 0.1 +
            this.speedErrorSum * 0.01 +
            speedDerivative * 0.05;
        
        // Clamp throttle
        throttle = Math.max(-1, Math.min(1, throttle));
        
        // Update last error
        this.lastSpeedError = speedError;
        
        // Check if we need to brake for upcoming turn
        const lookaheadDistance = 50 + this.speed * 0.2;
        const lookaheadWaypoint = this.getWaypointAtDistance(lookaheadDistance);
        
        if (lookaheadWaypoint) {
            const lookaheadCurvature = this.calculateCurvature(lookaheadWaypoint);
            const lookaheadTurnFactor = this.getTurnFactor(lookaheadCurvature);
            
            // If upcoming turn is sharp, apply braking
            if (lookaheadTurnFactor < 0.7 && distanceToWaypoint < this.brakingDistance) {
                throttle = -0.5 * lookaheadTurnFactor;
            }
        }
        
        return throttle;
    }
    
    /**
     * Calculate track curvature based on multiple waypoints ahead
     * @param {Vector2} targetWaypoint - Current target waypoint
     * @returns {number} Curvature value (0 = straight, higher = sharper turn)
     */
    calculateCurvature(targetWaypoint) {
        if (this.waypoints.length < 3) return 0;
        
        // Look ahead at multiple waypoints
        const numLookahead = 3;
        const totalCurvature = 0;
        
        for (let i = 1; i <= numLookahead; i++) {
            const waypointIndex = (this.currentWaypointIndex + i) % this.waypoints.length;
            const waypoint = this.waypoints[waypointIndex];
            
            // Calculate angle to this waypoint
            const toWaypoint = waypoint.clone().subtract(this.position);
            const angle = Math.atan2(toWaypoint.y, toWaypoint.x);
            
            // Calculate angle difference from current heading
            let angleDiff = angle - this.lastHeading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            totalCurvature += Math.abs(angleDiff);
        }
        
        return totalCurvature / numLookahead;
    }
    
    /**
     * Get waypoint at a given distance ahead
     * @param {number} distance - Distance ahead to look
     * @returns {Vector2|null} Waypoint at distance, or null if not found
     */
    getWaypointAtDistance(distance) {
        let accumulatedDistance = 0;
        
        for (let i = 1; i < this.waypoints.length; i++) {
            const currentWaypoint = this.waypoints[this.currentWaypointIndex];
            const nextWaypointIndex = (this.currentWaypointIndex + i) % this.waypoints.length;
            const nextWaypoint = this.waypoints[nextWaypointIndex];
            
            const segmentDistance = currentWaypoint.distance(nextWaypoint);
            accumulatedDistance += segmentDistance;
            
            if (accumulatedDistance >= distance) {
                return nextWaypoint;
            }
        }
        
        return null;
    }
    
    /**
     * Get turn factor based on curvature
     * @param {number} curvature - Track curvature
     * @returns {number} Turn factor (0 to 1)
     */
    getTurnFactor(curvature) {
        // Higher curvature = lower turn factor
        // Curvature of 0.1 = 1.0 factor (straight)
        // Curvature of 1.0 = 0.5 factor (sharp turn)
        const factor = 1 - Math.min(curvature, 1);
        return 0.5 + 0.5 * factor;
    }
    
    /**
     * Update track curvature based on heading change
     */
    updateTrackCurvature() {
        // Calculate how much heading has changed
        const headingChange = Math.abs(this.heading - this.lastHeading);
        this.trackCurvature = headingChange * 10; // Scale for convenience
    }
    
    /**
     * Set waypoints for the AI to follow
     * @param {Vector2[]} waypoints - Array of waypoints
     */
    setWaypoints(waypoints) {
        this.waypoints = waypoints;
        this.currentWaypointIndex = 0;
    }
    
    /**
     * Reset AI car to default state
     */
    reset() {
        super.reset();
        this.currentWaypointIndex = 0;
        this.lap = 0;
        this.checkpointIndex = 0;
        this.steeringErrorSum = 0;
        this.lastSteeringError = 0;
        this.steeringDerivative = 0;
        this.speedErrorSum = 0;
        this.lastSpeedError = 0;
    }
    
    /**
     * Clone the AI car with same properties
     * @returns {AICar} Cloned AI car
     */
    clone() {
        const clone = new AICar(
            this.position.clone(),
            this.heading,
            this.waypoints.map(p => p.clone()),
            {
                aggression: this.aggression,
                steeringGain: this.steeringGain,
                speedGain: this.speedGain,
                brakingDistance: this.brakingDistance,
                waypointProximity: this.waypointProximity,
                seed: this.randomness.seed
            }
        );
        clone.lap = this.lap;
        clone.checkpointIndex = this.checkpointIndex;
        return clone;
    }
}
