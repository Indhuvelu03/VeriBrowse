'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Edit3, MessageSquare, History, Bot } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';
import { useUIStore } from '../../store/uiStore';
import WorkflowViewer from './WorkflowViewer';
import ChatInput from './ChatInput';
import ShadowTabBar from './ShadowTabBar';
import HITLCard from './HITLCard';
import CreditMeter from './CreditMeter';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';

export default function AgentPanel() {
    const {
        agentPanelOpen,
        closeAgentPanel
    } = useUIStore();

    const {
        sessions,
        activeSessionId,
        newSession,
        loadSession,
        goal,
        summary,
        isRunning,
        steps
    } = useWorkflowStore();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const activeSession = sessions.find(s => s.id === activeSessionId);
    const messages = activeSession?.messages || [];
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);

    // Auto-scroll to bottom when messages, steps, or summary change
    useEffect(() => {
        // setTimeout ensures it fires AFTER React finishes committing the DOM
        const t = setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 60);
        return () => clearTimeout(t);
    }, [messages.length, steps?.length, summary]);

    return (
        <div
            className="w-[420px] h-full bg-obsidian border-l border-white/10 flex flex-col overflow-hidden"
        >
            {/* Header */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-5 bg-white/[0.03]">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            console.log('[AgentPanel] Toggling History Sidebar');
                            setSidebarOpen(!sidebarOpen);
                        }}
                        className={clsx(
                            "p-2 rounded-xl transition-all interactive-glass",
                            sidebarOpen ? "text-white bg-white/10" : "text-gray-400 hover:text-white"
                        )}
                        title="History"
                    >
                        <History size={18} />
                    </button>
                    <span className="text-[11px] font-bold text-white uppercase tracking-[0.2em] opacity-80 select-none">VeriBrowse AI</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            console.log('[AgentPanel] Starting New Session');
                            newSession();
                        }}
                        className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all interactive-glass"
                        title="New Chat"
                    >
                        <Edit3 size={18} />
                    </button>
                    <button
                        onClick={() => {
                            console.log('[AgentPanel] Closing Panel');
                            closeAgentPanel();
                        }}
                        className="p-2 hover:bg-red-500/10 rounded-xl text-gray-400 hover:text-red-400 transition-all interactive-glass"
                        title="Close Panel"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Session Sidebar Overlay (Enhanced) */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        className="absolute inset-y-0 left-0 w-72 bg-obsidian/95 backdrop-blur-xl border-r border-white/10 z-[160] flex flex-col shadow-2xl"
                    >
                        <div className="h-14 border-b border-white/5 flex items-center justify-between px-5">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Conversation History</h3>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
                            {sessions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
                                    <History size={32} className="text-white/5" />
                                    <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">No recent sessions</span>
                                </div>
                            ) : (
                                sessions.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => { loadSession(s.id); setSidebarOpen(false); }}
                                        className={clsx(
                                            "w-full text-left p-3.5 rounded-2xl transition-all group relative overflow-hidden",
                                            s.id === activeSessionId
                                                ? "bg-white/10 text-white border border-white/5 shadow-lg"
                                                : "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300 border border-transparent"
                                        )}
                                    >
                                        <div className="font-semibold text-xs truncate pr-4">{s.title || "Untitled Chat"}</div>
                                        <div className="text-[9px] opacity-40 mt-1 flex items-center gap-1.5 uppercase tracking-tighter">
                                            <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                                            <span>•</span>
                                            <span>{s.messages?.length || 0} messages</span>
                                        </div>
                                        {s.id === activeSessionId && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full shadow-[0_0_8px_white]" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="p-4 border-t border-white/5">
                            <button
                                onClick={() => { newSession(); setSidebarOpen(false); }}
                                className="w-full py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <Edit3 size={14} />
                                Start Fresh
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide flex flex-col py-4 px-4 gap-3 select-text">
                {/* Empty State */}
                {messages.length === 0 && !isRunning && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 opacity-40 select-none">
                        <Bot size={36} className="text-white/10" />
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">Ask me anything or give me a task</p>
                    </div>
                )}

                {/*
                  Message + Step interleaving:
                  For the current workflow turn, inject WorkflowViewer between
                  the user's triggering message and the agent's final response.
                  All previous turns render as plain message pairs.

                  Layout (per turn):
                    [user bubble]
                    [step feed  ]  ← only for last / active turn
                    [agent bubble] ← summary / chat reply
                */}
                {(() => {
                    const hasActiveWorkflow = isRunning || steps.length > 0;
                    // Index of last agent message that belongs to the current workflow turn
                    const lastAgentIdx = (messages.length > 0 && messages[messages.length - 1]?.role === 'agent' && hasActiveWorkflow)
                        ? messages.length - 1
                        : -1;

                    return messages.map((msg, i) => {
                        const isLastAgent = i === lastAgentIdx;
                        const isLastUser  = !hasActiveWorkflow ? false :
                            msg.role === 'user' && (i === messages.length - 1 || i === messages.length - 2);

                        return (
                            <React.Fragment key={i}>
                                {msg.role === 'user'
                                    ? <UserBubble content={msg.content} />
                                    : !isLastAgent && <AgentBubble content={msg.content} />
                                }
                                {/* Inject step feed after the user bubble that triggered the workflow */}
                                {isLastUser && (isRunning || steps.length > 0) && (
                                    <WorkflowViewer />
                                )}
                                {/* Re-render the last agent message AFTER the steps */}
                                {isLastAgent && <AgentBubble content={msg.content} />}
                            </React.Fragment>
                        );
                    });
                })()}

                {/* Step feed when there are no messages yet (first run) */}
                {messages.length === 0 && (isRunning || steps.length > 0) && (
                    <WorkflowViewer />
                )}

                {/* HITL Card */}
                <HITLCard />

                {/* Scroll anchor — always at the bottom */}
                <div ref={bottomRef} className="h-1 shrink-0" />
            </div>

            {/* Footer */}
            <div className="mt-auto">
                <ShadowTabBar />
                <CreditMeter />
                <ChatInput />
            </div>
        </div>
    );
}

function UserBubble({ content }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
        >
            <div className="max-w-[85%] px-4 py-2.5 bg-white/10 rounded-2xl rounded-tr-none text-sm text-gray-200 shadow-sm border border-white/5">
                {content}
            </div>
        </motion.div>
    );
}

function AgentBubble({ content }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
        >
            <div className="max-w-[90%] px-4 py-3 bg-white/[0.02] border border-white/10 rounded-2xl rounded-tl-none text-sm text-gray-300 shadow-sm">
                <div className="prose-dark leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-white/5 [&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:my-2">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
            </div>
        </motion.div>
    );
}
