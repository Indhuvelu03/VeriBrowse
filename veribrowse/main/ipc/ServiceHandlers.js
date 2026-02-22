import { ipcMain } from 'electron';
import Store from 'electron-store';
import * as CreditGuard from '../core/CreditGuard.js';
import * as AgentRuntime from '../core/agent/AgentRuntime.js';
import * as SupabaseService from '../services/SupabaseService.js';

const store = new Store();

/**
 * serviceHandlers.js
 * 
 * Handles IPC events for settings, credits, and chat services.
 */

export function registerServiceHandlers() {
    ipcMain.handle('settings:get', (event, key) => store.get(key));
    ipcMain.on('settings:set', (event, { key, value }) => store.set(key, value));
    ipcMain.handle('credits:get-stats', () => CreditGuard.getStats());
    ipcMain.handle('agent:get-stats', () => AgentRuntime.getStats());

    ipcMain.handle('chat:add-message', async (event, { sessionId, role, content }) => {
        return await SupabaseService.addChatMessage(sessionId, role, content).catch((e) => {
            console.warn('[Main] chat:add-message failed (Supabase not configured?):', e.message);
            return null;
        });
    });

    ipcMain.handle('chat:get-messages', async (event, sessionId) => {
        return await SupabaseService.getChatHistory(sessionId).catch(() => []);
    });
}
