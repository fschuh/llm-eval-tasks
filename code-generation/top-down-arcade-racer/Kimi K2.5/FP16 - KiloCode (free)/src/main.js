import { Vector2 } from './utils/Vector2.js';
import { InputHandler } from './utils/InputHandler.js';
import { DeterministicRNG } from './utils/DeterministicRNG.js';
import { GameState } from './game/GameState.js';
import { GameLoop } from './game/GameLoop.js';
import { RenderManager } from './rendering/RenderManager.js';
import { Track } from './track/Track.js';
import { PlayerCar } from './entities/PlayerCar.js';
import { AICar } from './entities/AICar.js';

/**
 * Main game initialization
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.inputHandler = new InputHandler();
        this.renderer = new RenderManager(this.canvas);
    }

    /**
     * Initialize and start the game
     */
    init() {
        // Create game state with deterministic seed
        const seed = 12345;
        this.gameState = new GameState(seed);

        // Create track
        const track = Track.createOvalTrack();
        this.gameState.init(track);

        // Create cars
        this.createCars(track);

        // Create game loop
        this.gameLoop = new GameLoop(this.gameState, this.renderer, this.inputHandler);

        // Override the restart function to update renderer FPS
        const originalUpdateFPS = this.gameLoop.updateFPS.bind(this.gameLoop);
        this.gameLoop.updateFPS = (currentTime) => {
            originalUpdateFPS(currentTime);
            this.renderer.setFPS(this.gameLoop.fps);
        };

        // Start the game
        this.gameLoop.start();

        // Start countdown
        this.gameState.startCountdown();

        console.log('Game initialized with seed:', seed);
        console.log('Player car:', this.gameState.player);
        console.log('AI cars:', this.gameState.aiCars);
    }

    /**
     * Create player and AI cars
     */
    createCars(track) {
        // Get start position from track
        const startWaypoint = track.waypoints[track.startLine];
        const startPos = startWaypoint.position.clone();
        const startHeading = Math.atan2(startWaypoint.tangent.y, startWaypoint.tangent.x);

        // Create player car (center position)
        const player = new PlayerCar(0, startPos.clone(), this.inputHandler);
        player.physics.heading = startHeading;
        this.gameState.setPlayer(player);

        // Create 3 AI cars with different skill levels
        const aiSkills = ['average', 'average', 'pro'];
        const aiOffsets = [-25, 25, 0]; // Offset from player (in perpendicular direction)
        
        // Get perpendicular direction for spacing
        const perpX = -startWaypoint.normal.y;
        const perpY = startWaypoint.normal.x;

        for (let i = 0; i < 3; i++) {
            const offset = aiOffsets[i];
            const aiPos = new Vector2(
                startPos.x + perpX * offset,
                startPos.y + perpY * offset
            );
            
            // Slightly offset AI cars behind player for fair start
            const backOffset = i * 30;
            const backX = -startWaypoint.tangent.x * backOffset;
            const backY = -startWaypoint.tangent.y * backOffset;
            aiPos.x += backX;
            aiPos.y += backY;

            const aiCar = new AICar(i + 1, aiPos, track, aiSkills[i], this.gameState.rng);
            aiCar.physics.heading = startHeading;
            this.gameState.addAICar(aiCar);
        }
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});