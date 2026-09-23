import { Vector2 } from '../utils/Vector2.js';
import { GameConfig } from '../core/Constants.js';

export class Track {
    constructor() {
        this.centerPath = [];
        this.innerBoundary = [];
        this.outerBoundary = [];
        this.checkpoints = [];
        this.finishLine = null;
        this.width = GameConfig.TRACK_WIDTH;
        this.initializeDefaultTrack();
    }
    
    initializeDefaultTrack() {
        // Create a simple oval track
        const centerX = GameConfig.CANVAS_WIDTH / 2;
        const centerY = GameConfig.CANVAS_HEIGHT / 2;
        const trackRadius = 150;
        const numPoints = 32;
        
        // Generate center path
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            const x = centerX + Math.cos(angle) * trackRadius;
            const y = centerY + Math.sin(angle) * trackRadius;
            this.centerPath.push(new Vector2(x, y));
        }
        
        // Generate boundaries
        this.innerBoundary = this.centerPath.map(point => {
            const angle = Math.atan2(point.y - centerY, point.x - centerX);
            return new Vector2(
                point.x - Math.cos(angle) * (this.width / 2),
                point.y - Math.sin(angle) * (this.width / 2)
            );
        });
        
        this.outerBoundary = this.centerPath.map(point => {
            const angle = Math.atan2(point.y - centerY, point.x - centerX);
            return new Vector2(
                point.x + Math.cos(angle) * (this.width / 2),
                point.y + Math.sin(angle) * (this.width / 2)
            );
        });
        
        // Create checkpoints (every 8 points, but exclude finish line)
        for (let i = 0; i < numPoints; i += 8) {
            const start = this.centerPath[i];
            const end = this.centerPath[(i + 1) % numPoints];
            const normal = new Vector2(end.x - start.x, end.y - start.y).perpendicular().normalize();
            
            // Use the first checkpoint as the finish line/start line
            if (i === 0) {
                this.finishLine = {
                    id: 0,
                    start: start,
                    end: end,
                    normal: normal,
                    bounds: this.getSegmentBounds(start, end),
                    isFinishLine: true
                };
            } else {
                this.checkpoints.push({
                    id: i / 8,
                    start: start,
                    end: end,
                    normal: normal,
                    bounds: this.getSegmentBounds(start, end)
                });
            }
        }
    }
    
    getSegmentBounds(start, end) {
        const padding = 5;
        return {
            x: Math.min(start.x, end.x) - padding,
            y: Math.min(start.y, end.y) - padding,
            width: Math.abs(end.x - start.x) + padding * 2,
            height: Math.abs(end.y - start.y) + padding * 2
        };
    }
    
    isOnTrack(position) {
        // More accurate point-in-annulus test for oval track
        const centerX = GameConfig.CANVAS_WIDTH / 2;
        const centerY = GameConfig.CANVAS_HEIGHT / 2;
        const distance = Vector2.distance(position, new Vector2(centerX, centerY));
        
        // Check if within track boundaries (inner radius ~80, outer radius ~280)
        const innerRadius = 80;
        const outerRadius = 280;
        
        return distance > innerRadius && distance < outerRadius;
    }
    
    getTrackBounds() {
        // Return the actual track boundary for collision detection
        return {
            innerBoundary: this.innerBoundary,
            outerBoundary: this.outerBoundary
        };
    }
    
    checkCarCollision(car) {
        // Check if any corner of the car is outside track boundaries
        const corners = car.getCorners();
        let allCornersOnTrack = true;
        
        for (const corner of corners) {
            if (!this.isOnTrack(corner)) {
                allCornersOnTrack = false;
                break;
            }
        }
        
        return !allCornersOnTrack;
    }
    
    getNearestWaypoint(position) {
        let nearestIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < this.centerPath.length; i++) {
            const distance = Vector2.distance(position, this.centerPath[i]);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = i;
            }
        }
        return nearestIndex;
    }
    
    getDistanceAlongTrack(position) {
        const nearestIndex = this.getNearestWaypoint(position);
        return (nearestIndex / this.centerPath.length) * 1000; // arbitrary distance
    }
    
    // Get waypoint ahead of current position for AI navigation
    getWaypointAhead(position, lookAheadDistance = 150) {
        const currentIndex = this.getNearestWaypoint(position);
        let targetIndex = currentIndex;
        let accumulatedDistance = 0;
        
        // Move forward along the path until we reach the look-ahead distance
        while (accumulatedDistance < lookAheadDistance && targetIndex < this.centerPath.length - 1) {
            const nextIndex = (targetIndex + 1) % this.centerPath.length;
            const segmentDistance = Vector2.distance(this.centerPath[targetIndex], this.centerPath[nextIndex]);
            if (accumulatedDistance + segmentDistance > lookAheadDistance) {
                // Interpolate along the segment
                const ratio = (lookAheadDistance - accumulatedDistance) / segmentDistance;
                const start = this.centerPath[targetIndex];
                const end = this.centerPath[nextIndex];
                return new Vector2(
                    start.x + (end.x - start.x) * ratio,
                    start.y + (end.y - start.y) * ratio
                );
            }
            accumulatedDistance += segmentDistance;
            targetIndex = nextIndex;
        }
        
        // If we've gone through the whole track, return the last waypoint
        return this.centerPath[(currentIndex + Math.floor(lookAheadDistance / 50)) % this.centerPath.length];
    }
    
    // Get multiple waypoints ahead for smoother path following
    getWaypointsAhead(position, count = 3, spacing = 80) {
        const waypoints = [];
        let currentPos = position.clone();
        
        for (let i = 0; i < count; i++) {
            const waypoint = this.getWaypointAhead(currentPos, spacing);
            waypoints.push(waypoint);
            currentPos = waypoint;
        }
        
        return waypoints;
    }
    
    getCheckpoint(id) {
        return this.checkpoints.find(cp => cp.id === id);
    }
    
    getFinishLine() {
        return this.finishLine;
    }
    
    queryCollisions(bbox) {
        // Placeholder for spatial queries
        return [];
    }
    
    render(ctx) {
        // Render track
        ctx.fillStyle = '#2a2a2a';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        
        // Fill track area
        ctx.beginPath();
        for (let i = 0; i < this.outerBoundary.length; i++) {
            const point = this.outerBoundary[i];
            if (i === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw inner boundary
        ctx.beginPath();
        for (let i = 0; i < this.innerBoundary.length; i++) {
            const point = this.innerBoundary[i];
            if (i === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw checkpoints
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1;
        for (const checkpoint of this.checkpoints) {
            ctx.beginPath();
            ctx.moveTo(checkpoint.start.x, checkpoint.start.y);
            ctx.lineTo(checkpoint.end.x, checkpoint.end.y);
            ctx.stroke();
        }
    }
}