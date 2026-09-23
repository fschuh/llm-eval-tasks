/**
 * DeterministicRNG - Linear Congruential Generator for reproducible randomness
 * Uses Numerical Recipes parameters for good distribution
 */
export class DeterministicRNG {
    // LCG parameters (Numerical Recipes)
    static A = 1664525;
    static C = 1013904223;
    static M = 4294967296; // 2^32

    /**
     * Create a new RNG with optional seed
     * @param {number} seed - Initial seed (default: 12345)
     */
    constructor(seed = 12345) {
        this.initialSeed = seed;
        this.seed = seed;
    }

    /**
     * Generate next integer
     * @returns {number} Random integer in [0, 2^32)
     */
    nextInt() {
        this.seed = (DeterministicRNG.A * this.seed + DeterministicRNG.C) % DeterministicRNG.M;
        return this.seed;
    }

    /**
     * Generate float in [0, 1)
     * @returns {number} Random float
     */
    nextFloat() {
        return this.nextInt() / DeterministicRNG.M;
    }

    /**
     * Generate float in [min, max)
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random float in range
     */
    range(min, max) {
        return min + this.nextFloat() * (max - min);
    }

    /**
     * Generate integer in [min, max]
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random integer in range
     */
    rangeInt(min, max) {
        return Math.floor(this.range(min, max + 1));
    }

    /**
     * Reset to initial seed
     */
    reset() {
        this.seed = this.initialSeed;
    }

    /**
     * Set new seed
     * @param {number} seed - New seed value
     */
    setSeed(seed) {
        this.initialSeed = seed;
        this.seed = seed;
    }

    /**
     * Get current seed
     * @returns {number} Current seed
     */
    getSeed() {
        return this.seed;
    }

    /**
     * Get initial seed
     * @returns {number} Initial seed
     */
    getInitialSeed() {
        return this.initialSeed;
    }
}

// Global RNG instance for game-wide use
export const GameRNG = new DeterministicRNG();
