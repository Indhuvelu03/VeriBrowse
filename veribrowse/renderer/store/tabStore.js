import { create } from 'zustand';

/**
 * tabStore
 * 
 * Manages the state of browser tabs in the renderer.
 * Synced from the main process via IPC listeners.
 */

export const useTabStore = create((set, get) => ({
    userTabs: [],
    shadowTabs: [],
    activeTabId: null,
    canGoBack: false,
    canGoForward: false,

    // Actions called by IPC Listeners
    addTab: (tab) => set((state) => {
        // De-duplicate: if this tabId already exists just update it
        const exists = state.userTabs.some(t => t.id === tab.id);
        if (exists) {
            return {
                userTabs: state.userTabs.map(t => t.id === tab.id ? { ...t, ...tab } : t),
            };
        }
        return {
            userTabs: [...state.userTabs, tab],
            activeTabId: state.activeTabId || tab.id,
        };
    }),

    addShadowTab: (tab) => set((state) => {
        const exists = state.shadowTabs.some(t => t.id === tab.id);
        if (exists) {
            return {
                shadowTabs: state.shadowTabs.map(t => t.id === tab.id ? { ...t, ...tab } : t),
            };
        }
        return { shadowTabs: [...state.shadowTabs, tab] };
    }),

    updateShadowTab: (tabId, updates) => set((state) => ({
        shadowTabs: state.shadowTabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t))
    })),

    removeShadowTab: (tabId) => set((state) => ({
        shadowTabs: state.shadowTabs.filter((t) => t.id !== tabId)
    })),


    updateTab: (tabId, updates) => {
        set((state) => ({
            userTabs: state.userTabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t))
        }));

        // If the updated tab is the active one, update back/forward state
        const state = get();
        if (tabId === state.activeTabId) {
            if (updates.canGoBack !== undefined) set({ canGoBack: updates.canGoBack });
            if (updates.canGoForward !== undefined) set({ canGoForward: updates.canGoForward });
        }
    },

    removeTab: (tabId) => set((state) => {
        const newTabs = state.userTabs.filter((t) => t.id !== tabId);
        let newActiveId = state.activeTabId;

        if (state.activeTabId === tabId) {
            newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
        }

        return { userTabs: newTabs, activeTabId: newActiveId };
    }),

    setActiveTab: (tabId, options = {}) => {
        const { fromMain = false } = options;
        const prevActiveTabId = get().activeTabId;
        const tab = get().userTabs.find(t => t.id === tabId);
        set({
            activeTabId: tabId,
            canGoBack: tab?.canGoBack || false,
            canGoForward: tab?.canGoForward || false
        });

        if (!fromMain && window.electronAPI?.browser) {
            if (prevActiveTabId && prevActiveTabId !== tabId) {
                window.electronAPI.browser.hideViewport(prevActiveTabId);
            }
            window.electronAPI.browser.activateTab(tabId);
        }
    },

    // Browser Actions
    navigate: (url) => {
        const { activeTabId } = get();
        if (activeTabId && window.electronAPI?.browser) {
            window.electronAPI.browser.navigate(activeTabId, url);
        }
    },

    // createNewTab: pure local operation.
    createNewTab: (url = 'about:blank') => {
        const tabId = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const newTab = {
            id: tabId,
            url,
            title: url === 'about:blank' ? 'New Tab' : url,
            favicon: null,
            isLoading: false,
        };

        set((state) => ({
            userTabs: [...state.userTabs, newTab],
            activeTabId: tabId,
        }));

        // Tell Playwright main process to open a new page for this tab
        if (window.electronAPI?.browser) {
            window.electronAPI.browser.newTab(tabId, url);
        }
    },

    closeTab: (tabId) => {
        const state = get();
        const { userTabs, activeTabId, removeTab, createNewTab } = state;

        if (window.electronAPI?.browser) {
            window.electronAPI.browser.hideViewport(tabId);
            window.electronAPI.browser.closeTab(tabId);
        }

        if (userTabs.length <= 1) {
            createNewTab();
            removeTab(tabId);
            return;
        }

        removeTab(tabId);

        setTimeout(() => {
            const newActiveId = get().activeTabId;
            if (newActiveId && newActiveId !== tabId && window.electronAPI?.browser) {
                const newActive = get().userTabs.find(t => t.id === newActiveId);
                if (newActive?.url && newActive.url !== 'about:blank') {
                    window.electronAPI.browser.resizeViewport(newActiveId, {
                        x: 48, y: 108,
                        width: window.innerWidth - 48,
                        height: window.innerHeight - 108,
                    });
                }
            }
        }, 0);
    },
}));
