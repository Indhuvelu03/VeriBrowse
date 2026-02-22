import { ipcMain, shell } from 'electron';
import bus from '../core/EventBus.js';
import * as SupabaseService from '../services/SupabaseService.js';

/**
 * browserHandlers.js
 * 
 * Handles all browser-related IPC events including navigation, tab management,
 * history, and downloads.
 */

export function registerBrowserHandlers() {
    ipcMain.on('browser:navigate', async (event, { tabId, url }) => {
        const entry = global.userTabsMap.get(tabId);
        if (entry?.playwrightPage) {
            try {
                let targetUrl = url.trim();
                if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

                global.mainWindow?.webContents.send('browser:user-tab-updated', { tabId, isLoading: true, url: targetUrl });

                const view = global.ensureBrowserView(tabId);
                if (view && !view.webContents.isDestroyed()) {
                    view.webContents.loadURL(targetUrl).catch(() => { });
                }

                await entry.playwrightPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                const currentUrl = entry.playwrightPage.url();
                const title = await entry.playwrightPage.title().catch(() => currentUrl);

                global.userTabsMap.set(tabId, { ...global.userTabsMap.get(tabId), url: currentUrl, title });
                global.mainWindow?.webContents.send('browser:user-tab-updated', { tabId, url: currentUrl, title, isLoading: false });
            } catch (e) {
                console.error('[IPC:navigate] Failed:', e.message);
                global.mainWindow?.webContents.send('browser:user-tab-updated', { tabId, isLoading: false, error: e.message });
            }
        } else {
            bus.emit('execute-step', { step: { agent: 'browser', tool: 'navigate', params: { tabId, url }, id: 'manual' }, workflowId: 'manual' });
        }
    });

    ipcMain.on('browser:new-tab', async (event, { tabId, url = 'about:blank' }) => {
        try {
            if (!global.playwrightContext) {
                console.warn('[IPC:new-tab] Playwright not ready yet.');
                return;
            }
            const page = await global.playwrightContext.newPage();
            if (url !== 'about:blank') {
                await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => { });
            }
            global.userTabsMap.set(tabId, { playwrightPage: page, url, title: 'New Tab', type: 'user' });
            global.activeTabId = tabId;
            console.log(`[IPC:new-tab] Created Playwright page for tab ${tabId}`);
        } catch (e) {
            console.error('[IPC:new-tab] Failed:', e.message);
        }
    });

    ipcMain.on('browser:hide-viewport', (event, { tabId }) => {
        const entry = global.userTabsMap.get(tabId ?? global.activeTabId);
        if (entry?.electronBrowserView) {
            entry.electronBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
    });

    ipcMain.on('browser:close-tab', async (event, { tabId }) => {
        const entry = global.userTabsMap.get(tabId);
        if (!entry) return;

        if (entry.electronBrowserView) {
            try {
                entry.electronBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
                global.mainWindow?.removeBrowserView(entry.electronBrowserView);
            } catch (e) {
                console.warn('[IPC:close-tab] Error removing BrowserView:', e.message);
            }
        }

        if (entry.playwrightPage && !entry.playwrightPage.isClosed()) {
            try {
                await entry.playwrightPage.close();
            } catch (e) {
                console.warn('[IPC:close-tab] Error closing Playwright page:', e.message);
            }
        }

        global.userTabsMap.delete(tabId);
        if (global.activeTabId === tabId) global.activeTabId = null;
        console.log(`[IPC:close-tab] Closed tab ${tabId}`);
    });

    ipcMain.on('browser:back', (event, { tabId }) => {
        bus.emit('execute-step', { agent: 'browser', tool: 'goBack', params: { tabId }, id: 'manual' });
    });

    ipcMain.on('browser:forward', (event, { tabId }) => {
        bus.emit('execute-step', { agent: 'browser', tool: 'goForward', params: { tabId }, id: 'manual' });
    });

    ipcMain.on('browser:refresh', (event, { tabId }) => {
        bus.emit('execute-step', { agent: 'browser', tool: 'refresh', params: { tabId }, id: 'manual' });
    });

    ipcMain.on('browser:resize-viewport', (event, { tabId, bounds }) => {
        const view = global.ensureBrowserView(tabId);
        if (view && !view.webContents.isDestroyed()) {
            view.setBounds({
                x: Math.round(bounds.x),
                y: Math.round(bounds.y),
                width: Math.round(bounds.width),
                height: Math.round(bounds.height)
            });
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
