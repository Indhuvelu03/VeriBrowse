import { create } from 'zustand';

/**
 * useUIStore - Mode-based UI State Machine
 * Inspired by Fellou.ai / Arc architecture.
 * 
 * sidebarMode: 'chat' | 'newtab' | 'hidden'
 * mainView: 'home' | 'browser'
 */
export const useUIStore = create((set, get) => ({
  sidebarMode: 'hidden',
  mainView: 'home',

  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setMainView: (view) => set({ mainView: view }),

  // The "Exact Fix" logic requested by user
  handleClose: () => {
    const { sidebarMode } = get();
    if (sidebarMode === 'chat') {
      set({ sidebarMode: 'newtab' });
    } else {
      set({ sidebarMode: 'hidden' });
    }
  },

  // State triggers
  openChat: () => set({ sidebarMode: 'chat' }),
  openHome: () => set({ mainView: 'home', sidebarMode: 'hidden' }),

  toggleChat: () => {
    const { sidebarMode } = get();
    if (sidebarMode === 'chat') {
      set({ sidebarMode: 'hidden' });
    } else {
      set({ sidebarMode: 'chat' });
    }
  },

  // Legacy compatibility for components using this
  setShowHome: (show) => set({ mainView: show ? 'home' : 'browser' }),
  get chatOpen() { return get().sidebarMode === 'chat'; },
  get showHome() { return get().mainView === 'home'; }
}));
