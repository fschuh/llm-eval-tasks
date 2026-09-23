/**
 * InputHandler - Handles keyboard and gamepad input
 */
export class InputHandler {
    /**
     * Create a new input handler
     */
    constructor() {
        this.keys = new Map();
        this.previousKeys = new Map();
        this.keyMappings = new Map();
        
        // Default mappings
        this.setupDefaultMappings();
        
        // Bind event handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        
        // Current input state
        this.inputState = {
            throttle: 0,
            brake: 0,
            steering: 0
        };
    }

    /**
     * Setup default key mappings
     */
    setupDefaultMappings() {
        // Arrow keys
        this.mapKey('ArrowUp', 'throttle');
        this.mapKey('ArrowDown', 'brake');
        this.mapKey('ArrowLeft', 'steer_left');
        this.mapKey('ArrowRight', 'steer_right');
        
        // WASD keys
        this.mapKey('KeyW', 'throttle');
        this.mapKey('KeyS', 'brake');
        this.mapKey('KeyA', 'steer_left');
        this.mapKey('KeyD', 'steer_right');
        
        // Alternative keys
        this.mapKey('Space', 'brake');
    }

    /**
     * Initialize and start listening for input
     */
    init() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }

    /**
     * Handle key down event
     * @param {KeyboardEvent} event 
     */
    handleKeyDown(event) {
        // Prevent default for game keys to avoid scrolling
        if (this.keyMappings.has(event.code)) {
            event.preventDefault();
        }
        
        this.keys.set(event.code, true);
    }

    /**
     * Handle key up event
     * @param {KeyboardEvent} event 
     */
    handleKeyUp(event) {
        this.keys.set(event.code, false);
    }

    /**
     * Map a key to an action
     * @param {string} key - Key code (e.g., 'ArrowUp', 'KeyW')
     * @param {string} action - Action name
     */
    mapKey(key, action) {
        this.keyMappings.set(key, action);
    }

    /**
     * Unmap a key
     * @param {string} key - Key code
     */
    unmapKey(key) {
        this.keyMappings.delete(key);
    }

    /**
     * Check if a key is currently pressed
     * @param {string} key - Key code
     * @returns {boolean} True if pressed
     */
    isKeyPressed(key) {
        return this.keys.get(key) || false;
    }

    /**
     * Check if an action is currently active
     * @param {string} action - Action name
     * @returns {boolean} True if active
     */
    isActionActive(action) {
        for (const [key, mappedAction] of this.keyMappings) {
            if (mappedAction === action && this.isKeyPressed(key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get axis value (-1 to 1) for an action pair
     * @param {string} negativeAction - Action for negative value
     * @param {string} positiveAction - Action for positive value
     * @returns {number} Axis value
     */
    getAxis(negativeAction, positiveAction) {
        let value = 0;
        if (this.isActionActive(negativeAction)) value -= 1;
        if (this.isActionActive(positiveAction)) value += 1;
        return value;
    }

    /**
     * Update input state - call once per frame
     */
    update() {
        // Store previous state
        this.previousKeys = new Map(this.keys);
        
        // Update car input state
        this.inputState.throttle = this.isActionActive('throttle') ? 1 : 0;
        this.inputState.brake = this.isActionActive('brake') ? 1 : 0;
        this.inputState.steering = this.getAxis('steer_left', 'steer_right');
    }

    /**
     * Get current input state for car
     * @returns {Object} Input state
     */
    getCarInput() {
        return { ...this.inputState };
    }

    /**
     * Check if a key was just pressed this frame
     * @param {string} key - Key code
     * @returns {boolean} True if just pressed
     */
    isKeyJustPressed(key) {
        return this.isKeyPressed(key) && !this.previousKeys.get(key);
    }

    /**
     * Check if an action was just activated this frame
     * @param {string} action - Action name
     * @returns {boolean} True if just activated
     */
    isActionJustActivated(action) {
        // Check all keys mapped to this action
        for (const [key, mappedAction] of this.keyMappings) {
            if (mappedAction === action && this.isKeyJustPressed(key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Reset all key states (useful when losing focus)
     */
    reset() {
        this.keys.clear();
        this.previousKeys.clear();
        this.inputState = { throttle: 0, brake: 0, steering: 0 };
    }

    /**
     * Check if any input is active
     * @returns {boolean} True if any key is pressed
     */
    isAnyInputActive() {
        for (const value of this.keys.values()) {
            if (value) return true;
        }
        return false;
    }
}

// Default control mappings constant
export const DEFAULT_CONTROLS = {
    THROTTLE: 'ArrowUp',
    BRAKE: 'ArrowDown',
    STEER_LEFT: 'ArrowLeft',
    STEER_RIGHT: 'ArrowRight',
    THROTTLE_ALT: 'KeyW',
    BRAKE_ALT: 'KeyS',
    STEER_LEFT_ALT: 'KeyA',
    STEER_RIGHT_ALT: 'KeyD'
};
