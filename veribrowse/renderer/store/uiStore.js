import { create } from 'zustand';

/**
 * uiStore
 * 
 * Manages the global layout and navigation state for the Fellou-inspired redesign.
 */

export const useUIStore = create((set, get) => ({
  // Navigation & Views
  currentPage: 'home', // 'home' | 'history' | 'downloads' | 'settings'
  activeView: 'home', // 'home' | 'browser'

  // Panel States
  agentPanelOpen: false,

  // Toasts
  toasts: [],

  // Actions
  setCurrentPage: (page) => {
    if (page !== 'home') {
      // Close agent panel when opening an overlay page
      set({ currentPage: page, agentPanelOpen: false });
    } else {
      set({ currentPage: page });
    }
  },

  setActiveView: (view) => set({ activeView: view }),

  toggleAgentPanel: () => set((state) => ({
    agentPanelOpen: !state.agentPanelOpen,
    // Close any overlay when opening agent panel
    currentPage: !state.agentPanelOpen ? 'home' : state.currentPage,
  })),

  openAgentPanel: () => set({ agentPanelOpen: true, currentPage: 'home' }),

  closeAgentPanel: () => set({ agentPanelOpen: false }),

  // Helper to clear overlays
  closeOverlays: () => set({ currentPage: 'home' }),

  // Notifications
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }));
    }, 5000);
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  }))
}));
