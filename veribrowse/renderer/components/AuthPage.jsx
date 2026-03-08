'use client';

/**
 * AuthPage
 *
 * A premium authentication card shown before the browser UI loads.
 * Supports Email + Password Sign In and Sign Up.
 * Matches the existing VeriBrowse monochromatic obsidian / white design language.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './Logo';
import { useAuthStore } from '../store/authStore';

export default function AuthPage() {
    const { signIn, signUp, resetPassword, error, setError } = useAuthStore();

    const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const toggleMode = useCallback(() => {
        setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
        setError(null);
        setSuccessMsg('');
        setConfirmPassword('');
    }, [setError]);

    const handleSubmit = useCallback(
        async (e) => {
            e.preventDefault();
            setError(null);
            setSuccessMsg('');

            if (mode === 'forgot') {
                if (!email.trim()) {
                    setError('Please enter your email.');
                    return;
                }
            } else {
                if (!email.trim() || !password.trim()) {
                    setError('Please fill in all fields.');
                    return;
                }

                if (mode === 'signup' && password !== confirmPassword) {
                    setError('Passwords do not match.');
                    return;
                }

                if (password.length < 6) {
                    setError('Password must be at least 6 characters.');
                    return;
                }
            }

            setSubmitting(true);

            try {
                if (mode === 'signin') {
                    const result = await signIn(email, password);
                    if (!result.success) {
                        // error is already set in the store
                    }
                } else if (mode === 'signup') {
                    const result = await signUp(email, password);
                    if (result.success && result.needsConfirmation) {
                        setSuccessMsg(
                            'Account created! Check your email for a confirmation link.'
                        );
                    }
                } else if (mode === 'forgot') {
                    const result = await resetPassword(email);
                    if (result.success) {
                        setSuccessMsg('Password reset link sent! Check your email.');
                    }
                }
            } finally {
                setSubmitting(false);
            }
        },
        [email, password, confirmPassword, mode, signIn, signUp, resetPassword, setError]
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian overflow-hidden">
            {/* ── Ambient background effects (same as HomePage) ──── */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Subtle ambient glows — matching HomePage exactly */}
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full" />
                {/* Subtle grid */}
                <div
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                        backgroundSize: '60px 60px',
                    }}
                />
            </div>

            {/* ── Auth Card ────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-md mx-4"
            >
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)]">
                    {/* ── Logo & Title ──────────────────────────── */}
                    <div className="flex flex-col items-center mb-8">
                        <motion.div
                            initial={{ rotateY: -180, opacity: 0 }}
                            animate={{ rotateY: 0, opacity: 1 }}
                            transition={{
                                type: 'spring',
                                stiffness: 60,
                                damping: 15,
                                delay: 0.2,
                            }}
                        >
                            <Logo size={72} float />
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35, duration: 0.5 }}
                            className="mt-5 text-3xl font-bold tracking-tight text-white"
                        >
                            VeriBrowse
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.5 }}
                            className="mt-1.5 text-[10px] uppercase tracking-[0.4em] text-gray-500 font-bold"
                        >
                            Security Intelligence
                        </motion.p>
                    </div>

                    {/* ── Mode Toggle Tabs ──────────────────────── */}
                    {mode !== 'forgot' && (
                        <div className="flex rounded-xl bg-white/[0.03] p-1 mb-6 border border-white/[0.06]">
                            {['signin', 'signup'].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => {
                                        setMode(m);
                                        setError(null);
                                        setSuccessMsg('');
                                    }}
                                    className={`relative flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${mode === m
                                        ? 'text-white'
                                        : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {mode === m && (
                                        <motion.div
                                            layoutId="auth-tab"
                                            className="absolute inset-0 rounded-lg bg-white/10 border border-white/10"
                                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">
                                        {m === 'signin' ? 'Sign In' : 'Sign Up'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Form ──────────────────────────────────── */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label
                                htmlFor="auth-email"
                                className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-widest pl-1"
                            >
                                Email
                            </label>
                            <input
                                id="auth-email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/20 transition-all duration-200"
                            />
                        </div>

                        {/* Password */}
                        {mode !== 'forgot' && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label
                                        htmlFor="auth-password"
                                        className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1"
                                    >
                                        Password
                                    </label>
                                    {mode === 'signin' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMode('forgot');
                                                setError(null);
                                                setSuccessMsg('');
                                            }}
                                            className="text-[10px] font-bold text-gray-400 hover:text-white transition-colors"
                                        >
                                            Forgot password?
                                        </button>
                                    )}
                                </div>
                                <input
                                    id="auth-password"
                                    type="password"
                                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/20 transition-all duration-200"
                                />
                            </div>
                        )}

                        {/* Confirm Password (sign-up only) */}
                        <AnimatePresence>
                            {mode === 'signup' && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="overflow-hidden"
                                >
                                    <label
                                        htmlFor="auth-confirm"
                                        className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-widest pl-1"
                                    >
                                        Confirm Password
                                    </label>
                                    <input
                                        id="auth-confirm"
                                        type="password"
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/20 transition-all duration-200"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Error message */}
                        <AnimatePresence>
                            {error && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-red-400/90 text-xs bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20"
                                >
                                    {error}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        {/* Success message */}
                        <AnimatePresence>
                            {successMsg && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-green-400/90 text-xs bg-green-500/10 rounded-lg px-3 py-2 border border-green-500/20"
                                >
                                    {successMsg}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        {/* Submit button — matches HomePage's white-on-black CTA */}
                        <motion.button
                            type="submit"
                            disabled={submitting}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${submitting
                                ? 'bg-white/5 text-gray-500 cursor-wait'
                                : 'bg-white text-black hover:scale-[1.02] active:scale-[0.98] shadow-xl'
                                }`}
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg
                                        className="animate-spin h-4 w-4"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"
                                        />
                                    </svg>
                                    {mode === 'signin' ? 'Signing in…' : mode === 'forgot' ? 'Sending reset link…' : 'Creating account…'}
                                </span>
                            ) : mode === 'signin' ? (
                                'Sign In'
                            ) : mode === 'forgot' ? (
                                'Send Reset Link'
                            ) : (
                                'Create Account'
                            )}
                        </motion.button>
                    </form>

                    {/* ── Footer toggle ────────────────────────── */}
                    {mode === 'forgot' ? (
                        <p className="mt-6 text-center text-xs text-gray-500">
                            Remember your password?{' '}
                            <button
                                onClick={() => {
                                    setMode('signin');
                                    setError(null);
                                    setSuccessMsg('');
                                }}
                                className="text-white hover:text-gray-300 transition-colors font-semibold"
                            >
                                Sign In
                            </button>
                        </p>
                    ) : (
                        <p className="mt-6 text-center text-xs text-gray-500">
                            {mode === 'signin'
                                ? "Don't have an account? "
                                : 'Already have an account? '}
                            <button
                                onClick={toggleMode}
                                className="text-white hover:text-gray-300 transition-colors font-semibold"
                            >
                                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                            </button>
                        </p>
                    )}
                </div>

                {/* Card bottom glow line */}
                <div className="mt-4 mx-auto w-32 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </motion.div>
        </div>
    );
}
