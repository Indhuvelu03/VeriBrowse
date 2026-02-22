'use client';

import React, { useEffect } from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';

export default function HITLCard() {
    const { needsHuman, pauseReason, setResumed } = useWorkflowStore();

    // FIX 1: Subscribe to the workflow:resumed event from the main process.
    // When WorkflowEngine unblocks, it emits 'workflow:resumed' which is
    // bridged to the renderer via background.js -> preload.js -> here.
    useEffect(() => {
        if (!window.electronAPI?.on) return;
        const handler = () => setResumed();
        window.electronAPI.on('workflow:resumed', handler);
        return () => {
            window.electronAPI.removeAllListeners('workflow:resumed');
        };
    }, [setResumed]);

    if (!needsHuman) return null;

    const handleResume = async () => {
        if (window.electronAPI?.agent?.resume) {
            await window.electronAPI.agent.resume();
        }
    };

    return (
        <div className="mx-4 my-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-xl">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <AlertCircle size={20} className="text-amber-500" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-amber-500 uppercase tracking-widest">
                        Action Required
                    </h3>
                    <p className="text-xs text-amber-200/70 mt-1 leading-relaxed">
                        {pauseReason === 'hitl'
                            ? "VeriBot needs your help with a CAPTCHA or security verification. Please interact with the browser directly."
                            : "Agent has paused for input. Check the browser tab."}
                    </p>
                </div>
            </div>

            <button
                onClick={handleResume}
                className="w-full mt-4 h-11 bg-amber-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-amber-400 active:scale-95 transition-all shadow-lg shadow-amber-500/20"
            >
                I&apos;ve handled it, Resume <ArrowRight size={18} />
            </button>
        </div>
    );
}
