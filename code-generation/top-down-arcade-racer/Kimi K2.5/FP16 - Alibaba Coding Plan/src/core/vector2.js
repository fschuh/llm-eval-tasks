/**
 * Vector2 - 2D Vector utility class
 * 
 * Provides mathematical operations for 2D vectors including
 * addition, subtraction, multiplication, division, dot product,
 * normalization, rotation, and distance calculations.
 */
export class Vector2 {
    /**
     * Create a new Vector2
     * @param {number} x - X coordinate (default: 0)
     * @param {number} y - Y coordinate (default: 0)
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Add another vector to this vector
     * @param {Vector2} v - Vector to add
     * @returns {Vector2} New vector representing the sum
     */
    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    /**
     * Subtract another vector from this vector
     * @param {Vector2} v - Vector to subtract
     * @returns {Vector2} New vector representing the difference
     */
    sub(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    /**
     * Multiply this vector by a scalar
     * @param {number} s - Scalar value
     * @returns {Vector2} New scaled vector
     */
    multiply(s) {
        return new Vector2(this.x * s, this.y * s);
    }

    /**
     * Alias for multiply - for compatibility with architecture spec
     * @param {number} s - Scalar value
     * @returns {Vector2} New scaled vector
     */
    mul(s) {
        return this.multiply(s);
    }

    /**
     * Divide this vector by a scalar
     * @param {number} s - Scalar value
     * @returns {Vector2} New divided vector
     */
    divide(s) {
        return new Vector2(this.x / s, this.y / s);
    }

    /**
     * Alias for divide - for compatibility with architecture spec
     * @param {number} s - Scalar value
     * @returns {Vector2} New divided vector
     */
    div(s) {
        return this.divide(s);
    }

    /**
     * Calculate the magnitude (length) of this vector
     * @returns {number} Magnitude of the vector
     */
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Alias for magnitude - for compatibility with architecture spec
     * @returns {number} Length of the vector
     */
    length() {
        return this.magnitude();
    }

    /**
     * Normalize this vector (create unit vector)
     * @returns {Vector2} Normalized vector, or zero vector if magnitude is 0
     */
    normalize() {
        const len = this.magnitude();
        if (len > 0) {
            return this.divide(len);
        }
        return new Vector2(0, 0);
    }

    /**
     * Calculate dot product with another vector
     * @param {Vector2} v - Other vector
     * @returns {number} Dot product
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    /**
     * Calculate cross product (2D analog) with another vector
     * Returns the z-component of the 3D cross product
     * @param {Vector2} v - Other vector
     * @returns {number} Cross product (scalar)
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    /**
     * Calculate distance to another vector
     * @param {Vector2} v - Other vector
     * @returns {number} Euclidean distance
     */
    distance(v) {
        return this.sub(v).magnitude();
    }

    /**
     * Rotate this vector by an angle
     * @param {number} angle - Angle in radians
     * @returns {Vector2} Rotated vector
     */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    /**
     * Create a copy of this vector
     * @returns {Vector2} Copy of this vector
     */
    copy() {
        return new Vector2(this.x, this.y);
    }

    /**
     * Linearly interpolate between this vector and another
     * @param {Vector2} v - Target vector
     * @param {number} t - Interpolation factor [0, 1]
     * @returns {Vector2} Interpolated vector
     */
    lerp(v, t) {
        return new Vector2(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t
        );
    }

    /**
     * Check equality with another vector
     * @param {Vector2} v - Other vector
     * @param {number} epsilon - Tolerance for comparison (default: 1e-10)
     * @returns {boolean} True if vectors are equal within epsilon
     */
    equals(v, epsilon = 1e-10) {
        return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }

    /**
     * Get perpendicular vector (rotated 90 degrees counter-clockwise)
     * @returns {Vector2} Perpendicular vector
     */
    perp() {
        return new Vector2(-this.y, this.x);
    }

    /**
     * String representation
     * @returns {string} String representation
     */
    toString() {
        return `Vector2(${this.x.toFixed(4)}, ${this.y.toFixed(4)})`;
    }

    // ==================== Static Methods ====================

    /**
     * Create a vector from an object with x, y properties
     * @param {Object} obj - Object with x, y properties
     * @returns {Vector2} New vector
     */
    static fromObject(obj) {
        return new Vector2(obj.x, obj.y);
    }

    /**
     * Create a zero vector
     * @returns {Vector2} Zero vector
     */
    static zero() {
        return new Vector2(0, 0);
    }

    /**
     * Create a unit vector pointing right (1, 0)
     * @returns {Vector2} Right vector
     */
    static right() {
        return new Vector2(1, 0);
    }

    /**
     * Create a unit vector pointing up (0, -1)
     * Note: In screen coordinates, Y increases downward
     * @returns {Vector2} Up vector
     */
    static up() {
        return new Vector2(0, -1);
    }

    /**
     * Linearly interpolate between two vectors
     * @param {Vector2} a - Start vector
     * @param {Vector2} b - End vector
     * @param {number} t - Interpolation factor [0, 1]
     * @returns {Vector2} Interpolated vector
     */
    static lerp(a, b, t) {
        return a.lerp(b, t);
    }

    /**
     * Calculate distance between two vectors
     * @param {Vector2} a - First vector
     * @param {Vector2} b - Second vector
     * @returns {number} Distance
     */
    static distance(a, b) {
        return a.distance(b);
    }

    /**
     * Calculate dot product of two vectors
     * @param {Vector2} a - First vector
     * @param {Vector2} b - Second vector
     * @returns {number} Dot product
     */
    static dot(a, b) {
        return a.dot(b);
    }
}
