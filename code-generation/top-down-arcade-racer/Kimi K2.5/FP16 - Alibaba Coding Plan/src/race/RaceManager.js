import { EventBusInstance as EventBus } from '../core/EventBus.js';
import { LapDetector } from './LapDetector.js';
import { PositionCalculator } from './PositionCalculator.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { Vector2D } from '../core/Vector2D.js';

/**
 * RaceManager - Manages overall race state and flow
 */
export class RaceManager {
    /**
     * Create a new race manager
     * @param {Track} track - Track to race on
     * @param {Car[]} cars - Array of cars
     * @param {number} totalLaps - Total laps required
     */
    constructor(track, cars, totalLaps = GAME_CONFIG.TOTAL_LAPS) {
        this.track = track;
        this.cars = cars;
        this.totalLaps = totalLaps;
        
        // Race state
        this.status = 'waiting'; // waiting, countdown, racing, finished
        this.startTime = 0;
        this.currentTime = 0;
        this.countdownValue = GAME_CONFIG.COUNTDOWN_SECONDS;
        this.countdownTimer = 0;
        
        // Results
        this.results = [];
        this.finishedCars = [];
        
        // Sub-systems
        this.lapDetector = new LapDetector(track);
        
        // Register all cars with lap detector
        for (const car of cars) {
            this.lapDetector.registerCar(car);
        }
        
        // Positions cache
        this.positions = [];
        
        // Bind to events
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for lap completions
        EventBus.on('race:lapCompleted', (data) => {
            this.onLapCompleted(data);
        });
    }

    /**
     * Start the race (begins countdown)
     */
    start() {
        if (this.status !== 'waiting') return;
        
        this.status = 'countdown';
        this.countdownValue = GAME_CONFIG.COUNTDOWN_SECONDS;
        this.countdownTimer = 0;
        this.startTime = 0;
        
        // Reset all cars
        this.resetCars();
        
        EventBus.emit('race:countdown', { value: this.countdownValue });
    }

    /**
     * Reset all cars to starting positions
     */
    resetCars() {
        this.results = [];
        this.finishedCars = [];
        
        for (let i = 0; i < this.cars.length; i++) {
            const car = this.cars[i];
            const startPos = this.track.getStartPosition(i);
            
            if (startPos) {
                car.reset(startPos.position, startPos.rotation);
            } else {
                // Fallback position
                car.reset(
                    new Vector2D(100 + i * 50, 384),
                    0
                );
            }
        }
        
        this.lapDetector.resetAll();
    }

    /**
     * Update race state
     * @param {number} dt - Delta time
     */
    update(dt) {
        this.currentTime += dt;
        
        switch (this.status) {
            case 'countdown':
                this.updateCountdown(dt);
                break;
            case 'racing':
                this.updateRacing(dt);
                break;
        }
        
        // Update positions
        this.positions = PositionCalculator.calculate(this.cars, this.track);
    }

    /**
     * Update countdown state
     * @param {number} dt - Delta time
     */
    updateCountdown(dt) {
        this.countdownTimer += dt;
        
        if (this.countdownTimer >= 1) {
            this.countdownTimer -= 1;
            this.countdownValue--;
            
            EventBus.emit('race:countdown', { value: this.countdownValue });
            
            if (this.countdownValue <= 0) {
                this.beginRace();
            }
        }
    }

    /**
     * Begin the actual race
     */
    beginRace() {
        this.status = 'racing';
        this.startTime = this.currentTime;
        
        // Set lap start times for all cars
        for (const car of this.cars) {
            car.raceState.lapStartTime = this.currentTime;
        }
        
        EventBus.emit('race:start', { startTime: this.startTime });
    }

    /**
     * Update racing state
     * @param {number} dt - Delta time
     */
    updateRacing(dt) {
        // Update lap detection
        this.lapDetector.update(this.currentTime);
        
        // Check for race finish
        this.checkRaceFinish();
    }

    /**
     * Handle lap completion
     * @param {Object} data - Lap completion data
     */
    onLapCompleted(data) {
        const car = this.cars.find(c => c.id === data.carId);
        if (!car) return;
        
        // Check if car has finished all laps
        if (car.raceState.currentLap >= this.totalLaps) {
            this.carFinished(car);
        }
    }

    /**
     * Mark a car as finished
     * @param {Car} car - Car that finished
     */
    carFinished(car) {
        if (car.raceState.finished) return;
        
        const finishTime = this.currentTime - this.startTime;
        const position = this.finishedCars.length + 1;
        
        car.finish(position);
        this.finishedCars.push(car);
        
        // Add to results
        this.results.push({
            carId: car.id,
            finishTime: finishTime,
            finalPosition: position,
            isPlayer: car.isPlayer
        });
        
        // Check if all cars finished
        this.checkRaceFinish();
    }

    /**
     * Check if race is finished
     */
    checkRaceFinish() {
        // Race finishes when all cars are done
        const activeCars = this.cars.filter(c => !c.raceState.finished);
        
        if (activeCars.length === 0 && this.status === 'racing') {
            this.finishRace();
        }
    }

    /**
     * Finish the race
     */
    finishRace() {
        this.status = 'finished';
        
        // Sort results by position
        this.results.sort((a, b) => a.finalPosition - b.finalPosition);
        
        EventBus.emit('race:finished', { 
            results: this.results,
            totalTime: this.currentTime - this.startTime
        });
    }

    /**
     * Get current positions
     * @returns {Object[]} Array of position data
     */
    getPositions() {
        return this.positions;
    }

    /**
     * Get player's position
     * @returns {Object} Position data
     */
    getPlayerPosition() {
        const playerCar = this.cars.find(c => c.isPlayer);
        if (!playerCar) return { current: 1, total: this.cars.length };
        
        const position = PositionCalculator.getCarPosition(playerCar, this.cars, this.track);
        return { current: position, total: this.cars.length };
    }

    /**
     * Check if race is finished
     * @returns {boolean} True if finished
     */
    isFinished() {
        return this.status === 'finished';
    }

    /**
     * Get race results
     * @returns {Object[]} Array of results
     */
    getResults() {
        return this.results;
    }

    /**
     * Get elapsed race time
     * @returns {number} Elapsed time in seconds
     */
    getElapsedTime() {
        if (this.status === 'waiting') return 0;
        if (this.status === 'countdown') return 0;
        return this.currentTime - this.startTime;
    }

    /**
     * Reset the race
     */
    reset() {
        this.status = 'waiting';
        this.startTime = 0;
        this.currentTime = 0;
        this.countdownValue = GAME_CONFIG.COUNTDOWN_SECONDS;
        this.countdownTimer = 0;
        this.results = [];
        this.finishedCars = [];
        this.positions = [];
        
        this.resetCars();
    }

    /**
     * Pause the race
     */
    pause() {
        if (this.status === 'racing') {
            this.status = 'paused';
        }
    }

    /**
     * Resume the race
     */
    resume() {
        if (this.status === 'paused') {
            this.status = 'racing';
        }
    }

    /**
     * Get race status
     * @returns {string} Race status
     */
    getStatus() {
        return this.status;
    }

    /**
     * Get countdown value
     * @returns {number} Countdown value
     */
    getCountdownValue() {
        return this.countdownValue;
    }

    /**
     * Get leader car
     * @returns {Car|null} Leading car
     */
    getLeader() {
        if (this.positions.length === 0) return null;
        return this.positions[0].car;
    }

    /**
     * Get car by ID
     * @param {string} carId - Car ID
     * @returns {Car|null} Car or null
     */
    getCar(carId) {
        return this.cars.find(c => c.id === carId) || null;
    }
}
