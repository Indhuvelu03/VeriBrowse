import React, { useState } from 'react';
import { Search, Zap, Lightbulb, AtSign, Globe, Plus, X, Command } from 'lucide-react';
import { cn } from '../lib/utils';

export default function CommandBar({
    isOpen,
    onClose,
    onSearch,
    onAction,
    onThink,
    tabs
}) {
    const [inputValue, setInputValue] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSearch(inputValue);
        onClose();
    };

    const actions = [
        { id: 'search', icon: Search, label: 'Search', color: 'text-blue-600', onClick: () => onSearch(inputValue) },
        { id: 'action', icon: Zap, label: 'Action', color: 'text-indigo-600', onClick: () => onAction(inputValue) },
        { id: 'think', icon: Lightbulb, label: 'Think', color: 'text-sky-600', onClick: () => onThink(inputValue) },
        { id: 'mention', icon: AtSign, label: '', color: 'text-neutral-400' },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-forest-950/20 backdrop-blur-sm animate-in fade-in duration-500">
            {/* Background click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Command Dialog - Verdant Sunlit Glass */}
            <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-3xl border border-forest-200/50 rounded-[3rem] shadow-2xl shadow-forest-200/40 overflow-hidden animate-growth">
                <div className="p-10">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                        {/* Search Input */}
                        <div className="relative flex items-center group">
                            <div className="absolute left-0">
                                <Search className="text-forest-600 group-focus-within:text-forest-950 transition-colors" size={24} />
                                <div className="absolute inset-0 bg-forest-400 blur-lg opacity-10 animate-pulse" />
                            </div>
                            <input
                                autoFocus
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Execute sunlit mission..."
                                className="w-full bg-transparent pl-12 pr-4 py-3 text-2xl text-forest-950 placeholder-forest-200 outline-none font-bold tracking-tight"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-4">
                            {actions.map((act) => (
                                <button
                                    key={act.id}
                                    type="button"
                                    onClick={act.onClick}
                                    className="flex-1 flex items-center justify-center gap-3 px-6 py-3 bg-forest-50/50 hover:bg-forest-100/50 border border-forest-100/60 rounded-2xl transition-all duration-500 group active:scale-95 shadow-lg shadow-forest-200/10"
                                >
                                    <act.icon size={18} className={cn("transition-transform group-hover:scale-110", act.id === 'search' ? 'text-forest-600' : 'text-forest-400')} />
                                    {act.label && (
                                        <span className="text-xs font-bold text-forest-600 group-hover:text-forest-950 uppercase tracking-widest">
                                            {act.label}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </form>

                    {/* Tabs Section Section */}
                    {tabs.length > 0 && (
                        <div className="mt-16 space-y-6">
                            <div className="flex items-center gap-4 opacity-60">
                                <div className="h-px w-6 bg-forest-200" />
                                <p className="text-[11px] font-bold text-forest-400 uppercase tracking-[0.4em]">Active Sunlit Contexts</p>
                            </div>
                            <div className="space-y-2">
                                {tabs.slice(0, 4).map((tab) => (
                                    <div
                                        key={tab.id}
                                        className="flex items-center justify-between p-4 bg-forest-50/50 hover:bg-forest-100/50 border border-forest-200/30 rounded-3xl cursor-pointer group transition-all duration-300 transform hover:-translate-x-1 shadow-sm"
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className="w-10 h-10 bg-forest-100/60 rounded-xl flex items-center justify-center text-forest-600 group-hover:text-forest-950 transition-colors shadow-lg border border-forest-200/50">
                                                <Globe size={18} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-forest-900 group-hover:text-forest-950 transition-colors tracking-tight">
                                                    {tab.title}
                                                </span>
                                                <span className="text-[10px] font-mono text-forest-400 truncate max-w-[340px] uppercase tracking-tighter">
                                                    {tab.url || 'Internal Context'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[9px] font-bold text-forest-400 opacity-0 group-hover:opacity-100 tracking-widest uppercase transition-opacity">
                                                Target Node
                                            </span>
                                            <Plus size={16} className="text-forest-400" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer / Hint */}
                <div className="px-10 py-6 bg-forest-50/50 border-t border-forest-100/50 flex items-center justify-between backdrop-blur-3xl">
                    <div className="flex items-center gap-6">
                        <kbd className="px-3 py-1.5 bg-white text-forest-950 rounded-xl text-[10px] font-black border border-forest-200/50 shadow-2xl">ESC</kbd>
                        <span className="text-[10px] text-forest-400 font-black uppercase tracking-[0.3em]">Abort Mission</span>
                    </div>
                    <div className="w-2 h-2 bg-forest-500 rounded-full animate-pulse shadow-glow" />
                </div>
            </div>
        </div>
    );
}
