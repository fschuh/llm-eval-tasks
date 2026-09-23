import { GameState } from './GameState.js';
import { GameConfig, RacePhase } from './Constants.js';
import { InputHandler } from '../systems/InputHandler.js';
import { DeterministicRNG } from '../utils/DeterministicRNG.js';
import { Track } from '../track/Track.js';
import { LapDetector } from '../systems/LapDetection.js';
import { RaceManager } from '../systems/RaceManager.js';
import { Renderer } from '../systems/HUDSystem.js';
import { PlayerCar } from '../entities/PlayerCar.js';
import { AIOpponent } from '../entities/AIOpponent.js';
import { CollisionDetector, CollisionResolver } from '../systems/CollisionSystem.js';
import { Vector2 } from '../utils/Vector2.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameState = new GameState();
        this.inputHandler = new InputHandler();
        this.rng = new DeterministicRNG(GameConfig.SEED);
        this.track = new Track();
        this.lapDetector = new LapDetector(this.track);
        this.raceManager = new RaceManager(this.lapDetector);
        this.renderer = new Renderer(this.canvas);
        
        // Initialize cars with randomized difficulty levels and positions using deterministic RNG
        // Position cars at the start/finish line area
        const startX = 400;
        const startY = 150; // Top of the oval track
        this.playerCar = new PlayerCar(new Vector2(startX, startY));
        
        // Randomize AI difficulty levels using deterministic RNG
        const difficulties = ['EASY', 'MEDIUM', 'HARD'];
        const shuffledDifficulties = [];
        const tempDifficulties = [...difficulties];
        while (tempDifficulties.length > 0) {
            const index = Math.floor(this.rng.next() * tempDifficulties.length);
            shuffledDifficulties.push(tempDifficulties.splice(index, 1)[0]);
        }
        
        // Randomize AI starting positions with small offsets using deterministic RNG
        const positionOffsets = [
            { x: -30 + (this.rng.next() - 0.5) * 20, y: 20 + (this.rng.next() - 0.5) * 10 },
            { x: 30 + (this.rng.next() - 0.5) * 20, y: 20 + (this.rng.next() - 0.5) * 10 },
            { x: 0 + (this.rng.next() - 0.5) * 20, y: 40 + (this.rng.next() - 0.5) * 10 }
        ];
        
        this.aiCars = [
            new AIOpponent('ai1', new Vector2(startX + positionOffsets[0].x, startY + positionOffsets[0].y), shuffledDifficulties[0]),
            new AIOpponent('ai2', new Vector2(startX + positionOffsets[1].x, startY + positionOffsets[1].y), shuffledDifficulties[1]),
            new AIOpponent('ai3', new Vector2(startX + positionOffsets[2].x, startY + positionOffsets[2].y), shuffledDifficulties[2])
        ];
        
        this.allCars = [this.playerCar, ...this.aiCars];
        
        // Initialize lap detector for all cars
        for (const car of this.allCars) {
            this.lapDetector.initializeCar(car);
        }
        
        // Set up lap completion callbacks for notifications
        this.lapDetector.registerLapCallback('player', (lap, lapTime) => {
            if (lap <= GameConfig.TOTAL_LAPS) {
                const minutes = Math.floor(lapTime / 60);
                const seconds = (lapTime % 60).toFixed(3);
                this.renderer.showLapNotification(`LAP ${lap} TIME: ${minutes}:${seconds.padStart(6, '0')}`);
            }
        });
        
        // Game loop variables
        this.lastTime = 0;
        this.accumulator = 0;
        this.isRunning = false;
        this.animationId = null;
    }
    
    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop(performance.now());
        document.getElementById('loading').style.display = 'none';
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
    
    gameLoop(currentTime) {
        if (!this.isRunning) return;
        
        // Update frame time for FPS calculation
        this.gameState.lastFrameTime = this.gameState.currentTime;
        this.gameState.currentTime = currentTime / 1000; // Convert to seconds
        
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;
        
        // Clamp delta time to prevent spiral of death
        const clampedDeltaTime = Math.min(deltaTime, GameConfig.MAX_FRAME_TIME);
        this.accumulator += clampedDeltaTime;
        
        // Fixed timestep updates
        while (this.accumulator >= GameConfig.FIXED_TIMESTEP) {
            this.update(GameConfig.FIXED_TIMESTEP);
            this.accumulator -= GameConfig.FIXED_TIMESTEP;
        }
        
        // Render with interpolation
        const alpha = this.accumulator / GameConfig.FIXED_TIMESTEP;
        this.render(alpha);
        
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    update(dt) {
        this.gameState.frameCount++;
        this.gameState.currentTime += dt;
        
        // Handle input
        if (this.inputHandler.isKeyJustPressed('pause')) {
            this.gameState.isPaused = !this.gameState.isPaused;
        }
        
        if (this.inputHandler.isKeyJustPressed('restart')) {
            this.resetGame();
        }
        
        if (this.gameState.isPaused) {
            this.inputHandler.clear();
            return;
        }
        
        // Update game phase
        this.updateGamePhase(dt);
        
        // Update cars and systems
        if (this.gameState.racePhase === RacePhase.RACING) {
            // Update race time
            this.gameState.raceTime += dt;
            
            // Update player car
            this.playerCar.update(dt, this.inputHandler);
            
            // Update AI cars
            for (const aiCar of this.aiCars) {
                aiCar.update(dt, this.track, this.allCars, this.rng);
            }
            
            // Handle car-to-car collisions
            this.handleCarCollisions();
            
            // Check track collisions and apply physics responses
            for (const car of this.allCars) {
                if (this.track.checkCarCollision(car)) {
                    // Car is off track - apply penalty
                    car.velocity = car.velocity.multiply(0.92); // Reduce speed
                    car.isOnTrack = false;
                } else {
                    car.isOnTrack = true;
                }
            }
            
            // Update lap detection for all cars
            for (const car of this.allCars) {
                this.lapDetector.update(car, dt, this.gameState.raceTime);
            }
            
            // Update race management
            this.raceManager.update(this.gameState.raceTime, this.allCars);
            
            // Update renderer notifications
            this.renderer.updateNotifications(dt);
        }
        
        this.inputHandler.clear();
    }
    
    handleCarCollisions() {
        // Reset collision count for this frame
        this.gameState.collisionCount = 0;
        let playerInvolvedInCollision = false;
        
        // Initialize collision resolver
        const resolver = new CollisionResolver();
        
        // For multiple simultaneous collisions, use iterative resolution
        // This helps handle complex multi-car pileups more stably
        const maxIterations = 2; // Reduced iterations for performance
        const collisions = [];
        
        // Collect all collisions with spatial optimization
        for (let i = 0; i < this.allCars.length; i++) {
            const car1 = this.allCars[i];
            if (!car1) continue;
            
            for (let j = i + 1; j < this.allCars.length; j++) {
                const car2 = this.allCars[j];
                if (!car2) continue;
                
                // Quick distance check for early exit
                const distance = Vector2.distance(car1.position, car2.position);
                const minDistance = (car1.width + car2.width) / 2;
                if (distance > minDistance * 2) { // Only check if reasonably close
                    continue;
                }
                
                // Detect collision
                const collision = CollisionDetector.checkCarCarCollision(car1, car2);
                if (collision) {
                    collisions.push(collision);
                    this.gameState.collisionCount++;
                    // Check if player is involved
                    if (car1.id === 'player' || car2.id === 'player') {
                        playerInvolvedInCollision = true;
                    }
                }
            }
        }
        
        // Resolve collisions iteratively for better stability
        for (let iter = 0; iter < maxIterations; iter++) {
            let resolvedAny = false;
            for (const collision of collisions) {
                // Re-check collision after previous resolutions
                const recheckedCollision = CollisionDetector.checkCarCarCollision(
                    collision.entity1,
                    collision.entity2
                );
                if (recheckedCollision) {
                    resolver.resolveCarCarCollision(
                        recheckedCollision.entity1,
                        recheckedCollision.entity2,
                        recheckedCollision
                    );
                    resolvedAny = true;
                }
            }
            // Early exit if no collisions remain
            if (!resolvedAny) break;
        }
        
        // Show collision notification if player was involved
        if (playerInvolvedInCollision) {
            this.renderer.showCollisionNotification();
        }
    }
    
    updateGamePhase(dt) {
        switch (this.gameState.racePhase) {
            case RacePhase.READY:
                this.gameState.racePhase = RacePhase.COUNTDOWN;
                this.gameState.countdownValue = 3;
                break;
                
            case RacePhase.COUNTDOWN:
                this.gameState.countdownValue -= dt;
                if (this.gameState.countdownValue <= 0) {
                    this.gameState.racePhase = RacePhase.RACING;
                    this.gameState.raceTime = 0;
                    this.raceManager.startRace(performance.now() / 1000);
                }
                break;
                
            case RacePhase.RACING:
                // Check if race is complete
                if (this.raceManager.raceComplete) {
                    this.gameState.racePhase = RacePhase.FINISHED;
                }
                break;
        }
    }
    
    render(alpha) {
        this.renderer.clear();
        
        // Render track
        this.renderer.renderTrack(this.track);
        
        // Render cars
        this.renderer.renderCar(this.playerCar, true);
        for (const aiCar of this.aiCars) {
            this.renderer.renderCar(aiCar, false);
        }
        
        // Render HUD
        this.renderer.renderHUD(this.gameState, this.playerCar, this.lapDetector, this.raceManager);
        
        // Render countdown
        if (this.gameState.racePhase === RacePhase.COUNTDOWN) {
            this.renderer.renderCountdown(Math.ceil(this.gameState.countdownValue));
        }
    }
    
    resetGame() {
        this.gameState.reset();
        this.playerCar = new PlayerCar(new Vector2(400, 300));
        
        // Randomize AI difficulty levels using deterministic RNG (after reset)
        const difficulties = ['EASY', 'MEDIUM', 'HARD'];
        const shuffledDifficulties = [];
        const tempDifficulties = [...difficulties];
        while (tempDifficulties.length > 0) {
            const index = Math.floor(this.rng.next() * tempDifficulties.length);
            shuffledDifficulties.push(tempDifficulties.splice(index, 1)[0]);
        }
        
        // Randomize AI starting positions with small offsets using deterministic RNG
        const positionOffsets = [
            { x: 0 + (this.rng.next() - 0.5) * 20, y: 20 + (this.rng.next() - 0.5) * 10 },
            { x: 0 + (this.rng.next() - 0.5) * 20, y: 40 + (this.rng.next() - 0.5) * 10 },
            { x: 0 + (this.rng.next() - 0.5) * 20, y: 60 + (this.rng.next() - 0.5) * 10 }
        ];
        
        this.aiCars = [
            new AIOpponent('ai1', new Vector2(400 + positionOffsets[0].x, 300 + positionOffsets[0].y), shuffledDifficulties[0]),
            new AIOpponent('ai2', new Vector2(400 + positionOffsets[1].x, 300 + positionOffsets[1].y), shuffledDifficulties[1]),
            new AIOpponent('ai3', new Vector2(400 + positionOffsets[2].x, 300 + positionOffsets[2].y), shuffledDifficulties[2])
        ];
        this.allCars = [this.playerCar, ...this.aiCars];
        this.lapDetector = new LapDetector(this.track);
        this.raceManager = new RaceManager(this.lapDetector);
        this.rng.reset();
        this.accumulator = 0;
        
        // Reinitialize lap detector for all cars
        for (const car of this.allCars) {
            this.lapDetector.initializeCar(car);
        }
        
        // Re-register lap callbacks
        this.lapDetector.registerLapCallback('player', (lap, lapTime) => {
            if (lap <= GameConfig.TOTAL_LAPS) {
                const minutes = Math.floor(lapTime / 60);
                const seconds = (lapTime % 60).toFixed(3);
                this.renderer.showLapNotification(`LAP ${lap} TIME: ${minutes}:${seconds.padStart(6, '0')}`);
            }
        });
    }
}

// Game initialization
window.addEventListener('load', () => {
    const game = new Game();
    game.start();
});