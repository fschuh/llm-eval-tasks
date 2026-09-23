export class DeterministicRNG {
    constructor(seed = 42) {
        this.seed = seed;
        this.state = seed;
    }
    
    next() {
        let t = this.state += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    
    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }
    
    reset() {
        this.state = this.seed;
    }
}