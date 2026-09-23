/**
 * Physics calculations for the rotating hexagon simulation
 * Contains collision detection and response algorithms
 */

const Physics = {
    /**
     * Calculate distance between two points
     */
    distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Normalize a vector to unit length
     */
    normalize(x, y) {
        const len = Math.sqrt(x * x + y * y);
        if (len === 0) return { x: 0, y: 0 };
        return { x: x / len, y: y / len };
    },

    /**
     * Calculate dot product of two vectors
     */
    dotProduct(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y;
    },

    /**
     * Check if two circles are colliding
     */
    circleToCircleCollision(ball1, ball2) {
        const dist = this.distance(ball1.x, ball1.y, ball2.x, ball2.y);
        return dist < ball1.radius + ball2.radius;
    },

    /**
     * Calculate distance from a point to a line segment
     * Returns object with distance and closest point on line
     */
    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) {
            // Line segment is a point
            return {
                distance: this.distance(px, py, x1, y1),
                closestX: x1,
                closestY: y1,
                t: 0
            };
        }
        
        // Calculate projection parameter t
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        
        const dist = this.distance(px, py, closestX, closestY);
        
        return {
            distance: dist,
            closestX: closestX,
            closestY: closestY,
            t: t
        };
    },

    /**
     * Resolve collision between two balls using elastic collision physics
     */
    resolveBallCollision(ball1, ball2, elasticity) {
        const dx = ball2.x - ball1.x;
        const dy = ball2.y - ball1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist === 0) return;
        
        // Normal vector from ball1 to ball2
        const nx = dx / dist;
        const ny = dy / dist;
        
        // Relative velocity
        const dvx = ball1.vx - ball2.vx;
        const dvy = ball1.vy - ball2.vy;
        
        // Relative velocity along collision normal
        const dvn = dvx * nx + dvy * ny;
        
        // Don't resolve if balls are moving apart
        if (dvn > 0) return;
        
        // Calculate impulse scalar
        const mass1 = ball1.mass;
        const mass2 = ball2.mass;
        const impulse = -(1 + elasticity) * dvn / (1 / mass1 + 1 / mass2);
        
        // Apply impulse to velocities
        ball1.vx += impulse * nx / mass1;
        ball1.vy += impulse * ny / mass1;
        ball2.vx -= impulse * nx / mass2;
        ball2.vy -= impulse * ny / mass2;
        
        // Separate overlapping balls
        const overlap = ball1.radius + ball2.radius - dist;
        if (overlap > 0) {
            const separationX = nx * overlap / 2;
            const separationY = ny * overlap / 2;
            ball1.x -= separationX;
            ball1.y -= separationY;
            ball2.x += separationX;
            ball2.y += separationY;
        }
    },

    /**
     * Resolve collision between a ball and a wall
     * Takes into account the wall's rotational velocity
     */
    resolveWallCollision(ball, wallNormal, wallVelocity, elasticity, wallFriction = 0.98) {
        // Reflect velocity across wall normal
        const dot = ball.vx * wallNormal.x + ball.vy * wallNormal.y;
        
        // Only reflect if moving towards the wall
        if (dot < 0) {
            // Calculate reflected velocity
            const reflectedX = ball.vx - 2 * dot * wallNormal.x;
            const reflectedY = ball.vy - 2 * dot * wallNormal.y;
            
            // Add wall velocity component (transfer factor)
            const transferFactor = 0.3;
            ball.vx = reflectedX * elasticity + wallVelocity.x * transferFactor;
            ball.vy = reflectedY * elasticity + wallVelocity.y * transferFactor;
            
            // Apply tangential friction
            const tangentX = -wallNormal.y;
            const tangentY = wallNormal.x;
            const tangentVel = ball.vx * tangentX + ball.vy * tangentY;
            ball.vx = ball.vx * (1 - (1 - wallFriction) * Math.abs(wallNormal.x));
            ball.vy = ball.vy * (1 - (1 - wallFriction) * Math.abs(wallNormal.y));
        }
    },

    /**
     * Calculate wall velocity at a given position due to rotation
     */
    getWallVelocityAtPoint(ballX, ballY, centerX, centerY, angularVelocity) {
        // Vector from center to ball position
        const rx = ballX - centerX;
        const ry = ballY - centerY;
        
        // Tangential velocity = angularVelocity × perpendicular distance
        // For clockwise rotation (positive angularVelocity)
        const wallVelX = -angularVelocity * ry;
        const wallVelY = angularVelocity * rx;
        
        return { x: wallVelX, y: wallVelY };
    },

    /**
     * Apply gravity to a ball
     */
    applyGravity(ball, gravity) {
        ball.vy += gravity;
    },

    /**
     * Apply air friction to a ball
     */
    applyFriction(ball, friction) {
        ball.vx *= friction;
        ball.vy *= friction;
    },

    /**
     * Update ball position based on velocity and delta time
     */
    updatePosition(ball, deltaTime) {
        // Scale velocity by delta time (normalized to 60fps)
        const scale = deltaTime / (1000 / 60);
        ball.x += ball.vx * scale;
        ball.y += ball.vy * scale;
    },

    /**
     * Clamp a value between min and max
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    /**
     * Generate random number in range
     */
    random(min, max) {
        return Math.random() * (max - min) + min;
    },

    /**
     * Generate random angle in radians
     */
    randomAngle() {
        return Math.random() * Math.PI * 2;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Physics;
}
