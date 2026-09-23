// Player Car Physics Test
// This test validates acceleration, braking, steering, and collision detection

import { GameConfig } from '../js/core/Constants.js';
import { Vector2 } from '../js/utils/Vector2.js';
import { PlayerCar } from '../js/entities/PlayerCar.js';
import { InputHandler } from '../js/systems/InputHandler.js';
import { Track } from '../js/track/Track.js';

class PlayerCarTest {
    constructor() {
        this.testDuration = 1; // seconds
        this.timestep = GameConfig.FIXED_TIMESTEP;
        this.steps = Math.floor(this.testDuration / this.timestep);
    }
    
    runTest() {
        console.log('Running Player Car Physics Test...');
        
        let allTestsPassed = true;
        
        // Test 1: Basic car initialization
        allTestsPassed &= this.testCarInitialization();
        
        // Test 2: Acceleration and braking
        allTestsPassed &= this.testAccelerationBraking();
        
        // Test 3: Steering responsiveness
        allTestsPassed &= this.testSteering();
        
        // Test 4: Physics behavior (momentum, friction, max speed)
        allTestsPassed &= this.testPhysicsBehavior();
        
        // Test 5: Track boundary collision detection
        allTestsPassed &= this.testTrackCollision();
        
        if (allTestsPassed) {
            console.log('✅ SUCCESS: All player car physics tests passed');
        } else {
            console.log('❌ FAILURE: Some player car physics tests failed');
        }
        
        return allTestsPassed;
    }
    
    testCarInitialization() {
        const startPosition = new Vector2(400, 300);
        const car = new PlayerCar(startPosition);
        
        if (car.position.x !== 400 || car.position.y !== 300) {
            console.log('❌ Car initialization position failed');
            return false;
        }
        
        if (car.velocity.x !== 0 || car.velocity.y !== 0) {
            console.log('❌ Car initialization velocity failed');
            return false;
        }
        
        if (car.angle !== 0) {
            console.log('❌ Car initialization angle failed');
            return false;
        }
        
        console.log('✅ Car initialization test passed');
        return true;
    }
    
    testAccelerationBraking() {
        const car = new PlayerCar(new Vector2(400, 300));
        const inputHandler = new InputHandler();
        
        // Test acceleration
        inputHandler.keys.w = true;
        for (let i = 0; i < 10; i++) {
            car.update(this.timestep, inputHandler);
            inputHandler.clear();
        }
        
        if (car.velocity.magnitude() <= 0) {
            console.log('❌ Acceleration test failed - no velocity increase');
            return false;
        }
        
        const initialSpeed = car.velocity.magnitude();
        
        // Test braking
        inputHandler.keys.s = true;
        for (let i = 0; i < 10; i++) {
            car.update(this.timestep, inputHandler);
            inputHandler.clear();
        }
        
        const finalSpeed = car.velocity.magnitude();
        if (finalSpeed >= initialSpeed) {
            console.log('❌ Braking test failed - speed did not decrease');
            return false;
        }
        
        console.log('✅ Acceleration and braking test passed');
        return true;
    }
    
    testSteering() {
        const car = new PlayerCar(new Vector2(400, 300));
        const inputHandler = new InputHandler();
        
        // Apply acceleration and steering
        inputHandler.keys.w = true;
        inputHandler.keys.a = true; // Left steering
        
        const initialAngle = car.angle;
        for (let i = 0; i < 20; i++) {
            car.update(this.timestep, inputHandler);
            inputHandler.clear();
            inputHandler.keys.w = true;
            inputHandler.keys.a = true;
        }
        
        if (car.angle === initialAngle) {
            console.log('❌ Steering test failed - angle did not change');
            return false;
        }
        
        // Test right steering
        inputHandler.keys.d = true;
        inputHandler.keys.a = false;
        const leftTurnAngle = car.angle;
        for (let i = 0; i < 20; i++) {
            car.update(this.timestep, inputHandler);
            inputHandler.clear();
            inputHandler.keys.w = true;
            inputHandler.keys.d = true;
        }
        
        if (car.angle === leftTurnAngle) {
            console.log('❌ Right steering test failed - angle did not change');
            return false;
        }
        
        console.log('✅ Steering responsiveness test passed');
        return true;
    }
    
    testPhysicsBehavior() {
        const car = new PlayerCar(new Vector2(400, 300));
        const inputHandler = new InputHandler();
        
        // Test max speed limit
        inputHandler.keys.w = true;
        for (let i = 0; i < 100; i++) { // Long enough to reach max speed
            car.update(this.timestep, inputHandler);
            inputHandler.clear();
            inputHandler.keys.w = true;
        }
        
        const maxSpeed = car.velocity.magnitude();
        // Max speed should be reasonable (not infinite)
        if (maxSpeed > 200 || maxSpeed < 10) {
            console.log(`❌ Max speed test failed - speed ${maxSpeed} is unreasonable`);
            return false;
        }
        
        // Test momentum/friction when no input
        inputHandler.clear();
        const speedBeforeCoast = car.velocity.magnitude();
        for (let i = 0; i < 30; i++) {
            car.update(this.timestep, inputHandler);
        }
        const speedAfterCoast = car.velocity.magnitude();
        
        if (speedAfterCoast >= speedBeforeCoast) {
            console.log('❌ Friction test failed - speed did not decrease when coasting');
            return false;
        }
        
        console.log('✅ Physics behavior test passed');
        return true;
    }
    
    testTrackCollision() {
        const track = new Track();
        const car = new PlayerCar(new Vector2(400, 300));
        
        // Test car on track (should be on track)
        const onTrack = !track.checkCarCollision(car);
        if (!onTrack) {
            console.log('❌ Track collision test failed - car on track detected as off track');
            return false;
        }
        
        // Move car far off track
        car.position = new Vector2(1000, 1000);
        const offTrack = track.checkCarCollision(car);
        if (!offTrack) {
            console.log('❌ Track collision test failed - car off track not detected');
            return false;
        }
        
        console.log('✅ Track boundary collision detection test passed');
        return true;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.PlayerCarTest = PlayerCarTest;
} else {
    // Node.js environment
    console.log('Player car test requires browser environment for proper input handling');
}

export { PlayerCarTest };