import { create } from 'zustand';

export const useUIStore = create((set) => ({
  chatOpen: false,
  showHome: true,

  toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),

  setShowHome: (show) => set({ showHome: show }),
}));
