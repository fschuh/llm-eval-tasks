/**
 * Vector2 math class for 2D vector operations.
 * Provides common vector mathematics including addition, subtraction,
 * multiplication, division, magnitude, normalization, dot product,
 * cross product, rotation, and comparison operations.
 * 
 * @module Vector2
 */
class Vector2 {
    /**
     * Creates a new Vector2 instance.
     * @param {number} x - The x component (default: 0)
     * @param {number} y - The y component (default: 0)
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Returns a zero vector (0, 0).
     * @returns {Vector2} A new Vector2 with both components set to 0.
     */
    static zero() {
        return new Vector2(0, 0);
    }

    /**
     * Returns the unit vector in the positive x direction (1, 0).
     * @returns {Vector2} A new Vector2 representing the x-axis direction.
     */
    static unitX() {
        return new Vector2(1, 0);
    }

    /**
     * Returns the unit vector in the positive y direction (0, 1).
     * @returns {Vector2} A new Vector2 representing the y-axis direction.
     */
    static unitY() {
        return new Vector2(0, 1);
    }

    /**
     * Adds another vector to this vector.
     * Returns a new Vector2 without modifying this one.
     * @param {Vector2} v - The vector to add.
     * @returns {Vector2} A new Vector2 representing the sum.
     */
    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    /**
     * Subtracts another vector from this vector.
     * Returns a new Vector2 without modifying this one.
     * @param {Vector2} v - The vector to subtract.
     * @returns {Vector2} A new Vector2 representing the difference.
     */
    subtract(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    /**
     * Multiplies this vector by a scalar value.
     * Returns a new Vector2 without modifying this one.
     * @param {number} scalar - The scalar multiplier.
     * @returns {Vector2} A new Vector2 with components scaled by the scalar.
     */
    multiply(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    /**
     * Divides this vector by a scalar value.
     * Returns a new Vector2 without modifying this one.
     * @param {number} scalar - The scalar divisor (must be non-zero).
     * @returns {Vector2} A new Vector2 with components divided by the scalar.
     */
    divide(scalar) {
        return new Vector2(this.x / scalar, this.y / scalar);
    }

    /**
     * Calculates the magnitude (length) of this vector.
     * Formula: sqrt(x² + y²)
     * @returns {number} The magnitude of the vector.
     */
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Returns a normalized (unit length) version of this vector.
     * If the vector has zero magnitude, returns a zero vector.
     * @returns {Vector2} A new Vector2 with magnitude 1, or zero vector if input is zero.
     */
    normalize() {
        const mag = this.magnitude();
        return mag > 0 ? this.divide(mag) : new Vector2(0, 0);
    }

    /**
     * Calculates the dot product of this vector with another.
     * Formula: a.x * b.x + a.y * b.y
     * @param {Vector2} v - The other vector.
     * @returns {number} The dot product scalar value.
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    /**
     * Calculates the 2D cross product (perpendicular dot product).
     * For 2D vectors, returns a scalar: a.x * b.y - a.y * b.x
     * This represents the signed area of the parallelogram formed by the two vectors.
     * @param {Vector2} v - The other vector.
     * @returns {number} The cross product scalar value.
     */
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    /**
     * Rotates this vector by a given angle in radians (counter-clockwise).
     * Uses rotation matrix: x' = x*cos(θ) - y*sin(θ), y' = x*sin(θ) + y*cos(θ)
     * Returns a new Vector2 without modifying this one.
     * @param {number} angle - The rotation angle in radians.
     * @returns {Vector2} A new Vector2 rotated by the specified angle.
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
     * Creates a deep copy of this vector.
     * @returns {Vector2} A new Vector2 with the same components.
     */
    clone() {
        return new Vector2(this.x, this.y);
    }

    /**
     * Checks if this vector is equal to another vector.
     * Two vectors are equal if their x and y components are identical.
     * @param {Vector2} v - The other vector to compare against.
     * @returns {boolean} True if both components match exactly.
     */
    equals(v) {
        return this.x === v.x && this.y === v.y;
    }

    /**
     * Returns a perpendicular vector (rotated 90 degrees counter-clockwise).
     * This is equivalent to rotating by π/2 radians.
     * @returns {Vector2} A new Vector2 perpendicular to this one.
     */
    perpendicular() {
        return new Vector2(-this.y, this.x);
    }

    /**
     * Returns a string representation of the vector for debugging.
     * Format: "Vector2(x, y)"
     * @returns {string} String representation of the vector.
     */
    toString() {
        return `Vector2(${this.x}, ${this.y})`;
    }
}

export default Vector2;
