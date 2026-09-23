import { RacePhase } from './Constants.js';

export class GameState {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.racePhase = RacePhase.READY;
        this.raceTime = 0;
        this.lapCounts = new Map(); // CarId -> lap count
        this.positions = new Map(); // CarId -> position ranking
        this.checkpoints = new Map(); // CarId -> Set of passed checkpoints
        this.finishTimes = new Map(); // CarId -> finish time
        this.isPaused = false;
        this.countdownValue = 3;
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.currentTime = 0;
        this.accumulator = 0;
        
        // Performance monitoring
        this.collisionCount = 0;
        this.fps = 60;
    }
    
    updateCarPosition(carId, checkpoint) {
        if (!this.checkpoints.has(carId)) {
            this.checkpoints.set(carId, new Set());
        }
        this.checkpoints.get(carId).add(checkpoint);
    }
    
    calculateRankings() {
        // Placeholder for ranking calculation
        return Array.from(this.lapCounts.keys());
    }
    
    isRaceComplete() {
        // Check if all cars have finished
        return this.racePhase === RacePhase.FINISHED;
    }
}