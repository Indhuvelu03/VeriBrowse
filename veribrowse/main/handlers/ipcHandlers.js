const { ipcMain, BrowserWindow } = require('electron');
const {
  saveSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryItem,
} = require('../lib/historyDb');
const {
  saveAIChatSession,
  getAIChatHistory,
  getAIChatSession,
  deleteAIChatSession,
} = require('../lib/aiHistoryDb');

function registerIpcHandlers() {
  // Window controls
  ipcMain.on('minimize-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.on('maximize-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  // Search history
  ipcMain.handle('save-search-history', async (event, data) => {
    try {
      saveSearchHistory(data.url, data.title, data.query);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-search-history', async () => {
    try {
      return getSearchHistory();
    } catch (error) {
      console.error('Failed to get search history:', error);
      return [];
    }
  });

  ipcMain.handle('delete-search-history-item', async (event, id) => {
    try {
      deleteSearchHistoryItem(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clear-search-history', async () => {
    try {
      clearSearchHistory();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // AI chat
  ipcMain.handle('ai-chat', async (event, { sessionId, messages, images }) => {
    try {
      const result = await orchestrator.processMessage(sessionId, messages, { images });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-ai-session', async (event, { sessionId, title, messages }) => {
    try {
      saveAIChatSession(sessionId, title, messages);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-ai-history', async () => {
    try {
      return getAIChatHistory();
    } catch (error) {
      console.error('Failed to get AI history:', error);
      return [];
    }
  });

  ipcMain.handle('get-ai-session', async (event, sessionId) => {
    try {
      return getAIChatSession(sessionId);
    } catch (error) {
      console.error('Failed to get AI session:', error);
      return null;
    }
  });

  ipcMain.handle('delete-ai-session', async (event, sessionId) => {
    try {
      deleteAIChatSession(sessionId);
      orchestrator.clearSessionContext(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('check-ollama-status', async () => {
    try {
      return await aiService.checkOllamaStatus();
    } catch (error) {
      return { success: false, running: false, error: error.message };
    }
  });
}

module.exports = { registerIpcHandlers };