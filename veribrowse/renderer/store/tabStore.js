import { create } from 'zustand';
import { browser } from '../lib/ipc';

export const useTabStore = create((set, get) => ({
  tabs: [],
  activeTabId: null,
  // Using a separate map or just storing history in tabs would be ideal.
  // For simplicity, we'll store navigation state inside each tab object if needed, 
  // but simpler now is to expose an action that BrowserView can listen to or triggering via events.
  // However, with iframe based browser, we need to imperatively call methods on the iframe.
  // Since we can't easily reach into the iframe from here without a ref, we'll use an event bus or signal approach.
  // For now, let's add a "navigationAction" timestamp/type to the active tab to signal BrowserView.

  // Actions: 'back', 'forward', 'reload', 'stop'
  triggerNavigation: (action) =>
    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === state.activeTabId
          ? { ...t, navigationAction: { type: action, timestamp: Date.now() } }
          : t
      )
    })),

  addTab: (tab) =>
    set((state) => {
      if (tab.url && tab.url !== 'about:blank') {
        browser.navigate(tab.url);
      }
      const newTabs = [...state.tabs, tab];
      return { tabs: newTabs, activeTabId: tab.id };
    }),

  closeTab: (id) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        if (newTabs.length > 0) {
          newActiveId = newTabs[newTabs.length - 1].id;
          const nextTab = newTabs[newTabs.length - 1];
          if (nextTab.url && nextTab.url !== 'about:blank') {
            browser.navigate(nextTab.url);
          } else {
            browser.hide();
          }
        } else {
          newActiveId = null;
          browser.hide();
          browser.navigate('about:blank'); // Purge content
          useUIStore.getState().openHome(); // Reset layout
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    }),

  setActiveTab: (id) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (tab && tab.url && tab.url !== 'about:blank') {
        browser.navigate(tab.url);
      }
      return { activeTabId: id };
    });
  },

  syncTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  updateTab: (id, updates) =>
    set((state) => {
      if (updates.url) {
        browser.navigate(updates.url);
      }
      return {
        tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      };
    }),
}));
