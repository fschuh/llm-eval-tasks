/**
 * EventBus - Simple pub/sub event system for game communication
 */
class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback to remove
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Emit an event to all listeners
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (!this.listeners.has(event)) return;
        
        const callbacks = this.listeners.get(event);
        for (const callback of callbacks) {
            callback(data);
        }
    }

    /**
     * Subscribe to an event once (auto-unsubscribes after first emit)
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    once(event, callback) {
        const onceWrapper = (data) => {
            this.off(event, onceWrapper);
            callback(data);
        };
        this.on(event, onceWrapper);
    }

    /**
     * Remove all listeners for an event
     * @param {string} event - Event name
     */
    clear(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Get list of active event names
     * @returns {string[]} Array of event names
     */
    getEvents() {
        return Array.from(this.listeners.keys());
    }
}

// Export singleton instance
export const EventBusInstance = new EventBus();

// Export individual functions for convenience
export const on = (event, callback) => EventBusInstance.on(event, callback);
export const off = (event, callback) => EventBusInstance.off(event, callback);
export const emit = (event, data) => EventBusInstance.emit(event, data);
export const once = (event, callback) => EventBusInstance.once(event, callback);
