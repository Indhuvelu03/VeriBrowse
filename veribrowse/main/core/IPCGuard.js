/**
 * IPCGuard.js
 *
 * Lightweight in-process rate limiter / backpressure gate for IPC handlers.
 *
 * Responsibilities
 * ──────────────────────────────────────────────────────────────────────
 * 1. Tracks whether an agent task is currently running.
 * 2. Enforces a short per-channel COOLDOWN_MS window after a task finishes
 *    to prevent double-fire from UI jitter or keyboard repeat.
 * 3. Exposes `acquire()` / `release()` so AgentHandlers can cleanly gate
 *    both `agent:run` (fire-and-forget) and `agent:autonomous` (invoke) calls.
 * 4. Provides `getStatus()` for debugging and the `agent:get-stats` handler.
 *
 * Design Notes
 * ──────────────────────────────────────────────────────────────────────
 * - Zero external dependencies (no timers package, no semaphores).
 * - Thread-safe within the single-threaded Node.js main process.
 * - Release via explicit call OR via the returned "auto-release" token pattern.
 * - COOLDOWN_MS is short (800 ms) — long enough to absorb Enter-repeat or
 *   double-click, short enough not to annoy the user.
 */

const COOLDOWN_MS = 800; // minimum gap between two agent invocations

let _running = false;        // true while an agent task is executing
let _coolUntil = 0;            // timestamp until which new requests are blocked
let _droppedCount = 0;         // total rejected-while-busy requests (for telemetry)

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Try to acquire the agent execution slot.
 *
 * @param {string} channel  - IPC channel name, for logging only.
 * @returns {{ acquired: boolean, reason?: string }}
 */
export function acquire(channel = 'agent') {
    const now = Date.now();

    if (_running) {
        _droppedCount++;
        console.warn(`[IPCGuard] Blocked "${channel}" — agent already running.`);
        return { acquired: false, reason: 'already_running' };
    }

    if (now < _coolUntil) {
        _droppedCount++;
        const remaining = (_coolUntil - now);
        console.warn(`[IPCGuard] Blocked "${channel}" — cooldown active (${remaining}ms remaining).`);
        return { acquired: false, reason: 'cooldown', remaining };
    }

    _running = true;
    console.log(`[IPCGuard] Acquired slot for "${channel}".`);
    return { acquired: true };
}

/**
 * Release the agent execution slot and start the cooldown timer.
 * Should be called in the `finally` block of every agent handler.
 */
export function release(channel = 'agent') {
    if (!_running) {
        // Harmless extra call — guard is idempotent.
        return;
    }
    _running = false;
    _coolUntil = Date.now() + COOLDOWN_MS;
    console.log(`[IPCGuard] Released slot for "${channel}". Cooldown until +${COOLDOWN_MS}ms.`);
}

/**
 * Force-release without cooldown (used by agent:cancel-autonomous).
 * Allows immediate re-submission after cancellation.
 */
export function forceRelease(channel = 'agent') {
    _running = false;
    _coolUntil = 0;
    console.log(`[IPCGuard] Force-released slot for "${channel}" (no cooldown).`);
}

/**
 * Snapshot of the current guard state, merged into agent:get-stats.
 */
export function getStatus() {
    return {
        isSlotBusy: _running,
        cooldownActive: Date.now() < _coolUntil,
        cooldownRemainingMs: Math.max(0, _coolUntil - Date.now()),
        droppedRequests: _droppedCount,
    };
}

/**
 * Reset counter (useful for tests / dev restarts).
 */
export function resetStats() {
    _droppedCount = 0;
}
