'use client';

import React, { useState, useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useTabStore } from '../store/tabStore';
import { useWorkflowStore } from '../store/workflowStore';
import { clsx } from 'clsx';
import useIPCListeners from '../hooks/useIPCListeners'; // Using existing hook but will update it to new stores

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
                {/* Global Drag Handle - Restricted center area */}
                <div className="absolute top-0 left-64 right-[400px] h-10 drag-region z-[200] pointer-events-auto" />

                {/* Top Headers - Navigation Area */}
                <div className="flex flex-col flex-shrink-0 pt-10">
                    <Topbar />
                    <Tabs />
                </div>

                {/* Shared Viewport Area */}
                <div className="flex-1 relative flex overflow-hidden">
                    {/* Main Content Area */}
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

                    {/* 3. Agent Panel (Overlay Layer) */}
                    <div className={clsx(
                        "absolute inset-y-0 right-0 z-50 transition-transform duration-300 ease-in-out",
                        agentPanelOpen ? "translate-x-0" : "translate-x-full"
                    )}>
                        <ErrorBoundary name="AgentPanel">
                            <AgentPanel />
                        </ErrorBoundary>
                    </div>
                </div>
            </div>

            {/* 4. Global Window Controls (Topmost Layer) */}
            <div className="absolute top-0 right-0 h-10 w-48 z-[1000] pointer-events-auto no-drag flex justify-end">
                <WindowControls />
            </div>

            {/* 5. Utility Layers */}
            <ToastNotifications />

        </div>
    );
}
