/**
 * IPC Wrapper - Safe wrapper around Electron IPC
 * Provides error handling and type safety
 */

// Check if electron is available
const isElectronAvailable = typeof window !== 'undefined' && window.electron

/**
 * Agent API
 */
export const agent = {
    /**
     * Initialize agent with Gemini API key
     * @param {string} apiKey - Gemini API key
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    initialize: async (apiKey) => {
        if (!isElectronAvailable) {
            console.warn('Electron not available')
            return { success: false, error: 'Electron not available' }
        }
        try {
            return await window.electron.agent.initialize(apiKey)
        } catch (error) {
            console.error('Agent initialize error:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Check agent initialization status
     * @returns {Promise<{initialized: boolean, tokensUsed: number, historyLength: number}>}
     */
    checkStatus: async () => {
        if (!isElectronAvailable) return { initialized: false, tokensUsed: 0, historyLength: 0 }
        try {
            return await window.electron.agent.checkStatus()
        } catch (error) {
            console.error('Check status error:', error)
            return { initialized: false, tokensUsed: 0, historyLength: 0 }
        }
    },

    /**
     * Send chat message to agent
     * @param {string} message - User message
     * @param {'auto'|'think'|'refine'|'action'} mode - Agent mode
     * @returns {Promise<{success: boolean, response?: string, error?: string, turns?: number}>}
     */
    chat: async (message, mode = 'auto') => {
        if (!isElectronAvailable) {
            return { success: false, error: 'Electron not available' }
        }
        try {
            return await window.electron.agent.chat(message, mode)
        } catch (error) {
            console.error('Agent chat error:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Refine user prompt
     * @param {string} prompt - Original prompt
     * @returns {Promise<{success: boolean, original: string, refined: string}>}
     */
    refine: async (prompt) => {
        if (!isElectronAvailable) {
            return { success: false, error: 'Electron not available' }
        }
        try {
            return await window.electron.agent.refine(prompt)
        } catch (error) {
            console.error('Refine error:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Get conversation history
     * @returns {Promise<{success: boolean, history: Array, tokensUsed: number}>}
     */
    getHistory: async () => {
        if (!isElectronAvailable) return { success: false, history: [], tokensUsed: 0 }
        try {
            return await window.electron.agent.getHistory()
        } catch (error) {
            console.error('Get history error:', error)
            return { success: false, history: [], tokensUsed: 0 }
        }
    },

    /**
     * Clear conversation history
     * @returns {Promise<{success: boolean}>}
     */
    clearHistory: async () => {
        if (!isElectronAvailable) return { success: false }
        try {
            return await window.electron.agent.clearHistory()
        } catch (error) {
            console.error('Clear history error:', error)
            return { success: false }
        }
    },

    /**
     * Get available tools
     * @returns {Promise<{success: boolean, tools: Array, categories: Object}>}
     */
    getAvailableTools: async () => {
        if (!isElectronAvailable) return { success: false, tools: [], categories: {} }
        try {
            return await window.electron.agent.getAvailableTools()
        } catch (error) {
            console.error('Get tools error:', error)
            return { success: false, tools: [], categories: {} }
        }
    },

    /**
     * Execute a tool manually
     * @param {string} toolName - Tool name
     * @param {Object} args - Tool arguments
     * @returns {Promise<{success: boolean, result?: any}>}
     */
    executeTool: async (toolName, args) => {
        if (!isElectronAvailable) return { success: false }
        try {
            return await window.electron.agent.executeTool(toolName, args)
        } catch (error) {
            console.error('Execute tool error:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Update API key
     * @param {string} apiKey - New API key
     * @returns {Promise<{success: boolean}>}
     */
    updateApiKey: async (apiKey) => {
        if (!isElectronAvailable) return { success: false }
        try {
            return await window.electron.agent.updateApiKey(apiKey)
        } catch (error) {
            console.error('Update API key error:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Cleanup agent resources
     * @returns {Promise<{success: boolean}>}
     */
    cleanup: async () => {
        if (!isElectronAvailable) return { success: false }
        try {
            return await window.electron.agent.cleanup()
        } catch (error) {
            console.error('Cleanup error:', error)
            return { success: false }
        }
    },

    // Event listeners
    onProgress: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.agent.onProgress(callback)
    },

    onThinking: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.agent.onThinking(callback)
    },

    onToolExecuting: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.agent.onToolExecuting(callback)
    },

    onToolProgress: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.agent.onToolProgress(callback)
    },

    onComplete: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.agent.onComplete(callback)
    },

    onError: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.agent.onError(callback)
    }
}

/**
 * Browser API
 */
export const browser = {
    navigate: async (url) => {
        if (!isElectronAvailable) return { success: false }
        try {
            return await window.electron.browser.navigate(url)
        } catch (error) {
            console.error('Navigate error:', error)
            return { success: false, error: error.message }
        }
    },

    search: async (query) => {
        if (!isElectronAvailable) return { success: false }
        try {
            return await window.electron.browser.search(query)
        } catch (error) {
            console.error('Search error:', error)
            return { success: false, error: error.message }
        }
    },

    goBack: async () => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.browser.goBack()
    },

    goForward: async () => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.browser.goForward()
    },

    refresh: async () => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.browser.refresh()
    },

    newTab: async () => {
        if (!isElectronAvailable) return 'mock-tab-id'
        return await window.electron.browser.newTab()
    },

    closeTab: async (tabId) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.browser.closeTab(tabId)
    },

    switchTab: async (tabId) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.browser.switchTab(tabId)
    },

    getAllTabs: async () => {
        if (!isElectronAvailable) return []
        return await window.electron.browser.getAllTabs()
    },

    resize: (bounds) => {
        if (!isElectronAvailable) return
        window.electron.browser.resize(bounds)
    },

    hide: () => {
        if (!isElectronAvailable) return
        window.electron.browser.hide()
    },

    onNavigate: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.browser.onNavigate(callback)
    },

    onPageLoad: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.browser.onPageLoad(callback)
    },

    onPageTitleUpdate: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.browser.onPageTitleUpdate(callback)
    },

    onStatusUpdate: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.browser.onStatusUpdate(callback)
    },
    onAddTab: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.browser.onAddTab(callback)
    }
}

/**
 * History API
 */
export const history = {
    getAll: async (limit = 50, offset = 0) => {
        if (!isElectronAvailable) return []
        try {
            return await window.electron.history.getAll(limit, offset)
        } catch (error) {
            console.error('Get history error:', error)
            return []
        }
    },

    search: async (query) => {
        if (!isElectronAvailable) return []
        try {
            return await window.electron.history.search(query)
        } catch (error) {
            console.error('Search history error:', error)
            return []
        }
    },

    add: async (item) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.history.add(item)
    },

    delete: async (id) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.history.delete(id)
    },

    clear: async () => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.history.clear()
    }
}

/**
 * Downloads API
 */
export const downloads = {
    getAll: async () => {
        if (!isElectronAvailable) return []
        return await window.electron.downloads.getAll()
    },

    pause: async (id) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.downloads.pause(id)
    },

    resume: async (id) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.downloads.resume(id)
    },

    cancel: async (id) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.downloads.cancel(id)
    },

    onDownloadStart: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.downloads.onDownloadStart(callback)
    },

    onDownloadProgress: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.downloads.onDownloadProgress(callback)
    },

    onDownloadComplete: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.downloads.onDownloadComplete(callback)
    }
}

/**
 * Window API
 */
export const windowControls = {
    minimize: () => {
        if (!isElectronAvailable) return
        window.electron.window.minimize()
    },

    maximize: () => {
        if (!isElectronAvailable) return
        window.electron.window.maximize()
    },

    close: () => {
        if (!isElectronAvailable) return
        window.electron.window.close()
    },

    onMaximize: (callback) => {
        if (!isElectronAvailable) return () => { }
        return window.electron.window.onMaximize(callback)
    }
}

/**
 * Settings API
 */
export const settings = {
    get: async (key) => {
        if (!isElectronAvailable) return null
        return await window.electron.settings.get(key)
    },

    set: async (key, value) => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.settings.set(key, value)
    },

    getAll: async () => {
        if (!isElectronAvailable) return {}
        return await window.electron.settings.getAll()
    },

    reset: async () => {
        if (!isElectronAvailable) return { success: false }
        return await window.electron.settings.reset()
    }
}

// Default export with all APIs
export default {
    agent,
    browser,
    history,
    downloads,
    window: windowControls,
    settings
}
