/**
 * Vector2D - Basic 2D vector for positions, velocities, and forces
 */
export class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Add another vector to this vector
     * @param {Vector2D} v - Vector to add
     * @returns {Vector2D} New vector result
     */
    add(v) {
        return new Vector2D(this.x + v.x, this.y + v.y);
    }

    /**
     * Subtract another vector from this vector
     * @param {Vector2D} v - Vector to subtract
     * @returns {Vector2D} New vector result
     */
    sub(v) {
        return new Vector2D(this.x - v.x, this.y - v.y);
    }

    /**
     * Multiply by scalar
     * @param {number} s - Scalar value
     * @returns {Vector2D} New vector result
     */
    mul(s) {
        return new Vector2D(this.x * s, this.y * s);
    }

    /**
     * Divide by scalar
     * @param {number} s - Scalar value
     * @returns {Vector2D} New vector result
     */
    div(s) {
        if (s === 0) return new Vector2D(0, 0);
        return new Vector2D(this.x / s, this.y / s);
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
     * Cross product (2D scalar result)
     * @param {Vector2D} v - Other vector
     * @returns {number} Cross product
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    /**
     * Magnitude (length) of the vector
     * @returns {number} Magnitude
     */
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Squared magnitude (faster, no sqrt)
     * @returns {number} Squared magnitude
     */
    magnitudeSquared() {
        return this.x * this.x + this.y * this.y;
    }

    /**
     * Normalize the vector (unit length)
     * @returns {Vector2D} Normalized vector
     */
    normalize() {
        const mag = this.magnitude();
        if (mag === 0) return new Vector2D(0, 0);
        return this.div(mag);
    }

    /**
     * Distance to another vector
     * @param {Vector2D} v - Other vector
     * @returns {number} Distance
     */
    distance(v) {
        return this.sub(v).magnitude();
    }

    /**
     * Squared distance to another vector (faster)
     * @param {Vector2D} v - Other vector
     * @returns {number} Squared distance
     */
    distanceSquared(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    /**
     * Rotate by angle in radians
     * @param {number} angle - Angle in radians
     * @returns {Vector2D} Rotated vector
     */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2D(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    /**
     * Create a copy of this vector
     * @returns {Vector2D} Cloned vector
     */
    clone() {
        return new Vector2D(this.x, this.y);
    }

    /**
     * Linear interpolation between two vectors
     * @param {Vector2D} a - Start vector
     * @param {Vector2D} b - End vector
     * @param {number} t - Interpolation factor [0, 1]
     * @returns {Vector2D} Interpolated vector
     */
    static lerp(a, b, t) {
        return a.add(b.sub(a).mul(t));
    }

    /**
     * Create vector from angle (0 = right, PI/2 = down)
     * @param {number} angle - Angle in radians
     * @returns {Vector2D} Vector pointing in angle direction
     */
    static fromAngle(angle) {
        return new Vector2D(Math.cos(angle), Math.sin(angle));
    }

    /**
     * Create a zero vector
     * @returns {Vector2D} Zero vector
     */
    static zero() {
        return new Vector2D(0, 0);
    }

    /**
     * String representation
     * @returns {string} String representation
     */
    toString() {
        return `Vector2D(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }
}
