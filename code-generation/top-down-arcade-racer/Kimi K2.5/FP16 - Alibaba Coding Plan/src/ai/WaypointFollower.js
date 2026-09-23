import { Vector2D } from '../core/Vector2D.js';

/**
 * WaypointFollower - Path following logic for AI
 */
export class WaypointFollower {
    /**
     * Create a new waypoint follower
     * @param {Car} car - Car to control
     * @param {Track} track - Track to follow
     */
    constructor(car, track) {
        this.car = car;
        this.track = track;
        this.currentWaypointIndex = 0;
        this.waypointThreshold = 0.5; // Multiplier of waypoint width
    }

    /**
     * Calculate steering input to follow waypoints
     * @returns {number} Steering input [-1, 1]
     */
    calculateSteering() {
        const targetWaypoint = this.track.getWaypoint(this.currentWaypointIndex);
        if (!targetWaypoint) return 0;

        const toWaypoint = targetWaypoint.position.sub(this.car.position);
        const desiredAngle = Math.atan2(toWaypoint.y, toWaypoint.x);
        
        // Calculate angle difference
        let angleDiff = desiredAngle - this.car.rotation;
        
        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Steering proportional to angle difference
        // Scale so PI radians = full steering
        let steering = angleDiff / Math.PI;
        
        // Clamp to valid range
        return Math.max(-1, Math.min(1, steering));
    }

    /**
     * Calculate throttle/brake input based on waypoint distance and turn sharpness
     * @param {number} brakingDistance - Distance to start braking
     * @param {number} maxSpeedMultiplier - Speed limit multiplier
     * @returns {Object} Throttle and brake values
     */
    calculateThrottle(brakingDistance = 40, maxSpeedMultiplier = 1.0) {
        const targetWaypoint = this.track.getWaypoint(this.currentWaypointIndex);
        if (!targetWaypoint) return { throttle: 0, brake: 0 };

        const toWaypoint = targetWaypoint.position.sub(this.car.position);
        const distanceToWaypoint = toWaypoint.magnitude();

        // Calculate turn sharpness by looking at next waypoint
        const nextIndex = (this.currentWaypointIndex + 1) % this.track.getTotalWaypoints();
        const nextWaypoint = this.track.getWaypoint(nextIndex);
        const turnSharpness = this.calculateTurnSharpness(targetWaypoint, nextWaypoint);

        // Target speed based on turn sharpness
        const maxSpeed = this.car.config.maxSpeed * maxSpeedMultiplier;
        const targetSpeed = maxSpeed * (1 - turnSharpness * 0.5);

        // Current forward speed
        const currentSpeed = Math.abs(this.car.speed);

        // Calculate speed difference
        const speedDiff = targetSpeed - currentSpeed;

        // Throttle/brake based on speed difference
        let throttle = 0;
        let brake = 0;

        if (speedDiff > 0) {
            // Need to speed up
            throttle = Math.min(speedDiff / 50, 1);
        } else {
            // Need to slow down
            // Brake more if close to waypoint and going too fast
            const distanceFactor = Math.max(0, 1 - distanceToWaypoint / brakingDistance);
            brake = Math.min(Math.abs(speedDiff) / 50 * (1 + distanceFactor), 1);
        }

        return { throttle, brake };
    }

    /**
     * Calculate how sharp the turn is between two waypoints
     * @param {Waypoint} current - Current waypoint
     * @param {Waypoint} next - Next waypoint
     * @returns {number} Turn sharpness [0, 1]
     */
    calculateTurnSharpness(current, next) {
        if (!current || !next) return 0;

        // Get direction to current waypoint
        const toCurrent = current.position.sub(this.car.position);
        const currentDir = toCurrent.normalize();

        // Get direction from current to next
        const toNext = next.position.sub(current.position);
        const nextDir = toNext.normalize();

        // Calculate angle between directions
        const dot = currentDir.dot(nextDir);
        
        // Sharpness: 0 = straight, 1 = 180 degree turn
        // dot = 1 means same direction (straight), dot = -1 means opposite
        const sharpness = (1 - dot) / 2;

        return sharpness;
    }

    /**
     * Check if car has reached current waypoint and advance if so
     * @param {number} threshold - Distance threshold multiplier
     * @returns {boolean} True if waypoint was advanced
     */
    checkWaypointProgress(threshold = 0.5) {
        const targetWaypoint = this.track.getWaypoint(this.currentWaypointIndex);
        if (!targetWaypoint) return false;

        const distance = this.car.position.distance(targetWaypoint.position);
        const thresholdDistance = targetWaypoint.width * threshold;

        if (distance < thresholdDistance) {
            // Advance to next waypoint
            this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.track.getTotalWaypoints();
            
            // Update car's race state
            this.car.raceState.currentWaypoint = this.currentWaypointIndex;
            
            return true;
        }

        // Update distance to next waypoint
        this.car.raceState.distanceToNextWaypoint = distance;

        return false;
    }

    /**
     * Get current target waypoint
     * @returns {Waypoint|null} Target waypoint
     */
    getTargetWaypoint() {
        return this.track.getWaypoint(this.currentWaypointIndex);
    }

    /**
     * Get current waypoint index
     * @returns {number} Current waypoint index
     */
    getCurrentWaypointIndex() {
        return this.currentWaypointIndex;
    }

    /**
     * Set waypoint index directly
     * @param {number} index - New waypoint index
     */
    setWaypointIndex(index) {
        this.currentWaypointIndex = index % this.track.getTotalWaypoints();
        this.car.raceState.currentWaypoint = this.currentWaypointIndex;
    }

    /**
     * Advance to next waypoint
     */
    advanceWaypoint() {
        this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.track.getTotalWaypoints();
        this.car.raceState.currentWaypoint = this.currentWaypointIndex;
    }

    /**
     * Find nearest waypoint ahead of car
     * @returns {number} Index of nearest waypoint
     */
    findNearestWaypoint() {
        let nearestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < this.track.getTotalWaypoints(); i++) {
            const waypoint = this.track.getWaypoint(i);
            const dist = this.car.position.distanceSquared(waypoint.position);
            
            if (dist < minDistance) {
                minDistance = dist;
                nearestIndex = i;
            }
        }

        return nearestIndex;
    }

    /**
     * Reset to starting waypoint
     */
    reset() {
        this.currentWaypointIndex = 0;
        this.car.raceState.currentWaypoint = 0;
    }

    /**
     * Calculate distance to target waypoint
     * @returns {number} Distance
     */
    getDistanceToTarget() {
        const target = this.getTargetWaypoint();
        if (!target) return Infinity;
        return this.car.position.distance(target.position);
    }
}
