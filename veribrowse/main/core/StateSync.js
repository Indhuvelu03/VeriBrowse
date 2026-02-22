/**
 * StateSync.js
 *
 * Event-driven state synchronisation between Playwright pages and the renderer tab bar.
 *
 * Replaces the old polling-based approach with Playwright's native page events:
 *   - framenavigated → URL / title update (covers SPA routing AND full navigations)
 *   - load            → final URL + title after full page load  
 *   - domcontentloaded→ early isLoading=true signal
 *   - request / requestfinished / requestfailed → loading spinner control
 *   - close           → cleanup on page destruction
 *
 * Key improvements over the old code:
 *   1. Uses BrowserManager singleton instead of global.* — no race conditions.
 *   2. Deduplicated framenavigated + load notifications via _lastEmittedUrl tracking.
 *   3. Debounced request-counter spinner to avoid flicker on multi-request pages.
 *   4. WebContentsView sync is done only for user tabs with an existing view;
 *      shadow tabs are silently skipped.
 *
 * Usage:
 *   import { attachStateSync } from './StateSync.js';
 *   attachStateSync(playwrightPage, tabId);
 *
 * ZERO LLM calls.
 */

import browserManager from './BrowserManager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Safely reads page.title() — returns URL as fallback if the execution
 * context is destroyed mid-navigation.
 */
async function safeTitle(page) {
    try {
        return await page.title();
    } catch {
        try { return page.url(); } catch { return ''; }
    }
}

/**
 * Push a tab-updated event to the renderer via BrowserManager.
 */
function notifyRenderer(tabId, payload) {
    const isShadow = tabId.startsWith('shadow-');
    const channel = isShadow ? 'browser:shadow-tab-updated' : 'browser:user-tab-updated';
    browserManager.sendToRenderer(channel, { tabId, ...payload });
}

/**
 * Synchronise the Electron WebContentsView URL for the given tab.
 * Only acts if a view already exists; never creates one.
 * Shadow tabs have no view — this no-ops silently for them.
 */
async function syncView(tabId, url) {
    try {
        const entry = browserManager.userTabs.get(tabId);
        const view = entry?.electronBrowserView;
        if (view && !view.webContents.isDestroyed()) {
            await view.webContents.loadURL(url);
        }
    } catch (e) {
        console.warn(`[StateSync:${tabId}] WebContentsView sync failed: ${e.message}`);
    }
}

// ─── Core ──────────────────────────────────────────────────────────────────

/**
 * Attach event-driven state sync to a Playwright page.
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

    // Track the last URL we emitted to avoid duplicate renderer updates
    // when both 'framenavigated' and 'load' fire for the same navigation.
    let _lastEmittedUrl = null;

    // Request counter for the loading spinner
    let _activeRequests = 0;
    let _spinnerTimer = null;

    // ── framenavigated: fires after every navigation (SPA-friendly) ──────────
    page.on('framenavigated', async (frame) => {
        if (frame !== page.mainFrame()) return;

        const url = page.url();
        const title = await safeTitle(page);

        console.log(`${tag} framenavigated → ${url}`);

        // Sync the Electron view only if the URL actually changed
        if (url !== _lastEmittedUrl) {
            syncView(tabId, url);
            _lastEmittedUrl = url;
        }

        notifyRenderer(tabId, { url, title, isLoading: false });

        // Update BrowserManager's in-memory tab entry
        const isShadow = tabId.startsWith('shadow-');
        const map = isShadow ? browserManager.shadowTabs : browserManager.userTabs;
        const existing = map.get(tabId);
        if (existing) {
            map.set(tabId, { ...existing, url, title });
        }
    });

    // ── load: reliable "page fully loaded" signal ─────────────────────────────
    page.on('load', async () => {
        const url = page.url();
        const title = await safeTitle(page);

        console.log(`${tag} load → ${url}`);

        // Deduplicate with framenavigated (they often fire within ms of each other)
        if (url !== _lastEmittedUrl) {
            syncView(tabId, url);
            _lastEmittedUrl = url;
        }

        notifyRenderer(tabId, { url, title, isLoading: false });

        const isShadow = tabId.startsWith('shadow-');
        const map = isShadow ? browserManager.shadowTabs : browserManager.userTabs;
        const existing = map.get(tabId);
        if (existing) {
            map.set(tabId, { ...existing, url, title });
        }
    });

    // ── domcontentloaded: early "loading" signal ──────────────────────────────
    page.on('domcontentloaded', async () => {
        const url = page.url();
        console.log(`${tag} domcontentloaded → ${url}`);
        notifyRenderer(tabId, { url, isLoading: true });
    });

    // ── Request tracking: spinner management ──────────────────────────────────
    // We debounce the "done" notification by 100ms to prevent flicker
    // when multiple resources finish near-simultaneously.
    page.on('request', () => {
        _activeRequests++;
        if (_activeRequests === 1) {
            notifyRenderer(tabId, { isLoading: true });
        }
    });

    function onRequestDone() {
        _activeRequests = Math.max(0, _activeRequests - 1);
        if (_activeRequests === 0) {
            clearTimeout(_spinnerTimer);
            _spinnerTimer = setTimeout(async () => {
                const url = page.url();
                const title = await safeTitle(page);
                notifyRenderer(tabId, { url, title, isLoading: false });
            }, 100);
        }
    }

    page.on('requestfinished', onRequestDone);
    page.on('requestfailed', onRequestDone);

    // ── close: cleanup ────────────────────────────────────────────────────────
    page.on('close', () => {
        clearTimeout(_spinnerTimer);
        console.log(`${tag} Page closed.`);
        notifyRenderer(tabId, { isLoading: false });
    });

    console.log(`${tag} Event-driven state sync attached.`);
}

/**
 * Attach state sync to ALL currently registered user tabs.
 * Called by BrowserManager.init() once Playwright is ready.
 */
export function attachStateSyncToAllTabs() {
    for (const [tabId, entry] of browserManager.userTabs) {
        if (entry.playwrightPage && !entry.playwrightPage.isClosed()) {
            attachStateSync(entry.playwrightPage, tabId);
        }
    }
}
