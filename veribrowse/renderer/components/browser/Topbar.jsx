'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, RotateCw, Plus, Bot,
    Globe, Search, Sparkles, ArrowRight, Zap, Command,
    Lock, X, CornerDownLeft
} from 'lucide-react';
import { useTabStore } from '../../store/tabStore';
import { useUIStore } from '../../store/uiStore';
import { useWorkflowStore } from '../../store/workflowStore';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

// ─── Intent Detection ────────────────────────────────────────────────────────

const URL_REGEX = /^(https?:\/\/)|(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/|$))/;
const LOCALHOST_REGEX = /^localhost(:\d+)?/;

/**
 * Determines what kind of input the user is typing.
 * Returns: 'url' | 'search' | 'ai' | 'empty'
 */
function detectIntent(value) {
    const v = value.trim();
    if (!v) return 'empty';
    if (v.startsWith('/') || v.startsWith('!')) return 'ai';
    if (URL_REGEX.test(v) || LOCALHOST_REGEX.test(v)) return 'url';
    // Heuristic: if it contains action words, lean toward AI
    const aiKeywords = /^(find|search for|go to|open|click|type|scroll|download|buy|compare|book|fill|submit|extract|summarize|navigate|log in)/i;
    if (aiKeywords.test(v) && v.length > 8) return 'ai';
    return 'search';
}

function buildNavigationUrl(value) {
    const v = value.trim();
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    if (LOCALHOST_REGEX.test(v)) return `http://${v}`;
    if (URL_REGEX.test(v)) return `https://${v}`;
    return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const INTENT_CONFIG = {
    url: {
        label: 'Navigate',
        icon: Globe,
        color: 'text-sky-400',
        bg: 'bg-sky-500/10 border-sky-500/20',
        ring: 'focus-within:ring-sky-500/20',
        hint: 'Press ↵ to navigate',
    },
    search: {
        label: 'Search',
        icon: Search,
        color: 'text-violet-400',
        bg: 'bg-violet-500/10 border-violet-500/20',
        ring: 'focus-within:ring-violet-500/20',
        hint: 'Press ↵ to search Google',
    },
    ai: {
        label: 'AI Task',
        icon: Sparkles,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/20',
        ring: 'focus-within:ring-amber-500/20',
        hint: 'Press ↵ to let AI handle it',
    },
    empty: {
        label: null,
        icon: Search,
        color: 'text-gray-500',
        bg: 'bg-white/[0.03] border-white/10',
        ring: 'focus-within:ring-white/10',
        hint: 'Search, enter URL, or type / for AI',
    },
};

function IntentBadge({ intent }) {
    const cfg = INTENT_CONFIG[intent];
    if (!cfg.label) return null;

    const Icon = cfg.icon;
    return (
        <motion.div
            key={intent}
            initial={{ opacity: 0, scale: 0.8, x: -4 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0',
                cfg.color, cfg.bg
            )}
        >
            <Icon size={10} />
            {cfg.label}
        </motion.div>
    );
}

function Dropdown({ intent, value, onSelect, visible }) {
    const suggestions = getSuggestions(intent, value);

    return (
        <AnimatePresence>
            {visible && suggestions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-[#0e0e11]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden z-[200]"
                >
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group text-left"
                        >
                            <div className={clsx(
                                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                                s.type === 'ai' ? 'bg-amber-500/10 text-amber-400' :
                                    s.type === 'url' ? 'bg-sky-500/10 text-sky-400' :
                                        'bg-violet-500/10 text-violet-400'
                            )}>
                                <s.icon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-200 truncate font-medium">{s.label}</p>
                                {s.sub && <p className="text-[10px] text-gray-500 truncate">{s.sub}</p>}
                            </div>
                            <CornerDownLeft size={12} className="text-gray-600 group-hover:text-gray-400 shrink-0" />
                        </button>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function getSuggestions(intent, value) {
    const v = value.trim();
    if (!v || v.length < 2) return [];

    if (intent === 'ai') {
        return [
            { type: 'ai', icon: Sparkles, label: v, sub: 'Run as AI Task' },
            { type: 'search', icon: Search, label: `Search Google: "${v}"`, sub: 'Web search' },
        ];
    }
    if (intent === 'url') {
        return [
            { type: 'url', icon: Globe, label: buildNavigationUrl(v), sub: 'Navigate to URL' },
        ];
    }
    if (intent === 'search') {
        return [
            { type: 'search', icon: Search, label: `Search: "${v}"`, sub: 'Google Search' },
            { type: 'ai', icon: Sparkles, label: `Ask AI: "${v}"`, sub: 'Let AI find and do it' },
        ];
    }
    return [];
}

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({ icon: Icon, disabled, onClick, spinning, title }) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            title={title}
            className={clsx(
                'p-[7px] rounded-lg transition-all',
                disabled
                    ? 'opacity-20 cursor-default text-gray-600'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer active:scale-95'
            )}
        >
            <Icon size={16} className={clsx('transition-transform', spinning && 'animate-spin')} />
        </button>
    );
}

// ─── Main Topbar ──────────────────────────────────────────────────────────────

export default function Topbar() {
    const { userTabs, activeTabId, canGoBack, canGoForward, createNewTab, setActiveTab, navigate } = useTabStore();
    const { toggleAgentPanel, agentPanelOpen } = useUIStore();
    const { startWorkflow, isRunning } = useWorkflowStore();

    const activeTab = userTabs.find(t => t.id === activeTabId);

    const [inputValue, setInputValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [intent, setIntent] = useState('empty');
    const [showDropdown, setShowDropdown] = useState(false);
    const inputRef = useRef(null);
    const wrapperRef = useRef(null);

    // Sync URL bar with active tab
    useEffect(() => {
        if (!isFocused && activeTab?.url) {
            setInputValue(activeTab.url === 'about:blank' ? '' : activeTab.url);
        }
    }, [activeTab?.url, isFocused]);

    // Detect intent as user types
    useEffect(() => {
        setIntent(detectIntent(inputValue));
        setShowDropdown(isFocused && inputValue.trim().length > 0);
    }, [inputValue, isFocused]);

    const handleFocus = () => {
        setIsFocused(true);
        inputRef.current?.select();
    };

    const handleBlur = () => {
        // Give mousedown on dropdown time to fire first
        setTimeout(() => {
            setIsFocused(false);
            setShowDropdown(false);
            // Restore URL if no navigation happened
            if (!inputValue.trim() || detectIntent(inputValue) === 'empty') {
                setInputValue(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
            }
        }, 150);
    };

    const executeAction = useCallback((value = inputValue, overrideIntent = null) => {
        const v = value.trim();
        if (!v) return;

        const finalIntent = overrideIntent || detectIntent(v);

        if (finalIntent === 'ai') {
            if (agentPanelOpen === false) toggleAgentPanel();
            startWorkflow(v, 'act');
            setInputValue('');
        } else {
            const url = buildNavigationUrl(v);
            navigate(url);
            setInputValue(url);
        }

        inputRef.current?.blur();
        setShowDropdown(false);
    }, [inputValue, navigate, startWorkflow, toggleAgentPanel, agentPanelOpen]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeAction();
        }
        if (e.key === 'Escape') {
            inputRef.current?.blur();
            setShowDropdown(false);
        }
    };

    const handleSuggestionSelect = (suggestion) => {
        executeAction(
            suggestion.type === 'ai' && suggestion.label.startsWith('Search') ? suggestion.label : suggestion.label.includes('Search:') ? inputValue : inputValue,
            suggestion.type
        );
    };

    const handleNavAction = (action) => {
        if (!window.electronAPI?.browser || !activeTabId) return;
        switch (action) {
            case 'back': window.electronAPI.browser.goBack(activeTabId); break;
            case 'forward': window.electronAPI.browser.goForward(activeTabId); break;
            case 'refresh': window.electronAPI.browser.refresh(activeTabId); break;
        }
    };

    const cfg = INTENT_CONFIG[intent];
    const IntentIcon = cfg.icon;
    const isSecure = activeTab?.url?.startsWith('https://') && !isFocused;

    return (
        <header className="h-11 w-full border-b border-white/[0.06] bg-[#0a0a0d]/80 backdrop-blur-xl flex items-center px-3 gap-2 flex-shrink-0 z-40 relative">

            {/* Nav Controls */}
            <div className="flex items-center gap-0.5 shrink-0">
                <NavButton icon={ChevronLeft} disabled={!canGoBack} onClick={() => handleNavAction('back')} title="Back" />
                <NavButton icon={ChevronRight} disabled={!canGoForward} onClick={() => handleNavAction('forward')} title="Forward" />
                <NavButton
                    icon={activeTab?.isLoading ? X : RotateCw}
                    onClick={() => handleNavAction(activeTab?.isLoading ? 'stop' : 'refresh')}
                    spinning={activeTab?.isLoading && !isFocused}
                    title={activeTab?.isLoading ? 'Stop' : 'Refresh'}
                />
            </div>

            {/* ⬇ Universal Omnibox ⬇ */}
            <div ref={wrapperRef} className="flex-1 relative">
                <motion.div
                    animate={{
                        boxShadow: isFocused
                            ? intent === 'ai'
                                ? '0 0 0 2px rgba(251,191,36,0.2), 0 0 24px rgba(251,191,36,0.08)'
                                : intent === 'url'
                                    ? '0 0 0 2px rgba(56,189,248,0.2), 0 0 16px rgba(56,189,248,0.06)'
                                    : '0 0 0 2px rgba(139,92,246,0.2), 0 0 16px rgba(139,92,246,0.06)'
                            : '0 0 0 1px rgba(255,255,255,0.06)'
                    }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 h-9 bg-white/[0.04] rounded-full px-3 overflow-hidden"
                >
                    {/* Leading icon / security indicator */}
                    <div className={clsx('shrink-0 transition-colors duration-200', cfg.color)}>
                        {isSecure ? <Lock size={13} className="text-emerald-400/80" /> : <IntentIcon size={13} />}
                    </div>

                    {/* Input */}
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        placeholder={isFocused ? 'Search, enter URL, or / for AI commands…' : activeTab?.title || 'New Tab'}
                        spellCheck={false}
                        autoComplete="off"
                        className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-gray-200 placeholder:text-gray-600 caret-white"
                    />

                    {/* Intent Badge (animated) */}
                    <AnimatePresence mode="wait">
                        {isFocused && <IntentBadge key={intent} intent={intent} />}
                    </AnimatePresence>

                    {/* Clear button when typing */}
                    <AnimatePresence>
                        {isFocused && inputValue && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                onMouseDown={e => { e.preventDefault(); setInputValue(''); }}
                                className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 shrink-0 transition-all"
                            >
                                <X size={10} />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Hint text */}
                <AnimatePresence>
                    {isFocused && intent !== 'empty' && (
                        <motion.p
                            key={intent}
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={clsx('absolute -bottom-5 left-4 text-[10px] font-medium', cfg.color, 'opacity-70')}
                        >
                            {cfg.hint}
                        </motion.p>
                    )}
                </AnimatePresence>

                {/* Command Palette Dropdown */}
                <Dropdown
                    intent={intent}
                    value={inputValue}
                    onSelect={handleSuggestionSelect}
                    visible={showDropdown}
                />
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => createNewTab()}
                    className="p-[7px] text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-95"
                    title="New Tab (Ctrl+T)"
                >
                    <Plus size={16} />
                </button>

                {/* AI Agent toggle — glows amber when running */}
                <motion.button
                    onClick={() => toggleAgentPanel()}
                    title="AI Agent (Ctrl+Shift+A)"
                    animate={{
                        boxShadow: isRunning
                            ? ['0 0 8px rgba(251,191,36,0.3)', '0 0 20px rgba(251,191,36,0.5)', '0 0 8px rgba(251,191,36,0.3)']
                            : agentPanelOpen
                                ? '0 0 12px rgba(139,92,246,0.3)'
                                : '0 0 0px transparent',
                    }}
                    transition={{ duration: 1.4, repeat: isRunning ? Infinity : 0 }}
                    className={clsx(
                        'p-[7px] rounded-lg transition-colors relative',
                        agentPanelOpen || isRunning
                            ? isRunning ? 'text-amber-400 bg-amber-500/10' : 'text-violet-400 bg-violet-500/10'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                >
                    {isRunning ? <Zap size={16} /> : <Bot size={16} />}

                    {/* Running indicator dot */}
                    {isRunning && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-ping" />
                    )}
                </motion.button>
            </div>
        </header>
    );
}
