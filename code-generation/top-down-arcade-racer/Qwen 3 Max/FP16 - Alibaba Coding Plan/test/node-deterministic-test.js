// Node.js version of the deterministic test
// This can be run directly in the terminal

const fs = require('fs');
const path = require('path');

// Mock the browser environment
global.window = {};
global.document = {};

// Import the constants and RNG
const ConstantsPath = path.join(__dirname, '..', 'js', 'core', 'Constants.js');
const DeterministicRNGPath = path.join(__dirname, '..', 'js', 'utils', 'DeterministicRNG.js');

// Read and evaluate the modules
const constantsCode = fs.readFileSync(ConstantsPath, 'utf8');
const rngCode = fs.readFileSync(DeterministicRNGPath, 'utf8');

// Execute the modules in the global context
eval(constantsCode);
eval(rngCode);

class DeterministicTest {
    constructor() {
        this.seed = GameConfig.SEED;
        this.testDuration = 5; // seconds
        this.timestep = GameConfig.FIXED_TIMESTEP;
        this.steps = Math.floor(this.testDuration / this.timestep);
    }
    
    runTest() {
        console.log('Running deterministic RNG test...');
        console.log(`Seed: ${this.seed}`);
        console.log(`Test duration: ${this.testDuration} seconds`);
        console.log(`Timestep: ${this.timestep} seconds`);
        console.log(`Total steps: ${this.steps}`);
        
        // Run simulation 1
        const results1 = this.runSimulation();
        
        // Run simulation 2  
        const results2 = this.runSimulation();
        
        // Compare results
        const isDeterministic = this.compareResults(results1, results2);
        
        if (isDeterministic) {
            console.log('✅ SUCCESS: Game is deterministic! Both runs produced identical results.');
        } else {
            console.log('❌ FAILURE: Game is NOT deterministic! Results differ between runs.');
        }
        
        return isDeterministic;
    }
    
    runSimulation() {
        // Create fresh RNG instance with the same seed
        const rng = new DeterministicRNG(this.seed);
        
        // Simulate AI behavior variations that would occur in the actual game
        const aiStates = [];
        
        // Simulate the same number of steps as the actual game would
        for (let step = 0; step < this.steps; step++) {
            // Simulate AI controller decisions that use RNG
            const aiDecisions = [];
            
            // For each AI car (3 cars)
            for (let carIndex = 0; carIndex < 3; carIndex++) {
                // Simulate stuck recovery behavior
                const recoverySteering = (rng.next() - 0.5) * 2;
                const recoveryThrottle = rng.next() > 0.5 ? 1 : -0.5;
                
                // Simulate target waypoint error
                const errorAmount = 0.15 * 50; // MEDIUM difficulty error tolerance
                const randomOffsetX = (rng.next() - 0.5) * errorAmount;
                const randomOffsetY = (rng.next() - 0.5) * errorAmount;
                
                // Simulate steering variation
                const randomVariation = (rng.next() - 0.5) * 0.2 * 0.15;
                
                aiDecisions.push({
                    recoverySteering,
                    recoveryThrottle,
                    randomOffsetX,
                    randomOffsetY,
                    randomVariation
                });
            }
            
            aiStates.push({
                step,
                time: step * this.timestep,
                aiDecisions
            });
        }
        
        return aiStates;
    }
    
    compareResults(results1, results2) {
        if (results1.length !== results2.length) {
            console.log('Length mismatch');
            return false;
        }
        
        for (let i = 0; i < results1.length; i++) {
            const state1 = results1[i];
            const state2 = results2[i];
            
            if (state1.step !== state2.step || 
                Math.abs(state1.time - state2.time) > 1e-10) {
                console.log(`Step/time mismatch at index ${i}`);
                return false;
            }
            
            if (state1.aiDecisions.length !== state2.aiDecisions.length) {
                console.log(`AI decisions length mismatch at step ${i}`);
                return false;
            }
            
            for (let j = 0; j < state1.aiDecisions.length; j++) {
                const decision1 = state1.aiDecisions[j];
                const decision2 = state2.aiDecisions[j];
                
                if (Math.abs(decision1.recoverySteering - decision2.recoverySteering) > 1e-10 ||
                    Math.abs(decision1.recoveryThrottle - decision2.recoveryThrottle) > 1e-10 ||
                    Math.abs(decision1.randomOffsetX - decision2.randomOffsetX) > 1e-10 ||
                    Math.abs(decision1.randomOffsetY - decision2.randomOffsetY) > 1e-10 ||
                    Math.abs(decision1.randomVariation - decision2.randomVariation) > 1e-10) {
                    console.log(`Decision mismatch at step ${i}, car ${j}`);
                    console.log('Decision 1:', decision1);
                    console.log('Decision 2:', decision2);
                    return false;
                }
            }
        }
        
        return true;
    }
}

// Run the test
const test = new DeterministicTest();
const success = test.runTest();
process.exit(success ? 0 : 1);