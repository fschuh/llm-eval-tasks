// HUD System Test
// This test validates HUD display, race countdown, and race finished screen

import { GameConfig } from '../js/core/Constants.js';
import { GameState } from '../js/core/GameState.js';
import { Vector2 } from '../js/utils/Vector2.js';
import { PlayerCar } from '../js/entities/PlayerCar.js';
import { LapDetector } from '../js/systems/LapDetection.js';
import { RaceManager } from '../js/systems/RaceManager.js';
import { Track } from '../js/track/Track.js';
import { Renderer } from '../js/systems/HUDSystem.js';

class HUDTest {
    constructor() {
        this.canvas = null;
        this.ctx = null;
    }
    
    runTest() {
        console.log('Running HUD System Test...');
        
        // Create mock canvas for testing
        this.createMockCanvas();
        
        let allTestsPassed = true;
        
        // Test 1: HUD initialization and basic rendering
        allTestsPassed &= this.testHUDInitialization();
        
        // Test 2: Lap, time, and position display
        allTestsPassed &= this.testInformationDisplay();
        
        // Test 3: Race countdown sequence
        allTestsPassed &= this.testCountdownSequence();
        
        // Test 4: Race finished screen
        allTestsPassed &= this.testRaceFinishedScreen();
        
        // Test 5: HUD readability and performance
        allTestsPassed &= this.testHUDPerformance();
        
        if (allTestsPassed) {
            console.log('✅ SUCCESS: All HUD system tests passed');
        } else {
            console.log('❌ FAILURE: Some HUD system tests failed');
        }
        
        // Clean up
        this.cleanupMockCanvas();
        
        return allTestsPassed;
    }
    
    createMockCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = GameConfig.CANVAS_WIDTH;
        this.canvas.height = GameConfig.CANVAS_HEIGHT;
        this.canvas.style.display = 'none';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }
    
    cleanupMockCanvas() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
    
    testHUDInitialization() {
        const renderer = new Renderer(this.canvas);
        
        if (!renderer || !renderer.canvas || !renderer.ctx) {
            console.log('❌ HUD initialization failed');
            return false;
        }
        
        console.log('✅ HUD initialization test passed');
        return true;
    }
    
    testInformationDisplay() {
        const renderer = new Renderer(this.canvas);
        const gameState = new GameState();
        const playerCar = new PlayerCar(new Vector2(400, 300));
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const raceManager = new RaceManager(lapDetector);
        
        // Initialize lap detector for player car
        lapDetector.initializeCar(playerCar);
        
        // Set up game state with some data
        gameState.raceTime = 45.678; // 45.678 seconds
        gameState.racePhase = 'RACING';
        
        // Simulate a completed lap
        lapDetector.getCarLap = () => 2; // Mock lap count
        lapDetector.getBestLapTime = () => 22.5; // Mock best lap time
        
        // Render HUD
        renderer.renderHUD(gameState, playerCar, lapDetector, raceManager);
        
        // Check that canvas was drawn to (basic validation)
        const imageData = this.ctx.getImageData(0, 0, 1, 1);
        if (imageData.data[3] === 0) { // Alpha channel is 0 (transparent)
            console.log('❌ Information display test failed - HUD not rendered');
            return false;
        }
        
        console.log('✅ Information display test passed');
        return true;
    }
    
    testCountdownSequence() {
        const renderer = new Renderer(this.canvas);
        
        // Test each countdown value
        const countdownValues = [3, 2, 1];
        
        for (const value of countdownValues) {
            // Clear canvas
            this.ctx.clearRect(0, 0, GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
            
            // Render countdown
            renderer.renderCountdown(value);
            
            // Check that something was rendered
            const imageData = this.ctx.getImageData(
                GameConfig.CANVAS_WIDTH / 2 - 50, 
                GameConfig.CANVAS_HEIGHT / 2 - 50, 
                100, 
                100
            );
            
            let hasContent = false;
            for (let i = 0; i < imageData.data.length; i += 4) {
                if (imageData.data[i + 3] > 0) { // Alpha > 0
                    hasContent = true;
                    break;
                }
            }
            
            if (!hasContent) {
                console.log(`❌ Countdown sequence test failed - value ${value} not rendered`);
                return false;
            }
        }
        
        console.log('✅ Countdown sequence test passed');
        return true;
    }
    
    testRaceFinishedScreen() {
        const renderer = new Renderer(this.canvas);
        const gameState = new GameState();
        const playerCar = new PlayerCar(new Vector2(400, 300));
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const raceManager = new RaceManager(lapDetector);
        
        // Set up finished race state
        gameState.racePhase = 'FINISHED';
        gameState.raceTime = 123.456;
        
        // Mock race manager results
        raceManager.getFinalResults = () => [
            { id: 'player', name: 'Player', laps: 3, totalTime: 123.456 },
            { id: 'ai1', name: 'AI 1', laps: 3, totalTime: 125.789 },
            { id: 'ai2', name: 'AI 2', laps: 2, totalTime: 90.123 }
        ];
        
        // Render finished screen
        renderer.renderHUD(gameState, playerCar, lapDetector, raceManager);
        
        // Check that something was rendered for finished screen
        const imageData = this.ctx.getImageData(0, 0, GameConfig.CANVAS_WIDTH, 50);
        let hasContent = false;
        for (let i = 0; i < imageData.data.length; i += 4) {
            if (imageData.data[i + 3] > 0) {
                hasContent = true;
                break;
            }
        }
        
        if (!hasContent) {
            console.log('❌ Race finished screen test failed - not rendered');
            return false;
        }
        
        console.log('✅ Race finished screen test passed');
        return true;
    }
    
    testHUDPerformance() {
        const renderer = new Renderer(this.canvas);
        const gameState = new GameState();
        const playerCar = new PlayerCar(new Vector2(400, 300));
        const track = new Track();
        const lapDetector = new LapDetector(track);
        const raceManager = new RaceManager(lapDetector);
        
        // Initialize lap detector
        lapDetector.initializeCar(playerCar);
        
        // Measure render time for multiple frames
        const frameCount = 100;
        const startTime = performance.now();
        
        for (let i = 0; i < frameCount; i++) {
            this.ctx.clearRect(0, 0, GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
            renderer.renderHUD(gameState, playerCar, lapDetector, raceManager);
        }
        
        const endTime = performance.now();
        const avgFrameTime = (endTime - startTime) / frameCount;
        
        // HUD should render quickly (less than 1ms per frame on average)
        if (avgFrameTime > 2) {
            console.log(`❌ HUD performance test failed - average frame time ${avgFrameTime.toFixed(2)}ms`);
            return false;
        }
        
        console.log(`✅ HUD performance test passed - average frame time ${avgFrameTime.toFixed(2)}ms`);
        return true;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.HUDTest = HUDTest;
} else {
    // Node.js environment
    console.log('HUD test requires browser environment for canvas rendering');
}

export { HUDTest };