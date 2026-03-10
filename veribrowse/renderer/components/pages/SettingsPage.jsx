'use client';

import React, { useState, useEffect } from 'react';
<<<<<<< Updated upstream
import { Settings, X, Database, Bot, Save, CheckCircle, Shield, Key, User, Mail, Phone, Lock, AtSign, Calendar, MapPin, CreditCard } from 'lucide-react';
=======
import { Settings, X, Database, Bot, Save, CheckCircle, Shield, Key } from 'lucide-react';
>>>>>>> Stashed changes
import { useUIStore } from '../../store/uiStore';
import { motion } from 'framer-motion';

export default function SettingsPage() {
    const { closeOverlays, addToast } = useUIStore();
    const [keys, setKeys] = useState({
        geminiApiKey: '',
        supabaseUrl: '',
        supabaseAnonKey: ''
    });
<<<<<<< Updated upstream
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        phone: '',
        username: '',
        password: '',
        dob: '',
        gender: '',
        city: '',
        idNumber: '',
    });
=======
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(false);
>>>>>>> Stashed changes

    useEffect(() => {
        if (window.electronAPI?.settings) {
            const load = async () => {
                const gKey = await window.electronAPI.settings.get('geminiApiKey');
                const sUrl = await window.electronAPI.settings.get('supabaseUrl');
                const sAKey = await window.electronAPI.settings.get('supabaseAnonKey');
                setKeys({
                    geminiApiKey: gKey || '',
                    supabaseUrl: sUrl || '',
                    supabaseAnonKey: sAKey || ''
                });

                if (window.electronAPI.auth) {
                    const currentUser = await window.electronAPI.auth.getState();
                    setUser(currentUser);
                }
            };
            load();
        }
        if (window.electronAPI?.profile) {
            window.electronAPI.profile.get().then((saved) => {
                if (saved && typeof saved === 'object') {
                    setProfile(p => ({ ...p, ...saved }));
                }
            });
        }
    }, []);

    const handleSave = () => {
        if (!window.electronAPI?.settings) return;

        // ── Validation ──────────────────────────────────────────────────────────
        const errors = [];

        if (keys.geminiApiKey && !keys.geminiApiKey.startsWith('AIza')) {
            errors.push('Gemini API Key looks invalid — it should start with "AIza".');
        }

        if (keys.supabaseUrl && !/^https?:\/\/.+\.supabase\.co/.test(keys.supabaseUrl)) {
            errors.push('Supabase URL should be in the form https://your-project.supabase.co');
        }

        if (keys.supabaseUrl && !keys.supabaseAnonKey) {
            errors.push('Supabase Anon Key is required when a Supabase URL is provided.');
        }

        if (errors.length > 0) {
            errors.forEach((msg) => addToast(msg, 'error'));
            return;
        }
        // ────────────────────────────────────────────────────────────────────────

        window.electronAPI.settings.set('geminiApiKey', keys.geminiApiKey);
        window.electronAPI.settings.set('supabaseUrl', keys.supabaseUrl);
        window.electronAPI.settings.set('supabaseAnonKey', keys.supabaseAnonKey);

        if (window.electronAPI?.profile) {
            window.electronAPI.profile.set(profile);
        }

        addToast('Settings saved successfully ✓', 'success');
        closeOverlays();
    };

    const handleAuthAction = async (action) => {
        if (!window.electronAPI?.auth) return;
        setAuthLoading(true);
        try {
            if (action === 'signOut') {
                await window.electronAPI.auth.signOut();
                setUser(null);
                addToast('Signed out successfully', 'success');
            } else {
                if (!authEmail || !authPassword) {
                    addToast('Please enter both email and password', 'error');
                    setAuthLoading(false);
                    return;
                }
                const res = action === 'signIn'
                    ? await window.electronAPI.auth.signIn(authEmail, authPassword)
                    : await window.electronAPI.auth.signUp(authEmail, authPassword);

                if (res.error) {
                    addToast(res.error, 'error');
                } else if (res.user) {
                    setUser(res.user);
                    addToast(`Successfully ${action === 'signIn' ? 'logged in' : 'signed up'}!`, 'success');
                    setAuthEmail('');
                    setAuthPassword('');
                }
            }
        } catch (e) {
            addToast(e.message || 'Authentication error', 'error');
        } finally {
            setAuthLoading(false);
        }
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
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">System Configuration</h2>
                </div>

                <button
                    onClick={closeOverlays}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full space-y-12">

                {/* Auth Profile */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Bot size={16} className="text-purple-500" />
                        </div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">Auth Profile</h3>
                    </div>

                    <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        {user ? (
                            <div className="flex flex-col gap-4">
                                <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/10 flex items-center gap-3">
                                    <CheckCircle size={14} className="text-green-500" />
                                    <p className="text-[12px] text-green-400">Logged in as: <span className="font-bold">{user.email}</span></p>
                                </div>
                                <button
                                    onClick={() => handleAuthAction('signOut')}
                                    disabled={authLoading}
                                    className="h-10 w-32 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {authLoading ? 'Signing Out...' : 'Sign Out'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-4">
                                <input
                                    type="email"
                                    value={authEmail}
                                    onChange={(e) => setAuthEmail(e.target.value)}
                                    placeholder="Email Address"
                                    className="flex-1 h-12 bg-black/40 border border-white/5 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all font-mono"
                                />
                                <input
                                    type="password"
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    placeholder="Password"
                                    className="flex-1 h-12 bg-black/40 border border-white/5 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all font-mono"
                                />
                                <button
                                    onClick={() => handleAuthAction('signIn')}
                                    disabled={authLoading}
                                    className="px-6 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    Log In
                                </button>
                                <button
                                    onClick={() => handleAuthAction('signUp')}
                                    disabled={authLoading}
                                    className="px-6 border border-white/20 hover:bg-white/5 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    Sign Up
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* AI Profile */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Bot size={16} className="text-blue-500" />
                        </div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">Intelligence Profile</h3>
                    </div>

                    <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Gemini API Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                                <input
                                    type="password"
                                    value={keys.geminiApiKey}
                                    onChange={(e) => setKeys({ ...keys, geminiApiKey: e.target.value })}
                                    placeholder="Paste Gemini API Key..."
                                    className="w-full h-12 bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                />
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center gap-3">
                            <Shield size={14} className="text-blue-500" />
                            <p className="text-[10px] text-blue-300 opacity-60">Verified with Google Gemini 2.0 Flash</p>
                        </div>
                    </div>
                </section>

                {/* Database Profile */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Database size={16} className="text-emerald-500" />
                        </div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">Knowledge Core</h3>
                    </div>

                    <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Supabase URL</label>
                            <input
                                type="text"
                                value={keys.supabaseUrl}
                                onChange={(e) => setKeys({ ...keys, supabaseUrl: e.target.value })}
                                placeholder="https://your-project.supabase.co"
                                className="w-full h-12 bg-black/40 border border-white/5 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Anon Public Key</label>
                            <input
                                type="password"
                                value={keys.supabaseAnonKey}
                                onChange={(e) => setKeys({ ...keys, supabaseAnonKey: e.target.value })}
                                placeholder="Paste Supabase Anon Key..."
                                className="w-full h-12 bg-black/40 border border-white/5 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all font-mono"
                            />
                        </div>
                    </div>
                </section>

                {/* User Profile / Credentials */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <User size={16} className="text-violet-400" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">User Profile &amp; Credentials</h3>
                            <p className="text-[10px] text-gray-600 mt-0.5">Saved details are injected automatically when the agent fills login or signup forms.</p>
                        </div>
                    </div>

                    <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Full Name */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="text"
                                        value={profile.name}
                                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                        placeholder="John Doe"
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Phone */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Phone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="tel"
                                        value={profile.phone}
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                        placeholder="+1 555 000 0000"
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                <input
                                    type="email"
                                    value={profile.email}
                                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                    placeholder="you@example.com"
                                    className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Username */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Username</label>
                                <div className="relative">
                                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="text"
                                        value={profile.username}
                                        onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                                        placeholder="johndoe"
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="password"
                                        value={profile.password}
                                        onChange={(e) => setProfile({ ...profile, password: e.target.value })}
                                        placeholder="••••••••"
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Booking details label */}
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest pt-2">Booking Details</p>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Date of Birth */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Date of Birth</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="date"
                                        value={profile.dob}
                                        onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Gender */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Gender</label>
                                <select
                                    value={profile.gender}
                                    onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                                    className="w-full h-11 bg-black/40 border border-white/5 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all appearance-none"
                                >
                                    <option value="">Select…</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Home City */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Home City</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="text"
                                        value={profile.city}
                                        onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                                        placeholder="Mumbai"
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* ID Number */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">ID / Passport / Aadhaar</label>
                                <div className="relative">
                                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="text"
                                        value={profile.idNumber}
                                        onChange={(e) => setProfile({ ...profile, idNumber: e.target.value })}
                                        placeholder="Passport / Aadhaar / PAN"
                                        className="w-full h-11 bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10 flex items-center gap-3">
                            <Shield size={14} className="text-violet-400" />
                            <p className="text-[10px] text-violet-300 opacity-60">Stored locally on your device. Never sent to any server.</p>
                        </div>
                    </div>
                </section>

                {/* Save Footer */}
                <div className="pt-8">
                    <button
                        onClick={handleSave}
                        className="w-full h-14 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
                    >
                        <Save size={20} /> Save Configurations
                    </button>
                </div>

            </div>
        </motion.div>
    );
}
