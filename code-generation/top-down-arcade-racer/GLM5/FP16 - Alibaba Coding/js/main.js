import { Game } from './game.js';

/**
 * Main entry point
 */
document.addEventListener('DOMContentLoaded', () => {
    // Get canvas
    const canvas = document.getElementById('gameCanvas');
    
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    // Create and start game
    const game = new Game(canvas);
    game.start();
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // R to restart
        if (e.code === 'KeyR') {
            game.restart();
        }
        
        // D to toggle debug mode
        if (e.code === 'KeyD') {
            game.toggleDebug();
        }
    });
    
    // Expose game instance for debugging
    window.game = game;
    
    console.log('Top-Down Racing Prototype initialized');
    console.log('Controls: Arrow keys or WASD to drive');
    console.log('Press R to restart, D for debug mode');
});