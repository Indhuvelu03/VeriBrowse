'use client';

import React, { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useTabStore } from '../store/tabStore';
import { useAuthStore } from '../store/authStore';
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

// Auth Components
import AuthPage from '../components/pages/AuthPage';

// Utilities
import ToastNotifications from '../components/ToastNotifications';
import { AnimatePresence, motion } from 'framer-motion';

const AGENT_PANEL_WIDTH = 420;

export default function MainLayout() {
    const { currentPage, agentPanelOpen, activeView } = useUIStore();
    const { activeTabId } = useTabStore();
    const { isAuthenticated, watchAuthState } = useAuthStore();

    // Wire IPC listeners
    useIPCListeners();

    // Watch authentication state changes
    useEffect(() => {
        const unsubscribe = watchAuthState();

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [watchAuthState]);

    return (
        <>
            {!isAuthenticated ? (
                // Show full-screen auth page
                <AuthPage />
            ) : (
                // Show browser UI for authenticated users
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
                            {/* Browser Viewport — native view, handles its own sizing */}
                            <div className="absolute inset-0 z-0">
                                <ErrorBoundary name="BrowserLayer">
                                    <BrowserLayer />
                                </ErrorBoundary>
                            </div>

                            {/* Pages layer — shrinks when agent panel opens so content
                                    re-centers within the visible area instead of going under the panel */}
                            <div
                                className="absolute inset-y-0 left-0 z-10 overflow-hidden"
                                style={{
                                    right: agentPanelOpen ? AGENT_PANEL_WIDTH : 0,
                                    transition: 'right 0.25s ease-in-out',
                                }}
                            >
                                <AnimatePresence mode="wait">
                                    {(activeView === 'home' || !activeTabId) && (
                                        <motion.div
                                            key="home-page"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0"
                                        >
                                            <HomePage />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Overlays */}
                                <AnimatePresence>
                                    {currentPage === 'history' && <HistoryPage key="history" />}
                                    {currentPage === 'downloads' && <DownloadsPage key="downloads" />}
                                    {currentPage === 'settings' && <SettingsPage key="settings" />}
                                    {currentPage === 'skills' && <SkillLibraryPage key="skills" />}
                                </AnimatePresence>
                            </div>

                            {/* Agent Panel — AnimatePresence fully unmounts when closed so
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
            )}
        </>
    );
}
