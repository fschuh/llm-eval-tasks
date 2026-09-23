/**
 * Hexagon class for the rotating hexagon simulation
 * Handles hexagon geometry, rotation, and rendering
 */

class Hexagon {
    constructor(centerX, centerY, radius) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.radius = radius;
        this.angle = 0; // Current rotation angle in radians
        this.rotationSpeed = 1.0; // Radians per second
        this.vertices = [];
        this.walls = []; // Array of wall segments
        
        // Visual properties
        this.lineWidth = 4;
        this.strokeColor = '#00ffff';
        this.strokeColorEnd = '#00aaff';
        this.fillColor = 'rgba(0, 50, 100, 0.1)';
        this.glowColor = 'rgba(0, 255, 255, 0.5)';
        this.vertexRadius = 6;
        
        // Initialize vertices and walls
        this.updateVertices();
    }
    
    /**
     * Update the rotation angle based on delta time
     */
    update(deltaTime) {
        // Convert delta time (ms) to seconds
        const deltaSeconds = deltaTime / 1000;
        this.angle += this.rotationSpeed * deltaSeconds;
        
        // Keep angle in reasonable range
        if (this.angle > Math.PI * 2) {
            this.angle -= Math.PI * 2;
        }
        
        this.updateVertices();
    }
    
    /**
     * Update vertex positions based on current angle
     */
    updateVertices() {
        this.vertices = [];
        this.walls = [];
        
        for (let i = 0; i < 6; i++) {
            // Calculate vertex position
            const vertexAngle = this.angle + (i * Math.PI * 2 / 6);
            const x = this.centerX + this.radius * Math.cos(vertexAngle);
            const y = this.centerY + this.radius * Math.sin(vertexAngle);
            
            this.vertices.push({ x, y });
            
            // Create wall segment (from this vertex to next)
            if (i < 5) {
                this.walls.push({
                    startX: x,
                    startY: y,
                    endX: this.vertices[i + 1].x,
                    endY: this.vertices[i + 1].y,
                    index: i
                });
            }
        }
        
        // Add final wall segment (last to first)
        this.walls.push({
            startX: this.vertices[5].x,
            startY: this.vertices[5].y,
            endX: this.vertices[0].x,
            endY: this.vertices[0].y,
            index: 5
        });
    }
    
    /**
     * Get the wall normal at a specific point on a wall
     */
    getWallNormal(wallIndex) {
        const wall = this.walls[wallIndex];
        if (!wall) return { x: 0, y: 0 };
        
        // Calculate wall direction
        const dx = wall.endX - wall.startX;
        const dy = wall.endY - wall.startY;
        
        // Normal is perpendicular to wall (pointing inward)
        const length = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / length;
        const ny = dx / length;
        
        // Ensure normal points toward center
        const centerNx = this.centerX - (wall.startX + wall.endX) / 2;
        const centerNy = this.centerY - (wall.startY + wall.endY) / 2;
        
        if (nx * centerNx + ny * centerNy < 0) {
            return { x: -nx, y: -ny };
        }
        
        return { x: nx, y: ny };
    }
    
    /**
     * Get wall velocity at a specific position due to rotation
     */
    getWallVelocity(ballX, ballY) {
        // Vector from center to ball position
        const rx = ballX - this.centerX;
        const ry = ballY - this.centerY;
        
        // Tangential velocity = angularVelocity × perpendicular distance
        // For clockwise rotation (positive angularVelocity)
        const wallVelX = -this.rotationSpeed * ry;
        const wallVelY = this.rotationSpeed * rx;
        
        return { x: wallVelX, y: wallVelY };
    }
    
    /**
     * Check if a point is inside the hexagon
     */
    isPointInside(x, y) {
        // Ray casting algorithm
        let inside = false;
        
        for (let i = 0, j = this.vertices.length - 1; i < this.vertices.length; j = i++) {
            const xi = this.vertices[i].x, yi = this.vertices[i].y;
            const xj = this.vertices[j].x, yj = this.vertices[j].y;
            
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }
    
    /**
     * Get a random point inside the hexagon
     */
    getRandomPointInside() {
        let x, y;
        let attempts = 0;
        
        do {
            // Generate random point within bounding box
            x = this.centerX + (Math.random() * 2 - 1) * this.radius * 0.9;
            y = this.centerY + (Math.random() * 2 - 1) * this.radius * 0.9;
            attempts++;
        } while (!this.isPointInside(x, y) && attempts < 100);
        
        return { x, y };
    }
    
    /**
     * Render the hexagon on the canvas
     */
    render(ctx) {
        // Draw glow effect
        ctx.save();
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 20;
        
        // Create gradient for stroke
        const gradient = ctx.createLinearGradient(
            this.vertices[0].x, this.vertices[0].y,
            this.vertices[3].x, this.vertices[3].y
        );
        gradient.addColorStop(0, this.strokeColor);
        gradient.addColorStop(1, this.strokeColorEnd);
        
        // Draw hexagon path
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        
        ctx.closePath();
        
        // Fill
        ctx.fillStyle = this.fillColor;
        ctx.fill();
        
        // Stroke
        ctx.strokeStyle = gradient;
        ctx.lineWidth = this.lineWidth;
        ctx.stroke();
        
        ctx.restore();
        
        // Draw vertex markers
        this.renderVertices(ctx);
    }
    
    /**
     * Render vertex markers
     */
    renderVertices(ctx) {
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            
            // Glow effect
            ctx.save();
            ctx.shadowColor = this.strokeColor;
            ctx.shadowBlur = 10;
            
            ctx.beginPath();
            ctx.arc(v.x, v.y, this.vertexRadius, 0, Math.PI * 2);
            ctx.fillStyle = this.strokeColor;
            ctx.fill();
            
            ctx.restore();
        }
    }
    
    /**
     * Set rotation speed
     */
    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }
    
    /**
     * Reset rotation angle
     */
    reset() {
        this.angle = 0;
        this.updateVertices();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Hexagon;
}
