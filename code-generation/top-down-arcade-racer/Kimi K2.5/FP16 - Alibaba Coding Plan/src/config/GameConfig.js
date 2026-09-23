/**
 * GameConfig - Global game settings and constants
 */

// Car physics defaults
export const DEFAULT_CAR_CONFIG = {
    mass: 1000,                    // kg
    radius: 15,                    // pixels (collision)
    maxSpeed: 300,                 // pixels/second
    maxReverseSpeed: 100,          // pixels/second
    acceleration: 200,             // pixels/second²
    braking: 300,                  // pixels/second²
    friction: 2.0,                 // coefficient
    turnSpeed: 3.0,                // radians/second at max speed
    grip: 5.0                      // lateral friction
};

// Game settings
export const GAME_CONFIG = {
    // Timing
    FIXED_TIMESTEP: 1/60,          // 60 FPS physics
    MAX_FRAME_TIME: 0.25,          // Prevent spiral of death
    
    // Race
    TOTAL_LAPS: 3,
    COUNTDOWN_SECONDS: 3,
    AI_COUNT: 3,
    
    // Physics
    RESTITUTION: 0.5,              // Bounciness
    POSITION_ITERATIONS: 3,        // Solver iterations
    
    // AI
    AI_DIFFICULTIES: ['easy', 'medium', 'hard'],
    WAYPOINT_THRESHOLD: 0.5,       // Multiplier of waypoint width
    
    // Rendering
    CANVAS_WIDTH: 1024,
    CANVAS_HEIGHT: 768,
    ENABLE_INTERPOLATION: true
};

// AI difficulty configurations
export const AI_CONFIG = {
    easy: {
        maxSpeedMultiplier: 0.8,
        reactionDelay: 0.2,
        steeringSmoothing: 0.8,
        brakingDistance: 50,
        waypointThreshold: 0.6
    },
    medium: {
        maxSpeedMultiplier: 0.9,
        reactionDelay: 0.1,
        steeringSmoothing: 0.9,
        brakingDistance: 40,
        waypointThreshold: 0.5
    },
    hard: {
        maxSpeedMultiplier: 1.0,
        reactionDelay: 0.0,
        steeringSmoothing: 1.0,
        brakingDistance: 30,
        waypointThreshold: 0.4
    }
};

// Default control mappings
export const DEFAULT_CONTROLS = {
    THROTTLE: 'ArrowUp',
    BRAKE: 'ArrowDown',
    STEER_LEFT: 'ArrowLeft',
    STEER_RIGHT: 'ArrowRight',
    // Alternative WASD controls
    THROTTLE_ALT: 'KeyW',
    BRAKE_ALT: 'KeyS',
    STEER_LEFT_ALT: 'KeyA',
    STEER_RIGHT_ALT: 'KeyD'
};

// Colors for rendering
export const COLORS = {
    PLAYER_CAR: '#00FF00',
    AI_CAR_EASY: '#FFFF00',
    AI_CAR_MEDIUM: '#FFA500',
    AI_CAR_HARD: '#FF0000',
    TRACK: '#333333',
    TRACK_BORDER: '#FFFFFF',
    WAYPOINT: '#4444FF',
    WAYPOINT_ACTIVE: '#00FFFF',
    WALL: '#888888',
    TEXT: '#FFFFFF',
    HUD_BG: 'rgba(0, 0, 0, 0.5)',
    COUNTDOWN: '#FFFF00',
    FINISHED: '#00FF00'
};
