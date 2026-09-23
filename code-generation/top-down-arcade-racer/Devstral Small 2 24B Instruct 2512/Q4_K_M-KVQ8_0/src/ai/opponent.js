/**
 * AI opponent behavior system
 * 
 * This module provides AI opponent behavior including
 * pathfinding, obstacle avoidance, and racing strategy.
 */

const { AI } = require('../core/constants')

class AIOpponent {
  /**
   * Create a new AIOpponent instance
   * @param {object} vehicle - Vehicle controlled by AI
   * @param {WaypointGraph} waypointGraph - Waypoint navigation graph
   * @param {Array} checkpoints - Checkpoints for lap detection
   * @param {string} difficulty - Difficulty level: 'easy', 'medium', or 'hard'
   */
  constructor(vehicle, waypointGraph, checkpoints, difficulty = 'medium') {
    this.vehicle = vehicle
    this.waypointGraph = waypointGraph
    this.currentWaypoint = 0
    this.targetSpeed = AI.DEFAULT_TARGET_SPEED
    this.reactionTime = AI.DEFAULT_REACTION_TIME
    this.lastObstacleCheck = 0
    this.difficulty = difficulty
    this.pathfinder = null
    this.currentPath = []
    this.pathIndex = 0
    
    // Create lap detector for this opponent
    this.lapDetector = null
    if (checkpoints && checkpoints.length > 0) {
      const { LapDetector } = require('../physics/track')
      this.lapDetector = new LapDetector(checkpoints)
    }
    
    // Set difficulty-specific parameters
    this.setDifficultyParameters(difficulty)
  }

  /**
   * Set difficulty-specific parameters
   * @param {string} difficulty - Difficulty level
   */
  setDifficultyParameters(difficulty) {
    this.difficulty = difficulty
    
    switch (difficulty) {
      case 'easy':
        this.targetSpeed = 0.6  // 60% of max speed
        this.reactionTime = 1.0  // Slow reaction time
        this.aggression = 0.3    // Low aggression
        this.steeringSensitivity = 0.7  // Less sensitive steering
        break
      case 'medium':
        this.targetSpeed = 0.8  // 80% of max speed
        this.reactionTime = 0.5  // Medium reaction time
        this.aggression = 0.6    // Medium aggression
        this.steeringSensitivity = 1.0  // Normal steering
        break
      case 'hard':
        this.targetSpeed = 0.95  // 95% of max speed
        this.reactionTime = 0.2  // Fast reaction time
        this.aggression = 0.9    // High aggression
        this.steeringSensitivity = 1.3  // More sensitive steering
        break
      default:
        this.targetSpeed = 0.8
        this.reactionTime = 0.5
        this.aggression = 0.6
        this.steeringSensitivity = 1.0
    }
  }

  /**
   * Initialize pathfinder for A* pathfinding
   * @param {number} gridWidth - Grid width in cells
   * @param {number} gridHeight - Grid height in cells
   * @param {number} cellSize - Cell size in world units
   */
  initPathfinder(gridWidth, gridHeight, cellSize) {
    const { Pathfinder } = require('./pathfinding')
    this.pathfinder = new Pathfinder(gridWidth, gridHeight, cellSize)
  }

  /**
   * Update pathfinder obstacles
   * @param {Array} obstacles - Array of obstacle positions
   */
  updatePathfinderObstacles(obstacles) {
    if (this.pathfinder) {
      this.pathfinder.setObstacles(obstacles)
    }
  }

  /**
   * Update AI opponent behavior
   * @param {number} deltaTime - Time since last update
   * @param {Array} obstacles - Array of obstacles to avoid
   * @returns {object} Control inputs for the vehicle
   */
  update(deltaTime, obstacles = []) {
    const controls = {
      accelerate: false,
      brake: false,
      steerLeft: false,
      steerRight: false
    }

    // Find target position (use A* path if available, otherwise use waypoints)
    let targetX, targetY
    
    if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
      // Use A* path
      targetX = this.currentPath[this.pathIndex].x
      targetY = this.currentPath[this.pathIndex].y
      
      // Check if we've reached this path point
      const dx = targetX - this.vehicle.position.x
      const dy = targetY - this.vehicle.position.y
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy)
      
      if (distanceToTarget < 15) {
        this.pathIndex++
        if (this.pathIndex >= this.currentPath.length) {
          this.currentPath = []
          this.pathIndex = 0
        }
      }
    } else {
      // Use waypoint navigation
      const targetWaypoint = this.waypointGraph.waypoints[this.currentWaypoint]
      targetX = targetWaypoint.x
      targetY = targetWaypoint.y
    }

    // Calculate direction to target
    const dx = targetX - this.vehicle.position.x
    const dy = targetY - this.vehicle.position.y
    const targetAngle = Math.atan2(dy, dx)

    // Calculate steering direction with difficulty-based sensitivity
    const angleDiff = targetAngle - this.vehicle.angle
    const normalizedAngleDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI

    // Steer towards target with difficulty-based sensitivity
    const steerThreshold = 0.1 * (1 / this.steeringSensitivity)
    if (normalizedAngleDiff > steerThreshold) {
      controls.steerLeft = true
    } else if (normalizedAngleDiff < -steerThreshold) {
      controls.steerRight = true
    }

    // Accelerate towards target speed
    const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed
    if (speedRatio < this.targetSpeed) {
      controls.accelerate = true
    }

    // Check for obstacles with difficulty-based reaction
    this.lastObstacleCheck += deltaTime
    if (this.lastObstacleCheck >= this.reactionTime) {
      this.lastObstacleCheck = 0
      this.checkObstacles(obstacles, controls)
    }

    // Check for lap completion
    if (this.lapDetector) {
      this.lapDetector.checkLapProgress(this.vehicle)
    }

    // Check if we've reached the target waypoint (when not using A* path)
    if (this.currentPath.length === 0) {
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy)
      if (distanceToTarget < 20) {
        // Find next waypoint
        this.currentWaypoint = this.findNextWaypoint()
      }
    }

    return controls
  }

  /**
   * Calculate path using A* algorithm
   * @param {number} goalX - Goal X coordinate
   * @param {number} goalY - Goal Y coordinate
   * @returns {boolean} True if path was calculated successfully
   */
  calculatePath(goalX, goalY) {
    if (!this.pathfinder) {
      return false
    }

    const startX = this.vehicle.position.x
    const startY = this.vehicle.position.y

    const path = this.pathfinder.findPath(startX, startY, goalX, goalY)
    
    if (path.length > 0) {
      this.currentPath = path
      this.pathIndex = 0
      return true
    }

    return false
  }

  /**
   * Check for obstacles and adjust controls accordingly
   * @param {Array} obstacles - Array of obstacles
   * @param {object} controls - Control inputs to modify
   */
  checkObstacles(obstacles, controls) {
    for (const obstacle of obstacles) {
      const distance = Math.sqrt(
        Math.pow(this.vehicle.position.x - obstacle.x, 2) +
        Math.pow(this.vehicle.position.y - obstacle.y, 2)
      )

      // Difficulty-based detection range
      const detectionRange = 100 * (1 + this.aggression * 0.5)
      
      if (distance < detectionRange) {
        // Obstacle detected, brake with difficulty-based aggression
        controls.brake = true
        controls.accelerate = false

        // Steer away from obstacle with difficulty-based response
        const obstacleAngle = Math.atan2(
          obstacle.y - this.vehicle.position.y,
          obstacle.x - this.vehicle.position.x
        )
        const angleToObstacle = obstacleAngle - this.vehicle.angle

        if (Math.abs(angleToObstacle) < Math.PI / 2) {
          // Obstacle is roughly in front of us
          if (angleToObstacle > 0) {
            controls.steerLeft = true
          } else {
            controls.steerRight = true
          }
        }
      }
    }
  }

  /**
   * Find the next waypoint in the path
   * @returns {number} Index of next waypoint
   */
  findNextWaypoint() {
    const currentWaypoint = this.waypointGraph.waypoints[this.currentWaypoint]
    const connections = currentWaypoint.connections

    // Find the connection that's farthest from current position
    // (this helps the AI choose the correct direction)
    let nextWaypoint = connections[0]
    let maxDistance = -Infinity

    for (const connectionIndex of connections) {
      const waypoint = this.waypointGraph.waypoints[connectionIndex]
      const dx = waypoint.x - this.vehicle.position.x
      const dy = waypoint.y - this.vehicle.position.y
      const distance = dx * dx + dy * dy

      if (distance > maxDistance) {
        maxDistance = distance
        nextWaypoint = connectionIndex
      }
    }

    return nextWaypoint
  }
}

module.exports = AIOpponent
