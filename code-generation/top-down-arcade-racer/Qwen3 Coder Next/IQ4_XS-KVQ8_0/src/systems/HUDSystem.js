/**
 * HUD (Heads-Up Display) System
 * 
 * Renders game information and statistics on screen including
 * lap information, timing, position, speed, and track progress.
 */

import { Vector2 } from '../core/Vector2.js';

/**
 * HUD System for displaying game information
 */
export class HUDSystem {
    /**
     * Creates a new HUD system
     * @param {Object} options - Configuration options
     * @param {PlayerCar} options.playerCar - The player's car
     * @param {Car[]} options.allCars - All cars in the race
     * @param {LapSystem} options.lapSystem - Lap tracking system
     * @param {Timer} options.timer - Game timer
     * @param {Track} options.track - The track being raced
     */
    constructor({ playerCar, allCars, lapSystem, timer, track } = {}) {
        /**
         * The player's car
         * @type {PlayerCar}
         */
        this.playerCar = playerCar;

        /**
         * All cars in the race
         * @type {Car[]}
         */
        this.allCars = allCars || [];

        /**
         * Lap tracking system
         * @type {LapSystem}
         */
        this.lapSystem = lapSystem;

        /**
         * Game timer
         * @type {Timer}
         */
        this.timer = timer;

        /**
         * The track
         * @type {Track}
         */
        this.track = track;

        /**
         * Canvas context for rendering
         * @type {CanvasRenderingContext2D}
         */
        this.ctx = null;

        /**
         * Canvas width
         * @type {number}
         */
        this.canvasWidth = 0;

        /**
         * Canvas height
         * @type {number}
         */
        this.canvasHeight = 0;

        /**
         * HUD position offset from top-left
         * @type {Object}
         */
        this.offset = { x: 20, y: 20 };

        /**
         * Font settings
         * @type {Object}
         */
        this.font = {
            family: 'Arial, sans-serif',
            size: 16,
            weight: 'bold'
        };

        /**
         * Colors
         * @type {Object}
         */
        this.colors = {
            text: '#ffffff',
            textShadow: '#000000',
            accent: '#00ffcc',
            progressBg: '#333333',
            progressFg: '#00ffcc',
            position1: '#ffd700', // Gold
            position2: '#c0c0c0', // Silver
            position3: '#cd7f32', // Bronze
            other: '#ffffff'
        };
    }

    /**
     * Initialize the HUD with canvas context
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} canvasWidth - Canvas width
     * @param {number} canvasHeight - Canvas height
     */
    init(ctx, canvasWidth, canvasHeight) {
        this.ctx = ctx;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }

    /**
     * Update HUD state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Update is handled in render for HUD
    }

    /**
     * Render all HUD elements
     */
    render() {
        if (!this.ctx || !this.playerCar) {
            return;
        }

        const ctx = this.ctx;
        const offset = this.offset;

        // Save context state
        ctx.save();

        // Set font
        ctx.font = `${this.font.weight} ${this.font.size}px ${this.font.family}`;
        ctx.textBaseline = 'top';

        // Draw lap information
        this._drawLapInfo(offset.x, offset.y);

        // Draw timing information
        this._drawTimingInfo(offset.x, offset.y + 60);

        // Draw position information
        this._drawPositionInfo(offset.x, offset.y + 120);

        // Draw speed and gear
        this._drawSpeedGearInfo(offset.x, offset.y + 180);

        // Draw track progress bar
        this._drawTrackProgress(offset.x, offset.y + 240);

        // Draw total race time
        this._drawTotalRaceTime(offset.x, offset.y + 300);

        // Restore context state
        ctx.restore();
    }

    /**
     * Draw lap information
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _drawLapInfo(x, y) {
        const ctx = this.ctx;
        const playerCar = this.playerCar;

        // Get lap data from LapSystem if available
        let currentLap = playerCar.currentLap || 1;
        let totalLaps = playerCar.totalLaps || 3;

        ctx.fillStyle = this.colors.text;
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 2;

        ctx.fillText(`LAP: ${currentLap} / ${totalLaps}`, x, y);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw timing information
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _drawTimingInfo(x, y) {
        const ctx = this.ctx;
        const playerCar = this.playerCar;

        // Get lap time from LapSystem if available
        let lapTime = 0;
        let bestLapTime = 0;

        if (this.timer) {
            lapTime = this.timer._lapStartTime > 0 
                ? performance.now() - this.timer._lapStartTime 
                : 0;
            bestLapTime = this.timer._bestLapTime !== Infinity 
                ? this.timer._bestLapTime 
                : 0;
        } else if (this.lapSystem && this.lapSystem.carLapData.has(playerCar.id)) {
            const carData = this.lapSystem.carLapData.get(playerCar.id);
            lapTime = carData.lapStartTime > 0 
                ? performance.now() - carData.lapStartTime 
                : 0;
            bestLapTime = carData.lastLapTime || 0;
        }

        // Format lap time
        const lapTimeFormatted = this._formatTime(lapTime);
        const bestLapFormatted = this._formatTime(bestLapTime);

        ctx.fillStyle = this.colors.text;
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 2;

        ctx.fillText(`LAP TIME: ${lapTimeFormatted}`, x, y);
        ctx.fillText(`BEST LAP: ${bestLapFormatted}`, x, y + 20);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw position information
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _drawPositionInfo(x, y) {
        const ctx = this.ctx;
        const position = this.calculatePosition(this.playerCar);
        const totalCars = this.allCars.length;

        ctx.fillStyle = this.colors.text;
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 2;

        // Get position color
        let positionColor = this.colors.other;
        if (position === 1) positionColor = this.colors.position1;
        else if (position === 2) positionColor = this.colors.position2;
        else if (position === 3) positionColor = this.colors.position3;

        ctx.fillStyle = positionColor;
        ctx.fillText(`POSITION: ${position} / ${totalCars}`, x, y);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw speed and gear information
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _drawSpeedGearInfo(x, y) {
        const ctx = this.ctx;
        const playerCar = this.playerCar;

        // Calculate speed in MPH (approximate conversion)
        const speedUnitsPerSecond = playerCar.speed || 0;
        const speedMPH = Math.round(speedUnitsPerSecond * 0.6);

        // Calculate gear based on speed
        const gear = this._calculateGear(speedUnitsPerSecond);

        ctx.fillStyle = this.colors.text;
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 2;

        ctx.fillText(`SPEED: ${speedMPH} MPH`, x, y);
        ctx.fillText(`GEAR: ${gear}`, x, y + 20);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw track progress bar
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _drawTrackProgress(x, y) {
        const ctx = this.ctx;
        const playerCar = this.playerCar;

        // Calculate progress between checkpoints
        let progress = 0;

        if (this.lapSystem && this.lapSystem.carLapData.has(playerCar.id)) {
            const carData = this.lapSystem.carLapData.get(playerCar.id);
            const currentCheckpoint = carData.currentCheckpoint || 0;
            const lastCheckpoint = carData.lastCheckpoint || 0;
            const checkpoints = this.track.checkpointIndices || [];

            if (checkpoints.length > 0) {
                // Get positions at checkpoints
                const currentWaypoint = this.track.waypoints[currentCheckpoint] || new Vector2();
                const prevWaypoint = this.track.waypoints[lastCheckpoint] || currentWaypoint;

                // Calculate progress along current segment
                const carPos = playerCar.position;
                const segmentStart = prevWaypoint;
                const segmentEnd = currentWaypoint;

                // Project car position onto segment
                const segmentDir = segmentEnd.sub(segmentStart);
                const segmentLength = segmentDir.length();
                const carToStart = carPos.sub(segmentStart);

                if (segmentLength > 0) {
                    const t = carToStart.dot(segmentDir) / (segmentLength * segmentLength);
                    progress = Math.max(0, Math.min(1, t)) * 100;
                }
            }
        }

        // Draw progress bar background
        const barWidth = 200;
        const barHeight = 12;
        const barX = x;
        const barY = y;

        ctx.fillStyle = this.colors.progressBg;
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Draw progress fill
        const fillWidth = (barWidth * progress) / 100;
        ctx.fillStyle = this.colors.progressFg;
        ctx.fillRect(barX, barY, fillWidth, barHeight);

        // Draw border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Draw label
        ctx.fillStyle = this.colors.text;
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 2;
        ctx.fillText(`TRACK PROGRESS: ${Math.round(progress)}%`, x, y + 20);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw total race time
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _drawTotalRaceTime(x, y) {
        const ctx = this.ctx;
        let totalTime = 0;

        if (this.timer) {
            totalTime = this.timer._totalTime;
        } else if (this.lapSystem && this.lapSystem.carLapData.has(this.playerCar.id)) {
            const carData = this.lapSystem.carLapData.get(this.playerCar.id);
            totalTime = carData.totalRaceTime;
        }

        const totalTimeFormatted = this._formatTime(totalTime);

        ctx.fillStyle = this.colors.text;
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 2;
        ctx.fillText(`TOTAL TIME: ${totalTimeFormatted}`, x, y);
        ctx.shadowBlur = 0;
    }

    /**
     * Calculate player position relative to other cars
     * @param {Car} playerCar - The player's car
     * @returns {number} Position (1 = first, 2 = second, etc.)
     */
    calculatePosition(playerCar) {
        if (this.allCars.length === 0) return 1;

        // Create array of cars with their progress data
        const carsWithProgress = this.allCars.map(car => {
            let progress = 0;

            if (this.lapSystem && this.lapSystem.carLapData.has(car.id)) {
                const carData = this.lapSystem.carLapData.get(car.id);
                progress = (carData.currentLap || 0) * 1000 + (carData.currentCheckpoint || 0);
            }

            return { car, progress };
        });

        // Sort by progress (higher is better)
        carsWithProgress.sort((a, b) => b.progress - a.progress);

        // Find player position
        const playerIndex = carsWithProgress.findIndex(c => c.car.id === playerCar.id);
        return playerIndex >= 0 ? playerIndex + 1 : 1;
    }

    /**
     * Calculate gear based on speed
     * @param {number} speed - Speed in units per second
     * @returns {number} Gear number (1-6)
     */
    _calculateGear(speed) {
        // Simple gear calculation based on speed
        if (speed < 50) return 1;
        if (speed < 100) return 2;
        if (speed < 150) return 3;
        if (speed < 200) return 4;
        if (speed < 250) return 5;
        return 6;
    }

    /**
     * Format time in milliseconds to MM:SS.mmm format
     * @param {number} timeMs - Time in milliseconds
     * @returns {string} Formatted time string
     */
    _formatTime(timeMs) {
        if (timeMs === 0 || timeMs === Infinity) return '00:00.000';

        const minutes = Math.floor(timeMs / 60000);
        const seconds = Math.floor((timeMs % 60000) / 1000);
        const milliseconds = Math.floor((timeMs % 1000));

        const minStr = minutes.toString().padStart(2, '0');
        const secStr = seconds.toString().padStart(2, '0');
        const msStr = milliseconds.toString().padStart(3, '0');

        return `${minStr}:${secStr}.${msStr}`;
    }

    /**
     * Resize HUD for new canvas size
     * @param {number} width - New canvas width
     * @param {number} height - New canvas height
     */
    resize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
    }
}