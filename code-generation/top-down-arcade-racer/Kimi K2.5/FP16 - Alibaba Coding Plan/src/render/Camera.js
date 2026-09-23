import { Vector2D } from '../core/Vector2D.js';

/**
 * Camera - Viewport control for following the player
 */
export class Camera {
    /**
     * Create a new camera
     * @param {number} width - Viewport width
     * @param {number} height - Viewport height
     */
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.halfWidth = width / 2;
        this.halfHeight = height / 2;
        
        // Camera position (center of viewport)
        this.position = new Vector2D(0, 0);
        
        // Target to follow
        this.target = null;
        
        // Smoothing factor (0 = no smoothing, 1 = instant)
        this.smoothing = 0.15;
        
        // Zoom level
        this.zoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 2.0;
        
        // Bounds for clamping (optional)
        this.bounds = null;
        
        // Shake effect
        this.shakeIntensity = 0;
        this.shakeDecay = 0;
    }

    /**
     * Set the target to follow
     * @param {Object} target - Object with position property
     */
    follow(target) {
        this.target = target;
    }

    /**
     * Set camera position directly
     * @param {Vector2D} position - New position
     */
    setPosition(position) {
        this.position = position.clone();
    }

    /**
     * Set bounds for camera clamping
     * @param {Object} bounds - Bounds object with minX, minY, maxX, maxY
     */
    setBounds(bounds) {
        this.bounds = bounds;
    }

    /**
     * Clear bounds
     */
    clearBounds() {
        this.bounds = null;
    }

    /**
     * Set zoom level
     * @param {number} zoom - Zoom level
     */
    setZoom(zoom) {
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    }

    /**
     * Add shake effect
     * @param {number} intensity - Shake intensity in pixels
     * @param {number} duration - Duration in seconds
     */
    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeDecay = intensity / duration;
    }

    /**
     * Update camera position
     */
    update() {
        // Follow target if set
        if (this.target && this.target.position) {
            const targetPos = this.target.position;
            
            // Smooth interpolation
            const diff = targetPos.sub(this.position);
            this.position = this.position.add(diff.mul(this.smoothing));
        }

        // Apply bounds clamping
        if (this.bounds) {
            this.clampToBounds();
        }

        // Apply shake
        if (this.shakeIntensity > 0) {
            const shakeX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            const shakeY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            this.position = this.position.add(new Vector2D(shakeX, shakeY));
            
            this.shakeIntensity -= this.shakeDecay * (1/60); // Assume 60 FPS
            if (this.shakeIntensity < 0) this.shakeIntensity = 0;
        }
    }

    /**
     * Clamp camera position to bounds
     */
    clampToBounds() {
        if (!this.bounds) return;

        const minX = this.bounds.minX + this.halfWidth / this.zoom;
        const maxX = this.bounds.maxX - this.halfWidth / this.zoom;
        const minY = this.bounds.minY + this.halfHeight / this.zoom;
        const maxY = this.bounds.maxY - this.halfHeight / this.zoom;

        this.position.x = Math.max(minX, Math.min(maxX, this.position.x));
        this.position.y = Math.max(minY, Math.min(maxY, this.position.y));
    }

    /**
     * Convert world position to screen position
     * @param {Vector2D} worldPos - World position
     * @returns {Vector2D} Screen position
     */
    worldToScreen(worldPos) {
        const screenX = (worldPos.x - this.position.x) * this.zoom + this.halfWidth;
        const screenY = (worldPos.y - this.position.y) * this.zoom + this.halfHeight;
        return new Vector2D(screenX, screenY);
    }

    /**
     * Convert screen position to world position
     * @param {Vector2D} screenPos - Screen position
     * @returns {Vector2D} World position
     */
    screenToWorld(screenPos) {
        const worldX = (screenPos.x - this.halfWidth) / this.zoom + this.position.x;
        const worldY = (screenPos.y - this.halfHeight) / this.zoom + this.position.y;
        return new Vector2D(worldX, worldY);
    }

    /**
     * Get view matrix for rendering
     * @returns {Object} View transform data
     */
    getViewMatrix() {
        return {
            x: -this.position.x * this.zoom + this.halfWidth,
            y: -this.position.y * this.zoom + this.halfHeight,
            zoom: this.zoom
        };
    }

    /**
     * Check if a world position is visible on screen
     * @param {Vector2D} worldPos - World position
     * @param {number} margin - Extra margin in pixels
     * @returns {boolean} True if visible
     */
    isVisible(worldPos, margin = 0) {
        const screenPos = this.worldToScreen(worldPos);
        return screenPos.x >= -margin && 
               screenPos.x <= this.width + margin &&
               screenPos.y >= -margin && 
               screenPos.y <= this.height + margin;
    }

    /**
     * Resize camera viewport
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.halfWidth = width / 2;
        this.halfHeight = height / 2;
    }

    /**
     * Get camera view bounds in world coordinates
     * @returns {Object} Bounds with minX, minY, maxX, maxY
     */
    getViewBounds() {
        const halfViewWidth = this.halfWidth / this.zoom;
        const halfViewHeight = this.halfHeight / this.zoom;
        
        return {
            minX: this.position.x - halfViewWidth,
            minY: this.position.y - halfViewHeight,
            maxX: this.position.x + halfViewWidth,
            maxY: this.position.y + halfViewHeight
        };
    }
}
