/**
 * Collision Detector - Separating Axis Theorem (SAT) implementation
 * 
 * Provides collision detection between oriented bounding boxes (OBB)
 * using the Separating Axis Theorem. Returns collision information
 * including normal vector and penetration depth.
 */

import { Vector2 } from '../core/vector2.js';

/**
 * Project corners onto an axis and return min/max projection values
 * @param {Vector2[]} corners - Array of corner points
 * @param {Vector2} axis - Axis to project onto (should be normalized)
 * @returns {{min: number, max: number}} Min and max projection values
 */
function projectOntoAxis(corners, axis) {
    let min = Infinity;
    let max = -Infinity;
    
    for (const corner of corners) {
        const proj = corner.dot(axis);
        min = Math.min(min, proj);
        max = Math.max(max, proj);
    }
    
    return { min, max };
}

/**
 * Calculate centroid (center point) of a polygon
 * @param {Vector2[]} corners - Array of corner points
 * @returns {Vector2} Centroid position
 */
function getCentroid(corners) {
    let sumX = 0;
    let sumY = 0;
    
    for (const corner of corners) {
        sumX += corner.x;
        sumY += corner.y;
    }
    
    return new Vector2(sumX / corners.length, sumY / corners.length);
}

/**
 * Check collision between two colliders using SAT
 * 
 * @param {Collider} colliderA - First collider
 * @param {Vector2} posA - Position of first collider
 * @param {number} rotA - Rotation of first collider in radians
 * @param {Collider} colliderB - Second collider
 * @param {Vector2} posB - Position of second collider
 * @param {number} rotB - Rotation of second collider in radians
 * @returns {{collision: boolean, normal: Vector2, penetration: number}|null} 
 *          Collision info or null if no collision
 */
export function checkCollision(colliderA, posA, rotA, colliderB, posB, rotB) {
    // Get OBB corners for both colliders
    const cornersA = colliderA.getCorners(posA, rotA);
    const cornersB = colliderB.getCorners(posB, rotB);
    
    // Collect all axes to test (edge normals from both boxes)
    const axes = [];
    
    // Add edge normals from A
    for (let i = 0; i < 4; i++) {
        const edge = cornersA[(i + 1) % 4].sub(cornersA[i]);
        // Perpendicular vector (normal) - rotate 90 degrees CCW
        const normal = new Vector2(-edge.y, edge.x).normalize();
        axes.push(normal);
    }
    
    // Add edge normals from B
    for (let i = 0; i < 4; i++) {
        const edge = cornersB[(i + 1) % 4].sub(cornersB[i]);
        // Perpendicular vector (normal) - rotate 90 degrees CCW
        const normal = new Vector2(-edge.y, edge.x).normalize();
        axes.push(normal);
    }
    
    let minPenetration = Infinity;
    let collisionNormal = new Vector2(0, 0);
    
    // Test each axis
    for (const axis of axes) {
        const projA = projectOntoAxis(cornersA, axis);
        const projB = projectOntoAxis(cornersB, axis);
        
        // Check for separation (no overlap)
        if (projA.max < projB.min || projB.max < projA.min) {
            // Found a separating axis - no collision
            return null;
        }
        
        // Calculate penetration depth on this axis
        // Penetration is the amount of overlap
        const penetration = Math.min(projA.max - projB.min, projB.max - projA.min);
        
        // Track the axis with minimum penetration (collision normal)
        if (penetration < minPenetration) {
            minPenetration = penetration;
            collisionNormal = axis;
        }
    }
    
    // Ensure normal points from A to B
    const centerA = getCentroid(cornersA);
    const centerB = getCentroid(cornersB);
    const direction = centerB.sub(centerA);
    
    if (direction.dot(collisionNormal) < 0) {
        collisionNormal = collisionNormal.mul(-1);
    }
    
    return {
        collision: true,
        normal: collisionNormal,
        penetration: minPenetration
    };
}

/**
 * CollisionDetector class - provides SAT-based collision detection
 * 
 * This class wraps the checkCollision function and can be extended
 * with additional collision detection methods as needed.
 */
export class CollisionDetector {
    /**
     * Check collision between two colliders
     * @param {Collider} colliderA - First collider
     * @param {Vector2} posA - Position of first collider
     * @param {number} rotA - Rotation of first collider in radians
     * @param {Collider} colliderB - Second collider
     * @param {Vector2} posB - Position of second collider
     * @param {number} rotB - Rotation of second collider in radians
     * @returns {{collision: boolean, normal: Vector2, penetration: number}|null}
     */
    static check(colliderA, posA, rotA, colliderB, posB, rotB) {
        return checkCollision(colliderA, posA, rotA, colliderB, posB, rotB);
    }
    
    /**
     * Check if a point is inside a collider
     * @param {Vector2} point - Point to test
     * @param {Collider} collider - Collider to test against
     * @param {Vector2} pos - Position of collider
     * @param {number} rot - Rotation of collider in radians
     * @returns {boolean} True if point is inside
     */
    static pointInCollider(point, collider, pos, rot) {
        const corners = collider.getCorners(pos, rot);
        
        // Use cross product to check if point is on same side of all edges
        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];
            
            // Edge vector
            const edge = p2.sub(p1);
            // Vector from edge start to point
            const toPoint = point.sub(p1);
            
            // Cross product (z-component)
            const cross = edge.cross(toPoint);
            
            // If cross product is negative, point is outside
            // (assuming counter-clockwise winding)
            if (cross < 0) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get the closest point on a collider to a given point
     * @param {Vector2} point - Reference point
     * @param {Collider} collider - Collider to find closest point on
     * @param {Vector2} pos - Position of collider
     * @param {number} rot - Rotation of collider in radians
     * @returns {Vector2} Closest point on collider boundary
     */
    static getClosestPoint(point, collider, pos, rot) {
        const corners = collider.getCorners(pos, rot);
        let closestPoint = null;
        let minDist = Infinity;
        
        // Check distance to each edge
        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];
            
            // Project point onto edge line segment
            const edge = p2.sub(p1);
            const edgeLengthSq = edge.dot(edge);
            
            if (edgeLengthSq === 0) {
                // Degenerate edge
                const dist = point.distance(p1);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = p1;
                }
                continue;
            }
            
            // Parameter along edge [0, 1]
            const t = Math.max(0, Math.min(1, point.sub(p1).dot(edge) / edgeLengthSq));
            
            // Closest point on edge
            const projection = p1.add(edge.mul(t));
            const dist = point.distance(projection);
            
            if (dist < minDist) {
                minDist = dist;
                closestPoint = projection;
            }
        }
        
        return closestPoint;
    }
}
