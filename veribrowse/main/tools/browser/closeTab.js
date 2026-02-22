/**
 * closeTab.js
 * 
 * Destroys a Playwright page and its associated Electron BrowserView.
 * ZERO LLM calls.
 */

import { BrowserWindow } from 'electron';
import bus from '../../core/EventBus.js';

export default async function closeTab(tabId) {
    try {
        console.log(`[Tool:CloseTab] Closing tab: ${tabId}`);

        const isUserTab = tabId.startsWith('user-');
        const map = isUserTab ? global.userTabsMap : global.shadowTabsMap;
        const entry = map.get(tabId);

        if (!entry) {
            console.warn(`[Tool:CloseTab] Tab ${tabId} not found.`);
            return { success: true, result: 'Tab already closed', error: null };
        }

        const { playwrightPage, electronBrowserView } = entry;

        // 1. Unmount BrowserView if it exists
        if (electronBrowserView) {
            const win = BrowserWindow.getAllWindows()[0];
            if (win) win.removeBrowserView(electronBrowserView);
            // BrowserViews don't have a simple .destroy(), but removing all references 
            // allows for GC. Some versions of Electron require special cleanup.
        }

        // 2. Close Playwright Page
        if (playwrightPage) {
            await playwrightPage.close().catch(e => console.warn('Page close err:', e.message));
        }

        // 3. Remove from map
        map.delete(tabId);

        // 4. Notify renderer
        const event = isUserTab ? 'browser:user-tab-closed' : 'browser:shadow-tab-closed';
        bus.emit(event, { tabId });

        return {
            success: true,
            result: `Closed tab ${tabId}`,
            error: null
        };
    } catch (err) {
        console.error(`[Tool:CloseTab] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message
        };
    }
}
