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
    currentTools: [], // List of tools the agent is currently using
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
    setLoading: (isLoading) => set((state) => ({
        isLoading,
        currentTools: isLoading ? state.currentTools : [] // Reset tools when done
    })),

    // Sets the current tools being used
    setCurrentTools: (tools) => set({ currentTools: tools || [] }),

    // Clears chat history
    clearMessages: () => set({
        messages: [{
            id: 'init-1',
            role: 'assistant',
            content: "Chat history cleared. How can I help you?",
            timestamp: Date.now()
        }],
        currentTools: [],
        responseCache: {} // Clear cache on reset
    })
}));
