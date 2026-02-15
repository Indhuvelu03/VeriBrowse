import React, { useCallback } from 'react';
import { useTabStore } from '../store/tabStore';
import { X, Globe } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const TabItem = ({ tab }) => {
  const { activeTabId, setActiveTab, closeTab } = useTabStore();
  const isActive = activeTabId === tab.id;

  const handleClose = useCallback((e) => {
    e.stopPropagation();
    closeTab(tab.id);
  }, [closeTab, tab.id]);

  return (
    <motion.div
      layoutId={`tab-${tab.id}`}
      onClick={() => setActiveTab(tab.id)}
      className={clsx(
        "group relative flex items-center h-[34px] rounded-lg cursor-pointer transition-all border select-none",
        // Flex behavior:
        // - Active: flex-[3] and larger min-width to ensure title visibility
        // - Inactive: flex-[1] and small min-width (36px) to allow collapsing to just icon
        isActive
          ? "flex-[3] min-w-[140px] max-w-[240px] bg-white/[0.08] text-white border-white/10 shadow-sm z-10 px-3"
          : "flex-[1] min-w-[36px] max-w-[160px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border-transparent px-2 justify-center"
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, width: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
    >
      <div className={clsx(
        "flex-shrink-0 transition-colors",
        isActive ? "text-blue-400 mr-2" : "text-gray-600"
      )}>
        <Globe size={14} />
      </div>

      {/* Title - Only visible/taking space if active or if there's enough room (handled by flex truncation) 
          We use AnimatePresence or simpler CSS hiding for inactive small states if needed, 
          but flex truncation is smoother.
      */}
      <div className={clsx(
        "flex-1 truncate text-[11px] font-medium tracking-wide transition-opacity",
        // If inactive, we let it truncate to nothing effectively if width is small
        isActive ? "opacity-100 pr-6" : "hidden sm:block opacity-70 group-hover:opacity-100 pr-0"
      )}>
        {tab.title || 'New Tab'}
      </div>

      {/* Close button - Always show on Active. On Inactive, only show on hover and if not crushed? 
          For simplicity: Only show on Active or Hover, but absolutely positioned so it doesn't take flow space.
      */}
      <button
        onClick={handleClose}
        className={clsx(
          "absolute right-1.5 p-1 rounded-md transition-all duration-200 z-50",
          isActive
            ? "opacity-100 hover:bg-white/10 text-white"
            : "opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-400 hover:text-white"
        )}
      >
        <X size={10} />
      </button>

      {/* Active Top Line Indicator */}
      {isActive && (
        <motion.div
          layoutId="active-highlight"
          className="absolute top-0 left-0 right-0 h-[1px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
        />
      )}
    </motion.div>
  );
};

export default TabItem;
