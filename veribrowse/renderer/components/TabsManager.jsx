import React from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export default function TabsManager({ tabs, activeTab, onTabChange, onTabClose, onNewTab }) {
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {/* Tabs */}
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                        "group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 min-w-[160px] max-w-[200px]",
                        activeTab === tab.id
                            ? "bg-white dark:bg-neutral-900 shadow-soft"
                            : "hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                    )}
                >
                    {/* Tab Favicon */}
                    <div className="w-3.5 h-3.5 rounded bg-gradient-to-br from-primary-400 to-accent-purple flex-shrink-0" />

                    {/* Tab Title */}
                    <span className={cn(
                        "flex-1 text-xs font-medium truncate transition-colors",
                        activeTab === tab.id ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"
                    )}>
                        {tab.title || 'New Tab'}
                    </span>

                    {/* Close Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onTabClose(tab.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-all duration-200"
                    >
                        <X className="w-3 h-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300" />
                    </button>
                </div>
            ))}

            {/* New Tab Button */}
            <button
                onClick={onNewTab}
                className="flex-shrink-0 p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
            >
                <Plus className="w-4 h-4 text-neutral-400 hover:text-primary-500" />
            </button>
        </div>
    );
}
