/**
 * Waypoint path system for AI navigation
 * 
 * This module provides the waypoint graph structure
 * for AI opponents to navigate the track.
 */

class Waypoint {
  /**
   * Create a new Waypoint instance
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  constructor(x, y) {
    this.x = x
    this.y = y
    this.connections = []  // Indices of connected waypoints
  }
}

class WaypointGraph {
  /**
   * Create a new WaypointGraph instance
   */
  constructor() {
    this.waypoints = []
  }

  /**
   * Add a new waypoint to the graph
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Index of the newly added waypoint
   */
  addWaypoint(x, y) {
    const waypoint = new Waypoint(x, y)
    this.waypoints.push(waypoint)
    return this.waypoints.length - 1
  }

  /**
   * Connect two waypoints
   * @param {number} a - Index of first waypoint
   * @param {number} b - Index of second waypoint
   */
  connect(a, b) {
    this.waypoints[a].connections.push(b)
    this.waypoints[b].connections.push(a)
  }

  /**
   * Find the nearest waypoint to a given position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Index of nearest waypoint
   */
  findNearestWaypoint(x, y) {
    let nearestIndex = 0
    let minDistance = Infinity

    for (let i = 0; i < this.waypoints.length; i++) {
      const waypoint = this.waypoints[i]
      const dx = waypoint.x - x
      const dy = waypoint.y - y
      const distance = dx * dx + dy * dy

      if (distance < minDistance) {
        minDistance = distance
        nearestIndex = i
      }
    }

    return nearestIndex
  }

  /**
   * Create a waypoint graph from track points
   * @param {Array} trackPoints - Array of track points
   * @returns {WaypointGraph} New waypoint graph
   */
  static createFromTrackPoints(trackPoints) {
    const graph = new WaypointGraph()

    // Create waypoints along track
    const waypointIndices = []
    for (let i = 0; i < trackPoints.length; i += 5) {
      waypointIndices.push(graph.addWaypoint(trackPoints[i].x, trackPoints[i].y))
    }

    // Connect waypoints in order
    for (let i = 0; i < waypointIndices.length - 1; i++) {
      graph.connect(waypointIndices[i], waypointIndices[i + 1])
    }

    // Connect last to first to complete loop
    if (waypointIndices.length > 0) {
      graph.connect(waypointIndices[waypointIndices.length - 1], waypointIndices[0])
    }

    return graph
  }
}

module.exports = {
  Waypoint,
  WaypointGraph
}
