/**
 * 2D Vector Math Class
 * Provides essential vector operations for physics calculations
 */
export class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    
    /**
     * Create a copy of this vector
     */
    clone() {
        return new Vector2(this.x, this.y);
    }
    
    /**
     * Set vector components
     */
    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
    
    /**
     * Copy from another vector
     */
    copy(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }
    
    /**
     * Add another vector to this one
     */
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    
    /**
     * Subtract another vector from this one
     */
    subtract(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }
    
    /**
     * Multiply by scalar
     */
    multiply(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }
    
    /**
     * Divide by scalar
     */
    divide(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.y /= scalar;
        }
        return this;
    }
    
    /**
     * Get length (magnitude) of vector
     */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    
    /**
     * Get squared length (faster, no sqrt)
     */
    lengthSquared() {
        return this.x * this.x + this.y * this.y;
    }
    
    /**
     * Normalize to unit vector
     */
    normalize() {
        const len = this.length();
        if (len > 0) {
            this.x /= len;
            this.y /= len;
        }
        return this;
    }
    
    /**
     * Get dot product with another vector
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
    
    /**
     * Get 2D cross product (returns scalar)
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }
    
    /**
     * Rotate vector by angle (radians)
     */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        this.x = x;
        this.y = y;
        return this;
    }
    
    /**
     * Get angle of vector (radians)
     */
    angle() {
        return Math.atan2(this.y, this.x);
    }
    
    /**
     * Get distance to another vector
     */
    distanceTo(v) {
        const dx = v.x - this.x;
        const dy = v.y - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Get squared distance to another vector (faster)
     */
    distanceToSquared(v) {
        const dx = v.x - this.x;
        const dy = v.y - this.y;
        return dx * dx + dy * dy;
    }
    
    /**
     * Linear interpolation to another vector
     */
    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }
    
    /**
     * Negate vector
     */
    negate() {
        this.x = -this.x;
        this.y = -this.y;
        return this;
    }
    
    /**
     * Get perpendicular vector (rotated 90 degrees counter-clockwise)
     */
    perpendicular() {
        return new Vector2(-this.y, this.x);
    }
    
    /**
     * Check if vectors are equal
     */
    equals(v, epsilon = 0.0001) {
        return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }
    
    /**
     * String representation
     */
    toString() {
        return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }
    
    // Static helper methods
    
    /**
     * Add two vectors and return new vector
     */
    static add(a, b) {
        return new Vector2(a.x + b.x, a.y + b.y);
    }
    
    /**
     * Subtract two vectors and return new vector
     */
    static subtract(a, b) {
        return new Vector2(a.x - b.x, a.y - b.y);
    }
    
    /**
     * Multiply vector by scalar and return new vector
     */
    static multiply(v, scalar) {
        return new Vector2(v.x * scalar, v.y * scalar);
    }
    
    /**
     * Create vector from angle
     */
    static fromAngle(angle, length = 1) {
        return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
    }
    
    /**
     * Create random unit vector
     */
    static random(rng) {
        const angle = rng.next() * Math.PI * 2;
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
    
    /**
     * Linear interpolation between two vectors
     */
    static lerp(a, b, t) {
        return new Vector2(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t
        );
    }
}
