import { Vector2D } from '../core/Vector2D.js';

/**
 * Waypoint - Navigation point for AI and lap detection
 */
export class Waypoint {
    /**
     * Create a new waypoint
     * @param {number} index - Waypoint index
     * @param {Vector2D} position - Position
     * @param {number} width - Valid track width at this point
     * @param {boolean} isCheckpoint - Whether this is a checkpoint
     */
    constructor(index, position, width = 80, isCheckpoint = false) {
        this.index = index;
        this.position = position.clone();
        this.width = width;
        this.isCheckpoint = isCheckpoint;
        this.radius = width / 2; // Effective radius for detection
    }

    /**
     * Check if a point is within this waypoint
     * @param {Vector2D} point - Point to check
     * @param {number} threshold - Multiplier for width (default: 0.5)
     * @returns {boolean} True if point is within waypoint
     */
    containsPoint(point, threshold = 0.5) {
        const distance = this.position.distance(point);
        return distance <= this.width * threshold;
    }

    /**
     * Get distance from a point to this waypoint
     * @param {Vector2D} point - Point to check
     * @returns {number} Distance
     */
    getDistanceTo(point) {
        return this.position.distance(point);
    }

    /**
     * Get squared distance (faster)
     * @param {Vector2D} point - Point to check
     * @returns {number} Squared distance
     */
    getDistanceSquaredTo(point) {
        return this.position.distanceSquared(point);
    }

    /**
     * Get direction vector from a point to this waypoint
     * @param {Vector2D} point - Source point
     * @returns {Vector2D} Normalized direction vector
     */
    getDirectionFrom(point) {
        return this.position.sub(point).normalize();
    }

    /**
     * Get angle from a point to this waypoint
     * @param {Vector2D} point - Source point
     * @returns {number} Angle in radians
     */
    getAngleFrom(point) {
        const diff = this.position.sub(point);
        return Math.atan2(diff.y, diff.x);
    }

    /**
     * Create from data object
     * @param {Object} data - Waypoint data
     * @returns {Waypoint} New waypoint
     */
    static fromData(data) {
        return new Waypoint(
            data.index,
            data.position,
            data.width,
            data.isCheckpoint
        );
    }
}
