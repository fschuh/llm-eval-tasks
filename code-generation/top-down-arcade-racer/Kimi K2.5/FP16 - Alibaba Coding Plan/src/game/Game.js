import { PhysicsEngine } from '../physics/PhysicsEngine.js';
import { Car } from '../entities/Car.js';
import { Track } from '../entities/Track.js';
import { AIController, AIControllerManager } from '../ai/AIController.js';
import { RaceManager } from '../race/RaceManager.js';
import { InputHandler } from '../input/InputHandler.js';
import { Renderer } from '../render/Renderer.js';
import { HUDRenderer, HUDState } from '../render/HUDRenderer.js';
import { GameLoop } from './GameLoop.js';
import { EventBusInstance as EventBus } from '../core/EventBus.js';
import { DeterministicRNG } from '../core/DeterministicRNG.js';
import { GAME_CONFIG, COLORS, AI_CONFIG } from '../config/GameConfig.js';
import { DEFAULT_TRACK } from '../config/TrackData.js';
import { Vector2D } from '../core/Vector2D.js';

/**
 * Game - Main game class that orchestrates all systems
 */
export class Game {
    /**
     * Create a new game
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} config - Game configuration
     */
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.config = { ...GAME_CONFIG, ...config };
        
        // RNG
        this.rng = new DeterministicRNG(config.seed || 12345);
        
        // Core systems
        this.physics = new PhysicsEngine();
        this.physics.setTimestep(this.config.FIXED_TIMESTEP);
        this.physics.setRestitution(this.config.RESTITUTION);
        this.physics.setIterations(this.config.POSITION_ITERATIONS);
        
        // Input
        this.input = new InputHandler();
        
        // Rendering
        this.renderer = new Renderer(canvas);
        this.hudRenderer = new HUDRenderer(canvas);
        this.hudState = new HUDState();
        
        // Game objects
        this.track = null;
        this.cars = [];
        this.playerCar = null;
        this.aiControllers = new AIControllerManager();
        
        // Race management
        this.raceManager = null;
        
        // Game loop
        this.gameLoop = new GameLoop(
            (dt) => this.update(dt),
            (alpha) => this.render(alpha)
        );
        
        // State
        this.initialized = false;
        this.paused = false;
        
        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
    }

    /**
     * Initialize the game
     */
    init() {
        if (this.initialized) return;
        
        // Setup input
        this.input.init();
        
        // Setup window resize
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyPress);
        
        // Create track
        this.createTrack();
        
        // Create cars
        this.createCars();
        
        // Setup race manager
        this.raceManager = new RaceManager(this.track, this.cars, this.config.TOTAL_LAPS);
        
        // Setup renderer
        this.renderer.setTrack(this.track);
        for (const car of this.cars) {
            this.renderer.addRenderable({
                render: (ctx, alpha) => this.renderCar(ctx, car, alpha)
            });
        }
        
        // Setup camera to follow player
        this.renderer.camera.follow(this.playerCar);
        
        this.initialized = true;
    }

    /**
     * Create the track
     */
    createTrack() {
        this.track = new Track(DEFAULT_TRACK);
        
        // Add track boundaries to physics
        for (const boundary of this.track.getBoundaries()) {
            this.physics.addWall(boundary);
        }
    }

    /**
     * Create cars (player + AI)
     */
    createCars() {
        this.cars = [];
        this.aiControllers.clear();
        
        // Create player car
        this.playerCar = new Car('player', true);
        this.playerCar.color = COLORS.PLAYER_CAR;
        this.cars.push(this.playerCar);
        this.physics.addBody(this.playerCar);
        
        // Create AI cars
        const difficulties = ['easy', 'medium', 'hard'];
        const aiColors = [COLORS.AI_CAR_EASY, COLORS.AI_CAR_MEDIUM, COLORS.AI_CAR_HARD];
        
        for (let i = 0; i < this.config.AI_COUNT; i++) {
            const difficulty = difficulties[i % difficulties.length];
            const aiCar = new Car(`ai_${i + 1}`, false);
            aiCar.color = aiColors[i % aiColors.length];
            
            // Adjust AI car config based on difficulty
            const aiConfig = AI_CONFIG[difficulty];
            aiCar.config.maxSpeed *= aiConfig.maxSpeedMultiplier;
            
            this.cars.push(aiCar);
            this.physics.addBody(aiCar);
            
            // Create AI controller
            const aiController = new AIController(aiCar, this.track, difficulty);
            this.aiControllers.addController(aiController);
        }
        
        // Position cars at start
        this.resetCarPositions();
    }

    /**
     * Reset car positions to start grid
     */
    resetCarPositions() {
        for (let i = 0; i < this.cars.length; i++) {
            const car = this.cars[i];
            const startPos = this.track.getStartPosition(i);
            
            if (startPos) {
                car.reset(startPos.position, startPos.rotation);
            } else {
                // Fallback positioning
                const offset = new Vector2D(-i * 40, (i % 2 === 0 ? -20 : 20));
                const basePos = this.track.getStartPosition(0)?.position || new Vector2D(100, 384);
                car.reset(basePos.add(offset), 0);
            }
        }
    }

    /**
     * Start the game
     */
    start() {
        if (!this.initialized) {
            this.init();
        }
        
        this.gameLoop.start();
        this.raceManager.start();
    }

    /**
     * Stop the game
     */
    stop() {
        this.gameLoop.stop();
    }

    /**
     * Pause the game
     */
    pause() {
        this.paused = true;
        this.raceManager.pause();
    }

    /**
     * Resume the game
     */
    resume() {
        this.paused = false;
        this.raceManager.resume();
    }

    /**
     * Reset the game
     */
    reset() {
        this.raceManager.reset();
        this.resetCarPositions();
        this.aiControllers.resetAll();
        this.rng.reset();
    }

    /**
     * Set RNG seed
     * @param {number} seed - New seed
     */
    setSeed(seed) {
        this.rng.setSeed(seed);
    }

    /**
     * Update game logic (called at fixed timestep)
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (this.paused) return;
        
        // Update input
        this.input.update();
        
        // Get player input
        const playerInput = this.input.getCarInput();
        
        // Only apply player input when racing
        if (this.raceManager.getStatus() === 'racing') {
            this.playerCar.setInput(playerInput.throttle, playerInput.brake, playerInput.steering);
        } else {
            this.playerCar.setInput(0, 0, 0);
        }
        
        // Update AI
        this.aiControllers.updateAll(dt);
        
        // Update physics
        this.physics.step(dt);
        
        // Update race manager
        this.raceManager.update(dt);
        
        // Update HUD state
        this.updateHUDState();
    }

    /**
     * Update HUD state from game state
     */
    updateHUDState() {
        const playerState = this.playerCar.raceState;
        const raceStatus = this.raceManager.getStatus();
        
        this.hudState.raceStatus = raceStatus;
        this.hudState.countdown = this.raceManager.getCountdownValue();
        
        this.hudState.lap = {
            current: playerState.currentLap,
            total: this.config.TOTAL_LAPS
        };
        
        this.hudState.time = {
            current: this.raceManager.getElapsedTime(),
            lap: raceStatus === 'racing' ? 
                this.raceManager.getElapsedTime() - playerState.lapStartTime : 0,
            best: playerState.bestLapTime
        };
        
        this.hudState.position = this.raceManager.getPlayerPosition();
        this.hudState.speed = this.playerCar.getSpeedKmh();
        
        // Collect lap times
        if (playerState.currentLap > 0 && playerState.currentLap <= this.config.TOTAL_LAPS) {
            // This is simplified - in a full implementation we'd track all lap times
        }
        
        // Results
        if (raceStatus === 'finished') {
            this.hudState.results = this.raceManager.getResults();
        }
    }

    /**
     * Render the game
     * @param {number} alpha - Interpolation factor
     */
    render(alpha) {
        // Render game world
        this.renderer.render(alpha);
        
        // Render HUD
        this.hudRenderer.render(this.hudState);
    }

    /**
     * Render a car
     * @param {CanvasRenderingContext2D} ctx - Context
     * @param {Car} car - Car to render
     * @param {number} alpha - Interpolation factor
     */
    renderCar(ctx, car, alpha) {
        Renderer.renderCar(ctx, car, alpha, car.color);
        
        // Render car ID above car
        const pos = car.getInterpolatedPosition(alpha);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(car.isPlayer ? 'P' : car.id.replace('ai_', ''), pos.x, pos.y - 25);
    }

    /**
     * Handle window resize
     */
    handleResize() {
        const container = this.canvas.parentElement;
        if (container) {
            const rect = container.getBoundingClientRect();
            this.renderer.resize(rect.width, rect.height);
            this.hudRenderer.resize(rect.width, rect.height);
        }
    }

    /**
     * Handle key press for game control
     * @param {KeyboardEvent} event 
     */
    handleKeyPress(event) {
        // Space to start/restart
        if (event.code === 'Space') {
            if (this.raceManager.getStatus() === 'waiting') {
                this.raceManager.start();
            } else if (this.raceManager.getStatus() === 'finished') {
                this.reset();
                this.raceManager.start();
            }
        }
        
        // P to pause
        if (event.code === 'KeyP') {
            if (this.paused) {
                this.resume();
            } else {
                this.pause();
            }
        }
        
        // R to reset
        if (event.code === 'KeyR') {
            this.reset();
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        this.input.destroy();
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyPress);
    }

    /**
     * Get player car
     * @returns {Car} Player car
     */
    getPlayerCar() {
        return this.playerCar;
    }

    /**
     * Get all cars
     * @returns {Car[]} Array of cars
     */
    getCars() {
        return this.cars;
    }

    /**
     * Get race manager
     * @returns {RaceManager} Race manager
     */
    getRaceManager() {
        return this.raceManager;
    }

    /**
     * Get game status
     * @returns {string} Game status
     */
    getStatus() {
        return this.raceManager ? this.raceManager.getStatus() : 'waiting';
    }
}
