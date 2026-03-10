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

import { WebContentsView, Menu, clipboard } from 'electron';
import { chromium } from 'playwright';
import path from 'path';
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
        // Native stealth: comprehensive args that prevent bot detection
        // without depending on puppeteer-extra-plugin-stealth (which breaks webpack)
        this.browser = await chromium.launch({
<<<<<<< Updated upstream
            headless: false,
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
=======
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
            ],
>>>>>>> Stashed changes
        });

        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            // Stealth: remove webdriver flag and automation indicators
            bypassCSP: true,
        });

<<<<<<< Updated upstream
=======
        // Suppress ad/sponsored network noise globally for all tabs.
        await this.context.route('**/*', async (route) => {
            try {
                const req = route.request();
                const url = req.url();
                const type = req.resourceType();
                const nav = req.isNavigationRequest();
                const blocked = isAdOrSponsoredRequest(url);

                // Detect Google Workspace landing page redirect (bot detection)
                if (nav && String(url).toLowerCase().includes('workspace.google.com')) {
                    console.warn(`[BrowserManager] Detected Workspace redirect: ${url}`);
                    // If this is a shadow tab, we might want to flag it or retry
                }

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

>>>>>>> Stashed changes
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
        this.activeTabId = tabId;
        global.activeTabId = tabId;

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

        // ─── Native Context Menu ──────────────────────────────────────────────
        view.webContents.on('context-menu', (e, props) => {
            const template = [];

            if (props.linkURL) {
                template.push({
                    label: 'Copy Link Address',
                    click: () => clipboard.writeText(props.linkURL)
                });
            }

            if (props.hasImageContents) {
                template.push({
                    label: 'Save Image As...',
                    click: () => view.webContents.downloadURL(props.srcURL)
                });
                template.push({
                    label: 'Copy Image URL',
                    click: () => clipboard.writeText(props.srcURL)
                });
            }

            if (!props.hasImageContents && !props.linkURL) {
                template.push({ label: 'Back', click: () => view.webContents.goBack(), enabled: view.webContents.canGoBack() });
                template.push({ label: 'Forward', click: () => view.webContents.goForward(), enabled: view.webContents.canGoForward() });
                template.push({ type: 'separator' });
                template.push({ label: 'Refresh', click: () => view.webContents.reload() });
            }

            if (template.length > 0) {
                const menu = Menu.buildFromTemplate(template);
                menu.popup({ window: this.mainWindow });
            }
        });

        // ─── Download Tracking ────────────────────────────────────────────────
        view.webContents.session.on('will-download', (event, item, webContents) => {
            const fileName = item.getFilename();
            const url = item.getURL();
            const mimeType = item.getMimeType();
            const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);

            item.on('updated', (event, state) => {
                if (state === 'interrupted') {
                    this.sendToRenderer('browser:download-progress', { id, fileName, state: 'interrupted' });
                } else if (state === 'progressing') {
                    if (item.isPaused()) {
                        this.sendToRenderer('browser:download-progress', { id, fileName, state: 'paused' });
                    } else {
                        this.sendToRenderer('browser:download-progress', {
                            id, fileName, state: 'progressing',
                            receivedBytes: item.getReceivedBytes(),
                            totalBytes: item.getTotalBytes()
                        });
                    }
                }
            });

            item.once('done', async (e, state) => {
                if (state === 'completed') {
                    const savePath = item.getSavePath();
                    const fileSize = item.getReceivedBytes();
                    try {
                        const SupabaseService = await import('../services/SupabaseService.js');
                        await SupabaseService.addDownload(fileName, url, savePath, fileSize, mimeType);
                    } catch (err) {
                        console.error('[BrowserManager] Failed to save download history:', err);
                    }
                    this.sendToRenderer('browser:download-completed', { id, fileName, state: 'completed', savePath });
                } else {
                    this.sendToRenderer('browser:download-completed', { id, fileName, state });
                }
            });
        });

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
