/**
 * InputHandler - Manages keyboard input for the game
 * Tracks key states and provides query methods for game input
 */
export class InputHandler {
    /**
     * Create a new InputHandler
     */
    constructor() {
        // Map of key codes to their current state (true = pressed)
        this.keys = new Map();
        
        // Track keys that were just pressed this frame
        this.keysPressed = new Set();
        
        // Track keys that were just released this frame
        this.keysReleased = new Set();
        
        // Bound event handlers (for cleanup)
        this.boundKeyDown = this.handleKeyDown.bind(this);
        this.boundKeyUp = this.handleKeyUp.bind(this);
        
        // Whether the handler is active
        this.active = false;
    }
    
    /**
     * Start listening for keyboard events
     */
    start() {
        if (this.active) return;
        
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
        this.active = true;
    }
    
    /**
     * Stop listening for keyboard events
     */
    stop() {
        if (!this.active) return;
        
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        this.active = false;
    }
    
    /**
     * Handle keydown events
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyDown(event) {
        const key = event.key;
        
        // Prevent default for arrow keys and space to stop page scrolling
        if (this.shouldPreventDefault(key)) {
            event.preventDefault();
        }
        
        // Only register as "pressed" if it wasn't already held down
        if (!this.keys.get(key)) {
            this.keysPressed.add(key);
        }
        
        this.keys.set(key, true);
    }
    
    /**
     * Handle keyup events
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyUp(event) {
        const key = event.key;
        
        this.keys.set(key, false);
        this.keysReleased.add(key);
    }
    
    /**
     * Check if a key should prevent default browser behavior
     * @param {string} key - The key to check
     * @returns {boolean} True if default should be prevented
     */
    shouldPreventDefault(key) {
        const preventKeys = [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            ' ', 'Spacebar'  // Space key variations
        ];
        return preventKeys.includes(key);
    }
    
    /**
     * Check if a key is currently held down
     * @param {string} key - The key to check (e.g., 'ArrowUp', 'w', ' ')
     * @returns {boolean} True if the key is currently down
     */
    isKeyDown(key) {
        return !!this.keys.get(key);
    }
    
    /**
     * Check if a key was just pressed this frame
     * @param {string} key - The key to check
     * @returns {boolean} True if the key was just pressed
     */
    isKeyPressed(key) {
        return this.keysPressed.has(key);
    }
    
    /**
     * Check if a key was just released this frame
     * @param {string} key - The key to check
     * @returns {boolean} True if the key was just released
     */
    isKeyUp(key) {
        return this.keysReleased.has(key);
    }
    
    /**
     * Update the input state - call this at the end of each frame
     * Clears the pressed/released sets for the next frame
     */
    update() {
        this.keysPressed.clear();
        this.keysReleased.clear();
    }
    
    /**
     * Get the throttle value based on up/down arrow or W/S keys
     * @returns {number} 1 if accelerating, 0 otherwise
     */
    getThrottle() {
        return this.isKeyDown('ArrowUp') || this.isKeyDown('w') || this.isKeyDown('W') ? 1 : 0;
    }
    
    /**
     * Get the brake value based on down arrow or S key
     * @returns {number} 1 if braking/reversing, 0 otherwise
     */
    getBrake() {
        return this.isKeyDown('ArrowDown') || this.isKeyDown('s') || this.isKeyDown('S') ? 1 : 0;
    }
    
    /**
     * Get the steering value based on left/right arrow or A/D keys
     * @returns {number} -1 for full left, 1 for full right, 0 for straight
     */
    getSteering() {
        let steering = 0;
        if (this.isKeyDown('ArrowLeft') || this.isKeyDown('a') || this.isKeyDown('A')) {
            steering -= 1;
        }
        if (this.isKeyDown('ArrowRight') || this.isKeyDown('d') || this.isKeyDown('D')) {
            steering += 1;
        }
        return steering;
    }
    
    /**
     * Check if handbrake is active (space key)
     * @returns {boolean} True if space is held
     */
    isHandbrake() {
        return this.isKeyDown(' ') || this.isKeyDown('Spacebar');
    }
    
    /**
     * Clear all key states (useful when losing focus)
     */
    clear() {
        this.keys.clear();
        this.keysPressed.clear();
        this.keysReleased.clear();
    }
}
