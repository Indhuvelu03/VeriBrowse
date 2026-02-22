'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { useTabStore } from '../../store/tabStore';
import TabItem from './TabItem';

export default function Tabs() {
    const { userTabs, activeTabId, createNewTab } = useTabStore();

    // Always show the tab bar — hiding it when only 1 tab exists caused the
    // bar to disappear entirely when closing a second tab.

    return (
        <div className="h-full w-full bg-obsidian flex items-stretch overflow-x-auto scrollbar-hide flex-shrink-0">
            <div className="flex h-full">
                {userTabs.map((tab) => (
                    <TabItem
                        key={tab.id}
                        tab={tab}
                        isActive={tab.id === activeTabId}
                    />
                ))}
            </div>

            <button
                onClick={() => createNewTab()}
                className="h-full px-3 text-gray-500 hover:text-white hover:bg-white/5 transition-all border-r border-white/5 shrink-0"
            >
                <Plus size={16} />
            </button>
        </div>
    );
}
