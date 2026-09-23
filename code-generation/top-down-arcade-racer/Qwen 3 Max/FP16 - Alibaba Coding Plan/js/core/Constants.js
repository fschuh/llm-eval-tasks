export const GameConfig = {
    FIXED_TIMESTEP: 1/60,           // 60 updates per second (16.67ms)
    PHYSICS_TIMESTEP: 1/30,         // 30 physics updates per second (33.33ms)
    MAX_FRAME_TIME: 0.25,           // Prevent spiral of death
    TOTAL_LAPS: 3,
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,
    TRACK_WIDTH: 120,
    CAR_WIDTH: 20,
    CAR_LENGTH: 40,
    SEED: 12345
};

export const RacePhase = {
    READY: 'READY',
    COUNTDOWN: 'COUNTDOWN',
    RACING: 'RACING',
    FINISHED: 'FINISHED'
};