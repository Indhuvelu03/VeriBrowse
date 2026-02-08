import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import serve from 'electron-serve';
import path from 'path';
import { TabManager } from './helpers/TabManager';
import { DownloadManager } from './helpers/DownloadManager';
import aiService from './services/AiService';
import { Orchestrator } from './services/Orchestrator';
import historyService from './services/HistoryService';
import missionTracker from './services/MissionTracker';
import dbManager from './services/DatabaseManager';
import crawlerService from './services/CrawlerService.js';
import searchService from './services/SearchService.js';
import reportGenerator from './services/ReportGenerator.js';
import memoryService from './services/MemoryService.js';
import { saveAIChatSession, getAIChatHistory, getAIChatSession, deleteAIChatSession } from './lib/aiHistoryDb.js';

const isProd = process.env.NODE_ENV === 'production';
let mainWindow;
let tabManager;
let downloadManager;

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

  const sendOrchestrateProgress = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:orchestrate-progress', payload);
    }
  };

  ipcMain.handle('automation:run', async (event, { prompt }) => {
    if (!tabManager) return { success: false, error: 'Tab manager unavailable' };

    // Use SearchService to build smart queries
    const analysis = searchService.buildSmartQueries(prompt);
    const queries = analysis.queries;
    
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

  // Delegate to Orchestrator for complex missions
  ipcMain.handle('agent:orchestrate', async (event, { prompt, tabId }) => {
    if (!tabManager) return { success: false, error: 'Tab manager unavailable' };

    // If no tabId provided, create one for the mission
    let missionTabId = tabId;
    if (!missionTabId) {
      // For now, create a blank tab or search tab
      missionTabId = await tabManager.createTab('about:blank');
    }

    const orchestrator = new Orchestrator(mainWindow);

    // Hook up progress
    orchestrator.setProgressCallback((payload) => {
      sendOrchestrateProgress(payload);
    });

    const view = tabManager.tabs.get(missionTabId);
    if (!view) return { success: false, error: 'Tab not found' };

    // Execute the mission on the tab's webContents
    // Note: The Orchestrator currently handles a single linear flow on one tab.
    // If the user wants the multi-tab "Research" flow (search -> open 4 tabs), 
    // that logic is currently inside background.js (lines 305-368).
    // The user requested a "Missions" architecture.
    // If the prompt is "Search for X", the Orchestrator should probably handle the search.

    // Let's decide: use the Orchestrator's "Plan-Execute" flow (User -> LLM -> Plan -> Execute)
    // detailed in the request.

    const result = await orchestrator.executeMission(prompt, view.webContents);

    // Track mission completion
    await missionTracker.completeMission(missionTabId, result);

    return {
      success: result.success,
      summary: result.summary || result.error || 'Done.',
      tabId: missionTabId
    };
  });

  // ─── Mode-Controlled Command (Fellou-style) ───
  // UI sends { mode, input, sessionId } — mode determines routing.
  // AUTO → orchestrator classifies intent first
  // SEARCH → tool only | ACTION → automation only | THINK → AI only | REFINE → AI + context
  ipcMain.handle('agent:command', async (event, { mode, input, sessionId }) => {
    if (!tabManager) return { type: 'ERROR', message: 'Tab manager unavailable' };

    const orchestrator = new Orchestrator(mainWindow);
    orchestrator.setProgressCallback((payload) => {
      sendOrchestrateProgress(payload);
    });

    // Resolve AUTO → actual mode so we know if webContents is needed
    const resolvedMode = orchestrator.resolveMode(mode, input);

    // For SEARCH/ACTION modes we need a webContents (browser tab)
    let webContents = null;
    let tabId = null;

    if (resolvedMode === 'SEARCH' || resolvedMode === 'ACTION') {
      const activeView = tabManager.getActiveTab();
      if (activeView) {
        webContents = activeView.webContents;
        tabId = tabManager.activeTabId;
      } else {
        tabId = await tabManager.createTab('about:blank');
        const view = tabManager.tabs.get(tabId);
        if (view) webContents = view.webContents;
      }
    }

    // Lazy webContents provider for edge cases (AUTO re-classification)
    const getWebContents = async () => {
      if (webContents) return { webContents, tabId };
      const activeView = tabManager.getActiveTab();
      if (activeView) {
        webContents = activeView.webContents;
        tabId = tabManager.activeTabId;
        return { webContents, tabId };
      }
      tabId = await tabManager.createTab('about:blank');
      const view = tabManager.tabs.get(tabId);
      webContents = view?.webContents || null;
      return { webContents, tabId };
    };

    try {
      const ctx = { webContents, sessionId: sessionId || `session_${Date.now()}`, getWebContents };
      const result = await orchestrator.handleCommand(
        { mode, input },
        ctx
      );

      // Grab tabId if it was lazily acquired inside handleCommand
      const finalTabId = tabId || ctx._acquiredTabId || null;

      // Track mission if it was a browser action
      if (finalTabId && (resolvedMode === 'SEARCH' || resolvedMode === 'ACTION')) {
        await missionTracker.completeMission(finalTabId, {
          success: result.type !== 'ERROR',
          summary: result.message,
          url: result.url,
          title: result.title,
        });
      }

      return {
        ...result,
        resolvedMode,
        tabId: finalTabId,
      };
    } catch (err) {
      console.error('[agent:command] error:', err);
      return { type: 'ERROR', message: err.message };
    }
  });

  // RAG: Resume incomplete mission
  ipcMain.handle('agent:resume', async (event, { prompt }) => {
    const resumeResult = await missionTracker.resumeMission(prompt);

    if (!resumeResult.canResume) {
      return { success: false, message: resumeResult.message };
    }

    const { mission } = resumeResult;

    // Create tab and navigate to last known URL
    const tabId = await tabManager.createTab(mission.url);

    return {
      success: true,
      message: `Resuming: "${mission.originalPrompt}"`,
      mission: {
        tabId,
        url: mission.url,
        title: mission.title,
        originalPrompt: mission.originalPrompt,
        steps: mission.steps
      }
    };
  });

  // Get relevant mission context for RAG
  ipcMain.handle('agent:context', async (event, { query }) => {
    const relevantMissions = await missionTracker.findRelevantMissions(query);
    return { success: true, missions: relevantMissions };
  });

  ipcMain.handle('ai:answer', async (event, { prompt }) => {
    try {
      const orchestrator = new Orchestrator(mainWindow);

      // If this is an action query (search/navigate/open), redirect to executeMission
      // Actions should NEVER call AI - they are tool-only
      const missionIntent = orchestrator._classifyMissionIntent(prompt);
      if (['SEARCH', 'NAVIGATE', 'SEARCH_AND_OPEN'].includes(missionIntent.type) && tabManager) {
        const tabId = await tabManager.createTab('about:blank');
        const view = tabManager.tabs.get(tabId);
        if (view) {
          const result = await orchestrator.executeMission(prompt, view.webContents);
          return { success: true, answer: result.summary || 'Done.', provider: 'action' };
        }
      }

      // For knowledge queries: use RAG if live web data needed
      const needsWeb = orchestrator._needsLiveData(prompt);

      let ragWebContents = null;
      let ragTabId = null;

      if (needsWeb && tabManager) {
        ragTabId = await tabManager.createTab('about:blank');
        const ragView = tabManager.tabs.get(ragTabId);
        if (ragView) ragWebContents = ragView.webContents;
      }

      const result = await orchestrator.answerWithRAG(prompt, ragWebContents);

      // Clean up hidden RAG tab
      if (ragTabId && tabManager) {
        try { tabManager.closeTab(ragTabId); } catch (_) {}
      }

      if (result.success) {
        let answer = result.answer;
        if (result.sources && result.sources.length > 0) {
          answer += '\n\n---\n**Sources:** ' + result.sources.map(s => {
            try { return `[${new URL(s).hostname}](${s})`; } catch (_) { return s; }
          }).join(', ');
        }
        return { success: true, answer, provider: result.provider };
      }
      return result;
    } catch (err) {
      console.error('[ai:answer] failed:', err.message);
      return aiService.runAgentTask('general', prompt);
    }
  });

  ipcMain.handle('ai:run', async (event, { taskType, prompt }) => {
    // Use structured prompt templates for formatted output
    const orchestrator = new Orchestrator(mainWindow);
    const promptType = orchestrator._detectPromptType(prompt);
    const formattedPrompt = orchestrator._buildPrompt(promptType, '', prompt);
    return aiService.runAgentTask(taskType, formattedPrompt);
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

  // AI Chat History
  ipcMain.handle('ai:history:get', async () => {
    return getAIChatHistory();
  });

  ipcMain.handle('ai:history:save', async (event, { sessionId, title, messages }) => {
    saveAIChatSession(sessionId, title, messages);
    return { success: true };
  });

  ipcMain.handle('ai:history:getSession', async (event, sessionId) => {
    const session = getAIChatSession(sessionId);
    if (session) {
      return { ...session, messages: JSON.parse(session.messages) };
    }
    return null;
  });

  ipcMain.handle('ai:history:delete', async (event, sessionId) => {
    deleteAIChatSession(sessionId);
    return { success: true };
  });

  // Browsing History Management
  ipcMain.handle('history:get', async () => historyService.getHistory());
  ipcMain.handle('history:search', async (event, query) => historyService.search(query));
  ipcMain.handle('history:delete', async (event, id) => {
    historyService.deleteById(id);
    return { success: true };
  });
  ipcMain.handle('history:clear', async () => {
    historyService.clear();
    return { success: true };
  });

  // Database Management
  ipcMain.handle('db:stats', async () => dbManager.getStats());
  ipcMain.handle('db:cleanup', async (event, days) => {
    const changes = dbManager.cleanup(days);
    return { success: true, changes };
  });
  ipcMain.handle('db:export', async (event, format = 'json') => {
    const result = format === 'csv' ? dbManager.exportToCSV() : dbManager.exportToJSON();
    return { success: true, ...result };
  });
  ipcMain.handle('db:backup', async () => {
    const result = dbManager.backupDatabase();
    return { success: true, ...result };
  });
  ipcMain.handle('db:optimize', async () => {
    dbManager.optimize();
    return { success: true };
  });

  // Crawler Service Handlers
  ipcMain.handle('crawler:extract', async (event, { tabId }) => {
    let view;
    if (tabId) {
      view = tabManager.tabs.get(tabId);
    } else {
      view = tabManager.getActiveTab();
    }

    if (!view) return { success: false, error: 'Tab not found' };

    const result = await crawlerService.extractPageData(view.webContents);
    return result;
  });

  ipcMain.handle('crawler:getCleanContent', async (event, { tabId }) => {
    let view;
    if (tabId) {
      view = tabManager.tabs.get(tabId);
    } else {
      view = tabManager.getActiveTab();
    }

    if (!view) return { success: false, error: 'Tab not found' };

    const content = await crawlerService.getCleanContent(view.webContents);
    return { success: true, content };
  });

  // Search Service Handlers
  ipcMain.handle('search:analyze', async (event, { prompt }) => {
    const analysis = searchService.analyzeQuery(prompt);
    return { success: true, analysis };
  });

  ipcMain.handle('search:buildQueries', async (event, { prompt, options }) => {
    const result = searchService.buildSmartQueries(prompt, options);
    return { success: true, result };
  });

  ipcMain.handle('search:extractIntent', async (event, { prompt }) => {
    const intent = searchService.extractIntent(prompt);
    return { success: true, intent };
  });

  // Report Generator Handlers
  ipcMain.handle('report:generate', async (event, { options }) => {
    const result = await reportGenerator.generateReport(options);
    return result;
  });

  ipcMain.handle('report:generateSummary', async (event, { tabId, summary, format }) => {
    let view;
    if (tabId) {
      view = tabManager.tabs.get(tabId);
    } else {
      view = tabManager.getActiveTab();
    }

    if (!view) return { success: false, error: 'Tab not found' };

    const crawledData = await crawlerService.extractPageData(view.webContents);
    
    if (!crawledData.success) {
      return { success: false, error: 'Failed to extract page data' };
    }

    const result = await reportGenerator.generateSummaryReport(crawledData, summary, format);
    return result;
  });

  ipcMain.handle('report:list', async () => {
    const reports = reportGenerator.getReports();
    return { success: true, reports };
  });

  ipcMain.handle('report:delete', async (event, { fileName }) => {
    const success = reportGenerator.deleteReport(fileName);
    return { success };
  });

  ipcMain.handle('report:getDirectory', async () => {
    const directory = reportGenerator.getReportsDirectory();
    return { success: true, directory };
  });

  // Memory Service Handlers
  ipcMain.handle('memory:storeInteraction', async (event, { interaction }) => {
    const entry = memoryService.storeInteraction(interaction);
    return { success: true, entry };
  });

  ipcMain.handle('memory:storeSummary', async (event, { summary }) => {
    const entry = memoryService.storeSummary(summary);
    return { success: true, entry };
  });

  ipcMain.handle('memory:storeInsight', async (event, { insight }) => {
    const entry = memoryService.storeInsight(insight);
    return { success: true, entry };
  });

  ipcMain.handle('memory:getRecentInteractions', async (event, { limit }) => {
    const interactions = memoryService.getRecentInteractions(limit);
    return { success: true, interactions };
  });

  ipcMain.handle('memory:searchInteractions', async (event, { query, limit }) => {
    const interactions = memoryService.searchInteractions(query, limit);
    return { success: true, interactions };
  });

  ipcMain.handle('memory:searchSummaries', async (event, { query, limit }) => {
    const summaries = memoryService.searchSummaries(query, limit);
    return { success: true, summaries };
  });

  ipcMain.handle('memory:getRelevantContext', async (event, { query, limit }) => {
    const context = memoryService.getRelevantContext(query, limit);
    return { success: true, context };
  });

  ipcMain.handle('memory:setPreference', async (event, { key, value }) => {
    memoryService.setPreference(key, value);
    return { success: true };
  });

  ipcMain.handle('memory:getPreference', async (event, { key, defaultValue }) => {
    const value = memoryService.getPreference(key, defaultValue);
    return { success: true, value };
  });

  ipcMain.handle('memory:getAllPreferences', async () => {
    const preferences = memoryService.getAllPreferences();
    return { success: true, preferences };
  });

  ipcMain.handle('memory:clear', async (event, { type }) => {
    if (type) {
      memoryService.clear(type);
    } else {
      memoryService.clearAll();
    }
    return { success: true };
  });

  ipcMain.handle('memory:stats', async () => {
    const stats = memoryService.getStats();
    return { success: true, stats };
  });

  ipcMain.handle('memory:export', async (event, { format }) => {
    const result = memoryService.export(format);
    return result;
  });

  ipcMain.handle('memory:import', async (event, { filePath }) => {
    const result = memoryService.import(filePath);
    return result;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
