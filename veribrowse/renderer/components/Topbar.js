import React from 'react';
import { Plus } from 'lucide-react';
import Tabs from './Tabs';
import SearchBar from './SearchBar';
import ChatToggle from './ChatToggle';
import WindowControls from './WindowControls';
import { useTabStore } from '../store/tabStore';

const Topbar = () => {
  const { addTab } = useTabStore();

  const handleAddTab = () => {
    addTab({
      id: Date.now().toString(),
      title: 'New Tab',
      url: 'about:blank'
    });
  };

  return (
    <div className="h-full w-full bg-obsidian flex items-center px-6 border-b border-white/5 justify-between select-none relative">
      <div className="flex items-center flex-1 overflow-hidden mr-8">
        <Tabs />
        <button
          onClick={handleAddTab}
          className="p-2 hover:bg-white/5 rounded-xl ml-4 text-gray-500 hover:text-white transition-all duration-300 border border-transparent hover:border-white/5"
          title="New Tab"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-[2] max-w-3xl mx-4">
        <SearchBar variant="top" />
      </div>

      <div className="flex items-center space-x-4 flex-1 justify-end ml-8">
        <ChatToggle />
        <WindowControls />
      </div>
    </div>
  );
};

export default Topbar;
