import React from 'react';
import { Logo } from './Logo';
import { useUIStore } from '../store/uiStore';
import clsx from 'clsx';

const ChatToggle = () => {
  const { chatOpen, toggleChat } = useUIStore();

  return (
    <button
      onClick={toggleChat}
      className={clsx(
        'p-1.5 rounded-lg transition-colors duration-200 group relative flex items-center justify-center',
        chatOpen ? 'bg-white/10' : 'hover:bg-white/5'
      )}
    >
      <Logo size={24} />
      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
export default ChatToggle;
