/**
 * 2D Vector class with basic mathematical operations
 * 
 * Provides vector arithmetic, normalization, and distance calculations
 * for 2D spatial operations in the racing game.
 */
export class Vector2 {
    /**
     * Creates a new 2D vector
     * @param {number} x - X component
     * @param {number} y - Y component
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Creates a copy of this vector
     * @returns {Vector2} New vector with same values
     */
    clone() {
        return new Vector2(this.x, this.y);
    }

    /**
     * Sets this vector's components
     * @param {number} x - New X component
     * @param {number} y - New Y component
     * @returns {Vector2} This vector for chaining
     */
    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    /**
     * Adds another vector to this vector
     * @param {Vector2} v - Vector to add
     * @returns {Vector2} This vector for chaining
     */
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    /**
     * Subtracts another vector from this vector
     * @param {Vector2} v - Vector to subtract
     * @returns {Vector2} This vector for chaining
     */
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    /**
     * Multiplies this vector by a scalar
     * @param {number} s - Scalar multiplier
     * @returns {Vector2} This vector for chaining
     */
    mul(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    /**
     * Divides this vector by a scalar
     * @param {number} s - Scalar divisor
     * @returns {Vector2} This vector for chaining
     */
    div(s) {
        this.x /= s;
        this.y /= s;
        return this;
    }

    /**
     * Adds two vectors and returns the result
     * @param {Vector2} v - Vector to add
     * @returns {Vector2} New vector representing the sum
     */
    added(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    /**
     * Subtracts two vectors and returns the result
     * @param {Vector2} v - Vector to subtract
     * @returns {Vector2} New vector representing the difference
     */
    subtracted(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    /**
     * Multiplies this vector by a scalar and returns the result
     * @param {number} s - Scalar multiplier
     * @returns {Vector2} New vector representing the product
     */
    multiplied(s) {
        return new Vector2(this.x * s, this.y * s);
    }

    /**
     * Divides this vector by a scalar and returns the result
     * @param {number} s - Scalar divisor
     * @returns {Vector2} New vector representing the quotient
     */
    divided(s) {
        return new Vector2(this.x / s, this.y / s);
    }

    /**
     * Calculates the dot product with another vector
     * @param {Vector2} v - Vector to dot with
     * @returns {number} Dot product
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    /**
     * Calculates the 2D cross product (returns a scalar)
     * @param {Vector2} v - Vector to cross with
     * @returns {number} Cross product (z-component)
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    /**
     * Calculates the squared length of this vector
     * @returns {number} Squared length
     */
    lengthSq() {
        return this.x * this.x + this.y * this.y;
    }

    /**
     * Calculates the length (magnitude) of this vector
     * @returns {number} Length
     */
    length() {
        return Math.sqrt(this.lengthSq());
    }

    /**
     * Calculates the squared distance to another vector
     * @param {Vector2} v - Vector to measure distance to
     * @returns {number} Squared distance
     */
    distanceSq(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    /**
     * Calculates the distance to another vector
     * @param {Vector2} v - Vector to measure distance to
     * @returns {number} Distance
     */
    distance(v) {
        return Math.sqrt(this.distanceSq(v));
    }

    /**
     * Normalizes this vector (makes it unit length)
     * @returns {Vector2} This vector for chaining
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
     * Returns a normalized copy of this vector
     * @returns {Vector2} New normalized vector
     */
    normalized() {
        const len = this.length();
        if (len > 0) {
            return new Vector2(this.x / len, this.y / len);
        }
        return new Vector2(0, 0);
    }

    /**
     * Rotates this vector by an angle (in radians)
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
     * Returns a rotated copy of this vector
     * @param {number} angle - Rotation angle in radians
     * @returns {Vector2} New rotated vector
     */
    rotated(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    /**
     * Linearly interpolates between this vector and another
     * @param {Vector2} v - Target vector
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Vector2} Interpolated vector
     */
    lerp(v, t) {
        return new Vector2(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t
        );
    }

    /**
     * Checks if this vector is approximately equal to another
     * @param {Vector2} v - Vector to compare
     * @param {number} epsilon - Tolerance for comparison
     * @returns {boolean} True if vectors are approximately equal
     */
    equals(v, epsilon = 0.0001) {
        return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }

    /**
     * Returns a string representation of this vector
     * @returns {string} String representation
     */
    toString() {
        return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }

    /**
     * Creates a vector from polar coordinates
     * @param {number} length - Length of vector
     * @param {number} angle - Angle in radians
     * @returns {Vector2} New vector
     */
    static fromPolar(length, angle) {
        return new Vector2(length * Math.cos(angle), length * Math.sin(angle));
    }

    /**
     * Creates a zero vector
     * @returns {Vector2} Vector with x=0, y=0
     */
    static zero() {
        return new Vector2(0, 0);
    }

    /**
     * Creates a unit vector pointing right
     * @returns {Vector2} Vector with x=1, y=0
     */
    static right() {
        return new Vector2(1, 0);
    }

    /**
     * Creates a unit vector pointing up
     * @returns {Vector2} Vector with x=0, y=-1
     */
    static up() {
        return new Vector2(0, -1);
    }
}