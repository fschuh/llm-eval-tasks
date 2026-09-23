import { Car } from './Car.js';

/**
 * Player-controlled car with keyboard input
 */
export class PlayerCar extends Car {
    constructor(id, startPosition, inputHandler) {
        super(id, true, startPosition);
        this.inputHandler = inputHandler;
    }

    /**
     * Update player input
     */
    update(dt) {
        // Handle input
        this.physics.isAccelerating = this.inputHandler.isActionActive('accelerate');
        this.physics.isBraking = this.inputHandler.isActionActive('brake');
        this.physics.steering = this.inputHandler.getSteering();
    }
}