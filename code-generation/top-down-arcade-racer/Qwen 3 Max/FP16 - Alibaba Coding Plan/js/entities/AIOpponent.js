import { Car } from './Car.js';
import { AIController } from '../systems/AIController.js';

export class AIOpponent extends Car {
    constructor(id, position, difficulty = 'MEDIUM') {
        super(id, position, 0);
        this.difficulty = difficulty;
        this.controller = new AIController(difficulty);
        
        // Override physics properties based on difficulty
        switch (difficulty) {
            case 'EASY':
                this.maxSpeed *= 0.85;
                this.accelerationRate *= 0.8;
                this.brakingRate *= 0.7;
                this.turnRate *= 0.9;
                break;
            case 'HARD':
                this.maxSpeed *= 1.05;
                this.accelerationRate *= 1.1;
                this.brakingRate *= 1.1;
                this.turnRate *= 1.05;
                break;
            default: // MEDIUM
                // Keep base values
                break;
        }
    }
    
    update(dt, track, otherCars, rng) {
        // Get AI input from controller
        const input = this.controller.computeInput(this, track, otherCars, rng, dt);
        super.update(dt, input);
    }
}