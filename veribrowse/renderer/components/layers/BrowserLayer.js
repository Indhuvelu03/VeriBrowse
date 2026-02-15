'use client';

import React from 'react';
import { useUIStore } from '../../store/uiStore';
import BrowserView from '../BrowserView';
import DefaultHome from '../DefaultHome';

export default function BrowserLayer() {
    const showHome = useUIStore((state) => state.showHome);
    const chatOpen = useUIStore((state) => state.chatOpen);

    return (
        <div className="absolute inset-0 z-[1]">
            {/* 
        Browser Layout Container 
        - Positions the browser content below the Topbar (60px) and to the right of Sidebar (80px).
        - IMPORTANT: This container RESIZES when chat opens to prevent content overlap perfectly.
        - Uses 'right' property transition which is performant enough for this layout shift.
      */}
            <div
                className="absolute top-[60px] left-[80px] bottom-0 bg-obsidian transition-[right] duration-500 ease-out"
                style={{ right: chatOpen ? '400px' : '0px' }}
            >
                {/* BrowserView is always mounted to maintain state */}
                <div className="absolute inset-0 w-full h-full">
                    <BrowserView />
                </div>

                {/* Home Overlay - shows when no tab is active or explicitly requested */}
                {showHome && (
                    <div className="absolute inset-0 z-[2] w-full h-full">
                        <DefaultHome />
                    </div>
                )}
            </div>
        </div>
    );
}
