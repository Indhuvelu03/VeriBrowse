'use client';

import React from 'react';
import clsx from 'clsx';
import { useUIStore } from '../../store/uiStore';
import BrowserView from '../BrowserView';
import DefaultHome from '../DefaultHome';

export default function BrowserLayer() {
    const mainView = useUIStore((state) => state.mainView);
    const sidebarMode = useUIStore((state) => state.sidebarMode);
    const sidebarOpen = sidebarMode !== 'hidden';

    return (
        <div className="absolute inset-0 z-[1]">
            {/* 
        Browser Layout Container 
        - Positions the browser content below the Topbar (60px) and to the right of Sidebar (80px).
        - IMPORTANT: This container RESIZES when any sidebar panel is open.
      */}
            <div
                className="absolute top-[60px] left-[80px] bottom-0 bg-[#0a0a0a] transition-[right] duration-300 ease-in-out overflow-hidden"
                style={{
                    right: sidebarOpen ? '420px' : '0px',
                    boxShadow: sidebarOpen ? '-20px 0 50px -10px rgba(0,0,0,0.5)' : 'none'
                }}
            >
                {/* Visual separator/border when sidebar is open */}
                {sidebarOpen && (
                    <div className="absolute top-0 right-0 bottom-0 w-[1px] bg-white/5 z-10" />
                )}

                {/* Ambient dynamic background logic can go here, for now solid obsidian */}
                <div className="absolute inset-0 z-0 bg-obsidian" />

                {/* BrowserView is always mounted but we hide its container if in home mode */}
                <div
                    className={clsx(
                        "absolute inset-0 w-full h-full z-1 transition-opacity duration-300",
                        mainView === 'home' ? "opacity-0 pointer-events-none" : "opacity-100"
                    )}
                >
                    <BrowserView />
                </div>

                {/* Home Overlay - shows when in home mode */}
                {mainView === 'home' && (
                    <div className="absolute inset-0 z-[2] w-full h-full bg-obsidian">
                        <DefaultHome />
                    </div>
                )}
            </div>
        </div>
    );
}
