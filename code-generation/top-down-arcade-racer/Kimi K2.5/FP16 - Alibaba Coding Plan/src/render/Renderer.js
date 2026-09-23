import { Camera } from './Camera.js';
import { COLORS } from '../config/GameConfig.js';
import { Vector2D } from '../core/Vector2D.js';

/**
 * Renderer - Main rendering coordinator
 */
export class Renderer {
    /**
     * Create a new renderer
     * @param {HTMLCanvasElement} canvas - Canvas element
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        
        // Camera
        this.camera = new Camera(this.width, this.height);
        
        // Renderables
        this.renderables = [];
        
        // Track reference
        this.track = null;
        
        // Debug mode
        this.debug = false;
    }

    /**
     * Set the camera
     * @param {Camera} camera - Camera to use
     */
    setCamera(camera) {
        this.camera = camera;
    }

    /**
     * Add a renderable object
     * @param {Object} renderable - Object with render method
     */
    addRenderable(renderable) {
        if (!this.renderables.includes(renderable)) {
            this.renderables.push(renderable);
        }
    }

    /**
     * Remove a renderable object
     * @param {Object} renderable - Object to remove
     */
    removeRenderable(renderable) {
        const index = this.renderables.indexOf(renderable);
        if (index > -1) {
            this.renderables.splice(index, 1);
        }
    }

    /**
     * Set the track to render
     * @param {Track} track - Track to render
     */
    setTrack(track) {
        this.track = track;
        
        // Set camera bounds to track bounds
        if (track) {
            this.camera.setBounds(track.getBounds());
        }
    }

    /**
     * Clear the canvas
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * Render the scene
     * @param {number} alpha - Interpolation factor [0, 1]
     */
    render(alpha = 1) {
        // Clear canvas
        this.clear();
        
        // Update camera
        this.camera.update();
        
        // Apply camera transform
        this.applyCameraTransform();
        
        // Render track
        if (this.track) {
            this.renderTrack(alpha);
        }
        
        // Render all renderables
        for (const renderable of this.renderables) {
            if (renderable.render) {
                renderable.render(this.ctx, alpha);
            }
        }
        
        // Debug rendering
        if (this.debug) {
            this.renderDebug();
        }
        
        // Reset transform
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Apply camera transform to context
     */
    applyCameraTransform() {
        const view = this.camera.getViewMatrix();
        this.ctx.setTransform(
            view.zoom, 0, 
            0, view.zoom, 
            view.x, view.y
        );
    }

    /**
     * Render the track
     * @param {number} alpha - Interpolation factor
     */
    renderTrack(alpha) {
        if (!this.track) return;
        
        // Render track surface
        this.renderTrackSurface();
        
        // Render waypoints
        this.renderWaypoints(alpha);
        
        // Render boundaries/walls
        this.renderBoundaries();
        
        // Render start positions
        this.renderStartPositions();
    }

    /**
     * Render track surface
     */
    renderTrackSurface() {
        const ctx = this.ctx;
        const waypoints = this.track.waypoints;
        
        if (waypoints.length < 2) return;
        
        // Draw track as a thick line connecting waypoints
        ctx.strokeStyle = COLORS.TRACK;
        ctx.lineWidth = 60;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        const first = waypoints[0];
        ctx.moveTo(first.position.x, first.position.y);
        
        for (let i = 1; i < waypoints.length; i++) {
            const wp = waypoints[i];
            ctx.lineTo(wp.position.x, wp.position.y);
        }
        
        // Close the loop
        ctx.lineTo(first.position.x, first.position.y);
        ctx.stroke();
        
        // Draw track borders
        ctx.strokeStyle = COLORS.TRACK_BORDER;
        ctx.lineWidth = 64;
        ctx.stroke();
        
        // Redraw inner track
        ctx.strokeStyle = COLORS.TRACK;
        ctx.lineWidth = 56;
        ctx.stroke();
    }

    /**
     * Render waypoints
     * @param {number} alpha - Interpolation factor
     */
    renderWaypoints(alpha) {
        const ctx = this.ctx;
        
        for (const waypoint of this.track.waypoints) {
            // Draw waypoint circle
            ctx.beginPath();
            ctx.arc(waypoint.position.x, waypoint.position.y, waypoint.width / 2, 0, Math.PI * 2);
            
            if (waypoint.isCheckpoint) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
                ctx.strokeStyle = '#00FFFF';
            } else {
                ctx.fillStyle = 'rgba(68, 68, 255, 0.2)';
                ctx.strokeStyle = '#4444FF';
            }
            
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    /**
     * Render boundaries/walls
     */
    renderBoundaries() {
        const ctx = this.ctx;
        
        for (const boundary of this.track.boundaries) {
            ctx.beginPath();
            ctx.arc(boundary.position.x, boundary.position.y, boundary.radius, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.WALL;
            ctx.fill();
            
            // Border
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    /**
     * Render start positions
     */
    renderStartPositions() {
        const ctx = this.ctx;
        
        for (let i = 0; i < this.track.startPositions.length; i++) {
            const start = this.track.startPositions[i];
            const pos = start.position;
            
            // Draw small marker
            ctx.fillStyle = '#888888';
            ctx.fillRect(pos.x - 5, pos.y - 5, 10, 10);
            
            // Draw number
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText((i + 1).toString(), pos.x, pos.y - 10);
        }
    }

    /**
     * Render debug information
     */
    renderDebug() {
        const ctx = this.ctx;
        
        // Draw camera position
        ctx.fillStyle = '#FF00FF';
        ctx.beginPath();
        ctx.arc(this.camera.position.x, this.camera.position.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw view bounds
        const bounds = this.camera.getViewBounds();
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            bounds.minX, 
            bounds.minY, 
            bounds.maxX - bounds.minX, 
            bounds.maxY - bounds.minY
        );
    }

    /**
     * Resize the renderer
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.camera.resize(width, height);
    }

    /**
     * Enable/disable debug mode
     * @param {boolean} enabled - Debug enabled
     */
    setDebug(enabled) {
        this.debug = enabled;
    }

    /**
     * Render a car
     * @param {CanvasRenderingContext2D} ctx - Context
     * @param {Car} car - Car to render
     * @param {number} alpha - Interpolation factor
     * @param {string} color - Car color
     */
    static renderCar(ctx, car, alpha, color) {
        // Get interpolated position
        const pos = car.getInterpolatedPosition(alpha);
        const rot = car.getInterpolatedRotation(alpha);
        
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(rot);
        
        // Car body
        ctx.fillStyle = color;
        ctx.fillRect(-15, -10, 30, 20);
        
        // Car direction indicator (front)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(5, -6, 8, 12);
        
        // Car center
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Collision circle (debug)
        // ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        // ctx.beginPath();
        // ctx.arc(pos.x, pos.y, car.radius, 0, Math.PI * 2);
        // ctx.stroke();
    }

    /**
     * Get the canvas
     * @returns {HTMLCanvasElement} Canvas element
     */
    getCanvas() {
        return this.canvas;
    }

    /**
     * Get the context
     * @returns {CanvasRenderingContext2D} Canvas context
     */
    getContext() {
        return this.ctx;
    }
}
