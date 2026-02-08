import { useState, useEffect } from 'react';

/**
 * Custom hook for managing history data and operations
 */
export function useHistory(isOpen) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen]);

    const loadHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await window.ipc.invoke('history:get');
            setHistory(result || []);
        } catch (err) {
            console.error('Failed to load history:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const searchHistory = async (query) => {
        if (!query.trim()) {
            loadHistory();
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await window.ipc.invoke('history:search', query);
            setHistory(result || []);
        } catch (err) {
            console.error('Search failed:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const clearHistory = async () => {
        if (!confirm('Clear all browsing history? This cannot be undone.')) {
            return false;
        }

        try {
            await window.ipc.invoke('history:clear');
            setHistory([]);
            return true;
        } catch (err) {
            console.error('Failed to clear history:', err);
            setError(err.message);
            return false;
        }
    };

    return {
        history,
        loading,
        error,
        loadHistory,
        searchHistory,
        clearHistory
    };
}
