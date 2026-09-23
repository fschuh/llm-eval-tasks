import { Vector2 } from '../utils/Vector2.js';
import { DeterministicRNG } from '../utils/DeterministicRNG.js';
import { LapDetector } from '../track/LapDetector.js';

/**
 * Game state management
 */
export class GameState {
    constructor(seed = 12345) {
        this.rng = new DeterministicRNG(seed);
        this.seed = seed;

        // Race state
        this.raceState = 'WAITING';   // WAITING, COUNTDOWN, RACING, FINISHED
        this.raceTime = 0;
        this.countdownTime = 3;

        // Entities
        this.player = null;
        this.aiCars = [];
        this.allCars = [];

        // Track
        this.track = null;
        this.lapDetector = null;

        // Camera
        this.camera = {
            position: new Vector2(0, 0),
            zoom: 1.0,
            target: null  // Car to follow
        };

        // Settings
        this.fixedTimestep = 1 / 60;  // 60 FPS physics
        this.maxSubsteps = 5;         // Prevent spiral of death

        // Statistics
        this.leaderboard = [];
    }

    /**
     * Initialize game with track
     */
    init(track) {
        this.track = track;
        this.lapDetector = new LapDetector(track);
    }

    /**
     * Set player car
     */
    setPlayer(player) {
        this.player = player;
        this.camera.target = player;
        this.updateAllCars();
    }

    /**
     * Add AI car
     */
    addAICar(aiCar) {
        this.aiCars.push(aiCar);
        this.updateAllCars();
    }

    /**
     * Update all cars array
     */
    updateAllCars() {
        this.allCars = [];
        if (this.player) this.allCars.push(this.player);
        this.allCars.push(...this.aiCars);
    }

    /**
     * Start the countdown
     */
    startCountdown() {
        this.raceState = 'COUNTDOWN';
        this.countdownTime = 3;
        this.raceTime = 0;
    }

    /**
     * Start the race
     */
    startRace() {
        this.raceState = 'RACING';
        this.raceTime = 0;
    }

    /**
     * Reset the race
     */
    reset() {
        this.raceState = 'WAITING';
        this.raceTime = 0;
        this.countdownTime = 3;
        this.leaderboard = [];
        
        // Reset RNG for deterministic behavior
        this.rng.reset();
    }

    /**
     * Get cars sorted by race position
     */
    getLeaderboard() {
        if (!this.lapDetector) return [];

        // Sort finished cars by finish time
        const finished = this.allCars
            .filter(car => car.finished)
            .sort((a, b) => a.finishTime - b.finishTime);

        // Sort unfinished cars by lap and track progress
        const unfinished = this.allCars
            .filter(car => !car.finished)
            .sort((a, b) => {
                // Sort by lap count first
                if (a.lapCount !== b.lapCount) {
                    return b.lapCount - a.lapCount;
                }
                // Then by track progress
                const progressA = this.lapDetector.getRaceProgress(a);
                const progressB = this.lapDetector.getRaceProgress(b);
                return progressB - progressA;
            });

        return [...finished, ...unfinished];
    }

    /**
     * Update leaderboard
     */
    updateLeaderboard() {
        this.leaderboard = this.getLeaderboard();
        
        // Update race position for each car
        this.leaderboard.forEach((car, index) => {
            car.racePosition = index + 1;
        });
    }

    /**
     * Check if race is finished
     */
    isRaceFinished() {
        return this.allCars.every(car => car.finished);
    }

    /**
     * Get player's position in the race
     */
    getPlayerPosition() {
        if (!this.player) return 0;
        return this.leaderboard.indexOf(this.player) + 1;
    }
}