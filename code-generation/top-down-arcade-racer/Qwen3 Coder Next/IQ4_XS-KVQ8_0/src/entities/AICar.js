/**
 * AI Car Class
 * 
 * Implements AI-controlled car with waypoint following and look-ahead logic.
 */

import { Car } from './Car.js';
import { Vector2 } from '../core/Vector2.js';

/**
 * AI configuration constants
 */
export const AI_CONFIG = {
    lookAhead: 4,
    steeringGain: 2.0,
    reactionDelay: 0.2,
    difficulty: 0.7
};

/**
 * AI car with waypoint following
 */
export class AICar extends Car {
    /**
     * Creates a new AI car
     * @param {Object} options - Configuration options
     * @param {Vector2} options.position - Initial position
     * @param {number} options.angle - Initial angle in radians
     * @param {string} options.color - Car color
     * @param {number} options.difficulty - AI difficulty (0.0 to 1.0)
     */
    constructor({ position = new Vector2(), angle = 0, color = '#00ff00', difficulty = AI_CONFIG.difficulty } = {}) {
        super({ position, angle, color });

        this.tag = 'aiCar';

        /**
         * AI difficulty (0.0 to 1.0)
         * @type {number}
         */
        this.difficulty = Math.max(0, Math.min(1, difficulty));

        /**
         * Track reference for waypoint following
         * @type {Track|null}
         */
        this.track = null;

        /**
         * Look ahead waypoints
         * @type {number}
         */
        this.lookAhead = Math.floor(AI_CONFIG.lookAhead * (0.5 + 0.5 * this.difficulty));

        /**
         * Steering gain
         * @type {number}
         */
        this.steeringGain = AI_CONFIG.steeringGain + this.difficulty * 0.5;

        /**
         * Reaction delay
         * @type {number}
         */
        this.reactionDelay = AI_CONFIG.reactionDelay * (1 - this.difficulty);

        /**
         * AI timer for reaction delay
         * @type {number}
         */
        this.aiTimer = 0;

        /**
         * Last target waypoint index
         * @type {number}
         */
        this.lastTargetIndex = 0;

        /**
         * AI throttle smoothing
         * @type {number}
         */
        this.aiThrottle = 1.0;
    }

    /**
     * Sets the track for waypoint following
     * @param {Track} track - Track to follow
     */
    setTrack(track) {
        this.track = track;
    }

    /**
     * Updates the AI car state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        if (!this.track) {
            // No track set, just drive straight
            this.throttle = 1.0;
            this.steering = 0;
            super.update(dt);
            return;
        }

        // Update AI timer
        this.aiTimer += dt;

        // Only update AI decision at reaction intervals
        if (this.aiTimer >= this.reactionDelay) {
            this.aiTimer = 0;
            this._updateAI(dt);
        }

        // Apply AI throttle smoothing
        this.throttle = this._smoothInput(this.throttle, this.aiThrottle, dt);

        // Update car
        super.update(dt);
    }

    /**
     * Updates AI decision making
     * @param {number} dt - Time step in seconds
     */
    _updateAI(dt) {
        // Find closest waypoint
        const closestIndex = this.track.getClosestWaypoint(this.position);

        // Look ahead
        const targetIndex = (closestIndex + this.lookAhead) % this.track.waypoints.length;
        const target = this.track.getWaypoint(targetIndex);

        // Calculate desired angle
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const desiredAngle = Math.atan2(dy, dx);

        // Normalize angle difference
        let angleDiff = desiredAngle - this.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Steering
        const steer = Math.max(-1, Math.min(1, angleDiff * this.steeringGain));
        this.steering = steer;

        // Throttle based on turning angle
        let throttle = 1.0;
        if (Math.abs(angleDiff) > 0.5) {
            throttle = 0.5; // Reduce throttle when turning
        }
        if (this.speed > 200 && Math.abs(angleDiff) > 0.3) {
            throttle = 0.0; // Brake for sharp turns
        }

        // Apply difficulty-based throttle adjustment
        this.aiThrottle = throttle * (0.8 + 0.2 * this.difficulty);
    }

    /**
     * Smooths input values
     * @param {number} current - Current value
     * @param {number} target - Target value
     * @param {number} dt - Time step in seconds
     * @returns {number} Smoothed value
     */
    _smoothInput(current, target, dt) {
        const smoothing = 0.05 + this.difficulty * 0.1;
        return current + (target - current) * smoothing;
    }

    /**
     * Renders the AI car
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        // Draw car
        super.render(ctx);

        // Draw AI indicator
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -this.height / 2 - 5);
        ctx.lineTo(0, -this.height / 2 - 15);
        ctx.stroke();

        // Draw look-ahead target if track is set
        if (this.track) {
            const closestIndex = this.track.getClosestWaypoint(this.position);
            const targetIndex = (closestIndex + this.lookAhead) % this.track.waypoints.length;
            const target = this.track.getWaypoint(targetIndex);

            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -this.height / 2);
            ctx.lineTo(target.x - this.position.x, target.y - this.position.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Serializes AI car state to JSON
     * @returns {Object} Serialized state
     */
    serialize() {
        const base = super.serialize();
        return {
            ...base,
            tag: this.tag,
            difficulty: this.difficulty,
            lookAhead: this.lookAhead,
            steeringGain: this.steeringGain,
            reactionDelay: this.reactionDelay,
            aiThrottle: this.aiThrottle
        };
    }

    /**
     * Deserializes AI car state from JSON
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        super.deserialize(data);
        this.tag = data.tag;
        this.difficulty = data.difficulty;
        this.lookAhead = data.lookAhead;
        this.steeringGain = data.steeringGain;
        this.reactionDelay = data.reactionDelay;
        this.aiThrottle = data.aiThrottle || 1.0;
    }
}