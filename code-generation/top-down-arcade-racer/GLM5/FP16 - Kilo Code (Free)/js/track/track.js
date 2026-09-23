import { Vector2 } from '../physics/vector2.js';
import { CONFIG } from '../config.js';

/**
 * Track System
 * Defines the racing circuit with walls and checkpoints
 */
export class Track {
    constructor() {
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        this.trackWidth = CONFIG.TRACK_WIDTH;
        
        // Track center line points (defines the circuit)
        this.centerLine = this.generateCenterLine();
        
        // Generate walls from center line
        this.outerWalls = [];
        this.innerWalls = [];
        this.generateWalls();
        
        // Checkpoints for lap detection
        this.checkpoints = [];
        this.generateCheckpoints();
        
        // Start position and direction
        this.startPosition = this.centerLine[0].clone();
        this.startAngle = this.calculateStartAngle();
        
        // All wall segments combined for collision
        this.allWalls = [...this.outerWalls, ...this.innerWalls];
    }
    
    /**
     * Generate center line points for a complex circuit
     */
    generateCenterLine() {
        const cx = this.width / 2;
        const cy = this.height / 2;
        
        // Create a more complex circuit with various turns
        const points = [
            // Start/finish straight
            new Vector2(150, cy + 100),
            new Vector2(250, cy + 100),
            // First right turn
            new Vector2(350, cy + 80),
            new Vector2(420, cy + 30),
            // Back straight curve
            new Vector2(480, cy - 50),
            new Vector2(520, cy - 150),
            // Tight left turn
            new Vector2(480, cy - 250),
            new Vector2(400, cy - 300),
            // Top section
            new Vector2(300, cy - 320),
            new Vector2(180, cy - 300),
            // Chicane
            new Vector2(120, cy - 250),
            new Vector2(150, cy - 180),
            new Vector2(120, cy - 100),
            // Left turn down
            new Vector2(80, cy),
            new Vector2(100, cy + 80),
            // Bottom left corner
            new Vector2(150, cy + 150),
            new Vector2(250, cy + 180),
            // Bottom straight
            new Vector2(400, cy + 200),
            new Vector2(550, cy + 180),
            // Right hander
            new Vector2(700, cy + 120),
            new Vector2(800, cy + 50),
            // Far right section
            new Vector2(900, cy - 30),
            new Vector2(950, cy - 150),
            // Top right
            new Vector2(920, cy - 280),
            new Vector2(820, cy - 350),
            // Back across
            new Vector2(650, cy - 350),
            new Vector2(500, cy - 320),
            // Connecting back
            new Vector2(400, cy - 280),
            new Vector2(350, cy - 200),
            new Vector2(320, cy - 100),
            new Vector2(280, cy),
            new Vector2(220, cy + 50),
            // Back to start
            new Vector2(150, cy + 100)
        ];
        
        return points;
    }
    
    /**
     * Generate wall segments from center line
     */
    generateWalls() {
        const halfWidth = this.trackWidth / 2;
        
        for (let i = 0; i < this.centerLine.length - 1; i++) {
            const current = this.centerLine[i];
            const next = this.centerLine[i + 1];
            
            // Calculate direction and perpendicular
            const direction = Vector2.subtract(next, current);
            direction.normalize();
            const perpendicular = direction.perpendicular();
            
            // Create wall points
            const outerStart = Vector2.add(current, Vector2.multiply(perpendicular.clone(), halfWidth));
            const outerEnd = Vector2.add(next, Vector2.multiply(perpendicular.clone(), halfWidth));
            const innerStart = Vector2.subtract(current, Vector2.multiply(perpendicular.clone(), halfWidth));
            const innerEnd = Vector2.subtract(next, Vector2.multiply(perpendicular.clone(), halfWidth));
            
            this.outerWalls.push({ start: outerStart, end: outerEnd });
            this.innerWalls.push({ start: innerStart, end: innerEnd });
        }
    }
    
    /**
     * Generate checkpoints along the track
     */
    generateCheckpoints() {
        const numCheckpoints = CONFIG.CHECKPOINT_COUNT;
        const totalPoints = this.centerLine.length - 1;
        const step = Math.floor(totalPoints / numCheckpoints);
        
        for (let i = 0; i < numCheckpoints; i++) {
            const idx = (i * step) % totalPoints;
            const current = this.centerLine[idx];
            const next = this.centerLine[idx + 1];
            
            // Checkpoint is perpendicular to track at this point
            const direction = Vector2.subtract(next, current);
            direction.normalize();
            const perpendicular = direction.perpendicular();
            
            const halfWidth = this.trackWidth / 2;
            
            this.checkpoints.push({
                index: i,
                position: current.clone(),
                start: Vector2.subtract(current, Vector2.multiply(perpendicular.clone(), halfWidth)),
                end: Vector2.add(current, Vector2.multiply(perpendicular.clone(), halfWidth)),
                direction: direction.clone()
            });
        }
    }
    
    /**
     * Calculate starting angle for cars
     */
    calculateStartAngle() {
        const start = this.centerLine[0];
        const next = this.centerLine[1];
        const direction = Vector2.subtract(next, start);
        return direction.angle();
    }
    
    /**
     * Get track bounds for camera
     */
    getBounds() {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const point of this.centerLine) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
        
        // Add padding for track width
        const padding = this.trackWidth;
        return {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding
        };
    }
    
    /**
     * Check if a point is on the track
     */
    isOnTrack(position) {
        // Find closest point on center line
        let minDist = Infinity;
        
        for (let i = 0; i < this.centerLine.length - 1; i++) {
            const dist = this.distanceToSegment(position, this.centerLine[i], this.centerLine[i + 1]);
            minDist = Math.min(minDist, dist);
        }
        
        return minDist < this.trackWidth / 2;
    }
    
    /**
     * Calculate distance from point to line segment
     */
    distanceToSegment(point, segStart, segEnd) {
        const line = Vector2.subtract(segEnd, segStart);
        const len = line.length();
        
        if (len === 0) return point.distanceTo(segStart);
        
        const t = Math.max(0, Math.min(1, 
            Vector2.subtract(point, segStart).dot(line) / (len * len)
        ));
        
        const projection = Vector2.add(segStart, Vector2.multiply(line, t));
        return point.distanceTo(projection);
    }
    
    /**
     * Get the nearest checkpoint to a position
     */
    getNearestCheckpoint(position) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const checkpoint of this.checkpoints) {
            const dist = position.distanceTo(checkpoint.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = checkpoint;
            }
        }
        
        return nearest;
    }
    
    /**
     * Render the track
     */
    render(ctx) {
        // Draw grass background
        ctx.fillStyle = CONFIG.COLORS.grass;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw track surface
        ctx.strokeStyle = CONFIG.COLORS.track;
        ctx.lineWidth = this.trackWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(this.centerLine[0].x, this.centerLine[0].y);
        for (let i = 1; i < this.centerLine.length; i++) {
            ctx.lineTo(this.centerLine[i].x, this.centerLine[i].y);
        }
        ctx.stroke();
        
        // Draw outer walls
        ctx.strokeStyle = CONFIG.COLORS.wall;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        for (const wall of this.outerWalls) {
            ctx.moveTo(wall.start.x, wall.start.y);
            ctx.lineTo(wall.end.x, wall.end.y);
        }
        ctx.stroke();
        
        // Draw inner walls
        ctx.beginPath();
        for (const wall of this.innerWalls) {
            ctx.moveTo(wall.start.x, wall.start.y);
            ctx.lineTo(wall.end.x, wall.end.y);
        }
        ctx.stroke();
        
        // Draw start/finish line
        const startCheckpoint = this.checkpoints[0];
        ctx.strokeStyle = CONFIG.COLORS.startLine;
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(startCheckpoint.start.x, startCheckpoint.start.y);
        ctx.lineTo(startCheckpoint.end.x, startCheckpoint.end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw checkpoints (debug visualization)
        if (window.DEBUG_MODE) {
            ctx.strokeStyle = CONFIG.COLORS.checkpoint;
            ctx.lineWidth = 2;
            for (let i = 0; i < this.checkpoints.length; i++) {
                const cp = this.checkpoints[i];
                ctx.beginPath();
                ctx.moveTo(cp.start.x, cp.start.y);
                ctx.lineTo(cp.end.x, cp.end.y);
                ctx.stroke();
                
                // Draw checkpoint number
                ctx.fillStyle = 'white';
                ctx.font = '12px Arial';
                ctx.fillText(i.toString(), cp.position.x - 5, cp.position.y + 4);
            }
        }
    }
}
