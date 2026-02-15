import { create } from 'zustand';

export const useChatStore = create((set) => ({
    messages: [
        {
            id: 'init-1',
            role: 'assistant',
            content: "I'm analyzing the workspace context. How can I assist your session?",
            timestamp: Date.now()
        }
    ],
    isLoading: false,
    responseCache: {}, // Rule 9: Cache responses to avoid repeated calls

    // Adds a message (user or AI) to the state
    addMessage: (message) => set((state) => ({
        messages: [
            ...state.messages,
            {
                ...message,
                id: message.id || Date.now().toString(),
                timestamp: message.timestamp || Date.now()
            }
        ]
    })),

    // Cache management
    addToCache: (prompt, response) => set((state) => ({
        responseCache: { ...state.responseCache, [prompt.trim().toLowerCase()]: response }
    })),

    // Sets the loading state
    setLoading: (isLoading) => set({ isLoading }),

    // Clears chat history
    clearMessages: () => set({
        messages: [{
            id: 'init-1',
            role: 'assistant',
            content: "Chat history cleared. How can I help you?",
            timestamp: Date.now()
        }],
        responseCache: {} // Clear cache on reset
    })
}));
