import { Vector2 } from '../utils/Vector2.js';

/**
 * Render manager for top-down view rendering
 */
export class RenderManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // View settings
        this.tileSize = 32;
        this.zoom = 1.0;

        // FPS display
        this.fps = 60;
    }

    /**
     * Main render function
     */
    render(gameState, alpha) {
        const ctx = this.ctx;
        const canvas = this.canvas;

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Save context for camera transform
        ctx.save();

        // Apply camera transform
        const camera = gameState.camera;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.position.x, -camera.position.y);

        // Render track
        this.renderTrack(gameState.track);

        // Render cars with interpolation
        for (const car of gameState.allCars) {
            this.renderCar(car, alpha);
        }

        ctx.restore();

        // Render HUD (screen space)
        this.renderHUD(gameState);
    }

    /**
     * Render the track
     */
    renderTrack(track) {
        if (!track) return;

        const ctx = this.ctx;

        // Draw grass background
        ctx.fillStyle = track.grassColor;
        ctx.fillRect(
            track.bounds.minX,
            track.bounds.minY,
            track.bounds.maxX - track.bounds.minX,
            track.bounds.maxY - track.bounds.minY
        );

        // Draw track segments
        ctx.strokeStyle = track.trackColor;
        ctx.lineWidth = track.trackWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (let i = 0; i < track.waypoints.length; i++) {
            const wp = track.waypoints[i];
            if (i === 0) {
                ctx.moveTo(wp.position.x, wp.position.y);
            } else {
                ctx.lineTo(wp.position.x, wp.position.y);
            }
        }
        // Close the loop
        if (track.waypoints.length > 0) {
            ctx.lineTo(track.waypoints[0].position.x, track.waypoints[0].position.y);
        }
        ctx.stroke();

        // Draw track borders
        ctx.strokeStyle = track.wallColor;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw start/finish line
        if (track.startLine !== null) {
            const start = track.waypoints[track.startLine];
            const next = start.next;
            const mid = start.position.add(next.position).divide(2);
            const perp = new Vector2(-start.tangent.y, start.tangent.x);

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(
                mid.x - perp.x * track.trackWidth / 2,
                mid.y - perp.y * track.trackWidth / 2
            );
            ctx.lineTo(
                mid.x + perp.x * track.trackWidth / 2,
                mid.y + perp.y * track.trackWidth / 2
            );
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw checkpoint markers
        for (const checkpointIndex of track.checkpoints) {
            const wp = track.waypoints[checkpointIndex];
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(wp.position.x, wp.position.y, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Render a car
     */
    renderCar(car, alpha) {
        const ctx = this.ctx;
        const physics = car.physics;

        // Get interpolated position for smooth rendering
        const pos = physics.getInterpolatedPosition(alpha);
        const heading = physics.getInterpolatedHeading(alpha);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(heading);

        // Draw car body (main rectangle)
        ctx.fillStyle = car.color;
        ctx.fillRect(
            -physics.halfWidth,
            -physics.halfHeight,
            physics.width,
            physics.height
        );

        // Draw car outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            -physics.halfWidth,
            -physics.halfHeight,
            physics.width,
            physics.height
        );

        // Draw car details
        ctx.fillStyle = '#333333';
        // Windshield
        ctx.fillRect(-8, -10, 16, 6);
        // Rear window
        ctx.fillRect(-8, 4, 16, 6);

        // Draw wheels
        ctx.fillStyle = '#111111';
        const wheelWidth = 4;
        const wheelHeight = 8;
        // Front wheels
        ctx.fillRect(physics.halfWidth - 2, -physics.halfHeight + 2, wheelWidth, wheelHeight);
        ctx.fillRect(physics.halfWidth - 2, physics.halfHeight - 10, wheelWidth, wheelHeight);
        // Rear wheels
        ctx.fillRect(-physics.halfWidth - 2, -physics.halfHeight + 2, wheelWidth, wheelHeight);
        ctx.fillRect(-physics.halfWidth - 2, physics.halfHeight - 10, wheelWidth, wheelHeight);

        // Draw direction indicator for player
        if (car.isPlayer) {
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(physics.halfWidth + 10, 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Render the HUD
     */
    renderHUD(gameState) {
        const ctx = this.ctx;
        const canvas = this.canvas;

        // HUD background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 220, 140);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';

        // Lap count
        const player = gameState.player;
        if (player && gameState.track) {
            ctx.fillText(`Lap: ${player.lapCount + 1}/${gameState.track.totalLaps}`, 20, 35);

            // Race time
            const timeStr = this.formatTime(player.raceTime);
            ctx.fillText(`Time: ${timeStr}`, 20, 60);

            // Position
            const position = gameState.getPlayerPosition();
            const suffix = this.getPositionSuffix(position);
            ctx.fillText(`Position: ${position}${suffix}`, 20, 85);

            // Speed
            const speed = Math.round(player.physics.speed * 0.1); // Scale for display
            ctx.fillText(`Speed: ${speed} km/h`, 20, 110);

            // Race state
            if (gameState.raceState === 'WAITING') {
                ctx.fillStyle = '#FFFF00';
                ctx.fillText('Press R to start', 20, 135);
            }
        }

        // Countdown
        if (gameState.raceState === 'COUNTDOWN') {
            const count = Math.ceil(gameState.countdownTime);
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.fillStyle = count === 1 ? '#00FF00' : '#FFFF00';
            ctx.font = 'bold 96px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.fillText(count > 0 ? count.toString() : 'GO!', 0, 0);
            ctx.restore();
        }

        // Race finished
        if (gameState.raceState === 'FINISHED') {
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            
            // Background for results
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(-200, -150, 400, 300);
            
            ctx.fillStyle = '#00FF00';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('RACE FINISHED!', 0, -100);

            // Show final positions
            ctx.font = '20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Final Results:', 0, -60);
            
            for (let i = 0; i < Math.min(4, gameState.leaderboard.length); i++) {
                const car = gameState.leaderboard[i];
                const name = car.isPlayer ? 'Player' : `AI ${car.id}`;
                const time = this.formatTime(car.finishTime || car.raceTime);
                const pos = i + 1;
                
                // Highlight player
                if (car.isPlayer) {
                    ctx.fillStyle = '#00FF00';
                } else {
                    ctx.fillStyle = '#FFFFFF';
                }
                
                ctx.fillText(`${pos}. ${name} - ${time}`, 0, -30 + i * 30);
            }
            
            ctx.fillStyle = '#AAAAAA';
            ctx.font = '14px Arial';
            ctx.fillText('Press R to restart', 0, 120);
            
            ctx.restore();
        }

        // FPS counter
        ctx.fillStyle = '#00FF00';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`FPS: ${this.fps}`, canvas.width - 10, 20);
        ctx.textAlign = 'left';
    }

    /**
     * Format time as M:SS.ms
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    /**
     * Get position suffix (st, nd, rd, th)
     */
    getPositionSuffix(position) {
        if (position === 1) return 'st';
        if (position === 2) return 'nd';
        if (position === 3) return 'rd';
        return 'th';
    }

    /**
     * Update FPS display
     */
    setFPS(fps) {
        this.fps = fps;
    }
}