export class InputHandler {
    constructor() {
        this.keys = new Map();
        this.justPressed = new Map();
        this.justReleased = new Map();
        this.bindings = {
            accelerate: ['KeyW', 'ArrowUp'],
            brake: ['KeyS', 'ArrowDown'],
            steerLeft: ['KeyA', 'ArrowLeft'],
            steerRight: ['KeyD', 'ArrowRight'],
            pause: ['Escape', 'KeyP'],
            restart: ['KeyR']
        };
        this.initialize();
    }
    
    initialize() {
        document.addEventListener('keydown', (e) => {
            if (!this.keys.get(e.code)) {
                this.justPressed.set(e.code, true);
            }
            this.keys.set(e.code, true);
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys.set(e.code, false);
            this.justReleased.set(e.code, true);
        });
    }
    
    isKeyDown(action) {
        const keys = this.bindings[action];
        return keys && keys.some(key => this.keys.get(key));
    }
    
    isKeyJustPressed(action) {
        const keys = this.bindings[action];
        return keys && keys.some(key => this.justPressed.get(key));
    }
    
    isKeyJustReleased(action) {
        const keys = this.bindings[action];
        return keys && keys.some(key => this.justReleased.get(key));
    }
    
    getCarInput() {
        // Return normalized input values for smooth control
        const throttle = this.isKeyDown('accelerate') ? 1 :
                       this.isKeyDown('brake') ? -1 : 0;
        const steering = this.isKeyDown('steerLeft') ? -1 :
                       this.isKeyDown('steerRight') ? 1 : 0;
        
        return {
            throttle: throttle,
            steering: steering
        };
    }
    
    getPlayerInputState() {
        return {
            accelerate: this.isKeyDown('accelerate'),
            brake: this.isKeyDown('brake'),
            left: this.isKeyDown('steerLeft'),
            right: this.isKeyDown('steerRight')
        };
    }
    
    clear() {
        this.justPressed.clear();
        this.justReleased.clear();
    }
}