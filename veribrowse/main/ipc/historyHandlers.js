import { ipcMain } from 'electron';

/**
 * History Handlers
 * Manages database operations for browsing history.
 */
export function registerHistoryHandlers(databaseService) {
    console.log('[HistoryHandlers] Registering...');

    ipcMain.handle('history:get-all', async (event, { limit, offset }) => {
        return []; // Placeholder
    });

    ipcMain.handle('history:clear', async () => {
        return { success: true };
    });
}
