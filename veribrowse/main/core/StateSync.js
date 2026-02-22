/**
 * stateSync.js
 *
 * Real-time State Sync between Playwright pages and Electron BrowserViews.
 *
 * Attaches event listeners to every Playwright page so that navigations,
 * title changes, URL changes, and loading states are automatically mirrored
 * to the corresponding Electron BrowserView and the renderer tab bar.
 *
 * Usage:
 *   import { attachStateSync } from './stateSync.js';
 *   attachStateSync(playwrightPage, tabId);
 *
 * ZERO LLM calls.
 */

/**
 * Safely reads the title from a page — returns the URL as fallback
 * if the execution context was destroyed mid-navigation.
 */
async function safeTitle(page) {
    try {
        return await page.title();
    } catch {
        try { return page.url(); } catch { return ''; }
    }
}

/**
 * Sends a tab-updated IPC event to the renderer process.
 */
function notifyRenderer(tabId, payload) {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('browser:user-tab-updated', {
            tabId,
            ...payload,
        });
    }
}

/**
 * Loads a URL in the Electron BrowserView tied to this tab, if one exists.
 * Silently ignores failures (the view may not exist yet for shadow tabs).
 */
async function syncBrowserView(tabId, url) {
    const view = global.ensureBrowserView?.(tabId);
    if (view && !view.webContents.isDestroyed()) {
        try {
            await view.webContents.loadURL(url);
        } catch (e) {
            console.warn(`[StateSync] BrowserView loadURL failed for ${tabId}: ${e.message}`);
        }
    }
}

/**
 * Attach real-time state sync listeners to a Playwright page.
 * Safe to call multiple times — guards against double-attach.
 *
 * @param {import('playwright').Page} page
 * @param {string}                    tabId
 */
export function attachStateSync(page, tabId) {
    // Guard: don't attach twice
    if (page.__stateSyncAttached) return;
    page.__stateSyncAttached = true;

    const tag = `[StateSync:${tabId}]`;

    // ── framenavigated: fires after every same-page or cross-origin navigation ──
    page.on('framenavigated', async (frame) => {
        // Only react to the main frame
        if (frame !== page.mainFrame()) return;

        const url = page.url();
        const title = await safeTitle(page);

        console.log(`${tag} framenavigated → ${url}`);

        syncBrowserView(tabId, url);
        notifyRenderer(tabId, { url, title, isLoading: false });
    });

    // ── load: reliable "page fully loaded" signal ──
    page.on('load', async () => {
        const url = page.url();
        const title = await safeTitle(page);

        console.log(`${tag} load → ${url}`);

        syncBrowserView(tabId, url);
        notifyRenderer(tabId, { url, title, isLoading: false });
    });

    // ── domcontentloaded: early "DOM ready" signal ──
    page.on('domcontentloaded', async () => {
        const url = page.url();
        console.log(`${tag} domcontentloaded → ${url}`);

        notifyRenderer(tabId, { url, isLoading: true });
    });

    // ── Request tracking: show loading spinner while fetching ──
    let activeRequests = 0;

    page.on('request', () => {
        if (activeRequests === 0) {
            notifyRenderer(tabId, { isLoading: true });
        }
        activeRequests++;
    });

    page.on('requestfinished', async () => {
        activeRequests = Math.max(0, activeRequests - 1);
        if (activeRequests === 0) {
            const url = page.url();
            const title = await safeTitle(page);
            notifyRenderer(tabId, { url, title, isLoading: false });
        }
    });

    page.on('requestfailed', () => {
        activeRequests = Math.max(0, activeRequests - 1);
        if (activeRequests === 0) {
            notifyRenderer(tabId, { isLoading: false });
        }
    });

    // ── close: clean up when the Playwright page is destroyed ──
    page.on('close', () => {
        console.log(`${tag} Page closed.`);
        notifyRenderer(tabId, { isLoading: false });
    });

    console.log(`${tag} State sync listeners attached.`);
}

/**
 * Convenience: attach state sync to ALL currently registered user tabs.
 * Call once after Playwright context is ready and userTabsMap is populated.
 */
export function attachStateSyncToAllTabs() {
    if (!global.userTabsMap) return;
    for (const [tabId, entry] of global.userTabsMap.entries()) {
        if (entry.playwrightPage) {
            attachStateSync(entry.playwrightPage, tabId);
        }
    }
}
