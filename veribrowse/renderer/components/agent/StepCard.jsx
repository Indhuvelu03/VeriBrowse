'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
    Globe, MousePointerClick, Keyboard, ChevronDown,
    ScanText, Navigation2, Brain, Zap,
    AlertCircle, CheckCheck, Loader2, Search, RefreshCw,
    ArrowLeft, Eye, Download
} from 'lucide-react';

//  Action  friendly label + icon 

const ACTION_META = {
    NAVIGATE:       { icon: Globe,            label: 'Navigating',       color: 'text-sky-400',    bg: 'bg-sky-500/10' },
    CLICK:          { icon: MousePointerClick, label: 'Clicking',         color: 'text-violet-400', bg: 'bg-violet-500/10' },
    TYPE:           { icon: Keyboard,         label: 'Typing',           color: 'text-amber-400',  bg: 'bg-amber-500/10' },
    SCROLL:         { icon: Navigation2,      label: 'Scrolling',        color: 'text-teal-400',   bg: 'bg-teal-500/10' },
    EXTRACT:        { icon: ScanText,         label: 'Reading page',     color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
    SEARCH:         { icon: Search,           label: 'Searching',        color: 'text-sky-400',    bg: 'bg-sky-500/10' },
    PLAN:           { icon: Brain,            label: 'Planning',         color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    SKILL_HIT:      { icon: Zap,             label: 'Skill match',      color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    REPLAN:         { icon: RefreshCw,        label: 'Adjusting plan',   color: 'text-amber-400',  bg: 'bg-amber-500/10' },
    DONE:           { icon: CheckCheck,       label: 'Completed',        color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
    VERIFY:         { icon: Eye,             label: 'Verifying',        color: 'text-teal-400',   bg: 'bg-teal-500/10' },
    DOWNLOAD:       { icon: Download,         label: 'Downloading',      color: 'text-sky-400',    bg: 'bg-sky-500/10' },
    FALLBACK:       { icon: ArrowLeft,        label: 'Trying again',     color: 'text-orange-400', bg: 'bg-orange-500/10' },
    PRESS_ENTER:    { icon: Keyboard,         label: 'Submitting',       color: 'text-amber-400',  bg: 'bg-amber-500/10' },
    WAIT:           { icon: Loader2,          label: 'Waiting',          color: 'text-gray-400',   bg: 'bg-white/5' },
    DISMISS_OVERLAY:{ icon: AlertCircle,      label: 'Dismissed popup',  color: 'text-orange-400', bg: 'bg-orange-500/10' },
};

function getActionMeta(step) {
    const raw = (step.tool || step.action || '').toString().toUpperCase().trim();
    // "CLICK #selector-text"  just "CLICK"
    const key = raw.split(/\s/)[0];
    return ACTION_META[key] || ACTION_META[key.replace('_OVERLAY', '')] || {
        icon: Globe,
        label: key
            ? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ')
            : 'Action',
        color: 'text-gray-400',
        bg: 'bg-white/5'
    };
}

// Strip raw selector syntax so descriptions read naturally
function humanize(text) {
    if (!text) return null;
    return text
        .replace(/^(click|type|navigate to?|scroll|extract|press_enter)\s+/i, '')
        .replace(/\s*(#|\.|\[)[\w-["'\]=#.:\s]+$/i, '')
        .replace(/^\s*/, '')
        .trim() || text;
}

export default function StepCard({ step, isLast }) {
    const [expanded, setExpanded] = useState(false);
    const meta = getActionMeta(step);
    const Icon = meta.icon;

    const isRunning = step.status === 'running' || step.status === 'executing';
    const isDone    = step.status === 'done'    || step.status === 'success';
    const isFailed  = step.status === 'failed'  || step.status === 'fail' || step.status === 'error';
    const isWarn    = step.status === 'warn';

    const hasDetail = isDone && (step.result || step.error);
    const displayText = humanize(step.description || step.thought) || meta.label;
    const progress = step.stepIndex && step.totalSteps ? `${step.stepIndex}/${step.totalSteps}` : null;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={clsx(
                'flex gap-3 px-1 py-0.5 group rounded-lg transition-colors',
                hasDetail && 'cursor-pointer hover:bg-white/[0.025]'
            )}
            onClick={() => hasDetail && setExpanded(v => !v)}
        >
            {/* Left: icon + line */}
            <div className="flex flex-col items-center gap-0.5 pt-1">
                <div className={clsx(
                    'w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all',
                    meta.bg, meta.color,
                    isRunning && 'shadow-[0_0_8px_currentColor] opacity-90'
                )}>
                    {isRunning
                        ? <Loader2 size={11} className="animate-spin" />
                        : isFailed
                            ? <AlertCircle size={11} className="text-red-400" />
                            : <Icon size={11} />
                    }
                </div>
                {!isLast && (
                    <div className="w-px flex-1 min-h-[10px] bg-white/[0.04]" style={{ marginTop: 2 }} />
                )}
            </div>

            {/* Right: text */}
            <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-start gap-1.5">
                    <p className={clsx(
                        'flex-1 text-[13px] leading-snug',
                        isRunning  ? 'text-white font-medium'   :
                        isDone     ? 'text-gray-300'            :
                        isFailed   ? 'text-red-400/80'          : 'text-gray-500'
                    )}>
                        {displayText}
                    </p>

                    {progress && isRunning && (
                        <span className="text-[10px] text-gray-600 font-mono shrink-0 mt-0.5">{progress}</span>
                    )}

                    {hasDetail && (
                        <ChevronDown
                            size={12}
                            className={clsx(
                                'shrink-0 text-gray-600 transition-transform mt-0.5 opacity-0 group-hover:opacity-100',
                                expanded && 'rotate-180'
                            )}
                        />
                    )}
                </div>

                <p className={clsx(
                    'text-[10px] uppercase tracking-[0.12em] font-semibold mt-0.5',
                    isRunning ? meta.color :
                    isFailed  ? 'text-red-500/50' :
                    isWarn    ? 'text-amber-500/50' :
                    isDone    ? 'text-gray-600'   : 'text-gray-700'
                )}>
                    {isRunning ? meta.label : isDone ? 'done' : isFailed ? 'failed' : isWarn ? 'no effect' : meta.label}
                </p>

                <AnimatePresence>
                    {expanded && hasDetail && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            {step.result && (
                                <pre className="mt-2 bg-black/30 p-2 rounded-lg text-[11px] text-emerald-400/80 font-mono overflow-x-auto whitespace-pre-wrap break-words max-h-40">
                                    {typeof step.result === 'object'
                                        ? JSON.stringify(step.result, null, 2)
                                        : String(step.result).slice(0, 600)}
                                </pre>
                            )}
                            {step.error && (
                                <p className="mt-2 text-[11px] text-red-400/80 bg-red-500/5 p-2 rounded-lg font-mono">{step.error}</p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
