import { EventEmitter } from 'events';

/**
 * EventBus
 * 
 * Central communication hub for internal events between the Engine, Agents, and Tools.
 * This singleton enforces a decoupled architecture where components communicate via events
 * rather than direct imports.
 */

class VeriBus extends EventEmitter {
    constructor() {
        super();
        // Increase limit to prevent memory leak warnings in complex workflows
        this.setMaxListeners(50);
    }

    /**
     * Promise-based wrapper for waiting for a specific event with a timeout.
     */
    async waitFor(event, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, listener);
                reject(new Error(`[EventBus] Timeout waiting for event: ${event}`));
            }, timeoutMs);

            const listener = (data) => {
                clearTimeout(timer);
                resolve(data);
            };

            this.once(event, listener);
        });
    }
}

// Export a single instance to be used everywhere in the main process
const bus = new VeriBus();
export default bus;
