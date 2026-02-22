'use client';

import { Bot, Globe, Zap } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';
import { useTabStore } from '../../store/tabStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function ShadowTabBar() {
    const { isRunning, agentStatus } = useWorkflowStore();
    const { shadowTabs } = useTabStore();

    if (!isRunning || shadowTabs.length === 0) return null;

    return (
        <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bot size={14} className="text-sky-400" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        Background Workspace
                    </span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                    <span className="text-[9px] text-sky-500 font-bold uppercase tracking-tight">
                        {shadowTabs.length} Active
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                    {shadowTabs.map((tab, i) => (
                        <motion.div
                            key={tab.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/10 rounded-xl group hover:border-sky-500/30 transition-colors"
                        >
                            <div className="relative">
                                <Globe size={10} className="text-gray-400 group-hover:text-sky-400 transition-colors" />
                                {tab.isLoading && (
                                    <div className="absolute -inset-0.5 border border-sky-500/50 rounded-full border-t-transparent animate-spin" />
                                )}
                            </div>
                            <span className="text-[10px] text-gray-400 group-hover:text-white font-medium truncate max-w-[140px] transition-colors">
                                {tab.title === 'about:blank' ? 'Initializing...' : tab.title}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
