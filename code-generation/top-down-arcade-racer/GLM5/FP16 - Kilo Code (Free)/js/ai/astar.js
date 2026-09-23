import { Vector2 } from '../physics/vector2.js';

/**
 * A* Pathfinding Algorithm
 * Finds optimal path through the navigation grid
 */
export class AStar {
    constructor(navGrid) {
        this.navGrid = navGrid;
        
        // Pre-allocated arrays for performance
        this.openSet = [];
        this.closedSet = new Set();
        this.cameFrom = new Map();
        this.gScore = new Map();
        this.fScore = new Map();
    }
    
    /**
     * Find path from start to goal position
     * Returns array of Vector2 waypoints or null if no path found
     */
    findPath(startX, startY, goalX, goalY) {
        // Convert to grid coordinates
        const start = this.navGrid.worldToGrid(startX, startY);
        const goal = this.navGrid.worldToGrid(goalX, goalY);
        
        // Validate start and goal
        if (!this.navGrid.isWalkable(start.x, start.y) ||
            !this.navGrid.isWalkable(goal.x, goal.y)) {
            return null;
        }
        
        // Clear previous data
        this.openSet = [];
        this.closedSet.clear();
        this.cameFrom.clear();
        this.gScore.clear();
        this.fScore.clear();
        
        // Initialize start node
        const startIdx = this.navGrid.getIndex(start.x, start.y);
        const goalIdx = this.navGrid.getIndex(goal.x, goal.y);
        
        this.gScore.set(startIdx, 0);
        this.fScore.set(startIdx, this.heuristic(start, goal));
        this.openSet.push({ x: start.x, y: start.y, idx: startIdx });
        
        let iterations = 0;
        const maxIterations = 5000; // Prevent infinite loops
        
        while (this.openSet.length > 0 && iterations < maxIterations) {
            iterations++;
            
            // Get node with lowest fScore
            this.openSet.sort((a, b) => 
                (this.fScore.get(a.idx) || Infinity) - 
                (this.fScore.get(b.idx) || Infinity)
            );
            
            const current = this.openSet.shift();
            
            // Check if we reached the goal
            if (current.idx === goalIdx) {
                return this.reconstructPath(current);
            }
            
            this.closedSet.add(current.idx);
            
            // Check neighbors
            const neighbors = this.navGrid.getNeighbors(current.x, current.y);
            
            for (const neighbor of neighbors) {
                const neighborIdx = this.navGrid.getIndex(neighbor.x, neighbor.y);
                
                if (this.closedSet.has(neighborIdx)) {
                    continue;
                }
                
                // Calculate tentative gScore
                const moveCost = neighbor.diagonal ? 1.414 : 1;
                const tentativeG = (this.gScore.get(current.idx) || Infinity) + moveCost;
                
                // Check if this path is better
                const currentG = this.gScore.get(neighborIdx) || Infinity;
                
                if (tentativeG < currentG) {
                    // This path is better
                    this.cameFrom.set(neighborIdx, current);
                    this.gScore.set(neighborIdx, tentativeG);
                    this.fScore.set(neighborIdx, tentativeG + this.heuristic(neighbor, goal));
                    
                    // Add to open set if not already there
                    if (!this.openSet.some(n => n.idx === neighborIdx)) {
                        this.openSet.push({ 
                            x: neighbor.x, 
                            y: neighbor.y, 
                            idx: neighborIdx 
                        });
                    }
                }
            }
        }
        
        // No path found
        return null;
    }
    
    /**
     * Heuristic function (Manhattan distance with diagonal adjustment)
     */
    heuristic(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        // Octile distance for 8-directional movement
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    }
    
    /**
     * Reconstruct path from goal to start
     */
    reconstructPath(goalNode) {
        const path = [];
        let current = goalNode;
        
        while (current) {
            const worldPos = this.navGrid.gridToWorld(current.x, current.y);
            path.unshift(worldPos);
            current = this.cameFrom.get(this.navGrid.getIndex(current.x, current.y));
        }
        
        // Smooth the path
        return this.smoothPath(path);
    }
    
    /**
     * Smooth path by removing unnecessary waypoints
     */
    smoothPath(path) {
        if (path.length <= 2) return path;
        
        const smoothed = [path[0]];
        
        for (let i = 1; i < path.length - 1; i++) {
            const prev = smoothed[smoothed.length - 1];
            const curr = path[i];
            const next = path[i + 1];
            
            // Calculate direction change
            const dir1 = Vector2.subtract(curr, prev).normalize();
            const dir2 = Vector2.subtract(next, curr).normalize();
            
            // Keep waypoint if direction changes significantly
            const dot = dir1.dot(dir2);
            if (dot < 0.95) { // About 18 degrees change
                smoothed.push(curr);
            }
        }
        
        smoothed.push(path[path.length - 1]);
        return smoothed;
    }
    
    /**
     * Find path to a series of waypoints
     */
    findPathThroughWaypoints(startX, startY, waypoints) {
        if (waypoints.length === 0) return null;
        
        let fullPath = [];
        let currentX = startX;
        let currentY = startY;
        
        for (const waypoint of waypoints) {
            const path = this.findPath(currentX, currentY, waypoint.x, waypoint.y);
            
            if (path) {
                // Skip first point if we already have points
                if (fullPath.length > 0) {
                    path.shift();
                }
                fullPath = fullPath.concat(path);
                currentX = waypoint.x;
                currentY = waypoint.y;
            }
        }
        
        return fullPath.length > 0 ? fullPath : null;
    }
    
    /**
     * Render path for debugging
     */
    renderPath(ctx, path, color = 'yellow') {
        if (!path || path.length < 2) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw waypoints
        ctx.fillStyle = color;
        for (const point of path) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
