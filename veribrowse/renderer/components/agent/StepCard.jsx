'use client';

import React, { useState } from 'react';
import { Check, X, RotateCw, ChevronDown, ChevronUp, Globe, MousePointer, Type, Scissors } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const iconMap = {
    navigate: Globe,
    click: MousePointer,
    type: Type,
    extract: Scissors,
    default: Globe
};

export default function StepCard({ step }) {
    const [expanded, setExpanded] = useState(false);
    const Icon = iconMap[step.tool] || iconMap.default;

    return (
        <div className="border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden mb-3 group hover:border-white/10 transition-colors">
            {/* Header */}
            <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer select-none"
                onClick={() => step.status === 'done' && setExpanded(!expanded)}
            >
                <div className={clsx(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    step.status === 'done' ? "bg-emerald-500/10 text-emerald-500" :
                        step.status === 'running' ? "bg-blue-500/10 text-blue-500" :
                            step.status === 'failed' ? "bg-red-500/10 text-red-500" :
                                "bg-white/5 text-gray-500"
                )}>
                    {step.status === 'running' ? (
                        <RotateCw size={16} className="animate-spin" />
                    ) : step.status === 'done' ? (
                        <Check size={16} />
                    ) : (
                        <Icon size={16} />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate capitalize">
                        {step.tool}: {step.params?.url || step.params?.selector || step.description}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                        {step.status}
                    </p>
                </div>

                {step.status === 'done' && (
                    <div className="text-gray-500">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                )}
            </div>

            {/* Results Body */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 pb-4 border-t border-white/5"
                    >
                        <div className="pt-3 text-xs text-gray-400 space-y-2">
                            {step.result && (
                                <pre className="bg-black/40 p-3 rounded-lg overflow-x-auto font-mono text-[10px] text-emerald-400/80">
                                    {JSON.stringify(step.result, null, 2)}
                                </pre>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
