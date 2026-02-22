'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles, Target, Zap, Wand2, FlaskConical } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';
import { clsx } from 'clsx';

export default function ChatInput() {
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState('auto'); // 'auto' | 'think' | 'refine' | 'act' | 'deep'
    const textareaRef = useRef(null);
    const { startWorkflow, isRunning } = useWorkflowStore();

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [prompt]);

    const placeholders = {
        auto:   'Ask me anything — I\'ll figure out the best way to help...',
        think:  'Ask me anything — I\'ll answer from knowledge...',
        refine: 'Describe your task roughly — I\'ll sharpen it before running...',
        act:    'Tell me what to do — I\'ll open a browser and do it...',
        deep:   'What should I research? I\'ll browse and give you a full summary...',
    };

    const modeDescriptions = {
        auto:   'Auto — I\'ll decide the best approach',
        think:  'Think — answer from knowledge, no browser',
        refine: 'Refine — rewrite & improve your task first',
        act:    'Act — run in browser immediately',
        deep:   'Deep — browse the web then summarize findings',
    };

    const handleSend = () => {
        if (!prompt.trim() || isRunning) return;
        startWorkflow(prompt, mode);
        setPrompt('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="px-4 pt-2.5 pb-3 bg-obsidian border-t border-white/5 space-y-2">
            {/* Mode Selector — single compact row */}
            <div className="flex items-center gap-1.5">
                <ModePill active={mode === 'auto'}   onClick={() => setMode('auto')}   icon={Wand2}        label="Auto"   glow />
                <ModePill active={mode === 'think'}  onClick={() => setMode('think')}  icon={Sparkles}     label="Think" />
                <ModePill active={mode === 'refine'} onClick={() => setMode('refine')} icon={Target}       label="Refine" />
                <ModePill active={mode === 'act'}    onClick={() => setMode('act')}    icon={Zap}          label="Act" />
                <ModePill active={mode === 'deep'}   onClick={() => setMode('deep')}   icon={FlaskConical} label="Deep" />
            </div>

            {/* Input Box */}
            <div className="relative flex items-center bg-white/5 border border-white/10 rounded-2xl focus-within:border-white/20 transition-all">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholders[mode]}
                    className="flex-1 bg-transparent border-none py-3 px-4 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-0 resize-none"
                />
                <button
                    onClick={handleSend}
                    disabled={!prompt.trim() || isRunning}
                    className={clsx(
                        "w-8 h-8 mr-2 rounded-xl flex items-center justify-center transition-all",
                        prompt.trim() && !isRunning ? "bg-white text-black" : "bg-white/5 text-gray-600"
                    )}
                >
                    <ArrowUp size={18} />
                </button>
            </div>
        </div>
    );
}

function ModePill({ active, onClick, icon: Icon, label, glow = false }) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={clsx(
                "flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border",
                active && glow
                    ? "bg-white/15 border-white/30 text-white shadow-[0_0_12px_rgba(255,255,255,0.12)]"
                    : active
                    ? "bg-white/10 border-white/20 text-white shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                    : "bg-transparent border-transparent text-gray-500 hover:text-gray-300"
            )}
        >
            <Icon size={12} />
            {label}
        </button>
    );
}
