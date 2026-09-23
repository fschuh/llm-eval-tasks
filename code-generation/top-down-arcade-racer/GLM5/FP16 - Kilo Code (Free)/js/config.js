/**
 * Game Configuration Constants
 * All tunable parameters for the racing game
 */
export const CONFIG = {
    // Physics
    FIXED_TIMESTEP: 1 / 60,
    CAR_ACCELERATION: 300,
    CAR_BRAKE_FORCE: 400,
    CAR_MAX_SPEED: 350,
    CAR_TURN_RATE: 3.5,
    CAR_FRICTION: 0.98,
    CAR_ANGULAR_FRICTION: 0.92,
    CAR_REVERSE_SPEED: 150,
    
    // Collision
    CAR_RADIUS: 18,
    CAR_MASS: 1,
    WALL_RESTITUTION: 0.4,
    CAR_RESTITUTION: 0.6,
    
    // Track
    TRACK_WIDTH: 100,
    CHECKPOINT_COUNT: 8,
    TOTAL_LAPS: 3,
    
    // AI
    AI_UPDATE_INTERVAL: 0.15,
    AI_LOOKAHEAD_DISTANCE: 150,
    AI_STEERING_STRENGTH: 0.8,
    AI_THROTTLE_STRENGTH: 0.9,
    
    // RNG
    RNG_SEED: 12345,
    
    // Canvas
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 800,
    
    // Colors
    COLORS: {
        track: '#3a3a3a',
        trackBorder: '#1a1a1a',
        grass: '#2d5a27',
        wall: '#4a4a4a',
        player: '#e74c3c',
        ai1: '#3498db',
        ai2: '#2ecc71',
        ai3: '#f39c12',
        checkpoint: 'rgba(255, 255, 255, 0.3)',
        startLine: '#ffffff'
    }
};
