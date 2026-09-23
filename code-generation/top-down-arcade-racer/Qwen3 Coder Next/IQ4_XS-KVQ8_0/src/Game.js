/**
 * Main Game Class
 * 
 * Orchestrates all game systems including physics, AI, rendering,
 * and game state management for the top-down 2D racing game.
 */

import { GameLoop } from './core/GameLoop.js';
import { RNG } from './core/RNG.js';
import { Vector2 } from './core/Vector2.js';
import { InputHandler } from './core/InputHandler.js';
import { Timer } from './core/Timer.js';

import { PlayerCar } from './entities/PlayerCar.js';
import { AICar } from './entities/AICar.js';
import { Track } from './entities/Track.js';

import { LapSystem } from './systems/LapSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { HUDSystem } from './systems/HUDSystem.js';
import { Renderer } from './render/Renderer.js';

/**
 * Game state constants
 */
export const GameState = {
    MENU: 'menu',
    RACING: 'racing',
    FINISHED: 'finished'
};

/**
 * Game configuration constants
 */
export const GAME_CONFIG = {
    totalLaps: 3,
    playerColor: '#ff0000',
    aiColors: ['#00ff00', '#0000ff', '#ffff00'],
    aiDifficulties: [0.6, 0.7, 0.8],
    cameraSmooth: 0.1,
    trackWidth: 120
};

/**
 * Main game class that orchestrates all systems
 */
export class Game {
    /**
     * Creates a new game instance
     * @param {Object} options - Configuration options
     * @param {HTMLCanvasElement} options.canvas - Canvas element for rendering
     * @param {number} options.rngSeed - Seed for deterministic RNG
     */
    constructor({ canvas, rngSeed = 12345 } = {}) {
        /**
         * Canvas element for rendering
         * @type {HTMLCanvasElement}
         */
        this.canvas = canvas;

        /**
         * Canvas context
         * @type {CanvasRenderingContext2D}
         */
        this.ctx = canvas.getContext('2d');

        /**
         * RNG instance for deterministic behavior
         * @type {RNG}
         */
        this.rng = new RNG(rngSeed);

        /**
         * Game state
         * @type {string}
         */
        this.state = GameState.MENU;

        /**
         * Game timer
         * @type {Timer}
         */
        this.timer = new Timer();

        /**
         * Input handler
         * @type {InputHandler}
         */
        this.inputHandler = new InputHandler();

        /**
         * Track instance
         * @type {Track}
         */
        this.track = this._createTrack();

        /**
         * Player car instance
         * @type {PlayerCar}
         */
        this.playerCar = null;

        /**
         * AI cars array
         * @type {AICar[]}
         */
        this.aiCars = [];

        /**
         * All cars array (player + AI)
         * @type {Car[]}
         */
        this.allCars = [];

        /**
         * Lap system for tracking progress
         * @type {LapSystem}
         */
        this.lapSystem = null;

        /**
         * Collision system
         * @type {CollisionSystem}
         */
        this.collisionSystem = null;

        /**
         * HUD system
         * @type {HUDSystem}
         */
        this.hudSystem = null;

        /**
         * Renderer
         * @type {Renderer}
         */
        this.renderer = null;

        /**
         * Game loop
         * @type {GameLoop}
         */
        this.gameLoop = null;

        /**
         * Camera position
         * @type {Vector2}
         */
        this.camera = new Vector2();

        /**
         * Previous camera position for smoothing
         * @type {Vector2}
         */
        this.prevCamera = new Vector2();

        // Initialize all systems
        this._initializeSystems();
    }

    /**
     * Creates the track with waypoints
     * @returns {Track} Created track
     * @private
     */
    _createTrack() {
        // Create a closed track with waypoints
        // Track dimensions based on canvas size
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const trackWidth = GAME_CONFIG.trackWidth;

        // Define track waypoints (oval with corners)
        const waypoints = [
            // Start/finish line area
            new Vector2(centerX, centerY - trackWidth),
            // Top right corner
            new Vector2(centerX + trackWidth * 1.5, centerY - trackWidth),
            // Right side
            new Vector2(centerX + trackWidth * 1.5, centerY),
            // Bottom right corner
            new Vector2(centerX + trackWidth * 1.5, centerY + trackWidth),
            // Bottom side
            new Vector2(centerX, centerY + trackWidth * 1.5),
            // Bottom left corner
            new Vector2(centerX - trackWidth * 1.5, centerY + trackWidth * 1.5),
            // Left side
            new Vector2(centerX - trackWidth * 1.5, centerY),
            // Top left corner
            new Vector2(centerX - trackWidth * 1.5, centerY - trackWidth),
            // Back to start
            new Vector2(centerX, centerY - trackWidth)
        ];

        return new Track({
            waypoints,
            trackWidth: GAME_CONFIG.trackWidth * 1.5
        });
    }

    /**
     * Initializes all game systems
     * @private
     */
    _initializeSystems() {
        // Create player car at start position
        const startPos = this.track.waypoints[0];
        this.playerCar = new PlayerCar({
            position: startPos.clone(),
            angle: -Math.PI / 2, // Facing up
            color: GAME_CONFIG.playerColor
        });

        // Create AI cars
        this.aiCars = GAME_CONFIG.aiColors.map((color, index) => {
            const aiCar = new AICar({
                position: startPos.clone().add(new Vector2((index + 1) * 30, 0)),
                angle: -Math.PI / 2,
                color: color,
                difficulty: GAME_CONFIG.aiDifficulties[index]
            });
            aiCar.setTrack(this.track);
            return aiCar;
        });

        // Combine all cars
        this.allCars = [this.playerCar, ...this.aiCars];

        // Player car doesn't need track reference (AI cars have it)

        // Initialize lap system
        this.lapSystem = new LapSystem({
            track: this.track
        });

        // Register all cars for lap tracking
        this.allCars.forEach(car => this.lapSystem.registerCar(car));

        // Initialize collision system
        this.collisionSystem = new CollisionSystem({
            track: this.track
        });

        // Register all cars for collision detection
        this.collisionSystem.cars = this.allCars;

        // Initialize HUD system
        this.hudSystem = new HUDSystem({
            playerCar: this.playerCar,
            allCars: this.allCars,
            lapSystem: this.lapSystem,
            timer: this.timer,
            track: this.track
        });

        // Initialize renderer
        this.renderer = new Renderer({
            canvas: this.canvas,
            track: this.track,
            cars: this.allCars,
            hudSystem: this.hudSystem
        });

        // Setup game loop
        this.gameLoop = new GameLoop({
            targetFPS: 60,
            update: (dt) => this._update(dt),
            render: (interpolation) => this._render(interpolation)
        });
    }

    /**
     * Updates all game systems
     * @param {number} dt - Time step in seconds
     * @private
     */
    _update(dt) {
        switch (this.state) {
            case GameState.MENU:
                // Handle menu input
                if (this.inputHandler.isPressed('Space') || this.inputHandler.isPressed('Enter')) {
                    this.startRace();
                }
                break;

            case GameState.RACING:
                // Update player car
                this.playerCar.update(dt);

                // Update AI cars
                this.aiCars.forEach(aiCar => aiCar.update(dt));

                // Update lap system
                this.lapSystem.update(dt);

                // Update collision system
                this.collisionSystem.update(dt);

                // Update timer
                this.timer.update(dt);

                // Update camera to follow player
                this._updateCamera(dt);

                // Check for race finish
                if (this.playerCar.currentLap > GAME_CONFIG.totalLaps) {
                    this.finishRace();
                }
                break;

            case GameState.FINISHED:
                // Handle finished state input
                if (this.inputHandler.isPressed('Space') || this.inputHandler.isPressed('Enter')) {
                    this.resetGame();
                }
                break;
        }
    }

    /**
     * Updates camera position to follow player
     * @param {number} dt - Time step in seconds
     * @private
     */
    _updateCamera(dt) {
        const targetX = this.playerCar.position.x;
        const targetY = this.playerCar.position.y;

        // Smooth camera movement
        this.camera.x += (targetX - this.camera.x) * GAME_CONFIG.cameraSmooth;
        this.camera.y += (targetY - this.camera.y) * GAME_CONFIG.cameraSmooth;
    }

    /**
     * Renders the game
     * @param {number} interpolation - Interpolation factor (0-1)
     * @private
     */
    _render(interpolation) {
        // Clear canvas
        this.ctx.fillStyle = '#2d5a27'; // Grass color
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context for camera transform
        this.ctx.save();

        // Apply camera transform (center on screen)
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.ctx.translate(centerX - this.camera.x, centerY - this.camera.y);

        // Render track
        this.renderer.renderTrack();

        // Render cars (with interpolation)
        this.allCars.forEach(car => {
            this.renderer.renderCar(car, interpolation);
        });

        // Restore context
        this.ctx.restore();

        // Render HUD
        this.renderer.renderHUD();
    }

    /**
     * Starts the race
     */
    startRace() {
        this.state = GameState.RACING;
        this.timer.start();
        this.timer.startLap();
    }

    /**
     * Finishes the race
     */
    finishRace() {
        this.state = GameState.FINISHED;
        this.timer.stop();
    }

    /**
     * Resets the game to initial state
     */
    resetGame() {
        this.state = GameState.MENU;
        this.timer.reset();

        // Reset player car
        const startPos = this.track.waypoints[0];
        this.playerCar.position = startPos.clone();
        this.playerCar.angle = -Math.PI / 2;
        this.playerCar.velocity = new Vector2();
        this.playerCar.angularVelocity = 0;
        this.playerCar.currentLap = 1;
        this.playerCar.currentCheckpoint = 0;

        // Reset AI cars
        this.aiCars.forEach((aiCar, index) => {
            aiCar.position = startPos.clone().add(new Vector2((index + 1) * 30, 0));
            aiCar.angle = -Math.PI / 2;
            aiCar.velocity = new Vector2();
            aiCar.angularVelocity = 0;
            aiCar.currentLap = 1;
            aiCar.currentCheckpoint = 0;
        });

        // Reset lap system
        this.lapSystem.carLapData.clear();
        this.allCars.forEach(car => this.lapSystem.registerCar(car));
    }

    /**
     * Starts the game loop
     */
    start() {
        this.gameLoop.start();
    }

    /**
     * Stops the game loop
     */
    stop() {
        this.gameLoop.stop();
    }

    /**
     * Handles window resize
     * @param {number} width - New width
     * @param {number} height - New height
     */
    handleResize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;

        // Recreate track with new dimensions
        this.track = this._createTrack();

        // Reset camera
        this.camera = new Vector2();
        this.prevCamera = new Vector2();

        // Update renderer with new canvas
        this.renderer.canvas = this.canvas;
        this.renderer.ctx = this.canvas.getContext('2d');
    }
}