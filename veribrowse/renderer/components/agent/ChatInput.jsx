'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles, Target, Zap } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';
import { clsx } from 'clsx';

export default function ChatInput() {
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState('act'); // 'think' | 'refine' | 'act'
    const textareaRef = useRef(null);
    const { startWorkflow, isRunning } = useWorkflowStore();

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [prompt]);

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
        <div className="p-4 bg-obsidian border-t border-white/5 space-y-3">
            {/* Mode Selector */}
            <div className="flex items-center gap-2">
                <ModePill
                    active={mode === 'think'}
                    onClick={() => setMode('think')}
                    icon={Sparkles}
                    label="Think"
                />
                <ModePill
                    active={mode === 'refine'}
                    onClick={() => setMode('refine')}
                    icon={Target}
                    label="Refine"
                />
                <ModePill
                    active={mode === 'act'}
                    onClick={() => setMode('act')}
                    icon={Zap}
                    label="Act"
                />
            </div>

            {/* Input Box */}
            <div className="relative flex items-center bg-white/5 border border-white/10 rounded-2xl focus-within:border-white/20 transition-all">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me to do anything..."
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

function ModePill({ active, onClick, icon: Icon, label }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border",
                active
                    ? "bg-white/10 border-white/20 text-white shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                    : "bg-transparent border-transparent text-gray-500 hover:text-gray-300"
            )}
        >
            <Icon size={12} />
            {label}
        </button>
    );
}
