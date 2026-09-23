/**
 * Deterministic Random Number Generator
 * Uses Mulberry32 algorithm for fast, high-quality seeded randomness
 */
export class DeterministicRNG {
    constructor(seed) {
        this.seed = seed;
        this.state = seed;
    }
    
    /**
     * Reset to initial seed
     */
    reset() {
        this.state = this.seed;
    }
    
    /**
     * Set a new seed
     */
    setSeed(seed) {
        this.seed = seed;
        this.state = seed;
    }
    
    /**
     * Get next random number between 0 and 1
     */
    next() {
        let t = this.state += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    
    /**
     * Get random integer in range [min, max] (inclusive)
     */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    
    /**
     * Get random float in range [min, max)
     */
    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }
    
    /**
     * Get random boolean with optional probability
     */
    nextBool(probability = 0.5) {
        return this.next() < probability;
    }
    
    /**
     * Pick random element from array
     */
    pick(array) {
        return array[Math.floor(this.next() * array.length)];
    }
    
    /**
     * Shuffle array in place using Fisher-Yates
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    /**
     * Get current state (for saving/restoring)
     */
    getState() {
        return this.state;
    }
    
    /**
     * Restore state
     */
    setState(state) {
        this.state = state;
    }
}
