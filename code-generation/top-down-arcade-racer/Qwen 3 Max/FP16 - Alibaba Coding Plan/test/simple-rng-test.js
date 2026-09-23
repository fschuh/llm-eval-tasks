// Simple deterministic RNG test
// This tests the core functionality of the DeterministicRNG class

class DeterministicRNG {
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
    
    reset() {
        this.state = this.seed;
    }
}

function runDeterministicTest() {
    const seed = 12345;
    console.log('Testing Deterministic RNG with seed:', seed);
    
    // Test 1: Same seed should produce same sequence
    const rng1 = new DeterministicRNG(seed);
    const rng2 = new DeterministicRNG(seed);
    
    const sequence1 = [];
    const sequence2 = [];
    const testLength = 100;
    
    for (let i = 0; i < testLength; i++) {
        sequence1.push(rng1.next());
        sequence2.push(rng2.next());
    }
    
    let sequencesMatch = true;
    for (let i = 0; i < testLength; i++) {
        if (Math.abs(sequence1[i] - sequence2[i]) > 1e-15) {
            console.log(`Mismatch at index ${i}: ${sequence1[i]} vs ${sequence2[i]}`);
            sequencesMatch = false;
            break;
        }
    }
    
    if (sequencesMatch) {
        console.log('✅ SUCCESS: Same seed produces identical sequences');
    } else {
        console.log('❌ FAILURE: Same seed produces different sequences');
        return false;
    }
    
    // Test 2: Reset should restore original sequence
    rng1.reset();
    const resetSequence = [];
    for (let i = 0; i < testLength; i++) {
        resetSequence.push(rng1.next());
    }
    
    let resetMatches = true;
    for (let i = 0; i < testLength; i++) {
        if (Math.abs(resetSequence[i] - sequence1[i]) > 1e-15) {
            console.log(`Reset mismatch at index ${i}: ${resetSequence[i]} vs ${sequence1[i]}`);
            resetMatches = false;
            break;
        }
    }
    
    if (resetMatches) {
        console.log('✅ SUCCESS: Reset restores original sequence');
    } else {
        console.log('❌ FAILURE: Reset does not restore original sequence');
        return false;
    }
    
    // Test 3: Different seeds should produce different sequences
    const rng3 = new DeterministicRNG(seed + 1);
    const sequence3 = [];
    for (let i = 0; i < testLength; i++) {
        sequence3.push(rng3.next());
    }
    
    let differentSeedsDifferent = false;
    for (let i = 0; i < testLength; i++) {
        if (Math.abs(sequence1[i] - sequence3[i]) > 1e-15) {
            differentSeedsDifferent = true;
            break;
        }
    }
    
    if (differentSeedsDifferent) {
        console.log('✅ SUCCESS: Different seeds produce different sequences');
    } else {
        console.log('❌ FAILURE: Different seeds produce identical sequences');
        return false;
    }
    
    console.log('🎉 All deterministic RNG tests passed!');
    return true;
}

// Run the test
const success = runDeterministicTest();
process.exit(success ? 0 : 1);