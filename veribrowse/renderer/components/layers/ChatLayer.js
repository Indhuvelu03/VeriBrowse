'use client';

import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { X, Plus, History, Sparkles } from 'lucide-react';
import ChatUI from '../chat/ChatUI';
import ChatInput from '../chat/ChatInput';

export default function ChatLayer() {
    const chatOpen = useUIStore((state) => state.chatOpen);
    const toggleChat = useUIStore((state) => state.toggleChat);
    const clearChat = useChatStore((state) => state.clearMessages);

    return (
        <div
            className={`
        absolute top-0 right-0 h-full w-[400px]
        z-[10]
        bg-obsidian/95 backdrop-blur-3xl 
        border-l border-white/5 
        transition-transform duration-500 ease-out
        ${chatOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
            style={{
                willChange: 'transform',
                transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
            }}
        >
            {/* Ambient Glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />

            {/* Content Wrapper */}
            <div className="w-full h-full flex flex-col relative z-20 pt-[60px]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <Sparkles size={16} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white text-xs tracking-[0.15em] uppercase">Intelligence</h2>
                            <p className="text-[9px] text-gray-500 font-medium tracking-wider">Aeon AI</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-1">
                        <IconButton icon={Plus} title="New Chat" onClick={clearChat} />
                        <IconButton icon={History} title="History" />
                        <div className="w-[1px] h-4 bg-white/10 mx-2" />
                        <IconButton icon={X} title="Close" onClick={toggleChat} className="hover:bg-red-500/10 hover:text-red-400" />
                    </div>
                </div>

                {/* Chat UI (Messages) */}
                <ChatUI />

                {/* Chat Input */}
                <ChatInput />

            </div>
        </div>
    );
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
