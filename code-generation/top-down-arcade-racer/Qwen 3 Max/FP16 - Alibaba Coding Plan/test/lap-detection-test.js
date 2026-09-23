// Lap Detection Test
// This test validates lap counting, timing accuracy, and race completion

import { GameConfig } from '../js/core/Constants.js';
import { Vector2 } from '../js/utils/Vector2.js';
import { LapDetector } from '../js/systems/LapDetection.js';
import { Track } from '../js/track/Track.js';
import { PlayerCar } from '../js/entities/PlayerCar.js';

class LapDetectionTest {
    constructor() {
        this.timestep = GameConfig.FIXED_TIMESTEP;
    }
    
    runTest() {
        console.log('Running Lap Detection Test...');
        
        let allTestsPassed = true;
        
        // Test 1: Basic lap detector initialization
        allTestsPassed &= this.testLapDetectorInitialization();
        
        // Test 2: Forward lap crossing detection
        allTestsPassed &= this.testForwardLapCrossing();
        
        // Test 3: Backward lap crossing rejection
        allTestsPassed &= this.testBackwardLapCrossing();
        
        // Test 4: Race completion after 3 laps
        allTestsPassed &= this.testRaceCompletion();
        
        // Test 5: Timing precision validation
        allTestsPassed &= this.testTimingPrecision();
        
        // Test 6: Position tracking based on lap progress
        allTestsPassed &= this.testPositionTracking();
        
        if (allTestsPassed) {
            console.log('✅ SUCCESS: All lap detection tests passed');
        } else {
            console.log('❌ FAILURE: Some lap detection tests failed');
        }
        
        return allTestsPassed;
    }
    
    testLapDetectorInitialization() {
        const track = new Track();
        const lapDetector = new LapDetector(track);
        
        if (!lapDetector || !lapDetector.track) {
            console.log('❌ Lap detector initialization failed');
            return false;
        }
        
        if (lapDetector.cars.size !== 0) {
            console.log('❌ Lap detector should start with no cars');
            return false;
        }
        
        console.log('✅ Lap detector initialization test passed');
        return true;
    }
    
    testForwardLapCrossing() {
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const car = new PlayerCar(new Vector2(400, 150)); // Start at finish line
        
        lapDetector.initializeCar(car);
        
        // Simulate car moving forward across finish line
        // Move car to just before finish line
        car.position = new Vector2(400, 140);
        car.velocity = new Vector2(0, -10); // Moving upward (toward finish line)
        
        const initialLap = lapDetector.getCarLap(car.id);
        let lapTime = 0;
        
        // Move car across finish line
        for (let step = 0; step < 10; step++) {
            lapTime += this.timestep;
            car.position = car.position.add(car.velocity.multiply(this.timestep));
            lapDetector.update(car, this.timestep, lapTime);
        }
        
        const finalLap = lapDetector.getCarLap(car.id);
        
        if (finalLap <= initialLap) {
            console.log('❌ Forward lap crossing detection failed - lap not incremented');
            return false;
        }
        
        console.log('✅ Forward lap crossing detection test passed');
        return true;
    }
    
    testBackwardLapCrossing() {
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const car = new PlayerCar(new Vector2(400, 150)); // Start at finish line
        
        lapDetector.initializeCar(car);
        
        // Simulate car moving backward across finish line
        // Move car to just after finish line
        car.position = new Vector2(400, 160);
        car.velocity = new Vector2(0, 10); // Moving downward (away from finish line, but crossing backward)
        
        const initialLap = lapDetector.getCarLap(car.id);
        let lapTime = 0;
        
        // Move car across finish line in wrong direction
        for (let step = 0; step < 10; step++) {
            lapTime += this.timestep;
            car.position = car.position.add(car.velocity.multiply(this.timestep));
            lapDetector.update(car, this.timestep, lapTime);
        }
        
        const finalLap = lapDetector.getCarLap(car.id);
        
        if (finalLap > initialLap) {
            console.log('❌ Backward lap crossing detection failed - lap incorrectly incremented');
            return false;
        }
        
        console.log('✅ Backward lap crossing rejection test passed');
        return true;
    }
    
    testRaceCompletion() {
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const car = new PlayerCar(new Vector2(400, 150));
        
        lapDetector.initializeCar(car);
        
        // Simulate completing 3 full laps
        let lapTime = 0;
        let currentLap = 0;
        
        // Complete lap 1
        currentLap = this.completeLap(lapDetector, car, lapTime);
        lapTime += 10; // 10 seconds per lap for testing
        
        if (currentLap !== 1) {
            console.log('❌ Race completion test failed - lap 1 not completed');
            return false;
        }
        
        // Complete lap 2
        currentLap = this.completeLap(lapDetector, car, lapTime);
        lapTime += 10;
        
        if (currentLap !== 2) {
            console.log('❌ Race completion test failed - lap 2 not completed');
            return false;
        }
        
        // Complete lap 3 (should trigger race completion)
        currentLap = this.completeLap(lapDetector, car, lapTime);
        lapTime += 10;
        
        if (currentLap !== 3) {
            console.log('❌ Race completion test failed - lap 3 not completed');
            return false;
        }
        
        // Check if race is complete
        const raceComplete = lapDetector.isRaceComplete(car.id, GameConfig.TOTAL_LAPS);
        if (!raceComplete) {
            console.log('❌ Race completion test failed - race not marked as complete after 3 laps');
            return false;
        }
        
        console.log('✅ Race completion test passed');
        return true;
    }
    
    completeLap(lapDetector, car, startTime) {
        // Reset car to start position
        car.position = new Vector2(400, 140);
        car.velocity = new Vector2(0, -10);
        
        let lapTime = startTime;
        
        // Move car across finish line
        for (let step = 0; step < 20; step++) {
            lapTime += this.timestep;
            car.position = car.position.add(car.velocity.multiply(this.timestep));
            lapDetector.update(car, this.timestep, lapTime);
        }
        
        return lapDetector.getCarLap(car.id);
    }
    
    testTimingPrecision() {
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const car = new PlayerCar(new Vector2(400, 150));
        
        lapDetector.initializeCar(car);
        
        // Register callback to capture lap times
        let capturedLapTimes = [];
        lapDetector.registerLapCallback(car.id, (lap, lapTime) => {
            capturedLapTimes.push({ lap, lapTime });
        });
        
        // Simulate completing a lap with precise timing
        let raceTime = 0;
        const expectedLapTime = 15.5; // 15.5 seconds
        
        // Move car around track for expected time
        car.position = new Vector2(400, 140);
        car.velocity = new Vector2(0, -5); // Slow speed for precise timing
        
        // Simulate until we reach expected lap time
        while (raceTime < expectedLapTime) {
            raceTime += this.timestep;
            car.position = car.position.add(car.velocity.multiply(this.timestep));
            lapDetector.update(car, this.timestep, raceTime);
        }
        
        // Force lap completion by moving across finish line
        car.position = new Vector2(400, 130);
        car.velocity = new Vector2(0, -10);
        for (let step = 0; step < 5; step++) {
            raceTime += this.timestep;
            car.position = car.position.add(car.velocity.multiply(this.timestep));
            lapDetector.update(car, this.timestep, raceTime);
        }
        
        if (capturedLapTimes.length === 0) {
            console.log('❌ Timing precision test failed - no lap time captured');
            return false;
        }
        
        const actualLapTime = capturedLapTimes[0].lapTime;
        const timeDifference = Math.abs(actualLapTime - expectedLapTime);
        
        // Allow small tolerance for timing precision
        if (timeDifference > 0.5) {
            console.log(`❌ Timing precision test failed - expected ${expectedLapTime}, got ${actualLapTime}`);
            return false;
        }
        
        console.log('✅ Timing precision test passed');
        return true;
    }
    
    testPositionTracking() {
        const track = new Track();
        const lapDetector = new LapDetector(track);
        
        // Create multiple cars with different lap progress
        const car1 = new PlayerCar(new Vector2(400, 150));
        const car2 = new PlayerCar(new Vector2(400, 150));
        const car3 = new PlayerCar(new Vector2(400, 150));
        
        lapDetector.initializeCar(car1);
        lapDetector.initializeCar(car2);
        lapDetector.initializeCar(car3);
        
        // Simulate different lap progress
        let raceTime = 0;
        
        // Car 1 completes 1 lap
        this.completeLap(lapDetector, car1, raceTime);
        raceTime += 10;
        
        // Car 2 completes 2 laps
        this.completeLap(lapDetector, car2, raceTime);
        raceTime += 10;
        this.completeLap(lapDetector, car2, raceTime);
        raceTime += 10;
        
        // Car 3 completes 0 laps (stays at start)
        
        // Get positions
        const positions = lapDetector.getRacePositions([car1, car2, car3]);
        
        // Should be ordered by lap progress: car2 (2 laps), car1 (1 lap), car3 (0 laps)
        if (positions[0] !== car2.id || positions[1] !== car1.id || positions[2] !== car3.id) {
            console.log('❌ Position tracking test failed - incorrect race order');
            console.log('Expected:', [car2.id, car1.id, car3.id]);
            console.log('Actual:', positions);
            return false;
        }
        
        console.log('✅ Position tracking test passed');
        return true;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.LapDetectionTest = LapDetectionTest;
} else {
    // Node.js environment
    console.log('Lap detection test requires browser environment for proper track initialization');
}

export { LapDetectionTest };