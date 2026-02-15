import React from 'react';
import { useUIStore } from '../store/uiStore';
import { X, Send, Plus, History, Sparkles } from 'lucide-react';

const ChatPanel = () => {
  const chatOpen = useUIStore((state) => state.chatOpen);
  const toggleChat = useUIStore((state) => state.toggleChat);

  return (
    <div
      className={`
        fixed right-0 top-[60px] bottom-0 
        w-[420px] 
        z-[10]
        bg-obsidian/95 backdrop-blur-3xl 
        border-l border-white/5 
        flex flex-col 
        shadow-[-20px_0_50px_rgba(0,0,0,0.8)] 
        overflow-hidden
        transition-transform duration-500 ease-out
        ${chatOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
      style={{
        // GPU acceleration hints
        willChange: chatOpen ? 'transform' : 'auto',
        transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
      }}
    >
      {/* Ambient Glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />

      <div className="w-full h-full flex flex-col relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Sparkles size={16} className="text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-xs tracking-[0.15em] uppercase">Intelligence</h2>
              <p className="text-[9px] text-gray-500 font-medium tracking-wider">Aeon Intelligence</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <IconButton icon={Plus} title="New Chat" />
            <IconButton icon={History} title="History" />
            <div className="w-[1px] h-4 bg-white/10 mx-2" />
            <IconButton icon={X} title="Close" onClick={toggleChat} className="hover:bg-red-500/10 hover:text-red-400" />
          </div>
        </div>

        {/* Chat Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-8 scrollbar-hide">
          <div className="space-y-3">
            <div className="chat-bubble-ai p-5 rounded-2xl rounded-tl-none self-start max-w-[95%] text-sm text-white/90 bg-white/[0.03] border border-white/10 leading-relaxed shadow-xl">
              <p>I'm analyzing the workspace context. How can I assist your session?</p>
            </div>
            <span className="text-[10px] text-gray-600 ml-1 font-bold tracking-widest uppercase">System Initialized</span>
          </div>

          <div className="space-y-3 flex flex-col items-end">
            <div className="chat-bubble-user p-5 rounded-2xl rounded-tr-none self-end max-w-[95%] text-sm text-white bg-blue-600/20 border border-blue-500/30 shadow-2xl leading-relaxed">
              <p>Summarize the current view and highlights.</p>
            </div>
            <span className="text-[10px] text-gray-600 mr-1 font-bold tracking-widest uppercase">User Query</span>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-white/5 bg-black/60 backdrop-blur-xl">
          <div className="relative flex flex-col group bg-white/[0.03] border border-white/10 rounded-2xl transition-all duration-300 focus-within:border-blue-500/40 focus-within:bg-white/[0.06] shadow-inner">
            <textarea
              rows="1"
              placeholder="Message Intelligence..."
              className="w-full bg-transparent border-none p-5 text-sm text-white focus:outline-none placeholder-gray-600 resize-none overflow-hidden leading-relaxed"
            />
            <div className="flex items-center justify-between px-5 pb-4">
              <span className="text-[10px] text-gray-600 font-bold tracking-tighter uppercase">Ctrl + Enter</span>
              <button className="p-2.5 text-blue-400 hover:text-white transition-all bg-blue-500/10 hover:bg-blue-500 rounded-xl shadow-lg group">
                <Send size={18} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const IconButton = ({ icon: Icon, title, onClick, className }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 ${className}`}
  >
    <Icon size={18} />
  </button>
);

export default ChatPanel;
