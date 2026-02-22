'use client';

import React from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import StepCard from './StepCard';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw } from 'lucide-react';

export default function WorkflowViewer() {
    const { steps, agentStatus } = useWorkflowStore();

    if (steps.length === 0 && agentStatus === 'idle') return null;

    return (
        <div className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
                {steps.map((step, index) => (
                    <motion.div
                        key={step.id || index}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                    >
                        <StepCard step={step} />
                    </motion.div>
                ))}
            </AnimatePresence>

            {agentStatus === 'replanning' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 px-4 py-2 text-blue-400 text-xs font-bold uppercase tracking-widest italic"
                >
                    <RefreshCcw size={14} className="animate-spin" />
                    <span>↺ Rethinking strategy...</span>
                </motion.div>
            )}
        </div>
    );
}
