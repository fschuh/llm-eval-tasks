import { Vector2 } from '../physics/vector2.js';
import { CONFIG } from '../config.js';

/**
 * Collision Detection and Resolution System
 * Handles car-to-car and car-to-wall collisions with impulse resolution
 */
export class CollisionSystem {
    constructor() {
        // Temporary vectors for calculations
        this.tempVec = new Vector2();
        this.collisionNormal = new Vector2();
        this.relativeVelocity = new Vector2();
    }
    
    /**
     * Check and resolve all collisions between cars and walls
     */
    update(cars, walls) {
        // Car-to-car collisions
        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                this.checkCarToCarCollision(cars[i], cars[j]);
            }
        }
        
        // Car-to-wall collisions
        for (const car of cars) {
            for (const wall of walls) {
                this.checkCarToWallCollision(car, wall);
            }
        }
    }
    
    /**
     * Check and resolve collision between two cars
     */
    checkCarToCarCollision(carA, carB) {
        const dx = carB.position.x - carA.position.x;
        const dy = carB.position.y - carA.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = carA.radius + carB.radius;
        
        if (distance < minDistance && distance > 0) {
            // Collision detected - calculate normal
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Calculate penetration depth
            const penetration = minDistance - distance;
            
            // Separate cars
            const separationX = nx * penetration * 0.5;
            const separationY = ny * penetration * 0.5;
            
            carA.position.x -= separationX;
            carA.position.y -= separationY;
            carB.position.x += separationX;
            carB.position.y += separationY;
            
            // Calculate relative velocity
            const relVelX = carA.velocity.x - carB.velocity.x;
            const relVelY = carA.velocity.y - carB.velocity.y;
            
            // Calculate relative velocity along collision normal
            const relVelNormal = relVelX * nx + relVelY * ny;
            
            // Don't resolve if velocities are separating
            if (relVelNormal > 0) return;
            
            // Calculate restitution
            const restitution = CONFIG.CAR_RESTITUTION;
            
            // Calculate impulse magnitude
            const impulseMagnitude = -(1 + restitution) * relVelNormal / 
                (1 / carA.mass + 1 / carB.mass);
            
            // Apply impulse
            const impulseX = impulseMagnitude * nx;
            const impulseY = impulseMagnitude * ny;
            
            carA.velocity.x += impulseX / carA.mass;
            carA.velocity.y += impulseY / carA.mass;
            carB.velocity.x -= impulseX / carB.mass;
            carB.velocity.y -= impulseY / carB.mass;
            
            // Add some angular velocity based on collision
            carA.angularVelocity += (Math.random() - 0.5) * 0.5;
            carB.angularVelocity += (Math.random() - 0.5) * 0.5;
        }
    }
    
    /**
     * Check and resolve collision between car and wall segment
     */
    checkCarToWallCollision(car, wall) {
        // Find closest point on wall segment to car center
        const closest = this.closestPointOnSegment(
            car.position, 
            wall.start, 
            wall.end
        );
        
        const dx = car.position.x - closest.x;
        const dy = car.position.y - closest.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < car.radius && distance > 0) {
            // Collision detected
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Calculate penetration
            const penetration = car.radius - distance;
            
            // Push car out of wall
            car.position.x += nx * penetration;
            car.position.y += ny * penetration;
            
            // Calculate velocity component along normal
            const velDotNormal = car.velocity.x * nx + car.velocity.y * ny;
            
            // Only resolve if moving into wall
            if (velDotNormal < 0) {
                // Reflect velocity with restitution
                const restitution = CONFIG.WALL_RESTITUTION;
                
                car.velocity.x -= (1 + restitution) * velDotNormal * nx;
                car.velocity.y -= (1 + restitution) * velDotNormal * ny;
                
                // Add angular velocity from wall scrape
                car.angularVelocity += (Math.random() - 0.5) * 0.3;
            }
        }
    }
    
    /**
     * Find closest point on a line segment to a point
     */
    closestPointOnSegment(point, segStart, segEnd) {
        const lineX = segEnd.x - segStart.x;
        const lineY = segEnd.y - segStart.y;
        const lineLengthSq = lineX * lineX + lineY * lineY;
        
        if (lineLengthSq === 0) {
            return segStart.clone();
        }
        
        const t = Math.max(0, Math.min(1,
            ((point.x - segStart.x) * lineX + (point.y - segStart.y) * lineY) / lineLengthSq
        ));
        
        return new Vector2(
            segStart.x + t * lineX,
            segStart.y + t * lineY
        );
    }
    
    /**
     * Check if a point is inside a polygon
     */
    pointInPolygon(point, polygon) {
        let inside = false;
        const n = polygon.length;
        
        for (let i = 0, j = n - 1; i < n; j = i++) {
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
     * Get collision info for debugging
     */
    getCollisionInfo(carA, carB) {
        const dx = carB.position.x - carA.position.x;
        const dy = carB.position.y - carA.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = carA.radius + carB.radius;
        
        return {
            distance,
            minDistance,
            colliding: distance < minDistance,
            penetration: Math.max(0, minDistance - distance)
        };
    }
}
