/**
 * Game state management system
 * 
 * This module provides the core game state management including
 * player state, race timing, and game progress.
 */

const { GAME_STATE } = require('../core/constants')

class GameState {
  /**
   * Create a new GameState instance
   */
  constructor() {
    this.player = null
    this.opponents = []
    this.track = null
    this.lapDetector = null
    this.raceStarted = false
    this.raceFinished = false
    this.countdown = GAME_STATE.COUNTDOWN_TIME
    this.elapsedTime = 0
    this.lapTimes = []
    this.bestLapTime = Infinity
    this.currentLap = 0
    this.playerPosition = 1
    this.opponentLapCounts = []
    this.opponentLapTimes = []
  }

  /**
   * Set the player vehicle
   * @param {Vehicle} player - Player vehicle
   */
  setPlayer(player) {
    this.player = player
  }

  /**
   * Add an AI opponent
   * @param {object} opponent - AI opponent
   */
  addOpponent(opponent) {
    this.opponents.push(opponent)
  }

  /**
   * Set the track
   * @param {TrackBoundary} track - Track boundary
   */
  setTrack(track) {
    this.track = track
  }

  /**
   * Set the lap detector
   * @param {LapDetector} lapDetector - Lap detector
   */
  setLapDetector(lapDetector) {
    this.lapDetector = lapDetector
  }

  /**
   * Update game state
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    if (!this.raceStarted) {
      // Countdown before race starts
      this.countdown -= deltaTime
      if (this.countdown <= 0) {
        this.raceStarted = true
        this.countdown = 0
      }
      return
    }

    if (this.raceFinished) {
      return
    }

    // Update elapsed time
    this.elapsedTime += deltaTime

    // Update player
    if (this.player) {
      // Player update would happen here
      // This is where player input would be processed
      const controls = {
        accelerate: false,
        brake: false,
        steerLeft: false,
        steerRight: false
      }
      this.player.update(deltaTime, controls)
    }
    
    // Update opponents
    const obstacles = []
    for (const opponent of this.opponents) {
      const controls = opponent.update(deltaTime, obstacles)
      opponent.vehicle.update(deltaTime, controls)
    }
    
    // Check for vehicle-vehicle collisions
    this.checkVehicleCollisions(deltaTime)
    
    // Check for track boundary collisions
    this.checkTrackBoundaryCollisions(deltaTime)
    
    // Check for lap completion
    if (this.lapDetector && this.player) {
      const lapCompleted = this.lapDetector.checkLapProgress(this.player)
      if (lapCompleted) {
        const lapTime = this.elapsedTime
        this.lapTimes.push(lapTime)
        if (lapTime < this.bestLapTime) {
          this.bestLapTime = lapTime
        }
        
        this.currentLap = this.lapDetector.lapCount
        
        // Check if race is finished
        if (this.lapDetector.lapCount >= GAME_STATE.DEFAULT_LAP_COUNT) {
          this.raceFinished = true
        }
      }
    }
    
    // Update opponent lap counts and positions
    this.updateOpponentPositions()
  }

  /**
   * Update opponent lap counts and calculate positions
   */
  updateOpponentPositions() {
    // Reset opponent lap counts if needed
    if (this.opponentLapCounts.length !== this.opponents.length) {
      this.opponentLapCounts = new Array(this.opponents.length).fill(0)
      this.opponentLapTimes = new Array(this.opponents.length).fill(0)
    }
    
    // Check each opponent's lap progress
    for (let i = 0; i < this.opponents.length; i++) {
      const opponent = this.opponents[i]
      if (opponent.lapDetector) {
        this.opponentLapCounts[i] = opponent.lapDetector.lapCount
        this.opponentLapTimes[i] = opponent.lapDetector.elapsedTime || 0
      }
    }
    
    // Calculate positions based on lap count and distance
    const positions = []
    
    // Player entry
    positions.push({
      id: 'player',
      lap: this.currentLap,
      distance: this.elapsedTime
    })
    
    // Opponent entries
    for (let i = 0; i < this.opponents.length; i++) {
      positions.push({
        id: `opponent-${i}`,
        lap: this.opponentLapCounts[i],
        distance: this.opponentLapTimes[i]
      })
    }
    
    // Sort by position
    positions.sort((a, b) => {
      if (a.lap !== b.lap) {
        return b.lap - a.lap  // Higher lap count comes first
      }
      return a.distance - b.distance  // Lower distance comes first
    })
    
    // Find player position
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].id === 'player') {
        this.playerPosition = i + 1
        break
      }
    }
  }

  /**
   * Get game state snapshot for deterministic replay
   * @returns {object} Game state snapshot
   */
  getSnapshot() {
    return {
      player: this.player ? {
        position: this.player.position,
        velocity: this.player.velocity,
        angle: this.player.angle,
        speed: this.player.speed
      } : null,
      opponents: this.opponents.map(opponent => ({
        position: opponent.vehicle.position,
        velocity: opponent.vehicle.velocity,
        angle: opponent.vehicle.angle,
        speed: opponent.vehicle.speed,
        currentWaypoint: opponent.currentWaypoint
      })),
      lapCount: this.lapDetector ? this.lapDetector.lapCount : 0,
      elapsedTime: this.elapsedTime,
      raceStarted: this.raceStarted,
      raceFinished: this.raceFinished,
      currentLap: this.currentLap,
      playerPosition: this.playerPosition,
      opponentLapCounts: this.opponentLapCounts
    }
  }

  /**
   * Restore game state from snapshot
   * @param {object} snapshot - Game state snapshot
   */
  restoreFromSnapshot(snapshot) {
    if (snapshot.player && this.player) {
      this.player.position = snapshot.player.position
      this.player.velocity = snapshot.player.velocity
      this.player.angle = snapshot.player.angle
      this.player.speed = snapshot.player.speed
    }

    for (let i = 0; i < snapshot.opponents.length && i < this.opponents.length; i++) {
      const oppSnapshot = snapshot.opponents[i]
      const opponent = this.opponents[i]
      opponent.vehicle.position = oppSnapshot.position
      opponent.vehicle.velocity = oppSnapshot.velocity
      opponent.vehicle.angle = oppSnapshot.angle
      opponent.vehicle.speed = oppSnapshot.speed
      opponent.currentWaypoint = oppSnapshot.currentWaypoint
    }

    if (this.lapDetector) {
      this.lapDetector.lapCount = snapshot.lapCount
    }

    this.elapsedTime = snapshot.elapsedTime
    this.raceStarted = snapshot.raceStarted
    this.raceFinished = snapshot.raceFinished
    this.currentLap = snapshot.currentLap || 0
    this.playerPosition = snapshot.playerPosition || 1
    this.opponentLapCounts = snapshot.opponentLapCounts || []
  }
  /**
   * Check for collisions between vehicles
   * @param {number} deltaTime - Time since last update
   */
  checkVehicleCollisions(deltaTime) {
    const { circleCollision, boundingBoxCollision, resolveCollision } = require('../physics/collision')
    
    // Check player vs opponents
    if (this.player) {
      for (const opponent of this.opponents) {
        const playerCircle = this.player.getCircle()
        const opponentCircle = opponent.vehicle.getCircle()
        
        // Use circle collision for initial detection
        if (circleCollision(playerCircle, opponentCircle)) {
          // Use bounding box for more precise collision
          const playerBox = this.player.getBoundingBox()
          const opponentBox = opponent.vehicle.getBoundingBox()
          
          if (boundingBoxCollision(playerBox, opponentBox)) {
            resolveCollision(this.player, opponent.vehicle)
          }
        }
      }
    }
    
    // Check opponents vs opponents
    for (let i = 0; i < this.opponents.length; i++) {
      for (let j = i + 1; j < this.opponents.length; j++) {
        const vehicle1 = this.opponents[i].vehicle
        const vehicle2 = this.opponents[j].vehicle
        
        const circle1 = vehicle1.getCircle()
        const circle2 = vehicle2.getCircle()
        
        if (circleCollision(circle1, circle2)) {
          const box1 = vehicle1.getBoundingBox()
          const box2 = vehicle2.getBoundingBox()
          
          if (boundingBoxCollision(box1, box2)) {
            resolveCollision(vehicle1, vehicle2)
          }
        }
      }
    }
  }

  /**
   * Check for collisions with track boundaries
   * @param {number} deltaTime - Time since last update
   */
  checkTrackBoundaryCollisions(deltaTime) {
    if (!this.track) return
    
    const { pointInPolygon } = require('../physics/collision')
    
    // Check player vs track boundaries
    if (this.player) {
      const outside = this.track.checkCollision(this.player)
      if (outside) {
        // Bounce player back into track
        this.handleBoundaryCollision(this.player)
      }
    }
    
    // Check opponents vs track boundaries
    for (const opponent of this.opponents) {
      const outside = this.track.checkCollision(opponent.vehicle)
      if (outside) {
        // Bounce opponent back into track
        this.handleBoundaryCollision(opponent.vehicle)
      }
    }
  }

  /**
   * Handle collision with track boundary
   * @param {Vehicle} vehicle - Vehicle that hit the boundary
   */
  handleBoundaryCollision(vehicle) {
    // Simple bounce: reverse velocity component perpendicular to boundary
    // For now, just stop the vehicle from going further outside
    const boundaryPadding = 5
    
    // Find which boundary was hit and push back inside
    for (const boundary of this.track.boundaries) {
      if (!pointInPolygon(vehicle.position, boundary)) {
        // Vehicle is outside this boundary, push it back inside
        const centerX = boundary.reduce((sum, p) => sum + p.x, 0) / boundary.length
        const centerY = boundary.reduce((sum, p) => sum + p.y, 0) / boundary.length
        
        const dx = vehicle.position.x - centerX
        const dy = vehicle.position.y - centerY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance > 0) {
          const nx = dx / distance
          const ny = dy / distance
          
          // Move vehicle back inside boundary
          vehicle.position.x -= nx * boundaryPadding
          vehicle.position.y -= ny * boundaryPadding
          
          // Reduce speed to simulate collision
          vehicle.speed *= 0.7
        }
        break
      }
    }
  }
}

module.exports = GameState
