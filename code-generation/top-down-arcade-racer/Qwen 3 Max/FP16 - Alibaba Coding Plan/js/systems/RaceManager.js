import { GameConfig } from '../core/Constants.js';

export class RaceManager {
    constructor(lapDetector, totalLaps = GameConfig.TOTAL_LAPS) {
        this.lapDetector = lapDetector;
        this.totalLaps = totalLaps;
        this.finishedCars = new Set();
        this.raceStartTime = null;
        this.isRaceActive = false;
        this.raceComplete = false;
        this.finishOrder = [];
    }
    
    startRace(currentTime) {
        this.raceStartTime = currentTime;
        this.isRaceActive = true;
        this.raceComplete = false;
        this.finishedCars.clear();
        this.finishOrder = [];
    }
    
    update(raceTime, allCars) {
        if (!this.isRaceActive) return;
        
        // Check for finished cars
        for (const car of allCars) {
            if (!this.finishedCars.has(car.id) && this.lapDetector.isRaceFinished(car.id)) {
                this.finishedCars.add(car.id);
                this.finishOrder.push({
                    carId: car.id,
                    finishTime: this.lapDetector.getTotalRaceTime(car.id),
                    position: this.finishOrder.length + 1
                });
                
                // Check if all cars have finished or player has finished
                if (this.hasRaceCompleted(allCars)) {
                    this.raceComplete = true;
                }
            }
        }
    }
    
    hasRaceCompleted(allCars) {
        // Race completes when player finishes (for single player experience)
        return this.finishedCars.has('player');
    }
    
    isRaceActive() {
        return this.isRaceActive && !this.raceComplete;
    }
    
    getFinishPosition(carId) {
        const finishEntry = this.finishOrder.find(entry => entry.carId === carId);
        return finishEntry ? finishEntry.position : null;
    }
    
    getRaceTime() {
        return this.raceStartTime ? performance.now() / 1000 - this.raceStartTime : 0;
    }
}