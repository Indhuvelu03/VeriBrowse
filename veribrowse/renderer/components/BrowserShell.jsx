import React, { useState, useEffect } from 'react';
import { Menu, Minimize, Maximize, X, ArrowLeft, ArrowRight, RotateCw, Sparkles, Command } from 'lucide-react';
import SideRail from './SideRail';
import UnifiedHeader from './UnifiedHeader';
import CommandBar from './CommandBar';
import ContentDisplay from './ContentDisplay';
import GeminiSidebar from './GeminiSidebar';
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

    const isTaskQuery = (text) => {
        const query = (text || '').trim().toLowerCase();
        if (!query) return false;

        // Direct URLs or domains - always browse
        if (/^https?:\/\//i.test(query)) return true;
        if (/^[\w-]+\.(com|ai|io|org|net|dev)$/i.test(query)) return true;

        // Browse/search keywords
        const browseKeywords = [
            'open',
            'go to',
            'visit',
            'search for',
            'find',
            'look up',
            'browse',
            'navigate',
            'show me',
            'research',
            'compare',
            'how to',
        ];
        
        for (const kw of browseKeywords) {
            if (query.startsWith(kw) || query.includes(kw)) return true;
        }
        
        return false;
    };

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

    const handleSendMessage = async (message) => {
        const trimmed = (message || '').trim();
        if (!trimmed) return;

        setMessages(prev => [...prev, { role: 'user', content: trimmed }]);

        if (isTaskQuery(trimmed)) {
            setIsSidebarOpen(true);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Searching...' }]);

            try {
                const result = await window.ipc.invoke('automation:run', { prompt: trimmed });
                if (result?.success && Array.isArray(result.tabs)) {
                    setTabs(prev => mergeTabs(prev, result.tabs));
                    if (result.activeTabId) {
                        setActiveTab(result.activeTabId);
                        await window.ipc.invoke('browser:switchTab', { tabId: result.activeTabId });
                    }

                    // Wait for page to load then summarize
                    setMessages(prev => [...prev, { role: 'assistant', content: 'Reading page content...' }]);
                    
                    // Give the page time to load
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Get page content and summarize
                    try {
                        const contentResult = await window.ipc.invoke('browser:getContent', { tabId: result.activeTabId });
                        if (contentResult?.success && contentResult.content) {
                            // Extract text and truncate for AI
                            const textContent = contentResult.content
                                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                .replace(/<[^>]+>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim()
                                .slice(0, 8000);

                            if (textContent.length > 100) {
                                setMessages(prev => [...prev, { role: 'assistant', content: 'Summarizing...' }]);
                                
                                const summaryPrompt = `Based on this search result content, answer the question: "${trimmed}"\n\nContent:\n${textContent}\n\nProvide a concise, helpful summary.`;
                                const aiResult = await window.ipc.invoke('ai:answer', { prompt: summaryPrompt });
                                
                                if (aiResult?.success && aiResult.answer) {
                                    setMessages(prev => [...prev, { role: 'assistant', content: aiResult.answer }]);
                                } else {
                                    setMessages(prev => [...prev, { role: 'assistant', content: aiResult?.error || 'Could not summarize. Check the page directly.' }]);
                                }
                            } else {
                                setMessages(prev => [...prev, { role: 'assistant', content: 'Page is still loading. Ask me to summarize when ready.' }]);
                            }
                        } else {
                            setMessages(prev => [...prev, { role: 'assistant', content: 'Page loaded. Ask me to summarize or drill deeper.' }]);
                        }
                    } catch (contentError) {
                        console.error('Content extraction failed:', contentError);
                        setMessages(prev => [...prev, { role: 'assistant', content: 'Page loaded. Ask me anything about it.' }]);
                    }
                } else {
                    setMessages(prev => [...prev, { role: 'assistant', content: result?.error || 'Task could not be started.' }]);
                }
            } catch (error) {
                console.error('Automation failed:', error);
                setMessages(prev => [...prev, { role: 'assistant', content: 'Task failed to start. Try again or refine the request.' }]);
            }
            return;
        }

        try {
            const result = await window.ipc.invoke('ai:answer', { prompt: trimmed });
            if (result?.success) {
                setMessages(prev => [...prev, { role: 'assistant', content: result.answer }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: result?.error || 'AI response unavailable.' }]);
            }
        } catch (error) {
            console.error('AI answer failed:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'AI request failed. Try again.' }]);
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
                onSearch={handleSearch}
                onAction={(q) => console.log('Action:', q)}
                onThink={(q) => console.log('Think:', q)}
                tabs={tabs}
            />

            {/* Left Rail */}
            <SideRail
                activeView={activeView}
                onViewChange={setActiveView}
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





