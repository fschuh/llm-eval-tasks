/**
 * HUD - Renders the heads-up display showing race information
 */
export class HUD {
    /**
     * @param {number} canvasWidth - Canvas width
     * @param {number} canvasHeight - Canvas height
     */
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        
        // Styling
        this.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        this.smallFont = '14px "Segoe UI", Arial, sans-serif';
        this.textColor = '#ffffff';
        this.shadowColor = 'rgba(0, 0, 0, 0.7)';
    }

    /**
     * Render the HUD
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} gameState - Current game state
     */
    render(ctx, gameState) {
        const { player, cars, raceTime, totalLaps, gameState: state } = gameState;
        
        // Draw position (top-left)
        this.drawPosition(ctx, player.position, cars.length);
        
        // Draw lap counter (top-right)
        this.drawLapCounter(ctx, Math.min(player.currentLap + 1, totalLaps), totalLaps);
        
        // Draw race time (bottom-left)
        this.drawRaceTime(ctx, raceTime);
        
        // Draw speed (bottom-right)
        this.drawSpeed(ctx, player.getSpeed());
        
        // Draw mini leaderboard (left side)
        this.drawLeaderboard(ctx, cars, player.id);
        
        // Draw lap progress bar (top center)
        this.drawLapProgress(ctx, gameState.lapProgress || 0);
    }

    /**
     * Draw position indicator
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} position - Current position
     * @param {number} total - Total cars
     */
    drawPosition(ctx, position, total) {
        const x = 20;
        const y = 25;
        
        ctx.save();
        
        // Background
        ctx.fillStyle = this.shadowColor;
        this.roundRect(ctx, x - 5, y - 20, 120, 35, 5);
        ctx.fill();
        
        // Position text
        ctx.font = this.font;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const suffix = this.getOrdinalSuffix(position);
        ctx.fillText(`Position: ${position}${suffix}/${total}`, x, y);
        
        ctx.restore();
    }

    /**
     * Draw lap counter
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} current - Current lap
     * @param {number} total - Total laps
     */
    drawLapCounter(ctx, current, total) {
        const x = this.width - 20;
        const y = 25;
        
        ctx.save();
        
        // Background
        ctx.fillStyle = this.shadowColor;
        this.roundRect(ctx, x - 115, y - 20, 120, 35, 5);
        ctx.fill();
        
        ctx.font = this.font;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Lap: ${current}/${total}`, x, y);
        
        ctx.restore();
    }

    /**
     * Draw race time
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} time - Race time in seconds
     */
    drawRaceTime(ctx, time) {
        const x = 20;
        const y = this.height - 20;
        
        ctx.save();
        
        // Background
        ctx.fillStyle = this.shadowColor;
        this.roundRect(ctx, x - 5, y - 20, 130, 35, 5);
        ctx.fill();
        
        ctx.font = this.font;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Time: ${this.formatTime(time)}`, x, y);
        
        ctx.restore();
    }

    /**
     * Draw speed indicator
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} speed - Current speed
     */
    drawSpeed(ctx, speed) {
        const x = this.width - 20;
        const y = this.height - 20;
        
        // Convert to km/h (arbitrary scaling)
        const kmh = Math.round(speed * 0.72);
        
        ctx.save();
        
        // Background
        ctx.fillStyle = this.shadowColor;
        this.roundRect(ctx, x - 110, y - 20, 115, 35, 5);
        ctx.fill();
        
        ctx.font = this.font;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${kmh} km/h`, x, y);
        
        ctx.restore();
    }

    /**
     * Draw mini leaderboard
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array<Car>} cars - All cars sorted by position
     * @param {number} playerId - Player's car ID
     */
    drawLeaderboard(ctx, cars, playerId) {
        const x = 20;
        const y = 70;
        const lineHeight = 22;
        
        ctx.save();
        
        // Background
        ctx.fillStyle = this.shadowColor;
        this.roundRect(ctx, x - 5, y - 5, 80, cars.length * lineHeight + 10, 5);
        ctx.fill();
        
        ctx.font = this.smallFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Sort cars by position
        const sorted = [...cars].sort((a, b) => a.position - b.position);
        
        for (let i = 0; i < sorted.length; i++) {
            const car = sorted[i];
            const isPlayer = car.id === playerId;
            
            // Highlight player
            if (isPlayer) {
                ctx.fillStyle = '#ffdd00';
            } else {
                ctx.fillStyle = this.textColor;
            }
            
            const suffix = this.getOrdinalSuffix(i + 1);
            const text = `${i + 1}${suffix} ${isPlayer ? 'YOU' : 'AI'}`;
            ctx.fillText(text, x, y + i * lineHeight);
        }
        
        ctx.restore();
    }

    /**
     * Draw lap progress bar
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} progress - Progress through lap (0-1)
     */
    drawLapProgress(ctx, progress) {
        const barWidth = 150;
        const barHeight = 8;
        const x = (this.width - barWidth) / 2;
        const y = 10;
        
        ctx.save();
        
        // Background
        ctx.fillStyle = this.shadowColor;
        this.roundRect(ctx, x - 5, y - 3, barWidth + 10, barHeight + 6, 3);
        ctx.fill();
        
        // Track background
        ctx.fillStyle = '#444444';
        this.roundRect(ctx, x, y, barWidth, barHeight, 2);
        ctx.fill();
        
        // Progress fill
        const fillWidth = barWidth * Math.min(1, progress);
        ctx.fillStyle = '#00dd00';
        this.roundRect(ctx, x, y, fillWidth, barHeight, 2);
        ctx.fill();
        
        // Progress text
        ctx.font = '10px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(progress * 100)}%`, this.width / 2, y + barHeight / 2);
        
        ctx.restore();
    }

    /**
     * Format time as MM:SS.ms
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    /**
     * Get ordinal suffix for a number
     * @param {number} n - Number
     * @returns {string} Ordinal suffix
     */
    getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return (s[(v - 20) % 10] || s[v] || s[0]);
    }

    /**
     * Draw rounded rectangle
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} w - Width
     * @param {number} h - Height
     * @param {number} r - Corner radius
     */
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}