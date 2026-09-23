/**
 * 2D Vector class for physics calculations
 */
export class Vector2D {
    /**
     * @param {number} x - X component
     * @param {number} y - Y component
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Add another vector to this one
     * @param {Vector2D} v - Vector to add
     * @returns {Vector2D} This vector for chaining
     */
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    /**
     * Subtract another vector from this one
     * @param {Vector2D} v - Vector to subtract
     * @returns {Vector2D} This vector for chaining
     */
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    /**
     * Multiply by scalar
     * @param {number} scalar - Scalar value
     * @returns {Vector2D} This vector for chaining
     */
    mul(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }

    /**
     * Divide by scalar
     * @param {number} scalar - Scalar value
     * @returns {Vector2D} This vector for chaining
     */
    div(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.y /= scalar;
        }
        return this;
    }

    /**
     * Dot product with another vector
     * @param {Vector2D} v - Other vector
     * @returns {number} Dot product
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    /**
     * Cross product (2D - returns scalar z-component)
     * @param {Vector2D} v - Other vector
     * @returns {number} Cross product (z-component)
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    /**
     * Get squared length (faster than length)
     * @returns {number} Squared length
     */
    lengthSq() {
        return this.x * this.x + this.y * this.y;
    }

    /**
     * Get vector length
     * @returns {number} Length
     */
    length() {
        return Math.sqrt(this.lengthSq());
    }

    /**
     * Normalize this vector in place
     * @returns {Vector2D} This vector for chaining
     */
    normalize() {
        const len = this.length();
        if (len > 0) {
            this.div(len);
        }
        return this;
    }

    /**
     * Get normalized copy of this vector
     * @returns {Vector2D} Normalized copy
     */
    normalized() {
        return this.clone().normalize();
    }

    /**
     * Rotate vector by angle (radians)
     * @param {number} angle - Rotation angle in radians
     * @returns {Vector2D} This vector for chaining
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
     * Get angle of vector (radians)
     * @returns {number} Angle in radians
     */
    angle() {
        return Math.atan2(this.y, this.x);
    }

    /**
     * Set vector components
     * @param {number} x - X component
     * @param {number} y - Y component
     * @returns {Vector2D} This vector for chaining
     */
    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    /**
     * Copy from another vector
     * @param {Vector2D} v - Vector to copy from
     * @returns {Vector2D} This vector for chaining
     */
    copy(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }

    /**
     * Create a clone of this vector
     * @returns {Vector2D} New vector with same values
     */
    clone() {
        return new Vector2D(this.x, this.y);
    }

    /**
     * Negate this vector
     * @returns {Vector2D} This vector for chaining
     */
    negate() {
        this.x = -this.x;
        this.y = -this.y;
        return this;
    }

    /**
     * Get perpendicular vector (rotated 90 degrees counter-clockwise)
     * @returns {Vector2D} New perpendicular vector
     */
    perpCCW() {
        return new Vector2D(-this.y, this.x);
    }

    /**
     * Get perpendicular vector (rotated 90 degrees clockwise)
     * @returns {Vector2D} New perpendicular vector
     */
    perpCW() {
        return new Vector2D(this.y, -this.x);
    }

    /**
     * Clamp vector length
     * @param {number} maxLength - Maximum length
     * @returns {Vector2D} This vector for chaining
     */
    clamp(maxLength) {
        const lenSq = this.lengthSq();
        if (lenSq > maxLength * maxLength) {
            const len = Math.sqrt(lenSq);
            this.mul(maxLength / len);
        }
        return this;
    }

    /**
     * Linear interpolation to another vector
     * @param {Vector2D} v - Target vector
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Vector2D} This vector for chaining
     */
    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }

    /**
     * Distance to another vector
     * @param {Vector2D} v - Other vector
     * @returns {number} Distance
     */
    distanceTo(v) {
        return this.clone().sub(v).length();
    }

    /**
     * Squared distance to another vector (faster than distanceTo)
     * @param {Vector2D} v - Other vector
     * @returns {number} Squared distance
     */
    distanceToSq(v) {
        return this.clone().sub(v).lengthSq();
    }

    /**
     * String representation
     * @returns {string} Vector as string
     */
    toString() {
        return `Vector2D(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }

    // Static factory methods

    /**
     * Create vector from angle
     * @param {number} angle - Angle in radians
     * @param {number} length - Vector length (default 1)
     * @returns {Vector2D} New vector
     */
    static fromAngle(angle, length = 1) {
        return new Vector2D(
            Math.cos(angle) * length,
            Math.sin(angle) * length
        );
    }

    /**
     * Create vector from object with x, y properties
     * @param {Object} obj - Object with x, y properties
     * @returns {Vector2D} New vector
     */
    static fromObject(obj) {
        return new Vector2D(obj.x, obj.y);
    }

    /**
     * Add two vectors (static)
     * @param {Vector2D} a - First vector
     * @param {Vector2D} b - Second vector
     * @returns {Vector2D} New vector (a + b)
     */
    static add(a, b) {
        return new Vector2D(a.x + b.x, a.y + b.y);
    }

    /**
     * Subtract two vectors (static)
     * @param {Vector2D} a - First vector
     * @param {Vector2D} b - Second vector
     * @returns {Vector2D} New vector (a - b)
     */
    static sub(a, b) {
        return new Vector2D(a.x - b.x, a.y - b.y);
    }

    /**
     * Multiply vector by scalar (static)
     * @param {Vector2D} v - Vector
     * @param {number} scalar - Scalar value
     * @returns {Vector2D} New scaled vector
     */
    static mul(v, scalar) {
        return new Vector2D(v.x * scalar, v.y * scalar);
    }

    /**
     * Zero vector
     * @returns {Vector2D} Zero vector
     */
    static zero() {
        return new Vector2D(0, 0);
    }
}