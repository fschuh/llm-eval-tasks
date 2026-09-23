/**
 * Keyboard input handler for player controls
 */
export class InputHandler {
    constructor() {
        this.keys = new Set();
        this.pressedThisFrame = new Set();
        this.releasedThisFrame = new Set();

        this.bindings = {
            accelerate: ['ArrowUp', 'KeyW', 'w', 'W'],
            brake: ['ArrowDown', 'KeyS', 's', 'S'],
            steerLeft: ['ArrowLeft', 'KeyA', 'a', 'A'],
            steerRight: ['ArrowRight', 'KeyD', 'd', 'D'],
            restart: ['KeyR', 'r', 'R']
        };

        this.setupListeners();
    }

    setupListeners() {
        document.addEventListener('keydown', (e) => {
            if (!this.keys.has(e.key)) {
                this.pressedThisFrame.add(e.key);
            }
            this.keys.add(e.key);
            
            // Prevent default for game control keys to avoid scrolling
            if (this.isGameKey(e.key) || this.isGameKey(e.code)) {
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys.delete(e.key);
            this.releasedThisFrame.add(e.key);
        });
    }

    isGameKey(key) {
        return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'r', 'R'].includes(key);
    }

    /**
     * Check if a specific action is currently active
     */
    isActionActive(action) {
        const actionKeys = this.bindings[action];
        if (!actionKeys) return false;
        
        return actionKeys.some(key => this.keys.has(key));
    }

    /**
     * Check if an action was just pressed this frame
     */
    wasActionPressed(action) {
        const actionKeys = this.bindings[action];
        if (!actionKeys) return false;
        
        return actionKeys.some(key => this.pressedThisFrame.has(key));
    }

    /**
     * Check if an action was just released this frame
     */
    wasActionReleased(action) {
        const actionKeys = this.bindings[action];
        if (!actionKeys) return false;
        
        return actionKeys.some(key => this.releasedThisFrame.has(key));
    }

    /**
     * Get steering input (-1 to 1)
     */
    getSteering() {
        let steering = 0;
        if (this.isActionActive('steerLeft')) steering -= 1;
        if (this.isActionActive('steerRight')) steering += 1;
        return steering;
    }

    /**
     * Clear per-frame input state (call at end of frame)
     */
    clearFrame() {
        this.pressedThisFrame.clear();
        this.releasedThisFrame.clear();
    }
}