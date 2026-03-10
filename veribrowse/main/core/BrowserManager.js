/**
 * BrowserManager.js
 *
 * Singleton that owns ALL Playwright and Electron BrowserView state.
 * Replaces the scattered `global.*` variables with a proper lifecycle-managed object.
 *
 * Key responsibilities:
 *   - Launches Playwright headless Chromium
 *   - Manages user tabs (visible) and shadow tabs (agent background work)
 *   - Creates / manages Electron BrowserViews per tab
 *   - Provides getActivePage() for agents and tools
 *
 * BACKWARD COMPAT: Also writes to global.* so existing tools (navigate.js, click.js, etc.)
 * keep working without rewriting every file at once. As tools are migrated, global.* usage
 * should be removed.
 */

import { WebContentsView } from 'electron';
import { chromium } from 'playwright';
import bus from './EventBus.js';
// StateSync is imported lazily to avoid circular imports (StateSync imports BrowserManager)
let _attachStateSync = null;
async function getAttachStateSync() {
    if (!_attachStateSync) {
        const mod = await import('./StateSync.js');
        _attachStateSync = mod.attachStateSync;
    }
    return _attachStateSync;
}

const AD_BLOCK_PATTERNS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.',
    'adnxs.com',
    'taboola.com',
    'outbrain.com',
    'zedo.com',
    'criteo.com',
    '/aclk?',
];

function isAdOrSponsoredRequest(url = '') {
    const u = String(url || '').toLowerCase();
    return AD_BLOCK_PATTERNS.some((p) => u.includes(p));
}

class BrowserManager {
    constructor() {
        /** @type {Map<string, { playwrightPage: import('playwright').Page, electronBrowserView?: WebContentsView, url: string, title: string, type: string }>} */
        this.userTabs = new Map();

        /** @type {Map<string, { playwrightPage: import('playwright').Page }>} */
        this.shadowTabs = new Map();

        /** @type {import('playwright').Browser | null} */
        this.browser = null;

        /** @type {import('playwright').BrowserContext | null} */
        this.context = null;

        /** @type {import('electron').BrowserWindow | null} */
        this.mainWindow = null;

        /** @type {string | null} */
        this.activeTabId = null;

        // Sync to global.* for backward compat with tools
        this._syncGlobals();
    }

    // ─── Backward Compat ────────────────────────────────────────────────

    /** Keep global.* references pointing at our internal Maps / values. */
    _syncGlobals() {
        global.userTabsMap = this.userTabs;
        global.shadowTabsMap = this.shadowTabs;
        global.playwrightBrowser = this.browser;
        global.playwrightContext = this.context;
        global.mainWindow = this.mainWindow;
        global.activeTabId = this.activeTabId;
        global.ensureBrowserView = (tabId) => this.ensureBrowserView(tabId);
    }

    // ─── Initialization ─────────────────────────────────────────────────

    /**
     * Set the main Electron window reference.
     * Called from background.js after createWindow().
     */
    setMainWindow(win) {
        this.mainWindow = win;
        global.mainWindow = win;
    }

    /**
     * Launch Playwright and create the initial user tab.
     * Called from background.js after the window is ready.
     */
    async init() {
        this.browser = await chromium.launch({
            headless: true,
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        });

        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        });

        // Suppress ad/sponsored network noise globally for all tabs.
        await this.context.route('**/*', async (route) => {
            try {
                const req = route.request();
                const url = req.url();
                const type = req.resourceType();
                const nav = req.isNavigationRequest();
                const blocked = isAdOrSponsoredRequest(url);

                // Never block first-party document loads unless the target is a known ad redirect endpoint.
                const isAdRedirectDoc = nav && (
                    String(url).toLowerCase().includes('/aclk?') ||
                    String(url).toLowerCase().includes('googleadservices.com')
                );

                if (blocked && (type !== 'document' || isAdRedirectDoc)) {
                    await route.abort('blockedbyclient').catch(() => route.abort());
                    return;
                }
            } catch {
                // fall through to continue
            }
            await route.continue();
        });
        console.log('[BrowserManager] Network ad filter enabled');

        // Sync globals after context is ready
        global.playwrightBrowser = this.browser;
        global.playwrightContext = this.context;

        // Create the initial user tab (no BrowserView yet — created on first navigate)
        const initialPage = await this.context.newPage();
        this.userTabs.set('user-1', {
            playwrightPage: initialPage,
            url: 'about:blank',
            title: 'New Tab',
            type: 'user',
        });
        this.activeTabId = 'user-1';
        global.activeTabId = 'user-1';

        // ── Wire event-driven StateSync to the initial tab ──────────────────
        //    This replaces the old polling approach and ensures navigations,
        //    title changes, and loading states are pushed to the renderer.
        const attach = await getAttachStateSync();
        attach(initialPage, 'user-1');
        console.log('[BrowserManager] StateSync wired to initial tab: user-1');
        // ────────────────────────────────────────────────────────────────────

        // Announce the initial tab to the renderer (delay for mount)
        setTimeout(() => {
            this.sendToRenderer('browser:user-tab-created', {
                id: 'user-1',
                url: 'about:blank',
                title: 'New Tab',
                favicon: null,
                isLoading: false,
            });
            console.log('[BrowserManager] Announced user-1 tab to renderer');
        }, 2000);

        console.log('[BrowserManager] Playwright initialized — initial tab: user-1');
    }

    // ─── Tab Management ──────────────────────────────────────────────────

    /**
     * Create a new user tab with a Playwright page AND StateSync attached.
     * Replaces the inline context.newPage() calls in BrowserHandlers.
     *
     * @param {string} tabId
     * @param {string} [url='about:blank']
     * @returns {Promise<import('playwright').Page>}
     */
    async createUserTab(tabId, url = 'about:blank') {
        if (!this.context) throw new Error('[BrowserManager] Playwright not initialized');

        const page = await this.context.newPage();
        this.userTabs.set(tabId, { playwrightPage: page, url, title: 'New Tab', type: 'user' });
        this.setActiveTab(tabId, { emit: false });

        // Auto-wire StateSync so navigations are always tracked
        const attach = await getAttachStateSync();
        attach(page, tabId);

        if (url !== 'about:blank') {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
        }

        console.log(`[BrowserManager] User tab created with StateSync: ${tabId}`);
        return page;
    }

    // ─── Tab Queries ────────────────────────────────────────────────────

    /**
     * Get the Playwright page for the currently active tab.
     * Falls back to the first available user tab.
     */
    getActivePage() {
        const tabId = this.activeTabId || Array.from(this.userTabs.keys())[0];
        return this.userTabs.get(tabId)?.playwrightPage || null;
    }

    /**
     * Get a Playwright page by tab ID.
     */
    getPage(tabId) {
        const entry =
            this.userTabs.get(tabId) || this.shadowTabs.get(tabId);
        return entry?.playwrightPage || null;
    }

    /**
     * Get the active tab ID and its entry.
     */
    getActiveTab() {
        const tabId = this.activeTabId || Array.from(this.userTabs.keys())[0];
        const entry = this.userTabs.get(tabId);
        return { tabId, entry };
    }

    /**
     * Mark a user tab as active and optionally notify the renderer.
     * Also hides all other user WebContentsViews to prevent native-layer overlap.
     */
    setActiveTab(tabId, { emit = true } = {}) {
        if (!tabId || !this.userTabs.has(tabId)) return false;
        this.activeTabId = tabId;
        global.activeTabId = tabId;
        this.hideNonActiveViews(tabId);
        if (emit) {
            this.sendToRenderer('browser:user-tab-switched', { tabId });
        }
        return true;
    }

    /**
     * Hide every user tab native view except the active one.
     * This guarantees one visible browser surface at a time.
     */
    hideNonActiveViews(activeTabId = this.activeTabId) {
        for (const [id, entry] of this.userTabs.entries()) {
            if (id === activeTabId) continue;
            if (entry?.electronBrowserView) {
                try {
                    entry.electronBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
                } catch { }
            }
        }
    }

    // ─── Shadow Tabs (Z-Axis Background Workspace) ─────────────────────

    /**
     * Create a shadow tab for background agent work.
     * Shadow tabs have NO BrowserView — they're invisible to the user.
     */
    async createShadowTab(tabId) {
        if (!this.context) throw new Error('[BrowserManager] Playwright not initialized');

        const page = await this.context.newPage();
        this.shadowTabs.set(tabId, { playwrightPage: page, url: 'about:blank', title: 'Shadow Tab', type: 'shadow' });

        // Wire StateSync so the agent's work is visible as status updates
        const attach = await getAttachStateSync();
        attach(page, tabId);

        this.sendToRenderer('browser:shadow-tab-created', { id: tabId, url: 'about:blank', title: 'Shadow Tab' });
        console.log(`[BrowserManager] Shadow tab created: ${tabId}`);
        return page;
    }

    /**
     * Close a shadow tab.
     */
    async closeShadowTab(tabId) {
        const entry = this.shadowTabs.get(tabId);
        if (!entry) return;

        if (entry.playwrightPage && !entry.playwrightPage.isClosed()) {
            await entry.playwrightPage.close().catch(() => { });
        }
        this.shadowTabs.delete(tabId);
        this.sendToRenderer('browser:shadow-tab-closed', { tabId });
        console.log(`[BrowserManager] Shadow tab closed: ${tabId}`);
    }

    // ─── WebContentsView Management ─────────────────────────────────────────

    /**
     * Ensure the given user tab has an Electron WebContentsView.
     * If one already exists, return it. Otherwise create a new one.
     *
     * WebContentsViews start hidden (0x0) — the renderer's BrowserLayer
     * sends resize bounds when the tab is actually displayed.
     */
    ensureBrowserView(tabId) {
        const entry = this.userTabs.get(tabId);
        if (!entry) return null;
        if (entry.electronBrowserView) return entry.electronBrowserView;

        if (!this.mainWindow) return null;

        const view = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        this.mainWindow.contentView.addChildView(view);
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); // hidden until resize

        this.userTabs.set(tabId, { ...entry, electronBrowserView: view });
        console.log(`[BrowserManager] WebContentsView created (hidden) for tab ${tabId}`);
        return view;
    }

    // ─── Utility ────────────────────────────────────────────────────────

    /**
     * Send an IPC message to the renderer window.
     */
    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    /**
     * Gracefully close all tabs and Playwright.
     */
    async shutdown() {
        for (const [id, entry] of this.shadowTabs) {
            if (entry.playwrightPage && !entry.playwrightPage.isClosed()) {
                await entry.playwrightPage.close().catch(() => { });
            }
        }
        this.shadowTabs.clear();

        for (const [id, entry] of this.userTabs) {
            if (entry.electronBrowserView && this.mainWindow) {
                try { this.mainWindow.contentView.removeChildView(entry.electronBrowserView); } catch { }
            }
            if (entry.playwrightPage && !entry.playwrightPage.isClosed()) {
                await entry.playwrightPage.close().catch(() => { });
            }
        }
        this.userTabs.clear();

        if (this.browser) {
            await this.browser.close().catch(() => { });
        }

        this.browser = null;
        this.context = null;
        this._syncGlobals();
        console.log('[BrowserManager] Shutdown complete');
    }
}

// Export singleton
const browserManager = new BrowserManager();
export default browserManager;
