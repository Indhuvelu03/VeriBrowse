/**
 * newTab.js
 * 
 * Creates a new Playwright page and (optionally) an Electron BrowserView.
 * ZERO LLM calls.
 * 
 * Distinguishes between User Tabs (visible) and Shadow Tabs (agent head-only).
 */

import { v4 as uuidv4 } from 'uuid';
import bus from '../../core/EventBus.js';
import browserManager from '../../core/BrowserManager.js';

export default async function newTab(context, { url = 'about:blank', type = 'user', purpose = null }) {
    try {
        const tabId = `${type}-${uuidv4().slice(0, 8)}`;
        console.log(`[Tool:NewTab] Creating ${type} tab: ${tabId} (${url})`);

        // 1. Create Playwright Page
        const page = await context.newPage();

        if (url !== 'about:blank') {
            await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(e => console.warn(e.message));
        }

        const tabObject = {
            id: tabId,
            url: page.url(),
            title: await page.title(),
            favicon: null,
            isLoading: false,
            type,
            purpose
        };

        if (type === 'user') {
            // 2. Register tab in BrowserManager so ensureBrowserView can find it
            global.userTabsMap.set(tabId, {
                playwrightPage: page,
                url: tabObject.url,
                title: tabObject.title,
                type: 'user'
            });

            // 3. Create WebContentsView via BrowserManager (hidden at 0,0 until renderer resizes)
            const view = browserManager.ensureBrowserView(tabId);

            // 4. Load URL in the WebContentsView so the visible tab isn't blank
            if (view && url !== 'about:blank') {
                view.webContents.loadURL(url).catch(e =>
                    console.warn('[Tool:NewTab] WebContentsView loadURL failed:', e.message)
                );
            }

            // Notify renderer
            bus.emit('browser:user-tab-created', tabObject);
        } else {
            // Shadow Tab: Playwright only
            global.shadowTabsMap.set(tabId, { playwrightPage: page });

            // Notify renderer
            bus.emit('browser:shadow-tab-created', tabObject);
        }

        return {
            success: true,
            result: { tabId, url: tabObject.url },
            error: null
        };
    } catch (err) {
        console.error(`[Tool:NewTab] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message
        };
    }
}
