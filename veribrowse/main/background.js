import { app, BrowserWindow, ipcMain, session, BrowserView } from 'electron';

// Height of the renderer topbar/titlebar — BrowserView sits below this
const TOPBAR_HEIGHT = 60;
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import serve from 'electron-serve';

// Services
import BrowserService from './services/BrowserService.js';
import DatabaseService from './services/DatabaseService.js';

// Handlers
import { registerAgentHandlers } from './ipc/AgentHandlers.js';
import { registerBrowserHandlers } from './ipc/browserHandlers.js';
import { registerHistoryHandlers } from './ipc/historyHandlers.js';
import { registerDownloadHandlers } from './ipc/downloadHandlers.js';
import { registerWindowHandlers } from './ipc/windowHandlers.js';

// Environment Setup
const isDev = process.env.NODE_ENV === 'development';
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('[Main] Loaded .env.local');
} else {
  dotenv.config();
}

// Global references
let mainWindow = null;
let browserView = null;
let browserService = null;
let databaseService = null;

// Serve production build
const loadURL = serve({ directory: 'app' }); // Nextron default

/**
 * Create main browser window
 */
function createWindow() {
  console.log('[Main] Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    transparent: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    show: false
  });

  // Initialize BrowserView for the native browser area
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Attempt to hide "AutomationControlled" from the renderer chrome
      enableRemoteModule: false,
    }
  });

  // Apply "stealth" user agent and remove automation hints
  const viewSession = browserView.webContents.session;
  viewSession.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

  // Fellou-style Navigation Guard
  // 1. Intercept new window requests (target="_blank") and redirect to same view
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] Blocking popup/newtab and redirecting to same view:', url);
    browserView.webContents.loadURL(url);
    return { action: 'deny' };
  });

  // 2. Override window.open inside the page and hide ads/popups
  browserView.webContents.on('dom-ready', () => {
    browserView.webContents.executeJavaScript(`
      // Convert popups into same-page navigations
      window.open = (url) => {
        window.location.href = url;
        return window;
      };
      
      // Stealth: Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Action Guard: Block ad overlays that steal agent clicks
      const style = document.createElement('style');
      style.textContent = \`
        .ad, .social-share, #popup-container, .modal-backdrop { 
          pointer-events: none !important; 
          visibility: hidden !important; 
          display: none !important; 
        }
      \`;
      document.head.appendChild(style);
    `).catch(() => { });
  });

  // Attach BrowserView to window
  mainWindow.setBrowserView(browserView);

  // Let Electron auto-resize the BrowserView width/height when window resizes
  browserView.setAutoResize({ width: true, height: true });

  /**
   * Calculates and applies correct BrowserView bounds.
   * BrowserView sits below the TOPBAR_HEIGHT px renderer chrome.
   */
  function applyBrowserViewBounds() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { width, height } = mainWindow.getContentBounds();
    const bounds = {
      x: 0,
      y: TOPBAR_HEIGHT,
      width: Math.max(width, 0),
      height: Math.max(height - TOPBAR_HEIGHT, 0),
    };
    console.log('[Main] BrowserView bounds →', bounds);
    browserView.setBounds(bounds);
  }

  // Load URL
  if (isDev) {
    mainWindow.loadURL('http://localhost:8888');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL('app://-');
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show');
    mainWindow.show();
    // Apply bounds as soon as the window is visible
    applyBrowserViewBounds();
  });

  // Re-apply on every window resize (catches maximize/restore/drag)
  mainWindow.on('resize', applyBrowserViewBounds);
  mainWindow.on('maximize', applyBrowserViewBounds);
  mainWindow.on('unmaximize', applyBrowserViewBounds);
  mainWindow.on('restore', applyBrowserViewBounds);

  mainWindow.on('closed', () => {
    console.log('[Main] Window closed');
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Initialize all services
 */
async function initializeServices() {
  console.log('[Main] Initializing services...');

  try {
    databaseService = new DatabaseService();

    // Initialize hybrid browser service
    browserService = new BrowserService(mainWindow, browserView);

    return true;
  } catch (error) {
    console.error('[Main] Service initialization error:', error);
    return false;
  }
}

/**
 * Register all IPC handlers
 */
function registerAllHandlers() {
  console.log('[Main] Registering IPC handlers...');

  // Agent handlers (AI thinking, tool orchestration)
  registerAgentHandlers(mainWindow, browserView);

  // Browser handlers (navigation, tabs, resizing)
  registerBrowserHandlers(browserService, mainWindow);

  // History handlers (database storage)
  registerHistoryHandlers(databaseService);

  // Download handlers
  registerDownloadHandlers();

  // Window handlers (minimize/maximize/close)
  registerWindowHandlers(mainWindow);
}

/**
 * Configure session security and defaults
 */
function configureSession() {
  session.defaultSession.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  console.log('[Main] Session configured');
}

/**
 * App ready handler
 */
app.whenReady().then(async () => {
  console.log('[Main] App ready');

  configureSession();
  createWindow();

  const servicesReady = await initializeServices();
  if (servicesReady) {
    registerAllHandlers();
  }

  console.log('[Main] Application fully initialized');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Cleanup on exit
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  console.log('[Main] Cleaning up before quit...');

  // Note: Playwright cleanup is sync or async. 
  // We'll try to shut down gracefully.
  if (browserService) {
    await browserService.close();
  }

  if (databaseService) {
    databaseService.close();
  }
});

console.log('[Main] Background logic loaded.');