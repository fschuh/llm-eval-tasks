/**
 * Game constants and configuration
 * 
 * This module contains all constant values used throughout the game
 * to ensure consistency and easy configuration.
 */

// Game loop constants
const GAME_LOOP = {
  FIXED_TIMESTEP: 1/60,      // 60 updates per second
  MAX_FRAME_SKIP: 5,          // Maximum number of fixed updates per render
  TARGET_FPS: 60              // Target rendering frame rate
}

// Physics constants
const PHYSICS = {
  GRAVITY: 9.8,              // Gravity constant
  RESTITUTION: 0.8,          // Bounciness coefficient (0-1)
  FRICTION: 0.95,            // Friction coefficient
  DEFAULT_MASS: 1.0,         // Default object mass
  DEFAULT_DENSITY: 1.0       // Default object density
}

// Vehicle constants
const VEHICLE = {
  MAX_SPEED: 10.0,           // Maximum vehicle speed
  ACCELERATION: 0.2,         // Acceleration rate
  DECELERATION: 0.1,         // Deceleration rate
  STEERING_SPEED: 3.0,       // How fast vehicle can turn
  MAX_STEERING_ANGLE: Math.PI / 4,  // Maximum steering angle (45 degrees)
  DEFAULT_WIDTH: 20,         // Default vehicle width
  DEFAULT_HEIGHT: 40,        // Default vehicle height
  DEFAULT_RADIUS: 15         // Default collision radius
}

// Collision constants
const COLLISION = {
  CHECKPOINT_RADIUS: 30,     // Radius for checkpoint detection
  BOUNDARY_CORRECTION: 0.2   // Penetration correction percentage
}

// AI constants
const AI = {
  DEFAULT_TARGET_SPEED: 0.8, // 80% of max speed
  DEFAULT_REACTION_TIME: 0.5, // Time to react to obstacles
  WAYPOINT_CONNECTION_RADIUS: 50 // Radius for connecting waypoints
}

// Game state constants
const GAME_STATE = {
  DEFAULT_LAP_COUNT: 3,      // Number of laps in a race
  RACE_DURATION: 300,         // Race duration in seconds
  COUNTDOWN_TIME: 3           // Countdown time before race starts
}

module.exports = {
  GAME_LOOP,
  PHYSICS,
  VEHICLE,
  COLLISION,
  AI,
  GAME_STATE
}
