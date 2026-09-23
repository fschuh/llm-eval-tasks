import { Vector2 } from '../math/Vector2.js';

/**
 * Heads-up display system for racing game
 * Displays lap data, timing, position, and speed information
 */
export class HUD {
    /**
     * @param {Object} options - HUD configuration options
     */
    constructor(options = {}) {
        // Configuration
        this.config = {
            fontSize: options.fontSize ?? 16,
            fontFamily: options.fontFamily ?? 'Arial, sans-serif',
            backgroundColor: options.backgroundColor ?? 'rgba(0, 0, 0, 0.5)',
            borderColor: options.borderColor ?? 'rgba(255, 255, 255, 0.3)',
            textColor: options.textColor ?? '#FFFFFF',
            playerColor: options.playerColor ?? '#00FF00',
            carColors: options.carColors ?? ['#FF0000', '#0000FF', '#FFFF00', '#FF00FF'],
            positionColors: ['#FFD700', '#C0C0C0', '#CD7F32', '#FFFFFF'], // Gold, Silver, Bronze, White
            showSpeedometer: options.showSpeedometer ?? true,
            showPosition: options.showPosition ?? true,
            showLapInfo: options.showLapInfo ?? true,
            showTotalTime: options.showTotalTime ?? true,
            speedUnit: options.speedUnit ?? 'km/h',
            speedMultiplier: options.speedMultiplier ?? 3.6 // Convert m/s to km/h
        };

        // Data storage
        this.playerData = null;
        this.carsData = [];
        this.totalTime = 0;
        this.position = 1;
        this.speed = 0;
        this.canvasWidth = window.innerWidth;
        this.canvasHeight = window.innerHeight;
    }

    /**
     * Update HUD data from game state
     * @param {LapSystem} lapSystem - Lap system with timing data
     * @param {Array<Car>} cars - Array of all cars
     * @param {number} totalTime - Total race time in seconds
     */
    update(lapSystem, cars, totalTime) {
        this.totalTime = totalTime;
        this.carsData = [];

        // Collect data from all cars
        for (const car of cars) {
            const lapData = lapSystem.getCarLapData(car);
            if (!lapData) continue;

            const carData = {
                car: car,
                lap: lapData.lap,
                lapTime: lapData.currentLapTime,
                bestLap: lapData.bestLapTime,
                totalDistance: lapData.totalDistance,
                isPlayer: car === lapSystem.playerCar
            };

            this.carsData.push(carData);
        }

        // Find player car
        this.playerData = this.carsData.find(data => data.isPlayer);

        // Calculate position based on lap progress
        this.position = this.calculatePosition();

        // Get current speed (convert to display units)
        if (this.playerData && this.playerData.car) {
            this.speed = this.playerData.car.speed * this.config.speedMultiplier;
        }
    }

    /**
     * Calculate car position based on lap progress
     * @returns {number} Position (1 = leader)
     */
    calculatePosition() {
        if (this.carsData.length === 0) return 1;

        // Sort cars by lap progress (lap number, then checkpoint, then distance)
        const sortedCars = [...this.carsData].sort((a, b) => {
            // Compare lap numbers first
            if (a.lap !== b.lap) {
                return b.lap - a.lap;
            }

            // Compare checkpoint indices
            const aCheckpoint = a.car.checkpointIndex || 0;
            const bCheckpoint = b.car.checkpointIndex || 0;
            if (aCheckpoint !== bCheckpoint) {
                return bCheckpoint - aCheckpoint;
            }

            // Compare total distance
            return b.totalDistance - a.totalDistance;
        });

        // Find player position
        const playerIndex = sortedCars.findIndex(data => data.isPlayer);
        return playerIndex !== -1 ? playerIndex + 1 : this.carsData.length;
    }

    /**
     * Draw HUD to canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    draw(ctx) {
        const canvas = ctx.canvas;
        const padding = 10;
        const fontSize = this.config.fontSize;
        const fontFamily = this.config.fontFamily;

        ctx.save();
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';

        // Draw player stats (top-left)
        if (this.playerData && this.config.showLapInfo) {
            this.drawPlayerStats(ctx, padding, padding);
        }

        // Draw total time (top-right)
        if (this.config.showTotalTime) {
            this.drawTotalTime(ctx, canvas.width - padding, padding);
        }

        // Draw position indicator (top-center)
        if (this.config.showPosition) {
            this.drawPosition(ctx, canvas.width / 2, padding);
        }

        // Draw speedometer (bottom-left)
        if (this.config.showSpeedometer) {
            this.drawSpeedometer(ctx, padding, canvas.height - padding);
        }

        // Draw car info panels (right side)
        this.drawCarPanels(ctx, canvas.width - 220, padding);

        ctx.restore();
    }

    /**
     * Draw player-specific stats
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    drawPlayerStats(ctx, x, y) {
        if (!this.playerData) return;

        const fontSize = this.config.fontSize;
        const lineHeight = fontSize + 4;
        const padding = 8;
        const width = 200;

        // Background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, width, lineHeight * 3 + padding * 2);

        // Border
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, width, lineHeight * 3 + padding * 2);

        // Player color indicator
        ctx.fillStyle = this.config.playerColor;
        ctx.fillRect(x + 5, y + 5, 12, 12);

        // Lap count
        ctx.fillStyle = this.config.textColor;
        ctx.fillText(`Lap: ${this.playerData.lap}/3`, x + 20, y);

        // Lap time
        const lapTimeStr = this.formatTime(this.playerData.lapTime);
        ctx.fillText(`Lap: ${lapTimeStr}`, x + 20, y + lineHeight);

        // Best lap
        const bestLapStr = this.playerData.bestLap !== null
            ? this.formatTime(this.playerData.bestLap)
            : '--:--.---';
        ctx.fillText(`Best: ${bestLapStr}`, x + 20, y + lineHeight * 2);
    }

    /**
     * Draw position indicator
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position (centered)
     * @param {number} y - Y position
     */
    drawPosition(ctx, x, y) {
        const fontSize = this.config.fontSize;
        const padding = 8;
        const width = 100;
        const height = 50;

        // Background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - width / 2 - padding, y - padding, width, height);

        // Border
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - width / 2 - padding, y - padding, width, height);

        // Position number
        const position = Math.min(this.position, 4);
        ctx.fillStyle = this.config.positionColors[position - 1] || this.config.textColor;
        ctx.font = `bold ${fontSize * 2}px ${this.config.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${this.position}`, x, y + height / 2);

        // "of N" text
        ctx.font = `${fontSize}px ${this.config.fontFamily}`;
        ctx.fillStyle = this.config.textColor;
        ctx.fillText(`of ${this.carsData.length}`, x, y + height / 2 + fontSize + 4);

        // Reset text alignment
        ctx.textAlign = 'left';
    }

    /**
     * Draw total time
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position (right-aligned)
     * @param {number} y - Y position
     */
    drawTotalTime(ctx, x, y) {
        const fontSize = this.config.fontSize;
        const padding = 8;
        const width = 120;

        // Background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - width + padding, y - padding, width, fontSize + padding * 2);

        // Border
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - width + padding, y - padding, width, fontSize + padding * 2);

        // Total time
        const totalTimeStr = this.formatTime(this.totalTime);
        ctx.fillStyle = this.config.textColor;
        ctx.textAlign = 'right';
        ctx.fillText(`Time: ${totalTimeStr}`, x, y);

        // Reset text alignment
        ctx.textAlign = 'left';
    }

    /**
     * Draw speedometer
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position (bottom-aligned)
     */
    drawSpeedometer(ctx, x, y) {
        const fontSize = this.config.fontSize;
        const padding = 8;
        const width = 150;
        const height = 60;

        // Background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - height - padding, width, height);

        // Border
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - height - padding, width, height);

        // Speed value
        ctx.fillStyle = this.config.textColor;
        ctx.font = `bold ${fontSize * 2}px ${this.config.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(this.speed)}`, x, y - height);

        // Speed unit
        ctx.font = `${fontSize}px ${this.config.fontFamily}`;
        ctx.fillText(this.config.speedUnit, x, y - height + fontSize + 4);

        // Reset text alignment
        ctx.textAlign = 'left';
    }

    /**
     * Draw car info panels on the right side
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    drawCarPanels(ctx, x, y) {
        const fontSize = this.config.fontSize;
        const lineHeight = fontSize + 4;
        const padding = 8;
        const width = 200;
        const panelHeight = 40;

        // Sort cars by position for display
        const sortedCars = [...this.carsData].sort((a, b) => {
            // Compare lap numbers first
            if (a.lap !== b.lap) {
                return b.lap - a.lap;
            }

            // Compare checkpoint indices
            const aCheckpoint = a.car.checkpointIndex || 0;
            const bCheckpoint = b.car.checkpointIndex || 0;
            if (aCheckpoint !== bCheckpoint) {
                return bCheckpoint - aCheckpoint;
            }

            // Compare total distance
            return b.totalDistance - a.totalDistance;
        });

        // Draw background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, width, sortedCars.length * panelHeight + padding * 2);

        // Border
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, width, sortedCars.length * panelHeight + padding * 2);

        // Draw each car's info
        sortedCars.forEach((carData, index) => {
            const carY = y + index * panelHeight;
            this.drawCarInfo(ctx, carData.car, index, x, carY, carData.isPlayer);
        });
    }

    /**
     * Draw individual car info
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Car} car - Car object
     * @param {number} index - Car index (0-based)
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {boolean} isPlayer - Whether this is the player car
     */
    drawCarInfo(ctx, car, index, x, y, isPlayer = false) {
        const fontSize = this.config.fontSize;
        const lineHeight = fontSize + 4;
        const padding = 8;
        const width = 200;

        // Get car data from stored data
        const carData = this.carsData.find(data => data.car === car);
        if (!carData) return;

        // Position indicator
        const position = index + 1;
        const positionColor = this.config.positionColors[Math.min(position - 1, 3)] || this.config.textColor;

        // Background for player
        if (isPlayer) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            ctx.fillRect(x, y, width, lineHeight * 2 + padding);
        }

        // Position number
        ctx.fillStyle = positionColor;
        ctx.font = `bold ${fontSize}px ${this.config.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${position}`, x + 5, y + 2);

        // Lap
        ctx.fillStyle = this.config.textColor;
        ctx.fillText(`Lap ${carData.lap}`, x + 25, y + 2);

        // Lap time
        const lapTimeStr = this.formatTime(carData.lapTime);
        ctx.fillText(lapTimeStr, x + 25, y + lineHeight);

        // Car color indicator
        const carColor = this.config.carColors[index % this.config.carColors.length];
        ctx.fillStyle = carColor;
        ctx.fillRect(x + width - 15, y + 4, 10, 10);
    }

    /**
     * Format time as MM:SS.mmm
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);

        const minsStr = minutes.toString().padStart(2, '0');
        const secsStr = secs.toString().padStart(2, '0');
        const msStr = ms.toString().padStart(3, '0');

        return `${minsStr}:${secsStr}.${msStr}`;
    }

    /**
     * Get car position as ordinal string
     * @param {number} position - Position number
     * @returns {string} Position with ordinal suffix
     */
    getPositionString(position) {
        const suffixes = ['th', 'st', 'nd', 'rd'];
        const value = position % 100;
        const suffix = suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0];
        return `${position}${suffix}`;
    }
    
    /**
     * Draw the HUD on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    draw(ctx) {
        if (!this.playerData) return;
        
        // Draw speedometer
        if (this.config.showSpeedometer) {
            this.drawSpeedometer(ctx);
        }
        
        // Draw position
        if (this.config.showPosition) {
            this.drawPosition(ctx);
        }
        
        // Draw lap info
        if (this.config.showLapInfo) {
            this.drawLapInfo(ctx);
        }
        
        // Draw total time
        if (this.config.showTotalTime) {
            this.drawTotalTime(ctx);
        }
        
        // Draw car positions
        this.drawCarPositions(ctx);
    }
    
    /**
     * Draw speedometer
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawSpeedometer(ctx) {
        const x = 20;
        const y = 20;
        const fontSize = this.config.fontSize;
        const padding = 10;
        
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, 150, 50);
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, 150, 50);
        
        ctx.fillStyle = this.config.textColor;
        ctx.font = `${fontSize}px ${this.config.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Speed: ${Math.floor(this.speed)} ${this.config.speedUnit}`, x, y);
    }
    
    /**
     * Draw position indicator
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawPosition(ctx) {
        const x = 20;
        const y = 80;
        const fontSize = this.config.fontSize;
        const padding = 10;
        
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, 120, 40);
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, 120, 40);
        
        ctx.fillStyle = this.config.positionColors[Math.min(this.position - 1, 3)] || this.config.textColor;
        ctx.font = `bold ${fontSize + 4}px ${this.config.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Position: ${this.position}`, x, y);
    }
    
    /**
     * Draw lap info
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawLapInfo(ctx) {
        const x = 20;
        const y = 130;
        const fontSize = this.config.fontSize;
        const padding = 10;
        
        if (!this.playerData) return;
        
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, 200, 70);
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, 200, 70);
        
        ctx.fillStyle = this.config.textColor;
        ctx.font = `${fontSize}px ${this.config.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Lap: ${this.playerData.lap}`, x, y);
        ctx.fillText(`Lap Time: ${this.formatTime(this.playerData.lapTime)}`, x, y + fontSize + 4);
        if (this.playerData.bestLap) {
            ctx.fillText(`Best Lap: ${this.formatTime(this.playerData.bestLap)}`, x, y + (fontSize + 4) * 2);
        }
    }
    
    /**
     * Draw total time
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawTotalTime(ctx) {
        const x = 20;
        const y = 210;
        const fontSize = this.config.fontSize;
        const padding = 10;
        
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, 180, 40);
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, 180, 40);
        
        ctx.fillStyle = this.config.textColor;
        ctx.font = `${fontSize}px ${this.config.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Time: ${this.formatTime(this.totalTime)}`, x, y);
    }
    
    /**
     * Draw car positions list
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawCarPositions(ctx) {
        const x = this.canvasWidth - 230;
        const y = 20;
        const fontSize = this.config.fontSize;
        const lineHeight = fontSize + 4;
        const padding = 8;
        const width = 200;
        const panelHeight = 40;
        
        // Sort cars by position for display
        const sortedCars = [...this.carsData].sort((a, b) => {
            // Compare lap numbers first
            if (a.lap !== b.lap) {
                return b.lap - a.lap;
            }
            
            // Compare checkpoint indices
            const aCheckpoint = a.car.checkpointIndex || 0;
            const bCheckpoint = b.car.checkpointIndex || 0;
            if (aCheckpoint !== bCheckpoint) {
                return bCheckpoint - aCheckpoint;
            }
            
            // Compare total distance
            return b.totalDistance - a.totalDistance;
        });
        
        // Draw background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(x - padding, y - padding, width, sortedCars.length * panelHeight + padding * 2);
        
        // Border
        ctx.strokeStyle = this.config.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - padding, y - padding, width, sortedCars.length * panelHeight + padding * 2);
        
        // Draw each car's info
        sortedCars.forEach((carData, index) => {
            const carY = y + index * panelHeight;
            this.drawCarInfo(ctx, carData.car, index, x, carY, carData.isPlayer);
        });
    }
}
