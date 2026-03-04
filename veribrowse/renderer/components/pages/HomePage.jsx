'use client';

import React, { useState } from 'react';
import { Logo } from '../Logo';
import { Sparkles, Zap, Target, Search, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkflowStore } from '../../store/workflowStore';
import { useTabStore } from '../../store/tabStore';
import { useUIStore } from '../../store/uiStore';

export default function HomePage() {
    const [inputValue, setInputValue] = useState('');
    const { startWorkflow } = useWorkflowStore();
    const { setActiveView, openAgentPanel } = useUIStore();
    const { createNewTab } = useTabStore();

    const handleSearch = (e) => {
        e?.preventDefault();
        const query = inputValue.trim();
        if (!query) return;

        const isUrl = query.startsWith('http') || (query.includes('.') && !query.includes(' '));
        if (isUrl) {
            createNewTab(query.startsWith('http') ? query : `https://${query}`);
            setActiveView('browser');
        } else {
            openAgentPanel();
            startWorkflow(query);
            setInputValue('');
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-obsidian relative overflow-hidden h-full w-full">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="z-10 flex flex-col items-center w-full max-w-3xl px-8"
            >
                {/* Branding */}
                <div className="mb-12 flex flex-col items-center">
                    <Logo size={100} float />
                    <h1 className="text-5xl font-bold tracking-tighter text-white mt-8 mb-2">VeriBrowse</h1>
                    <div className="flex items-center gap-3 text-gray-500 tracking-[0.4em] text-[10px] uppercase font-bold">
                        <Sparkles size={12} className="text-white/20" />
                        <span>Security Intelligence</span>
                        <Sparkles size={12} className="text-white/20" />
                    </div>
                </div>

                {/* Main Search / Goal Bar */}
                <form
                    onSubmit={handleSearch}
                    className="w-full relative group transition-all duration-500 mb-10"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 via-white/5 to-purple-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-1000" />
                    <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/20 px-4">
                        <Search className="text-gray-500" size={24} />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="flex-1 bg-transparent border-none py-8 px-5 text-xl text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-0"
                            placeholder="Where should we go today?"
                        />
                        <button
                            type="submit"
                            className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
                        >
                            <ArrowRight size={24} />
                        </button>
                    </div>
                </form>

                {/* Quick Actions */}
                <div className="flex flex-wrap justify-center gap-4">
                    <SuggestionPill label="Search the web" onClick={() => setInputValue('Search for recent news about AI')} />
                    <SuggestionPill label="Research a topic" onClick={() => setInputValue('Research the best high-performance laptops for 2024')} />
                    <SuggestionPill label="Automate a task" onClick={() => setInputValue('Buy a gift for my friend on Amazon')} />
                    <SuggestionPill label="Compare products" onClick={() => setInputValue('Compare iPhone 15 Pro vs Samsung S24 Ultra')} />
                </div>
            </motion.div>

            {/* Bottom Credits */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center opacity-20 transition-opacity hover:opacity-100 cursor-default">
                <p className="text-[10px] text-gray-500 tracking-[0.5em] uppercase font-bold">Powered by VeriCore 3.0</p>
            </div>
        </div>
    );
}

function SuggestionPill({ label, onClick }) {
    return (
        <button
            onClick={onClick}
            className="px-5 py-2.5 rounded-full bg-white/[0.03] border border-white/10 text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
        >
            {label}
        </button>
    );
}
