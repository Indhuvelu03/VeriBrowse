import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';

const ChatUI = () => {
    const { messages, isLoading } = useChatStore();
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    return (
        <div className="flex-1 p-6 overflow-y-auto space-y-6 scrollbar-hide">
            {messages.map((msg, index) => (
                <div key={msg.id || index} className={`space-y-1 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                        className={`
              p-5 rounded-2xl max-w-[95%] text-sm leading-relaxed shadow-xl
              ${msg.role === 'assistant'
                                ? 'chat-bubble-ai rounded-tl-none text-white/90 bg-white/[0.03] border border-white/10'
                                : 'chat-bubble-user rounded-tr-none text-white bg-blue-600/20 border border-blue-500/30'}
            `}
                    >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <span className={`text-[10px] text-gray-600 ${msg.role === 'user' ? 'mr-1' : 'ml-1'} font-bold tracking-widest uppercase`}>
                        {msg.role === 'assistant' ? (index === 0 ? 'System Initialized' : 'Aeon') : 'User Query'}
                    </span>
                </div>
            ))}

            {isLoading && (
                <div className="space-y-1 flex flex-col items-start">
                    <div className="p-4 rounded-2xl rounded-tl-none bg-white/[0.03] border border-white/10 shadow-xl max-w-[80%]">
                        <div className="flex space-x-1 items-center h-4">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                        </div>
                    </div>
                    <span className="text-[10px] text-gray-600 ml-1 font-bold tracking-widest uppercase">Thinking...</span>
                </div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
};

export default ChatUI;
