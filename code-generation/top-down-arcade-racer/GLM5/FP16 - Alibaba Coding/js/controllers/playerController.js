/**
 * Player Controller - Handles keyboard input for the player's car
 */
export class PlayerController {
    constructor() {
        // Input state
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        
        // Bind event handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        
        // Set up event listeners
        this.setupEventListeners();
    }

    /**
     * Set up keyboard event listeners
     */
    setupEventListeners() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    /**
     * Handle key down events
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyDown(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.keys.up = true;
                event.preventDefault();
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.keys.down = true;
                event.preventDefault();
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.keys.left = true;
                event.preventDefault();
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.keys.right = true;
                event.preventDefault();
                break;
        }
    }

    /**
     * Handle key up events
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyUp(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.keys.up = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.keys.down = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.keys.left = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.keys.right = false;
                break;
        }
    }

    /**
     * Update car based on current input state
     * @param {Car} car - The car to control
     * @param {number} dt - Delta time in seconds
     */
    update(car, dt) {
        const throttle = this.keys.up ? 1 : 0;
        const brake = this.keys.down ? 1 : 0;
        
        let steering = 0;
        if (this.keys.left) steering -= 1;
        if (this.keys.right) steering += 1;
        
        car.setInput(throttle, brake, steering);
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}