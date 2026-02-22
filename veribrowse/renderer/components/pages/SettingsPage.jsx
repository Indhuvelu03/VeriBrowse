'use client';

import React, { useState, useEffect } from 'react';
import { Settings, X, Database, Bot, Save, CheckCircle, Shield, Key } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { motion } from 'framer-motion';

export default function SettingsPage() {
    const { closeOverlays, addToast } = useUIStore();
    const [keys, setKeys] = useState({
        geminiApiKey: '',
        supabaseUrl: '',
        supabaseAnonKey: ''
    });

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
            };
            load();
        }
    }, []);

    const handleSave = () => {
        if (!window.electronAPI?.settings) return;

        // ── Validation (Bug #7 fix) ──────────────────────────────────────────────
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
        // ─────────────────────────────────────────────────────────────────────────

        window.electronAPI.settings.set('geminiApiKey', keys.geminiApiKey);
        window.electronAPI.settings.set('supabaseUrl', keys.supabaseUrl);
        window.electronAPI.settings.set('supabaseAnonKey', keys.supabaseAnonKey);
        addToast('Settings saved successfully ✓', 'success');
        closeOverlays();
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
