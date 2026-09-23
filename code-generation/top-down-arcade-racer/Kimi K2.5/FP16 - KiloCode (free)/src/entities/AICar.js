import { Car } from './Car.js';
import { AIConfig } from '../ai/AIConfig.js';
import { WaypointFollower } from '../ai/WaypointFollower.js';

/**
 * AI-controlled car with waypoint following
 */
export class AICar extends Car {
    constructor(id, startPosition, track, skill = 'average', rng = null) {
        super(id, false, startPosition);
        
        // Create AI configuration based on skill level
        switch (skill) {
            case 'rookie':
                this.aiConfig = AIConfig.createRookie(rng);
                break;
            case 'pro':
                this.aiConfig = AIConfig.createPro(rng);
                break;
            case 'champion':
                this.aiConfig = AIConfig.createChampion(rng);
                break;
            default:
                this.aiConfig = AIConfig.createAverage(rng);
        }

        // Create waypoint follower
        this.aiController = new WaypointFollower(this, track, this.aiConfig);
    }

    /**
     * Update AI car
     */
    update(dt) {
        if (this.aiController) {
            this.aiController.update(dt);
        }
    }

    /**
     * Reset AI car
     */
    reset(startPosition, startHeading = 0) {
        super.reset(startPosition, startHeading);
        
        if (this.aiController) {
            this.aiController.reset();
        }
    }
}