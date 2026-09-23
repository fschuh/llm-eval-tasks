/**
 * Deterministic Seeded Random Number Generator
 * Uses the mulberry32 algorithm for high-quality pseudo-random numbers
 */
export class SeededRNG {
    /**
     * @param {number} seed - Initial seed value
     */
    constructor(seed) {
        this.initialSeed = seed;
        this.seed = seed;
    }

    /**
     * Reset the generator to initial seed or a new seed
     * @param {number|null} newSeed - Optional new seed, uses initial if not provided
     */
    reset(newSeed = null) {
        this.seed = newSeed !== null ? newSeed : this.initialSeed;
        if (newSeed !== null) {
            this.initialSeed = newSeed;
        }
    }

    /**
     * Generate next random number in sequence (0-1)
     * @returns {number} Random number between 0 and 1
     */
    next() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    /**
     * Generate random integer in range [min, max] (inclusive)
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random integer in range
     */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Generate random float in range [min, max)
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random float in range
     */
    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }

    /**
     * Generate random boolean with optional probability
     * @param {number} probability - Probability of returning true (default 0.5)
     * @returns {boolean} Random boolean
     */
    nextBool(probability = 0.5) {
        return this.next() < probability;
    }

    /**
     * Pick random element from array
     * @param {Array} array - Array to pick from
     * @returns {*} Random element
     */
    pick(array) {
        return array[this.nextInt(0, array.length - 1)];
    }

    /**
     * Shuffle array in place using Fisher-Yates algorithm
     * @param {Array} array - Array to shuffle
     * @returns {Array} Shuffled array (same reference)
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}