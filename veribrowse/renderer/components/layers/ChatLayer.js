'use client';

import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { X, Plus, History, Sparkles } from 'lucide-react';
import ChatUI from '../chat/ChatUI';
import ChatInput from '../chat/ChatInput';
import { Logo } from '../Logo';
import { AnimatePresence, motion } from 'framer-motion';

export default function ChatLayer() {
    const sidebarMode = useUIStore((state) => state.sidebarMode);
    const handleClose = useUIStore((state) => state.handleClose);
    const clearChat = useChatStore((state) => state.clearMessages);

    const isOpen = sidebarMode !== 'hidden';

    return (
        <div
            className={`
        absolute top-0 right-0 h-full w-[420px]
        z-[60]
        bg-[#0a0a0a]/80 backdrop-blur-3xl 
        border-l border-white/[0.05] 
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
      `}
            style={{
                willChange: 'transform',
                transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            }}
        >
            {/* Ambient Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="w-full h-full flex flex-col relative z-20 pt-[60px]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <Sparkles size={16} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white text-[10px] tracking-[0.2em] uppercase">
                                {sidebarMode === 'chat' ? 'Intelligence' : 'Quick Access'}
                            </h2>
                            <p className="text-[9px] text-gray-500 font-medium tracking-wider">VeriBrowse AI</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-1">
                        {sidebarMode === 'chat' && (
                            <>
                                <IconButton icon={Plus} title="New Chat" onClick={clearChat} />
                                <IconButton icon={History} title="History" />
                                <div className="w-[1px] h-4 bg-white/10 mx-2" />
                            </>
                        )}
                        <IconButton
                            icon={X}
                            title="Next / Close"
                            onClick={handleClose}
                            className="hover:bg-red-500/10 hover:text-red-400"
                        />
                    </div>
                </div>

                {/* Animated Content Panel */}
                <div className="flex-1 relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {sidebarMode === 'chat' ? (
                            <motion.div
                                key="chat-mode"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-0 flex flex-col"
                            >
                                <ChatUI />
                                <ChatInput />
                            </motion.div>
                        ) : sidebarMode === 'newtab' ? (
                            <motion.div
                                key="home-mode"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-0 overflow-y-auto p-4"
                            >
                                <SidebarHome />
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

const SidebarHome = () => {
    return (
        <div className="flex flex-col items-center py-10 space-y-8">
            <div className="p-4 rounded-3xl bg-white/[0.02] border border-white/5">
                <Logo size={80} float />
            </div>
            <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">New Mission?</h3>
                <p className="text-xs text-gray-500 px-10">Start a new browsing session or ask the AI to perform a task for you.</p>
            </div>
            <div className="w-full space-y-3 px-4">
                <button className="w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-500/20 transition-all flex items-center justify-between group">
                    <span>Ask Intelligence</span>
                    <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                </button>
                <div className="w-full p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-gray-400 text-sm font-bold hover:bg-white/[0.05] transition-all flex items-center justify-between group cursor-pointer">
                    <span>New Blank Tab</span>
                    <Plus size={14} />
                </div>
            </div>
        </div>
    )
}

const IconButton = ({ icon: Icon, title, onClick, className }) => (
    <button
        onClick={onClick}
        title={title}
        className={`p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 ${className}`}
    >
        <Icon size={18} />
    </button>
);
