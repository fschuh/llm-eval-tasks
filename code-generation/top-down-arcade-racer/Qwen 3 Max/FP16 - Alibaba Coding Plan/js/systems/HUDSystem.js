import { GameConfig } from '../core/Constants.js';
import { RacePhase } from '../core/Constants.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.hudHeight = 120; // Increased height for more information
        this.lapNotification = null;
        this.lapNotificationTimer = 0;
        this.positionChangeNotification = null;
        this.positionChangeTimer = 0;
        this.collisionNotification = null;
        this.collisionNotificationTimer = 0;
        this.lastPosition = 1;
        this.notificationQueue = [];
    }
    
    showLapNotification(message, duration = 2500) {
        this.lapNotification = message;
        this.lapNotificationTimer = duration;
    }
    
    showPositionChangeNotification(oldPos, newPos, duration = 2000) {
        const direction = oldPos > newPos ? '↑' : '↓';
        const positionText = newPos === 1 ? '1st' :
                           newPos === 2 ? '2nd' :
                           newPos === 3 ? '3rd' : `${newPos}th`;
        this.positionChangeNotification = `Position ${direction} ${positionText}`;
        this.positionChangeTimer = duration;
    }
    
    showCollisionNotification(duration = 1500) {
        this.collisionNotification = 'COLLISION!';
        this.collisionNotificationTimer = duration;
    }
    
    updateNotifications(dt) {
        if (this.lapNotificationTimer > 0) {
            this.lapNotificationTimer -= dt * 1000;
            if (this.lapNotificationTimer <= 0) {
                this.lapNotification = null;
            }
        }
        
        if (this.positionChangeTimer > 0) {
            this.positionChangeTimer -= dt * 1000;
            if (this.positionChangeTimer <= 0) {
                this.positionChangeNotification = null;
            }
        }
        
        if (this.collisionNotificationTimer > 0) {
            this.collisionNotificationTimer -= dt * 1000;
            if (this.collisionNotificationTimer <= 0) {
                this.collisionNotification = null;
            }
        }
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    renderTrack(track) {
        track.render(this.ctx);
    }
    
    renderCar(car, isPlayer = false) {
        const corners = car.getCorners();
        
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            this.ctx.lineTo(corners[i].x, corners[i].y);
        }
        this.ctx.closePath();
        
        // Determine base color
        let baseColor;
        if (isPlayer) {
            baseColor = '#4CAF50'; // Green for player
        } else {
            baseColor = '#2196F3'; // Blue for AI
        }
        
        // Apply collision effect if active
        if (car.collisionEffectTimer > 0) {
            // Make car flash red during collision
            this.ctx.fillStyle = '#FF5252'; // Red for collision
        } else {
            this.ctx.fillStyle = baseColor;
        }
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw forward direction indicator
        const forward = car.getForwardVector();
        const frontCenter = car.position.add(forward.multiply(car.length / 2));
        this.ctx.beginPath();
        this.ctx.moveTo(car.position.x, car.position.y);
        this.ctx.lineTo(frontCenter.x, frontCenter.y);
        this.ctx.strokeStyle = '#FFEB3B';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    formatTime(time) {
        if (time === null || time === undefined) {
            return '--:--.---';
        }
        const minutes = Math.floor(time / 60);
        const seconds = (time % 60).toFixed(3);
        return `${minutes.toString().padStart(2, '0')}:${seconds.padStart(6, '0')}`;
    }
    
    renderHUD(gameState, playerCar, lapDetector, raceManager) {
        const ctx = this.ctx;
        ctx.save();
        
        // Main HUD background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, this.canvas.width, this.hudHeight);
        
        // Enhanced font settings
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Left section - Lap and Time Information
        this.renderLapAndTimeInfo(ctx, gameState, lapDetector, raceManager);
        
        // Right section - Position and Speed
        this.renderPositionAndSpeed(ctx, gameState, playerCar, lapDetector, raceManager);
        
        // Middle section - Current Lap Time
        this.renderCurrentLapTime(ctx, lapDetector);
        
        ctx.restore();
        
        // Render notifications
        this.renderNotifications(ctx);
        
        // Render race finished screen
        if (gameState.racePhase === RacePhase.FINISHED) {
            this.renderRaceFinishedScreen(ctx, raceManager, lapDetector);
        }
        
        // Update position tracking for change detection
        const currentPosition = raceManager.getFinishPosition('player') || this.calculateCurrentPosition(lapDetector, raceManager);
        if (currentPosition !== this.lastPosition && this.lastPosition !== 0) {
            this.showPositionChangeNotification(this.lastPosition, currentPosition);
        }
        this.lastPosition = currentPosition;
    }
    
    renderLapAndTimeInfo(ctx, gameState, lapDetector, raceManager) {
        // Current lap display with enhanced styling
        const currentPlayerLap = lapDetector.getCurrentLap('player');
        const displayLap = currentPlayerLap === 0 ? 1 : currentPlayerLap;
        ctx.fillStyle = '#4CAF50'; // Green for lap info
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`LAP ${displayLap}/${GameConfig.TOTAL_LAPS}`, 20, 25);
        
        // Race time (total elapsed time)
        let raceTime = 0;
        if (lapDetector.hasStartedRace('player')) {
            raceTime = lapDetector.getTotalRaceTime('player');
        } else if (gameState.racePhase === RacePhase.RACING) {
            raceTime = gameState.raceTime;
        }
        
        ctx.fillStyle = '#2196F3'; // Blue for race time
        ctx.font = '16px Arial';
        ctx.fillText(`RACE TIME: ${this.formatTime(raceTime)}`, 20, 55);
        
        // Best lap time
        const bestLap = lapDetector.getBestLapTime('player');
        if (bestLap !== null) {
            ctx.fillStyle = bestLap <= 30 ? '#4CAF50' : // Green for good times (<30s)
                          bestLap <= 45 ? '#FFC107' : // Yellow for average
                          '#FF5252'; // Red for slow times
            ctx.font = '16px Arial';
            ctx.fillText(`BEST LAP: ${this.formatTime(bestLap)}`, 20, 85);
        }
    }
    
    renderCurrentLapTime(ctx, lapDetector) {
        // Current lap time (time since last lap or race start)
        if (lapDetector.hasStartedRace('player')) {
            const raceTime = lapDetector.getTotalRaceTime('player');
            const lapTimes = lapDetector.getLapTimes('player');
            const completedLapsTime = lapTimes.reduce((sum, time) => sum + time, 0);
            const currentLapTime = raceTime - completedLapsTime;
            
            ctx.fillStyle = '#FFEB3B'; // Yellow for current lap
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`CURRENT LAP: ${this.formatTime(currentLapTime)}`,
                        this.canvas.width / 2, 30);
        }
    }
    
    renderPositionAndSpeed(ctx, gameState, playerCar, lapDetector, raceManager) {
        // Position with enhanced styling
        const position = raceManager.getFinishPosition('player') || this.calculateCurrentPosition(lapDetector, raceManager);
        const positionSuffix = this.getPositionSuffix(position);
        ctx.fillStyle = position === 1 ? '#FFD700' : // Gold for 1st
                      position === 2 ? '#C0C0C0' : // Silver for 2nd
                      position === 3 ? '#CD7F32' : // Bronze for 3rd
                      '#FFFFFF'; // White for 4th
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`POSITION: ${position}${positionSuffix}/4`, this.canvas.width - 20, 25);
        
        // Speed
        const speed = playerCar ? playerCar.velocity.length() : 0;
        ctx.fillStyle = '#FF9800'; // Orange for speed
        ctx.font = '16px Arial';
        ctx.fillText(`SPEED: ${Math.round(speed)} px/s`, this.canvas.width - 20, 55);
        
        // Performance info
        const fps = Math.round(1 / (gameState.currentTime - gameState.lastFrameTime)) || 60;
        ctx.fillStyle = '#9E9E9E'; // Gray for performance info
        ctx.font = '14px Arial';
        ctx.fillText(`COLL: ${gameState.collisionCount} | FPS: ${fps}`, this.canvas.width - 20, 85);
    }
    
    renderNotifications(ctx) {
        let notificationY = this.canvas.height / 2 - 60;
        const notificationHeight = 40;
        const notificationWidth = 300;
        const centerX = this.canvas.width / 2;
        
        // Render lap notification
        if (this.lapNotification && this.lapNotificationTimer > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(centerX - notificationWidth/2, notificationY, notificationWidth, notificationHeight);
            ctx.fillStyle = '#4CAF50';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.lapNotification, centerX, notificationY + notificationHeight/2);
            ctx.restore();
            notificationY += notificationHeight + 10;
        }
        
        // Render position change notification
        if (this.positionChangeNotification && this.positionChangeTimer > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(centerX - notificationWidth/2, notificationY, notificationWidth, notificationHeight);
            ctx.fillStyle = this.positionChangeNotification.includes('↑') ? '#4CAF50' : '#FF5252';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.positionChangeNotification, centerX, notificationY + notificationHeight/2);
            ctx.restore();
            notificationY += notificationHeight + 10;
        }
        
        // Render collision notification
        if (this.collisionNotification && this.collisionNotificationTimer > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(centerX - notificationWidth/2, notificationY, notificationWidth, notificationHeight);
            ctx.fillStyle = '#FF5252';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.collisionNotification, centerX, notificationY + notificationHeight/2);
            ctx.restore();
        }
    }
    
    renderRaceFinishedScreen(ctx, raceManager, lapDetector) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(this.canvas.width/2 - 250, this.canvas.height/2 - 120, 500, 240);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('RACE FINISHED!', this.canvas.width/2, this.canvas.height/2 - 90);
        
        // Final position
        const finalPosition = raceManager.getFinishPosition('player') || 1;
        const finalSuffix = this.getPositionSuffix(finalPosition);
        const positionColor = finalPosition === 1 ? '#FFD700' :
                            finalPosition === 2 ? '#C0C0C0' :
                            finalPosition === 3 ? '#CD7F32' : '#FFFFFF';
        ctx.fillStyle = positionColor;
        ctx.font = '24px Arial';
        ctx.fillText(`Final Position: ${finalPosition}${finalSuffix}/4`, this.canvas.width/2, this.canvas.height/2 - 50);
        
        // Total race time
        const totalTime = lapDetector.getTotalRaceTime('player');
        ctx.fillStyle = '#2196F3';
        ctx.font = '18px Arial';
        ctx.fillText(`Total Time: ${this.formatTime(totalTime)}`, this.canvas.width/2, this.canvas.height/2 - 20);
        
        // Best lap time
        const bestLap = lapDetector.getBestLapTime('player');
        if (bestLap !== null) {
            ctx.fillStyle = '#4CAF50';
            ctx.fillText(`Best Lap: ${this.formatTime(bestLap)}`, this.canvas.width/2, this.canvas.height/2 + 10);
        }
        
        // Lap times list
        const lapTimes = lapDetector.getLapTimes('player');
        if (lapTimes.length > 0) {
            ctx.fillStyle = '#9E9E9E';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            let y = this.canvas.height/2 + 40;
            for (let i = 0; i < lapTimes.length; i++) {
                ctx.fillText(`Lap ${i + 1}: ${this.formatTime(lapTimes[i])}`, this.canvas.width/2 - 150, y);
                y += 20;
            }
        }
        
        ctx.restore();
    }
    
    calculateCurrentPosition(lapDetector, raceManager) {
        // Enhanced position calculation based on lap progress and race time
        const playerProgress = lapDetector.getProgress('player');
        const playerLap = lapDetector.getCurrentLap('player');
        const playerRaceTime = lapDetector.getTotalRaceTime('player');
        
        let betterCars = 0;
        
        // Count AI cars with better progress
        for (const aiId of ['ai1', 'ai2', 'ai3']) {
            const aiProgress = lapDetector.getProgress(aiId);
            const aiLap = lapDetector.getCurrentLap(aiId);
            const aiRaceTime = lapDetector.getTotalRaceTime(aiId);
            
            // Compare by lap first, then by progress within same lap
            if (aiLap > playerLap ||
                (aiLap === playerLap && aiProgress > playerProgress + 0.01) ||
                (aiLap === playerLap && Math.abs(aiProgress - playerProgress) <= 0.01 && aiRaceTime < playerRaceTime)) {
                betterCars++;
            }
        }
        
        return betterCars + 1;
    }
    
    getPositionSuffix(position) {
        if (position === 1) return 'st';
        if (position === 2) return 'nd';
        if (position === 3) return 'rd';
        return 'th';
    }
    
    renderCountdown(countdownValue) {
        if (countdownValue <= 0) return;
        
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (countdownValue <= 0.1) {
            // GO! with green color and larger font
            ctx.fillStyle = '#4CAF50';
            ctx.font = 'bold 80px Arial';
            ctx.fillText('GO!', this.canvas.width / 2, this.canvas.height / 2);
        } else {
            const value = Math.ceil(countdownValue);
            // Color coding for countdown
            ctx.fillStyle = value === 3 ? '#FF5252' : // Red for 3
                          value === 2 ? '#FFC107' : // Yellow for 2
                          '#4CAF50'; // Green for 1
            ctx.font = 'bold 100px Arial';
            ctx.fillText(value.toString(), this.canvas.width / 2, this.canvas.height / 2);
        }
        ctx.restore();
    }
}