/**
 * Input Handler
 * Tracks keyboard state for player controls
 */
export class InputHandler {
    constructor() {
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false,
            space: false
        };
        
        this.keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'KeyW': 'up',
            'KeyS': 'down',
            'KeyA': 'left',
            'KeyD': 'right',
            'Space': 'space'
        };
        
        this.setupListeners();
    }
    
    /**
     * Set up keyboard event listeners
     */
    setupListeners() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }
    
    /**
     * Handle key down event
     */
    onKeyDown(event) {
        const key = this.keyMap[event.code];
        if (key) {
            this.keys[key] = true;
            event.preventDefault();
        }
    }
    
    /**
     * Handle key up event
     */
    onKeyUp(event) {
        const key = this.keyMap[event.code];
        if (key) {
            this.keys[key] = false;
            event.preventDefault();
        }
    }
    
    /**
     * Get current input state
     */
    getState() {
        return {
            throttle: this.keys.up ? 1 : 0,
            brake: this.keys.down ? 1 : 0,
            steerLeft: this.keys.left ? 1 : 0,
            steerRight: this.keys.right ? 1 : 0
        };
    }
    
    /**
     * Check if any key is pressed
     */
    isAnyKeyPressed() {
        return Object.values(this.keys).some(v => v);
    }
    
    /**
     * Reset all keys (useful for state transitions)
     */
    reset() {
        for (const key in this.keys) {
            this.keys[key] = false;
        }
    }
    
    /**
     * Clean up event listeners
     */
    destroy() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }
}
