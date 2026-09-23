import { Vector2 } from '../utils/Vector2.js';

/**
 * Collision detection using Separating Axis Theorem (SAT) for OBB (Oriented Bounding Box)
 */
export class CollisionDetector {
    /**
     * Check collision between two cars using SAT
     * Returns collision info or null if no collision
     */
    static checkCarCollision(carA, carB) {
        const cornersA = carA.getCorners();
        const cornersB = carB.getCorners();

        // Get axes to test (normals of both boxes)
        const axes = [];

        // Add normals from car A
        const edgeA0 = cornersA[1].subtract(cornersA[0]);
        axes.push(new Vector2(-edgeA0.y, edgeA0.x).normalize());
        const edgeA1 = cornersA[2].subtract(cornersA[1]);
        axes.push(new Vector2(-edgeA1.y, edgeA1.x).normalize());

        // Add normals from car B
        const edgeB0 = cornersB[1].subtract(cornersB[0]);
        axes.push(new Vector2(-edgeB0.y, edgeB0.x).normalize());
        const edgeB1 = cornersB[2].subtract(cornersB[1]);
        axes.push(new Vector2(-edgeB1.y, edgeB1.x).normalize());

        let minOverlap = Infinity;
        let collisionAxis = null;

        // Test each axis
        for (const axis of axes) {
            const projA = this.projectOntoAxis(cornersA, axis);
            const projB = this.projectOntoAxis(cornersB, axis);

            // Check for separation
            if (projA.max < projB.min || projB.max < projA.min) {
                return null; // No collision
            }

            // Calculate overlap
            const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                collisionAxis = axis;
            }
        }

        // Ensure collision axis points from A to B
        const centerA = carA.physics.position;
        const centerB = carB.physics.position;
        const direction = centerB.subtract(centerA);
        if (direction.dot(collisionAxis) < 0) {
            collisionAxis = collisionAxis.multiply(-1);
        }

        return {
            overlap: minOverlap,
            axis: collisionAxis,
            point: centerA.add(centerB).divide(2) // Approximate collision point
        };
    }

    /**
     * Project polygon onto axis
     */
    static projectOntoAxis(corners, axis) {
        let min = corners[0].dot(axis);
        let max = min;

        for (let i = 1; i < corners.length; i++) {
            const proj = corners[i].dot(axis);
            if (proj < min) min = proj;
            if (proj > max) max = proj;
        }

        return { min, max };
    }

    /**
     * Check if a point is inside a polygon
     */
    static pointInPolygon(point, corners) {
        let inside = false;
        for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
            const xi = corners[i].x, yi = corners[i].y;
            const xj = corners[j].x, yj = corners[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}