/**
 * Ball class for the rotating hexagon simulation
 * Handles ball physics, rendering, and collision detection
 */

class Ball {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        
        // Velocity
        this.vx = 0;
        this.vy = 0;
        
        // Mass is proportional to area (radius squared)
        this.mass = radius * radius;
        
        // Trail positions for visual effect
        this.trail = [];
        this.maxTrailLength = 8;
        
        // Visual properties
        this.strokeColor = this.darkenColor(color, 0.3);
    }
    
    /**
     * Darken a hex color by a percentage
     */
    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    /**
     * Apply physics to the ball
     */
    update(gravity, friction, deltaTime) {
        // Apply gravity
        this.vy += gravity;
        
        // Apply air friction
        this.vx *= friction;
        this.vy *= friction;
        
        // Update position
        const scale = deltaTime / (1000 / 60);
        this.x += this.vx * scale;
        this.y += this.vy * scale;
        
        // Update trail
        this.updateTrail();
    }
    
    /**
     * Update the ball's trail
     */
    updateTrail() {
        // Add current position to trail
        this.trail.push({ x: this.x, y: this.y });
        
        // Limit trail length
        while (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
    }
    
    /**
     * Check and resolve collision with hexagon walls
     */
    checkWallCollision(hexagon, elasticity) {
        const walls = hexagon.walls;
        
        for (let i = 0; i < walls.length; i++) {
            const wall = walls[i];
            
            // Calculate closest point on wall to ball center
            const result = Physics.pointToLineDistance(
                this.x, this.y,
                wall.startX, wall.startY,
                wall.endX, wall.endY
            );
            
            const dist = result.distance;
            
            // Check if ball is colliding with wall
            if (dist < this.radius) {
                // Get wall normal
                const normal = hexagon.getWallNormal(i);
                
                // Get wall velocity at ball position
                const wallVel = hexagon.getWallVelocity(this.x, this.y);
                
                // Resolve collision
                Physics.resolveWallCollision(this, normal, wallVel, elasticity);
                
                // Push ball out of wall
                const overlap = this.radius - dist;
                this.x += normal.x * overlap;
                this.y += normal.y * overlap;
            }
        }
    }
    
    /**
     * Check and resolve collision with another ball
     */
    checkBallCollision(otherBall, elasticity) {
        if (Physics.circleToCircleCollision(this, otherBall)) {
            Physics.resolveBallCollision(this, otherBall, elasticity);
        }
    }
    
    /**
     * Render the ball on the canvas
     */
    render(ctx) {
        // Draw trail first (behind ball)
        this.renderTrail(ctx);
        
        // Draw glow effect
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        
        // Create radial gradient for ball
        const gradient = ctx.createRadialGradient(
            this.x - this.radius * 0.3,
            this.y - this.radius * 0.3,
            0,
            this.x,
            this.y,
            this.radius
        );
        
        // Lighter center
        gradient.addColorStop(0, this.lightenColor(this.color, 0.4));
        gradient.addColorStop(0.7, this.color);
        gradient.addColorStop(1, this.strokeColor);
        
        // Draw ball
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Stroke
        ctx.strokeStyle = this.strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
    
    /**
     * Render the ball's trail
     */
    renderTrail(ctx) {
        if (this.trail.length < 2) return;
        
        ctx.save();
        
        for (let i = 0; i < this.trail.length; i++) {
            const pos = this.trail[i];
            const alpha = (i + 1) / this.trail.length * 0.3;
            const size = this.radius * ((i + 1) / this.trail.length) * 0.5;
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            ctx.fillStyle = this.hexToRgba(this.color, alpha);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    /**
     * Convert hex color to rgba
     */
    hexToRgba(hex, alpha) {
        const num = parseInt(hex.replace('#', ''), 16);
        const R = (num >> 16) & 255;
        const G = (num >> 8) & 255;
        const B = num & 255;
        return `rgba(${R}, ${G}, ${B}, ${alpha})`;
    }
    
    /**
     * Lighten a hex color by a percentage
     */
    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    /**
     * Set initial velocity
     */
    setVelocity(speed, angle) {
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
    }
    
    /**
     * Reset the ball
     */
    reset() {
        this.vx = 0;
        this.vy = 0;
        this.trail = [];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Ball;
}
