/**
 * Collider - Oriented Bounding Box (OBB) collider component
 * 
 * Provides collision detection support for rectangular objects with rotation.
 * Uses OBB (Oriented Bounding Box) for precise collision detection.
 */

import { Vector2 } from '../core/vector2.js';

/**
 * Collider class representing an oriented bounding box
 */
export class Collider {
    /**
     * Create a new Collider
     * @param {number} width - Width of the collider (default: 24)
     * @param {number} height - Height of the collider (default: 14)
     * @param {boolean} isTrigger - Whether this collider is a trigger (no physical response) (default: false)
     */
    constructor(width = 24, height = 14, isTrigger = false) {
        /** @type {number} Width of the collider */
        this.width = width;
        
        /** @type {number} Height of the collider */
        this.height = height;
        
        /** @type {boolean} Whether this collider is a trigger (no physical response) */
        this.isTrigger = isTrigger;
        
        // Pre-calculate half dimensions for efficiency
        /** @type {number} Half width of the collider */
        this.halfWidth = width / 2;
        
        /** @type {number} Half height of the collider */
        this.halfHeight = height / 2;
    }

    /**
     * Get the four corners of the oriented bounding box
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @returns {Vector2[]} Array of 4 Vector2 corners in world space [top-left, top-right, bottom-right, bottom-left]
     */
    getCorners(position, rotation) {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        
        // Local corners relative to center (before rotation)
        // Order: top-left, top-right, bottom-right, bottom-left
        const localCorners = [
            new Vector2(-this.halfWidth, -this.halfHeight),
            new Vector2(this.halfWidth, -this.halfHeight),
            new Vector2(this.halfWidth, this.halfHeight),
            new Vector2(-this.halfWidth, this.halfHeight)
        ];
        
        // Transform each corner to world space
        return localCorners.map(local => {
            // Rotate
            const rotatedX = local.x * cos - local.y * sin;
            const rotatedY = local.x * sin + local.y * cos;
            
            // Translate
            return new Vector2(
                position.x + rotatedX,
                position.y + rotatedY
            );
        });
    }

    /**
     * Get the edges of the OBB as vectors (from corner i to corner i+1)
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @returns {Vector2[]} Array of 4 edge vectors
     */
    getEdges(position, rotation) {
        const corners = this.getCorners(position, rotation);
        const edges = [];
        
        for (let i = 0; i < 4; i++) {
            const nextIndex = (i + 1) % 4;
            edges.push(corners[nextIndex].sub(corners[i]));
        }
        
        return edges;
    }

    /**
     * Get the normals (perpendicular axes) of the OBB for SAT
     * These are the axes we need to test for separation
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @returns {Vector2[]} Array of 2 normalized normal vectors (the two unique axes of a rectangle)
     */
    getNormals(position, rotation) {
        // For a rectangle, we only need 2 unique normals (the other 2 are opposites)
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        
        // Normal along the width (perpendicular to the height/length of the car)
        const normalX = new Vector2(-sin, cos);  // Rotated (0, 1)
        
        // Normal along the height (perpendicular to the width of the car)
        const normalY = new Vector2(cos, sin);   // Rotated (1, 0)
        
        return [normalX, normalY];
    }

    /**
     * Get all axes to test for SAT collision detection
     * Returns the 4 edge normals (2 unique axes for this OBB)
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @returns {Vector2[]} Array of normalized axis vectors
     */
    getAxes(position, rotation) {
        return this.getNormals(position, rotation);
    }

    /**
     * Project the collider onto an axis for SAT
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @param {Vector2} axis - Axis to project onto (should be normalized)
     * @returns {{min: number, max: number}} Min and max projection values
     */
    projectOntoAxis(position, rotation, axis) {
        const corners = this.getCorners(position, rotation);
        
        let min = Infinity;
        let max = -Infinity;
        
        for (const corner of corners) {
            const projection = corner.dot(axis);
            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }
        
        return { min, max };
    }

    /**
     * Get the centroid (center point) of the collider in world space
     * @param {Vector2} position - World position of the collider center
     * @returns {Vector2} Centroid position (same as input position for centered colliders)
     */
    getCentroid(position) {
        return position.copy();
    }

    /**
     * Get axis-aligned bounding box (AABB) for broad-phase collision detection
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @returns {{minX: number, maxX: number, minY: number, maxY: number}} AABB bounds
     */
    getAABB(position, rotation) {
        const corners = this.getCorners(position, rotation);
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const corner of corners) {
            minX = Math.min(minX, corner.x);
            maxX = Math.max(maxX, corner.x);
            minY = Math.min(minY, corner.y);
            maxY = Math.max(maxY, corner.y);
        }
        
        return { minX, maxX, minY, maxY };
    }

    /**
     * Check if a point is inside the collider
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @param {Vector2} point - Point to test
     * @returns {boolean} True if point is inside the collider
     */
    containsPoint(position, rotation, point) {
        // Transform point to local space of the collider
        const dx = point.x - position.x;
        const dy = point.y - position.y;
        
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        
        // Check if point is within the local bounds
        return (
            localX >= -this.halfWidth &&
            localX <= this.halfWidth &&
            localY >= -this.halfHeight &&
            localY <= this.halfHeight
        );
    }

    /**
     * Get the closest point on the collider to a given point
     * @param {Vector2} position - World position of the collider center
     * @param {number} rotation - Rotation in radians
     * @param {Vector2} point - Point to find closest point to
     * @returns {Vector2} Closest point on the collider boundary
     */
    getClosestPoint(position, rotation, point) {
        // Transform point to local space
        const dx = point.x - position.x;
        const dy = point.y - position.y;
        
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        
        // Clamp to local bounds
        const clampedX = Math.max(-this.halfWidth, Math.min(this.halfWidth, localX));
        const clampedY = Math.max(-this.halfHeight, Math.min(this.halfHeight, localY));
        
        // Transform back to world space
        const worldCos = Math.cos(rotation);
        const worldSin = Math.sin(rotation);
        
        return new Vector2(
            position.x + clampedX * worldCos - clampedY * worldSin,
            position.y + clampedX * worldSin + clampedY * worldCos
        );
    }

    /**
     * Update the dimensions of the collider
     * @param {number} width - New width
     * @param {number} height - New height
     */
    setDimensions(width, height) {
        this.width = width;
        this.height = height;
        this.halfWidth = width / 2;
        this.halfHeight = height / 2;
    }

    /**
     * Calculate the area of the collider
     * @returns {number} Area (width * height)
     */
    getArea() {
        return this.width * this.height;
    }

    /**
     * Clone this collider
     * @returns {Collider} New collider with same properties
     */
    clone() {
        return new Collider(this.width, this.height, this.isTrigger);
    }
}
