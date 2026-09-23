import { WaypointFollower } from './WaypointFollower.js';
import { AI_CONFIG } from '../config/GameConfig.js';
import { GameRNG } from '../core/DeterministicRNG.js';

/**
 * AIController - Controls AI cars using waypoint following
 */
export class AIController {
    /**
     * Create a new AI controller
     * @param {Car} car - Car to control
     * @param {Track} track - Track to race on
     * @param {string} difficulty - Difficulty level ('easy', 'medium', 'hard')
     */
    constructor(car, track, difficulty = 'medium') {
        this.car = car;
        this.track = track;
        this.difficulty = difficulty;
        this.enabled = true;
        
        // Create waypoint follower
        this.follower = new WaypointFollower(car, track);
        
        // Set difficulty config
        this.setDifficulty(difficulty);
        
        // Reaction delay timer
        this.reactionTimer = 0;
        
        // Smoothed steering for more natural movement
        this.smoothedSteering = 0;
        
        // Random variation for steering (makes AI less perfect)
        this.steeringNoise = 0;
        this.noiseTimer = 0;
    }

    /**
     * Set difficulty level
     * @param {string} difficulty - 'easy', 'medium', or 'hard'
     */
    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        this.config = AI_CONFIG[difficulty] || AI_CONFIG.medium;
    }

    /**
     * Enable AI control
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable AI control
     */
    disable() {
        this.enabled = false;
        // Clear inputs when disabled
        this.car.setInput(0, 0, 0);
    }

    /**
     * Update AI control
     * @param {number} dt - Delta time
     */
    update(dt) {
        if (!this.enabled || this.car.raceState.finished) {
            this.car.setInput(0, 0, 0);
            return;
        }

        // Handle reaction delay
        this.reactionTimer -= dt;
        if (this.reactionTimer > 0) {
            return; // Don't update inputs during reaction delay
        }
        this.reactionTimer = this.config.reactionDelay;

        // Check waypoint progress
        this.follower.checkWaypointProgress(this.config.waypointThreshold);

        // Calculate inputs
        const steering = this.calculateSteering(dt);
        const { throttle, brake } = this.calculateThrottle();

        // Apply inputs to car
        this.car.setInput(throttle, brake, steering);
    }

    /**
     * Calculate steering input
     * @param {number} dt - Delta time
     * @returns {number} Steering value [-1, 1]
     */
    calculateSteering(dt) {
        // Get raw steering from waypoint follower
        let steering = this.follower.calculateSteering();

        // Add some randomness for less perfect AI
        this.noiseTimer -= dt;
        if (this.noiseTimer <= 0) {
            this.steeringNoise = GameRNG.range(-0.1, 0.1);
            this.noiseTimer = GameRNG.range(0.2, 0.5); // Change noise every 0.2-0.5s
        }
        steering += this.steeringNoise * (1 - this.config.steeringSmoothing);

        // Smooth steering changes
        const smoothing = this.config.steeringSmoothing;
        this.smoothedSteering = this.smoothedSteering * (1 - smoothing) + steering * smoothing;

        // Clamp to valid range
        return Math.max(-1, Math.min(1, this.smoothedSteering));
    }

    /**
     * Calculate throttle and brake inputs
     * @returns {Object} Throttle and brake values
     */
    calculateThrottle() {
        return this.follower.calculateThrottle(
            this.config.brakingDistance,
            this.config.maxSpeedMultiplier
        );
    }

    /**
     * Simple car avoidance - adjust steering to avoid other cars
     * @param {Car[]} otherCars - Array of other cars
     */
    avoidOtherCars(otherCars) {
        const avoidanceRadius = 60; // Detection radius
        const avoidanceStrength = 0.5;
        
        let avoidanceSteering = 0;
        let hasThreat = false;

        for (const otherCar of otherCars) {
            if (otherCar === this.car) continue;
            if (otherCar.raceState.finished) continue;

            const distance = this.car.position.distance(otherCar.position);
            if (distance > avoidanceRadius) continue;

            // Check if car is ahead
            const toOther = otherCar.position.sub(this.car.position);
            const forward = this.car.heading;
            const dot = toOther.normalize().dot(forward);

            if (dot > 0.3) { // Car is somewhat ahead
                hasThreat = true;
                
                // Determine which side to steer to
                const cross = forward.cross(toOther.normalize());
                avoidanceSteering += (cross > 0 ? -1 : 1) * avoidanceStrength * (1 - distance / avoidanceRadius);
            }
        }

        if (hasThreat) {
            // Blend avoidance with current steering
            const currentSteering = this.car.input.steering;
            this.car.setInput(
                this.car.input.throttle * 0.8, // Slow down
                this.car.input.brake * 0.5 + 0.2, // Brake slightly
                currentSteering + avoidanceSteering
            );
        }
    }

    /**
     * Reset AI to starting state
     */
    reset() {
        this.follower.reset();
        this.reactionTimer = 0;
        this.smoothedSteering = 0;
        this.steeringNoise = 0;
        this.noiseTimer = 0;
    }

    /**
     * Get current target waypoint
     * @returns {Waypoint|null} Target waypoint
     */
    getTargetWaypoint() {
        return this.follower.getTargetWaypoint();
    }

    /**
     * Get current waypoint index
     * @returns {number} Waypoint index
     */
    getCurrentWaypointIndex() {
        return this.follower.getCurrentWaypointIndex();
    }
}

/**
 * AIControllerManager - Manages all AI controllers
 */
export class AIControllerManager {
    constructor() {
        this.controllers = [];
    }

    /**
     * Add an AI controller
     * @param {AIController} controller - Controller to add
     */
    addController(controller) {
        this.controllers.push(controller);
    }

    /**
     * Remove an AI controller
     * @param {AIController} controller - Controller to remove
     */
    removeController(controller) {
        const index = this.controllers.indexOf(controller);
        if (index > -1) {
            this.controllers.splice(index, 1);
        }
    }

    /**
     * Update all AI controllers
     * @param {number} dt - Delta time
     */
    updateAll(dt) {
        for (const controller of this.controllers) {
            controller.update(dt);
        }
    }

    /**
     * Enable all AI
     */
    enableAll() {
        for (const controller of this.controllers) {
            controller.enable();
        }
    }

    /**
     * Disable all AI
     */
    disableAll() {
        for (const controller of this.controllers) {
            controller.disable();
        }
    }

    /**
     * Reset all AI
     */
    resetAll() {
        for (const controller of this.controllers) {
            controller.reset();
        }
    }

    /**
     * Clear all controllers
     */
    clear() {
        this.controllers = [];
    }
}
