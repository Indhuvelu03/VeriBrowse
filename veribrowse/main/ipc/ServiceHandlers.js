import { ipcMain } from 'electron';
import Store from 'electron-store';
import * as CreditGuard from '../core/CreditGuard.js';
import * as SupabaseService from '../services/SupabaseService.js';
import { deriveSkillName } from '../core/agent/SkillMemory.js';

const store = new Store();

/**
 * serviceHandlers.js
 * 
 * Handles IPC events for settings, credits, and chat services.
 */

export function registerServiceHandlers() {
    ipcMain.handle('settings:get', (event, key) => store.get(key));
    ipcMain.on('settings:set', (event, { key, value }) => store.set(key, value));

    ipcMain.handle('profile:get', () => store.get('userProfile') || {});
    ipcMain.on('profile:set', (event, profile) => store.set('userProfile', profile));
    ipcMain.handle('credits:get-stats', () => CreditGuard.getStats());
    // Note: 'agent:get-stats' is registered in AgentHandlers.js (includes IPCGuard status)

    ipcMain.handle('chat:add-message', async (event, { sessionId, role, content }) => {
        return await SupabaseService.addChatMessage(sessionId, role, content).catch((e) => {
            console.warn('[Main] chat:add-message failed (Supabase not configured?):', e.message);
            return null;
        });
    });

    ipcMain.handle('chat:get-messages', async (event, sessionId) => {
        return await SupabaseService.getChatHistory(sessionId).catch(() => []);
    });

    // --- AGENT SKILLS ---
    ipcMain.handle('skills:get-all', async () => {
        return await SupabaseService.getAllSkills().catch(() => []);
    });

    ipcMain.handle('skills:delete', async (event, id) => {
        return await SupabaseService.deleteSkill(id).catch(() => null);
    });

    ipcMain.handle('skills:save', async (event, { domain, goal, steps }) => {
        return await SupabaseService.saveSkill(domain, deriveSkillName(goal), goal, steps).catch(() => null);
    });
}
