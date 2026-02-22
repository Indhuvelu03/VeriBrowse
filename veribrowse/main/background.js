import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import serve from 'electron-serve';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global Error Catching
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Core & Services
import bus from './core/EventBus.js';
import * as CreditGuard from './core/CreditGuard.js';
import * as SupabaseService from './services/SupabaseService.js';
import * as SessionService from './services/SessionService.js';
import browserManager from './core/BrowserManager.js';

// Agents & Engine (Import for initialization)
import './core/WorkflowEngine.js';
import './agents/BrowserAgent.js';
import './agents/MemoryAgent.js';
import './agents/SummaryAgent.js';
import { registerAgentHandlers } from './ipc/AgentHandlers.js';
import { registerWindowHandlers } from './ipc/WindowHandlers.js';
import { registerBrowserHandlers } from './ipc/BrowserHandlers.js';
import { registerServiceHandlers } from './ipc/ServiceHandlers.js';
import * as AgentRuntime from './core/agent/AgentRuntime.js';

const isProd = process.env.NODE_ENV === 'production';
const store = new Store();

if (isProd) {
  serve({ directory: 'app' });
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

// ── Bug #8 Fix: Daily credit reset ─────────────────────────────────────────
// CreditGuard persists callsUsed in electron-store but never resets it.
// On every startup, check if we crossed a calendar day boundary and reset.
function checkDailyCreditReset() {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const lastReset = store.get('credits.lastResetDate', '');
  if (lastReset !== today) {
    console.log(`[Main] New day detected (${lastReset} → ${today}). Resetting credit counter.`);
    store.set('credits.callsUsed', 0);
    store.set('credits.cacheHits', 0);
    store.set('credits.lastResetDate', today);
    // Sync CreditGuard's in-memory counters with the reset store values
    CreditGuard.syncFromStore();
  }
}
checkDailyCreditReset();
// ────────────────────────────────────────────────────────────────────────────


// BrowserManager handles all Playwright state — no more scattered global.* variables.
// global.* references are maintained by BrowserManager for backward compat with tools.

let mainWindow;

// ensureBrowserView is now handled by BrowserManager.
// global.ensureBrowserView is set by BrowserManager._syncGlobals()


async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  console.log('[Main] Creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    show: true, // Show immediately for debugging
    titleBarStyle: 'hidden',
    backgroundColor: '#050505',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
  });
  browserManager.setMainWindow(mainWindow);

  mainWindow.on('ready-to-show', () => {
    console.log('[Main] Window ready-to-show');
    mainWindow.show();
  });

  // --- IPC HANDLERS ---
  // --- IPC HANDLERS ---
  registerWindowHandlers();
  registerBrowserHandlers();
  registerServiceHandlers();
  registerAgentHandlers();

  // --- EVENT BUS BRIDGE ---
  const bridge = (event, channel = null) => {
    bus.on(event, (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel || event, data);
      }
    });
  };

  bridge('workflow:step-updated');
  bridge('workflow:completed');
  bridge('workflow:paused');
  bridge('workflow:resumed');  // FIX 1: So renderer can call setResumed() in workflowStore
  bridge('agent:status');
  bridge('agent:summary-ready');
  bridge('agent:chat-response');
  bridge('agent:error');
  bridge('agent:rate-limited');         // IPCGuard backpressure notifications
  bridge('agent:execution-step');  // autonomous loop live step updates
  bridge('agent:autonomous-done');
  bridge('agent:state-change');    // AutonomousLoop state machine transitions
  bridge('credit:updated');
  bridge('credit:warning');
  bridge('credit:critical');
  bridge('browser:user-tab-created');
  bridge('browser:user-tab-updated');  // Bug #4 was already fixed in navigate.js; bridge ensures it propagates
  bridge('browser:user-tab-switched');
  bridge('browser:user-tab-closed');
  bridge('browser:shadow-tab-created');


  // Load UI first
  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    // Robust port detection for nextron
    let port = 8888;
    const portArgIndex = process.argv.indexOf('--port');
    if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
      port = process.argv[portArgIndex + 1];
    } else if (process.argv[2] && !isNaN(process.argv[2])) {
      port = process.argv[2];
    }

    console.log(`[Main] Loading renderer at http://localhost:${port}`);
    try {
      await mainWindow.loadURL(`http://localhost:${port}/`);
    } catch (err) {
      console.error('[Main] Failed to load URL:', err);
      // Fallback: try to show the window anyway to show the error
      mainWindow.show();
    }
    mainWindow.webContents.openDevTools();
  }

  // Backup show if ready-to-show fails
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Main] Forcing window show via timeout');
      mainWindow.show();
    }
  }, 5000);

  // Initialize Playwright via BrowserManager (don't block UI)
  browserManager.init().catch(err => {
    console.error('[Background] Playwright initialization failed:', err);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// initializePlaywright is now handled by BrowserManager.init()

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  await browserManager.shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
