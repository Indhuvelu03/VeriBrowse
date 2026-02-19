import { ipcMain } from 'electron';

/**
 * Download Handlers
 * Manages file downloads.
 */
export function registerDownloadHandlers() {
    console.log('[DownloadHandlers] Registering...');

    ipcMain.handle('downloads:get-all', async () => {
        return [];
    });
}
