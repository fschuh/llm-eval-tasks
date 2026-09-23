/**
 * Deterministic seeded random number generator using the Mulberry32 algorithm.
 * Provides reproducible random sequences for deterministic game behavior,
 * particularly useful for AI decision-making and procedural generation.
 * 
 * @module SeededRNG
 */
class SeededRNG {
    /**
     * Creates a new SeededRNG instance with the given seed.
     * Accepts either a number or string as seed (strings are hashed to numbers).
     * @param {number|string} seed - The seed value for deterministic randomness.
     */
    constructor(seed) {
        // Convert seed to a number if it's a string using djb2 hash algorithm
        if (typeof seed === 'string') {
            let hash = 0;
            for (let i = 0; i < seed.length; i++) {
                const char = seed.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            this.state = Math.abs(hash);
        } else {
            // Ensure unsigned 32-bit integer
            this.state = seed >>> 0;
        }
    }

    /**
     * Generates the next random number in the sequence using Mulberry32 algorithm.
     * Returns a floating-point value in the range [0, 1).
     * @returns {number} A pseudo-random float between 0 (inclusive) and 1 (exclusive).
     */
    next() {
        let t = this.state += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Generates a random integer within the specified range (inclusive).
     * @param {number} min - The minimum value (inclusive).
     * @param {number} max - The maximum value (inclusive).
     * @returns {number} A random integer between min and max, inclusive.
     */
    rangeInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Generates a random floating-point number within the specified range.
     * @param {number} min - The minimum value (inclusive).
     * @param {number} max - The maximum value (exclusive).
     * @returns {number} A random float between min and max.
     */
    range(min, max) {
        return this.next() * (max - min) + min;
    }

    /**
     * Returns true with a given probability.
     * @param {number} probability - The probability of returning true (0 to 1).
     *                                0 = always false, 1 = always true.
     * @returns {boolean} True if the random check passes based on probability.
     */
    chance(probability) {
        return this.next() < probability;
    }

    /**
     * Shuffles an array in place using the Fisher-Yates (Knuth) shuffle algorithm.
     * Modifies the original array and returns it for chaining.
     * @param {Array} array - The array to shuffle.
     * @returns {Array} The same array reference, now shuffled.
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Selects a random element from an array.
     * @param {Array} array - The array to select from.
     * @returns {*} A randomly selected element from the array, or undefined if empty.
     */
    pick(array) {
        if (array.length === 0) return undefined;
        return array[this.rangeInt(0, array.length - 1)];
    }

    /**
     * Generates a random boolean value with equal probability.
     * @returns {boolean} True or false with approximately 50% chance each.
     */
    coinFlip() {
        return this.chance(0.5);
    }

    /**
     * Creates a copy of this RNG with the same state.
     * Useful for saving and restoring random number sequences.
     * @returns {SeededRNG} A new SeededRNG instance with the same internal state.
     */
    clone() {
        const rng = new SeededRNG(0);
        rng.state = this.state;
        return rng;
    }

    /**
     * Gets the current internal state of the RNG.
     * @returns {number} The current 32-bit unsigned integer state value.
     */
    getState() {
        return this.state;
    }

    /**
     * Sets the internal state of the RNG directly.
     * Useful for restoring a previously saved state.
     * @param {number} state - The new 32-bit unsigned integer state value.
     */
    setState(state) {
        this.state = state >>> 0;
    }
}

export default SeededRNG;
