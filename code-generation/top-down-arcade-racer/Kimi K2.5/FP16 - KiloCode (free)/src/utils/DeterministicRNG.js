/**
 * Deterministic Random Number Generator using Linear Congruential Generator (LCG)
 * Parameters from Numerical Recipes for full period
 */
export class DeterministicRNG {
    constructor(seed = 12345) {
        this.initialSeed = seed;
        this.state = seed;
    }

    /**
     * Get next random number in range [0, 1)
     * Uses LCG: state = (a * state + c) % m
     */
    random() {
        // LCG parameters from Numerical Recipes
        const a = 1664525;
        const c = 1013904223;
        const m = 4294967296; // 2^32

        this.state = (a * this.state + c) % m;
        return this.state / m;
    }

    /**
     * Random integer in range [min, max)
     */
    randomInt(min, max) {
        return Math.floor(this.random() * (max - min)) + min;
    }

    /**
     * Random float in range [min, max)
     */
    randomFloat(min, max) {
        return this.random() * (max - min) + min;
    }

    /**
     * Reset to initial seed
     */
    reset() {
        this.state = this.initialSeed;
    }

    /**
     * Set new seed
     */
    setSeed(seed) {
        this.initialSeed = seed;
        this.state = seed;
    }

    /**
     * Get current seed/state
     */
    getSeed() {
        return this.initialSeed;
    }
}