import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';
import serve from 'electron-serve';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

const isProd = process.env.NODE_ENV === 'production';

// Explicitly load .env.local for development
// Electron/Node doesn't automatically load .env.local
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log("Loaded .env.local from:", envLocalPath);
} else {
  // If not found, try loading standard .env
  dotenv.config();
}

let mainWindow;
let browserView;

// Initialize Gemini API in Main Process
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

// Debug log to confirm key loading (will show in terminal)
if (GEMINI_API_KEY) {
  console.log("Gemini API Key loaded successfully (starts with):", GEMINI_API_KEY.substring(0, 8) + "...");
} else {
  console.error("Gemini API Key NOT found in process.env");
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

if (isProd) {
  serve({ directory: 'app' });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#050505',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Initialize BrowserView
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      plugins: true,
    }
  });

  mainWindow.setBrowserView(browserView);
  // Initial bounds 0, will be resized by renderer
  browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  browserView.webContents.loadURL('about:blank');

  // Track BrowserView status and send to renderer
  const sendStatusUpdate = () => {
    if (mainWindow && browserView) {
      mainWindow.webContents.send('view-status-updated', {
        url: browserView.webContents.getURL(),
        title: browserView.webContents.getTitle(),
        canGoBack: browserView.webContents.canGoBack(),
        canGoForward: browserView.webContents.canGoForward(),
      });
    }
  };

  browserView.webContents.on('did-navigate', sendStatusUpdate);
  browserView.webContents.on('did-navigate-in-page', sendStatusUpdate);
  browserView.webContents.on('page-title-updated', sendStatusUpdate);
  browserView.webContents.on('did-finish-load', sendStatusUpdate);

  const url = isProd ? 'app://./index.html' : 'http://localhost:8888/';
  mainWindow.loadURL(url); // Ensure this is not overwritten if serve is used

  // Handle window controls
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  // ---------------------------------------------
  // BrowserView IPC Handlers
  // ---------------------------------------------

  ipcMain.on('view-resize', (event, bounds) => {
    if (browserView && mainWindow) {
      const newBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
      browserView.setBounds(newBounds);
    }
  });

  ipcMain.on('view-load-url', (event, url) => {
    if (browserView) {
      browserView.webContents.loadURL(url).catch(e => {
        console.error('Failed to load URL:', url, e);
      });
    }
  });

  ipcMain.on('view-reload', () => {
    if (browserView) browserView.webContents.reload();
  });

  ipcMain.on('view-back', () => {
    if (browserView && browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
    }
  });

  ipcMain.on('view-forward', () => {
    if (browserView && browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
    }
  });

  ipcMain.on('view-hide', () => {
    if (browserView) {
      browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

  ipcMain.handle('view-get-selection', async () => {
    if (browserView) {
      try {
        return await browserView.webContents.executeJavaScript('window.getSelection().toString()');
      } catch (e) {
        console.error('Failed to get selection:', e);
        return '';
      }
    }
    return '';
  });

  // ---------------------------------------------
  // Gemini AI IPC Handler (Main Process) - COST OPTIMIZED (gemini-2.0-flash ONLY)
  // ---------------------------------------------
  ipcMain.handle('gemini-generate', async (event, prompt) => {
    const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      throw new Error("API key missing. Please check .env.local and restart app.");
    }

    // 1. LIMIT INPUT (Rule 6: Limit to maximum 3000 characters)
    const sanitizedPrompt = prompt.substring(0, 3000);

    // 2. ONLY gemini-2.0-flash (Rule 1 & 2)
    const model = "gemini-2.0-flash";

    try {
      // 3. LOGGING (Rule 10)
      console.log(`[Main AI Call] Target Model: ${model}. Payload Size: ${sanitizedPrompt.length} chars.`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: sanitizedPrompt }] }],
            // 4. DISABLE STREAMING by default (Rule 8)
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.error?.message || `HTTP ${response.status}`;
        console.error(`[Main AI Error] ${model} failed:`, errMsg);
        throw new Error(errMsg);
      }

      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        console.log(`[Main AI Success] Response received from ${model}`);
        return content;
      }

      throw new Error("Empty response from Gemini API");

    } catch (err) {
      console.error(`[Main AI] System Error:`, err.message);
      throw err;
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});