'use client';

import React, { useState } from 'react';
import { Logo } from './Logo';
import { Lightbulb, Filter, ArrowRight, Sparkles, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAgentStore } from '../store/useAgentStore';
import { useUIStore } from '../store/useUIStore';

export default function NewTabPage() {
    const [goal, setGoal] = useState('');
    const { startAgent } = useAgentStore();
    const { toggleAgentPanel, setActiveView } = useUIStore();

    const handleLaunch = (e) => {
        e?.preventDefault();
        if (!goal.trim()) return;

        if (goal.startsWith('http') || goal.includes('.')) {
            window.electronAPI.navigate(null, goal);
            setActiveView('browser');
        } else {
            startAgent(goal);
            toggleAgentPanel(true);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center h-full bg-obsidian relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.02)_0%,_transparent_70%)]" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="z-10 flex flex-col items-center w-full max-w-2xl px-4"
            >
                <div className="mb-10 relative group">
                    <div className="absolute inset-0 bg-white/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Logo size={120} float className="relative z-10" />
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        className="absolute -inset-4 border border-white/5 rounded-full pointer-events-none"
                    />
                </div>

                <div className="text-center mb-12">
                    <h1 className="text-6xl font-bold tracking-tighter text-white mb-3">
                        VeriBrowse
                    </h1>
                    <div className="flex items-center justify-center space-x-2 text-gray-500 tracking-[0.3em] text-[10px] uppercase font-bold">
                        <Sparkles size={10} className="text-blue-400/50" />
                        <span>Security Intelligence</span>
                        <Sparkles size={10} className="text-blue-400/50" />
                    </div>
                </div>

                <div className="w-full max-w-xl mb-12">
                    <form
                        onSubmit={handleLaunch}
                        className="w-full relative group transition-all duration-500"
                    >
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-emerald-500/20 rounded-2xl blur opacity-25 group-focus-within:opacity-100 transition duration-1000 group-focus-within:duration-200" />
                        <div className="relative flex items-center bg-obsidian border border-white/10 rounded-2xl overflow-hidden px-4">
                            <Bot className="text-gray-500" size={20} />
                            <input
                                type="text"
                                className="flex-1 bg-transparent border-none py-6 px-4 text-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-0"
                                placeholder="Where should we go today?"
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                            />
                            <button
                                type="submit"
                                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/5 group-hover:border-white/10"
                            >
                                <ArrowRight size={20} />
                            </button>
                        </div>
                    </form>
                </div>

                <div className="flex gap-6">
                    <ActionButton
                        icon={Lightbulb}
                        label="Think"
                        delay={0.1}
                        color="hover:text-blue-400"
                        glow="group-hover:bg-blue-500/10"
                        onClick={() => setGoal('Research the latest AI trends')}
                    />
                    <ActionButton
                        icon={Filter}
                        label="Refine"
                        delay={0.2}
                        color="hover:text-purple-400"
                        glow="group-hover:bg-purple-500/10"
                        onClick={() => setGoal('Refine my current workspace setup')}
                    />
                    <ActionButton
                        icon={ArrowRight}
                        label="Act"
                        delay={0.3}
                        color="hover:text-emerald-400"
                        glow="group-hover:bg-emerald-500/10"
                        onClick={handleLaunch}
                    />
                </div>
            </motion.div>

            {/* Bottom Credits or Stats */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center opacity-30">
                <p className="text-[10px] text-gray-500 tracking-[0.2em] uppercase">Powered by VeriCore 3.0</p>
            </div>
        </div>
    );
}

const ActionButton = ({ icon: Icon, label, delay, color, glow, onClick }) => (
    <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 + delay, duration: 0.5 }}
        onClick={onClick}
        className={`flex items-center space-x-3 px-10 py-4 rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm transition-all duration-500 group relative overflow-hidden ${glow}`}
    >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <Icon size={18} className={`text-gray-400 transition-colors duration-300 ${color}`} />
        <span className="text-sm font-semibold text-gray-400 group-hover:text-white transition-colors tracking-wide">{label}</span>
    </motion.button>
);
