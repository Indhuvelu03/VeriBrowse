const { contextBridge, ipcRenderer } = require('electron');

/**
 * preload.js
 *
 * Secure CommonJS bridge between Electron main and the Next.js renderer.
 * Must use require() — Electron loads this file raw (not bundled by Nextron),
 * so ES Module import syntax breaks here regardless of package.json "type".
 *
 * All IPC channels the renderer is allowed to listen on:
 */
const allowedChannels = [
  'workflow:started',
  'workflow:step-updated',
  'workflow:paused',
  'workflow:resumed',
  'workflow:completed',
  'workflow:failed',
  'workflow:summary-ready',
  'workflow:needs-human',
  'browser:user-tab-created',
  'browser:user-tab-updated',
  'browser:user-tab-closed',
  'browser:user-tab-switched',
  'browser:shadow-tab-created',
  'browser:shadow-tab-updated',
  'browser:shadow-tab-closed',
  'agent:status',
  'agent:error',
  'agent:summary-ready',
  'agent:chat-response',
  'agent:execution-step',
  'agent:autonomous-done',
  'agent:state-change',
  'credit:updated',
  'credit:warning',
  'credit:critical',
];

contextBridge.exposeInMainWorld('electronAPI', {

  // ─── Window Controls ──────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // ─── Agent & Workflow ─────────────────────────────────────────────────────
  agent: {
    run: (goal, mode) => ipcRenderer.send('agent:run', { goal, mode }),
    resume: () => ipcRenderer.invoke('agent:resume'),  // HITL resume
    autonomous: (goal) => ipcRenderer.invoke('agent:autonomous', { goal }),
    cancelAutonomous: () => ipcRenderer.send('agent:cancel-autonomous'),
  },

  // ─── Browser & Tabs ───────────────────────────────────────────────────────
  browser: {
    navigate: (tabId, url) => ipcRenderer.send('browser:navigate', { tabId, url }),
    goBack: (tabId) => ipcRenderer.send('browser:back', { tabId }),
    goForward: (tabId) => ipcRenderer.send('browser:forward', { tabId }),
    refresh: (tabId) => ipcRenderer.send('browser:refresh', { tabId }),
    resizeViewport: (tabId, bounds) => ipcRenderer.send('browser:resize-viewport', { tabId, bounds }),
    hideViewport: (tabId) => ipcRenderer.send('browser:hide-viewport', { tabId }),
    newTab: (tabId, url) => ipcRenderer.send('browser:new-tab', { tabId, url }),
    // Destroys the Playwright page + BrowserView for the given tab
    closeTab: (tabId) => ipcRenderer.send('browser:close-tab', { tabId }),
  },



  // ─── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.send('settings:set', { key, value }),
  },

  // ─── Credits ──────────────────────────────────────────────────────────────
  credits: {
    getStats: () => ipcRenderer.invoke('credits:get-stats'),
  },

  // ─── Agent Runtime Stats ──────────────────────────────────────────────────
  agentStats: {
    get: () => ipcRenderer.invoke('agent:get-stats'),
  },

  // ─── History & Downloads ──────────────────────────────────────────────────
  history: {
    get: (search) => ipcRenderer.invoke('browser:get-history', search),
    clear: () => ipcRenderer.send('browser:clear-history'),
  },
  downloads: {
    get: () => ipcRenderer.invoke('browser:get-downloads'),
    showInFolder: (filePath) => ipcRenderer.send('browser:show-item', filePath),
  },

  // ─── Chat History (Bug #6 fix) ─────────────────────────────────────────────
  chat: {
    addMessage: (sessionId, role, content) =>
      ipcRenderer.invoke('chat:add-message', { sessionId, role, content }),
    getMessages: (sessionId) =>
      ipcRenderer.invoke('chat:get-messages', sessionId),
  },


  // ─── Event Listeners ──────────────────────────────────────────────────────
  // Generic on/off for all whitelisted channels
  on: (channel, callback) => {
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, data) => callback(data));
    }
  },
  off: (channel, callback) => {
    if (allowedChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  removeAllListeners: (channel) => {
    if (allowedChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});