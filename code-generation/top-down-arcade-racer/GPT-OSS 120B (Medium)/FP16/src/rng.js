// Linear Congruential Generator (LCG) for deterministic randomness
// Parameters are from Numerical Recipes
export class RNG {
  constructor(seed = 123456789) {
    this.m = 0x80000000; // 2^31
    this.a = 1664525;
    this.c = 1013904223;
    this.state = seed % this.m;
  }
  nextInt() {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state;
  }
  // Returns float in [0, 1)
  next() {
    // Divide by modulus to get [0,1)
    return this.nextInt() / (this.m - 1);
  }
  // Returns integer in [min, max]
  nextRange(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// Export a singleton seeded RNG for the whole game
export const rng = new RNG(12345); // deterministic seed
