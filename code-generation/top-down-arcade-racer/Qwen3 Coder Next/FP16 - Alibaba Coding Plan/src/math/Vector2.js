/**
 * 2D Vector class with mathematical operations
 * Used for positions, velocities, and directions in the game
 */
export class Vector2 {
    /**
     * @param {number} x - X component
     * @param {number} y - Y component
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Create a copy of this vector
     * @returns {Vector2} New vector with same values
     */
    clone() {
        return new Vector2(this.x, this.y);
    }

    /**
     * Add another vector to this one
     * @param {Vector2} other - Vector to add
     * @returns {Vector2} This vector for chaining
     */
    add(other) {
        this.x += other.x;
        this.y += other.y;
        return this;
    }

    /**
     * Subtract another vector from this one
     * @param {Vector2} other - Vector to subtract
     * @returns {Vector2} This vector for chaining
     */
    subtract(other) {
        this.x -= other.x;
        this.y -= other.y;
        return this;
    }

    /**
     * Multiply vector by a scalar
     * @param {number} scalar - Scalar value
     * @returns {Vector2} This vector for chaining
     */
    multiply(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }

    /**
     * Divide vector by a scalar
     * @param {number} scalar - Scalar value
     * @returns {Vector2} This vector for chaining
     */
    divide(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.y /= scalar;
        }
        return this;
    }

    /**
     * Divide vector by another vector (component-wise)
     * @param {Vector2} other - Vector to divide by
     * @returns {Vector2} This vector for chaining
     */
    divideVector(other) {
        this.x /= other.x;
        this.y /= other.y;
        return this;
    }

    /**
     * Get the length (magnitude) of the vector
     * @returns {number} Vector length
     */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Get the squared length (faster than length for comparisons)
     * @returns {number} Squared vector length
     */
    lengthSquared() {
        return this.x * this.x + this.y * this.y;
    }

    /**
     * Calculate distance to another vector
     * @param {Vector2} other - Target vector
     * @returns {number} Distance
     */
    distance(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate squared distance to another vector (faster than distance)
     * @param {Vector2} other - Target vector
     * @returns {number} Squared distance
     */
    distanceSquared(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return dx * dx + dy * dy;
    }

    /**
     * Normalize the vector to unit length
     * @returns {Vector2} This vector for chaining
     */
    normalize() {
        const len = this.length();
        if (len > 0) {
            this.divide(len);
        }
        return this;
    }

    /**
     * Get a normalized copy of this vector
     * @returns {Vector2} New normalized vector
     */
    normalized() {
        const copy = this.clone();
        return copy.normalize();
    }

    /**
     * Get a perpendicular vector (rotated 90 degrees counter-clockwise)
     * @returns {Vector2} New perpendicular vector
     */
    perpendicular() {
        return new Vector2(-this.y, this.x);
    }

    /**
     * Calculate dot product with another vector
     * @param {Vector2} other - Vector to dot with
     * @returns {number} Dot product
     */
    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    /**
     * Calculate cross product with another vector (2D cross product returns a scalar)
     * @param {Vector2} other - Vector to cross with
     * @returns {number} Cross product (z-component)
     */
    cross(other) {
        return this.x * other.y - this.y * other.x;
    }

    /**
     * Negate the vector (reverse direction)
     * @returns {Vector2} This vector for chaining
     */
    negate() {
        this.x = -this.x;
        this.y = -this.y;
        return this;
    }

    /**
     * Get a negated copy of this vector
     * @returns {Vector2} New negated vector
     */
    negated() {
        return new Vector2(-this.x, -this.y);
    }

    /**
     * Rotate vector by angle (in radians)
     * @param {number} angle - Rotation angle in radians
     * @returns {Vector2} This vector for chaining
     */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const newX = this.x * cos - this.y * sin;
        const newY = this.x * sin + this.y * cos;
        this.x = newX;
        this.y = newY;
        return this;
    }

    /**
     * Get a rotated copy of this vector
     * @param {number} angle - Rotation angle in radians
     * @returns {Vector2} New rotated vector
     */
    rotated(angle) {
        const copy = this.clone();
        return copy.rotate(angle);
    }

    /**
     * Calculate distance to another vector
     * @param {Vector2} other - Target vector
     * @returns {number} Distance
     */
    distance(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate squared distance to another vector
     * @param {Vector2} other - Target vector
     * @returns {number} Squared distance
     */
    distanceSquared(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return dx * dx + dy * dy;
    }

    /**
     * Linear interpolation between two vectors
     * @param {Vector2} other - Target vector
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Vector2} This vector for chaining
     */
    lerp(other, t) {
        this.x = this.x + (other.x - this.x) * t;
        this.y = this.y + (other.y - this.y) * t;
        return this;
    }

    /**
     * Get a linearly interpolated copy
     * @param {Vector2} other - Target vector
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Vector2} New interpolated vector
     */
    lerpCopy(other, t) {
        return new Vector2(
            this.x + (other.x - this.x) * t,
            this.y + (other.y - this.y) * t
        );
    }

    /**
     * Clone this vector
     * @returns {Vector2} New copy
     */
    clone() {
        return new Vector2(this.x, this.y);
    }

    /**
     * Check if this vector equals another
     * @param {Vector2} other - Vector to compare
     * @param {number} epsilon - Tolerance for floating point comparison
     * @returns {boolean} True if equal
     */
    equals(other, epsilon = 0.0001) {
        return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon;
    }

    /**
     * Create a vector from polar coordinates
     * @param {number} length - Vector length
     * @param {number} angle - Angle in radians
     * @returns {Vector2} New vector
     */
    static fromPolar(length, angle) {
        return new Vector2(length * Math.cos(angle), length * Math.sin(angle));
    }

    /**
     * Create a zero vector
     * @returns {Vector2} Vector with x=0, y=0
     */
    static zero() {
        return new Vector2(0, 0);
    }

    /**
     * Create a unit vector pointing right
     * @returns {Vector2} Vector with x=1, y=0
     */
    static right() {
        return new Vector2(1, 0);
    }

    /**
     * Create a unit vector pointing up
     * @returns {Vector2} Vector with x=0, y=-1
     */
    static up() {
        return new Vector2(0, -1);
    }

    /**
     * Create a unit vector pointing left
     * @returns {Vector2} Vector with x=-1, y=0
     */
    static left() {
        return new Vector2(-1, 0);
    }

    /**
     * Create a unit vector pointing down
     * @returns {Vector2} Vector with x=0, y=1
     */
    static down() {
        return new Vector2(0, 1);
    }

    /**
     * Calculate perpendicular vector (rotated 90 degrees counter-clockwise)
     * @returns {Vector2} Perpendicular vector
     */
    perpendicular() {
        return new Vector2(-this.y, this.x);
    }

    /**
     * Calculate perpendicular vector (rotated 90 degrees clockwise)
     * @returns {Vector2} Perpendicular vector
     */
    perpendicularCW() {
        return new Vector2(this.y, -this.x);
    }

    /**
     * Clamp vector length to maximum value
     * @param {number} maxLength - Maximum length
     * @returns {Vector2} This vector for chaining
     */
    clampLength(maxLength) {
        const lenSq = this.lengthSquared();
        if (lenSq > maxLength * maxLength) {
            this.normalize().multiply(maxLength);
        }
        return this;
    }

    /**
     * Clamp each component to min/max values
     * @param {number} minX - Minimum X
     * @param {number} maxX - Maximum X
     * @param {number} minY - Minimum Y
     * @param {number} maxY - Maximum Y
     * @returns {Vector2} This vector for chaining
     */
    clamp(minX, maxX, minY, maxY) {
        this.x = Math.max(minX, Math.min(maxX, this.x));
        this.y = Math.max(minY, Math.min(maxY, this.y));
        return this;
    }

    /**
     * Round components to nearest integer
     * @returns {Vector2} This vector for chaining
     */
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }

    /**
     * Floor components to nearest integer
     * @returns {Vector2} This vector for chaining
     */
    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        return this;
    }

    /**
     * Ceil components to nearest integer
     * @returns {Vector2} This vector for chaining
     */
    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        return this;
    }

    /**
     * Convert to string representation
     * @returns {string} String representation
     */
    toString() {
        return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }

    /**
     * Create a vector from polar coordinates (angle and magnitude)
     * @param {number} magnitude - Vector length
     * @param {number} angle - Angle in radians
     * @returns {Vector2} New vector
     */
    static fromPolar(magnitude, angle) {
        return new Vector2(
            magnitude * Math.cos(angle),
            magnitude * Math.sin(angle)
        );
    }
}
