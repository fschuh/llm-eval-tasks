/**
 * Deterministic random number generation system
 * 
 * This module provides a seed-based PRNG that ensures
 * the same seed always produces the same sequence of
 * random numbers for deterministic behavior.
 */

class PRNG {
  /**
   * Create a new PRNG instance
   * @param {number} seed - Initial seed value
   */
  constructor(seed) {
    this.seed = seed
    this.state = seed
  }

  /**
   * Generate the next random number in the sequence
   * @returns {number} Random number between 0 and 1
   */
  next() {
    // Xorshift algorithm for good distribution
    this.state ^= this.state << 13
    this.state ^= this.state >> 17
    this.state ^= this.state << 5
    return (this.state >>> 0) / 0xFFFFFFFF
  }

  /**
   * Generate a random integer within a range
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (inclusive)
   * @returns {number} Random integer between min and max
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  /**
   * Generate a random number within a range
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Random number between min and max
   */
  nextFloat(min, max) {
    return this.next() * (max - min) + min
  }

  /**
   * Generate a random boolean value
   * @returns {boolean} Random true or false
   */
  nextBool() {
    return this.next() > 0.5
  }
}

/**
 * Create a PRNG instance with a seed derived from current time
 * @returns {PRNG} New PRNG instance
 */
function createPRNG() {
  // Derive seed from game start time (in seconds, modulo 1000000 for consistency)
  const seed = Math.floor(Date.now() / 1000) % 1000000
  return new PRNG(seed)
}

module.exports = {
  PRNG,
  createPRNG
}
