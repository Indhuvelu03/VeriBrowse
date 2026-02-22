import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * workflowStore
 * 
 * Manages sessions, agent execution, steps, and history.
 */

export const useWorkflowStore = create(
    persist(
        (set, get) => ({
            sessions: [],
            activeSessionId: null,

            // Current Session State (Transient)
            isRunning: false,
            isPaused: false,
            needsHuman: false,
            pauseReason: null,
            goal: '',
            agentStatus: 'idle',
            steps: [],
            summary: null,
            error: null,
            creditsUsed: 0,

            // Actions
            newSession: () => {
                // Generate a proper UUID v4 — Supabase chat_history.session_id is type UUID
                // and rejects short random strings like "6v4ky".
                const id = typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                        const r = Math.random() * 16 | 0;
                        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                    });

                const newSession = {
                    id,
                    title: 'New Session',
                    createdAt: new Date().toISOString(),
                    messages: []
                };
                set((state) => ({
                    sessions: [newSession, ...state.sessions],
                    activeSessionId: id,
                    isRunning: false,
                    isPaused: false,
                    needsHuman: false,
                    steps: [],
                    summary: null,
                    goal: '',
                    agentStatus: 'idle'
                }));
            },

            loadSession: (sessionId) => {
                const session = get().sessions.find(s => s.id === sessionId);
                if (session) {
                    set({
                        activeSessionId: sessionId,
                        goal: session.title || '',
                        steps: [], // Steps are usually per-run, not persisted in this simple version
                        summary: null
                    });
                }
            },

            startWorkflow: (goal, mode = 'refine') => {
                if (!get().activeSessionId) {
                    get().newSession();
                }

                // Add user message immediately
                get().addMessage('user', goal);

                set({
                    isRunning: true,
                    isPaused: false,
                    needsHuman: false,
                    goal,
                    steps: [],
                    summary: null,
                    error: null,
                    agentStatus: 'planning'
                });

                if (window.electronAPI?.agent) {
                    window.electronAPI.agent.run(goal, mode);
                }
            },

            addMessage: (role, content) => {
                const { activeSessionId, sessions } = get();
                if (!activeSessionId) return;

                set({
                    sessions: sessions.map(s =>
                        s.id === activeSessionId
                            ? {
                                ...s,
                                messages: [...s.messages, { role, content, timestamp: new Date().toISOString() }],
                                // Use the first user message as the session title
                                title: s.messages.length === 0 && role === 'user' ? content.slice(0, 60) : s.title
                            }
                            : s
                    )
                });

                // Bug #6 fix: persist to Supabase (fire-and-forget; Supabase may not be configured)
                if (window.electronAPI?.chat) {
                    window.electronAPI.chat.addMessage(activeSessionId, role, content).catch(() => {
                        // Silently fail — local state is already updated above
                    });
                }
            },


            updateStatus: (data) => set({
                agentStatus: data.status || get().agentStatus,
                statusMessage: data.message
            }),

            setSteps: (steps) => set({ steps }),

            updateStep: (stepId, updates) => set((state) => ({
                steps: state.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s))
            })),

            setSummary: (summary) => {
                set({ summary, isRunning: false, agentStatus: 'idle' });
                get().addMessage('agent', summary);
            },

            setPause: (paused, reason = null) => set({
                isPaused: paused,
                needsHuman: reason === 'hitl',
                pauseReason: reason
            }),

            // FIX 1 (HITL Resume): Called when WorkflowEngine emits 'workflow:resumed'
            // The IPC listener that calls this lives in the component that registers
            // electronAPI.on('workflow:resumed', ...) at mount time.
            setResumed: () => set({
                isPaused: false,
                needsHuman: false,
                pauseReason: null,
                agentStatus: 'executing',
            }),

            setCredits: (used) => set({ creditsUsed: used }),
            setError: (error) => set({ error, isRunning: false, agentStatus: 'idle' })
        }),
        {
            name: 'veribrowse-sessions',
            partialize: (state) => ({ sessions: state.sessions })
        }
    )
);
