import { TimeManager } from '../core/TimeManager.js';
import { COLORS } from '../config/GameConfig.js';

/**
 * HUDState - State container for HUD information
 */
export class HUDState {
    constructor() {
        this.lap = { current: 0, total: 3 };
        this.time = { current: 0, lap: 0, best: Infinity };
        this.position = { current: 1, total: 4 };
        this.speed = 0;
        this.raceStatus = 'waiting'; // waiting, countdown, racing, finished
        this.countdown = 3;
        this.lapTimes = [];
        this.results = null;
    }
}

/**
 * HUDRenderer - Races the heads-up display
 */
export class HUDRenderer {
    /**
     * Create a new HUD renderer
     * @param {HTMLCanvasElement} canvas - Canvas element
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
    }

    /**
     * Resize the HUD renderer
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
    }

    /**
     * Render the HUD
     * @param {HUDState} state - HUD state
     */
    render(state) {
        this.ctx.save();
        
        // Reset transform for screen-space rendering
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Render based on race status
        switch (state.raceStatus) {
            case 'countdown':
                this.renderCountdown(state.countdown);
                break;
            case 'racing':
                this.renderRacingHUD(state);
                break;
            case 'finished':
                this.renderRacingHUD(state);
                this.renderResults(state.results);
                break;
            default:
                this.renderWaiting();
        }
        
        this.ctx.restore();
    }

    /**
     * Render waiting state
     */
    renderWaiting() {
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = 'bold 30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Press SPACE to Start', this.width / 2, this.height / 2);
    }

    /**
     * Render countdown
     * @param {number} value - Countdown value
     */
    renderCountdown(value) {
        this.ctx.fillStyle = COLORS.COUNTDOWN;
        this.ctx.font = 'bold 120px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const text = value > 0 ? value.toString() : 'GO!';
        this.ctx.fillText(text, this.width / 2, this.height / 2);
        
        this.ctx.textBaseline = 'alphabetic';
    }

    /**
     * Render racing HUD
     * @param {HUDState} state - HUD state
     */
    renderRacingHUD(state) {
        // Top bar background
        this.ctx.fillStyle = COLORS.HUD_BG;
        this.ctx.fillRect(0, 0, this.width, 50);
        
        // Lap info (top left)
        this.renderLapInfo(state.lap, 20, 35);
        
        // Timer (top center)
        this.renderTimer(state.time, this.width / 2, 35);
        
        // Position (top right)
        this.renderPosition(state.position, this.width - 20, 35);
        
        // Speedometer (bottom left)
        this.renderSpeedometer(state.speed, 20, this.height - 20);
        
        // Lap times (bottom right)
        if (state.lapTimes.length > 0) {
            this.renderLapTimes(state.lapTimes, this.width - 20, this.height - 100);
        }
    }

    /**
     * Render lap info
     * @param {Object} lap - Lap data
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderLapInfo(lap, x, y) {
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`LAP: ${lap.current}/${lap.total}`, x, y);
    }

    /**
     * Render timer
     * @param {Object} time - Time data
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderTimer(time, x, y) {
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = 'bold 28px Arial';
        this.ctx.textAlign = 'center';
        
        const currentTime = TimeManager.formatTime(time.current);
        this.ctx.fillText(currentTime, x, y);
        
        // Lap time below
        this.ctx.font = '16px Arial';
        const lapTime = TimeManager.formatLapTime(time.lap);
        const bestTime = time.best < Infinity ? TimeManager.formatLapTime(time.best) : '--.--';
        this.ctx.fillText(`Lap: ${lapTime}  Best: ${bestTime}`, x, y + 20);
    }

    /**
     * Render position
     * @param {Object} position - Position data
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderPosition(position, x, y) {
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`POS: ${position.current}/${position.total}`, x, y);
    }

    /**
     * Render speedometer
     * @param {number} speed - Speed in km/h
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderSpeedometer(speed, x, y) {
        // Background bar
        const barWidth = 200;
        const barHeight = 20;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(x, y - barHeight, barWidth, barHeight);
        
        // Speed bar
        const maxSpeed = 200;
        const speedPercent = Math.min(speed / maxSpeed, 1);
        const fillWidth = barWidth * speedPercent;
        
        // Color based on speed
        if (speedPercent > 0.8) {
            this.ctx.fillStyle = '#FF0000';
        } else if (speedPercent > 0.5) {
            this.ctx.fillStyle = '#FFFF00';
        } else {
            this.ctx.fillStyle = '#00FF00';
        }
        
        this.ctx.fillRect(x, y - barHeight, fillWidth, barHeight);
        
        // Border
        this.ctx.strokeStyle = COLORS.TEXT;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y - barHeight, barWidth, barHeight);
        
        // Speed text
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${Math.round(speed)} km/h`, x, y - 30);
    }

    /**
     * Render lap times
     * @param {number[]} lapTimes - Array of lap times
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    renderLapTimes(lapTimes, x, y) {
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'right';
        
        this.ctx.fillText('Lap Times:', x, y);
        
        // Show last 3 lap times
        const recentTimes = lapTimes.slice(-3);
        for (let i = 0; i < recentTimes.length; i++) {
            const lapNum = lapTimes.length - recentTimes.length + i + 1;
            const timeStr = TimeManager.formatLapTime(recentTimes[i]);
            this.ctx.fillText(`L${lapNum}: ${timeStr}`, x, y + 20 + i * 18);
        }
    }

    /**
     * Render race results
     * @param {Object[]} results - Race results
     */
    renderResults(results) {
        if (!results || results.length === 0) return;
        
        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Results panel
        const panelWidth = 400;
        const panelHeight = 300;
        const panelX = (this.width - panelWidth) / 2;
        const panelY = (this.height - panelHeight) / 2;
        
        this.ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        
        this.ctx.strokeStyle = COLORS.TEXT;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Title
        this.ctx.fillStyle = COLORS.FINISHED;
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('RACE FINISHED!', this.width / 2, panelY + 40);
        
        // Results list
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = '18px Arial';
        this.ctx.textAlign = 'left';
        
        const startY = panelY + 80;
        const lineHeight = 30;
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const y = startY + i * lineHeight;
            
            // Position
            this.ctx.fillText(`${result.finalPosition}.`, panelX + 30, y);
            
            // Car name
            const name = result.isPlayer ? 'Player' : `AI ${result.carId}`;
            this.ctx.fillText(name, panelX + 70, y);
            
            // Time
            this.ctx.textAlign = 'right';
            const timeStr = TimeManager.formatTime(result.finishTime);
            this.ctx.fillText(timeStr, panelX + panelWidth - 30, y);
            this.ctx.textAlign = 'left';
        }
        
        // Restart instruction
        this.ctx.fillStyle = COLORS.COUNTDOWN;
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Press SPACE to restart', this.width / 2, panelY + panelHeight - 30);
    }

    /**
     * Clear the HUD area
     */
    clear() {
        // HUD is rendered on top, no need to clear separately
    }
}
