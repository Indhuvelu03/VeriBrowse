import { useState, useCallback } from 'react';

export function useAI(sessionId) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (messages, images = null) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electron.invoke('ai-chat', {
        sessionId,
        messages,
        images,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const checkStatus = useCallback(async () => {
    try {
      return await window.electron.invoke('check-ollama-status');
    } catch (err) {
      return { success: false, running: false };
    }
  }, []);

  return {
    sendMessage,
    checkStatus,
    isLoading,
    error,
  };
}
