// AI Opponent Test
// This test validates AI waypoint following, difficulty levels, and racing behavior

import { GameConfig } from '../js/core/Constants.js';
import { Vector2 } from '../js/utils/Vector2.js';
import { AIOpponent } from '../js/entities/AIOpponent.js';
import { Track } from '../js/track/Track.js';
import { DeterministicRNG } from '../js/utils/DeterministicRNG.js';

class AIOpponentTest {
    constructor() {
        this.testDuration = 2; // seconds
        this.timestep = GameConfig.FIXED_TIMESTEP;
        this.steps = Math.floor(this.testDuration / this.timestep);
        this.rng = new DeterministicRNG(GameConfig.SEED);
    }
    
    runTest() {
        console.log('Running AI Opponent Test...');
        
        let allTestsPassed = true;
        
        // Test 1: AI initialization with different difficulty levels
        allTestsPassed &= this.testAIDifficultyInitialization();
        
        // Test 2: Waypoint following behavior
        allTestsPassed &= this.testWaypointFollowing();
        
        // Test 3: AI stays on track
        allTestsPassed &= this.testAITrackAdherence();
        
        // Test 4: Different difficulty levels produce different behavior
        allTestsPassed &= this.testDifficultyLevels();
        
        // Test 5: AI provides competitive challenge
        allTestsPassed &= this.testCompetitiveBehavior();
        
        if (allTestsPassed) {
            console.log('✅ SUCCESS: All AI opponent tests passed');
        } else {
            console.log('❌ FAILURE: Some AI opponent tests failed');
        }
        
        return allTestsPassed;
    }
    
    testAIDifficultyInitialization() {
        const position = new Vector2(400, 300);
        
        const easyAI = new AIOpponent('easy', position, 'EASY');
        const mediumAI = new AIOpponent('medium', position, 'MEDIUM');
        const hardAI = new AIOpponent('hard', position, 'HARD');
        
        if (!easyAI || !mediumAI || !hardAI) {
            console.log('❌ AI initialization failed');
            return false;
        }
        
        // Check that difficulty levels are set correctly
        if (easyAI.difficulty !== 'EASY' || 
            mediumAI.difficulty !== 'MEDIUM' || 
            hardAI.difficulty !== 'HARD') {
            console.log('❌ AI difficulty level assignment failed');
            return false;
        }
        
        console.log('✅ AI difficulty initialization test passed');
        return true;
    }
    
    testWaypointFollowing() {
        const track = new Track();
        const aiCar = new AIOpponent('test', new Vector2(400, 150), 'MEDIUM');
        const allCars = [aiCar]; // Only AI car for this test
        
        // Initialize AI with track waypoints
        aiCar.update(this.timestep, track, allCars, this.rng);
        
        // Store initial waypoint index
        const initialWaypointIndex = aiCar.currentWaypointIndex;
        
        // Simulate AI movement for several steps
        for (let step = 0; step < 50; step++) {
            aiCar.update(this.timestep, track, allCars, this.rng);
        }
        
        // AI should have progressed to a different waypoint
        if (aiCar.currentWaypointIndex === initialWaypointIndex) {
            console.log('❌ AI waypoint following failed - no waypoint progression');
            return false;
        }
        
        // AI should be moving toward current waypoint
        const currentWaypoint = track.waypoints[aiCar.currentWaypointIndex];
        const distanceToWaypoint = Vector2.distance(aiCar.position, currentWaypoint);
        
        if (distanceToWaypoint > 200) { // Should be reasonably close to waypoint
            console.log(`❌ AI waypoint following failed - too far from waypoint (${distanceToWaypoint})`);
            return false;
        }
        
        console.log('✅ AI waypoint following test passed');
        return true;
    }
    
    testAITrackAdherence() {
        const track = new Track();
        const aiCar = new AIOpponent('test', new Vector2(400, 150), 'MEDIUM');
        const allCars = [aiCar];
        
        // Simulate AI for several steps
        for (let step = 0; step < 100; step++) {
            aiCar.update(this.timestep, track, allCars, this.rng);
            
            // Check if AI stays on track most of the time
            if (step > 10) { // Allow some initial adjustment
                const isOnTrack = !track.checkCarCollision(aiCar);
                if (!isOnTrack) {
                    // AI can occasionally go off track, but not consistently
                    // Let's check the next few frames to see if it recovers
                    let offTrackCount = 1;
                    for (let recoveryStep = 0; recoveryStep < 10; recoveryStep++) {
                        aiCar.update(this.timestep, track, allCars, this.rng);
                        if (track.checkCarCollision(aiCar)) {
                            offTrackCount++;
                        }
                    }
                    
                    if (offTrackCount > 5) { // More than half the time off track
                        console.log('❌ AI track adherence failed - spends too much time off track');
                        return false;
                    }
                    break; // We found one instance, that's enough for this test
                }
            }
        }
        
        console.log('✅ AI track adherence test passed');
        return true;
    }
    
    testDifficultyLevels() {
        const track = new Track();
        const position = new Vector2(400, 150);
        
        const easyAI = new AIOpponent('easy', position, 'EASY');
        const hardAI = new AIOpponent('hard', position, 'HARD');
        
        const allCarsEasy = [easyAI];
        const allCarsHard = [hardAI];
        
        // Simulate both AIs for the same duration
        const simulationSteps = 100;
        for (let step = 0; step < simulationSteps; step++) {
            easyAI.update(this.timestep, track, allCarsEasy, this.rng);
            hardAI.update(this.timestep, track, allCarsHard, this.rng);
        }
        
        // Hard AI should have progressed further (higher waypoint index)
        if (hardAI.currentWaypointIndex <= easyAI.currentWaypointIndex) {
            console.log('❌ Difficulty levels test failed - hard AI not progressing faster than easy AI');
            return false;
        }
        
        // Hard AI should have higher average speed
        const easySpeed = easyAI.velocity.magnitude();
        const hardSpeed = hardAI.velocity.magnitude();
        
        if (hardSpeed <= easySpeed) {
            console.log('❌ Difficulty levels test failed - hard AI not faster than easy AI');
            return false;
        }
        
        console.log('✅ AI difficulty levels test passed');
        return true;
    }
    
    testCompetitiveBehavior() {
        const track = new Track();
        const aiCar = new AIOpponent('test', new Vector2(400, 150), 'MEDIUM');
        const allCars = [aiCar];
        
        // Simulate AI for a reasonable race duration
        const raceSteps = 200; // About 3-4 seconds at 60 FPS
        let maxSpeed = 0;
        let totalDistance = 0;
        let previousPosition = aiCar.position.clone();
        
        for (let step = 0; step < raceSteps; step++) {
            aiCar.update(this.timestep, track, allCars, this.rng);
            
            // Track maximum speed achieved
            const currentSpeed = aiCar.velocity.magnitude();
            maxSpeed = Math.max(maxSpeed, currentSpeed);
            
            // Track total distance traveled
            totalDistance += Vector2.distance(aiCar.position, previousPosition);
            previousPosition = aiCar.position.clone();
        }
        
        // AI should achieve reasonable speeds (not too slow, not impossibly fast)
        if (maxSpeed < 20 || maxSpeed > 150) {
            console.log(`❌ Competitive behavior test failed - max speed ${maxSpeed} is unreasonable`);
            return false;
        }
        
        // AI should cover reasonable distance
        if (totalDistance < 100) {
            console.log(`❌ Competitive behavior test failed - total distance ${totalDistance} is too low`);
            return false;
        }
        
        console.log('✅ AI competitive behavior test passed');
        return true;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.AIOpponentTest = AIOpponentTest;
} else {
    // Node.js environment
    console.log('AI opponent test requires browser environment for proper track initialization');
}

export { AIOpponentTest };