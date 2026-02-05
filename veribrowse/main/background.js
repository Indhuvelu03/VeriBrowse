import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import serve from 'electron-serve';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';
let mainWindow;
let tabs = {};

if (isProd) {
  serve({ directory: 'app' });
}

function updateViewBounds(view) {
  if (!mainWindow) return;
  const { width, height } = mainWindow.getBounds();
  // SIDE PANEL OFFSET: x: 70 (side nav), y: 60 (top bar)
  // We add a 12px margin for that "floating window" look
  view.setBounds({ 
    x: 82, 
    y: 72, 
    width: width - 94, 
    height: height - 84 
  });
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#f3f4f6', // Match the UI background
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const url = isProd ? 'app://./home' : 'http://localhost:8888/home';
  mainWindow.loadURL(url);

  ipcMain.on('new-tab', (e, { id, url }) => {
    if (!id) return;
    const view = new WebContentsView();
    tabs[id] = view;
    mainWindow.contentView.addChildView(view);
    
    // Modern browsers use rounded corners for the content view
    // (Note: requires Electron 30+)
    view.setBackgroundColor('#ffffff');
    updateViewBounds(view);
    view.webContents.loadURL(url || 'https://www.google.com');
  });

  ipcMain.on('switch-tab', (e, id) => {
    if (id && tabs[id]) mainWindow.contentView.addChildView(tabs[id]);
  });

  ipcMain.on('close-tab', (e, id) => {
    if (id && tabs[id]) {
      mainWindow.contentView.removeChildView(tabs[id]);
      tabs[id].webContents.destroy();
      delete tabs[id];
    }
    if (Object.keys(tabs).length === 0) app.quit();
  });

  ipcMain.on('navigate', (e, { id, url }) => {
    if (!id || !tabs[id]) return;
    const isUrl = url.includes('.') && !url.includes(' ');
    const target = isUrl ? (url.startsWith('http') ? url : `https://${url}`) : `https://google.com/search?q=${encodeURIComponent(url)}`;
    tabs[id].webContents.loadURL(target);
  });

  mainWindow.on('resize', () => {
    Object.values(tabs).forEach(updateViewBounds);
  });
});