/**
 * Base Entity Class
 * 
 * Provides the foundation for all game entities with common properties
 * and methods for position, rotation, and state management.
 */

import { Vector2 } from '../core/Vector2.js';

/**
 * Base entity class for all game objects
 */
export class Entity {
    /**
     * Creates a new entity
     * @param {Object} options - Configuration options
     * @param {Vector2} options.position - Initial position
     * @param {number} options.angle - Initial angle in radians
     * @param {boolean} options.active - Whether entity is active
     */
    constructor({ position = new Vector2(), angle = 0, active = true } = {}) {
        /**
         * Current position
         * @type {Vector2}
         */
        this.position = position.clone();

        /**
         * Current angle in radians
         * @type {number}
         */
        this.angle = angle;

        /**
         * Whether the entity is active
         * @type {boolean}
         */
        this.active = active;

        /**
         * Entity tag for identification
         * @type {string}
         */
        this.tag = 'entity';

        /**
         * Entity ID for unique identification
         * @type {number}
         */
        this.id = Entity._nextId++;

        /**
         * Parent entity (for hierarchical relationships)
         * @type {Entity|null}
         */
        this.parent = null;

        /**
         * Child entities
         * @type {Entity[]}
         */
        this.children = [];

        /**
         * Custom data for entity-specific information
         * @type {Object}
         */
        this.userData = {};
    }

    /**
     * Gets the world position (considers parent)
     * @returns {Vector2} World position
     */
    get worldPosition() {
        if (this.parent) {
            return this.parent.worldPosition.add(this.position);
        }
        return this.position.clone();
    }

    /**
     * Gets the world angle (considers parent)
     * @returns {number} World angle in radians
     */
    get worldAngle() {
        if (this.parent) {
            return this.parent.worldAngle + this.angle;
        }
        return this.angle;
    }

    /**
     * Updates the entity state
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Update children
        for (const child of this.children) {
            child.update(dt);
        }
    }

    /**
     * Renders the entity
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        // Render children
        for (const child of this.children) {
            child.render(ctx);
        }
    }

    /**
     * Adds a child entity
     * @param {Entity} child - Child entity to add
     */
    addChild(child) {
        child.parent = this;
        this.children.push(child);
    }

    /**
     * Removes a child entity
     * @param {Entity} child - Child entity to remove
     */
    removeChild(child) {
        child.parent = null;
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }

    /**
     * Checks if entity contains a point
     * @param {Vector2} point - Point to check
     * @returns {boolean} True if point is inside entity
     */
    containsPoint(point) {
        return false;
    }

    /**
     * Activates the entity
     */
    activate() {
        this.active = true;
    }

    /**
     * Deactivates the entity
     */
    deactivate() {
        this.active = false;
    }

    /**
     * Resets the entity to initial state
     */
    reset() {
        this.position.set(0, 0);
        this.angle = 0;
        this.active = true;
    }

    /**
     * Serializes entity state to JSON
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            position: { x: this.position.x, y: this.position.y },
            angle: this.angle,
            active: this.active,
            tag: this.tag,
            id: this.id,
            userData: this.userData
        };
    }

    /**
     * Deserializes entity state from JSON
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        this.position.set(data.position.x, data.position.y);
        this.angle = data.angle;
        this.active = data.active;
        this.tag = data.tag;
        this.userData = data.userData || {};
    }

    /**
     * Creates a deep copy of the entity
     * @returns {Entity} Copy of this entity
     */
    clone() {
        const clone = new Entity({
            position: this.position.clone(),
            angle: this.angle,
            active: this.active
        });
        clone.tag = this.tag;
        clone.userData = JSON.parse(JSON.stringify(this.userData));
        return clone;
    }
}

// Static counter for unique IDs
Entity._nextId = 0;