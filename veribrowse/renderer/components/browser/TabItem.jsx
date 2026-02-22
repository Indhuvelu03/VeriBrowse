'use client';

import React from 'react';
import { X, Globe } from 'lucide-react';
import { useTabStore } from '../../store/tabStore';
import { clsx } from 'clsx';

export default function TabItem({ tab, isActive }) {
    const { setActiveTab, closeTab } = useTabStore();

    const handleClose = (e) => {
        e.stopPropagation();
        closeTab(tab.id);
    };

    return (
        <div
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
                "h-9 px-4 flex items-center gap-3 min-w-[140px] max-w-[200px] border-r border-white/5 cursor-pointer transition-all relative group",
                isActive ? "bg-white/10" : "hover:bg-white/5"
            )}
        >
            {/* Active Bottom Indicator */}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white" />}

            {/* Favicon Placeholder */}
            {tab.favicon ? (
                <img src={tab.favicon} className="w-4 h-4 rounded-sm" alt="" />
            ) : (
                <Globe size={14} className="text-gray-500" />
            )}

            <span className="text-xs text-gray-300 truncate flex-1">
                {tab.title || (tab.url === 'about:blank' ? 'New Tab' : 'Loading...')}
            </span>

            <button
                onClick={handleClose}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-md transition-all text-gray-500 hover:text-white"
            >
                <X size={12} />
            </button>
        </div>
    );
}
