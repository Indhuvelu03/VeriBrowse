'use client';

import React from 'react';
import { useUIStore } from '../store/uiStore';
import { useTabStore } from '../store/tabStore';
import useIPCListeners from '../hooks/useIPCListeners';

// Shell Components
import WindowControls from '../components/shell/WindowControls';
import Siderail from '../components/shell/Siderail';

// Browser Components
import Topbar from '../components/browser/Topbar';
import Tabs from '../components/browser/Tabs';
import BrowserLayer from '../components/browser/BrowserLayer';

// Agent Components
import AgentPanel from '../components/agent/AgentPanel';

// Error Boundary
import ErrorBoundary from '../components/ErrorBoundary';

// Overlay Pages
import HomePage from '../components/pages/HomePage';
import HistoryPage from '../components/pages/HistoryPage';
import DownloadsPage from '../components/pages/DownloadsPage';
import SettingsPage from '../components/pages/SettingsPage';
import SkillLibraryPage from '../components/pages/SkillLibraryPage';

// Utilities
import ToastNotifications from '../components/ToastNotifications';
import { AnimatePresence, motion } from 'framer-motion';

export default function MainLayout() {
    const { currentPage, agentPanelOpen, activeView } = useUIStore();
    const { activeTabId } = useTabStore();

    // Wire IPC listeners
    useIPCListeners();

    return (
        <div className="flex h-screen w-screen bg-obsidian overflow-hidden select-none relative">

            {/* 1. Side Navigation Rail (Always left) */}
            <Siderail />

            {/* 2. Main Workspace (Base Layer) */}
            <div className="flex-1 flex flex-col relative h-full overflow-hidden bg-obsidian">

                {/* ── Title Bar Row: drag region + tabs + window controls ── */}
                <div className="h-10 flex-shrink-0 flex items-center relative z-[1000] drag-region">
                    {/* Tabs sit in the drag region — they are no-drag themselves */}
                    <div className="flex-1 flex items-center h-full overflow-hidden no-drag">
                        <Tabs />
                    </div>
                    {/* Window controls — right side */}
                    <div className="h-full shrink-0 no-drag">
                        <WindowControls />
                    </div>
                </div>

                {/* ── Nav Bar ── */}
                <Topbar />

                {/* Shared Viewport Area */}
                <div className="flex-1 relative flex overflow-hidden">
                    {/* Main Content Area — BrowserLayer handles native view offset internally */}
                    <div className="absolute inset-0 z-0">
                        {/* The Page Layer */}
                        <AnimatePresence mode="wait">
                            {(activeView === 'home' || !activeTabId) && (
                                <motion.div
                                    key="home-page"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-10"
                                >
                                    <HomePage />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* The Browser Viewport */}
                        <ErrorBoundary name="BrowserLayer">
                            <BrowserLayer />
                        </ErrorBoundary>

                        {/* Overlays */}
                        <AnimatePresence>
                            {currentPage === 'history' && <HistoryPage key="history" />}
                            {currentPage === 'downloads' && <DownloadsPage key="downloads" />}
                            {currentPage === 'settings' && <SettingsPage key="settings" />}
                            {currentPage === 'skills' && <SkillLibraryPage key="skills" />}
                        </AnimatePresence>
                    </div>

                    {/* 3. Agent Panel — AnimatePresence fully unmounts when closed so
                            the native BrowserView never has a partial-panel overlap */}
                    <AnimatePresence>
                        {agentPanelOpen && (
                            <motion.div
                                key="agent-panel"
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                className="absolute inset-y-0 right-0 z-[1001]"
                            >
                                <ErrorBoundary name="AgentPanel">
                                    <AgentPanel />
                                </ErrorBoundary>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* 5. Utility Layers */}
            <ToastNotifications />

        </div>
    );
}
