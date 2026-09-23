/**
 * A* pathfinding algorithm for AI navigation
 * 
 * This module provides A* pathfinding for dynamic obstacle avoidance
 * and fallback pathfinding when waypoints are not sufficient.
 */

const { distance } = require('../utils/helpers')

class PathNode {
  /**
   * Create a new PathNode instance
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} cost - Movement cost to reach this node
   * @param {number} heuristic - Estimated cost to goal
   */
  constructor(x, y, cost = 0, heuristic = 0) {
    this.x = x
    this.y = y
    this.cost = cost  // Cost from start to this node
    this.heuristic = heuristic  // Estimated cost from this node to goal
    this.totalCost = cost + heuristic  // F = G + H
    this.parent = null  // Parent node in the path
  }
}

class Pathfinder {
  /**
   * Create a new Pathfinder instance
   * @param {number} gridWidth - Width of the grid in cells
   * @param {number} gridHeight - Height of the grid in cells
   * @param {number} cellSize - Size of each cell in world units
   */
  constructor(gridWidth, gridHeight, cellSize) {
    this.gridWidth = gridWidth
    this.gridHeight = gridHeight
    this.cellSize = cellSize
    this.obstacles = []
  }

  /**
   * Set obstacles on the grid
   * @param {Array} obstacles - Array of obstacle positions
   */
  setObstacles(obstacles) {
    this.obstacles = obstacles
  }

  /**
   * Check if a cell contains an obstacle
   * @param {number} x - Grid X coordinate
   * @param {number} y - Grid Y coordinate
   * @returns {boolean} True if cell is blocked
   */
  isCellBlocked(x, y) {
    // Check if outside grid bounds
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
      return true
    }

    // Check if cell contains an obstacle
    for (const obstacle of this.obstacles) {
      const obstacleX = Math.floor(obstacle.x / this.cellSize)
      const obstacleY = Math.floor(obstacle.y / this.cellSize)
      if (obstacleX === x && obstacleY === y) {
        return true
      }
    }

    return false
  }

  /**
   * Calculate heuristic cost (Manhattan distance)
   * @param {number} x1 - Start X coordinate
   * @param {number} y1 - Start Y coordinate
   * @param {number} x2 - End X coordinate
   * @param {number} y2 - End Y coordinate
   * @returns {number} Heuristic cost
   */
  calculateHeuristic(x1, y1, x2, y2) {
    // Use Manhattan distance for grid-based pathfinding
    return Math.abs(x2 - x1) + Math.abs(y2 - y1)
  }

  /**
   * Find path from start to goal using A* algorithm
   * @param {number} startX - Start X coordinate (world units)
   * @param {number} startY - Start Y coordinate (world units)
   * @param {number} goalX - Goal X coordinate (world units)
   * @param {number} goalY - Goal Y coordinate (world units)
   * @returns {Array} Array of points representing the path, or empty array if no path found
   */
  findPath(startX, startY, goalX, goalY) {
    const startNode = new PathNode(
      Math.floor(startX / this.cellSize),
      Math.floor(startY / this.cellSize),
      0,
      this.calculateHeuristic(
        Math.floor(startX / this.cellSize),
        Math.floor(startY / this.cellSize),
        Math.floor(goalX / this.cellSize),
        Math.floor(goalY / this.cellSize)
      )
    )

    const goalNode = new PathNode(
      Math.floor(goalX / this.cellSize),
      Math.floor(goalY / this.cellSize)
    )

    const openSet = [startNode]
    const closedSet = []

    while (openSet.length > 0) {
      // Find node with lowest total cost
      openSet.sort((a, b) => a.totalCost - b.totalCost)
      const currentNode = openSet.shift()

      // Check if we've reached the goal
      if (currentNode.x === goalNode.x && currentNode.y === goalNode.y) {
        return this.reconstructPath(currentNode)
      }

      // Add current node to closed set
      closedSet.push(currentNode)

      // Explore neighbors
      const neighbors = this.getNeighbors(currentNode)
      for (const neighbor of neighbors) {
        // Skip if neighbor is in closed set
        if (this.isInClosedSet(neighbor, closedSet)) {
          continue
        }

        // Calculate cost to reach neighbor
        const tentativeCost = currentNode.cost + this.getMovementCost(currentNode, neighbor)

        // Check if neighbor is in open set
        const openNode = this.findInOpenSet(neighbor, openSet)
        if (openNode && tentativeCost >= openNode.cost) {
          continue  // Not a better path
        }

        // This path is better, update neighbor
        neighbor.cost = tentativeCost
        neighbor.heuristic = this.calculateHeuristic(
          neighbor.x,
          neighbor.y,
          goalNode.x,
          goalNode.y
        )
        neighbor.totalCost = neighbor.cost + neighbor.heuristic
        neighbor.parent = currentNode

        // Add to open set if not already there
        if (!openNode) {
          openSet.push(neighbor)
        }
      }
    }

    // No path found
    return []
  }

  /**
   * Get all valid neighbors for a node
   * @param {PathNode} node - Current node
   * @returns {Array} Array of neighbor nodes
   */
  getNeighbors(node) {
    const neighbors = []
    const directions = [
      { dx: 0, dy: -1 },  // Up
      { dx: 1, dy: 0 },   // Right
      { dx: 0, dy: 1 },   // Down
      { dx: -1, dy: 0 }   // Left
    ]

    for (const dir of directions) {
      const x = node.x + dir.dx
      const y = node.y + dir.dy

      if (!this.isCellBlocked(x, y)) {
        neighbors.push(new PathNode(x, y))
      }
    }

    return neighbors
  }

  /**
   * Get movement cost between two nodes
   * @param {PathNode} from - Source node
   * @param {PathNode} to - Destination node
   * @returns {number} Movement cost
   */
  getMovementCost(from, to) {
    // Diagonal movement would have higher cost
    // For now, use Manhattan distance
    return Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
  }

  /**
   * Check if a node is in the closed set
   * @param {PathNode} node - Node to check
   * @param {Array} closedSet - Closed set of nodes
   * @returns {boolean} True if node is in closed set
   */
  isInClosedSet(node, closedSet) {
    return closedSet.some(n => n.x === node.x && n.y === node.y)
  }

  /**
   * Find a node in the open set
   * @param {PathNode} node - Node to find
   * @param {Array} openSet - Open set of nodes
   * @returns {PathNode|null} Node if found, null otherwise
   */
  findInOpenSet(node, openSet) {
    return openSet.find(n => n.x === node.x && n.y === node.y)
  }

  /**
   * Reconstruct path from goal node back to start
   * @param {PathNode} node - Goal node
   * @returns {Array} Array of points in world coordinates
   */
  reconstructPath(node) {
    const path = []
    let current = node

    // Backtrack from goal to start
    while (current) {
      path.push({
        x: current.x * this.cellSize + this.cellSize / 2,
        y: current.y * this.cellSize + this.cellSize / 2
      })
      current = current.parent
    }

    // Reverse to get path from start to goal
    return path.reverse()
  }

  /**
   * Convert waypoint path to grid-based path for A* fallback
   * @param {WaypointGraph} waypointGraph - Waypoint graph
   * @param {number} startIndex - Starting waypoint index
   * @param {number} endIndex - Ending waypoint index
   * @returns {Array} Array of points representing the path
   */
  static waypointsToGridPath(waypointGraph, startIndex, endIndex, cellSize) {
    const path = []
    let currentIndex = startIndex

    // Follow waypoints until reaching end
    while (currentIndex !== endIndex) {
      const waypoint = waypointGraph.waypoints[currentIndex]
      path.push({ x: waypoint.x, y: waypoint.y })

      // Find next waypoint (simplified - just take first connection)
      if (waypoint.connections.length > 0) {
        currentIndex = waypoint.connections[0]
      } else {
        break
      }
    }

    // Add final waypoint
    const endWaypoint = waypointGraph.waypoints[endIndex]
    path.push({ x: endWaypoint.x, y: endWaypoint.y })

    return path
  }
}

module.exports = {
  PathNode,
  Pathfinder
}