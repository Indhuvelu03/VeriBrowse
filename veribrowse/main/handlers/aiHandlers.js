const { ipcMain } = require('electron');
const orchestrator = require('../services/Orchestrator');
const aiService = require('../services/AiService');
const {
  saveAIChatSession,
  getAIChatHistory,
  getAIChatSession,
  deleteAIChatSession,
} = require('../lib/aiHistoryDb');

function registerAIHandlers() {
  ipcMain.handle('ai-chat', async (event, { sessionId, messages, images }) => {
    try {
      return await orchestrator.processMessage(sessionId, messages, { images });
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
      return [];
    }
  });

  ipcMain.handle('get-ai-session', async (event, sessionId) => {
    try {
      return getAIChatSession(sessionId);
    } catch (error) {
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
      return { success: false, running: false };
    }
  });
}

module.exports = { registerAIHandlers };
