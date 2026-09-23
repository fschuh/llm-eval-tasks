import { Vector2D } from '../core/Vector2D.js';
import { Waypoint } from './Waypoint.js';

/**
 * Track - Racing circuit with waypoints and boundaries
 */
export class Track {
    /**
     * Create a new track
     * @param {Object} data - Track data
     */
    constructor(data) {
        this.name = data.name || 'Unknown Track';
        this.lapCount = data.lapCount || 3;
        this.sectorCount = data.sectorCount || 4;
        this.width = data.width || 1024;
        this.height = data.height || 768;

        // Create waypoints
        this.waypoints = data.waypoints.map(wp => Waypoint.fromData(wp));

        // Store start positions
        this.startPositions = data.startPositions || [];

        // Store boundaries (walls)
        this.boundaries = data.boundaries || [];
    }

    /**
     * Get waypoint by index
     * @param {number} index - Waypoint index
     * @returns {Waypoint|null} Waypoint or null if invalid
     */
    getWaypoint(index) {
        if (index < 0 || index >= this.waypoints.length) {
            return null;
        }
        return this.waypoints[index];
    }

    /**
     * Get total number of waypoints
     * @returns {number} Number of waypoints
     */
    getTotalWaypoints() {
        return this.waypoints.length;
    }

    /**
     * Get start position by index
     * @param {number} index - Start position index
     * @returns {Object|null} Position and rotation or null
     */
    getStartPosition(index) {
        if (index < 0 || index >= this.startPositions.length) {
            return null;
        }
        return this.startPositions[index];
    }

    /**
     * Get total number of start positions
     * @returns {number} Number of start positions
     */
    getStartPositionCount() {
        return this.startPositions.length;
    }

    /**
     * Validate waypoint sequence (check if next waypoint is valid from current)
     * @param {number} current - Current waypoint index
     * @param {number} next - Next waypoint index
     * @returns {boolean} True if sequence is valid
     */
    validateWaypointSequence(current, next) {
        const total = this.waypoints.length;
        
        // Expected next waypoint
        const expected = (current + 1) % total;
        
        // Check if next matches expected
        if (next === expected) {
            return true;
        }

        // Allow wrapping around
        if (current === total - 1 && next === 0) {
            return true;
        }

        return false;
    }

    /**
     * Get distance between two waypoints
     * @param {number} fromIndex - Starting waypoint
     * @param {number} toIndex - Ending waypoint
     * @returns {number} Distance
     */
    getWaypointDistance(fromIndex, toIndex) {
        const from = this.getWaypoint(fromIndex);
        const to = this.getWaypoint(toIndex);
        
        if (!from || !to) return 0;
        
        return from.position.distance(to.position);
    }

    /**
     * Get total track length (sum of all waypoint distances)
     * @returns {number} Total length
     */
    getTotalLength() {
        let length = 0;
        const total = this.waypoints.length;
        
        for (let i = 0; i < total; i++) {
            const current = this.waypoints[i];
            const next = this.waypoints[(i + 1) % total];
            length += current.position.distance(next.position);
        }
        
        return length;
    }

    /**
     * Get nearest waypoint to a position
     * @param {Vector2D} position - Position to check
     * @returns {Waypoint} Nearest waypoint
     */
    getNearestWaypoint(position) {
        let nearest = this.waypoints[0];
        let minDist = position.distanceSquared(nearest.position);

        for (let i = 1; i < this.waypoints.length; i++) {
            const dist = position.distanceSquared(this.waypoints[i].position);
            if (dist < minDist) {
                minDist = dist;
                nearest = this.waypoints[i];
            }
        }

        return nearest;
    }

    /**
     * Get next waypoint index
     * @param {number} currentIndex - Current waypoint index
     * @returns {number} Next waypoint index
     */
    getNextWaypointIndex(currentIndex) {
        return (currentIndex + 1) % this.waypoints.length;
    }

    /**
     * Get previous waypoint index
     * @param {number} currentIndex - Current waypoint index
     * @returns {number} Previous waypoint index
     */
    getPreviousWaypointIndex(currentIndex) {
        const total = this.waypoints.length;
        return (currentIndex - 1 + total) % total;
    }

    /**
     * Get boundaries for physics
     * @returns {Object[]} Array of boundary objects
     */
    getBoundaries() {
        return this.boundaries;
    }

    /**
     * Get track bounds (for camera clamping)
     * @returns {Object} Bounds with min/max x/y
     */
    getBounds() {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const wp of this.waypoints) {
            minX = Math.min(minX, wp.position.x);
            minY = Math.min(minY, wp.position.y);
            maxX = Math.max(maxX, wp.position.x);
            maxY = Math.max(maxY, wp.position.y);
        }

        // Add padding
        const padding = 200;
        return {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding
        };
    }
}
