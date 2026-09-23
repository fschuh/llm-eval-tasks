import { Vector2 } from '../math/Vector2.js';

/**
 * Track definition with waypoints for AI navigation
 * Provides track geometry, waypoints, and collision detection
 */
export class Track {
    /**
     * @param {Object} options - Track configuration options
     */
    constructor(options = {}) {
        // Track center points (path the AI follows)
        this.centerPoints = [];
        
        // Waypoints for AI navigation
        this.waypoints = [];
        
        // Track boundaries (inner and outer edges)
        this.innerBoundary = [];
        this.outerBoundary = [];
        
        // Track properties
        this.trackWidth = options.trackWidth ?? 80;
        this.totalLength = 0;
        
        // Lap detection checkpoints
        this.checkpoints = [];
        
        // Generate the track
        this.generateTrack();
    }
    
    /**
     * Generate the track geometry
     * Creates an oval track with multiple waypoints
     */
    generateTrack() {
        // Define track center points for an oval track
        // Using a rounded rectangle with circular ends
        this.generateOvalTrack();
        
        // Generate waypoints from center points
        this.generateWaypoints();
        
        // Generate track boundaries
        this.generateBoundaries();
        
        // Generate checkpoints for lap detection
        this.generateCheckpoints();
        
        // Calculate total track length
        this.calculateTotalLength();
    }
    
    /**
     * Generate an oval track with rounded corners
     */
    generateOvalTrack() {
        // Track dimensions
        const centerX = 0;
        const centerY = 0;
        const trackLength = 800; // Length of straight sections
        const trackWidth = 400; // Width of the track (including straights)
        const cornerRadius = 200;
        const numPointsPerCorner = 20;
        
        this.centerPoints = [];
        
        // Top straight (left to right)
        for (let x = -trackLength - cornerRadius; x <= trackLength + cornerRadius; x += 20) {
            this.centerPoints.push(new Vector2(x, -trackWidth / 2));
        }
        
        // Bottom straight (right to left)
        for (let x = trackLength + cornerRadius; x >= -trackLength - cornerRadius; x -= 20) {
            this.centerPoints.push(new Vector2(x, trackWidth / 2));
        }
        
        // Bottom-right corner (counter-clockwise)
        for (let i = 0; i < numPointsPerCorner; i++) {
            const angle = Math.PI / 2 + (Math.PI / 2) * (i / numPointsPerCorner);
            this.centerPoints.push(new Vector2(
                trackLength + cornerRadius + cornerRadius * Math.cos(angle),
                trackWidth / 2 + cornerRadius * Math.sin(angle)
            ));
        }
        
        // Bottom-left corner (counter-clockwise)
        for (let i = 0; i < numPointsPerCorner; i++) {
            const angle = Math.PI + (Math.PI / 2) * (i / numPointsPerCorner);
            this.centerPoints.push(new Vector2(
                -trackLength - cornerRadius + cornerRadius * Math.cos(angle),
                trackWidth / 2 + cornerRadius * Math.sin(angle)
            ));
        }
        
        // Top-left corner (counter-clockwise)
        for (let i = 0; i < numPointsPerCorner; i++) {
            const angle = Math.PI - (Math.PI / 2) * (i / numPointsPerCorner);
            this.centerPoints.push(new Vector2(
                -trackLength - cornerRadius + cornerRadius * Math.cos(angle),
                -trackWidth / 2 + cornerRadius * Math.sin(angle)
            ));
        }
        
        // Top-right corner (counter-clockwise)
        for (let i = 0; i < numPointsPerCorner; i++) {
            const angle = 2 * Math.PI - (Math.PI / 2) * (i / numPointsPerCorner);
            this.centerPoints.push(new Vector2(
                trackLength + cornerRadius + cornerRadius * Math.cos(angle),
                -trackWidth / 2 + cornerRadius * Math.sin(angle)
            ));
        }
    }
    
    /**
     * Generate waypoints from center points
     * Creates evenly spaced waypoints for AI navigation
     */
    generateWaypoints() {
        this.waypoints = [];
        
        // Sample center points at regular intervals
        const sampleInterval = 50; // Waypoints every 50 units
        let accumulatedDistance = 0;
        let lastPoint = null;
        
        for (let i = 0; i < this.centerPoints.length; i++) {
            const point = this.centerPoints[i];
            
            if (lastPoint) {
                const segmentDistance = lastPoint.distance(point);
                accumulatedDistance += segmentDistance;
            }
            
            // Add waypoint at regular intervals
            if (!lastPoint || accumulatedDistance >= sampleInterval) {
                this.waypoints.push(point.clone());
                accumulatedDistance = 0;
            }
            
            lastPoint = point;
        }
        
        // Ensure we have a closed loop by adding first point at end if needed
        if (this.waypoints.length > 0) {
            const firstPoint = this.centerPoints[0];
            const lastPoint = this.waypoints[this.waypoints.length - 1];
            
            if (firstPoint.distance(lastPoint) > sampleInterval / 2) {
                this.waypoints.push(firstPoint.clone());
            }
        }
    }
    
    /**
     * Generate track boundaries (inner and outer edges)
     */
    generateBoundaries() {
        this.innerBoundary = [];
        this.outerBoundary = [];
        
        for (let i = 0; i < this.centerPoints.length; i++) {
            const center = this.centerPoints[i];
            
            // Calculate perpendicular direction
            let nextIndex = (i + 1) % this.centerPoints.length;
            let prevIndex = (i - 1 + this.centerPoints.length) % this.centerPoints.length;
            
            const nextPoint = this.centerPoints[nextIndex];
            const prevPoint = this.centerPoints[prevIndex];
            
            // Calculate tangent direction
            const tangent = nextPoint.clone().subtract(prevPoint).normalize();
            
            // Calculate perpendicular (normal) direction
            const normal = new Vector2(-tangent.y, tangent.x);
            
            // Add boundary points
            const offset = this.trackWidth / 2;
            this.outerBoundary.push(center.clone().add(normal.clone().multiply(offset)));
            this.innerBoundary.push(center.clone().subtract(normal.clone().multiply(offset)));
        }
    }
    
    /**
     * Generate checkpoints for lap detection
     */
    generateCheckpoints() {
        this.checkpoints = [];
        
        // Add checkpoints at regular intervals around the track
        const numCheckpoints = 8;
        const interval = Math.floor(this.centerPoints.length / numCheckpoints);
        
        for (let i = 0; i < this.centerPoints.length; i += interval) {
            this.checkpoints.push(this.centerPoints[i].clone());
        }
        
        // Ensure we have a closed loop
        if (this.checkpoints.length > 0) {
            const firstCheckpoint = this.centerPoints[0];
            const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1];
            
            if (firstCheckpoint.distance(lastCheckpoint) > 10) {
                this.checkpoints.push(firstCheckpoint.clone());
            }
        }
    }
    
    /**
     * Calculate total track length
     */
    calculateTotalLength() {
        this.totalLength = 0;
        
        for (let i = 1; i < this.centerPoints.length; i++) {
            this.totalLength += this.centerPoints[i - 1].distance(this.centerPoints[i]);
        }
        
        // Add distance from last to first point for closed loop
        if (this.centerPoints.length > 1) {
            this.totalLength += this.centerPoints[this.centerPoints.length - 1].distance(this.centerPoints[0]);
        }
    }
    
    /**
     * Get track width at a specific position
     * @param {Vector2} position - Position to check
     * @returns {number} Track width at position
     */
    getTrackWidth(position) {
        return this.trackWidth;
    }
    
    /**
     * Check if a point is on the track
     * @param {Vector2} position - Position to check
     * @returns {boolean} True if position is on track
     */
    isOnTrack(position) {
        // Find closest center point
        let closestDist = Infinity;
        
        for (let i = 0; i < this.centerPoints.length; i++) {
            const dist = position.distanceSquared(this.centerPoints[i]);
            if (dist < closestDist) {
                closestDist = dist;
            }
        }
        
        // Check if within track width
        const maxDist = (this.trackWidth / 2) ** 2;
        return closestDist <= maxDist;
    }
    
    /**
     * Get the closest point on track center
     * @param {Vector2} position - Position to find closest point for
     * @returns {Vector2} Closest point on track center
     */
    getClosestCenterPoint(position) {
        let closestDist = Infinity;
        let closestPoint = null;
        
        for (let i = 0; i < this.centerPoints.length; i++) {
            const dist = position.distanceSquared(this.centerPoints[i]);
            if (dist < closestDist) {
                closestDist = dist;
                closestPoint = this.centerPoints[i];
            }
        }
        
        return closestPoint;
    }
    
    /**
     * Get track progress (0 to 1) for a position
     * @param {Vector2} position - Position to calculate progress for
     * @returns {number} Track progress (0 = start, 1 = end of lap)
     */
    getTrackProgress(position) {
        // Find closest center point
        let closestDist = Infinity;
        let closestIndex = 0;
        
        for (let i = 0; i < this.centerPoints.length; i++) {
            const dist = position.distanceSquared(this.centerPoints[i]);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }
        
        // Calculate progress based on index
        const progress = closestIndex / this.centerPoints.length;
        return progress;
    }
    
    /**
     * Get waypoints for AI navigation
     * @returns {Vector2[]} Array of waypoints
     */
    getWaypoints() {
        return this.waypoints;
    }
    
    /**
     * Get checkpoints for lap detection
     * @returns {Vector2[]} Array of checkpoints
     */
    getCheckpoints() {
        return this.checkpoints;
    }
    
    /**
     * Get track boundaries
     * @returns {Object} Object with innerBoundary and outerBoundary arrays
     */
    getBoundaries() {
        return {
            innerBoundary: this.innerBoundary,
            outerBoundary: this.outerBoundary
        };
    }
    
    /**
     * Calculate total track length from center points
     */
    calculateTotalLength() {
        this.totalLength = 0;
        for (let i = 1; i < this.centerPoints.length; i++) {
            this.totalLength += this.centerPoints[i].distance(this.centerPoints[i - 1]);
        }
    }
    
    /**
     * Get total track length
     * @returns {number} Total track length in units
     */
    getLength() {
        return this.totalLength;
    }
    
    /**
     * Get number of checkpoints
     * @returns {number} Number of checkpoints
     */
    getNumCheckpoints() {
        return this.checkpoints.length;
    }
    
    /**
     * Reset track state
     */
    reset() {
        // Track state is static, no reset needed
    }
}
