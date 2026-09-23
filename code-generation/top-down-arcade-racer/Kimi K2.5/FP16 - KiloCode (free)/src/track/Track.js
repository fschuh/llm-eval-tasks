import { Vector2 } from '../utils/Vector2.js';
import { Waypoint } from './Waypoint.js';

/**
 * Track definition containing waypoints and checkpoints
 */
export class Track {
    constructor(name) {
        this.name = name;
        this.waypoints = [];          // Array of Waypoint
        this.checkpoints = [];        // Indices of checkpoint waypoints
        this.startLine = null;        // Waypoint index of start/finish line
        this.totalLaps = 3;

        // Track bounds (for culling)
        this.bounds = {
            minX: 0, maxX: 0,
            minY: 0, maxY: 0
        };

        // Visual properties
        this.trackWidth = 80;         // Default track width
        this.trackColor = '#333333';
        this.grassColor = '#228B22';
        this.wallColor = '#888888';
    }

    /**
     * Add a waypoint to the track
     */
    addWaypoint(position, width = null, isCheckpoint = false) {
        const id = this.waypoints.length;
        const wp = new Waypoint(id, position, width || this.trackWidth, isCheckpoint);
        this.waypoints.push(wp);
        
        if (isCheckpoint) {
            this.checkpoints.push(id);
        }
        
        return wp;
    }

    /**
     * Build linked list and calculate tangents
     */
    build() {
        const n = this.waypoints.length;
        if (n === 0) return;

        for (let i = 0; i < n; i++) {
            const current = this.waypoints[i];
            const next = this.waypoints[(i + 1) % n];
            const prev = this.waypoints[(i - 1 + n) % n];

            current.next = next;
            current.prev = prev;

            // Calculate tangent (direction to next)
            current.tangent = next.position.subtract(current.position).normalize();
            current.normal = new Vector2(-current.tangent.y, current.tangent.x);
        }

        // Calculate bounds
        this.calculateBounds();
    }

    /**
     * Calculate track bounds
     */
    calculateBounds() {
        if (this.waypoints.length === 0) return;

        this.bounds.minX = this.bounds.maxX = this.waypoints[0].position.x;
        this.bounds.minY = this.bounds.maxY = this.waypoints[0].position.y;

        for (const wp of this.waypoints) {
            this.bounds.minX = Math.min(this.bounds.minX, wp.position.x);
            this.bounds.maxX = Math.max(this.bounds.maxX, wp.position.x);
            this.bounds.minY = Math.min(this.bounds.minY, wp.position.y);
            this.bounds.maxY = Math.max(this.bounds.maxY, wp.position.y);
        }

        // Add padding
        const padding = this.trackWidth * 2;
        this.bounds.minX -= padding;
        this.bounds.maxX += padding;
        this.bounds.minY -= padding;
        this.bounds.maxY += padding;
    }

    /**
     * Get total track length
     */
    getLength() {
        let length = 0;
        for (let i = 0; i < this.waypoints.length; i++) {
            const current = this.waypoints[i];
            const next = this.waypoints[(i + 1) % this.waypoints.length];
            length += current.position.distanceTo(next.position);
        }
        return length;
    }

    /**
     * Get waypoint at index (wraps around)
     */
    getWaypoint(index) {
        if (this.waypoints.length === 0) return null;
        return this.waypoints[index % this.waypoints.length];
    }

    /**
     * Find nearest waypoint to a position
     */
    findNearestWaypoint(position) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const wp of this.waypoints) {
            const dist = position.distanceSquaredTo(wp.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = wp;
            }
        }

        return nearest;
    }

    /**
     * Create a sample oval track
     */
    static createOvalTrack() {
        const track = new Track('Oval Circuit');
        
        // Define waypoints (oval shape)
        const waypointData = [
            { pos: new Vector2(400, 300), checkpoint: true },   // Start
            { pos: new Vector2(600, 300), checkpoint: false },  // Straight
            { pos: new Vector2(700, 350), checkpoint: true },   // Turn entry
            { pos: new Vector2(700, 450), checkpoint: false },  // Turn apex
            { pos: new Vector2(600, 500), checkpoint: false },  // Turn exit
            { pos: new Vector2(400, 500), checkpoint: true },   // Back straight
            { pos: new Vector2(300, 450), checkpoint: false },  // Turn entry
            { pos: new Vector2(300, 350), checkpoint: false },  // Turn apex
        ];

        // Add to track
        for (let i = 0; i < waypointData.length; i++) {
            const data = waypointData[i];
            track.addWaypoint(data.pos, 80, data.checkpoint);
        }

        track.startLine = 0;
        track.totalLaps = 3;
        track.build();
        
        return track;
    }

    /**
     * Create a figure-8 track
     */
    static createFigureEightTrack() {
        const track = new Track('Figure Eight');
        
        const centerX = 550;
        const centerY = 400;
        const radiusX = 200;
        const radiusY = 120;
        
        // Left loop
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI + i * Math.PI / 8);
            const x = centerX - radiusX * 0.5 + Math.cos(angle) * radiusX;
            const y = centerY + Math.sin(angle) * radiusY;
            track.addWaypoint(new Vector2(x, y), 80, i % 3 === 0);
        }
        
        // Center crossover
        track.addWaypoint(new Vector2(centerX, centerY), 100, true);
        
        // Right loop
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI / 8);
            const x = centerX + radiusX * 0.5 + Math.cos(angle) * radiusX;
            const y = centerY + Math.sin(angle) * radiusY;
            track.addWaypoint(new Vector2(x, y), 80, i % 3 === 0);
        }

        track.startLine = 0;
        track.totalLaps = 3;
        track.build();
        
        return track;
    }
}