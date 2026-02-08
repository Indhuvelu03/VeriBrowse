import React, { useState, useEffect } from 'react';
import { Menu, Minimize, Maximize, X, ArrowLeft, ArrowRight, RotateCw, Sparkles, Command } from 'lucide-react';
import SideRail from './SideRail';
import UnifiedHeader from './UnifiedHeader';
import CommandBar from './CommandBar';
import ContentDisplay from './ContentDisplay';
import GeminiSidebar from './GeminiSidebar';
import HistoryPanel from './HistoryPanel';
import { cn } from '../lib/utils';

export default function BrowserShell() {
    const [tabs, setTabs] = useState([]);
    const [activeTab, setActiveTab] = useState(null);
    const [screenshot, setScreenshot] = useState(null);
    const [error, setError] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
    const [loadingTabs, setLoadingTabs] = useState({});
    const [messages, setMessages] = useState([]);
    const [activeView, setActiveView] = useState('home');
    const [chatSessionId] = useState(() => `session_${Date.now()}`);

    // Save AI chat session whenever messages change
    useEffect(() => {
        if (messages.length > 0) {
            const firstUserMsg = messages.find(m => m.role === 'user');
            const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) : 'New Chat';
            window.ipc.invoke('ai:history:save', {
                sessionId: chatSessionId,
                title,
                messages: messages.filter(m => !m.streaming),
            }).catch(err => console.error('Failed to save AI session:', err));
        }
    }, [messages, chatSessionId]);

    const mergeTabs = (currentTabs, incomingTabs) => {
        const byId = new Map(currentTabs.map(tab => [tab.id, tab]));
        for (const tab of incomingTabs) {
            byId.set(tab.id, tab);
        }
        return Array.from(byId.values());
    };

    // Initialize first tab
    useEffect(() => {
        const onLoadingStatus = (e, { tabId, isLoading }) => {
            setLoadingTabs(prev => ({ ...prev, [tabId]: isLoading }));
        };
        window.ipc.on('tab:loading-status', onLoadingStatus);

        const initTab = async () => {
            try {
                // Check if tabs exist or create one
                const { tabId } = await window.ipc.invoke('browser:newTab', { url: '' });
                if (tabId) {
                    setTabs([{ id: tabId, title: 'New Tab', url: '' }]);
                    setActiveTab(tabId);
                }
            } catch (e) {
                console.error("Failed to init tab:", e);
                // Fallback for UI testing
                setTabs([{ id: '1', title: 'New Tab', url: '' }]);
                setActiveTab('1');
            }
        };
        initTab();
    }, []);

    // Fellou.ai-style: live tab-crawling progress from main process
    useEffect(() => {
        const onProgress = (e, payload) => {
            if (!payload?.message) return;
            setMessages(prev => {
                const p = [...prev];
                const last = p[p.length - 1];
                if (last?.role === 'assistant' && last.streaming) {
                    const log = [...(last.log || []), payload.message];
                    p[p.length - 1] = { ...last, log, content: log.join('\n') };
                    return p;
                }
                return p;
            });
            if (payload.phase === 'done' && payload.summary != null) {
                setMessages(prev => {
                    const p = [...prev];
                    const last = p[p.length - 1];
                    if (last?.streaming) {
                        p[p.length - 1] = { ...last, streaming: false, content: last.content + '\nDone.' };
                        return [...p, { role: 'assistant', content: payload.summary }];
                    }
                    return [...p, { role: 'assistant', content: payload.summary }];
                });
            }
        };
        window.ipc.on('agent:orchestrate-progress', onProgress);
        return () => { try { window.ipc.off?.('agent:orchestrate-progress', onProgress); } catch (_) { } };
    }, []);

    // Trigger Command Bar on New Tab or shortcut
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsCommandBarOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSearch = async (query) => {
        console.log('Search:', query);

        let url = query.trim();
        const hasProtocol = url.startsWith('http://') || url.startsWith('https://');
        const hasDot = url.includes('.');
        const hasSpace = url.includes(' ');

        // Smart Navigation Logic
        if (!hasProtocol) {
            if (hasDot && !hasSpace) {
                // Treat as direct domain navigation (e.g., "fellou.ai")
                url = `https://${url}`;
            } else {
                // Treat as search query
                url = `https://google.com/search?q=${encodeURIComponent(query)}`;
            }
        }

        // Update local state
        setTabs(tabs.map(t => t.id === activeTab ? { ...t, url, title: query } : t));

        // Ensure single-view mode for direct navigation
        try {
            await window.ipc.invoke('browser:setLayout', { mode: 'single', tabId: activeTab });
        } catch (e) {
            console.warn('Failed to set layout to single:', e);
        }

        // Native Navigation
        try {
            await window.ipc.invoke('browser:navigate', { url });
        } catch (err) {
            console.error('Nav failed:', err);
        }
    };

    const handleNewTab = async () => {
        try {
            const { tabId } = await window.ipc.invoke('browser:newTab', { url: '' });
            if (tabId) {
                const newTab = { id: tabId, title: 'New Tab', url: '' };
                setTabs(prev => [...prev, newTab]);
                setActiveTab(tabId);
                setIsCommandBarOpen(false);
                await window.ipc.invoke('browser:setLayout', { mode: 'single', tabId });
            }
        } catch (err) {
            console.error('New tab failed:', err);
        }
    };

    const handleTabClose = async (id) => {
        if (tabs.length === 1) {
            // If closing the last tab, reset it to "New Tab" state
            setTabs(tabs.map(t => t.id === id ? { ...t, url: '', title: 'New Tab' } : t));
            await window.ipc.invoke('browser:navigate', { url: 'about:blank' });
            return;
        }

        const remaining = tabs.filter(t => t.id !== id);
        setTabs(remaining);
        if (activeTab === id) {
            const newActive = remaining[0].id;
            setActiveTab(newActive);
            await window.ipc.invoke('browser:switchTab', { tabId: newActive });
        }
        await window.ipc.invoke('browser:closeTab', { tabId: id });
    };

    const handleSendMessage = async (message, mode = 'AUTO') => {
        const trimmed = (message || '').trim();
        if (!trimmed) return;

        setMessages(prev => [...prev, { role: 'user', content: trimmed }]);

        // For explicit browser modes, show streaming placeholder immediately.
        // For AUTO mode, we show a generic "Processing…" since we don't know yet.
        const isBrowserMode = mode === 'SEARCH' || mode === 'ACTION';
        const isAutoMode = !mode || mode === 'AUTO';

        if (isBrowserMode || isAutoMode) {
            setIsSidebarOpen(true);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: isAutoMode ? 'Processing…' : (mode === 'SEARCH' ? 'Searching…' : 'Executing action…'),
                streaming: true,
                log: [isAutoMode ? 'Processing…' : (mode === 'SEARCH' ? 'Searching…' : 'Executing action…')],
            }]);
        }

        try {
            const result = await window.ipc.invoke('agent:command', {
                mode: mode || 'AUTO',
                input: trimmed,
                sessionId: chatSessionId,
            });

            if (result.type === 'AI_RESPONSE') {
                // THINK / REFINE → show AI answer
                // If we had a streaming placeholder, replace it; otherwise append
                setMessages(prev => {
                    const p = [...prev];
                    const last = p[p.length - 1];
                    if (last?.streaming) {
                        p[p.length - 1] = { ...last, streaming: false, content: result.message };
                        return p;
                    }
                    return [...p, { role: 'assistant', content: result.message }];
                });
            } else if (result.type === 'STATUS') {
                // SEARCH / ACTION → short status, update tabs
                setMessages(prev => {
                    const p = [...prev];
                    const last = p[p.length - 1];
                    if (last?.streaming) {
                        p[p.length - 1] = { ...last, streaming: false, content: result.message };
                    } else {
                        p.push({ role: 'assistant', content: result.message });
                    }
                    return p;
                });

                // Sync tab state from result
                if (result.tabId) {
                    setTabs(prev => {
                        const exists = prev.find(t => t.id === result.tabId);
                        if (exists) {
                            return prev.map(t => t.id === result.tabId
                                ? { ...t, url: result.url || t.url, title: result.title || t.title }
                                : t
                            );
                        }
                        return [...prev, { id: result.tabId, title: result.title || trimmed, url: result.url || '' }];
                    });
                    setActiveTab(result.tabId);
                    await window.ipc.invoke('browser:switchTab', { tabId: result.tabId });
                }
            } else if (result.type === 'ERROR') {
                setMessages(prev => {
                    const p = [...prev];
                    const last = p[p.length - 1];
                    if (last?.streaming) {
                        p[p.length - 1] = { ...last, streaming: false, content: `Error: ${result.message}` };
                    } else {
                        p.push({ role: 'assistant', content: `Error: ${result.message}` });
                    }
                    return p;
                });
            }
        } catch (error) {
            console.error('agent:command failed:', error);
            setMessages(prev => {
                const p = [...prev];
                const last = p[p.length - 1];
                if (last?.streaming) {
                    p[p.length - 1] = { ...last, streaming: false, content: 'Command failed. Try again.' };
                } else {
                    p.push({ role: 'assistant', content: 'Command failed. Try again.' });
                }
                return p;
            });
        }
    };

    const currentTab = tabs.find(t => t.id === activeTab);

    return (
        <div className="flex h-screen bg-forest-50 text-forest-950 overflow-hidden font-sans select-none relative">
            {/* Background canopy glow - sunlit version */}
            <div className="absolute inset-0 bg-canopy-glow opacity-40 pointer-events-none" />
            {/* Command Bar Dialog */}
            <CommandBar
                isOpen={isCommandBarOpen}
                onClose={() => setIsCommandBarOpen(false)}
                onSearch={(q) => { handleSendMessage(q, 'AUTO'); setIsCommandBarOpen(false); }}
                onAction={(q) => { handleSendMessage(q, 'ACTION'); setIsCommandBarOpen(false); }}
                onThink={(q) => { handleSendMessage(q, 'THINK'); setIsCommandBarOpen(false); }}
                tabs={tabs}
            />

            {/* Left Rail */}
            <SideRail
                activeView={activeView}
                onViewChange={setActiveView}
            />

            {/* History Panel */}
            <HistoryPanel
                isOpen={activeView === 'history'}
                onClose={() => setActiveView('home')}
                onNavigate={(url) => {
                    setActiveView('home');
                    handleSearch(url);
                }}
            />

            {/* Main Layout Area */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Unified Top Header */}
                <UnifiedHeader
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(id) => {
                        setActiveTab(id);
                        window.ipc.invoke('browser:switchTab', { tabId: id });
                    }}
                    onTabClose={handleTabClose}
                    onNewTab={handleNewTab}
                    onSearch={handleSearch}
                    isSidebarOpen={isSidebarOpen}
                    onToggleSidebar={() => {
                        const newState = !isSidebarOpen;
                        setIsSidebarOpen(newState);
                        window.ipc.invoke('browser:resize-view', { width: newState ? 400 : 0 });
                    }}
                />

                {/* Content & AI Sidebar Split */}
                <div className="flex flex-1 overflow-hidden relative">
                    <div className="flex-1 overflow-hidden relative">
                        {/* Show ContentDisplay if no URL OR if the tab is loading */}
                        {(!currentTab?.url || loadingTabs[activeTab]) && (
                            <ContentDisplay
                                screenshot={screenshot}
                                loading={loadingTabs[activeTab]}
                                error={error}
                                onSearch={handleSearch}
                            />
                        )}
                        {/* If URL exists and not loading, this area is transparent for Electron View */}
                    </div>


                    <GeminiSidebar
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                        messages={messages}
                        onSendMessage={handleSendMessage}
                    />
                </div>
            </div>

        </div>
    );
}





