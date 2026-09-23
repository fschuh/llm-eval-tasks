/**
 * Keyboard Input Handler
 * 
 * Handles keyboard input for WASD and arrow keys,
 * providing a clean interface for game input.
 */
export class InputHandler {
    constructor() {
        this._keys = {};
        this._pressed = {};
        this._released = {};
        
        this._setupEventListeners();
    }

    /**
     * Sets up keyboard event listeners
     * @private
     */
    _setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this._keys[e.code] = true;
            this._pressed[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this._keys[e.code] = false;
            this._released[e.code] = true;
        });
    }

    /**
     * Checks if a key is currently pressed
     * @param {string} key - Key code (e.g., 'KeyW', 'ArrowUp')
     * @returns {boolean} True if key is pressed
     */
    isPressed(key) {
        return !!this._keys[key];
    }

    /**
     * Checks if a key was just pressed this frame
     * @param {string} key - Key code
     * @returns {boolean} True if key was just pressed
     */
    wasPressed(key) {
        return !!this._pressed[key];
    }

    /**
     * Checks if a key was just released this frame
     * @param {string} key - Key code
     * @returns {boolean} True if key was just released
     */
    wasReleased(key) {
        return !!this._released[key];
    }

    /**
     * Checks if a key has been held for a specific duration
     * @param {string} key - Key code
     * @param {number} duration - Duration in seconds
     * @returns {boolean} True if key has been held
     */
    isHeld(key, duration) {
        if (!this._keys[key]) return false;
        
        // Track hold time per key
        if (!this._holdTimes) this._holdTimes = {};
        if (!this._holdTimes[key]) this._holdTimes[key] = 0;
        
        this._holdTimes[key] += 1 / 60; // Approximate frame time
        return this._holdTimes[key] >= duration;
    }

    /**
     * Resets the pressed/released state for all keys
     * Should be called once per frame after processing input
     */
    reset() {
        this._pressed = {};
        this._released = {};
        if (this._holdTimes) {
            for (const key in this._holdTimes) {
                if (!this._keys[key]) {
                    delete this._holdTimes[key];
                }
            }
        }
    }

    /**
     * Gets the current input state for a car
     * @returns {Object} Input state object
     */
    getCarInput() {
        return {
            throttle: this._getThrottle(),
            brake: this._getBrake(),
            steer: this._getSteer(),
            handbrake: this.isPressed('Space')
        };
    }

    /**
     * Gets throttle input (W or Up arrow)
     * @returns {number} 0 to 1
     */
    _getThrottle() {
        if (this.isPressed('KeyW') || this.isPressed('ArrowUp')) {
            return 1;
        }
        return 0;
    }

    /**
     * Gets brake input (S or Down arrow)
     * @returns {number} 0 to 1
     */
    _getBrake() {
        if (this.isPressed('KeyS') || this.isPressed('ArrowDown')) {
            return 1;
        }
        return 0;
    }

    /**
     * Gets steering input (A/D or Left/Right arrows)
     * @returns {number} -1 to 1
     */
    _getSteer() {
        let steer = 0;
        if (this.isPressed('KeyA') || this.isPressed('ArrowLeft')) {
            steer = -1;
        }
        if (this.isPressed('KeyD') || this.isPressed('ArrowRight')) {
            steer = 1;
        }
        return steer;
    }

    /**
     * Checks if any car control key is pressed
     * @returns {boolean} True if any control key is pressed
     */
    hasCarInput() {
        return (
            this.isPressed('KeyW') || this.isPressed('ArrowUp') ||
            this.isPressed('KeyS') || this.isPressed('ArrowDown') ||
            this.isPressed('KeyA') || this.isPressed('ArrowLeft') ||
            this.isPressed('KeyD') || this.isPressed('ArrowRight') ||
            this.isPressed('Space')
        );
    }

    /**
     * Resets all input state
     */
    clear() {
        this._keys = {};
        this._pressed = {};
        this._released = {};
        this._holdTimes = {};
    }
}