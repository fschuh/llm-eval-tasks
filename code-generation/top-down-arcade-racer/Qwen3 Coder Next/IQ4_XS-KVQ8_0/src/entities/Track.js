/**
 * Track Class
 * 
 * Implements track representation with waypoints and checkpoint system
 * for lap detection in the racing game.
 */

import { Vector2 } from '../core/Vector2.js';

/**
 * Track class with waypoint-based representation
 */
export class Track {
    /**
     * Creates a new track
     * @param {Object} options - Configuration options
     * @param {Vector2[]} options.waypoints - Ordered list of track waypoints
     * @param {number} options.trackWidth - Width of the track
     */
    constructor({ waypoints = [], trackWidth = 100 } = {}) {
        /**
         * Ordered list of track waypoints
         * @type {Vector2[]}
         */
        this.waypoints = waypoints.map(p => p.clone());

        /**
         * Width of the track
         * @type {number}
         */
        this.trackWidth = trackWidth;

        /**
         * Half track width for collision
         * @type {number}
         */
        this.halfTrackWidth = trackWidth / 2;

        /**
         * Total approximate track length
         * @type {number}
         */
        this.totalLength = this._calculateTotalLength();

        /**
         * Checkpoint indices (waypoints that count as checkpoints)
         * @type {number[]}
         */
        this.checkpointIndices = this._generateCheckpoints();

        /**
         * Finish line waypoint index
         * @type {number}
         */
        this.finishLineIndex = 0;

        /**
         * Track bounds
         * @type {Object}
         */
        this.bounds = this._calculateBounds();
    }

    /**
     * Calculates the total length of the track
     * @returns {number} Total track length
     */
    _calculateTotalLength() {
        let length = 0;
        for (let i = 0; i < this.waypoints.length; i++) {
            const current = this.waypoints[i];
            const next = this.waypoints[(i + 1) % this.waypoints.length];
            length += current.distance(next);
        }
        return length;
    }

    /**
     * Generates checkpoint indices from waypoints
     * @returns {number[]} Array of checkpoint indices
     */
    _generateCheckpoints() {
        // Use all waypoints as checkpoints
        return this.waypoints.map((_, index) => index);
    }

    /**
     * Calculates the bounds of the track
     * @returns {Object} Track bounds with min/max coordinates
     */
    _calculateBounds() {
        if (this.waypoints.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const waypoint of this.waypoints) {
            minX = Math.min(minX, waypoint.x);
            minY = Math.min(minY, waypoint.y);
            maxX = Math.max(maxX, waypoint.x);
            maxY = Math.max(maxY, waypoint.y);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Gets a waypoint by index
     * @param {number} index - Waypoint index
     * @returns {Vector2} Waypoint position
     */
    getWaypoint(index) {
        if (this.waypoints.length === 0) {
            return new Vector2(0, 0);
        }
        return this.waypoints[index % this.waypoints.length];
    }

    /**
     * Gets the angle at a waypoint
     * @param {number} index - Waypoint index
     * @returns {number} Angle in radians
     */
    getWaypointAngle(index) {
        if (this.waypoints.length < 2) {
            return 0;
        }
        const current = this.waypoints[index];
        const next = this.waypoints[(index + 1) % this.waypoints.length];
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        return Math.atan2(dy, dx);
    }

    /**
     * Finds the closest waypoint to a position
     * @param {Vector2} position - Position to find closest waypoint to
     * @returns {number} Index of closest waypoint
     */
    getClosestWaypoint(position) {
        if (this.waypoints.length === 0) {
            return 0;
        }

        let closestIndex = 0;
        let closestDistanceSq = Infinity;

        for (let i = 0; i < this.waypoints.length; i++) {
            const distanceSq = this.waypoints[i].distanceSquared(position);
            if (distanceSq < closestDistanceSq) {
                closestDistanceSq = distanceSq;
                closestIndex = i;
            }
        }

        return closestIndex;
    }

    /**
     * Checks if a position is on the track
     * @param {Vector2} position - Position to check
     * @returns {boolean} True if position is on track
     */
    isOnTrack(position) {
        const closestIndex = this.getClosestWaypoint(position);
        const closestWaypoint = this.waypoints[closestIndex];
        const distance = position.distance(closestWaypoint);
        return distance <= this.halfTrackWidth;
    }

    /**
     * Gets the closest point on the track to a position
     * @param {Vector2} position - Position to find closest point to
     * @returns {Vector2} Closest point on track
     */
    getClosestPointOnTrack(position) {
        const closestIndex = this.getClosestWaypoint(position);
        return this.waypoints[closestIndex];
    }

    /**
     * Calculates the angle at the closest point on track
     * @param {Vector2} position - Position to check
     * @returns {number} Angle in radians
     */
    getTrackAngleAt(position) {
        const closestIndex = this.getClosestWaypoint(position);
        return this.getWaypointAngle(closestIndex);
    }

    /**
     * Checks if a car has crossed a checkpoint
     * @param {Car} car - Car to check
     * @param {number} currentCheckpoint - Current checkpoint index
     * @returns {boolean} True if checkpoint was crossed
     */
    checkCheckpoint(car, currentCheckpoint) {
        if (this.waypoints.length === 0) {
            return false;
        }

        const nextCheckpoint = (currentCheckpoint + 1) % this.waypoints.length;
        const checkpointPos = this.waypoints[currentCheckpoint];
        const nextPos = this.waypoints[nextCheckpoint];

        // Check if car is close to the checkpoint
        const distance = car.position.distance(checkpointPos);
        if (distance > this.halfTrackWidth * 2) {
            return false;
        }

        // Check if car has passed the checkpoint
        const toCheckpoint = checkpointPos.sub(car.position);
        const carVelocity = car.physics.velocity;
        const dot = toCheckpoint.dot(carVelocity);

        // Car is moving toward the checkpoint
        return dot > 0;
    }

    /**
     * Updates lap state for a car
     * @param {Car} car - Car to update
     * @param {number} currentCheckpoint - Current checkpoint index
     * @returns {Object} Lap update result
     */
    updateLap(car, currentCheckpoint) {
        const result = {
            lapCompleted: false,
            checkpointUpdated: false,
            newCheckpoint: currentCheckpoint
        };

        // Check if car crossed finish line (from last checkpoint to first)
        if (currentCheckpoint === this.waypoints.length - 1) {
            const finishLinePos = this.waypoints[this.finishLineIndex];
            const distance = car.position.distance(finishLinePos);

            if (distance <= this.halfTrackWidth) {
                result.lapCompleted = true;
                result.newCheckpoint = 0;
            }
        }

        return result;
    }

    /**
     * Renders the track
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        if (this.waypoints.length < 2) {
            return;
        }

        // Draw track outline
        ctx.save();
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = this.trackWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
        for (let i = 1; i < this.waypoints.length; i++) {
            ctx.lineTo(this.waypoints[i].x, this.waypoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw track surface
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = this.trackWidth - 10;
        ctx.stroke();

        // Draw center line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
        for (let i = 1; i < this.waypoints.length; i++) {
            ctx.lineTo(this.waypoints[i].x, this.waypoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw checkpoints
        ctx.fillStyle = '#ff0000';
        for (let i = 0; i < this.waypoints.length; i++) {
            const wp = this.waypoints[i];
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, 5, 0, Math.PI * 2);
            ctx.fill();

            // Draw checkpoint number
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i, wp.x, wp.y);
            ctx.fillStyle = '#ff0000';
        }

        // Draw finish line
        const finishLine = this.waypoints[this.finishLineIndex];
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(finishLine.x - 10, finishLine.y - this.halfTrackWidth);
        ctx.lineTo(finishLine.x + 10, finishLine.y - this.halfTrackWidth);
        ctx.lineTo(finishLine.x + 10, finishLine.y + this.halfTrackWidth);
        ctx.lineTo(finishLine.x - 10, finishLine.y + this.halfTrackWidth);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Serializes track state to JSON
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            waypoints: this.waypoints.map(p => ({ x: p.x, y: p.y })),
            trackWidth: this.trackWidth,
            totalLength: this.totalLength,
            checkpointIndices: this.checkpointIndices,
            finishLineIndex: this.finishLineIndex,
            bounds: this.bounds
        };
    }

    /**
     * Deserializes track state from JSON
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        this.waypoints = data.waypoints.map(p => new Vector2(p.x, p.y));
        this.trackWidth = data.trackWidth;
        this.halfTrackWidth = data.trackWidth / 2;
        this.totalLength = data.totalLength;
        this.checkpointIndices = data.checkpointIndices || this._generateCheckpoints();
        this.finishLineIndex = data.finishLineIndex || 0;
        this.bounds = data.bounds || this._calculateBounds();
    }

    /**
     * Creates a simple oval track
     * @param {Object} options - Track configuration
     * @param {number} options.centerX - Center X coordinate
     * @param {number} options.centerY - Center Y coordinate
     * @param {number} options.radiusX - Horizontal radius
     * @param {number} options.radiusY - Vertical radius
     * @param {number} options.numPoints - Number of waypoints
     * @returns {Track} Created track
     */
    static createOvalTrack({ centerX = 0, centerY = 0, radiusX = 200, radiusY = 100, numPoints = 20 } = {}) {
        const waypoints = [];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const x = centerX + Math.cos(angle) * radiusX;
            const y = centerY + Math.sin(angle) * radiusY;
            waypoints.push(new Vector2(x, y));
        }
        return new Track({ waypoints, trackWidth: 100 });
    }

    /**
     * Creates a track with a start/finish line
     * @param {Object} options - Track configuration
     * @param {number} options.startX - Start position X
     * @param {number} options.startY - Start position Y
     * @param {number} options.length - Track length
     * @param {number} options.width - Track width
     * @returns {Track} Created track
     */
    static createStraightTrack({ startX = 0, startY = 0, length = 400, width = 100 } = {}) {
        const numPoints = 10;
        const waypoints = [];
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            waypoints.push(new Vector2(startX + t * length, startY));
        }
        return new Track({ waypoints, trackWidth: width });
    }
}