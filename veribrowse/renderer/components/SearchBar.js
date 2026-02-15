import React, { useState, useEffect } from 'react';
import { Search, Globe, Command, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useTabStore } from '../store/tabStore';
import { useUIStore } from '../store/uiStore';
import { buildSearchUrl } from '../utils/searchUtils';
import clsx from 'clsx';
import { motion } from 'framer-motion';

const SearchBar = ({ variant = 'default' }) => {
  const { activeTabId, updateTab, tabs, addTab, triggerNavigation } = useTabStore();
  const { setShowHome } = useUIStore();

  const activeTab = tabs.find(t => t.id === activeTabId);
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (activeTab?.url && activeTab.url !== 'about:blank') {
      setInput(activeTab.url);
    } else {
      setInput('');
    }
  }, [activeTab]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const finalUrl = buildSearchUrl(input);

      if (activeTabId) {
        updateTab(activeTabId, { url: finalUrl, title: input });
      } else {
        addTab({ id: Date.now().toString(), url: finalUrl, title: input });
      }
      setShowHome(false);
      e.target.blur();
    }
  };

  const isTop = variant === 'top';

  return (
    <motion.div
      animate={isFocused ? { scale: isTop ? 1 : 1.02 } : { scale: 1 }}
      className={clsx(
        "relative flex items-center w-full transition-all duration-500",
        isTop
          ? "h-10 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10"
          : "h-16 rounded-3xl bg-white/[0.02] border border-white/10 shadow-2xl backdrop-blur-xl group"
      )}
    >
      {/* Navigation Controls (Only visible in Top variant) */}
      {isTop && (
        <div className="flex items-center space-x-1 pl-2 pr-2 border-r border-white/5 mr-2">
          <NavButton icon={ChevronLeft} onClick={() => triggerNavigation('back')} title="Back" />
          <NavButton icon={ChevronRight} onClick={() => triggerNavigation('forward')} title="Forward" />
          <NavButton icon={RotateCw} size={12} onClick={() => triggerNavigation('reload')} title="Reload" />
        </div>
      )}

      {/* Leading Icon */}
      <div className={clsx("flex items-center justify-center text-gray-500", isTop ? "pl-2" : "absolute left-4")}>
        {input.includes('.') && !input.includes(' ') ? (
          <Globe size={isTop ? 14 : 20} className="text-blue-400/50" />
        ) : (
          <Search size={isTop ? 14 : 20} />
        )}
      </div>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={isTop ? "Search or enter URL" : "Ask intelligence or enter URL..."}
        className={clsx(
          "flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 font-medium transition-colors",
          isTop ? "text-xs h-full ml-2" : "text-lg h-full pl-12"
        )}
        autoFocus={!isTop}
      />

      <div className={clsx("absolute right-4 flex items-center space-x-2 text-gray-600", isTop && "right-2")}>
        {!isTop && (
          <div className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-white/5 border border-white/5">
            <Command size={10} />
            <span className="text-[10px] font-bold">K</span>
          </div>
        )}
        {input && (
          <button onClick={() => setInput('')} className="hover:text-white transition-colors">
            {/* Small X for clearing */}
            <div className="bg-white/10 rounded-full p-0.5 hover:bg-white/20">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </div>
          </button>
        )}
      </div>
    </motion.div>
  );
};

const NavButton = ({ icon: Icon, onClick, title, size = 14 }) => (
  <button
    onClick={onClick}
    title={title}
    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
  >
    <Icon size={size} />
  </button>
);

export default SearchBar;
