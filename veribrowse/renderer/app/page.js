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
// import SkillLibraryPage from '../components/pages/SkillLibraryPage';

// Utilities
import ToastNotifications from '../components/ToastNotifications';
import { AnimatePresence, motion } from 'framer-motion';

// ── Auth Layer (additive — does not modify existing components) ──────
import AuthProvider from '../components/AuthProvider';
import AuthPage from '../components/AuthPage';
import { useAuthStore } from '../store/authStore';
import { Logo } from '../components/Logo';

/* ────────────────────────────────────────────────────────────────────
 * AuthGate
 *
 * Shows a splash/loading animation while the session is being checked,
 * the AuthPage when no user is logged in, or the browser UI when
 * authenticated.  This is a pure wrapper — it never touches the
 * components it guards.
 * ──────────────────────────────────────────────────────────────────── */
function AuthGate({ children }) {
    const { user, loading } = useAuthStore();
    const { currentPage } = useUIStore();

    // ── 1. Loading / Splash ──────────────────────────────────────────
    if (loading) {
        return (
            <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-obsidian">
                {/* Ambient glows — same as HomePage */}
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />

                <motion.div
                    initial={{ scale: 0.6, opacity: 0, rotateY: -180 }}
                    animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                    transition={{ type: 'spring', stiffness: 50, damping: 14, duration: 1.2 }}
                >
                    <Logo size={160} spinning />
                </motion.div>

                <motion.h1
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.6 }}
                    className="mt-10 text-4xl font-bold tracking-tighter text-white"
                >
                    VeriBrowse
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.5 }}
                    className="mt-2 text-gray-500 uppercase tracking-[0.4em] text-[10px] font-bold"
                >
                    Security Intelligence
                </motion.p>

                {/* Animated loading bar — monochrome white */}
                <motion.div
                    className="mt-12 w-48 h-[2px] rounded-full overflow-hidden bg-white/5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                >
                    <motion.div
                        className="h-full bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full"
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                </motion.div>
            </div>
        );
    }

    /* 
     * ── 2. Settings Bypass ──────────────────────────────────────────
     * If the user is at the AuthPage but tries to open settings,
     * allow the children to render so the SettingsPage overlay can show.
     */
    if (currentPage === 'settings') {
        return <>{children}</>;
    }

    // ── 3. Not authenticated ─────────────────────────────────────────
    if (!user) {
        return <AuthPage />;
    }

    // ── 4. Authenticated → render the existing browser UI ────────────
    return <>{children}</>;
}

export default function MainLayout() {
    const { currentPage, agentPanelOpen, activeView } = useUIStore();
    const { activeTabId } = useTabStore();

    // Wire IPC listeners
    useIPCListeners();

    return (
        <AuthProvider>
            <AuthGate>
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
                                    {/* {currentPage === 'skills' && <SkillLibraryPage key="skills" />} */}
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
            </AuthGate>
        </AuthProvider>
    );
}

