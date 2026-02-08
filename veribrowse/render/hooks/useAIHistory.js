import { useState, useEffect, useCallback } from 'react';

export function useAIHistory() {
  const [history, setHistory] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => 
    `session_${Date.now()}`
  );

  const loadHistory = useCallback(async () => {
    try {
      const result = await window.electron?.invoke('get-ai-history');
      if (result) {
        setHistory(result);
      }
    } catch (error) {
      console.error('Failed to load AI history:', error);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const saveSession = useCallback(async (messages) => {
    if (messages.length === 0) return;

    const firstUserMessage = messages.find(m => m.role === 'user');
    const title = firstUserMessage 
      ? firstUserMessage.content.slice(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '')
      : 'New Chat';

    try {
      await window.electron?.invoke('save-ai-session', {
        sessionId: currentSessionId,
        title,
        messages,
      });
      loadHistory();
    } catch (error) {
      console.error('Failed to save AI session:', error);
    }
  }, [currentSessionId, loadHistory]);

  const loadSession = useCallback(async (sessionId) => {
    try {
      const session = await window.electron?.invoke('get-ai-session', sessionId);
      if (session) {
        setCurrentSessionId(sessionId);
        return JSON.parse(session.messages);
      }
    } catch (error) {
      console.error('Failed to load AI session:', error);
    }
    return null;
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    try {
      await window.electron?.invoke('delete-ai-session', sessionId);
      loadHistory();
    } catch (error) {
      console.error('Failed to delete AI session:', error);
    }
  }, [loadHistory]);

  const startNewSession = useCallback(() => {
    setCurrentSessionId(`session_${Date.now()}`);
  }, []);

  return {
    history,
    currentSessionId,
    saveSession,
    loadSession,
    deleteSession,
    startNewSession,
    refreshHistory: loadHistory,
  };
}
