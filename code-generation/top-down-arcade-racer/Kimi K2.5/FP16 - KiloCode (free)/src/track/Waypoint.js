import { Vector2 } from '../utils/Vector2.js';

/**
 * Waypoint for track navigation
 */
export class Waypoint {
    constructor(id, position, width = 100, isCheckpoint = false) {
        this.id = id;
        this.position = position.clone();
        this.width = width;           // Width of track at this point
        this.isCheckpoint = isCheckpoint;
        this.next = null;             // Reference to next waypoint
        this.prev = null;             // Reference to previous waypoint

        // For AI steering
        this.tangent = new Vector2(0, 0);  // Direction to next waypoint
        this.normal = new Vector2(0, 0);   // Perpendicular to tangent
    }

    /**
     * Calculate distance from point to waypoint line segment
     */
    distanceToPoint(point) {
        // Project point onto line through waypoint perpendicular to tangent
        const toPoint = point.subtract(this.position);
        return Math.abs(toPoint.dot(this.normal));
    }

    /**
     * Check if point is within waypoint width
     */
    containsPoint(point) {
        return this.distanceToPoint(point) <= this.width / 2;
    }

    /**
     * Get distance to this waypoint from a position
     */
    distanceFrom(position) {
        return position.distanceTo(this.position);
    }
}