/**
 * Track class for managing race track waypoints and navigation.
 * Handles waypoint ordering, distance calculations along the track,
 * and provides methods for determining position relative to the track.
 * 
 * @module Track
 */
import Waypoint from './waypoint.js';
import Vector2 from '../core/vector2.js';

class Track {
    /**
     * Creates a new Track instance with an array of waypoints.
     * Pre-calculates segment distances and total track length for efficiency.
     * 
     * @param {Waypoint[]} [waypointsArray] - Array of Waypoint objects in order around the track
     */
    constructor(waypointsArray = []) {
        /** @type {Waypoint[]} Array of waypoints in sequential order around the track */
        this.waypoints = waypointsArray;
        
        /** @type {number} Total number of waypoints on the track */
        this.totalWaypoints = waypointsArray.length;
        
        /** @type {number} Width of the track in pixels (for bounds checking) */
        this.width = 100;
        
        /** @type {number} Index of the finish line waypoint (typically 0 for start/finish) */
        this.finishLineIndex = 0;
        
        /** @type {number[]} Pre-calculated distances between consecutive waypoints */
        this.segmentDistances = [];
        
        // Link waypoints together and pre-calculate segment distances
        if (waypointsArray.length > 0) {
            for (let i = 0; i < waypointsArray.length; i++) {
                const nextIndex = (i + 1) % waypointsArray.length;
                this.waypoints[i].nextWaypoint = this.waypoints[nextIndex];
                
                const dist = waypointsArray[i].distanceTo(waypointsArray[nextIndex]);
                this.segmentDistances.push(dist);
            }
            
            // Calculate total track length
            /** @type {number} Total length of the track in pixels */
            this.totalLength = this.segmentDistances.reduce((a, b) => a + b, 0);
        } else {
            this.totalLength = 0;
        }
    }

    /**
     * Adds a new waypoint to the track at the specified position.
     * Links the new waypoint to the previous one and updates segment distances.
     * 
     * @param {number} x - X coordinate for the new waypoint
     * @param {number} y - Y coordinate for the new waypoint
     * @returns {Waypoint} The newly created waypoint
     */
    addWaypoint(x, y) {
        const index = this.waypoints.length;
        const waypoint = new Waypoint(x, y);
        
        // Link previous waypoint to this one
        if (this.waypoints.length > 0) {
            const prevIndex = this.waypoints.length - 1;
            this.waypoints[prevIndex].nextWaypoint = waypoint;
            
            // Update segment distance for the new connection
            const dist = this.waypoints[prevIndex].distanceTo(waypoint);
            this.segmentDistances[prevIndex] = dist;
        }
        
        this.waypoints.push(waypoint);
        this.totalWaypoints = this.waypoints.length;
        
        // Update total length (subtract old last segment, add new one)
        if (this.waypoints.length > 1) {
            const prevIndex = this.waypoints.length - 2;
            const nextIndex = (prevIndex + 1) % this.waypoints.length;
            const dist = this.waypoints[prevIndex].distanceTo(this.waypoints[nextIndex]);
            
            // Remove old last segment distance and add new one
            if (this.segmentDistances.length > 0) {
                this.totalLength -= this.segmentDistances.pop();
            }
            this.segmentDistances.push(dist);
        }
        
        return waypoint;
    }

    /**
     * Finds the waypoint closest to a given position.
     * Uses squared distance comparison for efficiency.
     * 
     * @param {Vector2} position - The position to find the nearest waypoint for
     * @returns {Waypoint|null} The nearest waypoint, or null if track is empty
     */
    getNearestWaypoint(position) {
        if (this.waypoints.length === 0) {
            return null;
        }
        
        let nearest = this.waypoints[0];
        let minSquaredDistance = position.x * position.x + position.y * position.y; // Distance to origin as initial
        
        for (const waypoint of this.waypoints) {
            const dx = position.x - waypoint.position.x;
            const dy = position.y - waypoint.position.y;
            const squaredDistance = dx * dx + dy * dy;
            
            if (squaredDistance < minSquaredDistance) {
                minSquaredDistance = squaredDistance;
                nearest = waypoint;
            }
        }
        
        return nearest;
    }

    /**
     * Returns the next waypoint in sequence from a given waypoint.
     * Wraps around to the first waypoint when at the last one.
     * 
     * @param {Waypoint} currentWaypoint - The current waypoint
     * @returns {Waypoint|null} The next waypoint, or null if track is empty
     */
    getNextWaypoint(currentWaypoint) {
        if (this.waypoints.length === 0 || !currentWaypoint.nextWaypoint) {
            return this.waypoints[0] || null;
        }
        
        // Use the linked nextWaypoint reference for efficiency
        if (currentWaypoint.nextWaypoint) {
            return currentWaypoint.nextWaypoint;
        }
        
        // Fallback: find by index
        const currentIndex = this.waypoints.indexOf(currentWaypoint);
        if (currentIndex === -1) {
            return null;
        }
        
        const nextIndex = (currentIndex + 1) % this.waypoints.length;
        return this.waypoints[nextIndex];
    }

    /**
     * Returns the previous waypoint in sequence from a given waypoint.
     * Wraps around to the last waypoint when at the first one.
     * 
     * @param {Waypoint} currentWaypoint - The current waypoint
     * @returns {Waypoint|null} The previous waypoint, or null if track is empty
     */
    getPreviousWaypoint(currentWaypoint) {
        if (this.waypoints.length === 0) {
            return null;
        }
        
        const currentIndex = this.waypoints.indexOf(currentWaypoint);
        if (currentIndex === -1) {
            return null;
        }
        
        const prevIndex = currentIndex - 1;
        const actualPrevIndex = prevIndex < 0 ? this.totalWaypoints - 1 : prevIndex;
        return this.waypoints[actualPrevIndex];
    }

    /**
     * Calculates the distance between two positions along the track path.
     * This follows the waypoint sequence rather than straight-line distance.
     * 
     * @param {Vector2} startPos - Starting position on the track
     * @param {Vector2} endPos - Ending position on the track
     * @returns {number} Distance in pixels along the track path
     */
    getDistanceAlongTrack(startPos, endPos) {
        if (this.waypoints.length === 0) {
            return 0;
        }
        
        // Find nearest waypoints to start and end positions
        const startWaypoint = this.getNearestWaypoint(startPos);
        const endWaypoint = this.getNearestWaypoint(endPos);
        
        if (!startWaypoint || !endWaypoint) {
            return 0;
        }
        
        // Calculate distance from start position to its nearest waypoint center
        const dx1 = startWaypoint.position.x - startPos.x;
        const dy1 = startWaypoint.position.y - startPos.y;
        const distToStartWaypoint = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        
        // Calculate distance from end position to its nearest waypoint center
        const dx2 = endWaypoint.position.x - endPos.x;
        const dy2 = endWaypoint.position.y - endPos.y;
        const distToEndWaypoint = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        
        // Find indices for calculating track distance between waypoints
        const startIndex = this.waypoints.indexOf(startWaypoint);
        const endIndex = this.waypoints.indexOf(endWaypoint);
        
        if (startIndex === -1 || endIndex === -1) {
            return 0;
        }
        
        // Calculate distance along track between the two waypoint centers
        let trackDistance = 0;
        let currentIndex = startIndex;
        
        while (currentIndex !== endIndex) {
            trackDistance += this.segmentDistances[currentIndex];
            currentIndex = (currentIndex + 1) % this.waypoints.length;
            
            // Safety check to prevent infinite loop
            if (currentIndex === startIndex && trackDistance > 0) {
                break;
            }
        }
        
        // Total distance: from start pos to start waypoint, along track, then to end pos
        return distToStartWaypoint + trackDistance + distToEndWaypoint;
    }

    /**
     * Checks if a given position is within the bounds of the track.
     * A position is considered on-track if it's within half the track width
     * from any segment between consecutive waypoints.
     * 
     * @param {Vector2} position - The position to check
     * @returns {boolean} True if position is within track bounds
     */
    isOnTrack(position) {
        if (this.waypoints.length < 2) {
            return false;
        }
        
        const halfWidth = this.width / 2;
        
        // Check distance to each segment of the track
        for (let i = 0; i < this.waypoints.length; i++) {
            const currentWaypoint = this.waypoints[i];
            const nextWaypoint = this.waypoints[(i + 1) % this.waypoints.length];
            
            // Calculate distance from position to the line segment
            const distToSegment = this._distanceToLineSegment(
                position,
                currentWaypoint.position,
                nextWaypoint.position
            );
            
            if (distToSegment <= halfWidth) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Helper method to calculate distance from a point to a line segment.
     * Uses vector projection to find the closest point on the segment.
     * 
     * @param {Vector2} point - The point to measure from
     * @param {Vector2} segmentStart - Start of the line segment
     * @param {Vector2} segmentEnd - End of the line segment
     * @returns {number} Distance in pixels from point to closest point on segment
     */
    _distanceToLineSegment(point, segmentStart, segmentEnd) {
        const segment = segmentEnd.subtract(segmentStart);
        const pointVec = point.subtract(segmentStart);
        
        // Calculate the projection of point onto the segment line
        const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;
        
        if (segmentLengthSquared === 0) {
            // Segment is a point, return distance to that point
            const dx = point.x - segmentStart.x;
            const dy = point.y - segmentStart.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        // Calculate projection parameter t (0 = at start, 1 = at end)
        let t = pointVec.dot(segment) / segmentLengthSquared;
        
        // Clamp t to [0, 1] to stay within the segment bounds
        t = Math.max(0, Math.min(1, t));
        
        // Find closest point on segment
        const closestX = segmentStart.x + t * segment.x;
        const closestY = segmentStart.y + t * segment.y;
        
        // Calculate distance to closest point
        const dx = point.x - closestX;
        const dy = point.y - closestY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Returns a string representation of the track for debugging.
     * Format: "Track(waypoints: N, length: M)"
     * 
     * @returns {string} String representation of the track
     */
    toString() {
        return `Track(waypoints: ${this.totalWaypoints}, length: ${this.totalLength.toFixed(2)})`;
    }
}

export default Track;
