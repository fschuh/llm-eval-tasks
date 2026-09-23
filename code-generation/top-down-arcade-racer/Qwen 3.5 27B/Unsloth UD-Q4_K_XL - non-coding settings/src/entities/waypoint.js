/**
 * Waypoint class representing a point on the race track.
 * Waypoints define the path that cars must follow and are used for
 * lap detection, AI navigation, and distance calculations along the track.
 * 
 * @module Waypoint
 */
class Waypoint {
    /**
     * Creates a new Waypoint instance.
     * Can be constructed with individual x/y coordinates or a Vector2 object.
     * 
     * @param {number|Vector2} x - The x coordinate, or a Vector2 containing position data
     * @param {number} [y] - The y coordinate (required if first param is a number)
     */
    constructor(x, y) {
        // Support both Constructor(x, y) and Constructor(vector) signatures
        if (x instanceof Vector2) {
            this.position = x.clone();
        } else {
            this.position = new Vector2(x, y);
        }
        
        /** @type {number} Detection radius in pixels for waypoint proximity checks */
        this.radius = 30;
        
        /** @type {Waypoint|null} Reference to the next waypoint in sequence (set by Track) */
        this.nextWaypoint = null;
    }

    /**
     * Calculates the Euclidean distance from this waypoint to another waypoint.
     * Uses the formula: sqrt((x2-x1)^2 + (y2-y1)^2)
     * 
     * @param {Waypoint} otherWaypoint - The waypoint to calculate distance to
     * @returns {number} Distance in pixels between the two waypoints
     */
    distanceTo(otherWaypoint) {
        const dx = otherWaypoint.position.x - this.position.x;
        const dy = otherWaypoint.position.y - this.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculates the squared Euclidean distance to another waypoint.
     * More efficient than distanceTo() when only comparing relative distances.
     * 
     * @param {Waypoint} otherWaypoint - The waypoint to calculate distance to
     * @returns {number} Squared distance in pixels between the two waypoints
     */
    squaredDistanceTo(otherWaypoint) {
        const dx = otherWaypoint.position.x - this.position.x;
        const dy = otherWaypoint.position.y - this.position.y;
        return dx * dx + dy * dy;
    }

    /**
     * Checks if a given position is within the detection radius of this waypoint.
     * 
     * @param {Vector2} position - The position to check
     * @returns {boolean} True if position is within the waypoint's radius
     */
    containsPosition(position) {
        const dx = position.x - this.position.x;
        const dy = position.y - this.position.y;
        return (dx * dx + dy * dy) <= (this.radius * this.radius);
    }

    /**
     * Returns a string representation of the waypoint for debugging.
     * Format: "Waypoint(x, y)"
     * 
     * @returns {string} String representation of the waypoint
     */
    toString() {
        return `Waypoint(${this.position.x}, ${this.position.y})`;
    }
}

export default Waypoint;
