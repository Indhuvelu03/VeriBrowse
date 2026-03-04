/**
 * newTab.js
 *
 * Creates a new Playwright page and (optionally) an Electron BrowserView.
 * ZERO LLM calls.
 *
 * Distinguishes between User Tabs (visible) and Shadow Tabs (agent head-only).
 *
 * FIX: All tabs now go through BrowserManager.createUserTab() /
 * createShadowTab() which auto-attach StateSync. Previously, direct use of
 * global.userTabsMap bypassed this, leaving new tabs with no URL/title sync.
 */

import { v4 as uuidv4 } from 'uuid';
import bus from '../../core/EventBus.js';
import browserManager from '../../core/BrowserManager.js';

export default async function newTab(context, { url = 'about:blank', type = 'user', purpose = null }) {
    try {
        const tabId = `${type}-${uuidv4().slice(0, 8)}`;
        console.log(`[Tool:NewTab] Creating ${type} tab: ${tabId} (${url})`);

        if (type === 'user') {
            // createUserTab() creates the Playwright page AND wires StateSync — fixes the
            // "new tabs never sync URL/title" bug caused by raw global.userTabsMap.set().
            const page = await browserManager.createUserTab(tabId, url);

            const tabObject = {
                id: tabId,
                url: page.url(),
                title: await page.title().catch(() => 'New Tab'),
                favicon: null,
                isLoading: false,
                type,
                purpose,
            };

            // Create and load the visible WebContentsView
            const view = browserManager.ensureBrowserView(tabId);
            if (view && tabObject.url !== 'about:blank') {
                view.webContents.loadURL(tabObject.url).catch(e =>
                    console.warn('[Tool:NewTab] WebContentsView loadURL failed:', e.message)
                );
            }

            // Notify renderer
            bus.emit('browser:user-tab-created', tabObject);

        } else {
            // Shadow Tab: Playwright only — createShadowTab() also wires StateSync
            // so agent progress (URL changes) show up as status updates.
            await browserManager.createShadowTab(tabId);

            bus.emit('browser:shadow-tab-created', {
                id: tabId,
                url: 'about:blank',
                title: 'Shadow Tab',
                favicon: null,
                isLoading: false,
                type,
                purpose,
            });
        }

        return {
            success: true,
            result: { tabId, url },
            error: null,
        };
    } catch (err) {
        console.error(`[Tool:NewTab] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}
