import { Vector2 } from '../utils/Vector2.js';
import { CarPhysics } from '../physics/CarPhysics.js';

/**
 * Base Car entity
 */
export class Car {
    constructor(id, isPlayer = false, startPosition = new Vector2(0, 0)) {
        this.id = id;
        this.isPlayer = isPlayer;
        this.physics = new CarPhysics();
        this.physics.position = startPosition.clone();

        // Visual properties
        this.color = isPlayer ? '#00FF00' : this.generateColor(id);

        // Race state
        this.lapCount = 0;
        this.raceTime = 0;
        this.currentCheckpoint = 0;
        this.checkpointsPassed = new Set();
        this.finished = false;
        this.finishTime = null;
        this.racePosition = 0;        // Race position (1st, 2nd, etc.)

        // AI specific
        this.aiConfig = null;         // Set if isPlayer = false
        this.aiController = null;     // WaypointFollower

        // Collision
        this.collisionCooldown = 0;   // Frames until next collision response
    }

    /**
     * Generate a color for AI cars
     */
    generateColor(id) {
        const colors = ['#FF0000', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'];
        return colors[(id - 1) % colors.length];
    }

    /**
     * Get corners for collision detection (OBB)
     */
    getCorners() {
        const cos = Math.cos(this.physics.heading);
        const sin = Math.sin(this.physics.heading);
        const hw = this.physics.halfWidth;
        const hh = this.physics.halfHeight;
        const pos = this.physics.position;

        return [
            new Vector2(pos.x + cos * hw - sin * hh, pos.y + sin * hw + cos * hh),
            new Vector2(pos.x - cos * hw - sin * hh, pos.y - sin * hw + cos * hh),
            new Vector2(pos.x - cos * hw + sin * hh, pos.y - sin * hw - cos * hh),
            new Vector2(pos.x + cos * hw + sin * hh, pos.y + sin * hw - cos * hh)
        ];
    }

    /**
     * Get forward vector
     */
    getForwardVector() {
        return new Vector2(Math.cos(this.physics.heading), Math.sin(this.physics.heading));
    }

    /**
     * Get right vector (for lateral velocity calculations)
     */
    getRightVector() {
        return new Vector2(-Math.sin(this.physics.heading), Math.cos(this.physics.heading));
    }

    /**
     * Reset car to starting state
     */
    reset(startPosition, startHeading = 0) {
        this.physics.position = startPosition.clone();
        this.physics.velocity = new Vector2(0, 0);
        this.physics.heading = startHeading;
        this.physics.speed = 0;
        this.physics.isAccelerating = false;
        this.physics.isBraking = false;
        this.physics.steering = 0;

        this.lapCount = 0;
        this.raceTime = 0;
        this.currentCheckpoint = 0;
        this.checkpointsPassed.clear();
        this.finished = false;
        this.finishTime = null;
        this.racePosition = 0;
        this.collisionCooldown = 0;

        if (this.aiController) {
            this.aiController.reset();
        }
    }

    /**
     * Update car (to be overridden by subclasses)
     */
    update(dt) {
        // Base class does nothing - subclasses handle input/AI
    }
}