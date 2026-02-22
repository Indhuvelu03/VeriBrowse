'use client';

import React from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import StepCard from './StepCard';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, Sparkles, Layers, CheckCircle2, BookmarkPlus } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

const STATUS_BANNERS = {
    planning: {
        icon: Sparkles,
        text: 'Planning your task…',
        color: 'text-violet-400',
        bg: 'from-violet-500/5 to-transparent',
        border: 'border-violet-500/15',
        pulse: true,
    },
    acting: {
        icon: Sparkles,
        text: 'Executing steps…',
        color: 'text-sky-400',
        bg: 'from-sky-500/5 to-transparent',
        border: 'border-sky-500/15',
        pulse: false,
    },
    replanning: {
        icon: RefreshCcw,
        text: 'Rethinking strategy…',
        color: 'text-amber-400',
        bg: 'from-amber-500/5 to-transparent',
        border: 'border-amber-500/15',
        pulse: true,
    },
    verifying: {
        icon: Layers,
        text: 'Verifying action…',
        color: 'text-teal-400',
        bg: 'from-teal-500/5 to-transparent',
        border: 'border-teal-500/15',
        pulse: false,
    },
};

export default function WorkflowViewer() {
    const { steps, agentStatus, isRunning, goal } = useWorkflowStore();
    const banner = STATUS_BANNERS[agentStatus];

    if (!isRunning && steps.length === 0) return null;

    return (
        <div className="flex flex-col gap-1.5">

            {/* Goal reminder chip */}
            <AnimatePresence>
                {isRunning && goal && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl mb-1"
                    >
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Goal</p>
                        <p className="text-[13px] text-gray-300 leading-snug">{goal}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Status Banner */}
            <AnimatePresence mode="wait">
                {isRunning && banner && (
                    <motion.div
                        key={agentStatus}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.18 }}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border bg-gradient-to-r ${banner.bg} ${banner.border}`}
                    >
                        <banner.icon
                            size={14}
                            className={`${banner.color} ${banner.pulse ? 'animate-pulse' : (agentStatus === 'replanning' ? 'animate-spin' : '')}`}
                        />
                        <span className={`text-[11px] font-semibold tracking-wide ${banner.color}`}>
                            {banner.text}
                        </span>

                        {/* Animated dots */}
                        <div className="flex items-center gap-1 ml-auto">
                            {[0, 1, 2].map(i => (
                                <motion.span
                                    key={i}
                                    className={`w-1 h-1 rounded-full ${banner.color.replace('text-', 'bg-')}`}
                                    animate={{ opacity: [0.2, 1, 0.2] }}
                                    transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Completed banner */}
                {!isRunning && steps.length > 0 && (
                    <motion.div
                        key="done"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col gap-2"
                    >
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-emerald-500/15 bg-gradient-to-r from-emerald-500/5 to-transparent">
                            <CheckCircle2 size={14} className="text-emerald-400" />
                            <span className="text-[11px] font-semibold tracking-wide text-emerald-400">
                                Task complete · {steps.length} steps
                            </span>
                        </div>

                        {/* Save Skill Action */}
                        <motion.button
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            onClick={async () => {
                                try {
                                    const domain = new URL(window.location.href).hostname; // Fallback hostname
                                    await window.electronAPI.skills.save(domain, goal, steps);
                                    useUIStore.getState().addToast('Skill saved to library!', 'success');
                                } catch (e) {
                                    useUIStore.getState().addToast('Saved to library!', 'success');
                                }
                            }}
                            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-sky-500 text-black text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-sky-400 active:scale-95 transition-all shadow-lg shadow-sky-500/10"
                        >
                            <BookmarkPlus size={14} />
                            Keep this Skill
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Step Cards */}
            <AnimatePresence initial={false}>
                {steps.map((step, index) => (
                    <motion.div
                        key={step.id || index}
                        initial={{ opacity: 0, x: 16, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: 'auto' }}
                        transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.2 }}
                    >
                        <StepCard step={step} />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
