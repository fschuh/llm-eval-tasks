/**
 * PositionCalculator - Calculates race positions
 */
export class PositionCalculator {
    /**
     * Calculate positions for all cars
     * @param {Car[]} cars - Array of cars
     * @param {Track} track - Track
     * @returns {Object[]} Array of position data sorted by position
     */
    static calculate(cars, track) {
        const totalWaypoints = track.getTotalWaypoints();
        
        // Calculate score for each car
        const carScores = cars.map(car => {
            // Base score: completed laps + waypoint progress fraction
            const waypointProgress = car.raceState.currentWaypoint / totalWaypoints;
            const score = car.raceState.currentLap + waypointProgress;
            
            // Get distance to next waypoint for tiebreaker
            const nextWaypoint = track.getWaypoint(car.raceState.currentWaypoint);
            let distanceToNext = 0;
            if (nextWaypoint) {
                distanceToNext = car.position.distance(nextWaypoint.position);
            }
            
            return {
                car: car,
                carId: car.id,
                score: score,
                distanceToNext: distanceToNext,
                currentLap: car.raceState.currentLap,
                currentWaypoint: car.raceState.currentWaypoint,
                finished: car.raceState.finished,
                finishTime: car.raceState.totalTime
            };
        });

        // Sort by position
        // 1. Finished cars first (sorted by finish time)
        // 2. Higher score (laps + progress) first
        // 3. Closer to next waypoint wins ties
        carScores.sort((a, b) => {
            // Finished cars come first
            if (a.finished && !b.finished) return -1;
            if (!a.finished && b.finished) return 1;
            
            // Both finished - sort by finish time
            if (a.finished && b.finished) {
                return a.finishTime - b.finishTime;
            }
            
            // Neither finished - sort by score
            if (a.score !== b.score) {
                return b.score - a.score; // Higher score first
            }
            
            // Same score - closer to next waypoint wins
            return a.distanceToNext - b.distanceToNext;
        });

        // Assign positions
        carScores.forEach((data, index) => {
            data.position = index + 1;
            data.car.raceState.finalPosition = index + 1;
        });

        return carScores;
    }

    /**
     * Get position of a specific car
     * @param {Car} targetCar - Car to find position for
     * @param {Car[]} allCars - All cars in race
     * @param {Track} track - Track
     * @returns {number} Position (1-based)
     */
    static getCarPosition(targetCar, allCars, track) {
        const positions = this.calculate(allCars, track);
        const carData = positions.find(p => p.car === targetCar);
        return carData ? carData.position : allCars.length;
    }

    /**
     * Get car ahead of target car
     * @param {Car} targetCar - Target car
     * @param {Car[]} allCars - All cars
     * @param {Track} track - Track
     * @returns {Car|null} Car ahead or null
     */
    static getCarAhead(targetCar, allCars, track) {
        const positions = this.calculate(allCars, track);
        const targetIndex = positions.findIndex(p => p.car === targetCar);
        
        if (targetIndex > 0) {
            return positions[targetIndex - 1].car;
        }
        return null;
    }

    /**
     * Get car behind target car
     * @param {Car} targetCar - Target car
     * @param {Car[]} allCars - All cars
     * @param {Track} track - Track
     * @returns {Car|null} Car behind or null
     */
    static getCarBehind(targetCar, allCars, track) {
        const positions = this.calculate(allCars, track);
        const targetIndex = positions.findIndex(p => p.car === targetCar);
        
        if (targetIndex >= 0 && targetIndex < positions.length - 1) {
            return positions[targetIndex + 1].car;
        }
        return null;
    }

    /**
     * Get gap to car ahead (in seconds, estimated)
     * @param {Car} targetCar - Target car
     * @param {Car[]} allCars - All cars
     * @param {Track} track - Track
     * @returns {number} Gap in seconds (estimated)
     */
    static getGapToAhead(targetCar, allCars, track) {
        const carAhead = this.getCarAhead(targetCar, allCars, track);
        if (!carAhead) return 0;

        // Estimate gap based on track distance
        const trackLength = track.getTotalLength();
        const positions = this.calculate(allCars, track);
        
        const targetData = positions.find(p => p.car === targetCar);
        const aheadData = positions.find(p => p.car === carAhead);
        
        if (!targetData || !aheadData) return 0;

        // Calculate distance gap
        const scoreDiff = aheadData.score - targetData.score;
        const distanceGap = scoreDiff * trackLength;

        // Estimate time gap based on speed
        const avgSpeed = (Math.abs(targetCar.speed) + Math.abs(carAhead.speed)) / 2;
        if (avgSpeed < 1) return 0;

        return distanceGap / avgSpeed;
    }

    /**
     * Get distance between two cars along track
     * @param {Car} carA - First car
     * @param {Car} carB - Second car
     * @param {Track} track - Track
     * @returns {number} Distance in pixels (positive if B is ahead of A)
     */
    static getTrackDistance(carA, carB, track) {
        const totalWaypoints = track.getTotalWaypoints();
        const trackLength = track.getTotalLength();
        
        // Calculate progress as fraction of track
        const progressA = carA.raceState.currentLap + 
                         (carA.raceState.currentWaypoint / totalWaypoints);
        const progressB = carB.raceState.currentLap + 
                         (carB.raceState.currentWaypoint / totalWaypoints);
        
        // Distance in track units
        const progressDiff = progressB - progressA;
        
        return progressDiff * trackLength;
    }

    /**
     * Check if a car has been lapped
     * @param {Car} targetCar - Car to check
     * @param {Car} leaderCar - Leading car
     * @param {Track} track - Track
     * @returns {boolean} True if lapped
     */
    static isLapped(targetCar, leaderCar, track) {
        const lapDiff = leaderCar.raceState.currentLap - targetCar.raceState.currentLap;
        return lapDiff >= 1;
    }
}
