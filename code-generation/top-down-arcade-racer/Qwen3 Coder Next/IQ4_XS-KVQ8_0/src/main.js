/**
 * Main Entry Point
 * 
 * Sets up the HTML canvas, initializes the game with deterministic RNG seed,
 * starts the game loop, and handles window resize events.
 */

import { Game, GameState } from './Game.js';

/**
 * Game configuration
 */
const CONFIG = {
    rngSeed: 12345, // Deterministic seed for reproducibility
    targetFPS: 60
};

/**
 * Canvas element
 * @type {HTMLCanvasElement|null}
 */
let canvas = null;

/**
 * Game instance
 * @type {Game|null}
 */
let game = null;

/**
 * Initializes the game
 */
function init() {
    // Get canvas element
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Create game instance with deterministic RNG seed
    game = new Game({
        canvas,
        rngSeed: CONFIG.rngSeed
    });

    // Start the game loop
    game.start();

    // Log initialization
    console.log('Game initialized');
    console.log(`RNG Seed: ${CONFIG.rngSeed}`);
    console.log(`Canvas Size: ${canvas.width}x${canvas.height}`);
    console.log(`Target FPS: ${CONFIG.targetFPS}`);
}

/**
 * Handles window resize events
 */
function handleResize() {
    if (!canvas || !game) return;

    // Update canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Handle resize in game
    game.handleResize(window.innerWidth, window.innerHeight);
}

/**
 * Main entry point
 */
function main() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Handle window resize
    window.addEventListener('resize', handleResize);
}

// Start the game
main();