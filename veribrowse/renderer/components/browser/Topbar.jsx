'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Plus, Bot, Search, Globe } from 'lucide-react';
import { useTabStore } from '../../store/tabStore';
import { useUIStore } from '../../store/uiStore';
import { clsx } from 'clsx';

export default function Topbar() {
    const {
        userTabs,
        activeTabId,
        canGoBack,
        canGoForward,
        createNewTab,
        setActiveTab
    } = useTabStore();

    const { toggleAgentPanel, agentPanelOpen } = useUIStore();

    const activeTab = userTabs.find(t => t.id === activeTabId);
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        if (activeTab && activeTab.url) {
            setInputValue(activeTab.url === 'about:blank' ? '' : activeTab.url);
        }
    }, [activeTab]);

    const handleNavigate = (e) => {
        e.preventDefault();
        let query = inputValue.trim();
        if (!query) return;

        let targetUrl = query;
        const isUrl = query.startsWith('http') || (query.includes('.') && !query.includes(' '));

        if (!isUrl) {
            targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        } else if (!query.startsWith('http')) {
            targetUrl = `https://${query}`;
        }

        if (window.electronAPI?.browser && activeTabId) {
            window.electronAPI.browser.navigate(activeTabId, targetUrl);
        }
    };

    const handleNavAction = (action) => {
        if (!window.electronAPI?.browser || !activeTabId) return;
        switch (action) {
            case 'back': window.electronAPI.browser.goBack(activeTabId); break;
            case 'forward': window.electronAPI.browser.goForward(activeTabId); break;
            case 'refresh': window.electronAPI.browser.refresh(activeTabId); break;
        }
    };

    return (
        <header className="h-[52px] w-full border-b border-white/5 bg-obsidian/40 flex items-center px-4 gap-4 flex-shrink-0 z-40">
            {/* History Controls */}
            <div className="flex items-center gap-1">
                <NavButton
                    icon={ChevronLeft}
                    disabled={!canGoBack}
                    onClick={() => handleNavAction('back')}
                />
                <NavButton
                    icon={ChevronRight}
                    disabled={!canGoForward}
                    onClick={() => handleNavAction('forward')}
                />
                <NavButton
                    icon={RotateCw}
                    onClick={() => handleNavAction('refresh')}
                    spinning={activeTab?.isLoading}
                />
            </div>

            {/* Omnibox */}
            <form
                onSubmit={handleNavigate}
                className="flex-1 max-w-2xl mx-auto relative group"
            >
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    {activeTab?.isLoading ? (
                        <RotateCw size={14} className="animate-spin" />
                    ) : activeTab?.url && activeTab.url !== 'about:blank' ? (
                        <Globe size={14} />
                    ) : (
                        <Search size={14} />
                    )}
                </div>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Search or enter URL..."
                    className="w-full h-9 bg-white/5 border border-white/10 rounded-full pl-9 pr-4 text-sm text-gray-200 focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                />
            </form>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => createNewTab()}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    title="New Tab"
                >
                    <Plus size={20} />
                </button>

                <button
                    onClick={() => toggleAgentPanel()}
                    className={clsx(
                        "p-2 rounded-lg transition-all relative",
                        agentPanelOpen ? "text-white bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.1)]" : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                    title="Agent Panel"
                >
                    <Bot size={20} />
                    {userTabs.length > 1 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-white/10 border border-white/20 rounded-full flex items-center justify-center text-[9px] font-bold">
                            {userTabs.length}
                        </span>
                    )}
                </button>
            </div>
        </header>
    );
}

function NavButton({ icon: Icon, disabled, onClick, spinning }) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={clsx(
                "p-2 rounded-lg transition-all",
                disabled ? "opacity-20 cursor-default" : "text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
            )}
        >
            <Icon size={18} className={spinning ? "animate-spin" : ""} />
        </button>
    );
}
