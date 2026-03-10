'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Sparkles, Target, Zap, Wand2, FlaskConical, Mic, MicOff } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';
import { useUIStore } from '../../store/uiStore';
import { clsx } from 'clsx';

export default function ChatInput() {
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState('auto'); // 'auto' | 'think' | 'refine' | 'act' | 'deep'
    const [isListening, setIsListening] = useState(false);
    const textareaRef = useRef(null);
    const recognitionRef = useRef(null);
    const { startWorkflow, isRunning, cancelWorkflow } = useWorkflowStore();
    const { addToast } = useUIStore();

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [prompt]);

    // Intent sync effect
    useEffect(() => {
        if (window.electronAPI) {
            const handleIntent = (data) => {
                if (data && data.intent) {
                    setMode(data.intent);
                }
            };
            window.electronAPI.on('agent:intent-classified', handleIntent);
            return () => window.electronAPI.off('agent:intent-classified', handleIntent);
        }
    }, []);

    // Speech recognition setup
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                    setPrompt((prev) => prev ? prev + ' ' + finalTranscript : finalTranscript);
                }
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
                addToast('Microphone error or not allowed', 'error');
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        } else {
            console.warn("Speech API not supported in this environment");
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error("Failed to start speech recognition:", e);
                addToast("Microphone error", 'error');
                setIsListening(false);
            }
        }
    };

    const placeholders = {
        auto: 'Ask me anything — I\'ll figure out the best way to help...',
        think: 'Ask me anything — I\'ll answer from knowledge...',
        refine: 'Describe your task roughly — I\'ll sharpen it before running...',
        act: 'Tell me what to do — I\'ll open a browser and do it...',
        deep: 'What should I research? I\'ll browse and give you a full summary...',
    };

    const modeDescriptions = {
        auto: 'Auto — I\'ll decide the best approach',
        think: 'Think — answer from knowledge, no browser',
        refine: 'Refine — rewrite & improve your task first',
        act: 'Act — run in browser immediately',
        deep: 'Deep — browse the web then summarize findings',
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
                <ModePill active={mode === 'auto'} onClick={() => setMode('auto')} icon={Wand2} label="Auto" glow />
                <ModePill active={mode === 'think'} onClick={() => setMode('think')} icon={Sparkles} label="Think" />
                <ModePill active={mode === 'refine'} onClick={() => setMode('refine')} icon={Target} label="Refine" />
                <ModePill active={mode === 'act'} onClick={() => setMode('act')} icon={Zap} label="Act" />
                <ModePill active={mode === 'deep'} onClick={() => setMode('deep')} icon={FlaskConical} label="Deep" />
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
                    className="flex-1 bg-transparent border-none py-3 pl-4 pr-10 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-0 resize-none"
                />

                {recognitionRef.current && (
                    <button
                        onClick={toggleListening}
                        className={clsx(
                            "absolute right-12 bottom-1.5 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                            isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                        )}
                        title={isListening ? "Stop listening" : "Start voice input"}
                    >
                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                )}
                {isRunning ? (
                    <button
                        onClick={cancelWorkflow}
                        className="w-8 h-8 mr-2 rounded-xl flex items-center justify-center transition-all bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 border border-red-500/30"
                        title="Stop task"
                    >
                        <Square size={14} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={!prompt.trim()}
                        className={clsx(
                            "w-8 h-8 mr-2 rounded-xl flex items-center justify-center transition-all",
                            prompt.trim() ? "bg-white text-black" : "bg-white/5 text-gray-600"
                        )}
                    >
                        <ArrowUp size={18} />
                    </button>
                )}
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
