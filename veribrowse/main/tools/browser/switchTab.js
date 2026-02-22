/**
 * switchTab.js
 * 
 * Switches the active User Tab.
 * Hides the current BrowserView and shows/positions the new one.
 * ZERO LLM calls.
 */

import { BrowserWindow } from 'electron';
import bus from '../../core/EventBus.js';

export default async function switchTab(tabId) {
    try {
        console.log(`[Tool:SwitchTab] Switching to tab: ${tabId}`);

        const win = BrowserWindow.getAllWindows()[0];
        if (!win) throw new Error('Main window not found');

        const entry = global.userTabsMap.get(tabId);
        if (!entry) throw new Error(`User tab ${tabId} not found in global map.`);

        const { electronBrowserView: targetView } = entry;

        // 1. Hide all existing BrowserViews
        for (const [id, data] of global.userTabsMap.entries()) {
            if (data.electronBrowserView) {
                win.removeBrowserView(data.electronBrowserView);
            }
        }

        // 2. Add the target BrowserView
        win.setBrowserView(targetView);

        // 3. Position the BrowserView (Renderer will send actual bounds via IPC, 
        // but we use a safe default here or just preserve existing).
        // The actual setBounds call usually happens in the browserHandlers.js or resize listener.

        // 4. Notify renderer
        bus.emit('browser:user-tab-switched', { tabId });

        return {
            success: true,
            result: { activeTabId: tabId },
            error: null
        };
    } catch (err) {
        console.error(`[Tool:SwitchTab] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message
        };
    }
}
