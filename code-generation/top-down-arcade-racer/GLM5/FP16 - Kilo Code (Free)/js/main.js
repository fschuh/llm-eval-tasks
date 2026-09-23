import { CONFIG } from './config.js';
import { GameLoop } from './core/gameLoop.js';
import { DeterministicRNG } from './core/rng.js';
import { InputHandler } from './core/input.js';
import { Track } from './track/track.js';
import { LapDetectionSystem } from './track/lapDetection.js';
import { Car } from './entities/car.js';
import { CollisionSystem } from './physics/collision.js';
import { NavGrid } from './ai/navGrid.js';
import { AStar } from './ai/astar.js';
import { AIController } from './ai/aiController.js';
import { HUD } from './rendering/hud.js';

/**
 * Main Game Class
 * Orchestrates all game systems
 */
class Game {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;
        
        // Core systems
        this.rng = new DeterministicRNG(CONFIG.RNG_SEED);
        this.input = new InputHandler();
        this.gameLoop = new GameLoop(
            (dt) => this.update(dt),
            (alpha) => this.render(alpha)
        );
        
        // Game state
        this.state = 'countdown'; // countdown, racing, finished
        this.raceTime = 0;
        this.countdownTimer = 3;
        this.countdownValue = 3;
        
        // Initialize game systems
        this.initTrack();
        this.initCars();
        this.initSystems();
        
        // HUD
        this.hud = new HUD(this.ctx);
        
        // Bind restart handler
        this.bindRestartHandler();
        
        // Start game loop
        this.gameLoop.start();
    }
    
    /**
     * Initialize track
     */
    initTrack() {
        this.track = new Track();
    }
    
    /**
     * Initialize cars
     */
    initCars() {
        this.cars = [];
        this.aiControllers = [];
        
        // Player car
        const startX = this.track.startPosition.x;
        const startY = this.track.startPosition.y;
        const startAngle = this.track.startAngle;
        
        this.playerCar = new Car(
            startX,
            startY,
            startAngle,
            CONFIG.COLORS.player,
            1
        );
        this.cars.push(this.playerCar);
        
        // AI cars - stagger them behind the player
        const aiColors = [CONFIG.COLORS.ai1, CONFIG.COLORS.ai2, CONFIG.COLORS.ai3];
        const offsets = [
            { x: -40, y: -30 },
            { x: -40, y: 30 },
            { x: -80, y: 0 }
        ];
        
        for (let i = 0; i < 3; i++) {
            const aiCar = new Car(
                startX + offsets[i].x,
                startY + offsets[i].y,
                startAngle,
                aiColors[i],
                i + 2
            );
            this.cars.push(aiCar);
        }
    }
    
    /**
     * Initialize game systems
     */
    initSystems() {
        // Collision system
        this.collisionSystem = new CollisionSystem();
        
        // Navigation grid for AI
        this.navGrid = new NavGrid(this.track);
        
        // A* pathfinding
        this.astar = new AStar(this.navGrid);
        
        // AI controllers
        for (let i = 1; i < this.cars.length; i++) {
            const aiCar = this.cars[i];
            const controller = new AIController(
                aiCar,
                this.track,
                this.astar,
                this.rng
            );
            this.aiControllers.push(controller);
        }
        
        // Lap detection
        this.lapDetection = new LapDetectionSystem(this.track);
        for (const car of this.cars) {
            this.lapDetection.registerCar(car);
        }
    }
    
    /**
     * Bind restart handler
     */
    bindRestartHandler() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR') {
                this.restart();
            }
            if (e.code === 'KeyD') {
                window.DEBUG_MODE = !window.DEBUG_MODE;
            }
        });
    }
    
    /**
     * Update game state
     */
    update(dt) {
        switch (this.state) {
            case 'countdown':
                this.updateCountdown(dt);
                break;
            case 'racing':
                this.updateRacing(dt);
                break;
            case 'finished':
                // Just update rendering, no physics
                break;
        }
    }
    
    /**
     * Update countdown state
     */
    updateCountdown(dt) {
        this.countdownTimer += dt;
        
        if (this.countdownTimer >= 1) {
            this.countdownTimer = 0;
            this.countdownValue--;
            
            if (this.countdownValue < 0) {
                this.state = 'racing';
                this.raceTime = 0;
            }
        }
    }
    
    /**
     * Update racing state
     */
    updateRacing(dt) {
        this.raceTime += dt;
        
        // Update player input
        const inputState = this.input.getState();
        this.playerCar.setInput(
            inputState.throttle,
            inputState.brake,
            inputState.steerLeft - inputState.steerRight
        );
        
        // Update AI controllers
        for (const controller of this.aiControllers) {
            controller.update(dt);
        }
        
        // Update car physics
        for (const car of this.cars) {
            car.update(dt);
        }
        
        // Handle collisions
        this.collisionSystem.update(this.cars, this.track.allWalls);
        
        // Update lap detection
        this.lapDetection.update(this.cars, this.raceTime);
        
        // Check for race completion
        if (this.lapDetection.isRaceComplete(this.cars, this.playerCar)) {
            this.state = 'finished';
        }
    }
    
    /**
     * Render game
     */
    render(alpha) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render track
        this.track.render(this.ctx);
        
        // Render navigation grid (debug)
        this.navGrid.render(this.ctx);
        
        // Render AI paths (debug)
        if (window.DEBUG_MODE) {
            for (const controller of this.aiControllers) {
                controller.render(this.ctx);
            }
        }
        
        // Render cars
        for (const car of this.cars) {
            car.render(this.ctx, alpha);
        }
        
        // Get positions for HUD
        const positions = this.lapDetection.getPositions(this.cars);
        
        // Render HUD
        this.hud.render(
            this.raceTime,
            this.playerCar,
            positions,
            this.lapDetection
        );
        
        // Render countdown
        if (this.state === 'countdown') {
            this.hud.drawCountdown(this.countdownValue);
        }
    }
    
    /**
     * Restart the race
     */
    restart() {
        // Reset RNG
        this.rng.reset();
        
        // Reset game state
        this.state = 'countdown';
        this.raceTime = 0;
        this.countdownTimer = 0;
        this.countdownValue = 3;
        
        // Reset cars
        const startX = this.track.startPosition.x;
        const startY = this.track.startPosition.y;
        const startAngle = this.track.startAngle;
        
        this.playerCar.reset(startX, startY, startAngle);
        
        const offsets = [
            { x: -40, y: -30 },
            { x: -40, y: 30 },
            { x: -80, y: 0 }
        ];
        
        for (let i = 1; i < this.cars.length; i++) {
            this.cars[i].reset(
                startX + offsets[i - 1].x,
                startY + offsets[i - 1].y,
                startAngle
            );
        }
        
        // Reset lap detection
        this.lapDetection.reset();
        
        // Reset AI controllers
        for (const controller of this.aiControllers) {
            controller.currentPath = [];
            controller.currentWaypointIndex = 0;
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.DEBUG_MODE = false;
    window.game = new Game();
});
