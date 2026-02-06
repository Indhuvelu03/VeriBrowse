import React, { useState } from 'react';
import { Send, Sparkles, X, ChevronRight, ChevronLeft, Bot, Zap, Eye, Terminal, Activity, Radio, Plus, Clock, Search, Lightbulb, AtSign } from 'lucide-react';
import { cn } from '../lib/utils';

export default function GeminiSidebar({ isOpen, onClose, messages, onSendMessage }) {
    const [inputValue, setInputValue] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            onSendMessage(inputValue);
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
                            <button className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors">
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
                                                : "bg-white border-forest-100 text-forest-800 rounded-[2rem] rounded-tl-none"
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
                                    <CommandChip icon={<Search size={14} />} label="Search" />
                                    <CommandChip icon={<Zap size={14} />} label="Action" />
                                    <CommandChip icon={<Lightbulb size={14} />} label="Think" />
                                    <CommandChip icon={<AtSign size={14} />} label="" />
                                </div>
                            </div>
                        </form>
                    </div>
                </>
            )}
        </div>
    );
}

function CommandChip({ icon, label }) {
    return (
        <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/50 border border-forest-100/60 rounded-xl transition-all duration-300 active:scale-95 group shadow-sm hover:bg-forest-50/60 hover:border-forest-200/60">
            <span className="text-forest-400 group-hover:text-forest-600 transition-colors">{icon}</span>
            {label && <span className="text-[9px] font-bold text-forest-400 group-hover:text-forest-600 uppercase tracking-[0.2em] transition-colors">{label}</span>}
        </button>
    );
}
