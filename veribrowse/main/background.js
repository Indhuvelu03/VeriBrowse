import { app, BrowserWindow, ipcMain } from 'electron';
import serve from 'electron-serve';
import path from 'path';
import { TabManager } from './helpers/TabManager';
import { DownloadManager } from './helpers/DownloadManager';
import aiService from './services/AiService';

const isProd = process.env.NODE_ENV === 'production';
let mainWindow;
let tabManager;
let downloadManager;

// Detect if query is simple (direct site/lookup) or research (needs multiple angles)
const analyzeQuery = (prompt) => {
  const text = (prompt || '').trim().toLowerCase();
  
  // Simple patterns: direct URLs, domains, single entity lookups
  const simplePatterns = [
    /^https?:\/\//i,                    // URL
    /^[\w-]+\.(com|ai|io|org|net|dev)$/i, // Domain like "fellou.ai"
    /^what is [\w\s]+$/i,               // "what is X" - single answer
    /^who is [\w\s]+$/i,                // "who is X"
    /^define [\w\s]+$/i,                // "define X"
    /^[\w\s]{1,20}$/i,                  // Very short query (1-3 words)
  ];
  
  // Research patterns: needs multiple tabs/angles
  const researchPatterns = [
    /how to (make|build|create|develop)/i,
    /compare|vs|versus|difference/i,
    /best (way|practice|tool|method)/i,
    /research|explore|analyze|investigate/i,
    /summary of|summarize|overview of/i,
  ];
  
  for (const p of simplePatterns) {
    if (p.test(text)) return { type: 'simple', count: 1 };
  }
  
  for (const p of researchPatterns) {
    if (p.test(text)) return { type: 'research', count: 4 };
  }
  
  // Default: if query has many words, likely research
  const wordCount = text.split(/\s+/).length;
  if (wordCount <= 3) return { type: 'simple', count: 1 };
  if (wordCount <= 6) return { type: 'moderate', count: 2 };
  return { type: 'research', count: 4 };
};

// Build smart search queries based on query type
const buildSmartQueries = (prompt) => {
  const text = (prompt || '').trim();
  if (!text) return [];
  
  const analysis = analyzeQuery(text);
  
  if (analysis.type === 'simple') {
    // Check if it's a domain/URL - navigate directly
    if (/^[\w-]+\.(com|ai|io|org|net|dev)$/i.test(text)) {
      return [{ query: text, url: `https://${text}`, isDirect: true }];
    }
    if (/^https?:\/\//i.test(text)) {
      return [{ query: text, url: text, isDirect: true }];
    }
    // Simple search
    return [{ query: text, url: `https://www.google.com/search?q=${encodeURIComponent(text)}`, isDirect: false }];
  }
  
  if (analysis.type === 'moderate') {
    return [
      { query: text, url: `https://www.google.com/search?q=${encodeURIComponent(text)}`, isDirect: false },
      { query: `${text} examples`, url: `https://www.google.com/search?q=${encodeURIComponent(text + ' examples')}`, isDirect: false },
    ];
  }
  
  // Research: extract key topics and search different angles
  const aspects = extractResearchAspects(text);
  return aspects.map(q => ({
    query: q,
    url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    isDirect: false,
  }));
};

// Extract research aspects from a complex query
const extractResearchAspects = (prompt) => {
  const text = prompt.trim();
  const aspects = [text];
  
  // Common research suffixes based on topic
  if (/browser|app|application/i.test(text)) {
    aspects.push(`${text} architecture`);
    aspects.push(`${text} tools libraries`);
    aspects.push(`${text} tutorial`);
  } else if (/how to/i.test(text)) {
    aspects.push(`${text} step by step`);
    aspects.push(`${text} best practices`);
    aspects.push(`${text} examples github`);
  } else {
    aspects.push(`${text} guide`);
    aspects.push(`${text} tools`);
    aspects.push(`${text} examples`);
  }
  
  return aspects.slice(0, 4);
};

if (isProd) {
  serve({ directory: 'app' });
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#020617', // Match dark-950
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = isProd ? 'app://./home' : 'http://localhost:8888/home';
  mainWindow.loadURL(url);

  // Initialize TabManager
  tabManager = new TabManager(mainWindow);

  // Initialize DownloadManager
  downloadManager = new DownloadManager(mainWindow);

  // Window Control IPC Handlers
  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  // Phase 2: Native Electron Automation Handlers
  ipcMain.handle('browser:navigate', async (event, { url }) => {
    console.log('Navigate to:', url);
    const activeTab = tabManager.getActiveTab();
    if (activeTab) {
      // Use the manager method to ensure visibility update
      // We need the ID, which is the key in the map.  
      // TabManager structure: tabs = Map<id, view>
      // But getActiveTab returns view. 
      // Let's use tabManager.activeTabId directly.
      await tabManager.navigateTab(tabManager.activeTabId, url);
      return { success: true };
    }
    return { success: false, error: 'No active tab' };
  });

  ipcMain.handle('browser:newTab', async (event, { url } = {}) => {
    console.log('New tab requested', url);
    const tabId = await tabManager.createTab(url);
    return { success: true, tabId };
  });

  ipcMain.handle('browser:reload', async (event, { tabId } = {}) => {
    console.log('Reload requested');
    tabManager.reloadTab(tabId);
    return { success: true };
  });

  ipcMain.handle('browser:goBack', async (event, { tabId } = {}) => {
    tabManager.goBack(tabId);
    return { success: true };
  });

  ipcMain.handle('browser:goForward', async (event, { tabId } = {}) => {
    tabManager.goForward(tabId);
    return { success: true };
  });

  ipcMain.handle('browser:closeTab', async (event, { tabId }) => {
    console.log('Close tab:', tabId);
    tabManager.closeTab(tabId);
    return { success: true };
  });

  ipcMain.handle('browser:switchTab', async (event, { tabId }) => {
    console.log('Switch to tab:', tabId);
    tabManager.switchTab(tabId);
    return { success: true };
  });

  ipcMain.handle('browser:setLayout', async (event, { mode, tabIds, tabId }) => {
    if (!tabManager) return { success: false, error: 'Tab manager unavailable' };

    if (mode === 'single') {
      if (tabId && tabManager.tabs.has(tabId)) {
        tabManager.activeTabId = tabId;
      }
      tabManager.setLayoutMode('single');
      return { success: true };
    }

    if (mode === 'grid') {
      const resolvedIds = Array.isArray(tabIds) ? tabIds.filter((id) => tabManager.tabs.has(id)) : [];
      tabManager.setLayoutMode('grid', resolvedIds);
      return { success: true };
    }

    return { success: false, error: 'Unknown layout mode' };
  });

  ipcMain.handle('browser:screenshot', async (event, { tabId }) => {
    // Determine view: if tabId provided use that, else active
    let view;
    if (tabId) {
      view = tabManager.tabs.get(tabId);
    } else {
      view = tabManager.getActiveTab();
    }

    if (!view) return { success: false, error: 'Tab not found' };

    try {
      const image = await view.webContents.capturePage();
      return { success: true, screenshot: image.toDataURL() };
    } catch (e) {
      console.error("Screenshot error:", e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('browser:getContent', async (event, { tabId }) => {
    let view;
    if (tabId) {
      view = tabManager.tabs.get(tabId);
    } else {
      view = tabManager.getActiveTab();
    }

    if (!view) return { success: false, error: 'Tab not found' };

    try {
      const { default: automationService } = await import('./services/AutomationService.js');
      const content = await automationService.getDOM(view.webContents);
      return { success: true, content };
    } catch (e) {
      console.error("Content error:", e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('automation:run', async (event, { prompt }) => {
    if (!tabManager) return { success: false, error: 'Tab manager unavailable' };

    const queries = buildSmartQueries(prompt);
    if (!queries.length) return { success: false, error: 'Empty task prompt' };

    const tabs = [];
    const tabIds = [];

    for (const { query, url } of queries) {
      const tabId = await tabManager.createTab(url);
      tabs.push({ id: tabId, title: query, url });
      tabIds.push(tabId);
    }

    // Only use grid layout if multiple tabs
    if (tabIds.length > 1) {
      tabManager.setLayoutMode('grid', tabIds);
    } else {
      tabManager.setLayoutMode('single');
      tabManager.activeTabId = tabIds[0];
    }

    return { success: true, tabs, activeTabId: tabIds[0] || null };
  });

  ipcMain.handle('ai:answer', async (event, { prompt }) => {
    return aiService.runAgentTask('search', prompt);
  });

  ipcMain.handle('ai:run', async (event, { taskType, prompt }) => {
    return aiService.runAgentTask(taskType, prompt);
  });

  ipcMain.handle('ai:healthcheck', async () => {
    return aiService.healthCheck();
  });

  // Handle Sidebar Resizing
  ipcMain.handle('browser:resize-view', async (event, { width }) => {
    if (tabManager) {
      tabManager.setRightSidebarWidth(width || 0);
      return { success: true };
    }
    return { success: false };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
