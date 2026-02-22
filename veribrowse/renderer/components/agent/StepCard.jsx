'use client';

import React, { useState } from 'react';
import {
    Check, X, RotateCw, ChevronDown, ChevronUp,
    Globe, MousePointer, Type, Scissors, Navigation,
    Brain, Layers, Search, Download, Eye, Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// Maps action type strings to icons
const ACTION_ICONS = {
    NAVIGATE: Globe,
    CLICK: MousePointer,
    TYPE: Type,
    EXTRACT: Scissors,
    SCROLL: Navigation,
    PLAN: Brain,
    SKILL_HIT: Zap,
    REPLAN: Layers,
    SEARCH: Search,
    DOWNLOAD: Download,
    VERIFY: Eye,
    // Legacy shape support
    navigate: Globe,
    click: MousePointer,
    type: Type,
    extract: Scissors,
};

function getIcon(step) {
    const key = step.action || step.tool || 'NAVIGATE';
    return ACTION_ICONS[key] || Globe;
}

function getStatusConfig(status) {
    switch (status) {
        case 'done':
        case 'success':
            return {
                iconEl: <Check size={14} />,
                dotColor: 'bg-emerald-500',
                iconBg: 'bg-emerald-500/10 text-emerald-400',
                border: 'border-emerald-500/10',
                label: 'Done',
            };
        case 'running':
            return {
                iconEl: <RotateCw size={14} className="animate-spin" />,
                dotColor: 'bg-sky-400 animate-pulse',
                iconBg: 'bg-sky-500/10 text-sky-400',
                border: 'border-sky-500/10',
                label: 'Running',
            };
        case 'fail':
        case 'failed':
        case 'error':
            return {
                iconEl: <X size={14} />,
                dotColor: 'bg-red-500',
                iconBg: 'bg-red-500/10 text-red-400',
                border: 'border-red-500/10',
                label: 'Failed',
            };
        default:
            return {
                iconEl: null,
                dotColor: 'bg-gray-600',
                iconBg: 'bg-white/5 text-gray-500',
                border: 'border-white/5',
                label: status || 'Pending',
            };
    }
}

export default function StepCard({ step }) {
    const [expanded, setExpanded] = useState(false);
    const Icon = getIcon(step);
    const statusCfg = getStatusConfig(step.status);
    const canExpand = (step.status === 'done' || step.status === 'success') &&
        (step.result || step.thought || step.error);

    // Primary display text
    const headline =
        step.thought ||
        step.description ||
        (step.params?.url ? `→ ${step.params.url}` : null) ||
        (step.params?.selector ? `⌖ ${step.params.selector}` : null) ||
        step.action ||
        step.tool ||
        'Agent Action';

    return (
        <motion.div
            layout
            className={clsx(
                'border rounded-xl overflow-hidden transition-colors',
                statusCfg.border,
                'bg-white/[0.015]',
                canExpand && 'hover:border-white/15 cursor-pointer'
            )}
            onClick={() => canExpand && setExpanded(!expanded)}
        >
            {/* Header Row */}
            <div className="flex items-center gap-3 px-3.5 py-2.5">
                {/* Status Icon */}
                <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', statusCfg.iconBg)}>
                    {statusCfg.iconEl || <Icon size={14} />}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-gray-200 truncate leading-snug font-medium">
                        {headline}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={clsx('inline-block w-1.5 h-1.5 rounded-full shrink-0', statusCfg.dotColor)} />
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                            {step.action || step.tool || 'step'} &middot; {statusCfg.label}
                        </p>
                    </div>
                </div>

                {/* Expand toggle */}
                {canExpand && (
                    <div className="text-gray-600 shrink-0">
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                )}
            </div>

            {/* Expanded Detail */}
            <AnimatePresence>
                {expanded && canExpand && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="border-t border-white/5 px-3.5 pb-3.5 pt-2.5 space-y-2"
                    >
                        {step.result && (
                            <div>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Result</p>
                                <pre className="bg-black/30 p-2.5 rounded-lg text-[11px] text-emerald-400/80 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                                    {typeof step.result === 'object'
                                        ? JSON.stringify(step.result, null, 2)
                                        : String(step.result)}
                                </pre>
                            </div>
                        )}
                        {step.error && (
                            <div>
                                <p className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest mb-1">Error</p>
                                <p className="text-[11px] text-red-400/80 bg-red-500/5 p-2 rounded-lg font-mono">{step.error}</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
