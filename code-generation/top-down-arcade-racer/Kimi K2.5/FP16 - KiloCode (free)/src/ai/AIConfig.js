/**
 * AI Car Configuration for tuning AI behavior
 */
export class AIConfig {
    constructor(skill = 0.8, aggression = 0.5, rng = null) {
        this.skill = skill;           // 0-1, affects steering accuracy
        this.aggression = aggression; // 0-1, affects overtaking behavior
        this.rng = rng;               // Random number generator for deterministic behavior

        // Derived parameters
        this.reactionTime = 0.1 + (1 - skill) * 0.2; // seconds
        this.optimalLineOffset = this.getRandomOffset();
        this.brakeThreshold = 0.7 + skill * 0.2;
        
        // Individual variations
        this.maxSpeedVariation = 0.9 + skill * 0.1; // 0.9 to 1.0
        this.steeringError = (1 - skill) * 0.3;      // Max steering error
    }

    getRandomOffset() {
        if (this.rng) {
            return (this.rng.random() - 0.5) * 40 * (1 - this.skill);
        }
        return (Math.random() - 0.5) * 40 * (1 - this.skill);
    }

    getSteeringNoise() {
        if (this.rng) {
            return (this.rng.random() - 0.5) * this.steeringError;
        }
        return (Math.random() - 0.5) * this.steeringError;
    }

    /**
     * Factory methods for different AI personalities
     */
    static createRookie(rng = null) {
        return new AIConfig(0.6, 0.3, rng);
    }

    static createAverage(rng = null) {
        return new AIConfig(0.8, 0.5, rng);
    }

    static createPro(rng = null) {
        return new AIConfig(0.95, 0.8, rng);
    }

    static createChampion(rng = null) {
        return new AIConfig(0.98, 0.9, rng);
    }
}