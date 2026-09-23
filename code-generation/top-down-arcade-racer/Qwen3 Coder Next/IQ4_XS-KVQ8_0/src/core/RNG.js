/**
 * Deterministic Linear Congruential Generator
 * 
 * Implements a deterministic random number generator using the
 * Linear Congruential Generator (LCG) algorithm with seed support
 * for reproducible behavior.
 */
export class RNG {
    /**
     * Creates a new RNG instance with the given seed
     * @param {number} seed - Initial seed value (default: 12345)
     */
    constructor(seed = 12345) {
        this._seed = seed & 0x7FFFFFFF;
    }

    /**
     * Returns the current seed value
     * @returns {number} Current seed
     */
    get seed() {
        return this._seed;
    }

    /**
     * Sets a new seed value
     * @param {number} seed - New seed value
     */
    set seed(seed) {
        this._seed = seed & 0x7FFFFFFF;
    }

    /**
     * Generates the next random number in the sequence
     * @returns {number} Random number in range [0, 1)
     */
    next() {
        // Linear Congruential Generator parameters
        // Using glibc LCG parameters
        this._seed = (this._seed * 1103515245 + 12345) & 0x7FFFFFFF;
        return this._seed / 0x7FFFFFFF;
    }

    /**
     * Generates a random number in a specified range
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (exclusive)
     * @returns {number} Random number in range [min, max)
     */
    nextRange(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * Generates a random integer in a specified range
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @returns {number} Random integer in range [min, max]
     */
    nextInt(min, max) {
        return Math.floor(this.nextRange(min, max + 1));
    }

    /**
     * Generates a random boolean value
     * @returns {boolean} Random boolean
     */
    nextBoolean() {
        return this.next() < 0.5;
    }

    /**
     * Resets the RNG to its initial state
     * @param {number} seed - Optional new seed (default: 12345)
     */
    reset(seed = 12345) {
        this._seed = seed & 0x7FFFFFFF;
    }

    /**
     * Generates a random number from a normal-like distribution
     * Uses Box-Muller transform approximation
     * @param {number} mean - Mean of distribution
     * @param {number} stdDev - Standard deviation
     * @returns {number} Random number from distribution
     */
    nextNormal(mean = 0, stdDev = 1) {
        // Box-Muller transform approximation
        let u = 0;
        let v = 0;
        while (u === 0) u = this.next();
        while (v === 0) v = this.next();
        
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }
}