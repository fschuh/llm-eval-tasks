import { Vector2 } from '../utils/Vector2.js';

export class AIController {
    constructor(difficulty = 'MEDIUM') {
        this.difficulty = difficulty;
        this.targetWaypoint = null;
        this.lookAheadDistance = this.getLookAheadDistance();
        this.stuckTimer = 0;
        this.lastPosition = null;
        this.positionStagnationThreshold = 2; // pixels
        this.stuckTimeThreshold = 2; // seconds
        this.avoidanceRadius = 60; // pixels for car avoidance
        this.waypointHistory = [];
        
        // Difficulty-specific parameters
        this.errorTolerance = this.getErrorTolerance();
        this.reactionSpeed = this.getReactionSpeed();
        this.maxSpeedFactor = this.getMaxSpeedFactor();
        this.brakingAggression = this.getBrakingAggression();
    }
    
    getLookAheadDistance() {
        switch (this.difficulty) {
            case 'EASY': return 100;
            case 'MEDIUM': return 150;
            case 'HARD': return 200;
            default: return 150;
        }
    }
    
    getErrorTolerance() {
        switch (this.difficulty) {
            case 'EASY': return 0.3; // More steering error
            case 'MEDIUM': return 0.15;
            case 'HARD': return 0.05; // Very precise
            default: return 0.15;
        }
    }
    
    getReactionSpeed() {
        switch (this.difficulty) {
            case 'EASY': return 0.7; // Slower reactions
            case 'MEDIUM': return 0.9;
            case 'HARD': return 1.0; // Instant reactions
            default: return 0.9;
        }
    }
    
    getMaxSpeedFactor() {
        switch (this.difficulty) {
            case 'EASY': return 0.8; // Slower top speed
            case 'MEDIUM': return 0.95;
            case 'HARD': return 1.0; // Full speed
            default: return 0.95;
        }
    }
    
    getBrakingAggression() {
        switch (this.difficulty) {
            case 'EASY': return 0.6; // Gentle braking
            case 'MEDIUM': return 0.8;
            case 'HARD': return 1.0; // Aggressive braking
            default: return 0.8;
        }
    }
    
    computeInput(car, track, otherCars, rng, dt) {
        // Update stuck detection
        this.updateStuckDetection(car, dt);
        
        // Handle stuck situation
        if (this.isStuck()) {
            return this.handleStuckSituation(rng);
        }
        
        // Get target waypoint
        const target = this.getTargetWaypoint(car, track, rng);
        
        // Calculate steering input
        const steering = this.calculateSteering(car, target, rng);
        
        // Calculate throttle/brake input
        const throttle = this.calculateThrottle(car, target, track, otherCars, rng);
        
        return {
            throttle: throttle,
            steering: steering
        };
    }
    
    updateStuckDetection(car, dt) {
        if (!this.lastPosition) {
            this.lastPosition = car.position.clone();
            return;
        }
        
        const distanceMoved = Vector2.distance(this.lastPosition, car.position);
        if (distanceMoved < this.positionStagnationThreshold) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
            this.lastPosition = car.position.clone();
        }
    }
    
    isStuck() {
        return this.stuckTimer > this.stuckTimeThreshold;
    }
    
    handleStuckSituation(rng) {
        // Random recovery behavior
        const recoverySteering = (rng.next() - 0.5) * 2; // -1 to 1
        const recoveryThrottle = rng.next() > 0.5 ? 1 : -0.5; // Forward or reverse
        
        return {
            throttle: recoveryThrottle,
            steering: recoverySteering
        };
    }
    
    getTargetWaypoint(car, track, rng) {
        // Get waypoints ahead
        const waypoints = track.getWaypointsAhead(car.position, 2, this.lookAheadDistance / 2);
        
        // Use the furthest waypoint as primary target
        let target = waypoints[waypoints.length - 1];
        
        // Add some randomness based on difficulty
        const errorAmount = this.errorTolerance * 50; // pixels of error
        const randomOffset = new Vector2(
            (rng.next() - 0.5) * errorAmount,
            (rng.next() - 0.5) * errorAmount
        );
        target = target.add(randomOffset);
        
        return target;
    }
    
    calculateSteering(car, target, rng) {
        // Calculate direction to target
        const toTarget = target.subtract(car.position);
        const targetAngle = Math.atan2(toTarget.y, toTarget.x);
        
        // Car's current forward direction
        const forward = car.getForwardVector();
        const carAngle = Math.atan2(forward.y, forward.x);
        
        // Calculate angle difference
        let angleDiff = targetAngle - carAngle;
        
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Convert to steering input (-1 to 1)
        // The turn rate determines how much steering is needed
        const maxTurnAngle = car.turnRate * (1/60); // Max turn per frame at full speed
        let steering = angleDiff / maxTurnAngle;
        
        // Clamp steering to valid range
        steering = Math.max(-1, Math.min(1, steering));
        
        // Apply reaction speed (slower response for easier difficulties)
        steering *= this.reactionSpeed;
        
        // Add small random variation for natural feel
        const randomVariation = (rng.next() - 0.5) * 0.2 * this.errorTolerance;
        steering += randomVariation;
        
        return Math.max(-1, Math.min(1, steering));
    }
    
    calculateThrottle(car, target, track, otherCars, rng) {
        // Check for obstacles ahead
        const obstacleAhead = this.checkObstacleAhead(car, otherCars);
        
        if (obstacleAhead) {
            // Slow down for obstacle
            return -0.3; // Light braking
        }
        
        // Calculate upcoming turn sharpness
        const turnSharpness = this.calculateTurnSharpness(car, track);
        
        // Adjust speed based on turn sharpness
        if (turnSharpness > 0.7) {
            // Sharp turn - brake aggressively
            return -this.brakingAggression;
        } else if (turnSharpness > 0.4) {
            // Moderate turn - gentle braking or coasting
            return -0.2 * this.brakingAggression;
        } else {
            // Straight or gentle curve - accelerate
            return this.maxSpeedFactor;
        }
    }
    
    checkObstacleAhead(car, otherCars) {
        const carForward = car.getForwardVector();
        const detectionPoint = car.position.add(carForward.multiply(80)); // 80px ahead
        
        for (const otherCar of otherCars) {
            if (otherCar.id === car.id) continue;
            
            const distanceToOther = Vector2.distance(detectionPoint, otherCar.position);
            if (distanceToOther < this.avoidanceRadius) {
                // Check if other car is in front (not behind)
                const toOther = otherCar.position.subtract(car.position);
                const dotProduct = toOther.dot(carForward);
                if (dotProduct > 0) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    calculateTurnSharpness(car, track) {
        // Look ahead to see how much the track curves
        const currentWaypoint = track.getNearestWaypoint(car.position);
        const nextWaypoint = (currentWaypoint + 3) % track.centerPath.length;
        const futureWaypoint = (currentWaypoint + 6) % track.centerPath.length;
        
        if (currentWaypoint === nextWaypoint || nextWaypoint === futureWaypoint) {
            return 0;
        }
        
        const currentPoint = track.centerPath[currentWaypoint];
        const nextPoint = track.centerPath[nextWaypoint];
        const futurePoint = track.centerPath[futureWaypoint];
        
        // Calculate angles between segments
        const segment1 = nextPoint.subtract(currentPoint);
        const segment2 = futurePoint.subtract(nextPoint);
        
        const angle1 = Math.atan2(segment1.y, segment1.x);
        const angle2 = Math.atan2(segment2.y, segment2.x);
        
        let angleDiff = Math.abs(angle2 - angle1);
        if (angleDiff > Math.PI) {
            angleDiff = 2 * Math.PI - angleDiff;
        }
        
        // Normalize to 0-1 scale (0 = straight, 1 = sharp turn)
        return Math.min(angleDiff / (Math.PI / 2), 1);
    }
}