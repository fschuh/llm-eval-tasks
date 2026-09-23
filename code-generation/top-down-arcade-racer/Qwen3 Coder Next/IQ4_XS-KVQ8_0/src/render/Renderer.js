/**
 * Renderer System
 * 
 * Handles all canvas rendering for the racing game including:
 * - Track rendering with waypoints and checkpoints
 * - Car rendering with proper rotation
 * - HUD element rendering
 * - Camera/viewport management
 */

import { Vector2 } from '../core/Vector2.js';

/**
 * Renderer for the racing game
 */
export class Renderer {
    /**
     * Creates a new renderer
     * @param {Object} options - Configuration options
     * @param {HTMLCanvasElement} options.canvas - Canvas element to render to
     * @param {Track} options.track - The track to render
     * @param {Car[]} options.cars - Cars to render
     * @param {HUDSystem} options.hudSystem - HUD system for rendering UI
     */
    constructor({ canvas, track, cars, hudSystem } = {}) {
        /**
         * Canvas element
         * @type {HTMLCanvasElement}
         */
        this.canvas = canvas;

        /**
         * Canvas context
         * @type {CanvasRenderingContext2D}
         */
        this.ctx = canvas.getContext('2d');

        /**
         * Track to render
         * @type {Track}
         */
        this.track = track;

        /**
         * Cars to render
         * @type {Car[]}
         */
        this.cars = cars || [];

        /**
         * HUD system
         * @type {HUDSystem}
         */
        this.hudSystem = hudSystem;

        /**
         * Camera position (centered on player)
         * @type {Vector2}
         */
        this.camera = new Vector2();

        /**
         * Camera zoom level
         * @type {number}
         */
        this.zoom = 1.0;

        /**
         * Camera zoom limits
         * @type {Object}
         */
        this.zoomLimits = { min: 0.5, max: 2.0 };

        /**
         * Track rendering settings
         * @type {Object}
         */
        this.trackSettings = {
            roadColor: '#333333',
            grassColor: '#2d5a27',
            rumbleColor1: '#ffffff',
            rumbleColor2: '#cc0000',
            lineColor: '#ffffff',
            checkpointColor: '#ffff00',
            finishLineColor: '#ff0000',
            waypointColor: '#00ffcc',
            waypointSize: 4
        };

        /**
         * Car rendering settings
         * @type {Object}
         */
        this.carSettings = {
            bodyColor: '#ff0000',
            windowColor: '#88ccff',
            wheelColor: '#111111',
            wheelSize: 4,
            carWidth: 20,
            carHeight: 36
        };

        /**
         * Camera follow settings
         * @type {Object}
         */
        this.cameraSettings = {
            followSmoothness: 0.1,
            offset: new Vector2(0, -200)
        };

        /**
         * Last frame time for interpolation
         * @type {number}
         */
        this.lastFrameTime = 0;

        /**
         * Previous car positions for interpolation
         * @type {Map<number, Vector2>}
         */
        this.previousPositions = new Map();

        /**
         * Previous car angles for interpolation
         * @type {Map<number, number>}
         */
        this.previousAngles = new Map();

        // Handle resize
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Handle canvas resize
     */
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        // Update HUD canvas size
        if (this.hudSystem) {
            this.hudSystem.init(this.ctx, rect.width, rect.height);
        }
    }

    /**
     * Update camera to follow player
     * @param {Car} playerCar - Player car to follow
     * @param {number} dt - Time step in seconds
     */
    updateCamera(playerCar, dt) {
        if (!playerCar) return;

        // Calculate target position (player position + offset)
        const targetPosition = playerCar.position.add(this.cameraSettings.offset);

        // Smoothly interpolate camera position
        this.camera = this.camera.lerp(targetPosition, this.cameraSettings.followSmoothness);
    }

    /**
     * Update renderer state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Update camera if player car is available
        const playerCar = this.cars.find(car => car.tag === 'player');
        if (playerCar) {
            this.updateCamera(playerCar, dt);
        }
    }

    /**
     * Render the entire scene
     * @param {number} interpolation - Interpolation factor (0-1)
     */
    render(interpolation = 1) {
        const ctx = this.ctx;
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);

        // Clear canvas
        ctx.fillStyle = this.trackSettings.grassColor;
        ctx.fillRect(0, 0, width, height);

        // Save context for camera transform
        ctx.save();

        // Apply camera transform
        ctx.translate(width / 2, height / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // Render track
        this._renderTrack(ctx);

        // Render cars with interpolation
        this._renderCars(ctx, interpolation);

        // Restore context for HUD (no camera transform)
        ctx.restore();

        // Render HUD
        if (this.hudSystem) {
            this.hudSystem.render();
        }
    }

    /**
     * Render the track
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    _renderTrack(ctx) {
        if (!this.track || this.track.waypoints.length === 0) {
            return;
        }

        const settings = this.trackSettings;
        const waypoints = this.track.waypoints;
        const trackWidth = this.track.trackWidth;

        // Draw track outline (rumble strips)
        this._drawRumbleStrip(ctx, waypoints, trackWidth, settings.rumbleColor1, settings.rumbleColor2);

        // Draw road surface
        this._drawRoad(ctx, waypoints, trackWidth, settings.roadColor);

        // Draw center line
        this._drawCenterLine(ctx, waypoints, settings.lineColor);

        // Draw checkpoints
        this._drawCheckpoints(ctx, waypoints, settings.checkpointColor);

        // Draw finish line
        this._drawFinishLine(ctx, waypoints[0], settings.finishLineColor);

        // Draw waypoints (debug)
        this._drawWaypoints(ctx, waypoints, settings.waypointColor);
    }

    /**
     * Draw rumble strips on track edges
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Vector2[]} waypoints - Track waypoints
     * @param {number} trackWidth - Track width
     * @param {string} color1 - First rumble color
     * @param {string} color2 - Second rumble color
     */
    _drawRumbleStrip(ctx, waypoints, trackWidth, color1, color2) {
        const halfWidth = trackWidth / 2;
        const rumbleWidth = halfWidth + 10;

        ctx.lineWidth = rumbleWidth * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Create alternating color pattern
        for (let i = 0; i < waypoints.length; i++) {
            const current = waypoints[i];
            const next = waypoints[(i + 1) % waypoints.length];

            ctx.strokeStyle = (i % 2 === 0) ? color1 : color2;
            ctx.beginPath();
            ctx.moveTo(current.x, current.y);
            ctx.lineTo(next.x, next.y);
            ctx.stroke();
        }
    }

    /**
     * Draw road surface
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Vector2[]} waypoints - Track waypoints
     * @param {number} trackWidth - Track width
     * @param {string} color - Road color
     */
    _drawRoad(ctx, waypoints, trackWidth, color) {
        const halfWidth = trackWidth / 2;

        ctx.lineWidth = trackWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;

        ctx.beginPath();
        if (waypoints.length > 0) {
            ctx.moveTo(waypoints[0].x, waypoints[0].y);
            for (let i = 1; i < waypoints.length; i++) {
                ctx.lineTo(waypoints[i].x, waypoints[i].y);
            }
            ctx.closePath();
        }
        ctx.stroke();
    }

    /**
     * Draw center line
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Vector2[]} waypoints - Track waypoints
     * @param {string} color - Line color
     */
    _drawCenterLine(ctx, waypoints, color) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.setLineDash([20, 20]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        if (waypoints.length > 0) {
            ctx.moveTo(waypoints[0].x, waypoints[0].y);
            for (let i = 1; i < waypoints.length; i++) {
                ctx.lineTo(waypoints[i].x, waypoints[i].y);
            }
            ctx.closePath();
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /**
     * Draw checkpoints
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Vector2[]} waypoints - Track waypoints
     * @param {string} color - Checkpoint color
     */
    _drawCheckpoints(ctx, waypoints, color) {
        const checkpointIndices = this.track.checkpointIndices || [];

        ctx.fillStyle = color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;

        for (const index of checkpointIndices) {
            const waypoint = waypoints[index];
            if (!waypoint) continue;

            // Draw checkpoint marker
            ctx.beginPath();
            ctx.arc(waypoint.x, waypoint.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Draw checkpoint number
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((index + 1).toString(), waypoint.x, waypoint.y);
            ctx.fillStyle = color;
        }
    }

    /**
     * Draw finish line
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Vector2} position - Finish line position
     * @param {string} color - Finish line color
     */
    _drawFinishLine(ctx, position, color) {
        if (!position) return;

        const finishLineLength = this.track.trackWidth;
        const halfLength = finishLineLength / 2;

        // Calculate perpendicular direction
        const nextWaypoint = this.track.waypoints[1] || position;
        const direction = nextWaypoint.sub(position).normalize();
        const perpendicular = new Vector2(-direction.y, direction.x);

        // Calculate finish line endpoints
        const start = position.sub(perpendicular.mul(halfLength));
        const end = position.add(perpendicular.mul(halfLength));

        // Draw checkered pattern
        const checkerSize = 10;
        const numCheckers = finishLineLength / checkerSize;

        for (let i = 0; i < numCheckers; i++) {
            const t = (i + 0.5) / numCheckers;
            const pos = start.lerp(end, t);

            ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#000000';
            ctx.fillRect(
                pos.x - checkerSize / 2,
                pos.y - checkerSize / 2,
                checkerSize,
                checkerSize
            );
        }

        // Draw finish line text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FINISH', position.x, position.y);
    }

    /**
     * Draw waypoints (debug view)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Vector2[]} waypoints - Track waypoints
     * @param {string} color - Waypoint color
     */
    _drawWaypoints(ctx, waypoints, color) {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;

        for (let i = 0; i < waypoints.length; i++) {
            const waypoint = waypoints[i];
            if (!waypoint) continue;

            // Draw waypoint circle
            ctx.beginPath();
            ctx.arc(waypoint.x, waypoint.y, this.trackSettings.waypointSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Draw waypoint number
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(i.toString(), waypoint.x + 8, waypoint.y);
            ctx.fillStyle = color;
        }
    }

    /**
     * Render all cars
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} interpolation - Interpolation factor (0-1)
     */
    _renderCars(ctx, interpolation) {
        for (const car of this.cars) {
            this._renderCar(ctx, car, interpolation);
        }
    }

    /**
     * Render a single car
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Car} car - Car to render
     * @param {number} interpolation - Interpolation factor (0-1)
     */
    _renderCar(ctx, car, interpolation) {
        // Get interpolated position
        const prevPos = this.previousPositions.get(car.id) || car.position;
        const prevAngle = this.previousAngles.get(car.id) || car.angle;

        const currentPos = car.position;
        const currentAngle = car.angle;

        // Interpolate position
        const pos = prevPos.lerp(currentPos, interpolation);
        const angle = prevAngle + (currentAngle - prevAngle) * interpolation;

        // Store current state for next frame
        this.previousPositions.set(car.id, currentPos);
        this.previousAngles.set(car.id, currentAngle);

        // Save context for car transformation
        ctx.save();

        // Move to car position and rotate
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);

        // Draw car body
        this._drawCarBody(ctx, car);

        // Draw car details (windows, wheels)
        this._drawCarDetails(ctx, car);

        // Draw car label (player/AI indicator)
        this._drawCarLabel(ctx, car);

        // Restore context
        ctx.restore();
    }

    /**
     * Draw car body
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Car} car - Car to draw
     */
    _drawCarBody(ctx, car) {
        const settings = this.carSettings;
        const width = settings.carWidth;
        const height = settings.carHeight;

        // Determine car color based on type
        let bodyColor = settings.bodyColor;
        if (car.tag === 'player') {
            bodyColor = '#00ffcc'; // Player car color
        } else if (car.tag === 'ai') {
            bodyColor = car.color || '#ff0000'; // AI car color
        }

        // Draw car body (rectangle)
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-width / 2, -height / 2, width, height);

        // Draw car outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(-width / 2, -height / 2, width, height);
    }

    /**
     * Draw car details (windows, wheels)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Car} car - Car to draw
     */
    _drawCarDetails(ctx, car) {
        const settings = this.carSettings;
        const width = settings.carWidth;
        const height = settings.carHeight;

        // Draw wheels
        ctx.fillStyle = settings.wheelColor;
        const wheelPositions = [
            [-width / 2 - 2, -height / 4],  // Front left
            [width / 2 + 2, -height / 4],   // Front right
            [-width / 2 - 2, height / 4],   // Rear left
            [width / 2 + 2, height / 4]     // Rear right
        ];

        for (const [wx, wy] of wheelPositions) {
            ctx.beginPath();
            ctx.arc(wx, wy, settings.wheelSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw driver window
        ctx.fillStyle = settings.windowColor;
        ctx.fillRect(-width / 4, -height / 4, width / 2, height / 4);

        // Draw driver helmet
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(0, -height / 8, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draw car label (player/AI indicator)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Car} car - Car to label
     */
    _drawCarLabel(ctx, car) {
        const settings = this.carSettings;
        const height = settings.carHeight;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        let label = '';
        if (car.tag === 'player') {
            label = 'PLAYER';
        } else if (car.tag === 'ai') {
            label = 'AI';
        }

        ctx.fillText(label, 0, height / 2 + 12);
    }

    /**
     * Zoom camera in
     */
    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, this.zoomLimits.max);
    }

    /**
     * Zoom camera out
     */
    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, this.zoomLimits.min);
    }

    /**
     * Reset camera zoom
     */
    resetZoom() {
        this.zoom = 1.0;
    }

    /**
     * Set camera zoom to specific value
     * @param {number} zoom - Zoom level
     */
    setZoom(zoom) {
        this.zoom = Math.max(this.zoomLimits.min, Math.min(this.zoomLimits.max, zoom));
    }

    /**
     * Center camera on position
     * @param {Vector2} position - Position to center on
     */
    centerOn(position) {
        this.camera = position.clone();
    }

    /**
     * Toggle camera follow mode
     * @param {boolean} enabled - Whether to enable follow mode
     */
    setFollowMode(enabled) {
        // Follow mode is always enabled in this implementation
        // This method is for API compatibility
    }
}