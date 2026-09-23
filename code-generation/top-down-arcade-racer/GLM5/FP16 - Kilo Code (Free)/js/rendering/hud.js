import { CONFIG } from '../config.js';

/**
 * HUD (Heads-Up Display) System
 * Displays race information: lap, time, position
 */
export class HUD {
    constructor(ctx) {
        this.ctx = ctx;
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        
        // Fonts and colors
        this.fontFamily = 'Arial, sans-serif';
        this.colors = {
            background: 'rgba(0, 0, 0, 0.7)',
            text: '#ffffff',
            accent: '#f1c40f',
            position: {
                1: '#ffd700', // Gold
                2: '#c0c0c0', // Silver
                3: '#cd7f32', // Bronze
                4: '#ffffff'  // White
            }
        };
    }
    
    /**
     * Render the HUD
     */
    render(raceTime, playerCar, positions, lapDetection) {
        const playerData = lapDetection.getCarData(playerCar);
        const playerPosition = positions.get(playerCar) || 1;
        
        // Draw HUD background panels
        this.drawBackgroundPanels();
        
        // Draw race time
        this.drawRaceTime(raceTime);
        
        // Draw lap counter
        this.drawLapCounter(playerData);
        
        // Draw position
        this.drawPosition(playerPosition);
        
        // Draw speed indicator
        this.drawSpeed(playerCar);
        
        // Draw minimap
        this.drawMinimap(playerCar, positions);
        
        // Draw finish message if race complete
        if (playerData && playerData.finished) {
            this.drawFinishMessage(playerPosition, playerData.finishTime);
        }
    }
    
    /**
     * Draw HUD background panels
     */
    drawBackgroundPanels() {
        this.ctx.fillStyle = this.colors.background;
        
        // Top left panel (time and lap)
        this.ctx.fillRect(10, 10, 200, 80);
        
        // Top right panel (position)
        this.ctx.fillRect(this.width - 110, 10, 100, 50);
        
        // Bottom center panel (speed)
        this.ctx.fillRect(this.width / 2 - 75, this.height - 60, 150, 50);
    }
    
    /**
     * Draw race time
     */
    drawRaceTime(time) {
        const formatted = this.formatTime(time);
        
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = `bold 24px ${this.fontFamily}`;
        this.ctx.textAlign = 'left';
        this.ctx.fillText('TIME', 20, 35);
        
        this.ctx.font = `bold 28px ${this.fontFamily}`;
        this.ctx.fillText(formatted, 20, 70);
    }
    
    /**
     * Draw lap counter
     */
    drawLapCounter(playerData) {
        if (!playerData) return;
        
        const currentLap = Math.min(playerData.lap + 1, CONFIG.TOTAL_LAPS);
        
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = `bold 18px ${this.fontFamily}`;
        this.ctx.textAlign = 'left';
        this.ctx.fillText('LAP', 120, 35);
        
        this.ctx.font = `bold 28px ${this.fontFamily}`;
        this.ctx.fillStyle = this.colors.accent;
        this.ctx.fillText(`${currentLap}/${CONFIG.TOTAL_LAPS}`, 120, 70);
    }
    
    /**
     * Draw position
     */
    drawPosition(position) {
        const suffix = this.getPositionSuffix(position);
        const color = this.colors.position[position] || this.colors.text;
        
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = `bold 16px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('POSITION', this.width - 60, 30);
        
        this.ctx.font = `bold 32px ${this.fontFamily}`;
        this.ctx.fillStyle = color;
        this.ctx.fillText(`${position}${suffix}`, this.width - 60, 55);
    }
    
    /**
     * Draw speed indicator
     */
    drawSpeed(car) {
        const speed = Math.round(car.getSpeed());
        
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = `bold 14px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SPEED', this.width / 2, this.height - 40);
        
        this.ctx.font = `bold 24px ${this.fontFamily}`;
        this.ctx.fillStyle = speed > 250 ? '#e74c3c' : this.colors.text;
        this.ctx.fillText(`${speed} km/h`, this.width / 2, this.height - 18);
    }
    
    /**
     * Draw minimap
     */
    drawMinimap(playerCar, positions) {
        const mapSize = 120;
        const mapX = this.width - mapSize - 15;
        const mapY = this.height - mapSize - 15;
        const scale = mapSize / Math.max(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(mapX - 5, mapY - 5, mapSize + 10, mapSize + 10);
        
        // Draw track outline (simplified)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        
        // Simple oval for minimap
        const cx = mapX + mapSize / 2;
        const cy = mapY + mapSize / 2;
        this.ctx.ellipse(cx, cy, mapSize * 0.4, mapSize * 0.3, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw car positions
        for (const [car, position] of positions) {
            const x = mapX + car.position.x * scale;
            const y = mapY + car.position.y * scale;
            
            this.ctx.fillStyle = car.color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Highlight player
            if (car === playerCar) {
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
        }
    }
    
    /**
     * Draw finish message
     */
    drawFinishMessage(position, finishTime) {
        // Overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Message box
        const boxWidth = 400;
        const boxHeight = 200;
        const boxX = (this.width - boxWidth) / 2;
        const boxY = (this.height - boxHeight) / 2;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        this.ctx.strokeStyle = this.colors.accent;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        // Title
        this.ctx.fillStyle = this.colors.accent;
        this.ctx.font = `bold 36px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('RACE COMPLETE!', this.width / 2, boxY + 50);
        
        // Position
        const suffix = this.getPositionSuffix(position);
        const color = this.colors.position[position] || this.colors.text;
        this.ctx.fillStyle = color;
        this.ctx.font = `bold 48px ${this.fontFamily}`;
        this.ctx.fillText(`${position}${suffix} PLACE`, this.width / 2, boxY + 110);
        
        // Time
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = `bold 24px ${this.fontFamily}`;
        this.ctx.fillText(`Time: ${this.formatTime(finishTime)}`, this.width / 2, boxY + 150);
        
        // Restart hint
        this.ctx.font = `16px ${this.fontFamily}`;
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.fillText('Press R to restart', this.width / 2, boxY + 185);
    }
    
    /**
     * Format time as MM:SS.ms
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
    
    /**
     * Get position suffix (1st, 2nd, 3rd, 4th)
     */
    getPositionSuffix(position) {
        switch (position) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    }
    
    /**
     * Draw countdown before race start
     */
    drawCountdown(count) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `bold 120px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        if (count > 0) {
            this.ctx.fillText(count.toString(), this.width / 2, this.height / 2);
        } else {
            this.ctx.fillStyle = '#2ecc71';
            this.ctx.fillText('GO!', this.width / 2, this.height / 2);
        }
    }
}
