/**
 * Track boundary and lap detection system
 * 
 * This module provides functionality for track boundaries
 * and lap detection using checkpoints.
 */

const { COLLISION } = require('../core/constants')

class LapDetector {
  /**
   * Create a new LapDetector instance
   * @param {Array} checkpoints - Array of checkpoint positions
   */
  constructor(checkpoints) {
    this.checkpoints = checkpoints  // Array of checkpoint positions
    this.nextCheckpointIndex = 0
    this.lapCount = 0
    this.lastCheckpoint = null
  }

  /**
   * Check if vehicle has passed any checkpoints
   * @param {object} vehicle - Vehicle with position
   * @returns {boolean} True if lap was completed
   */
  checkLapProgress(vehicle) {
    const vehiclePos = vehicle.position

    // Check if vehicle passed next checkpoint
    for (let i = 0; i < this.checkpoints.length; i++) {
      const checkpoint = this.checkpoints[i]
      const distance = Math.sqrt(
        Math.pow(vehiclePos.x - checkpoint.x, 2) +
        Math.pow(vehiclePos.y - checkpoint.y, 2)
      )

      if (distance < COLLISION.CHECKPOINT_RADIUS) {
        if (i === this.nextCheckpointIndex) {
          this.nextCheckpointIndex = (i + 1) % this.checkpoints.length
          this.lastCheckpoint = checkpoint

          // Check if completed lap
          if (i === this.checkpoints.length - 1) {
            this.lapCount++
            return true  // Lap completed
          }
          return false
        }
      }
    }

    return false
  }
}

class TrackBoundary {
  /**
   * Create a new TrackBoundary instance
   * @param {Array} boundaries - Array of polygon boundaries
   */
  constructor(boundaries) {
    this.boundaries = boundaries  // Array of polygon boundaries
  }

  /**
   * Check if vehicle is outside track boundaries
   * @param {object} vehicle - Vehicle with position
   * @returns {boolean} True if outside track
   */
  checkCollision(vehicle) {
    // Check if vehicle is outside track boundaries
    for (const boundary of this.boundaries) {
      if (pointInPolygon(vehicle.position, boundary)) {
        return false  // Inside track
      }
    }
    return true  // Outside track
  }
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

// Export pointInPolygon so it can be used by other modules

module.exports = {
  LapDetector,
  TrackBoundary,
  pointInPolygon
}
