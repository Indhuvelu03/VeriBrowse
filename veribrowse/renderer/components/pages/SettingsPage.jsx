'use client';

import React, { useState, useEffect } from 'react';
import { Settings, X, LogOut, User, Mail, Calendar } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { motion } from 'framer-motion';

export default function SettingsPage() {
    const { closeOverlays, addToast } = useUIStore();
    const { currentUser, userProfile, userStats, signOut, loadFullUserData } = useAuthStore();
    
    const [isLoading, setIsLoading] = useState(false);

    // Load user data on mount
    useEffect(() => {
        if (currentUser) {
            loadFullUserData(currentUser.uid);
        }
    }, [currentUser, loadFullUserData]);

    const handleSignOut = async () => {
        setIsLoading(true);
        const result = await signOut();
        setIsLoading(false);

        if (result.success) {
            addToast('Signed out successfully', 'success');
            closeOverlays();
        } else {
            addToast(result.error || 'Failed to sign out', 'error');
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-y-0 left-0 right-0 bg-obsidian z-[60] flex flex-col"
        >
            {/* Header */}
            <header className="h-16 border-b border-white/5 flex items-center px-8 justify-between bg-white/[0.02]">
                <div className="flex items-center gap-4">
                    <Settings className="text-gray-400" size={20} />
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">User Profile</h2>
                </div>

                <button
                    onClick={closeOverlays}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full space-y-8">

                {/* User Profile Section */}
                {currentUser ? (
                    <motion.section className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <User size={16} className="text-purple-500" />
                            </div>
                            <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">User Profile</h3>
                        </div>

                        <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                            {/* User Info Grid */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Display Name</label>
                                    <p className="text-sm text-white">{currentUser.displayName || 'Not set'}</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <Mail size={12} /> Email
                                    </label>
                                    <p className="text-sm text-white break-all">{currentUser.email}</p>
                                </div>
                            </div>

                            {/* Account Info */}
                            {userProfile && (
                                <div className="grid grid-cols-2 gap-4 pb-6 border-b border-white/5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <Calendar size={12} /> Created
                                        </label>
                                        <p className="text-sm text-white">{formatDate(userProfile.created_at)}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Last Login</label>
                                        <p className="text-sm text-white">{formatDate(userProfile.last_login)}</p>
                                    </div>
                                </div>
                            )}

                            {/* Usage Stats */}
                            {userStats && (
                                <div className="grid grid-cols-3 gap-4 pt-6">
                                    <div className="text-center p-4 bg-blue-500/5 rounded-lg border border-blue-500/10">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Sessions</p>
                                        <p className="text-2xl font-bold text-blue-400">{userStats.totalSessions || 0}</p>
                                    </div>
                                    <div className="text-center p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Workflows</p>
                                        <p className="text-2xl font-bold text-emerald-400">{userStats.totalWorkflows || 0}</p>
                                    </div>
                                    <div className="text-center p-4 bg-orange-500/5 rounded-lg border border-orange-500/10">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Credits Used</p>
                                        <p className="text-2xl font-bold text-orange-400">{userStats.creditsUsed || 0}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sign Out Button */}
                        <button
                            onClick={handleSignOut}
                            disabled={isLoading}
                            className="w-full h-12 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold rounded-xl flex items-center justify-center gap-3 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                            <LogOut size={18} /> {isLoading ? 'Signing out...' : 'Sign Out'}
                        </button>
                    </motion.section>
                ) : (
                    <motion.section className="space-y-4 p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <User size={32} className="text-blue-400 mx-auto" />
                        <p className="text-sm text-gray-300">Log in to access your profile and preferences</p>
                    </motion.section>
                )}

            </div>
        </motion.div>
    );
}
