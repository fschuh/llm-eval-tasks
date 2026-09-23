import { Game } from './game/Game.js';

/**
 * Main entry point for the racing game
 */
function main() {
    // Get canvas element
    const canvas = document.getElementById('gameCanvas');
    
    if (!canvas) {
        console.error('Game canvas not found!');
        return;
    }
    
    // Set canvas size
    canvas.width = 1024;
    canvas.height = 768;
    
    // Create game instance
    const game = new Game(canvas, {
        seed: 12345,
        TOTAL_LAPS: 3,
        AI_COUNT: 3
    });
    
    // Initialize game
    game.init();
    
    // Start the game loop
    game.start();
    
    // Expose game to window for debugging
    window.game = game;
    
    console.log('Racing game started!');
    console.log('Controls:');
    console.log('  Arrow Keys / WASD - Drive');
    console.log('  Space - Start/Restart race');
    console.log('  P - Pause');
    console.log('  R - Reset');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
