import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useTabStore } from '../../store/tabStore';
import { generateGeminiResponse } from '../../services/geminiService';
import { Send, Loader2 } from 'lucide-react';

const ChatInput = () => {
    const [input, setInput] = useState('');
    const { addMessage, setLoading, isLoading, responseCache, addToCache } = useChatStore();

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessageContent = input.trim();
        const cacheKey = userMessageContent.toLowerCase();

        // 1. Get Browser Context
        const tabState = useTabStore.getState();
        const activeTab = tabState.tabs.find(t => t.id === tabState.activeTabId);

        // Try to get selected text from the BrowserView
        let selectedText = '';
        if (window.ipc) {
            try {
                selectedText = await window.ipc.invoke('view-get-selection');
            } catch (e) {
                console.warn("Could not get selected text:", e);
            }
        }

        // Contextual prompt - Rule 6 limit still applies in service, but we manage it here too
        const contextualPrompt = `
[CONTEXT]
URL: ${activeTab?.url || 'Unknown'}
Title: ${activeTab?.title || 'Unknown'}
${selectedText ? `Selected Text: "${selectedText}"` : ''}

[USER]
${userMessageContent}
`.trim().substring(0, 3000);

        // 2. Add User Message immediately (show original user text in UI)
        addMessage({ role: 'user', content: userMessageContent });
        setInput('');

        // 3. Check Cache (Rule 9) - Cache based on user input, not contextual prompt to keep cache hits high
        if (responseCache[cacheKey]) {
            console.log("[ChatInput] Using cached response for:", userMessageContent);
            addMessage({ role: 'assistant', content: responseCache[cacheKey] });
            return;
        }

        // 4. Set Loading State
        setLoading(true);

        try {
            console.log("[ChatInput] Initiating Gemini API request with context...");

            // 5. Call Gemini API with Context
            const aiResponseText = await generateGeminiResponse(contextualPrompt);

            // 6. Add AI Response & Save to Cache
            addMessage({ role: 'assistant', content: aiResponseText });
            addToCache(userMessageContent, aiResponseText);

        } catch (error) {
            console.error("[ChatInput] Failed to get response:", error);
            addMessage({
                role: 'assistant',
                content: error.message || "I encountered an error processing your request."
            });
        } finally {
            // 5. Reset Loading State
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="p-6 border-t border-white/5 bg-black/60 backdrop-blur-xl">
            <div className="relative flex flex-col group bg-white/[0.03] border border-white/10 rounded-2xl transition-all duration-300 focus-within:border-blue-500/40 focus-within:bg-white/[0.06] shadow-inner">
                <textarea
                    rows="1"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message Intelligence..."
                    disabled={isLoading}
                    className="w-full bg-transparent border-none p-5 text-sm text-white focus:outline-none placeholder-gray-600 resize-none overflow-hidden leading-relaxed disabled:opacity-50"
                />
                <div className="flex items-center justify-between px-5 pb-4">
                    <span className="text-[10px] text-gray-600 font-bold tracking-tighter uppercase">Ctrl + Enter</span>
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className={`p-2.5 rounded-xl shadow-lg transition-all 
              ${input.trim() && !isLoading
                                ? 'text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500'
                                : 'text-gray-600 bg-white/5 cursor-not-allowed'}`}
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInput;
