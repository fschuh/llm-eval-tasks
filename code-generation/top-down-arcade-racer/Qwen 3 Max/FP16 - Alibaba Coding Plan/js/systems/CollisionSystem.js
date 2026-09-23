import { Vector2 } from '../utils/Vector2.js';

export class CollisionDetector {
    static checkCarCarCollision(car1, car2) {
        // Broad phase: Use circle collision as first pass for efficiency
        const distance = Vector2.distance(car1.position, car2.position);
        const radius1 = Math.sqrt((car1.width/2) * (car1.width/2) + (car1.length/2) * (car1.length/2));
        const radius2 = Math.sqrt((car2.width/2) * (car2.width/2) + (car2.length/2) * (car2.length/2));
        const minDistance = radius1 + radius2;
        
        if (distance > minDistance) {
            return null; // No collision possible
        }
        
        // Medium phase: Check bounding box collision for additional filtering
        const bbox1 = car1.getBoundingBox();
        const bbox2 = car2.getBoundingBox();
        
        if (!this.checkBoundingBoxCollision(bbox1, bbox2)) {
            return null;
        }
        
        // Narrow phase: Use Separating Axis Theorem (SAT) for precise collision
        const corners1 = car1.getCorners();
        const corners2 = car2.getCorners();
        
        // Get potential separating axes (edge normals)
        const axes = [];
        this.addEdgeNormals(corners1, axes);
        this.addEdgeNormals(corners2, axes);
        
        let minOverlap = Infinity;
        let smallestAxis = null;
        
        for (const axis of axes) {
            const proj1 = this.projectOntoAxis(corners1, axis);
            const proj2 = this.projectOntoAxis(corners2, axis);
            
            const overlap = this.getOverlap(proj1, proj2);
            if (overlap <= 0) {
                return null; // No collision - found separating axis
            }
            
            if (overlap < minOverlap) {
                minOverlap = overlap;
                smallestAxis = axis;
            }
        }
        
        // Calculate contact points (simplified - use center point)
        const contactPoint = this.getContactPoint(corners1, corners2, smallestAxis);
        
        return {
            type: 'CAR_VS_CAR',
            entity1: car1,
            entity2: car2,
            contactPoint: contactPoint,
            normal: smallestAxis,
            penetration: minOverlap,
            timestamp: performance.now()
        };
    }
    
    static addEdgeNormals(corners, axes) {
        for (let i = 0; i < corners.length; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % corners.length];
            const edge = p2.subtract(p1);
            const normal = new Vector2(-edge.y, edge.x).normalize();
            
            // Avoid duplicate axes (check if already exists with tolerance)
            let isDuplicate = false;
            for (const existingAxis of axes) {
                const dot = Math.abs(normal.dot(existingAxis));
                if (dot > 0.999) { // Nearly parallel
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                axes.push(normal);
            }
        }
    }
    
    static projectOntoAxis(corners, axis) {
        let min = Infinity;
        let max = -Infinity;
        
        for (const corner of corners) {
            const projection = corner.dot(axis);
            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }
        
        return { min, max };
    }
    
    static getOverlap(proj1, proj2) {
        const overlap1 = proj1.max - proj2.min;
        const overlap2 = proj2.max - proj1.min;
        return Math.min(overlap1, overlap2);
    }
    
    static getContactPoint(corners1, corners2, normal) {
        // Simplified contact point calculation - use average of overlapping regions
        // For better accuracy, we could find actual intersection points
        let sumX = 0, sumY = 0, count = 0;
        
        // Find vertices of car1 that are inside car2
        for (const corner of corners1) {
            if (this.isPointInPolygon(corner, corners2)) {
                sumX += corner.x;
                sumY += corner.y;
                count++;
            }
        }
        
        // Find vertices of car2 that are inside car1
        for (const corner of corners2) {
            if (this.isPointInPolygon(corner, corners1)) {
                sumX += corner.x;
                sumY += corner.y;
                count++;
            }
        }
        
        if (count > 0) {
            return new Vector2(sumX / count, sumY / count);
        }
        
        // Fallback: use midpoint between centers
        const center1 = this.getPolygonCenter(corners1);
        const center2 = this.getPolygonCenter(corners2);
        return new Vector2((center1.x + center2.x) / 2, (center1.y + center2.y) / 2);
    }
    
    static isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
                (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    }
    
    static getPolygonCenter(corners) {
        let sumX = 0, sumY = 0;
        for (const corner of corners) {
            sumX += corner.x;
            sumY += corner.y;
        }
        return new Vector2(sumX / corners.length, sumY / corners.length);
    }
    
    static checkBoundingBoxCollision(bbox1, bbox2) {
        return bbox1.x < bbox2.x + bbox2.width &&
               bbox1.x + bbox1.width > bbox2.x &&
               bbox1.y < bbox2.y + bbox2.height &&
               bbox1.y + bbox1.height > bbox2.y;
    }
}

export class CollisionResolver {
    constructor() {
        this.restitution = 0.3; // Coefficient of restitution (0 = no bounce, 1 = perfect bounce)
        this.friction = 0.8;    // Friction coefficient
    }
    
    resolveCarCarCollision(car1, car2, collision) {
        const normal = collision.normal;
        const contactPoint = collision.contactPoint;
        const penetration = collision.penetration;
        
        // Calculate relative velocity
        const relativeVelocity = car1.velocity.subtract(car2.velocity);
        
        // Calculate relative velocity along collision normal
        const velocityAlongNormal = relativeVelocity.dot(normal);
        
        // Don't resolve if objects are separating
        if (velocityAlongNormal > 0) {
            return;
        }
        
        // Calculate impulse magnitude using conservation of momentum
        const mass1 = car1.getMass();
        const mass2 = car2.getMass();
        const invMass1 = 1 / mass1;
        const invMass2 = 1 / mass2;
        
        // Impulse formula: j = -(1 + e) * Vn / (1/m1 + 1/m2)
        const impulseMagnitude = -(1 + this.restitution) * velocityAlongNormal / (invMass1 + invMass2);
        
        // Apply impulse to both cars
        const impulse = normal.multiply(impulseMagnitude);
        car1.velocity = car1.velocity.add(impulse.multiply(invMass1));
        car2.velocity = car2.velocity.subtract(impulse.multiply(invMass2));
        
        // Apply position correction to prevent sinking
        const percent = 0.8; // Percentage of penetration to correct
        const slop = 0.01;   // Small tolerance to prevent jitter
        const correction = normal.multiply(Math.max(penetration - slop, 0) / (invMass1 + invMass2) * percent);
        
        car1.position = car1.position.add(correction.multiply(invMass1));
        car2.position = car2.position.subtract(correction.multiply(invMass2));
        
        // Apply friction (tangential impulse)
        const tangent = relativeVelocity.subtract(normal.multiply(velocityAlongNormal)).normalize();
        const frictionImpulseMagnitude = -relativeVelocity.dot(tangent) / (invMass1 + invMass2);
        const frictionImpulse = tangent.multiply(Math.min(frictionImpulseMagnitude, impulseMagnitude * this.friction));
        
        car1.velocity = car1.velocity.add(frictionImpulse.multiply(invMass1));
        car2.velocity = car2.velocity.subtract(frictionImpulse.multiply(invMass2));
        
        // Trigger visual feedback for both cars
        car1.triggerCollisionEffect();
        car2.triggerCollisionEffect();
    }
}