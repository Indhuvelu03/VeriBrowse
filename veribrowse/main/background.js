import { app, BrowserWindow, BrowserView, ipcMain, screen, shell } from 'electron';
import serve from 'electron-serve';
import { chromium } from 'playwright';
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
    store.set('credits.lastResetDate', today);
    // CreditGuard reads from store so updating the store is enough.
    // Emit updated stats to renderer once it connects.
  }
}
checkDailyCreditReset();
// ────────────────────────────────────────────────────────────────────────────


global.userTabsMap = new Map();
global.shadowTabsMap = new Map();
global.playwrightBrowser = null;
global.playwrightContext = null;

let mainWindow;

/**
 * ensureBrowserView(tabId)
 *
 * Guarantees the tab has an Electron BrowserView attached to mainWindow.
 * If one already exists it's returned immediately.
 * This is the bridge between headless Playwright (logic) and the visible
 * Electron window (pixels). Without a BrowserView the viewport is black.
 *
 * Bounds: sidebar (48px) + top chrome (approx 108px).
 * The renderer fine-tunes these via the 'browser:resize-viewport' IPC.
 */
function ensureBrowserView(tabId) {
  const entry = global.userTabsMap.get(tabId);
  if (!entry) return null;
  if (entry.electronBrowserView) return entry.electronBrowserView; // already exists

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.addBrowserView(view);

  // IMPORTANT: Start hidden (0×0) so it never blocks the home page or agent panel.
  // The renderer's BrowserLayer sends 'browser:resize-viewport' with real bounds
  // only when hasUrl=true — that's what makes the page visible.
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  global.userTabsMap.set(tabId, { ...entry, electronBrowserView: view });
  console.log(`[Main] BrowserView created (hidden) for tab ${tabId}`);
  return view;
}
// Expose globally so tools (navigate.js etc.) can call it without importing background.js
global.ensureBrowserView = ensureBrowserView;


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
  global.mainWindow = mainWindow; // expose for tools that need to IPC to the renderer

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

  // Initialize Playwright in background (don't block UI)
  initializePlaywright().catch(err => {
    console.error('[Background] Playwright initialization failed:', err);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function initializePlaywright() {
  try {
    global.playwrightBrowser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    global.playwrightContext = await global.playwrightBrowser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    console.log('[Background] Playwright initialized successfully');

    // Open the initial user tab so BrowserAgent always has a Playwright page to work with.
    // NOTE: We do NOT pre-create a BrowserView here. BrowserViews are created on-demand
    // in the browser:navigate / browser:resize-viewport IPC handlers (via ensureBrowserView).
    // Pre-creating with visible bounds would cover the home page and block the chat input.
    const initialPage = await global.playwrightContext.newPage();
    global.userTabsMap.set('user-1', {
      playwrightPage: initialPage,
      url: 'about:blank',
      title: 'New Tab',
      type: 'user',
    });
    global.activeTabId = 'user-1';

    // Tell the renderer about the initial tab so tabStore can register it.
    // Delay 2s to ensure the renderer's useIPCListeners hook has mounted.
    // Without this, agent navigation for 'user-1' updates a tab that doesn't
    // exist in the renderer store, so the BrowserView never gets shown.
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:user-tab-created', {
          id: 'user-1',
          url: 'about:blank',
          title: 'New Tab',
          favicon: null,
          isLoading: false,
        });
        console.log('[Background] Announced user-1 tab to renderer');
      }
    }, 2000);

    console.log('[Background] Initial user tab created: user-1 (no BrowserView yet — created on first navigate)');

  } catch (err) {
    console.error('[Background] Failed to launch Playwright:', err.message);
    throw err;
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (global.playwrightBrowser) await global.playwrightBrowser.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
