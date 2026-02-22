/**
 * newTab.js
 * 
 * Creates a new Playwright page and (optionally) an Electron BrowserView.
 * ZERO LLM calls.
 * 
 * Distinguishes between User Tabs (visible) and Shadow Tabs (agent head-only).
 */

import { v4 as uuidv4 } from 'uuid';
import { BrowserView } from 'electron';
import bus from '../../core/EventBus.js';

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
            // 2. Create Electron BrowserView for User Tab
            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            // FIX A: Attach view to the main window so it's actually visible
            global.mainWindow.addBrowserView(view);

            // Set initial bounds — renderer can adjust via 'browser:resize-viewport'
            const bounds = global.mainWindow.getBounds();
            view.setBounds({
                x: 48,
                y: 128,
                width: bounds.width - 48,
                height: bounds.height - 128
            });

            // FIX B: Load the URL in the BrowserView so the visible tab isn't blank
            if (url !== 'about:blank') {
                view.webContents.loadURL(url).catch(e =>
                    console.warn('[Tool:NewTab] BrowserView loadURL failed:', e.message)
                );
            }

            // Map Playwright page to BrowserView is handled in background.js via the global maps
            global.userTabsMap.set(tabId, { playwrightPage: page, electronBrowserView: view });

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
