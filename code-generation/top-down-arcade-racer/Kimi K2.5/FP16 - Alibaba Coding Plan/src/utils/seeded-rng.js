/**
 * SeededRNG - Deterministic Random Number Generator
 * 
 * Implements a Linear Congruential Generator (LCG) for predictable,
 * reproducible random number sequences given the same seed.
 * 
 * Formula: X_{n+1} = (a * X_n + c) mod m
 * Where:
 *   - m = 2^31 (modulus)
 *   - a = 1103515245 (multiplier)
 *   - c = 12345 (increment)
 */
export class SeededRNG {
    /**
     * Create a new SeededRNG instance
     * @param {number} seed - Initial seed value (default: 12345)
     */
    constructor(seed = 12345) {
        this._initialSeed = seed;
        this._state = seed;
    }

    /**
     * Get the next random float in range [0, 1)
     * @returns {number} Random float between 0 (inclusive) and 1 (exclusive)
     */
    next() {
        // LCG parameters (glibc constants)
        const a = 1103515245;
        const c = 12345;
        const m = 2147483648; // 2^31

        // Update state
        this._state = (a * this._state + c) % m;

        // Return normalized value in [0, 1)
        return this._state / m;
    }

    /**
     * Get the next random integer in range [min, max]
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @returns {number} Random integer in the specified range
     */
    nextInt(min, max) {
        if (min > max) {
            throw new Error('min must be less than or equal to max');
        }
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Reset the RNG with a new seed
     * @param {number} seed - New seed value
     */
    setSeed(seed) {
        this._initialSeed = seed;
        this._state = seed;
    }

    /**
     * Reset to initial seed
     */
    reset() {
        this._state = this._initialSeed;
    }

    /**
     * Get the current seed
     * @returns {number} The initial seed value
     */
    getSeed() {
        return this._initialSeed;
    }

    /**
     * Get a random float in range [min, max)
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (exclusive)
     * @returns {number} Random float in the specified range
     */
    range(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * Pick a random element from an array
     * @template T
     * @param {T[]} array - Array to pick from
     * @returns {T} Random element from the array
     */
    pick(array) {
        if (array.length === 0) {
            throw new Error('Cannot pick from empty array');
        }
        return array[this.nextInt(0, array.length - 1)];
    }

    /**
     * Shuffle an array in-place using Fisher-Yates algorithm
     * @template T
     * @param {T[]} array - Array to shuffle
     * @returns {T[]} The shuffled array (same reference)
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Return true with given probability
     * @param {number} probability - Probability between 0 and 1
     * @returns {boolean} True with the specified probability
     */
    chance(probability) {
        return this.next() < probability;
    }
}
