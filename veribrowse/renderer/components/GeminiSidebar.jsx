import React, { useState, useEffect } from 'react';
import { Send, Sparkles, X, ChevronRight, ChevronLeft, Bot, Zap, Eye, Terminal, Activity, Radio, Plus, Clock, Search, Lightbulb, AtSign, ArrowLeft, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

// Mode definitions for Fellou-style orchestration
const MODES = [
    { key: 'AUTO', label: 'Auto', icon: 'activity', description: 'Auto-detect intent from input' },
    { key: 'SEARCH', label: 'Search', icon: 'search', description: 'Web search only — no AI' },
    { key: 'ACTION', label: 'Action', icon: 'zap', description: 'Execute browser actions — no AI' },
    { key: 'THINK', label: 'Think', icon: 'lightbulb', description: 'AI reasoning only — no browsing' },
    { key: 'REFINE', label: '', icon: 'at', description: 'Refine with context — AI + memory' },
];

export default function GeminiSidebar({ isOpen, onClose, messages, onSendMessage }) {
    const [inputValue, setInputValue] = useState('');
    const [currentMode, setCurrentMode] = useState('AUTO');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [chatHistory, setChatHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Fetch AI chat history when history panel opens
    useEffect(() => {
        if (showHistory) {
            fetchHistory();
        }
    }, [showHistory]);

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const history = await window.ipc.invoke('ai:history:get');
            setChatHistory(Array.isArray(history) ? history : []);
        } catch (err) {
            console.error('Failed to fetch AI history:', err);
            setChatHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleDeleteHistoryItem = async (sessionId) => {
        try {
            await window.ipc.invoke('ai:history:delete', sessionId);
            setChatHistory(prev => prev.filter(item => item.session_id !== sessionId));
        } catch (err) {
            console.error('Failed to delete AI history item:', err);
        }
    };

    const handleSelectHistory = async (item) => {
        try {
            const session = await window.ipc.invoke('ai:history:getSession', item.session_id);
            if (session && session.messages) {
                // Restore the chat messages from this session
                session.messages.forEach(msg => onSendMessage(msg.content, true));
            }
        } catch (err) {
            console.error('Failed to load AI session:', err);
        }
        setShowHistory(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            // Send message with the current mode for orchestration routing
            onSendMessage(inputValue, currentMode);
            setInputValue('');
        }
    };

    if (!isOpen) return null;

    return (
        <div className={cn(
            "h-full bg-white/60 backdrop-blur-3xl border-l border-forest-200/50 transition-all duration-500 ease-in-out flex flex-col relative overflow-hidden",
            isCollapsed ? "w-16" : "w-[400px]"
        )}>
            {/* Header: Tactical Signal Header */}
            <div className="p-5 border-b border-forest-200/30 flex items-center justify-between bg-forest-50/40 backdrop-blur-md">
                {!isCollapsed ? (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-10 h-10 bg-forest-gradient rounded-2xl flex items-center justify-center text-forest-50 group border border-forest-400/20 shadow-lg animate-growth">
                                    <Sparkles size={20} className="group-hover:rotate-12 transition-transform animate-sway" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-forest-400 border-2 border-white rounded-full shadow-glow" />
                            </div>
                            <div>
                                <h2 className="text-xs font-bold tracking-widest text-forest-950 uppercase italic">Canopy Intel</h2>
                                <p className="text-[9px] text-forest-600 font-bold tracking-[0.2em] uppercase opacity-70">Stream: Sunlit_Growth_02</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors">
                                <Plus size={16} />
                            </button>
                            <button 
                                onClick={() => setShowHistory(!showHistory)}
                                className={cn(
                                    "p-2 hover:bg-forest-100/50 rounded-lg transition-colors",
                                    showHistory ? "bg-forest-100/70 text-forest-950" : "text-forest-600 hover:text-forest-950"
                                )}
                                title="Chat History"
                            >
                                <Clock size={16} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-forest-600 hover:text-red-600 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </>
                ) : (
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="p-3 hover:bg-forest-100/50 rounded-xl transition-colors text-forest-600 mx-auto"
                    >
                        <ChevronLeft size={20} />
                    </button>
                )}
            </div>

            {!isCollapsed && (
                <>
                    {/* History Panel Overlay */}
                    {showHistory ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center gap-3 px-5 py-4 border-b border-forest-200/30">
                                <button 
                                    onClick={() => setShowHistory(false)} 
                                    className="p-1.5 hover:bg-forest-100/50 rounded-lg transition-colors text-forest-600"
                                    title="Back"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <h3 className="text-xs font-bold tracking-widest text-forest-950 uppercase">History</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {historyLoading ? (
                                    <div className="flex items-center justify-center h-32">
                                        <div className="w-5 h-5 border-2 border-forest-300 border-t-forest-600 rounded-full animate-spin" />
                                    </div>
                                ) : chatHistory.length === 0 ? (
                                    <div className="p-6 text-center">
                                        <Clock size={32} className="mx-auto text-forest-200 mb-3" />
                                        <p className="text-[11px] font-medium text-forest-400 uppercase tracking-[0.3em]">No conversations yet</p>
                                        <p className="text-[9px] text-forest-500 mt-1 tracking-wider">Your AI chat history will appear here</p>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        {chatHistory.map((item, idx) => (
                                            <div
                                                key={item.session_id || idx}
                                                className="group flex items-center gap-3 px-5 py-3 hover:bg-forest-50/60 cursor-pointer transition-colors border-l-2 border-transparent hover:border-forest-500"
                                                onClick={() => handleSelectHistory(item)}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-forest-900 truncate">{item.title || 'Untitled Chat'}</p>
                                                    {item.updated_at && (
                                                        <p className="text-[9px] text-forest-400 mt-0.5">
                                                            {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteHistoryItem(item.session_id);
                                                    }}
                                                    className="p-1 hover:bg-forest-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={12} className="text-forest-400 hover:text-red-500" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                    <>
                    {/* Log Stream: Tactical Steps */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                                <Radio size={56} className="text-forest-200 animate-pulse" />
                                <div className="space-y-2">
                                    <p className="text-[11px] font-medium text-forest-400 uppercase tracking-[0.4em]">Awaiting Meadow Feed</p>
                                    <p className="text-[9px] font-normal text-forest-600 uppercase tracking-widest leading-relaxed">Synchronize mission context to begin<br />sunlit environmental analysis.</p>
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={cn(
                                    "flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700",
                                    msg.role === 'user' ? "items-end" : "items-start"
                                )}>
                                    <div className={cn(
                                        "max-w-[95%] flex flex-col gap-3",
                                        msg.role === 'user' ? "items-end" : "items-start"
                                    )}>
                                        {msg.role === 'assistant' && (
                                            <div className="flex items-center gap-3 ml-2">
                                                <div className="px-3 py-1 bg-forest-50 border border-forest-100 rounded-lg text-[10px] font-medium text-forest-600 uppercase tracking-[0.2em] leading-none">
                                                    Step {idx + 1}
                                                </div>
                                                <span className="text-[9px] font-medium text-forest-400 uppercase tracking-[0.3em]">Sun_Synapse_Locked</span>
                                            </div>
                                        )}
                                        <div className={cn(
                                            "p-5 text-sm leading-relaxed transition-all duration-500 border",
                                            msg.role === 'user'
                                                ? "bg-forest-100 text-forest-900 rounded-[2rem] rounded-tr-none font-medium border-forest-200"
                                                : "bg-white border-forest-100 text-forest-800 rounded-[2rem] rounded-tl-none",
                                            msg.streaming && "whitespace-pre-line"
                                        )}>
                                            {msg.content}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Run Button */}
                        {messages.length > 0 && (
                            <div className="flex justify-center pt-6">
                                <button className="px-10 py-3 bg-forest-gradient hover:opacity-90 text-forest-50 rounded-2xl font-bold text-xs uppercase tracking-[0.3em] shadow-lg shadow-forest-200/30 transition-all active:scale-95 border border-forest-400/20">
                                    Execute Sequence
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer Command Input - Minimalist Flat */}
                    <div className="p-6 pb-10 bg-white border-t border-forest-100">
                        <form onSubmit={handleSubmit} className="relative group">
                            <div className="relative bg-forest-50/30 border border-forest-100 rounded-[2rem] p-4 transition-all duration-500 group-focus-within:bg-white group-focus-within:border-forest-200">
                                <div className="flex items-center px-4 mb-5">
                                    <Plus size={20} className="text-forest-400 mr-4 cursor-pointer hover:text-forest-600 transition-colors" />
                                    <input
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        placeholder="Deploy meadow command..."
                                        className="w-full bg-transparent text-base text-forest-900 placeholder-forest-300 outline-none font-normal tracking-tight text-center"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!inputValue.trim()}
                                        className="ml-4 p-2 text-forest-400 hover:text-forest-600 disabled:opacity-30 transition-all hover:scale-110"
                                    >
                                        <Send size={20} className="animate-sway" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 px-1">
                                    <CommandChip
                                        icon={<Activity size={14} />}
                                        label="Auto"
                                        active={currentMode === 'AUTO'}
                                        onClick={() => setCurrentMode('AUTO')}
                                        title="Auto-detect intent from input"
                                    />
                                    <CommandChip
                                        icon={<Search size={14} />}
                                        label="Search"
                                        active={currentMode === 'SEARCH'}
                                        onClick={() => setCurrentMode('SEARCH')}
                                        title="Web search only — no AI"
                                    />
                                    <CommandChip
                                        icon={<Zap size={14} />}
                                        label="Action"
                                        active={currentMode === 'ACTION'}
                                        onClick={() => setCurrentMode('ACTION')}
                                        title="Execute browser actions — no AI"
                                    />
                                    <CommandChip
                                        icon={<Lightbulb size={14} />}
                                        label="Think"
                                        active={currentMode === 'THINK'}
                                        onClick={() => setCurrentMode('THINK')}
                                        title="AI reasoning only — no browsing"
                                    />
                                    <CommandChip
                                        icon={<AtSign size={14} />}
                                        label=""
                                        active={currentMode === 'REFINE'}
                                        onClick={() => setCurrentMode('REFINE')}
                                        title="Refine with context — AI + memory"
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </>
                    )}
                </>
            )}
        </div>
    );
}

function CommandChip({ icon, label, active, onClick, title }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 active:scale-95 group shadow-sm border",
                active
                    ? "bg-forest-600 border-forest-700 text-forest-50 shadow-md shadow-forest-200/40"
                    : "bg-white/50 border-forest-100/60 hover:bg-forest-50/60 hover:border-forest-200/60"
            )}
        >
            <span className={cn(
                "transition-colors",
                active ? "text-forest-100" : "text-forest-400 group-hover:text-forest-600"
            )}>{icon}</span>
            {label && <span className={cn(
                "text-[9px] font-bold uppercase tracking-[0.2em] transition-colors",
                active ? "text-forest-100" : "text-forest-400 group-hover:text-forest-600"
            )}>{label}</span>}
        </button>
    );
}
