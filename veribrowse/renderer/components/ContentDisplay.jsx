
import React, { useState } from 'react';
import { Loader2, AlertCircle, Sparkles, Zap, Layout, Shield, Command, Globe, Search, Lightbulb } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ContentDisplay({ screenshot, loading, error, onSearch }) {
    const [inputValue, setInputValue] = useState('');

    const handleSearch = async (e) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            e.preventDefault();
            onSearch(inputValue.trim());
        }
    };

    if (loading) {
        return (
            <div className="flex-1 relative flex flex-col items-center justify-center bg-forest-50 overflow-hidden animate-growth">
                <div className="absolute inset-0 bg-forest-gradient opacity-5 blur-3xl animate-pulse" />
                <div className="relative">
                    <Loader2 className="w-12 h-12 text-forest-600 animate-spin mb-4" />
                    <div className="absolute inset-0 bg-forest-400 blur-xl opacity-10 animate-pulse" />
                </div>
                <p className="text-forest-600 font-black uppercase tracking-[0.3em] text-[10px] animate-sunlight">Synchronizing Sunlit Canopy...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-forest-50 p-8 animate-growth">
                <div className="w-20 h-20 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-500 mb-8 border border-red-500/20 shadow-2xl shadow-red-500/10">
                    <AlertCircle size={40} />
                </div>
                <h2 className="text-3xl font-black text-forest-950 mb-3 tracking-tighter italic">Mission Interrupted</h2>
                <p className="text-forest-600 text-center max-w-md mb-10 text-xs break-all font-mono bg-white/50 p-4 rounded-2xl border border-forest-200/50">{error}</p>
                <button className="px-10 py-4 bg-forest-gradient text-forest-50 rounded-[1.5rem] hover:opacity-90 transition-all font-bold shadow-xl shadow-forest-200/40 active:scale-95 border border-forest-400/30 animate-sunlight">
                    Retry Mission
                </button>
            </div>
        );
    }

    if (!screenshot) {
        return (
            <div className="flex-1 relative overflow-hidden bg-white flex flex-col items-center justify-center p-8">
                {/* Immersive background effects - sunlit meadow */}
                <div className="absolute inset-0 bg-canopy-glow opacity-50 pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-forest-400/20 to-transparent" />

                <div className="relative w-full max-w-5xl flex flex-col items-center animate-growth">
                    <div className="mb-16 flex flex-col items-center text-center">
                        <div className="relative group mb-8">
                            <div className="absolute inset-0 bg-forest-400 blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-1000" />
                            <div className="relative w-24 h-24 bg-forest-gradient rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-forest-200/50 transition-all duration-700 cursor-pointer border border-forest-400/20 hover:scale-105 active:scale-95">
                                <Sparkles size={48} className="text-forest-50 animate-sway" />
                            </div>
                        </div>

                        <h1 className="text-6xl font-bold tracking-[-0.05em] text-forest-950 mb-4 flex flex-col items-center italic">
                            VERIBROWSE
                            <span className="text-2xl bg-clip-text text-transparent bg-forest-gradient mt-2 tracking-widest not-italic font-semibold opacity-90">
                                VERDANT HUB
                            </span>
                        </h1>
                        <p className="text-sm text-forest-600/80 max-w-lg leading-relaxed font-medium tracking-tight px-4">
                            High-fidelity forest-grade console for agentic web navigation.
                        </p>
                    </div>

                    {/* Central Search Dialog - Minimalist Flat */}
                    <div className="w-full max-w-xl bg-white border border-forest-200/50 rounded-[2.5rem] p-4 group">
                        <div className="flex items-center px-4 mb-4">
                            <div className="relative">
                                <Search className="text-forest-400 mr-4" size={20} />
                            </div>
                            <input
                                autoFocus
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleSearch}
                                placeholder="Execute meadow mission..."
                                className="w-full bg-transparent py-2 text-lg text-forest-900 placeholder-forest-400/80 outline-none font-normal text-center tracking-tight"
                            />
                        </div>

                        <div className="flex items-center gap-3 px-1">
                            <ActionChip icon={<Search size={14} />} label="Search" active />
                            <ActionChip icon={<Zap size={14} />} label="Action" />
                            <ActionChip icon={<Lightbulb size={14} />} label="Think" />
                        </div>
                    </div>

                    <div className="mt-12 flex flex-col items-center">
                        <div className="flex items-center gap-6 mb-6 opacity-60">
                            <div className="h-px w-8 bg-forest-200" />
                            <p className="text-[10px] font-medium text-forest-400 uppercase tracking-[0.4em]">Sunlit Presets</p>
                            <div className="h-px w-8 bg-forest-200" />
                        </div>
                        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
                            {['Canopy Research', 'Moss Synthesis', 'Verdant Navigation', 'Growth Audit'].map(tag => (
                                <button key={tag} className="px-5 py-2 bg-forest-50/50 hover:bg-white border border-forest-200/50 rounded-xl text-[9px] font-semibold text-forest-600 hover:text-forest-950 hover:border-forest-400/50 transition-all active:scale-95 uppercase tracking-widest shadow-sm">
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer removed for minimalism as per user request */}
            </div>
        );
    }

    return (
        <div className="flex-1 relative bg-forest-50 overflow-hidden group">
            <div className="absolute inset-0 bg-canopy-glow opacity-30 pointer-events-none" />
            {screenshot && (
                <div className="w-full h-full p-4 animate-growth">
                    <img
                        src={screenshot}
                        alt="Tactical Capture"
                        className="w-full h-full object-contain shadow-[0_10px_50px_rgba(0,0,0,0.1)] border border-forest-200/20 rounded-3xl"
                    />
                </div>
            )}
        </div>
    );
}

function ActionChip({ icon, label, active }) {
    return (
        <button className={cn(
            "flex-1 flex items-center justify-center gap-3 px-6 py-3 rounded-2xl transition-all duration-500 active:scale-95 border",
            active
                ? "bg-forest-50 text-forest-800 border-forest-200 shadow-sm"
                : "bg-transparent border-transparent text-forest-400 hover:bg-forest-50 hover:text-forest-800"
        )}>
            <span className={cn(
                "transition-transform group-hover:scale-110",
                active ? "text-forest-600" : "text-forest-400"
            )}>{icon}</span>
            <span className="text-xs font-medium uppercase tracking-widest">{label}</span>
        </button>
    );
}

