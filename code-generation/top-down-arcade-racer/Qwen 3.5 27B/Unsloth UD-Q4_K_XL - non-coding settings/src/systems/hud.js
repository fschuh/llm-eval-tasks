/**
 * Heads-Up Display (HUD) System for rendering race information on canvas.
 * Displays position, lap count, timing data, and leaderboard rankings.
 * Uses checkpoint-based position calculation as specified in architecture document section 9.
 * 
 * @module HUD
 */

import LapTimer from './lapTimer.js';

/**
 * Configuration options for the HUD system.
 * @typedef {Object} HUDConfig
 * @param {number} [config.fontSize=16] - Base font size in pixels
 * @param {string} [config.fontFamily='monospace'] - Font family for text rendering
 * @param {string} [config.textColor='#FFFFFF'] - Primary text color (hex or CSS color)
 * @param {string} [config.backgroundColor='rgba(0,0,0,0.7)'] - Background color for HUD panel
 */

/**
 * Position ranking data for a single car.
 * @typedef {Object} CarRanking
 * @param {Car} car - The car entity
 * @param {number} position - Current race position (1-based)
 * @param {number} lapsCompleted - Number of complete laps finished
 * @param {number} checkpointIndex - Index of the last checkpoint passed
 * @param {number} segmentProgress - Distance along current segment (0-1)
 */

/**
 * HUD System that renders race information on an HTML5 Canvas.
 * Handles position calculation, timing display, and leaderboard rendering.
 * Position is calculated using a three-tier sorting algorithm:
 * 1. Laps completed (descending - more laps = better position)
 * 2. Checkpoint index reached (descending - further along track = better)
 * 3. Distance to next waypoint (ascending - closer = better)
 */
class HUD {
    /**
     * Creates a new HUD instance for the given canvas element.
     * 
     * @param {HTMLCanvasElement} canvas - The HTML5 Canvas element to render on
     * @param {HUDConfig} [config] - Configuration options for styling
     */
    constructor(canvas, config = {}) {
        /** @type {HTMLCanvasElement} Reference to the canvas element */
        this.canvas = canvas;
        
        /** @type {CanvasRenderingContext2D} Canvas 2D rendering context */
        this.context = canvas.getContext('2d');
        
        // Style configuration with defaults
        /** @type {number} Base font size in pixels */
        this.fontSize = config.fontSize || 16;
        
        /** @type {string} Font family for text rendering */
        this.fontFamily = config.fontFamily || 'monospace';
        
        /** @type {string} Primary text color */
        this.textColor = config.textColor || '#FFFFFF';
        
        /** @type {string} Background color for HUD panel */
        this.backgroundColor = config.backgroundColor || 'rgba(0,0,0,0.7)';
        
        // Position data cache to avoid recalculating on every render
        /** @type {CarRanking[]} Cached position rankings from last update */
        this.positionCache = [];
        
        /** @type {number|null} Current lap time in milliseconds for player car */
        this.currentLapTime = null;
        
        /** @type {number|null} Best lap time in milliseconds for player car */
        this.bestLapTime = null;
        
        /** @type {LapTimer|null} Shared timer instance for all cars */
        this.lapTimer = null;
    }

    /**
     * Initializes the shared lap timer.
     * Should be called once at the start of a race with the list of participating cars.
     *
     * @param {Car[]} cars - Array of Car entities to initialize timers for
     */
    initializeTimers(cars) {
        this.lapTimer = new LapTimer();
        
        // Initialize timer data for each car
        cars.forEach(car => {
            if (this.lapTimer) {
                this.lapTimer.startLap(car.id);
            }
        });
    }

    /**
     * Updates internal state with current race data.
     * Calculates positions and retrieves timing information from all cars.
     * 
     * @param {Car[]} cars - Array of Car entities with current race state
     * @param {LapDetector} lapDetector - Lap detector instance for checkpoint progress data
     */
    update(cars, lapDetector) {
        // Calculate and cache position rankings
        this.positionCache = this.calculatePositions(cars, lapDetector);
        
        // Update timing display data from player car's timer
        const playerCar = cars.find(car => car.isPlayer);
        if (playerCar && this.lapTimer) {
            this.currentLapTime = this.lapTimer.getCurrentLapTime(playerCar.id);
            this.bestLapTime = this.lapTimer.getBestLapTime(playerCar.id);
        }
    }

    /**
     * Calculates current race positions for all cars based on lap progress.
     * 
     * Position Calculation Algorithm:
     * 1. Primary sort: laps completed (descending) - more complete laps = better position
     * 2. Secondary sort: checkpoint index reached (descending) - further along track = better
     * 3. Tertiary sort: distance to next waypoint (ascending) - closer to next waypoint wins
     * 
     * This ensures fair positioning even when cars are on different laps or at different
     * points within the same lap. The algorithm uses checkpoint data from the LapDetector
     * for accurate track progress measurement.
     * 
     * @param {Car[]} cars - Array of Car entities to rank
     * @param {LapDetector} lapDetector - Lap detector instance providing checkpoint progress
     * @returns {CarRanking[]} Sorted array of car rankings (position 1 first)
     */
    calculatePositions(cars, lapDetector) {
        // Build ranking data for each car
        const rankings = cars.map(car => {
            const progress = lapDetector.getCarProgress(car.id);
            
            return {
                car: car,
                lapsCompleted: car.lapsCompleted || 0,
                checkpointIndex: progress ? progress.currentCheckpoint : -1,
                checkpointsPassed: progress ? progress.checkpointsPassed.length : 0
            };
        });

        // Sort using three-tier comparison algorithm
        rankings.sort((a, b) => {
            // Primary sort: laps completed (descending)
            if (b.lapsCompleted !== a.lapsCompleted) {
                return b.lapsCompleted - a.lapsCompleted;
            }
            
            // Secondary sort: checkpoint index reached (descending)
            if (a.checkpointIndex !== b.checkpointIndex) {
                return b.checkpointIndex - a.checkpointIndex;
            }
            
            // Tertiary sort: checkpoints passed in current lap (descending)
            if (a.checkpointsPassed !== b.checkpointsPassed) {
                return b.checkpointsPassed - a.checkpointsPassed;
            }
            
            // Final tiebreaker: car ID for deterministic ordering
            return a.car.id - b.car.id;
        });

        // Assign position numbers (1-based) and return
        return rankings.map((ranking, index) => ({
            ...ranking,
            position: index + 1
        }));
    }

    /**
     * Returns the current race position for a specific car.
     * 
     * @param {number} carId - The unique identifier of the car
     * @param {Car[]} cars - Array of Car entities (used if cache is stale)
     * @param {LapDetector} lapDetector - Lap detector instance for fresh calculation
     * @returns {number} Position from 1 to N, or -1 if car not found
     */
    getCarPosition(carId, cars, lapDetector) {
        // Use cached positions if available and up-to-date
        const cachedRanking = this.positionCache.find(r => r.car.id === carId);
        if (cachedRanking) {
            return cachedRanking.position;
        }
        
        // Recalculate if cache doesn't have this car
        const rankings = this.calculatePositions(cars, lapDetector);
        const ranking = rankings.find(r => r.car.id === carId);
        
        return ranking ? ranking.position : -1;
    }

    /**
     * Renders the HUD on the canvas.
     * Draws position indicator, lap counter, timing data, and leaderboard.
     * 
     * Layout:
     * ┌─────────────────────────────────┐
     * │ POS: 1/4   LAP: 2/5    TIME: 01:23.45 │
     * │ BEST: 01:18.92                    │
     * ├─────────────────────────────────┤
     * │ LEADERBOARD                     │
     * │ 1. Player     01:23.45          │
     * │ 2. AI-Red     +0.5s             │
     * │ 3. AI-Blue    +2.3s             │
     * │ 4. AI-Green   +5.1s             │
     * └─────────────────────────────────┘
     */
    render() {
        const ctx = this.context;
        const canvas = this.canvas;
        
        // Clear the HUD area (top portion of screen)
        const hudHeight = 120;
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, hudHeight);
        
        // Set default text style
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.textColor;
        ctx.textBaseline = 'top';
        
        // Find player ranking for display
        const playerRanking = this.positionCache.find(r => r.car.isPlayer);
        const totalCars = this.positionCache.length;
        
        // Top row: Position, Lap, Current Time
        if (playerRanking) {
            // Position indicator (top-left)
            ctx.fillText(`POS: ${playerRanking.position}/${totalCars}`, 10, 10);
            
            // Lap counter (center-top)
            const lapText = `LAP: ${playerRanking.lapsCompleted + 1}`;
            const lapX = canvas.width / 2 - ctx.measureText(lapText).width / 2;
            ctx.fillText(lapText, lapX, 10);
            
            // Current lap time (top-right)
            if (this.currentLapTime !== null && this.currentLapTime > 0) {
                const currentTimeFormatted = this.formatTime(this.currentLapTime);
                const timeText = `TIME: ${currentTimeFormatted}`;
                const timeX = canvas.width - ctx.measureText(timeText).width - 10;
                ctx.fillText(timeText, timeX, 10);
            }
        }
        
        // Second row: Best lap time (below position)
        if (this.bestLapTime !== null && this.bestLapTime > 0) {
            const bestTimeFormatted = this.formatTime(this.bestLapTime);
            ctx.fillText(`BEST: ${bestTimeFormatted}`, 10, 35);
        }
        
        // Draw separator line
        ctx.strokeStyle = this.textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 65);
        ctx.lineTo(canvas.width, 65);
        ctx.stroke();
        
        // Render leaderboard section
        this.renderLeaderboard(ctx, canvas);
    }

    /**
     * Renders the mini leaderboard showing all cars' positions and times.
     * 
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     * @param {HTMLCanvasElement} canvas - Canvas element for width reference
     * @private
     */
    renderLeaderboard(ctx, canvas) {
        // Leaderboard header
        ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.textColor;
        ctx.fillText('LEADERBOARD', 10, 75);
        
        // Car entries
        ctx.font = `${this.fontSize - 2}px ${this.fontFamily}`;
        
        // Get reference time from first-place car for delta calculations
        const firstCar = this.positionCache[0];
        let referenceTime = null;
        
        if (firstCar && firstCar.car && this.lapTimer) {
            referenceTime = this.lapTimer.getCurrentLapTime(firstCar.car.id);
        }
        
        // Render each car's entry
        this.positionCache.forEach((ranking, index) => {
            const y = 100 + index * 25;
            
            // Highlight player car in green
            if (ranking.car.isPlayer) {
                ctx.fillStyle = '#00FF00';
            } else {
                ctx.fillStyle = this.textColor;
            }
            
            // Get car name/identifier
            const carName = ranking.car.isPlayer ? 'Player' : `AI-${ranking.car.id}`;
            
            // Calculate time display
            let timeDisplay = '--:--.--';
            if (referenceTime !== null && this.lapTimer) {
                const carTime = this.lapTimer.getCurrentLapTime(ranking.car.id);
                if (carTime > 0 && ranking.position === 1) {
                    timeDisplay = this.formatTime(carTime);
                } else if (carTime > 0 && ranking.position > 1) {
                    // Show delta from leader
                    const deltaTime = carTime - referenceTime;
                    timeDisplay = this.formatDeltaTime(deltaTime);
                }
            }
            
            ctx.fillText(`${ranking.position}. ${carName.padEnd(12)} ${timeDisplay}`, 10, y);
        });
    }

    /**
     * Formats a time in milliseconds to a human-readable string.
     * Format: "MM:SS.cc" (minutes:seconds.centiseconds)
     * 
     * @param {number} ms - Time in milliseconds to format
     * @returns {string} Formatted time string (e.g., "01:23.45")
     */
    formatTime(ms) {
        if (ms === null || isNaN(ms) || ms < 0) {
            return '--:--.--';
        }
        
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const centiseconds = Math.floor((ms % 1000) / 10);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
    }

    /**
     * Formats a time delta (difference from leader) for leaderboard display.
     * Format: "+X.Xs" or "-X.Xs" showing seconds ahead/behind
     * 
     * @param {number} ms - Time difference in milliseconds (positive = behind, negative = ahead)
     * @returns {string} Formatted delta string (e.g., "+0.5s")
     */
    formatDeltaTime(ms) {
        if (ms === null || isNaN(ms)) {
            return '--';
        }
        
        const seconds = ms / 1000;
        const sign = seconds >= 0 ? '+' : '';
        const formatted = Math.abs(seconds).toFixed(1);
        
        return `${sign}${formatted}s`;
    }

    /**
     * Updates the style configuration for the HUD.
     * Allows dynamic styling changes without recreating the HUD instance.
     * 
     * @param {HUDConfig} config - New configuration options to apply
     */
    updateStyle(config) {
        if (config.fontSize !== undefined) this.fontSize = config.fontSize;
        if (config.fontFamily !== undefined) this.fontFamily = config.fontFamily;
        if (config.textColor !== undefined) this.textColor = config.textColor;
        if (config.backgroundColor !== undefined) this.backgroundColor = config.backgroundColor;
    }

    /**
     * Clears the HUD cache and forces recalculation on next update.
     */
    invalidateCache() {
        this.positionCache = [];
    }

    /**
     * Returns a string representation of the HUD for debugging.
     * Format: "HUD(cars: N, playerPos: X)"
     * 
     * @returns {string} String representation of the HUD state
     */
    toString() {
        const playerRanking = this.positionCache.find(r => r.car.isPlayer);
        const playerPos = playerRanking ? playerRanking.position : 'N/A';
        return `HUD(cars:${this.positionCache.length}, playerPos:${playerPos})`;
    }
}

export default HUD;
