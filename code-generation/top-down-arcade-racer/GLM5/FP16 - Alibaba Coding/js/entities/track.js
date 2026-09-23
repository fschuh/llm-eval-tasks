import { Vector2D } from '../utils/vector2d.js';

/**
 * Track class - Defines the racing track with boundaries, waypoints, and checkpoints
 */
export class Track {
    /**
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    constructor(width, height) {
        this.width = width;
        this.height = height;
        
        // Track dimensions (oval shape)
        this.centerX = width / 2;
        this.centerY = height / 2;
        this.outerRadiusX = 350;
        this.outerRadiusY = 250;
        this.innerRadiusX = 200;
        this.innerRadiusY = 120;
        this.trackWidth = 80;
        
        // Colors
        this.trackColor = '#3d3d3d';
        this.grassColor = '#2d5a27';
        this.innerGrassColor = '#2a6a22';
        this.lineColor = '#ffffff';
        this.checkpointColor = 'rgba(255, 255, 0, 0.3)';
        this.startLineColor = '#ffffff';
        
        // Generate track elements
        this.waypoints = this.generateWaypoints();
        this.checkpoints = this.generateCheckpoints();
        this.innerWall = this.generateWallPath(true);
        this.outerWall = this.generateWallPath(false);
        
        // Start positions
        this.startLine = {
            x1: this.centerX,
            y1: this.centerY + this.innerRadiusY + 10,
            x2: this.centerX,
            y2: this.centerY + this.outerRadiusY - 10
        };
    }

    /**
     * Generate AI waypoints around the track
     * @returns {Array<Vector2D>} Array of waypoint positions
     */
    generateWaypoints() {
        const waypoints = [];
        const numPoints = 12;
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            // Place waypoints in the middle of the track
            const midRadiusX = (this.outerRadiusX + this.innerRadiusX) / 2;
            const midRadiusY = (this.outerRadiusY + this.innerRadiusY) / 2;
            
            waypoints.push(new Vector2D(
                this.centerX + Math.cos(angle) * midRadiusX,
                this.centerY + Math.sin(angle) * midRadiusY
            ));
        }
        
        return waypoints;
    }

    /**
     * Generate checkpoint lines for lap detection
     * @returns {Array<Object>} Array of checkpoint objects
     */
    generateCheckpoints() {
        const checkpoints = [];
        const numCheckpoints = 4;
        
        for (let i = 0; i < numCheckpoints; i++) {
            const angle = (i / numCheckpoints) * Math.PI * 2;
            checkpoints.push({
                x1: this.centerX + Math.cos(angle) * this.innerRadiusX,
                y1: this.centerY + Math.sin(angle) * this.innerRadiusY,
                x2: this.centerX + Math.cos(angle) * this.outerRadiusX,
                y2: this.centerY + Math.sin(angle) * this.outerRadiusY,
                index: i
            });
        }
        
        return checkpoints;
    }

    /**
     * Generate wall path points for collision detection
     * @param {boolean} inner - True for inner wall, false for outer
     * @returns {Array<Vector2D>} Array of path points
     */
    generateWallPath(inner) {
        const points = [];
        const numPoints = 64;
        const radiusX = inner ? this.innerRadiusX : this.outerRadiusX;
        const radiusY = inner ? this.innerRadiusY : this.outerRadiusY;
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            points.push(new Vector2D(
                this.centerX + Math.cos(angle) * radiusX,
                this.centerY + Math.sin(angle) * radiusY
            ));
        }
        
        return points;
    }

    /**
     * Get the closest waypoint to a position
     * @param {Vector2D} position - Current position
     * @returns {Object} Waypoint info { index, position, distance }
     */
    getClosestWaypoint(position) {
        let minDist = Infinity;
        let closestIndex = 0;
        
        for (let i = 0; i < this.waypoints.length; i++) {
            const dist = position.distanceToSq(this.waypoints[i]);
            if (dist < minDist) {
                minDist = dist;
                closestIndex = i;
            }
        }
        
        return {
            index: closestIndex,
            position: this.waypoints[closestIndex],
            distance: Math.sqrt(minDist)
        };
    }

    /**
     * Get the next waypoint in sequence
     * @param {number} currentIndex - Current waypoint index
     * @returns {Object} Next waypoint info
     */
    getNextWaypoint(currentIndex) {
        const nextIndex = (currentIndex + 1) % this.waypoints.length;
        return {
            index: nextIndex,
            position: this.waypoints[nextIndex]
        };
    }

    /**
     * Get starting positions for cars
     * @param {number} carIndex - Car index (0 = player pole position)
     * @returns {Object} Start position and angle
     */
    getStartPosition(carIndex) {
        // Grid positions: 2 cars per row, staggered
        const row = Math.floor(carIndex / 2);
        const col = carIndex % 2;
        const rowOffset = row * 40;
        const colOffset = (col - 0.5) * 30;
        
        // Start at bottom of track, facing clockwise
        const midRadius = (this.outerRadiusY + this.innerRadiusY) / 2;
        
        return {
            x: this.centerX + colOffset,
            y: this.centerY + midRadius + rowOffset,
            angle: -Math.PI / 2 // Facing right (clockwise direction)
        };
    }

    /**
     * Check if a point is on the track surface
     * @param {Vector2D} point - Point to check
     * @returns {boolean} True if on track
     */
    isOnTrack(point) {
        // Check if point is within outer ellipse and outside inner ellipse
        const normalizedOuter = 
            Math.pow((point.x - this.centerX) / this.outerRadiusX, 2) +
            Math.pow((point.y - this.centerY) / this.outerRadiusY, 2);
        
        const normalizedInner = 
            Math.pow((point.x - this.centerX) / this.innerRadiusX, 2) +
            Math.pow((point.y - this.centerY) / this.innerRadiusY, 2);
        
        return normalizedOuter <= 1 && normalizedInner >= 1;
    }

    /**
     * Check line segment intersection with a wall
     * @param {Vector2D} p1 - Start of line segment
     * @param {Vector2D} p2 - End of line segment
     * @param {Array<Vector2D>} wall - Wall path points
     * @returns {Object|null} Collision info or null
     */
    checkWallIntersection(p1, p2, wall) {
        let minDist = Infinity;
        let collision = null;
        
        for (let i = 0; i < wall.length; i++) {
            const w1 = wall[i];
            const w2 = wall[(i + 1) % wall.length];
            
            const intersection = this.lineSegmentIntersection(p1, p2, w1, w2);
            if (intersection) {
                const dist = p1.distanceTo(intersection.point);
                if (dist < minDist) {
                    minDist = dist;
                    collision = intersection;
                }
            }
        }
        
        return collision;
    }

    /**
     * Line segment intersection test
     * @param {Vector2D} p1 - First segment start
     * @param {Vector2D} p2 - First segment end
     * @param {Vector2D} p3 - Second segment start
     * @param {Vector2D} p4 - Second segment end
     * @returns {Object|null} Intersection info
     */
    lineSegmentIntersection(p1, p2, p3, p4) {
        const d1 = Vector2D.sub(p2, p1);
        const d2 = Vector2D.sub(p4, p3);
        
        const denom = d1.cross(d2);
        if (Math.abs(denom) < 0.0001) return null; // Parallel lines
        
        const t = Vector2D.sub(p3, p1).cross(d2) / denom;
        const u = Vector2D.sub(p3, p1).cross(d1) / denom;
        
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            const point = Vector2D.add(p1, Vector2D.mul(d1, t));
            const normal = d2.perpCCW().normalize();
            
            // Determine which side the collision came from
            const toP1 = Vector2D.sub(p1, point);
            if (toP1.dot(normal) < 0) {
                normal.negate();
            }
            
            return {
                point: point,
                normal: normal,
                t: t
            };
        }
        
        return null;
    }

    /**
     * Render the track
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {boolean} showDebug - Show debug overlays
     */
    render(ctx, showDebug = false) {
        // Draw outer grass
        ctx.fillStyle = this.grassColor;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw track surface (outer ellipse)
        ctx.beginPath();
        ctx.ellipse(this.centerX, this.centerY, 
                   this.outerRadiusX, this.outerRadiusY, 
                   0, 0, Math.PI * 2);
        ctx.fillStyle = this.trackColor;
        ctx.fill();
        
        // Draw inner grass (hole)
        ctx.beginPath();
        ctx.ellipse(this.centerX, this.centerY, 
                   this.innerRadiusX, this.innerRadiusY, 
                   0, 0, Math.PI * 2);
        ctx.fillStyle = this.innerGrassColor;
        ctx.fill();
        
        // Draw track borders
        ctx.strokeStyle = this.lineColor;
        ctx.lineWidth = 3;
        
        // Outer border
        ctx.beginPath();
        ctx.ellipse(this.centerX, this.centerY, 
                   this.outerRadiusX - 2, this.outerRadiusY - 2, 
                   0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner border
        ctx.beginPath();
        ctx.ellipse(this.centerX, this.centerY, 
                   this.innerRadiusX + 2, this.innerRadiusY + 2, 
                   0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw start/finish line
        ctx.strokeStyle = this.startLineColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(this.startLine.x1, this.startLine.y1);
        ctx.lineTo(this.startLine.x2, this.startLine.y2);
        ctx.stroke();
        
        // Draw checkered pattern on start line
        const segments = 6;
        const segmentHeight = (this.startLine.y2 - this.startLine.y1) / segments;
        ctx.lineWidth = segmentHeight;
        for (let i = 0; i < segments; i++) {
            ctx.strokeStyle = i % 2 === 0 ? '#000000' : '#ffffff';
            const y = this.startLine.y1 + segmentHeight * (i + 0.5);
            ctx.beginPath();
            ctx.moveTo(this.startLine.x1 - 3, y);
            ctx.lineTo(this.startLine.x1 + 3, y);
            ctx.stroke();
        }
        
        // Draw debug info
        if (showDebug) {
            // Draw waypoints
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            for (let i = 0; i < this.waypoints.length; i++) {
                const wp = this.waypoints[i];
                ctx.beginPath();
                ctx.arc(wp.x, wp.y, 8, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw waypoint number
                ctx.fillStyle = '#000000';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(i.toString(), wp.x, wp.y);
                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            }
            
            // Draw checkpoints
            ctx.strokeStyle = this.checkpointColor;
            ctx.lineWidth = 4;
            for (const cp of this.checkpoints) {
                ctx.beginPath();
                ctx.moveTo(cp.x1, cp.y1);
                ctx.lineTo(cp.x2, cp.y2);
                ctx.stroke();
            }
        }
    }
}