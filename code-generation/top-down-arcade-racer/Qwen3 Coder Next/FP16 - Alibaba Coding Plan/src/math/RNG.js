/**
 * Deterministic Random Number Generator using Linear Congruential Generator (LCG)
 * Uses the same parameters as glibc for good statistical properties
 */
export class RNG {
    /**
     * @param {number} seed - Initial seed value for reproducibility
     */
    constructor(seed = 1) {
        this.seed = seed >>> 0; // Ensure unsigned 32-bit integer
        // LCG parameters (same as glibc)
        this.a = 1103515245;
        this.c = 12345;
        this.m = 2147483648; // 2^31
    }

    /**
     * Generate next random integer
     * @returns {number} Random integer (0 to 2^31-1)
     */
    next() {
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed;
    }

    /**
     * Generate next random float in range [0, 1)
     * @returns {number} Random float
     */
    nextFloat() {
        return this.next() / (this.m - 1);
    }

    /**
     * Generate next random integer in range [min, max]
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @returns {number} Random integer
     */
    nextInt(min, max) {
        return Math.floor(this.nextFloat() * (max - min + 1)) + min;
    }

    /**
     * Generate next random float in range [min, max)
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (exclusive)
     * @returns {number} Random float
     */
    nextFloatRange(min, max) {
        return this.nextFloat() * (max - min) + min;
    }

    /**
     * Generate random boolean
     * @returns {boolean} Random boolean
     */
    nextBoolean() {
        return this.nextFloat() < 0.5;
    }

    /**
     * Generate random vector with unit length
     * @returns {Vector2} Random unit vector
     */
    nextUnitVector() {
        const angle = this.nextFloat() * Math.PI * 2;
        return {
            x: Math.cos(angle),
            y: Math.sin(angle)
        };
    }

    /**
     * Generate random vector within a circle
     * @param {number} radius - Maximum distance from center
     * @returns {Object} Random point with x, y properties
     */
    nextPointInCircle(radius) {
        const angle = this.nextFloat() * Math.PI * 2;
        const r = Math.sqrt(this.nextFloat()) * radius;
        return {
            x: r * Math.cos(angle),
            y: r * Math.sin(angle)
        };
    }

    /**
     * Generate random vector within a rectangle
     * @param {number} width - Rectangle width
     * @param {number} height - Rectangle height
     * @returns {Object} Random point with x, y properties
     */
    nextPointInRect(width, height) {
        return {
            x: this.nextFloat() * width,
            y: this.nextFloat() * height
        };
    }

    /**
     * Shuffle an array in place using Fisher-Yates algorithm
     * @param {Array} array - Array to shuffle
     * @returns {Array} Shuffled array
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Pick a random element from an array
     * @param {Array} array - Array to pick from
     * @returns {*} Random element
     */
    pick(array) {
        if (array.length === 0) return undefined;
        return array[this.nextInt(0, array.length - 1)];
    }

    /**
     * Reset RNG to a new seed
     * @param {number} seed - New seed value
     */
    reset(seed) {
        this.seed = seed >>> 0;
    }

    /**
     * Create a copy of this RNG with the same state
     * @returns {RNG} New RNG instance
     */
    copy() {
        const copy = new RNG(this.seed);
        copy.a = this.a;
        copy.c = this.c;
        copy.m = this.m;
        return copy;
    }

    /**
     * Create an RNG from a string seed using hash
     * @param {string} str - String to hash
     * @returns {RNG} New RNG instance
     */
    static fromString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return new RNG(Math.abs(hash));
    }
}
