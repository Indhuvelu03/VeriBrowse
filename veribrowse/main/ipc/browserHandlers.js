import { ipcMain, shell } from 'electron';
import bus from '../core/EventBus.js';
import * as SupabaseService from '../services/SupabaseService.js';
import browserManager from '../core/BrowserManager.js';

/**
 * browserHandlers.js
 * 
 * Handles all browser-related IPC events including navigation, tab management,
 * history, and downloads.
 */

export function registerBrowserHandlers() {
    ipcMain.on('browser:navigate', async (event, { tabId, url }) => {
        const entry = browserManager.userTabs.get(tabId);
        if (entry?.playwrightPage) {
            try {
                browserManager.setActiveTab(tabId, { emit: true });
                let targetUrl = url.trim();
                if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

                browserManager.mainWindow?.webContents.send('browser:user-tab-updated', { tabId, isLoading: true, url: targetUrl });

                const view = browserManager.ensureBrowserView(tabId);
                if (view && !view.webContents.isDestroyed()) {
                    view.webContents.loadURL(targetUrl).catch(() => { });
                }

                await entry.playwrightPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                const currentUrl = entry.playwrightPage.url();
                const title = await entry.playwrightPage.title().catch(() => currentUrl);

                browserManager.userTabs.set(tabId, { ...browserManager.userTabs.get(tabId), url: currentUrl, title });
                browserManager.mainWindow?.webContents.send('browser:user-tab-updated', { tabId, url: currentUrl, title, isLoading: false });

                // Persist to history
                SupabaseService.addHistory(currentUrl, title, null).catch(() => { });
            } catch (e) {
                console.error('[IPC:navigate] Failed:', e.message);
                browserManager.mainWindow?.webContents.send('browser:user-tab-updated', { tabId, isLoading: false, error: e.message });
            }
        } else {
            bus.emit('execute-step', { step: { agent: 'browser', tool: 'navigate', params: { tabId, url }, id: 'manual' }, workflowId: 'manual' });
        }
    });

    ipcMain.on('browser:new-tab', async (event, { tabId, url = 'about:blank' }) => {
        try {
            if (!browserManager.context) {
                console.warn('[IPC:new-tab] Playwright not ready yet.');
                return;
            }
            // createUserTab() registers the tab AND attaches StateSync automatically
            await browserManager.createUserTab(tabId, url);
            const entry = browserManager.userTabs.get(tabId);
            browserManager.sendToRenderer('browser:user-tab-created', {
                id: tabId,
                url: entry?.url || url,
                title: entry?.title || 'New Tab',
                favicon: null,
                isLoading: false,
            });
            browserManager.setActiveTab(tabId, { emit: true });
            console.log(`[IPC:new-tab] Created user tab ${tabId} via BrowserManager`);
        } catch (e) {
            console.error('[IPC:new-tab] Failed:', e.message);
        }
    });

    ipcMain.on('browser:activate-tab', (event, { tabId }) => {
        if (!tabId) return;
        const switched = browserManager.setActiveTab(tabId, { emit: true });
        if (!switched) {
            console.warn(`[IPC:activate-tab] Tab ${tabId} not found`);
        }
    });

    ipcMain.on('browser:hide-viewport', (event, { tabId }) => {
        const entry = browserManager.userTabs.get(tabId ?? browserManager.activeTabId);
        if (entry?.electronBrowserView) {
            entry.electronBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
    });

    ipcMain.on('browser:close-tab', async (event, { tabId }) => {
        const entry = browserManager.userTabs.get(tabId);
        if (!entry) return;
        const wasActive = browserManager.activeTabId === tabId;

        if (entry.electronBrowserView) {
            try {
                entry.electronBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
                browserManager.mainWindow?.contentView.removeChildView(entry.electronBrowserView);
            } catch (e) {
                console.warn('[IPC:close-tab] Error removing WebContentsView:', e.message);
            }
        }

        if (entry.playwrightPage && !entry.playwrightPage.isClosed()) {
            try {
                await entry.playwrightPage.close();
            } catch (e) {
                console.warn('[IPC:close-tab] Error closing Playwright page:', e.message);
            }
        }

        browserManager.userTabs.delete(tabId);
        browserManager.sendToRenderer('browser:user-tab-closed', { tabId });

        if (wasActive) {
            const fallbackTabId = Array.from(browserManager.userTabs.keys()).pop() || null;
            if (fallbackTabId) {
                browserManager.setActiveTab(fallbackTabId, { emit: true });
            } else {
                browserManager.activeTabId = null;
                global.activeTabId = null;
            }
        } else {
            browserManager.hideNonActiveViews(browserManager.activeTabId);
        }

        console.log(`[IPC:close-tab] Closed tab ${tabId}`);
    });

    ipcMain.on('browser:back', (event, { tabId }) => {
        bus.emit('execute-step', { step: { agent: 'browser', tool: 'goBack', params: { tabId }, id: `manual-back-${Date.now()}` }, workflowId: null });
    });

    ipcMain.on('browser:forward', (event, { tabId }) => {
        bus.emit('execute-step', { step: { agent: 'browser', tool: 'goForward', params: { tabId }, id: `manual-fwd-${Date.now()}` }, workflowId: null });
    });

    ipcMain.on('browser:refresh', (event, { tabId }) => {
        bus.emit('execute-step', { step: { agent: 'browser', tool: 'refresh', params: { tabId }, id: `manual-ref-${Date.now()}` }, workflowId: null });
    });

    ipcMain.on('browser:resize-viewport', (event, { tabId, bounds }) => {
        if (!tabId || !bounds) return;
        browserManager.setActiveTab(tabId, { emit: false });

        const width = Math.round(bounds.width);
        const height = Math.round(bounds.height);

        // Calculate a zoom factor to prevent horizontal scrolling on rigid desktop sites.
        // We assume ~1100px is a safe minimum width for desktop sites before they overflow.
        let zoomFactor = 1;
        if (width > 0 && width < 1100) {
            zoomFactor = width / 1100;
            if (zoomFactor < 0.3) zoomFactor = 0.3; // Cap at 30% scale
        }

        // The layout dimensions represents the unzoomed, logical pixel space the website sees
        const layoutWidth = Math.round(width / zoomFactor);
        const layoutHeight = Math.round(height / zoomFactor);

        const view = browserManager.ensureBrowserView(tabId);
        if (view && !view.webContents.isDestroyed()) {
            browserManager.hideNonActiveViews(tabId);
            view.setBounds({
                x: Math.round(bounds.x),
                y: Math.round(bounds.y),
                width,
                height
            });
            // Apply zoom factor visually in Electron so it fits nicely
            view.webContents.setZoomFactor(zoomFactor);
        }

        const entry = browserManager.userTabs.get(tabId);
        if (entry && entry.playwrightPage && !entry.playwrightPage.isClosed()) {
            // Keep Playwright's virtual viewport matching the layout size
            entry.playwrightPage.setViewportSize({ width: layoutWidth, height: layoutHeight }).catch(() => { });
        }
    });

    ipcMain.handle('browser:get-history', async (event, search) => {
        return await SupabaseService.getHistory(search);
    });

    ipcMain.on('browser:clear-history', async () => {
        await SupabaseService.clearHistory();
    });

    ipcMain.handle('browser:get-downloads', async () => {
        return await SupabaseService.getDownloads();
    });

    ipcMain.on('browser:show-item', (event, filePath) => {
        shell.showItemInFolder(filePath);
    });
}
