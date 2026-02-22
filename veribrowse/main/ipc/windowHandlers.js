import { ipcMain, BrowserWindow } from 'electron';

/**
 * windowHandlers.js
 * 
 * Handles window control events like minimize, maximize, and close.
 */

export function registerWindowHandlers() {
    ipcMain.on('window:minimize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.minimize();
    });

    ipcMain.on('window:maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
        }
    });

    ipcMain.on('window:close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
    });
}
