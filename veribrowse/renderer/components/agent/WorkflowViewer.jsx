'use client';

import React from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import StepCard from './StepCard';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, BookmarkPlus, XCircle } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

// Human-readable status line while running
function StatusLine({ agentStatus }) {
    const labels = {
        planning: 'Planning steps…',
        acting: 'Working on it…',
        executing: 'Working on it…',
        verifying: 'Verifying…',
        replanning: 'Adjusting approach…',
        thinking: 'Thinking…',
        summarizing: 'Writing summary…',
    };
    const text = labels[agentStatus] || 'Working…';
    return (
        <motion.p
            key={agentStatus}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] text-sky-400 font-semibold tracking-wide animate-pulse px-1"
        >
            {text}
        </motion.p>
    );
}

export default function WorkflowViewer() {
    const { steps, agentStatus, isRunning, goal } = useWorkflowStore();

    if (!isRunning && steps.length === 0) return null;

    const doneCount = steps.filter(s => s.status === 'done' || s.status === 'success').length;
    const totalPlan = steps.reduce((max, s) => s.totalSteps ? Math.max(max, s.totalSteps) : max, 0);
    const displayCount = totalPlan > 0 ? totalPlan : doneCount;
    const failed = steps.some(s => s.status === 'failed' || s.status === 'fail');

    // Only show plan steps + key meta-steps; filter out noisy internal events
    const META_HIDE = new Set(['MAX_ACTIONS', 'ABORT', 'ERROR', 'CANCELLED']);
    const visibleSteps = steps.filter(s => !META_HIDE.has(s.action));

    return (
        <div className="flex flex-col gap-0 mt-1">

            {/* Running status */}
            <AnimatePresence mode="wait">
                {isRunning && <StatusLine agentStatus={agentStatus} />}
            </AnimatePresence>

            {/* Step feed */}
            <div className="mt-2 px-1">
                <AnimatePresence initial={false}>
                    {visibleSteps.map((step, i) => (
                        <StepCard
                            key={step.id || i}
                            step={step}
                            isLast={i === visibleSteps.length - 1}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Completion row */}
            <AnimatePresence>
                {!isRunning && steps.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.22 }}
                        className="flex flex-col gap-2 mt-1 px-1"
                    >
                        {/* Status chip */}
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${failed
                            ? 'border-red-500/15 bg-red-500/5 text-red-400'
                            : 'border-emerald-500/15 bg-emerald-500/5 text-emerald-400'
                            }`}>
                            {failed
                                ? <XCircle size={13} />
                                : <CheckCircle2 size={13} />
                            }
                            <span className="text-[11px] font-semibold tracking-wide">
                                {failed
                                    ? `Completed with errors  ${doneCount} of ${displayCount} done`
                                    : `Done  ${displayCount} step${displayCount > 1 ? 's' : ''}`
                                }
                            </span>
                        </div>

                        {/* Save skill */}
                        {/* {!failed && (
                            <motion.button
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.35 }}
                                onClick={async () => {
                                    try {
                                        await window.electronAPI.skills.save('page', goal, steps);
                                        useUIStore.getState().addToast('Skill saved!', 'success');
                                    } catch {
                                        useUIStore.getState().addToast('Saved!', 'success');
                                    }
                                }}
                                className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] text-gray-400 hover:text-white text-[11px] font-semibold tracking-widest uppercase transition-all active:scale-95"
                            >
                                <BookmarkPlus size={12} />
                                Save as Skill
                            </motion.button>
                        )} */}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
