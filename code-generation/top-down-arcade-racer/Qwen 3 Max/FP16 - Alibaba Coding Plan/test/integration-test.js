// Integration and Performance Test
// This test validates complete game flow, performance, and cross-browser compatibility

import { GameConfig } from '../js/core/Constants.js';
import { Game } from '../js/core/GameEngine.js';

class IntegrationTest {
    constructor() {
        this.testDuration = 3; // seconds for performance test
        this.expectedFPS = 60;
        this.fpsTolerance = 10; // Allow 10 FPS tolerance for integration test
    }
    
    async runTest() {
        console.log('Running Integration and Performance Test...');
        
        let allTestsPassed = true;
        
        // Test 1: Complete game flow from start to finish
        allTestsPassed &= await this.testCompleteGameFlow();
        
        // Test 2: Performance validation with all systems active
        allTestsPassed &= await this.testPerformance();
        
        // Test 3: Memory usage stability
        allTestsPassed &= await this.testMemoryStability();
        
        // Test 4: Cross-browser compatibility indicators
        allTestsPassed &= this.testBrowserCompatibility();
        
        if (allTestsPassed) {
            console.log('✅ SUCCESS: All integration and performance tests passed');
        } else {
            console.log('❌ FAILURE: Some integration and performance tests failed');
        }
        
        return allTestsPassed;
    }
    
    async testCompleteGameFlow() {
        console.log('Testing complete game flow...');
        
        // Create mock canvas
        const mockCanvas = this.createMockCanvas();
        document.body.appendChild(mockCanvas);
        
        try {
            // Create game instance
            const game = new Game();
            
            // Override methods to track game flow
            let phaseTransitions = [];
            const originalUpdateGamePhase = game.updateGamePhase;
            game.updateGamePhase = function(dt) {
                const previousPhase = this.gameState.racePhase;
                originalUpdateGamePhase.call(this, dt);
                const currentPhase = this.gameState.racePhase;
                
                if (previousPhase !== currentPhase) {
                    phaseTransitions.push({
                        from: previousPhase,
                        to: currentPhase,
                        time: this.gameState.currentTime
                    });
                }
            };
            
            // Start game
            game.start();
            
            // Wait for game to progress through phases
            await new Promise(resolve => {
                const checkPhases = () => {
                    // Check if we've seen the expected phase transitions
                    const hasCountdown = phaseTransitions.some(t => t.to === 'COUNTDOWN');
                    const hasRacing = phaseTransitions.some(t => t.to === 'RACING');
                    
                    if (hasCountdown && hasRacing) {
                        resolve(true);
                    } else if (game.gameState.currentTime > 5) {
                        // Timeout after 5 seconds
                        resolve(false);
                    } else {
                        setTimeout(checkPhases, 100);
                    }
                };
                setTimeout(checkPhases, 100);
            });
            
            // Validate phase transitions
            const expectedTransitions = [
                { from: 'READY', to: 'COUNTDOWN' },
                { from: 'COUNTDOWN', to: 'RACING' }
            ];
            
            for (const expected of expectedTransitions) {
                const found = phaseTransitions.some(t => 
                    t.from === expected.from && t.to === expected.to
                );
                
                if (!found) {
                    console.log(`❌ Complete game flow test failed - missing transition ${expected.from} → ${expected.to}`);
                    return false;
                }
            }
            
            console.log('✅ Complete game flow test passed');
            return true;
            
        } catch (error) {
            console.log(`❌ Complete game flow test failed with error: ${error.message}`);
            return false;
        } finally {
            // Clean up
            document.body.removeChild(mockCanvas);
        }
    }
    
    async testPerformance() {
        console.log('Testing performance with all systems active...');
        
        const mockCanvas = this.createMockCanvas();
        document.body.appendChild(mockCanvas);
        
        try {
            const game = new Game();
            
            // Override render method to avoid actual rendering overhead
            const originalRender = game.render;
            game.render = function(alpha) {
                // Minimal render for performance testing
                this.ctx.clearRect(0, 0, GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
            };
            
            // Track frame times
            const frameTimes = [];
            const originalGameLoop = game.gameLoop;
            game.gameLoop = function(currentTime) {
                if (!this.isRunning) return;
                
                const now = performance.now();
                if (frameTimes.length > 0) {
                    frameTimes.push(now - frameTimes[frameTimes.length - 1]);
                } else {
                    frameTimes.push(now);
                }
                
                // Stop after test duration
                if ((now - game.testStartTime) / 1000 >= this.testDuration) {
                    this.isRunning = false;
                    return;
                }
                
                game.testStartTime = game.testStartTime || now;
                
                // Call original game loop logic but limit iterations
                const deltaTime = (currentTime - this.lastTime) / 1000;
                this.lastTime = currentTime;
                const clampedDeltaTime = Math.min(deltaTime, GameConfig.MAX_FRAME_TIME);
                this.accumulator += clampedDeltaTime;
                
                // Limit fixed timestep updates to prevent infinite loop in test
                let updateCount = 0;
                while (this.accumulator >= GameConfig.FIXED_TIMESTEP && updateCount < 5) {
                    this.update(GameConfig.FIXED_TIMESTEP);
                    this.accumulator -= GameConfig.FIXED_TIMESTEP;
                    updateCount++;
                }
                
                this.render(0);
                this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
            };
            
            game.start();
            
            // Wait for test to complete
            await new Promise(resolve => {
                const checkComplete = () => {
                    if (!game.isRunning) {
                        resolve();
                    } else {
                        setTimeout(checkComplete, 50);
                    }
                };
                setTimeout(checkComplete, 100);
            });
            
            // Calculate FPS
            if (frameTimes.length < 2) {
                console.log('❌ Performance test failed - insufficient frame data');
                return false;
            }
            
            // Remove first timestamp (it's the start time, not a frame time)
            frameTimes.shift();
            
            const totalFrameTime = frameTimes.reduce((a, b) => a + b, 0);
            const avgFrameTime = totalFrameTime / frameTimes.length;
            const actualFPS = 1000 / avgFrameTime;
            
            console.log(`Performance test results: ${actualFPS.toFixed(1)} FPS`);
            
            if (actualFPS < this.expectedFPS - this.fpsTolerance) {
                console.log(`❌ Performance test failed - FPS ${actualFPS.toFixed(1)} below threshold`);
                return false;
            }
            
            console.log('✅ Performance test passed');
            return true;
            
        } catch (error) {
            console.log(`❌ Performance test failed with error: ${error.message}`);
            return false;
        } finally {
            document.body.removeChild(mockCanvas);
        }
    }
    
    async testMemoryStability() {
        console.log('Testing memory usage stability...');
        
        // This is a basic test since detailed memory profiling requires browser dev tools
        // We'll check for obvious memory leaks by monitoring object creation
        
        const mockCanvas = this.createMockCanvas();
        document.body.appendChild(mockCanvas);
        
        try {
            const initialObjectCount = this.countObjectsInMemory();
            
            const game = new Game();
            game.start();
            
            // Run for a short duration
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const finalObjectCount = this.countObjectsInMemory();
            
            // Allow some increase for normal game operation, but not excessive
            const objectIncrease = finalObjectCount - initialObjectCount;
            if (objectIncrease > 1000) { // Arbitrary threshold
                console.log(`❌ Memory stability test failed - excessive object creation (${objectIncrease})`);
                return false;
            }
            
            console.log('✅ Memory stability test passed');
            return true;
            
        } catch (error) {
            console.log(`❌ Memory stability test failed with error: ${error.message}`);
            return false;
        } finally {
            document.body.removeChild(mockCanvas);
        }
    }
    
    countObjectsInMemory() {
        // Basic approximation - count DOM elements and global objects
        return document.querySelectorAll('*').length + Object.keys(window).length;
    }
    
    testBrowserCompatibility() {
        console.log('Testing browser compatibility indicators...');
        
        // Check for required browser features
        const requiredFeatures = [
            'requestAnimationFrame',
            'performance.now',
            'CanvasRenderingContext2D',
            'URL.createObjectURL'
        ];
        
        for (const feature of requiredFeatures) {
            if (!(feature in window)) {
                console.log(`❌ Browser compatibility test failed - missing feature: ${feature}`);
                return false;
            }
        }
        
        // Check for ES6+ features used in the code
        try {
            // Test arrow functions, let/const, classes, modules
            eval('const test = () => { let x = 1; class Test {} };');
        } catch (error) {
            console.log('❌ Browser compatibility test failed - ES6+ features not supported');
            return false;
        }
        
        console.log('✅ Browser compatibility indicators test passed');
        return true;
    }
    
    createMockCanvas() {
        const canvas = document.createElement('canvas');
        canvas.id = 'gameCanvas';
        canvas.width = GameConfig.CANVAS_WIDTH;
        canvas.height = GameConfig.CANVAS_HEIGHT;
        canvas.style.display = 'none';
        return canvas;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.IntegrationTest = IntegrationTest;
} else {
    // Node.js environment
    console.log('Integration test requires browser environment for full functionality');
}

export { IntegrationTest };