import { create } from 'zustand';

/**
 * tabStore
 * 
 * Manages the state of browser tabs in the renderer.
 * Synced from the main process via IPC listeners.
 */

export const useTabStore = create((set, get) => ({
    userTabs: [],
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

    setActiveTab: (tabId) => {
        const tab = get().userTabs.find(t => t.id === tabId);
        set({
            activeTabId: tabId,
            canGoBack: tab?.canGoBack || false,
            canGoForward: tab?.canGoForward || false
        });
    },

    // Browser Actions
    navigate: (url) => {
        const { activeTabId } = get();
        if (activeTabId && window.electronAPI?.browser) {
            window.electronAPI.browser.navigate(activeTabId, url);
        }
    },

    // createNewTab: pure local operation.
    // Adds a blank tab to the store and switches the view to 'home'.
    // The BrowserView is hidden automatically because the new tab has no URL
    // (BrowserLayer returns null + sends 0×0 bounds for tabs with about:blank).
    // When the user types a URL in the omnibox and hits Enter, THEN a real
    // Playwright page is navigated via the browser:navigate IPC.
    createNewTab: (url = 'about:blank') => {
        const { v4: uuidv4 } = require('uuid') ?? { v4: () => Math.random().toString(36).slice(2) };
        const tabId = `user-${Date.now().toString(36)}`;
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

        // 1. Hide the BrowserView for the tab being closed so the page
        //    doesn't remain visible after the tab strip entry is gone.
        if (window.electronAPI?.browser) {
            window.electronAPI.browser.hideViewport(tabId);
            window.electronAPI.browser.closeTab(tabId); // tells main to destroy Playwright page
        }

        // 2. If this is the LAST tab, create a fresh blank one first so the
        //    UI never ends up with zero tabs (avoids the whole bar disappearing).
        if (userTabs.length <= 1) {
            createNewTab(); // adds a blank tab + switches to it
            removeTab(tabId);
            return;
        }

        // 3. Normal close — removeTab picks the previous tab as new active
        removeTab(tabId);

        // 4. After state update, switch the BrowserView to the new active tab.
        //    Use setTimeout(0) so the store update has settled.
        setTimeout(() => {
            const newActiveId = get().activeTabId;
            if (newActiveId && newActiveId !== tabId && window.electronAPI?.browser) {
                const newActive = get().userTabs.find(t => t.id === newActiveId);
                if (newActive?.url && newActive.url !== 'about:blank') {
                    // Re-send resize so the new active tab's BrowserView becomes visible
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
