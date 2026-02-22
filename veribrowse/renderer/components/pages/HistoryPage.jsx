'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, Clock, Globe, ArrowRight, Trash2 } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useTabStore } from '../../store/tabStore';
import { motion } from 'framer-motion';

export default function HistoryPage() {
    const { closeOverlays, setActiveView } = useUIStore();
    const { createNewTab } = useTabStore();
    const [search, setSearch] = useState('');
    const [history, setHistory] = useState([]);

    useEffect(() => {
        if (window.electronAPI?.history) {
            window.electronAPI.history.get(search).then(setHistory).catch(() => setHistory([]));
        }
    }, [search]);

    const handleNavigate = (url) => {
        createNewTab(url);
        setActiveView('browser');
        closeOverlays();
    };

    const clearHistory = () => {
        if (confirm('Are you sure you want to clear all history?')) {
            window.electronAPI?.history?.clear();
            setHistory([]);
        }
    };

    return (
        <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-y-0 left-0 right-0 bg-obsidian z-[60] flex flex-col"
        >
            {/* Header */}
            <header className="h-16 border-b border-white/5 flex items-center px-8 justify-between bg-white/[0.02]">
                <div className="flex items-center gap-4 flex-1">
                    <Clock className="text-gray-400" size={20} />
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">Browser History</h2>
                    <div className="relative max-w-md w-full ml-8">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search history..."
                            className="w-full h-10 bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={clearHistory}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                        title="Clear History"
                    >
                        <Trash2 size={20} />
                    </button>
                    <button
                        onClick={closeOverlays}
                        className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
                <div className="space-y-2">
                    {history.length > 0 ? history.map((item, i) => (
                        <button
                            key={i}
                            onClick={() => handleNavigate(item.url)}
                            className="w-full flex items-center gap-6 p-4 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left group"
                        >
                            <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center shrink-0">
                                <Globe size={18} className="text-gray-500 group-hover:text-white transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-gray-200 truncate">{item.title || 'Untitled Page'}</h4>
                                <p className="text-xs text-gray-500 truncate mt-0.5">{item.url}</p>
                            </div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                                {new Date(item.last_visit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <ArrowRight size={16} className="text-white opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                        </button>
                    )) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Clock size={48} className="mb-4" />
                            <p className="text-sm font-bold uppercase tracking-widest">No history found</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
