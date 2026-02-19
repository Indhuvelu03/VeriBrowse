const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electron', {

  // ==========================================
  // AGENT APIs
  // ==========================================

  agent: {
    // Initialize agent with API key
    initialize: (apiKey) => ipcRenderer.invoke('agent:initialize', apiKey),

    // Check agent status
    checkStatus: () => ipcRenderer.invoke('agent:check-status'),

    // Main chat method
    chat: (message, mode = 'auto') =>
      ipcRenderer.invoke('agent:chat', { message, mode }),

    // Refine user prompt
    refine: (prompt) => ipcRenderer.invoke('agent:refine', prompt),

    // Get conversation history
    getHistory: () => ipcRenderer.invoke('agent:get-history'),

    // Clear conversation history
    clearHistory: () => ipcRenderer.invoke('agent:clear-history'),

    // Get available tools
    getAvailableTools: () => ipcRenderer.invoke('agent:get-available-tools'),

    // Execute a tool manually
    executeTool: (toolName, args) =>
      ipcRenderer.invoke('agent:execute-tool', { toolName, args }),

    // Update API key
    updateApiKey: (apiKey) => ipcRenderer.invoke('agent:update-api-key', apiKey),

    // Cleanup
    cleanup: () => ipcRenderer.invoke('agent:cleanup'),

    // Event listeners
    onProgress: (callback) => {
      const subscription = (event, data) => callback(data)
      ipcRenderer.on('agent:progress', subscription)

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener('agent:progress', subscription)
      }
    },

    onThinking: (callback) => {
      const subscription = (event, data) => {
        if (data.status === 'thinking') callback(data)
      }
      ipcRenderer.on('agent:progress', subscription)
      return () => ipcRenderer.removeListener('agent:progress', subscription)
    },

    onToolExecuting: (callback) => {
      const subscription = (event, data) => {
        if (data.status === 'executing_tools') callback(data)
      }
      ipcRenderer.on('agent:progress', subscription)
      return () => ipcRenderer.removeListener('agent:progress', subscription)
    },

    onToolProgress: (callback) => {
      const subscription = (event, data) => {
        if (data.status === 'tool_progress') callback(data)
      }
      ipcRenderer.on('agent:progress', subscription)
      return () => ipcRenderer.removeListener('agent:progress', subscription)
    },

    onComplete: (callback) => {
      const subscription = (event, data) => {
        if (data.status === 'complete') callback(data)
      }
      ipcRenderer.on('agent:progress', subscription)
      return () => ipcRenderer.removeListener('agent:progress', subscription)
    },

    onError: (callback) => {
      const subscription = (event, data) => {
        if (data.status === 'error') callback(data)
      }
      ipcRenderer.on('agent:progress', subscription)
      return () => ipcRenderer.removeListener('agent:progress', subscription)
    }
  },

  // ==========================================
  // BROWSER APIs
  // ==========================================

  browser: {
    // Navigation
    navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
    search: (query) => ipcRenderer.invoke('browser:search', query),
    goBack: () => ipcRenderer.invoke('browser:go-back'),
    goForward: () => ipcRenderer.invoke('browser:go-forward'),
    refresh: () => ipcRenderer.invoke('browser:refresh'),

    // Tab management
    newTab: () => ipcRenderer.invoke('browser:new-tab'),
    closeTab: (tabId) => ipcRenderer.invoke('browser:close-tab', tabId),
    switchTab: (tabId) => ipcRenderer.invoke('browser:switch-tab', tabId),
    getAllTabs: () => ipcRenderer.invoke('browser:get-all-tabs'),

    // Layout (Direct IPC)
    resize: (bounds) => ipcRenderer.send('view-resize', bounds),
    hide: () => ipcRenderer.send('view-hide'),
    show: () => ipcRenderer.send('view-show'),

    // Event listeners
    onNavigate: (callback) => {
      const subscription = (event, url) => callback(url)
      ipcRenderer.on('browser:navigate-event', subscription)
      return () => ipcRenderer.removeListener('browser:navigate-event', subscription)
    },

    onPageLoad: (callback) => {
      const subscription = (event, data) => callback(data)
      ipcRenderer.on('browser:page-load', subscription)
      return () => ipcRenderer.removeListener('browser:page-load', subscription)
    },

    onPageTitleUpdate: (callback) => {
      const subscription = (event, title) => callback(title)
      ipcRenderer.on('browser:title-update', subscription)
      return () => ipcRenderer.removeListener('browser:title-update', subscription)
    },

    onStatusUpdate: (callback) => {
      const subscription = (event, status) => callback(status)
      ipcRenderer.on('browser:status-update', subscription)
      return () => ipcRenderer.removeListener('browser:status-update', subscription)
    },
    onAddTab: (callback) => {
      const subscription = (event, tab) => callback(tab)
      ipcRenderer.on('browser:add-tab', subscription)
      return () => ipcRenderer.removeListener('browser:add-tab', subscription)
    }
  },

  // ==========================================
  // HISTORY APIs
  // ==========================================

  history: {
    // Get all history
    getAll: (limit = 50, offset = 0) =>
      ipcRenderer.invoke('history:get-all', { limit, offset }),

    // Search history
    search: (query) => ipcRenderer.invoke('history:search', query),

    // Add history entry
    add: (item) => ipcRenderer.invoke('history:add', item),

    // Delete history entry
    delete: (id) => ipcRenderer.invoke('history:delete', id),

    // Clear all history
    clear: () => ipcRenderer.invoke('history:clear')
  },

  // ==========================================
  // DOWNLOADS APIs
  // ==========================================

  downloads: {
    // Get all downloads
    getAll: () => ipcRenderer.invoke('downloads:get-all'),

    // Pause download
    pause: (id) => ipcRenderer.invoke('downloads:pause', id),

    // Resume download
    resume: (id) => ipcRenderer.invoke('downloads:resume', id),

    // Cancel download
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),

    // Event listeners
    onDownloadStart: (callback) => {
      const subscription = (event, download) => callback(download)
      ipcRenderer.on('download:start', subscription)
      return () => ipcRenderer.removeListener('download:start', subscription)
    },

    onDownloadProgress: (callback) => {
      const subscription = (event, progress) => callback(progress)
      ipcRenderer.on('download:progress', subscription)
      return () => ipcRenderer.removeListener('download:progress', subscription)
    },

    onDownloadComplete: (callback) => {
      const subscription = (event, download) => callback(download)
      ipcRenderer.on('download:complete', subscription)
      return () => ipcRenderer.removeListener('download:complete', subscription)
    }
  },

  // ==========================================
  // WINDOW APIs
  // ==========================================

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),

    onMaximize: (callback) => {
      const subscription = (event, isMaximized) => callback(isMaximized)
      ipcRenderer.on('window:maximized', subscription)
      return () => ipcRenderer.removeListener('window:maximized', subscription)
    }
  },

  // ==========================================
  // SETTINGS APIs
  // ==========================================

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    reset: () => ipcRenderer.invoke('settings:reset')
  }
})

console.log('[Preload] Context bridge initialized')