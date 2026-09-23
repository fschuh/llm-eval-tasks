/**
 * UI module for the rotating hexagon simulation
 * Handles user interface controls and display updates
 */

class UI {
    constructor(simulation) {
        this.simulation = simulation;
        
        // Get DOM elements
        this.gravitySlider = document.getElementById('gravity');
        this.frictionSlider = document.getElementById('friction');
        this.elasticitySlider = document.getElementById('elasticity');
        this.rotationSpeedSlider = document.getElementById('rotationSpeed');
        this.ballCountSlider = document.getElementById('ballCount');
        this.resetBtn = document.getElementById('resetBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        
        // Value displays
        this.gravityValue = document.getElementById('gravityValue');
        this.frictionValue = document.getElementById('frictionValue');
        this.elasticityValue = document.getElementById('elasticityValue');
        this.rotationSpeedValue = document.getElementById('rotationSpeedValue');
        this.ballCountValue = document.getElementById('ballCountValue');
        
        // Info displays
        this.fpsDisplay = document.getElementById('fpsDisplay');
        this.ballCountDisplay = document.getElementById('ballCountDisplay');
        this.timeDisplay = document.getElementById('timeDisplay');
        
        // Initialize event listeners
        this.initEventListeners();
    }
    
    /**
     * Initialize all event listeners
     */
    initEventListeners() {
        // Gravity slider
        this.gravitySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.simulation.gravity = value;
            this.gravityValue.textContent = value.toFixed(1);
        });
        
        // Friction slider
        this.frictionSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.simulation.friction = value;
            this.frictionValue.textContent = value.toFixed(3);
        });
        
        // Elasticity slider
        this.elasticitySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.simulation.elasticity = value;
            this.elasticityValue.textContent = value.toFixed(2);
        });
        
        // Rotation speed slider
        this.rotationSpeedSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.simulation.hexagon.setRotationSpeed(value);
            this.rotationSpeedValue.textContent = value.toFixed(1);
        });
        
        // Ball count slider
        this.ballCountSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.ballCountValue.textContent = value;
            this.simulation.setBallCount(value);
        });
        
        // Reset button
        this.resetBtn.addEventListener('click', () => {
            this.simulation.reset();
        });
        
        // Pause button
        this.pauseBtn.addEventListener('click', () => {
            this.simulation.togglePause();
            this.pauseBtn.textContent = this.simulation.paused ? 'Play' : 'Pause';
        });
    }
    
    /**
     * Update FPS display
     */
    updateFPS(fps) {
        this.fpsDisplay.textContent = Math.round(fps);
    }
    
    /**
     * Update ball count display
     */
    updateBallCount(count) {
        this.ballCountDisplay.textContent = count;
    }
    
    /**
     * Update time display
     */
    updateTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        this.timeDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Sync UI values with simulation values
     */
    syncWithSimulation() {
        this.gravitySlider.value = this.simulation.gravity;
        this.gravityValue.textContent = this.simulation.gravity.toFixed(1);
        
        this.frictionSlider.value = this.simulation.friction;
        this.frictionValue.textContent = this.simulation.friction.toFixed(3);
        
        this.elasticitySlider.value = this.simulation.elasticity;
        this.elasticityValue.textContent = this.simulation.elasticity.toFixed(2);
        
        this.rotationSpeedSlider.value = this.simulation.hexagon.rotationSpeed;
        this.rotationSpeedValue.textContent = this.simulation.hexagon.rotationSpeed.toFixed(1);
        
        this.ballCountSlider.value = this.simulation.balls.length;
        this.ballCountValue.textContent = this.simulation.balls.length;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
