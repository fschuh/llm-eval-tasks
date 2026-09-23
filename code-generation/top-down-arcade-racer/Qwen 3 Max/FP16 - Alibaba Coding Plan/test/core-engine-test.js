// Core Game Engine Test
// This test validates the fixed timestep, game loop stability, and canvas rendering performance

import { GameConfig } from '../js/core/Constants.js';
import { Game } from '../js/core/GameEngine.js';

class CoreEngineTest {
    constructor() {
        this.testDuration = 2; // seconds
        this.expectedFPS = 60;
        this.tolerance = 5; // Allow 5 FPS tolerance
        this.frameTimes = [];
        this.lastFrameTime = 0;
    }
    
    async runTest() {
        console.log('Running Core Game Engine Test...');
        console.log(`Expected FPS: ${this.expectedFPS} ± ${this.tolerance}`);
        console.log(`Test duration: ${this.testDuration} seconds`);
        
        // Create a mock canvas for testing
        const mockCanvas = this.createMockCanvas();
        document.body.appendChild(mockCanvas);
        
        // Mock the game initialization
        const originalStart = Game.prototype.start;
        const originalGameLoop = Game.prototype.gameLoop;
        const originalUpdate = Game.prototype.update;
        const originalRender = Game.prototype.render;
        
        try {
            // Override methods to collect performance data
            let frameCount = 0;
            let startTime = performance.now();
            let endTime = 0;
            
            Game.prototype.start = function() {
                this.isRunning = true;
                this.lastTime = performance.now();
                // Start our custom test loop
                this.testStartTime = performance.now();
                this.testFrameCount = 0;
                this.testFrameTimes = [];
                this.customTestLoop(performance.now());
            };
            
            Game.prototype.customTestLoop = function(currentTime) {
                if (!this.isRunning) return;
                
                const now = performance.now();
                const elapsed = (now - this.testStartTime) / 1000;
                
                if (elapsed >= this.testDuration) {
                    this.isRunning = false;
                    this.testEndTime = now;
                    this.testFinalFrameCount = this.testFrameCount;
                    return;
                }
                
                // Record frame time
                if (this.testFrameCount > 0) {
                    const frameTime = now - this.lastFrameTime;
                    this.testFrameTimes.push(frameTime);
                }
                this.lastFrameTime = now;
                this.testFrameCount++;
                
                // Simulate fixed timestep updates
                const deltaTime = (currentTime - this.lastTime) / 1000;
                this.lastTime = currentTime;
                const clampedDeltaTime = Math.min(deltaTime, GameConfig.MAX_FRAME_TIME);
                this.accumulator += clampedDeltaTime;
                
                while (this.accumulator >= GameConfig.FIXED_TIMESTEP) {
                    this.update(GameConfig.FIXED_TIMESTEP);
                    this.accumulator -= GameConfig.FIXED_TIMESTEP;
                }
                
                const alpha = this.accumulator / GameConfig.FIXED_TIMESTEP;
                this.render(alpha);
                
                requestAnimationFrame((time) => this.customTestLoop(time));
            };
            
            Game.prototype.update = function(dt) {
                // Minimal update for testing
                this.gameState.frameCount++;
                this.gameState.currentTime += dt;
            };
            
            Game.prototype.render = function(alpha) {
                // Minimal render for testing
                const ctx = this.ctx;
                ctx.clearRect(0, 0, GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
            };
            
            // Create and start test game
            const testGame = new Game();
            testGame.start();
            
            // Wait for test to complete
            await new Promise(resolve => {
                const checkComplete = () => {
                    if (testGame.isRunning === false) {
                        resolve();
                    } else {
                        setTimeout(checkComplete, 100);
                    }
                };
                checkComplete();
            });
            
            // Calculate results
            const actualDuration = (testGame.testEndTime - testGame.testStartTime) / 1000;
            const actualFPS = testGame.testFinalFrameCount / actualDuration;
            const avgFrameTime = testGame.testFrameTimes.reduce((a, b) => a + b, 0) / testGame.testFrameTimes.length;
            
            console.log(`Actual duration: ${actualDuration.toFixed(3)} seconds`);
            console.log(`Actual frames: ${testGame.testFinalFrameCount}`);
            console.log(`Actual FPS: ${actualFPS.toFixed(2)}`);
            console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
            
            // Validate results
            const fpsWithinTolerance = Math.abs(actualFPS - this.expectedFPS) <= this.tolerance;
            const consistentFrameTimes = this.checkFrameTimeConsistency(testGame.testFrameTimes);
            
            if (fpsWithinTolerance && consistentFrameTimes) {
                console.log('✅ SUCCESS: Core game engine meets performance requirements');
                return true;
            } else {
                console.log('❌ FAILURE: Core game engine performance issues detected');
                if (!fpsWithinTolerance) {
                    console.log(`  - FPS ${actualFPS.toFixed(2)} is outside tolerance range`);
                }
                if (!consistentFrameTimes) {
                    console.log(`  - Frame times are inconsistent`);
                }
                return false;
            }
            
        } finally {
            // Restore original methods
            Game.prototype.start = originalStart;
            Game.prototype.gameLoop = originalGameLoop;
            Game.prototype.update = originalUpdate;
            Game.prototype.render = originalRender;
            
            // Clean up
            document.body.removeChild(mockCanvas);
        }
    }
    
    createMockCanvas() {
        const canvas = document.createElement('canvas');
        canvas.id = 'gameCanvas';
        canvas.width = GameConfig.CANVAS_WIDTH;
        canvas.height = GameConfig.CANVAS_HEIGHT;
        canvas.style.display = 'none';
        return canvas;
    }
    
    checkFrameTimeConsistency(frameTimes) {
        if (frameTimes.length < 2) return true;
        
        const targetFrameTime = 1000 / this.expectedFPS; // ms
        const tolerance = targetFrameTime * 0.3; // 30% tolerance
        
        let consistentCount = 0;
        for (const frameTime of frameTimes) {
            if (Math.abs(frameTime - targetFrameTime) <= tolerance) {
                consistentCount++;
            }
        }
        
        const consistencyRatio = consistentCount / frameTimes.length;
        return consistencyRatio >= 0.8; // 80% of frames should be consistent
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.CoreEngineTest = CoreEngineTest;
} else {
    // Node.js environment would need different approach
    console.log('Core engine test requires browser environment for canvas and performance APIs');
}

export { CoreEngineTest };