'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useTabStore } from '../../store/tabStore';
import { useUIStore } from '../../store/uiStore';
import ipc from '../../lib/ipc';
import { resolveCommand } from '../../lib/CommandResolver';
import { Send, Loader2, Zap, Search, Wand2 } from 'lucide-react';

const ChatInput = () => {
    const [input, setInput] = useState('');
    const { addMessage, setLoading, isLoading, setCurrentTools } = useChatStore();
    const { updateTab, addTab, activeTabId } = useTabStore();
    const { setMainView } = useUIStore();
    const textareaRef = useRef(null);

    // Initialize Agent & Listen for Events
    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (apiKey) {
            ipc.agent.initialize(apiKey);
        }

        ipc.agent.onThinking((data) => {
            if (data.status === 'executing_tools') {
                setCurrentTools(data.tools || []);
            }
        });
    }, []);

    const getContextualMessage = async (rawMessage) => {
        const tabState = useTabStore.getState();
        const activeTab = tabState.tabs.find(t => t.id === tabState.activeTabId);

        return `
[CONTEXT]
URL: ${activeTab?.url || 'Unknown'}
Title: ${activeTab?.title || 'Unknown'}

[USER]
${rawMessage}
`.trim().substring(0, 3000);
    };

    const processAgentCommand = async (mode = 'auto') => {
        if (!input.trim() || isLoading) return;

        const userText = input.trim();
        const command = resolveCommand(userText);

        // Rule: If it's a direct navigation or URL, don't use the agent!
        if (command.intent === 'navigate') {
            if (activeTabId) {
                updateTab(activeTabId, { url: command.value, title: userText });
            } else {
                addTab({ id: Date.now().toString(), url: command.value, title: userText });
            }
            setMainView('browser');
            setInput('');
            return;
        }

        const contextualPrompt = await getContextualMessage(userText);

        // Add user UI message
        addMessage({ role: 'user', content: userText });
        setInput('');
        setLoading(true);

        try {
            const result = await ipc.agent.chat(contextualPrompt, mode);

            if (result.success) {
                addMessage({
                    role: 'assistant',
                    content: result.response,
                    type: result.type,
                    toolResults: result.actions
                });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error("[ChatInput] Agent process failed:", error);
            addMessage({
                role: 'assistant',
                content: `Error: ${error.message || "I encountered an issue while processing that request."}`
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRefine = async () => {
        if (!input.trim() || isLoading) return;
        setLoading(true);
        try {
            const response = await ipc.agent.refine(input.trim());
            if (response.success) {
                setInput(response.refined);
            }
        } catch (e) {
            console.error("Refine failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            processAgentCommand('auto');
        }
    };

    return (
        <div className="p-6 border-t border-white/5 bg-black/60 backdrop-blur-xl">
            <div className="flex gap-2 mb-3">
                <button
                    onClick={handleRefine}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/60 font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                >
                    <Wand2 size={12} /> Refine Request
                </button>
                <button
                    onClick={() => processAgentCommand('think')}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[10px] text-blue-400 font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                >
                    <Zap size={12} /> Deep Think
                </button>
            </div>

            <div className="relative flex flex-col group bg-white/[0.03] border border-white/10 rounded-2xl transition-all duration-300 focus-within:border-blue-500/40 focus-within:bg-white/[0.06] shadow-inner">
                <textarea
                    ref={textareaRef}
                    rows="1"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message Intelligence..."
                    disabled={isLoading}
                    className="w-full bg-transparent border-none p-5 text-sm text-white focus:outline-none placeholder-gray-600 resize-none overflow-hidden leading-relaxed disabled:opacity-50"
                />
                <div className="flex items-center justify-between px-5 pb-4">
                    <span className="text-[10px] text-gray-600 font-bold tracking-tighter uppercase">Ctrl + Enter to Act</span>
                    <button
                        onClick={() => processAgentCommand('action')}
                        disabled={!input.trim() || isLoading}
                        className={`p-2.5 rounded-xl shadow-lg transition-all 
              ${input.trim() && !isLoading
                                ? 'text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500'
                                : 'text-gray-600 bg-white/5 cursor-not-allowed'}`}
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInput;
