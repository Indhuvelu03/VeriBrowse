'use client';

import React from 'react';
import { Home, Bot, History, Download, Settings, User } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export default function Siderail() {
    const {
        currentPage,
        setCurrentPage,
        agentPanelOpen,
        toggleAgentPanel,
        closeOverlays,
        setActiveView
    } = useUIStore();

    const { currentUser, openLoginModal } = useAuthStore();

    const navItems = [
        { id: 'home', icon: Home, label: 'Home', action: () => { setCurrentPage('home'); setActiveView('home'); } },
        { id: 'agent', icon: Bot, label: 'Agent', action: () => toggleAgentPanel() },
        // { id: 'skills', icon: Sparkles, label: 'Skills', action: () => currentPage === 'skills' ? closeOverlays() : setCurrentPage('skills') },
        { id: 'history', icon: History, label: 'History', action: () => currentPage === 'history' ? closeOverlays() : setCurrentPage('history') },
        { id: 'downloads', icon: Download, label: 'Downloads', action: () => currentPage === 'downloads' ? closeOverlays() : setCurrentPage('downloads') },
    ];

    const bottomItems = [
        { id: 'settings', icon: Settings, label: 'Settings', action: () => currentPage === 'settings' ? closeOverlays() : setCurrentPage('settings') },
        { id: 'profile', icon: User, label: currentUser ? 'Profile' : 'Sign In', action: () => currentUser ? (currentPage === 'settings' ? closeOverlays() : setCurrentPage('settings')) : openLoginModal(), badge: currentUser ? true : false },
    ];

    return (
        <aside className="w-16 h-full bg-obsidian border-r border-white/5 flex flex-col items-center py-6 flex-shrink-0 z-50">
            {/* Top Navigation */}
            <div className="flex flex-col gap-6 flex-1 w-full items-center mt-12">
                {navItems.map((item) => {
                    const isActive = (item.id === 'agent' && agentPanelOpen) || (item.id === currentPage && item.id !== 'agent');
                    return (
                        <NavItem
                            key={item.id}
                            item={item}
                            isActive={isActive}
                            indicatorId={item.id === 'agent' ? 'agent-indicator' : 'nav-indicator'}
                        />
                    );
                })}
            </div>

            {/* Bottom Navigation */}
            <div className="flex flex-col gap-6 w-full items-center">
                {bottomItems.map((item) => (
                    <NavItem
                        key={item.id}
                        item={item}
                        isActive={currentPage === item.id}
                        indicatorId="nav-indicator"
                        badge={item.badge}
                    />
                ))}
            </div>
        </aside>
    );
}

function NavItem({ item, isActive, indicatorId = 'nav-indicator', badge }) {
    return (
        <div className="relative group">
            <button
                onClick={item.action}
                className={clsx(
                    "w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 relative group/btn",
                    isActive ? "text-white bg-white/15 shadow-xl shadow-black/40 ring-1 ring-white/10" : "text-gray-500 hover:text-white hover:bg-white/10"
                )}
            >
                {isActive && (
                    <motion.div
                        layoutId={indicatorId}
                        className="absolute -left-4 top-1/2 -translate-y-1/2 w-[4px] h-7 bg-white rounded-r-full shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                    />
                )}
                <item.icon size={22} className={clsx("transition-transform duration-300", isActive ? "scale-110" : "group-hover/btn:scale-110")} />
                {badge && (
                    <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border border-obsidian" />
                )}
            </button>

            {/* Tooltip */}
            <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 border border-white/10 rounded text-[10px] font-bold text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100] whitespace-nowrap shadow-xl">
                {item.label}
            </div>
        </div>
    );
}
