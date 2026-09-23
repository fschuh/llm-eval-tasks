/**
 * Player Car Class
 * 
 * Implements player-controlled car with input handling for WASD/arrow keys.
 */

import { Car } from './Car.js';
import { InputHandler } from '../core/InputHandler.js';
import { Vector2 } from '../core/Vector2.js';

/**
 * Player car with input handling
 */
export class PlayerCar extends Car {
    /**
     * Creates a new player car
     * @param {Object} options - Configuration options
     * @param {Vector2} options.position - Initial position
     * @param {number} options.angle - Initial angle in radians
     * @param {string} options.color - Car color
     */
    constructor({ position = new Vector2(), angle = 0, color = '#ff0000' } = {}) {
        super({ position, angle, color });

        this.tag = 'playerCar';

        /**
         * Input handler for player controls
         * @type {InputHandler}
         */
        this.inputHandler = new InputHandler();

        /**
         * Input smoothing factor
         * @type {number}
         */
        this.inputSmoothing = 0.1;

        /**
         * Previous throttle for smoothing
         * @type {number}
         */
        this.prevThrottle = 0;

        /**
         * Previous steering for smoothing
         * @type {number}
         */
        this.prevSteering = 0;
    }

    /**
     * Updates the player car state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Get input from handler
        const input = this.inputHandler.getCarInput();

        // Apply input smoothing
        this.throttle = this._smoothInput(this.prevThrottle, input.throttle, dt);
        this.brake = this._smoothInput(0, input.brake, dt);
        this.steering = this._smoothInput(this.prevSteering, input.steer, dt);

        // Update previous values
        this.prevThrottle = this.throttle;
        this.prevSteering = this.steering;

        // Update car
        super.update(dt);

        // Reset input handler state
        this.inputHandler.reset();
    }

    /**
     * Smooths input values
     * @param {number} current - Current value
     * @param {number} target - Target value
     * @param {number} dt - Time step in seconds
     * @returns {number} Smoothed value
     */
    _smoothInput(current, target, dt) {
        const smoothing = this.inputSmoothing;
        return current + (target - current) * smoothing;
    }

    /**
     * Sets car input directly (for testing or override)
     * @param {Object} input - Input object
     * @param {number} input.throttle - Throttle value (0 to 1)
     * @param {number} input.brake - Brake value (0 to 1)
     * @param {number} input.steer - Steering value (-1 to 1)
     */
    setDirectInput({ throttle = 0, brake = 0, steer = 0 } = {}) {
        this.throttle = Math.max(0, Math.min(1, throttle));
        this.brake = Math.max(0, Math.min(1, brake));
        this.steering = Math.max(-1, Math.min(1, steer));
    }

    /**
     * Renders the player car with additional UI
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        // Draw car
        super.render(ctx);

        // Draw player indicator
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -this.height / 2 - 5);
        ctx.lineTo(0, -this.height / 2 - 15);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Serializes player car state to JSON
     * @returns {Object} Serialized state
     */
    serialize() {
        const base = super.serialize();
        return {
            ...base,
            tag: this.tag,
            inputSmoothing: this.inputSmoothing
        };
    }

    /**
     * Deserializes player car state from JSON
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        super.deserialize(data);
        this.tag = data.tag;
        this.inputSmoothing = data.inputSmoothing || 0.1;
    }
}