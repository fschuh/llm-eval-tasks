import { Vector2 } from '../physics/vector2.js';
import { CONFIG } from '../config.js';

/**
 * Navigation Grid for A* Pathfinding
 * Discretizes the track into a grid for pathfinding
 */
export class NavGrid {
    constructor(track) {
        this.track = track;
        this.cellSize = 20; // Size of each grid cell
        this.gridWidth = Math.ceil(CONFIG.CANVAS_WIDTH / this.cellSize);
        this.gridHeight = Math.ceil(CONFIG.CANVAS_HEIGHT / this.cellSize);
        
        // Grid data: 0 = blocked, 1 = drivable
        this.grid = new Array(this.gridWidth * this.gridHeight);
        
        // Precompute costs and neighbors
        this.generateGrid();
    }
    
    /**
     * Generate the navigation grid based on track geometry
     */
    generateGrid() {
        const halfTrackWidth = this.track.trackWidth / 2 - 10;
        
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const worldX = (x + 0.5) * this.cellSize;
                const worldY = (y + 0.5) * this.cellSize;
                const pos = new Vector2(worldX, worldY);
                
                // Check if this cell is on the track
                let onTrack = false;
                let minDist = Infinity;
                
                for (let i = 0; i < this.track.centerLine.length - 1; i++) {
                    const dist = this.distanceToSegment(
                        pos,
                        this.track.centerLine[i],
                        this.track.centerLine[i + 1]
                    );
                    minDist = Math.min(minDist, dist);
                }
                
                onTrack = minDist < halfTrackWidth;
                
                this.grid[y * this.gridWidth + x] = onTrack ? 1 : 0;
            }
        }
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
     * Convert world position to grid coordinates
     */
    worldToGrid(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.cellSize),
            y: Math.floor(worldY / this.cellSize)
        };
    }
    
    /**
     * Convert grid coordinates to world position (center of cell)
     */
    gridToWorld(gridX, gridY) {
        return new Vector2(
            (gridX + 0.5) * this.cellSize,
            (gridY + 0.5) * this.cellSize
        );
    }
    
    /**
     * Check if grid cell is walkable (drivable)
     */
    isWalkable(gridX, gridY) {
        if (gridX < 0 || gridX >= this.gridWidth || 
            gridY < 0 || gridY >= this.gridHeight) {
            return false;
        }
        return this.grid[gridY * this.gridWidth + gridX] === 1;
    }
    
    /**
     * Get node index from grid coordinates
     */
    getIndex(gridX, gridY) {
        return gridY * this.gridWidth + gridX;
    }
    
    /**
     * Get grid coordinates from index
     */
    fromIndex(index) {
        return {
            x: index % this.gridWidth,
            y: Math.floor(index / this.gridWidth)
        };
    }
    
    /**
     * Get neighbors of a grid cell (8-directional)
     */
    getNeighbors(gridX, gridY) {
        const neighbors = [];
        const directions = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],          [1, 0],
            [-1, 1],  [0, 1],  [1, 1]
        ];
        
        for (const [dx, dy] of directions) {
            const nx = gridX + dx;
            const ny = gridY + dy;
            
            if (this.isWalkable(nx, ny)) {
                // For diagonal movement, check if we can actually go there
                if (dx !== 0 && dy !== 0) {
                    // Check if both cardinal directions are walkable
                    if (!this.isWalkable(gridX + dx, gridY) || 
                        !this.isWalkable(gridX, gridY + dy)) {
                        continue; // Can't cut corners
                    }
                }
                neighbors.push({ x: nx, y: ny, diagonal: dx !== 0 && dy !== 0 });
            }
        }
        
        return neighbors;
    }
    
    /**
     * Render the navigation grid (debug)
     */
    render(ctx) {
        if (!window.DEBUG_MODE) return;
        
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const walkable = this.grid[y * this.gridWidth + x];
                
                if (!walkable) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
                    ctx.fillRect(
                        x * this.cellSize,
                        y * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        }
    }
}
