import { Vector2D } from '../utils/vector2d.js';

/**
 * Collision System - Handles detection and resolution of collisions
 */
export class CollisionSystem {
    constructor() {
        // Collision response parameters
        this.restitution = 0.7;      // Bounciness (0-1)
        this.wallRestitution = 0.5;  // Wall bounciness
        this.separationOffset = 1;   // Extra separation when resolving
    }

    /**
     * Check and resolve all collisions between cars and track boundaries
     * @param {Array<Car>} cars - Array of cars
     * @param {Track} track - Track with boundaries
     * @param {number} dt - Delta time
     */
    update(cars, track, dt) {
        // Car-to-car collisions
        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                const collision = this.checkCarToCar(cars[i], cars[j]);
                if (collision) {
                    this.resolveCarToCar(cars[i], cars[j], collision);
                }
            }
        }
        
        // Car-to-wall collisions
        for (const car of cars) {
            this.checkAndResolveWallCollisions(car, track);
        }
    }

    /**
     * Check collision between two cars using SAT
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @returns {Object|null} Collision info or null
     */
    checkCarToCar(car1, car2) {
        // Quick AABB check first
        const aabb1 = car1.getAABB();
        const aabb2 = car2.getAABB();
        
        if (aabb1.maxX < aabb2.minX || aabb1.minX > aabb2.maxX ||
            aabb1.maxY < aabb2.minY || aabb1.minY > aabb2.maxY) {
            return null; // No collision
        }
        
        // SAT collision detection
        const corners1 = car1.getCorners();
        const corners2 = car2.getCorners();
        
        // Get axes to test (perpendicular to each edge)
        const axes = [];
        
        // Axes from car1
        for (let i = 0; i < 4; i++) {
            const edge = Vector2D.sub(corners1[(i + 1) % 4], corners1[i]);
            axes.push(edge.perpCCW().normalize());
        }
        
        // Axes from car2
        for (let i = 0; i < 4; i++) {
            const edge = Vector2D.sub(corners2[(i + 1) % 4], corners2[i]);
            axes.push(edge.perpCCW().normalize());
        }
        
        // Test each axis
        let minOverlap = Infinity;
        let smallestAxis = null;
        
        for (const axis of axes) {
            const proj1 = this.projectCorners(corners1, axis);
            const proj2 = this.projectCorners(corners2, axis);
            
            const overlap = Math.min(proj1.max - proj2.min, proj2.max - proj1.min);
            
            if (overlap <= 0) {
                return null; // Separating axis found
            }
            
            if (overlap < minOverlap) {
                minOverlap = overlap;
                smallestAxis = axis;
            }
        }
        
        // Ensure normal points from car1 to car2
        const d = Vector2D.sub(car2.position, car1.position);
        if (d.dot(smallestAxis) < 0) {
            smallestAxis.negate();
        }
        
        return {
            normal: smallestAxis,
            depth: minOverlap
        };
    }

    /**
     * Project corners onto an axis
     * @param {Array<Vector2D>} corners - Array of corner positions
     * @param {Vector2D} axis - Axis to project onto
     * @returns {Object} {min, max} projection values
     */
    projectCorners(corners, axis) {
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
     * Resolve car-to-car collision with impulse
     * @param {Car} car1 - First car
     * @param {Car} car2 - Second car
     * @param {Object} collision - Collision info
     */
    resolveCarToCar(car1, car2, collision) {
        const normal = collision.normal;
        const depth = collision.depth;
        
        // Separate the cars
        const separation = Vector2D.mul(normal, depth / 2 + this.separationOffset);
        car1.position.sub(separation);
        car2.position.add(separation);
        
        // Calculate relative velocity
        const relVel = Vector2D.sub(car1.velocity, car2.velocity);
        const relVelNormal = relVel.dot(normal);
        
        // Don't resolve if cars are separating
        if (relVelNormal > 0) return;
        
        // Calculate impulse scalar
        const e = this.restitution;
        const j = -(1 + e) * relVelNormal / (1 / car1.mass + 1 / car2.mass);
        
        // Apply impulse
        const impulse = Vector2D.mul(normal, j);
        car1.velocity.add(Vector2D.div(impulse, car1.mass));
        car2.velocity.sub(Vector2D.div(impulse, car2.mass));
        
        // Set collision cooldown
        car1.collisionCooldown = 0.1;
        car2.collisionCooldown = 0.1;
    }

    /**
     * Check and resolve wall collisions for a car
     * @param {Car} car - Car to check
     * @param {Track} track - Track with walls
     */
    checkAndResolveWallCollisions(car, track) {
        const corners = car.getCorners();
        const nextCorners = this.getNextCorners(car);
        
        // Check each corner against both walls
        for (let i = 0; i < corners.length; i++) {
            const collision = this.checkWallCollision(
                corners[i], nextCorners[i], track
            );
            
            if (collision) {
                this.resolveWallCollision(car, collision);
            }
        }
    }

    /**
     * Get predicted next corner positions
     * @param {Car} car - Car to predict
     * @returns {Array<Vector2D>} Next corner positions
     */
    getNextCorners(car) {
        const nextPos = Vector2D.add(car.position, 
            Vector2D.mul(car.velocity, 0.1)); // Predict 100ms ahead
        const corners = car.getCorners();
        const delta = Vector2D.sub(nextPos, car.position);
        return corners.map(c => Vector2D.add(c, delta));
    }

    /**
     * Check if a point crosses a wall boundary
     * @param {Vector2D} p1 - Current corner position
     * @param {Vector2D} p2 - Next corner position
     * @param {Track} track - Track with walls
     * @returns {Object|null} Collision info
     */
    checkWallCollision(p1, p2, track) {
        // Check inner wall
        const innerCollision = track.checkWallIntersection(p1, p2, track.innerWall);
        if (innerCollision) {
            // Determine if collision is from inside (should be reflected)
            return {
                point: innerCollision.point,
                normal: innerCollision.normal,
                wall: 'inner'
            };
        }
        
        // Check outer wall
        const outerCollision = track.checkWallIntersection(p1, p2, track.outerWall);
        if (outerCollision) {
            // Flip normal for outer wall (car should be pushed inward)
            return {
                point: outerCollision.point,
                normal: outerCollision.normal.negate(),
                wall: 'outer'
            };
        }
        
        return null;
    }

    /**
     * Resolve car-to-wall collision
     * @param {Car} car - Car that collided
     * @param {Object} collision - Collision info
     */
    resolveWallCollision(car, collision) {
        const normal = collision.normal;
        const point = collision.point;
        
        // Push car away from wall
        const pushDist = 5;
        car.position.add(Vector2D.mul(normal, pushDist));
        
        // Calculate velocity component along normal
        const velDotNormal = car.velocity.dot(normal);
        
        // Only bounce if moving into wall
        if (velDotNormal < 0) {
            // Reflect velocity with restitution
            const reflection = Vector2D.mul(normal, -2 * velDotNormal);
            car.velocity.add(reflection);
            car.velocity.mul(this.wallRestitution);
            
            // Apply friction along wall
            const tangent = normal.perpCCW();
            const velTangent = car.velocity.dot(tangent);
            car.velocity.sub(Vector2D.mul(tangent, velTangent * 0.2));
        }
        
        car.collisionCooldown = 0.1;
    }

    /**
     * Check if a point is inside a polygon
     * @param {Vector2D} point - Point to check
     * @param {Array<Vector2D>} polygon - Polygon vertices
     * @returns {boolean} True if inside
     */
    pointInPolygon(point, polygon) {
        let inside = false;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }

    /**
     * Find closest point on line segment to a point
     * @param {Vector2D} point - The point
     * @param {Vector2D} lineStart - Line segment start
     * @param {Vector2D} lineEnd - Line segment end
     * @returns {Vector2D} Closest point on line
     */
    closestPointOnLine(point, lineStart, lineEnd) {
        const line = Vector2D.sub(lineEnd, lineStart);
        const len = line.length();
        
        if (len === 0) return lineStart.clone();
        
        const t = Math.max(0, Math.min(1, 
            Vector2D.sub(point, lineStart).dot(line) / (len * len)));
        
        return Vector2D.add(lineStart, Vector2D.mul(line, t));
    }
}