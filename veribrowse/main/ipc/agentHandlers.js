import { ipcMain } from 'electron';
import bus from '../core/EventBus.js';
import * as AgentRuntime from '../core/agent/AgentRuntime.js';

/**
 * agentHandlers.js
 *
 * IPC handlers for agent lifecycle events.
 * Called from background.js at startup.
 */

export function registerAgentHandlers() {
    ipcMain.on('agent:run', (event, { goal, mode }) => {
        bus.emit('workflow:start', { goal, mode, context: { currentUrl: 'about:blank' } });
    });

    ipcMain.handle('agent:autonomous', async (event, { goal }) => {
        console.log(`[IPC:autonomous] Starting autonomous loop for: "${goal}"`);

        // Resolve which page to use (same logic as BrowserAgent)
        const tabId = global.activeTabId || Array.from(global.userTabsMap.keys())[0];
        const entry = global.userTabsMap.get(tabId);
        if (!entry?.playwrightPage) {
            bus.emit('agent:error', { error: 'No browser tab available. Open a tab first.' });
            return { success: false, error: 'No page' };
        }
        const page = entry.playwrightPage;

        try {
            const { success, result } = await AgentRuntime.start(page, goal);
            return { success, result };
        } catch (err) {
            console.error('[IPC:autonomous] Runtime error:', err.message);
            bus.emit('agent:error', { error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.on('agent:cancel-autonomous', () => {
        AgentRuntime.cancel();
    });

    /**
     * HITL Resume
     * HITLCard.jsx calls window.electronAPI.resumeAgent()
     * which sends 'agent:resume' via ipcRenderer.invoke.
     * This handler forwards the signal to the WorkflowEngine via the EventBus.
     */
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
}

