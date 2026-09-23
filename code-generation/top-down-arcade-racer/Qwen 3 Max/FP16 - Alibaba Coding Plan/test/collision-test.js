// Collision Response Test
// This test validates car-to-car collision detection, impulse resolution, and visual feedback

import { GameConfig } from '../js/core/Constants.js';
import { Vector2 } from '../js/utils/Vector2.js';
import { PlayerCar } from '../js/entities/PlayerCar.js';
import { AIOpponent } from '../js/entities/AIOpponent.js';
import { CollisionDetector, CollisionResolver } from '../js/systems/CollisionSystem.js';

class CollisionTest {
    constructor() {
        this.timestep = GameConfig.FIXED_TIMESTEP;
    }
    
    runTest() {
        console.log('Running Collision Response Test...');
        
        let allTestsPassed = true;
        
        // Test 1: Basic collision detection
        allTestsPassed &= this.testCollisionDetection();
        
        // Test 2: Impulse resolution physics
        allTestsPassed &= this.testImpulseResolution();
        
        // Test 3: Momentum transfer validation
        allTestsPassed &= this.testMomentumTransfer();
        
        // Test 4: Car separation after collision
        allTestsPassed &= this.testCarSeparation();
        
        // Test 5: Multiple simultaneous collisions
        allTestsPassed &= this.testMultipleCollisions();
        
        if (allTestsPassed) {
            console.log('✅ SUCCESS: All collision response tests passed');
        } else {
            console.log('❌ FAILURE: Some collision response tests failed');
        }
        
        return allTestsPassed;
    }
    
    testCollisionDetection() {
        const car1 = new PlayerCar(new Vector2(400, 300));
        const car2 = new AIOpponent('ai1', new Vector2(400, 300), 'MEDIUM'); // Same position
        
        // Cars should collide when at same position
        const collision = CollisionDetector.checkCarCarCollision(car1, car2);
        
        if (!collision) {
            console.log('❌ Collision detection test failed - cars at same position not detected as colliding');
            return false;
        }
        
        // Cars far apart should not collide
        car2.position = new Vector2(1000, 1000);
        const noCollision = CollisionDetector.checkCarCarCollision(car1, car2);
        
        if (noCollision) {
            console.log('❌ Collision detection test failed - distant cars incorrectly detected as colliding');
            return false;
        }
        
        console.log('✅ Collision detection test passed');
        return true;
    }
    
    testImpulseResolution() {
        const car1 = new PlayerCar(new Vector2(400, 300));
        const car2 = new AIOpponent('ai1', new Vector2(400, 300), 'MEDIUM');
        
        // Set initial velocities
        car1.velocity = new Vector2(10, 0); // Moving right
        car2.velocity = new Vector2(-5, 0); // Moving left
        
        const initialVelocity1 = car1.velocity.clone();
        const initialVelocity2 = car2.velocity.clone();
        
        // Detect collision
        const collision = CollisionDetector.checkCarCarCollision(car1, car2);
        if (!collision) {
            console.log('❌ Impulse resolution test failed - no collision detected');
            return false;
        }
        
        // Resolve collision
        const resolver = new CollisionResolver();
        resolver.resolveCarCarCollision(car1, car2, collision);
        
        // Velocities should change after collision
        if (car1.velocity.equals(initialVelocity1) && car2.velocity.equals(initialVelocity2)) {
            console.log('❌ Impulse resolution test failed - velocities unchanged after collision');
            return false;
        }
        
        console.log('✅ Impulse resolution test passed');
        return true;
    }
    
    testMomentumTransfer() {
        const car1 = new PlayerCar(new Vector2(400, 300));
        const car2 = new AIOpponent('ai1', new Vector2(400, 300), 'MEDIUM');
        
        // Make car1 much faster than car2
        car1.velocity = new Vector2(20, 0);
        car2.velocity = new Vector2(0, 0); // Stationary
        
        const initialMomentum = car1.velocity.multiply(car1.mass).add(car2.velocity.multiply(car2.mass));
        
        // Resolve collision
        const collision = CollisionDetector.checkCarCarCollision(car1, car2);
        const resolver = new CollisionResolver();
        resolver.resolveCarCarCollision(car1, car2, collision);
        
        const finalMomentum = car1.velocity.multiply(car1.mass).add(car2.velocity.multiply(car2.mass));
        
        // Momentum should be approximately conserved (allow small tolerance for numerical precision)
        const momentumDifference = Vector2.distance(initialMomentum, finalMomentum);
        if (momentumDifference > 0.1) {
            console.log(`❌ Momentum transfer test failed - momentum not conserved (${momentumDifference})`);
            return false;
        }
        
        // Stationary car should now be moving
        if (car2.velocity.magnitude() < 1) {
            console.log('❌ Momentum transfer test failed - stationary car not moving after collision');
            return false;
        }
        
        console.log('✅ Momentum transfer test passed');
        return true;
    }
    
    testCarSeparation() {
        const car1 = new PlayerCar(new Vector2(400, 300));
        const car2 = new AIOpponent('ai1', new Vector2(400, 300), 'MEDIUM');
        
        // Cars start at same position (overlapping)
        const initialDistance = Vector2.distance(car1.position, car2.position);
        if (initialDistance > 1) {
            console.log('❌ Car separation test setup failed - cars not overlapping initially');
            return false;
        }
        
        // Resolve collision
        const collision = CollisionDetector.checkCarCarCollision(car1, car2);
        const resolver = new CollisionResolver();
        resolver.resolveCarCarCollision(car1, car2, collision);
        
        const finalDistance = Vector2.distance(car1.position, car2.position);
        const minSeparation = (car1.width + car2.width) / 2;
        
        // Cars should be separated by at least their combined radius
        if (finalDistance < minSeparation * 0.9) { // Allow small tolerance
            console.log(`❌ Car separation test failed - cars still overlapping (${finalDistance} < ${minSeparation})`);
            return false;
        }
        
        console.log('✅ Car separation test passed');
        return true;
    }
    
    testMultipleCollisions() {
        // Create three cars in a line to test multiple simultaneous collisions
        const car1 = new PlayerCar(new Vector2(400, 300));
        const car2 = new AIOpponent('ai1', new Vector2(400, 300), 'MEDIUM');
        const car3 = new AIOpponent('ai2', new Vector2(400, 300), 'MEDIUM');
        
        // Set different velocities
        car1.velocity = new Vector2(10, 0);
        car2.velocity = new Vector2(0, 0);
        car3.velocity = new Vector2(-5, 0);
        
        const allCars = [car1, car2, car3];
        const resolver = new CollisionResolver();
        const collisions = [];
        
        // Detect all collisions
        for (let i = 0; i < allCars.length; i++) {
            for (let j = i + 1; j < allCars.length; j++) {
                const collision = CollisionDetector.checkCarCarCollision(allCars[i], allCars[j]);
                if (collision) {
                    collisions.push(collision);
                }
            }
        }
        
        if (collisions.length < 2) {
            console.log('❌ Multiple collisions test failed - expected at least 2 collisions');
            return false;
        }
        
        // Resolve collisions iteratively (as done in game engine)
        const maxIterations = 2;
        for (let iter = 0; iter < maxIterations; iter++) {
            for (const collision of collisions) {
                resolver.resolveCarCarCollision(collision.entity1, collision.entity2, collision);
            }
        }
        
        // Check that all cars have moved apart
        const distance12 = Vector2.distance(car1.position, car2.position);
        const distance13 = Vector2.distance(car1.position, car3.position);
        const distance23 = Vector2.distance(car2.position, car3.position);
        const minSeparation = (car1.width + car2.width) / 2;
        
        if (distance12 < minSeparation * 0.8 || 
            distance13 < minSeparation * 0.8 || 
            distance23 < minSeparation * 0.8) {
            console.log('❌ Multiple collisions test failed - cars not properly separated');
            return false;
        }
        
        console.log('✅ Multiple simultaneous collisions test passed');
        return true;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.CollisionTest = CollisionTest;
} else {
    // Node.js environment
    console.log('Collision test requires browser environment for proper car initialization');
}

export { CollisionTest };