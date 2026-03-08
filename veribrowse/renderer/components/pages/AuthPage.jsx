'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, ArrowRight, AlertCircle, Loader, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';

export default function AuthPage() {
    const {
        authError,
        isLoading,
        firebaseReady,
        initializeFirebase,
        signUp,
        signIn,
    } = useAuthStore();

    const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        displayName: '',
        confirmPassword: '',
    });

    const [localError, setLocalError] = useState('');
    const [checking, setChecking] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Initialize Firebase on component mount
    useEffect(() => {
        const initFirebase = async () => {
            if (firebaseReady) return;

            setChecking(true);
            try {
                // Load Firebase config from environment variables
                const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
                const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
                const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
                const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
                const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
                const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

                if (!apiKey || !projectId) {
                    setLocalError('Firebase credentials not found in environment variables. Please add them to .env.local');
                    setChecking(false);
                    return;
                }

                const config = {
                    apiKey,
                    authDomain: authDomain || `${projectId}.firebaseapp.com`,
                    projectId,
                    storageBucket: storageBucket || `${projectId}.appspot.com`,
                    messagingSenderId,
                    appId,
                };
                initializeFirebase(config);
            } catch (err) {
                console.error('[AuthPage] Firebase init failed:', err.message);
                setLocalError('Failed to initialize Firebase. Check environment variables.');
            } finally {
                setChecking(false);
            }
        };

        initFirebase();
    }, [firebaseReady, initializeFirebase]);

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
        }
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const result = await signIn(formData.email, formData.password);

        if (!result.success) {
            setLocalError(result.error || 'Sign in failed');
        }
    };

    const toggleAuthMode = (mode) => {
        setAuthMode(mode);
        setFormData({ email: '', password: '', displayName: '', confirmPassword: '' });
        setLocalError('');
    };

    return (
        <div className="w-full h-full bg-gradient-to-br from-obsidian via-obsidian to-black flex items-center justify-center relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>

            {/* Main content */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-md px-6"
            >
                {/* Logo/Header */}
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-center mb-12"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent mb-2">
                        VeriBrowse
                    </h1>
                    <p className="text-gray-400 text-sm">AI-Powered Browser Automation</p>
                </motion.div>

                {/* Card */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl"
                >
                    {/* Tabs */}
                    <div className="flex gap-4 mb-8">
                        <button
                            onClick={() => toggleAuthMode('signin')}
                            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-300 ${
                                authMode === 'signin'
                                    ? 'bg-white text-black shadow-lg'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => toggleAuthMode('signup')}
                            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-300 ${
                                authMode === 'signup'
                                    ? 'bg-white text-black shadow-lg'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    {/* Error Message */}
                    <AnimatePresence>
                        {(localError || authError) && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 mb-6"
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
                            className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-3 mb-6"
                        >
                            <Loader size={16} className="text-blue-400 animate-spin" />
                            <p className="text-sm text-blue-300">Initializing Firebase...</p>
                        </motion.div>
                    )}

                    {!checking && !firebaseReady && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 mb-6"
                        >
                            <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-amber-300">Please configure Firebase credentials in .env.local</p>
                        </motion.div>
                    )}

                    {/* Form */}
                    <form onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
                        {authMode === 'signup' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-2"
                            >
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
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                    />
                                </div>
                            </motion.div>
                        )}

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: authMode === 'signup' ? 0.05 : 0 }}
                            className="space-y-2"
                        >
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
                                    className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                />
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: authMode === 'signup' ? 0.1 : 0.05 }}
                            className="space-y-2"
                        >
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Password</label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder="••••••••"
                                    disabled={isLoading || !firebaseReady}
                                    className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </motion.div>

                        {authMode === 'signup' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="space-y-2"
                            >
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Confirm Password</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleInputChange}
                                        placeholder="••••••••"
                                        disabled={isLoading || !firebaseReady}
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-lg pl-10 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-all disabled:opacity-50"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        <motion.button
                            type="submit"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: authMode === 'signup' ? 0.2 : 0.1 }}
                            disabled={isLoading || !firebaseReady || checking}
                            className="w-full h-12 bg-white text-black font-bold rounded-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                        >
                            {isLoading ? (
                                <Loader size={18} className="animate-spin" />
                            ) : (
                                <>
                                    {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                                    {!isLoading && <ArrowRight size={18} />}
                                </>
                            )}
                        </motion.button>
                    </form>
                </motion.div>

                {/* Footer */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-center text-xs text-gray-500 mt-8"
                >
                    Secure authentication powered by Firebase
                </motion.p>
            </motion.div>
        </div>
    );
}
