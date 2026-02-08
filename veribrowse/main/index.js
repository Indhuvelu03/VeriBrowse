const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createMainWindow } = require('./window/windowManager');
const { registerIpcHandlers } = require('./handlers/ipcHandlers');
const { registerAIHandlers } = require('./handlers/aiHandlers');

let mainWindow;

function createWindow() {
  mainWindow = createMainWindow();
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../render/dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  registerAIHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
