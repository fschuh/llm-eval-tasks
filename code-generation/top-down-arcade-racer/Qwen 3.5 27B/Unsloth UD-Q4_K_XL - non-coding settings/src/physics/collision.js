/**
 * Collision detection and physics resolution module.
 * Provides AABB collision detection, OBB (Oriented Bounding Box) collision
 * using the Separating Axis Theorem (SAT), and impulse-based collision resolution.
 * 
 * @module collision
 */

import Vector2 from '../core/vector2.js';

// Physics constants for collision resolution
const RESTITUTION = 0.5;           // Coefficient of restitution (bounciness)
const POSITION_CORRECTION_PERCENT = 0.8; // Percentage of overlap to correct
const POSITION_SLOP = 0.1;         // Small threshold to avoid jitter

/**
 * Checks for collision between two Axis-Aligned Bounding Boxes (AABB).
 * 
 * An AABB is defined by its left, right, top, and bottom boundaries.
 * Two AABBs collide if they overlap on both the X and Y axes.
 * 
 * @param {Object} aabb1 - First bounding box with properties: left, right, top, bottom
 * @param {Object} aabb2 - Second bounding box with properties: left, right, top, bottom
 * @returns {{colliding: boolean, overlapX: number, overlapY: number}|null} 
 *          Returns collision info if colliding, null otherwise.
 */
export function checkAABB(aabb1, aabb2) {
    // Check for separation on X axis
    const overlapX = Math.min(aabb1.right, aabb2.right) - Math.max(aabb1.left, aabb2.left);
    
    if (overlapX <= 0) {
        return null; // No collision - separated on X axis
    }
    
    // Check for separation on Y axis
    const overlapY = Math.min(aabb1.bottom, aabb2.bottom) - Math.max(aabb1.top, aabb2.top);
    
    if (overlapY <= 0) {
        return null; // No collision - separated on Y axis
    }
    
    // Collision detected on both axes
    return {
        colliding: true,
        overlapX: overlapX,
        overlapY: overlapY
    };
}

/**
 * Checks for collision between two Oriented Bounding Boxes (OBB) using the 
 * Separating Axis Theorem (SAT).
 * 
 * SAT Algorithm Explanation:
 * -------------------------
 * The Separating Axis Theorem states that two convex shapes do not intersect
 * if and only if there exists a line (axis) onto which their projections do not overlap.
 * 
 * For OBBs, we need to test the following axes:
 * - The normal vector of each box's local X axis (forward direction)
 * - The tangent vector of each box's local Y axis (right direction)
 * 
 * This gives us 4 potential separating axes for two rectangles.
 * 
 * For each axis, we project all corners of both boxes onto that axis and check
 * if the resulting intervals overlap. If any axis shows no overlap (separation),
 * then there is no collision. If all axes show overlap, a collision exists.
 * 
 * The penetration depth and normal are calculated from the axis with minimum overlap.
 * 
 * @param {Object} obb1 - First oriented bounding box with properties:
 *                       corners: Array<Vector2> (4 corner positions),
 *                       center: Vector2, angle: number, width: number, height: number
 * @param {Object} obb2 - Second oriented bounding box with same structure
 * @returns {{colliding: boolean, normal: Vector2, penetrationDepth: number}|null}
 *          Returns collision info if colliding, null otherwise.
 */
export function checkOBB(obb1, obb2) {
    // Get the axes to test - normals and tangents from both boxes
    // For a box with angle θ: normal = (cos θ, sin θ), tangent = (-sin θ, cos θ)
    const axes = [
        new Vector2(Math.cos(obb1.angle), Math.sin(obb1.angle)),      // Box 1 normal
        new Vector2(-Math.sin(obb1.angle), Math.cos(obb1.angle)),     // Box 1 tangent
        new Vector2(Math.cos(obb2.angle), Math.sin(obb2.angle)),      // Box 2 normal
        new Vector2(-Math.sin(obb2.angle), Math.cos(obb2.angle))      // Box 2 tangent
    ];
    
    let minPenetrationDepth = Infinity;
    let collisionNormal = null;
    
    // Test each potential separating axis
    for (const axis of axes) {
        // Project both boxes onto this axis
        const proj1 = projectOntoAxis(obb1.corners, axis);
        const proj2 = projectOntoAxis(obb2.corners, axis);
        
        // Check for separation on this axis
        if (proj1.max < proj2.min || proj2.max < proj1.min) {
            return null; // Found a separating axis - no collision
        }
        
        // Calculate overlap on this axis
        const overlap = Math.min(proj1.max, proj2.max) - Math.max(proj1.min, proj2.min);
        
        // Track the minimum penetration (this gives us the collision normal)
        if (overlap < minPenetrationDepth) {
            minPenetrationDepth = overlap;
            
            // Determine the direction of the normal
            const centerDiff = obb2.center.subtract(obb1.center);
            const dotProduct = centerDiff.dot(axis);
            
            // Normal should point from box 1 to box 2
            collisionNormal = dotProduct >= 0 ? axis.clone() : axis.multiply(-1);
        }
    }
    
    // If we get here, all axes showed overlap - collision detected
    return {
        colliding: true,
        normal: collisionNormal,
        penetrationDepth: minPenetrationDepth
    };
}

/**
 * Projects a set of corners onto an axis and returns the min/max projection values.
 * 
 * Projection is done using the dot product: proj = corner · axis
 * This gives the scalar distance along the axis for each corner.
 * 
 * @param {Vector2[]} corners - Array of 4 corner positions to project
 * @param {Vector2} axis - The normalized axis to project onto
 * @returns {{min: number, max: number}} The projection interval
 */
function projectOntoAxis(corners, axis) {
    let min = Infinity;
    let max = -Infinity;
    
    for (const corner of corners) {
        const projection = corner.dot(axis);
        if (projection < min) min = projection;
        if (projection > max) max = projection;
    }
    
    return { min, max };
}

/**
 * Resolves a collision between two cars using impulse-based physics.
 * 
 * Impulse-Based Resolution Explanation:
 * -------------------------------------
 * When two objects collide, we apply an instantaneous change in velocity (impulse)
 * to separate them and simulate the bounce effect.
 * 
 * The impulse formula is derived from conservation of momentum and the coefficient
 * of restitution (bounciness):
 * 
 * j = -(1 + e) * v_rel · n / (1/m₁ + 1/m₂)
 * 
 * Where:
 * - j is the impulse scalar magnitude
 * - e is the coefficient of restitution (0 = no bounce, 1 = perfectly elastic)
 * - v_rel is the relative velocity (v₁ - v₂)
 * - n is the collision normal (unit vector pointing from car1 to car2)
 * - m₁, m₂ are the masses of the two cars
 * 
 * After calculating the impulse, we apply it to each car's velocity:
 * - v₁' = v₁ + j·n / m₁
 * - v₂' = v₂ - j·n / m₂
 * 
 * We also apply position correction to prevent objects from sticking together
 * due to numerical errors. Each object is moved along the normal proportional
 * to its inverse mass (lighter objects move more).
 * 
 * @param {Object} car1 - First car with properties: position, velocity, width, height
 * @param {Object} car2 - Second car with same structure
 * @param {{normal: Vector2, penetrationDepth: number}} collisionResult - Result from checkOBB
 */
export function resolveCollision(car1, car2, collisionResult) {
    const normal = collisionResult.normal;
    const penetrationDepth = collisionResult.penetrationDepth;
    
    // Calculate mass based on car dimensions (area as proxy for mass)
    const mass1 = car1.width * car1.height;
    const mass2 = car2.width * car2.height;
    
    // Calculate relative velocity: v_rel = v₁ - v₂
    const relativeVelocity = car1.velocity.subtract(car2.velocity);
    
    // Get the component of relative velocity along the collision normal
    const velocityAlongNormal = relativeVelocity.dot(normal);
    
    // Don't resolve if velocities are already separating (moving apart)
    if (velocityAlongNormal > 0) {
        return;
    }
    
    // Calculate impulse scalar using the formula:
    // j = -(1 + e) * v_rel · n / (1/m₁ + 1/m₂)
    const restitution = RESTITUTION;
    let impulseScalar = -(1 + restitution) * velocityAlongNormal;
    impulseScalar /= (1 / mass1 + 1 / mass2);
    
    // Apply the impulse to each car's velocity
    // The impulse vector is: j · n
    const impulse = normal.multiply(impulseScalar);
    
    // v₁' = v₁ + j·n / m₁, v₂' = v₂ - j·n / m₂
    car1.velocity = car1.velocity.add(impulse.divide(mass1));
    car2.velocity = car2.velocity.subtract(impulse.divide(mass2));
    
    // Position correction to prevent sticking
    // Move each car by penetrationDepth * (otherMass / totalMass) along normal
    
    const totalMass = mass1 + mass2;
    
    // Calculate correction magnitude with slop to avoid jitter
    const correctionMagnitude = Math.max(penetrationDepth - POSITION_SLOP, 0);
    
    // Distribute correction based on inverse mass (lighter objects move more)
    // car1 moves by: correction * (mass2 / totalMass) in the negative normal direction
    // car2 moves by: correction * (mass1 / totalMass) in the positive normal direction
    
    const percentBounce = POSITION_CORRECTION_PERCENT;
    
    const correctionForCar1 = normal.multiply(
        -correctionMagnitude * percentBounce * (mass2 / totalMass)
    );
    
    const correctionForCar2 = normal.multiply(
        correctionMagnitude * percentBounce * (mass1 / totalMass)
    );
    
    car1.position = car1.position.add(correctionForCar1);
    car2.position = car2.position.add(correctionForCar2);
}

/**
 * Calculates the four corner positions of an oriented bounding box.
 * 
 * Given a center position, width, height, and rotation angle, this function
 * computes the world-space coordinates of all four corners by rotating the
 * local AABB corners around the center point.
 * 
 * @param {Vector2} center - The center position of the box
 * @param {number} width - Width of the box in pixels
 * @param {number} height - Height of the box in pixels  
 * @param {number} angle - Rotation angle in radians (0 = aligned with X axis)
 * @returns {Vector2[]} Array of 4 corner positions in clockwise order starting from top-left
 */
export function calculateOBBCorners(center, width, height, angle) {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Local corners relative to center (before rotation)
    const localCorners = [
        new Vector2(-halfWidth, -halfHeight), // Top-left
        new Vector2(halfWidth, -halfHeight),  // Top-right
        new Vector2(halfWidth, halfHeight),   // Bottom-right
        new Vector2(-halfWidth, halfHeight)   // Bottom-left
    ];
    
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Rotate each corner around the center and translate to world space
    return localCorners.map(corner => {
        // Apply rotation matrix: x' = x*cos - y*sin, y' = x*sin + y*cos
        const rotatedX = corner.x * cos - corner.y * sin;
        const rotatedY = corner.x * sin + corner.y * cos;
        
        return center.add(new Vector2(rotatedX, rotatedY));
    });
}

/**
 * Gets the OBB (Oriented Bounding Box) representation of a car.
 * 
 * @param {Object} car - Car object with position, width, height, and angle properties
 * @returns {{corners: Vector2[], center: Vector2, angle: number, width: number, height: number}}
 */
export function getCarOBB(car) {
    const corners = calculateOBBCorners(
        car.position, 
        car.width, 
        car.height, 
        car.angle
    );
    
    return {
        corners: corners,
        center: car.position.clone(),
        angle: car.angle,
        width: car.width,
        height: car.height
    };
}
