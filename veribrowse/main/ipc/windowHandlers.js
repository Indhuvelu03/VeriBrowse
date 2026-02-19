import { ipcMain } from 'electron';

/**
 * Window Handlers
 * Manages frame controls (minimize, maximize, close).
 */
export function registerWindowHandlers(mainWindow) {
    console.log('[WindowHandlers] Registering...');

    ipcMain.on('window:minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.on('window:maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });

    ipcMain.on('window:close', () => {
        mainWindow?.close();
    });
}
