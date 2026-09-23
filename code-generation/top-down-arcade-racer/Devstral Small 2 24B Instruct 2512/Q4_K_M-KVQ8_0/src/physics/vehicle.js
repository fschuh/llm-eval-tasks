/**
 * Vehicle physics implementation
 * 
 * This module provides the core vehicle physics model including
 * movement, steering, and collision handling.
 */

const { VEHICLE } = require('../core/constants')

class Vehicle {
  /**
   * Create a new Vehicle instance
   * @param {number} x - Initial x position
   * @param {number} y - Initial y position
   * @param {number} angle - Initial facing angle in radians
   */
  constructor(x, y, angle) {
    this.position = { x, y }
    this.velocity = { x: 0, y: 0 }
    this.angle = angle          // Current facing angle (radians)
    this.angularVelocity = 0   // Rate of rotation
    this.speed = 0              // Current speed
    this.maxSpeed = VEHICLE.MAX_SPEED
    this.acceleration = VEHICLE.ACCELERATION
    this.deceleration = VEHICLE.DECELERATION
    this.steeringSpeed = VEHICLE.STEERING_SPEED
    this.steeringAngle = 0      // Current steering angle
    this.mass = VEHICLE.DEFAULT_MASS
    this.width = VEHICLE.DEFAULT_WIDTH
    this.height = VEHICLE.DEFAULT_HEIGHT
    this.radius = VEHICLE.DEFAULT_RADIUS
  }

  /**
   * Update vehicle physics based on controls
   * @param {number} deltaTime - Time since last update
   * @param {object} controls - Control inputs
   * @param {boolean} controls.accelerate - Whether accelerating
   * @param {boolean} controls.brake - Whether braking
   * @param {boolean} controls.steerLeft - Whether steering left
   * @param {boolean} controls.steerRight - Whether steering right
   */
  update(deltaTime, controls) {
    // Apply acceleration/braking
    if (controls.accelerate) {
      this.speed += this.acceleration * deltaTime
    } else if (controls.brake) {
      this.speed -= this.deceleration * deltaTime
    }
    
    // Apply friction/deceleration
    if (!controls.accelerate && !controls.brake) {
      this.speed = Math.max(0, this.speed - this.deceleration * deltaTime)
    }
    
    // Clamp speed
    this.speed = Math.min(this.speed, this.maxSpeed)
    
    // Apply friction and drag forces
    this.applyFriction(deltaTime)
    this.applyDrag(deltaTime)

    // Apply steering
    if (controls.steerLeft) {
      this.steeringAngle = Math.min(
        this.steeringAngle + this.steeringSpeed * deltaTime,
        VEHICLE.MAX_STEERING_ANGLE
      )
    } else if (controls.steerRight) {
      this.steeringAngle = Math.max(
        this.steeringAngle - this.steeringSpeed * deltaTime,
        -VEHICLE.MAX_STEERING_ANGLE
      )
    } else {
      // Return to center if no steering input
      if (this.steeringAngle > 0) {
        this.steeringAngle = Math.max(0, this.steeringAngle - this.steeringSpeed * 0.5 * deltaTime)
      } else if (this.steeringAngle < 0) {
        this.steeringAngle = Math.min(0, this.steeringAngle + this.steeringSpeed * 0.5 * deltaTime)
      }
    }

    // Update angle based on steering
    const turnAngle = this.steeringAngle * (this.speed / this.maxSpeed)
    this.angle += turnAngle * deltaTime

    // Update velocity based on angle and speed
    this.velocity.x = Math.cos(this.angle) * this.speed
    this.velocity.y = Math.sin(this.angle) * this.speed

    // Update position
    this.position.x += this.velocity.x * deltaTime
    this.position.y += this.velocity.y * deltaTime
  }

  /**
   * Apply friction to reduce speed
   * @param {number} deltaTime - Time since last update
   */
  applyFriction(deltaTime) {
    // Friction reduces speed based on current speed
    const frictionForce = this.speed * this.speed * 0.1 * deltaTime
    this.speed = Math.max(0, this.speed - frictionForce)
  }

  /**
   * Apply drag to reduce speed at high velocities
   * @param {number} deltaTime - Time since last update
   */
  applyDrag(deltaTime) {
    // Drag increases with speed squared
    const dragForce = this.speed * this.speed * 0.02 * deltaTime
    this.speed = Math.max(0, this.speed - dragForce)
  }

  /**
   * Get vehicle's bounding box for collision detection
   * @returns {object} Bounding box with x, y, width, height
   */
  getBoundingBox() {
    return {
      x: this.position.x - this.width / 2,
      y: this.position.y - this.height / 2,
      width: this.width,
      height: this.height
    }
  }

  /**
   * Get vehicle's circle representation for collision detection
   * @returns {object} Circle with x, y, radius
   */
  getCircle() {
    return {
      x: this.position.x,
      y: this.position.y,
      radius: this.radius
    }
  }
}

module.exports = Vehicle
