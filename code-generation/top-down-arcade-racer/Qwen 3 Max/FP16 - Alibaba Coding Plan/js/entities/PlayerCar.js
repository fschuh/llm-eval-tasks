import { Car } from './Car.js';

export class PlayerCar extends Car {
    constructor(position) {
        super('player', position, 0);
    }
    
    update(dt, inputHandler) {
        const input = inputHandler.getCarInput();
        super.update(dt, input);
    }
}