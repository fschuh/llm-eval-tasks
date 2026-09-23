/**
 * Collision detection and resolution system
 * 
 * This module provides functions for detecting and resolving
 * collisions between game objects.
 */

const { COLLISION } = require('../core/constants')

/**
 * Check for circle-circle collision
 * @param {object} circle1 - First circle with x, y, radius
 * @param {object} circle2 - Second circle with x, y, radius
 * @returns {boolean} True if circles collide
 */
function circleCollision(circle1, circle2) {
  const dx = circle2.x - circle1.x
  const dy = circle2.y - circle1.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  return distance < (circle1.radius + circle2.radius)
}

/**
 * Check for bounding box-bounding box collision
 * @param {object} box1 - First box with x, y, width, height
 * @param {object} box2 - Second box with x, y, width, height
 * @returns {boolean} True if boxes collide
 */
function boundingBoxCollision(box1, box2) {
  return (
    box1.x < box2.x + box2.width &&
    box1.x + box1.width > box2.x &&
    box1.y < box2.y + box2.height &&
    box1.y + box1.height > box2.y
  )
}

/**
 * Resolve collision between two vehicles using impulse-based physics
 * @param {object} vehicle1 - First vehicle
 * @param {object} vehicle2 - Second vehicle
 */
function resolveCollision(vehicle1, vehicle2) {
  // Calculate normal vector
  const dx = vehicle2.position.x - vehicle1.position.x
  const dy = vehicle2.position.y - vehicle1.position.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Avoid division by zero
  if (distance === 0) return

  const nx = dx / distance
  const ny = dy / distance

  // Calculate relative velocity
  const rvx = vehicle2.velocity.x - vehicle1.velocity.x
  const rvy = vehicle2.velocity.y - vehicle1.velocity.y

  // Calculate relative velocity in terms of the normal direction
  const velocityAlongNormal = rvx * nx + rvy * ny

  // Do not resolve if objects are moving apart
  if (velocityAlongNormal > 0) return

  // Calculate impulse scalar
  const e = 0.8  // Restitution coefficient (0 = perfectly inelastic, 1 = perfectly elastic)
  const j = -(1 + e) * velocityAlongNormal

  // Apply impulse
  const impulseX = j * nx
  const impulseY = j * ny

  vehicle1.velocity.x -= impulseX / vehicle1.mass
  vehicle1.velocity.y -= impulseY / vehicle1.mass
  vehicle2.velocity.x += impulseX / vehicle2.mass
  vehicle2.velocity.y += impulseY / vehicle2.mass

  // Position correction to prevent sticking
  const percent = COLLISION.BOUNDARY_CORRECTION
  const correction = (distance - vehicle1.radius - vehicle2.radius) * percent
  vehicle1.position.x -= correction * nx
  vehicle1.position.y -= correction * ny
  vehicle2.position.x += correction * nx
  vehicle2.position.y += correction * ny
}

/**
 * Check if a point is inside a polygon
 * @param {object} point - Point with x, y coordinates
 * @param {Array} polygon - Array of polygon vertices
 * @returns {boolean} True if point is inside polygon
 */
function pointInPolygon(point, polygon) {
  let inside = false
  const x = point.x
  const y = point.y
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    const intersect = ((yi > y) !== (yj > y)) &&
                      (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }

  return inside
}

module.exports = {
  circleCollision,
  boundingBoxCollision,
  resolveCollision,
  pointInPolygon
}
