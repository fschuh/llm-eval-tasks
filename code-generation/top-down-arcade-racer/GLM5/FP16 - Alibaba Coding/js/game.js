import { SeededRNG } from './utils/rng.js';
import { Vector2D } from './utils/vector2d.js';
import { Track } from './entities/track.js';
import { Car } from './entities/car.js';
import { PlayerController } from './controllers/playerController.js';
import { AIController } from './controllers/aiController.js';
import { CollisionSystem } from './physics/collision.js';
import { LapDetector } from './ui/lapDetector.js';
import { HUD } from './ui/hud.js';

/**
 * Game States
 */
const GameState = {
    COUNTDOWN: 'countdown',
    RACING: 'racing',
    FINISHED: 'finished'
};

/**
 * Main Game class - Orchestrates all game systems
 */
export class Game {
    /**
     * @param {HTMLCanvasElement} canvas - Game canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Game configuration
        this.width = canvas.width;
        this.height = canvas.height;
        this.totalLaps = 3;
        this.seed = 12345; // Deterministic seed
        
        // Fixed timestep
        this.fixedDeltaTime = 1 / 60; // 60 FPS physics
        this.accumulator = 0;
        this.lastTime = 0;
        
        // Initialize systems
        this.rng = new SeededRNG(this.seed);
        this.track = new Track(this.width, this.height);
        this.collisionSystem = new CollisionSystem();
        this.lapDetector = new LapDetector(this.track, this.totalLaps);
        this.hud = new HUD(this.width, this.height);
        
        // Game entities
        this.cars = [];
        this.player = null;
        this.playerController = null;
        this.aiControllers = [];
        
        // Game state
        this.state = GameState.COUNTDOWN;
        this.raceTime = 0;
        this.countdownTime = 3;
        this.countdownTimer = 0;
        
        // Debug mode
        this.debugMode = false;
        
        // UI elements
        this.countdownOverlay = document.getElementById('countdown-overlay');
        this.countdownText = document.getElementById('countdown-text');
        this.finishOverlay = document.getElementById('finish-overlay');
        this.finishPosition = document.getElementById('finish-position');
        this.finishTime = document.getElementById('finish-time');
        this.restartBtn = document.getElementById('restart-btn');
        
        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
        
        // Setup restart button
        if (this.restartBtn) {
            this.restartBtn.addEventListener('click', () => this.restart());
        }
        
        // Initialize game
        this.init();
    }

    /**
     * Initialize game entities
     */
    init() {
        // Create cars
        this.cars = [];
        this.aiControllers = [];
        
        // Car colors
        const colors = ['#ff4444', '#4488ff', '#44ff44', '#ffaa00'];
        
        // Create player car (car 1, pole position)
        this.player = new Car(1, colors[0], true);
        this.cars.push(this.player);
        
        // Create AI cars
        for (let i = 0; i < 3; i++) {
            const car = new Car(i + 2, colors[i + 1], false);
            this.cars.push(car);
        }
        
        // Set starting positions
        for (let i = 0; i < this.cars.length; i++) {
            const startPos = this.track.getStartPosition(i);
            this.cars[i].reset(
                new Vector2D(startPos.x, startPos.y),
                startPos.angle
            );
            // Set initial checkpoint
            this.cars[i].lastCheckpoint = this.lapDetector.startLineIndex - 1;
            if (this.cars[i].lastCheckpoint < 0) {
                this.cars[i].lastCheckpoint = this.lapDetector.checkpoints.length - 1;
            }
        }
        
        // Create player controller
        this.playerController = new PlayerController();
        
        // Create AI controllers
        for (let i = 1; i < this.cars.length; i++) {
            this.aiControllers.push(new AIController(
                this.cars[i], 
                this.track, 
                this.rng
            ));
        }
        
        // Reset game state
        this.state = GameState.COUNTDOWN;
        this.raceTime = 0;
        this.countdownTimer = 0;
        this.rng.reset(this.seed);
        
        // Update UI
        if (this.countdownOverlay) {
            this.countdownOverlay.classList.remove('hidden');
        }
        if (this.finishOverlay) {
            this.finishOverlay.classList.add('hidden');
        }
    }

    /**
     * Start the game loop
     */
    start() {
        this.lastTime = performance.now();
        requestAnimationFrame(this.gameLoop);
    }

    /**
     * Main game loop with fixed timestep
     * @param {number} timestamp - Current timestamp
     */
    gameLoop(timestamp) {
        // Calculate frame time
        const frameTime = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;
        
        // Accumulate time
        this.accumulator += frameTime;
        
        // Fixed timestep updates
        while (this.accumulator >= this.fixedDeltaTime) {
            this.update(this.fixedDeltaTime);
            this.accumulator -= this.fixedDeltaTime;
        }
        
        // Render with interpolation alpha
        const alpha = this.accumulator / this.fixedDeltaTime;
        this.render(alpha);
        
        // Continue loop
        requestAnimationFrame(this.gameLoop);
    }

    /**
     * Update game state (fixed timestep)
     * @param {number} dt - Delta time
     */
    update(dt) {
        switch (this.state) {
            case GameState.COUNTDOWN:
                this.updateCountdown(dt);
                break;
            case GameState.RACING:
                this.updateRacing(dt);
                break;
            case GameState.FINISHED:
                // Nothing to update
                break;
        }
    }

    /**
     * Update countdown state
     * @param {number} dt - Delta time
     */
    updateCountdown(dt) {
        this.countdownTimer += dt;
        
        const remaining = Math.ceil(this.countdownTime - this.countdownTimer);
        
        // Update countdown display
        if (this.countdownText) {
            if (remaining > 0) {
                this.countdownText.textContent = remaining.toString();
            } else {
                this.countdownText.textContent = 'GO!';
            }
        }
        
        // Transition to racing
        if (this.countdownTimer >= this.countdownTime + 0.5) {
            this.state = GameState.RACING;
            if (this.countdownOverlay) {
                this.countdownOverlay.classList.add('hidden');
            }
        }
    }

    /**
     * Update racing state
     * @param {number} dt - Delta time
     */
    updateRacing(dt) {
        // Update race time
        this.raceTime += dt;
        
        // Update player
        this.playerController.update(this.player, dt);
        
        // Update AI controllers
        for (const aiController of this.aiControllers) {
            aiController.update(dt);
        }
        
        // Update car physics
        for (const car of this.cars) {
            car.update(dt);
        }
        
        // Handle collisions
        this.collisionSystem.update(this.cars, this.track, dt);
        
        // Update lap detection
        this.lapDetector.update(this.cars, this.raceTime);
        
        // Calculate positions
        const sortedCars = this.lapDetector.calculatePositions(this.cars);
        
        // Check if race is finished (player completed all laps)
        if (this.player.finished) {
            this.finishRace();
        }
    }

    /**
     * Finish the race
     */
    finishRace() {
        this.state = GameState.FINISHED;
        
        // Calculate final positions
        this.lapDetector.calculatePositions(this.cars);
        
        // Show finish overlay
        if (this.finishOverlay) {
            this.finishOverlay.classList.remove('hidden');
            
            const suffix = this.getOrdinalSuffix(this.player.position);
            this.finishPosition.textContent = `You finished ${this.player.position}${suffix}!`;
            this.finishTime.textContent = `Time: ${this.formatTime(this.player.finishTime)}`;
        }
    }

    /**
     * Restart the race
     */
    restart() {
        // Reset RNG for deterministic behavior
        this.rng.reset(this.seed);
        
        // Reinitialize
        this.init();
        
        // Reset AI controllers
        for (const aiController of this.aiControllers) {
            aiController.reset();
        }
    }

    /**
     * Render the game
     * @param {number} alpha - Interpolation factor (0-1)
     */
    render(alpha) {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Render track
        this.track.render(this.ctx, this.debugMode);
        
        // Render cars (sorted by Y for pseudo-3D effect)
        const sortedCars = [...this.cars].sort((a, b) => a.position.y - b.position.y);
        for (const car of sortedCars) {
            car.render(this.ctx);
        }
        
        // Render HUD
        const gameState = {
            player: this.player,
            cars: this.cars,
            raceTime: this.raceTime,
            totalLaps: this.totalLaps,
            gameState: this.state,
            lapProgress: this.lapDetector.getLapProgress(this.player)
        };
        this.hud.render(this.ctx, gameState);
        
        // Render debug info
        if (this.debugMode) {
            this.renderDebug(alpha);
        }
    }

    /**
     * Render debug information
     * @param {number} alpha - Interpolation factor
     */
    renderDebug(alpha) {
        this.ctx.save();
        this.ctx.font = '12px monospace';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'left';
        
        const debugInfo = [
            `FPS: ${Math.round(1 / this.fixedDeltaTime)}`,
            `State: ${this.state}`,
            `Player Speed: ${this.player.getSpeed().toFixed(1)}`,
            `Player Lap: ${this.player.currentLap}`,
            `Player Checkpoint: ${this.player.lastCheckpoint}`,
            `RNG Seed: ${this.seed}`,
            `Race Time: ${this.raceTime.toFixed(2)}s`
        ];
        
        for (let i = 0; i < debugInfo.length; i++) {
            this.ctx.fillText(debugInfo[i], 10, this.height - 120 + i * 15);
        }
        
        this.ctx.restore();
    }

    /**
     * Toggle debug mode
     */
    toggleDebug() {
        this.debugMode = !this.debugMode;
    }

    /**
     * Format time as MM:SS.ms
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    /**
     * Get ordinal suffix for a number
     * @param {number} n - Number
     * @returns {string} Ordinal suffix
     */
    getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return (s[(v - 20) % 10] || s[v] || s[0]);
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.playerController.destroy();
    }
}