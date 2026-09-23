/**
 * Main entry point for the rotating hexagon physics simulation
 * Handles initialization, game loop, and rendering
 */

// Ball colors from specification
const BALL_COLORS = [
    '#ff3366', // Hot Pink
    '#33ff66', // Lime Green
    '#3366ff', // Electric Blue
    '#ffff33', // Yellow
    '#ff33ff', // Magenta
    '#33ffff', // Cyan
    '#ff9933', // Orange
    '#ffffff', // White
    '#ff6666', // Light Red
    '#66ff66', // Light Green
    '#6666ff', // Light Blue
    '#ffff66', // Light Yellow
    '#ff66ff', // Light Magenta
    '#66ffff', // Light Cyan
    '#ffaa66'  // Light Orange
];

/**
 * Main Simulation class
 */
class Simulation {
    constructor() {
        // Get canvas and context
        this.canvas = document.getElementById('simulationCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Canvas dimensions
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Physics parameters
        this.gravity = 0.5;
        this.friction = 0.995;
        this.elasticity = 0.85;
        
        // Create hexagon
        this.hexagon = new Hexagon(
            this.width / 2,
            this.height / 2,
            350
        );
        
        // Balls array
        this.balls = [];
        
        // Simulation state
        this.paused = false;
        this.lastTime = 0;
        this.elapsedTime = 0;
        
        // FPS tracking
        this.fps = 60;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
        
        // Initialize balls
        this.setBallCount(8);
        
        // Create UI
        this.ui = new UI(this);
        
        // Start the simulation
        this.init();
    }
    
    /**
     * Initialize the simulation
     */
    init() {
        // Set up animation loop
        this.lastTime = performance.now();
        this.fpsUpdateTime = this.lastTime;
        
        // Start the game loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    /**
     * Set the number of balls
     */
    setBallCount(count) {
        // Clear existing balls
        this.balls = [];
        
        // Create new balls
        for (let i = 0; i < count; i++) {
            this.createBall(i);
        }
        
        // Update UI
        if (this.ui) {
            this.ui.updateBallCount(count);
        }
    }
    
    /**
     * Create a single ball
     */
    createBall(index) {
        // Get random position inside hexagon
        const pos = this.hexagon.getRandomPointInside();
        
        // Random radius between 15 and 35
        const radius = 15 + Math.random() * 20;
        
        // Get color from palette (cycle through colors)
        const color = BALL_COLORS[index % BALL_COLORS.length];
        
        // Create ball
        const ball = new Ball(pos.x, pos.y, radius, color);
        
        // Set random initial velocity (2-8 pixels per frame)
        const speed = 2 + Math.random() * 6;
        const angle = Math.random() * Math.PI * 2;
        ball.setVelocity(speed, angle);
        
        this.balls.push(ball);
    }
    
    /**
     * Main game loop
     */
    gameLoop(currentTime) {
        // Calculate delta time
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Update FPS counter
        this.frameCount++;
        if (currentTime - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = currentTime;
            
            // Update UI
            if (this.ui) {
                this.ui.updateFPS(this.fps);
            }
        }
        
        // Update elapsed time
        if (!this.paused) {
            this.elapsedTime += deltaTime / 1000;
            
            // Update UI time display
            if (this.ui) {
                this.ui.updateTime(this.elapsedTime);
            }
        }
        
        // Update simulation
        if (!this.paused) {
            this.update(deltaTime);
        }
        
        // Render
        this.render();
        
        // Continue loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    /**
     * Update simulation state
     */
    update(deltaTime) {
        // Update hexagon rotation
        this.hexagon.update(deltaTime);
        
        // Update each ball
        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i];
            
            // Apply physics
            ball.update(this.gravity, this.friction, deltaTime);
            
            // Check wall collisions
            ball.checkWallCollision(this.hexagon, this.elasticity);
            
            // Check ball-to-ball collisions
            for (let j = i + 1; j < this.balls.length; j++) {
                ball.checkBallCollision(this.balls[j], this.elasticity);
            }
        }
        
        // Keep balls inside canvas bounds (safety check)
        this.constrainBallsToCanvas();
    }
    
    /**
     * Constrain balls to canvas bounds (safety check)
     */
    constrainBallsToCanvas() {
        const padding = 5;
        
        for (const ball of this.balls) {
            if (ball.x - ball.radius < padding) {
                ball.x = ball.radius + padding;
                ball.vx = Math.abs(ball.vx) * 0.5;
            }
            if (ball.x + ball.radius > this.width - padding) {
                ball.x = this.width - ball.radius - padding;
                ball.vx = -Math.abs(ball.vx) * 0.5;
            }
            if (ball.y - ball.radius < padding) {
                ball.y = ball.radius + padding;
                ball.vy = Math.abs(ball.vy) * 0.5;
            }
            if (ball.y + ball.radius > this.height - padding) {
                ball.y = this.height - ball.radius - padding;
                ball.vy = -Math.abs(ball.vy) * 0.5;
            }
        }
    }
    
    /**
     * Render the simulation
     */
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw background gradient
        this.drawBackground();
        
        // Draw hexagon
        this.hexagon.render(this.ctx);
        
        // Draw balls
        for (const ball of this.balls) {
            ball.render(this.ctx);
        }
    }
    
    /**
     * Draw background
     */
    drawBackground() {
        // Create radial gradient
        const gradient = this.ctx.createRadialGradient(
            this.width / 2,
            this.height / 2,
            0,
            this.width / 2,
            this.height / 2,
            this.width / 2
        );
        
        gradient.addColorStop(0, '#1a1a3a');
        gradient.addColorStop(1, '#0a0a1a');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    /**
     * Reset the simulation
     */
    reset() {
        // Reset hexagon
        this.hexagon.reset();
        
        // Reset balls
        const count = this.balls.length;
        this.setBallCount(count);
        
        // Reset time
        this.elapsedTime = 0;
        
        // Update UI
        if (this.ui) {
            this.ui.syncWithSimulation();
            this.ui.updateTime(0);
        }
    }
    
    /**
     * Toggle pause state
     */
    togglePause() {
        this.paused = !this.paused;
    }
}

// Initialize simulation when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const simulation = new Simulation();
});
