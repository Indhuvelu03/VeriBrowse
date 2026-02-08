const { BrowserWindow } = require('electron');
const path = require('path');

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  return mainWindow;
}

module.exports = { createMainWindow };
