import { ipcMain } from 'electron';
import bus from '../core/EventBus.js';
import * as AgentRuntime from '../core/agent/AgentRuntime.js';
import browserManager from '../core/BrowserManager.js';
import * as IPCGuard from '../core/IPCGuard.js';

/**
 * AgentHandlers.js
 *
 * IPC handlers for agent lifecycle events.
 *
 * Rate Limiting (Bug #7 — IPC Backpressure)
 * ──────────────────────────────────────────
 * `agent:run` and `agent:autonomous` are gated by IPCGuard.
 * If the agent is already executing or within the post-task cooldown window:
 *   - `agent:run`        → silently dropped (fire-and-forget, renderer already has isRunning=true)
 *   - `agent:autonomous` → returns { success: false, reason: 'busy' } to caller
 * The slot is automatically released in finally{} so crashes can't permanently
 * jam the guard.
 *
 * Cancellation
 * ────────────
 * `agent:cancel-autonomous` triggers a force-release (no cooldown) so the user
 * can immediately re-submit a fresh task after cancelling.
 */

export function registerAgentHandlers() {

    // ── agent:run ─────────────────────────────────────────────────────────────
    // Fire-and-forget. The renderer sets isRunning=true before sending this,
    // so it only sees the result via EventBus events (agent:status, agent:error, etc.)
    ipcMain.on('agent:run', (event, { goal, mode }) => {
        const { acquired, reason } = IPCGuard.acquire('agent:run');
        if (!acquired) {
            // Inform the renderer so it can reset its UI state if needed
            bus.emit('agent:rate-limited', { channel: 'agent:run', reason });
            return;
        }

        // Pass current page context to WorkflowEngine for intent classification
        const { entry } = browserManager.getActiveTab();
        const currentUrl = entry?.url || 'about:blank';
        const currentTitle = entry?.title || '';

        // Release is handled by WorkflowEngine/AgentRuntime via EventBus listeners
        // (agent:autonomous-done, agent:error, agent:chat-response).
        // We register a one-time release listener to be safe.
        const releaseOnce = () => IPCGuard.release('agent:run');
        bus.once('agent:autonomous-done', releaseOnce);
        bus.once('agent:chat-response', releaseOnce);
        bus.once('agent:error', releaseOnce);

        bus.emit('workflow:start', { goal, mode, context: { currentUrl, currentTitle } });
    });

    // ── agent:autonomous ──────────────────────────────────────────────────────
    // Used by direct autonomous invocations (e.g., AgentPanel "Act" mode bypass).
    ipcMain.handle('agent:autonomous', async (event, { goal }) => {
        console.log(`[IPC:autonomous] Starting autonomous loop for: "${goal}"`);

        const { acquired, reason } = IPCGuard.acquire('agent:autonomous');
        if (!acquired) {
            console.warn(`[IPC:autonomous] Rejected — ${reason}`);
            return { success: false, error: 'Agent is busy. Please wait for the current task to finish.', reason };
        }

        const page = browserManager.getActivePage();
        if (!page) {
            IPCGuard.release('agent:autonomous');
            bus.emit('agent:error', { error: 'No browser tab available. Open a tab first.' });
            return { success: false, error: 'No page' };
        }

        try {
            const { success, result } = await AgentRuntime.start(page, goal);
            return { success, result };
        } catch (err) {
            console.error('[IPC:autonomous] Runtime error:', err.message);
            bus.emit('agent:error', { error: err.message });
            return { success: false, error: err.message };
        } finally {
            IPCGuard.release('agent:autonomous');
        }
    });

    // ── agent:cancel-autonomous ───────────────────────────────────────────────
    // Force-release so the user can immediately re-submit after cancelling.
    ipcMain.on('agent:cancel-autonomous', () => {
        AgentRuntime.cancel();
        IPCGuard.forceRelease('agent:cancel-autonomous');
    });

    // ── agent:resume ──────────────────────────────────────────────────────────
    // HITL Resume — HITLCard.jsx calls window.electronAPI.agent.resume().
    // This is NOT gated by IPCGuard because HITL resume is not a new task start;
    // it simply unblocks the already-running workflow.
    ipcMain.handle('agent:resume', async (event) => {
        try {
            console.log('[IPC:agentHandlers] agent:resume received — unblocking workflow.');
            bus.emit('workflow:resume');
            return { success: true };
        } catch (error) {
            console.error('[IPC:agentHandlers] agent:resume failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    // ── agent:get-stats ───────────────────────────────────────────────────────
    // Exposes runtime telemetry (guard status + agent internals) to the renderer.
    ipcMain.handle('agent:get-stats', () => {
        return {
            ...AgentRuntime.getStats(),
            ipcGuard: IPCGuard.getStatus(),
        };
    });
}
