'use client';

import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, ArrowRight, AlertCircle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';

export default function AuthModal() {
    const {
        showAuthModal,
        authMode,
        authError,
        isLoading,
        firebaseReady,
        initializeFirebase,
        closeAuthModal,
        setAuthMode,
        signUp,
        signIn,
    } = useAuthStore();

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        displayName: '',
        confirmPassword: '',
    });

    const [localError, setLocalError] = useState('');
    const [checking, setChecking] = useState(false);

    // Initialize Firebase on component mount
    useEffect(() => {
        const initFirebase = async () => {
            if (firebaseReady) return;

            setChecking(true);
            try {
                // Try to load Firebase config from settings
                if (window.electronAPI?.settings) {
                    const apiKey = await window.electronAPI.settings.get('firebaseApiKey');
                    const authDomain = await window.electronAPI.settings.get('firebaseAuthDomain');
                    const projectId = await window.electronAPI.settings.get('firebaseProjectId');
                    const storageBucket = await window.electronAPI.settings.get('firebaseStorageBucket');
                    const messagingSenderId = await window.electronAPI.settings.get('firebaseMessagingSenderId');
                    const appId = await window.electronAPI.settings.get('firebaseAppId');

                    if (apiKey && projectId) {
                        const config = {
                            apiKey,
                            authDomain: authDomain || `${projectId}.firebaseapp.com`,
                            projectId,
                            storageBucket: storageBucket || `${projectId}.appspot.com`,
                            messagingSenderId,
                            appId,
                        };
                        initializeFirebase(config);
                    }
                }
            } catch (err) {
                console.error('[AuthModal] Firebase init failed:', err.message);
            } finally {
                setChecking(false);
            }
        };

        if (showAuthModal) {
            initFirebase();
        }
    }, [showAuthModal, firebaseReady, initializeFirebase]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        setLocalError('');
    };

    const validateForm = () => {
        if (!firebaseReady) {
            setLocalError('Firebase not configured. Please check Settings.');
            return false;
        }
        if (!formData.email) {
            setLocalError('Email is required');
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setLocalError('Please enter a valid email');
            return false;
        }
        if (!formData.password) {
            setLocalError('Password is required');
            return false;
        }
        if (formData.password.length < 6) {
            setLocalError('Password must be at least 6 characters');
            return false;
        }
        if (authMode === 'signup') {
            if (!formData.displayName) {
                setLocalError('Display name is required');
                return false;
            }
            if (formData.password !== formData.confirmPassword) {
                setLocalError('Passwords do not match');
                return false;
            }
        }
        return true;
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const result = await signUp(
            formData.email,
            formData.password,
            formData.displayName
        );

        if (!result.success) {
            setLocalError(result.error || 'Sign up failed');
        } else {
            setFormData({ email: '', password: '', displayName: '', confirmPassword: '' });
        }
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const result = await signIn(formData.email, formData.password);

        if (!result.success) {
            setLocalError(result.error || 'Sign in failed');
        } else {
            setFormData({ email: '', password: '', displayName: '', confirmPassword: '' });
        }
    };

    const handleClose = () => {
        setFormData({ email: '', password: '', displayName: '', confirmPassword: '' });
        setLocalError('');
        closeAuthModal();
    };

    const handleModeChange = (mode) => {
        setAuthMode(mode);
        setFormData({ email: '', password: '', displayName: '', confirmPassword: '' });
        setLocalError('');
    };

    return (
        <AnimatePresence>
            {showAuthModal && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: 'spring', damping: 20 }}
                        className="bg-obsidian border border-white/10 rounded-3xl w-full max-w-md shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-white/[0.02]">
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">
                                {authMode === 'login' && 'Sign In'}
                                {authMode === 'signup' && 'Create Account'}
                                {authMode === 'reset' && 'Reset Password'}
                            </h2>
                            <button
                                onClick={handleClose}
                                className="p-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                            {/* Error Message */}
                            <AnimatePresence>
                                {(localError || authError) && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3"
                                    >
                                        <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-sm text-red-300">{localError || authError}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Firebase Status */}
                            {checking && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-3"
                                >
                                    <Loader size={16} className="text-blue-400 animate-spin" />
                                    <p className="text-sm text-blue-300">Initializing Firebase...</p>
                                </motion.div>
                            )}

                            {!checking && !firebaseReady && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3"
                                >
                                    <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-amber-300">Please configure Firebase in Settings first.</p>
                                </motion.div>
                            )}

                            {/* Form */}
                            <form onSubmit={authMode === 'login' ? handleSignIn : handleSignUp} className="space-y-4">
                                {authMode === 'signup' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Full Name</label>
                                        <div className="relative">
                                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                            <input
                                                type="text"
                                                name="displayName"
                                                value={formData.displayName}
                                                onChange={handleInputChange}
                                                placeholder="John Doe"
                                                disabled={isLoading || !firebaseReady}
                                                className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email Address</label>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            placeholder="you@example.com"
                                            disabled={isLoading || !firebaseReady}
                                            className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Password</label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                        <input
                                            type="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleInputChange}
                                            placeholder="••••••••"
                                            disabled={isLoading || !firebaseReady}
                                            className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                {authMode === 'signup' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Confirm Password</label>
                                        <div className="relative">
                                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                            <input
                                                type="password"
                                                name="confirmPassword"
                                                value={formData.confirmPassword}
                                                onChange={handleInputChange}
                                                placeholder="••••••••"
                                                disabled={isLoading || !firebaseReady}
                                                className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading || !firebaseReady || checking}
                                    className="w-full h-11 bg-white text-black font-bold rounded-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <Loader size={16} className="animate-spin" />
                                    ) : (
                                        <>
                                            {authMode === 'login' ? 'Sign In' : 'Create Account'}
                                            <ArrowRight size={16} />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Mode Switcher */}
                            <div className="pt-4 border-t border-white/5 text-center">
                                {authMode === 'login' && (
                                    <button
                                        onClick={() => handleModeChange('signup')}
                                        className="text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        Don't have an account? <span className="text-white font-semibold">Sign up</span>
                                    </button>
                                )}
                                {authMode === 'signup' && (
                                    <button
                                        onClick={() => handleModeChange('login')}
                                        className="text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        Already have an account? <span className="text-white font-semibold">Sign in</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
