import { ipcMain } from 'electron';

const TOPBAR_HEIGHT = 60;

/**
 * Browser Handlers
 * Manages native BrowserView navigation and tab operations.
 */
export function registerBrowserHandlers(browserService, mainWindow) {
    console.log('[BrowserHandlers] Registering...');

    // Fine-grained resize from renderer (e.g. chat panel adjustments)
    ipcMain.on('view-resize', (event, bounds) => {
        if (!browserService?.browserView) return;
        // Guard: reject zero/negative sizes to prevent invisible view
        if (bounds.width <= 0 || bounds.height <= 0) return;
        browserService.browserView.setBounds({
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
        });
    });

    // Hide BrowserView (e.g. on new-tab / no-tab state)
    ipcMain.on('view-hide', () => {
        if (browserService?.browserView) {
            browserService.browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
    });

    // Restore BrowserView to full-content-area bounds
    ipcMain.on('view-show', () => {
        if (!browserService?.browserView || !mainWindow) return;
        const { width, height } = mainWindow.getContentBounds();
        browserService.browserView.setBounds({
            x: 0,
            y: TOPBAR_HEIGHT,
            width: Math.max(width, 0),
            height: Math.max(height - TOPBAR_HEIGHT, 0),
        });
    });

    // Navigation triggers
    ipcMain.handle('browser:navigate', async (event, url) => {
        return await browserService.navigate(url);
    });

    ipcMain.handle('browser:go-back', async () => {
        if (browserService.browserView?.webContents.navigationHistory.canGoBack()) {
            browserService.browserView.webContents.goBack();
            return { success: true };
        }
        return { success: false };
    });

    ipcMain.handle('browser:go-forward', async () => {
        if (browserService.browserView?.webContents.navigationHistory.canGoForward()) {
            browserService.browserView.webContents.goForward();
            return { success: true };
        }
        return { success: false };
    });

    ipcMain.handle('browser:refresh', async () => {
        browserService.browserView?.webContents.reload();
        return { success: true };
    });
}
