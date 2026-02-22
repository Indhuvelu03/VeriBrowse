'use client';

import React, { useState, useEffect } from 'react';
import {
    X,
    Key,
    Database,
    Save,
    CheckCircle2,
    ExternalLink,
    Eye,
    EyeOff,
    AlertTriangle,
    Bot
} from 'lucide-react';
import { useUIStore } from '../store/useUIStore';

export default function SettingsModal() {
    const { isSettingsOpen, setSettingsOpen, addToast } = useUIStore();
    const [showKey, setShowKey] = useState(false);

    const [keys, setKeys] = useState({
        geminiApiKey: '',
        supabaseUrl: '',
        supabaseAnonKey: ''
    });

    useEffect(() => {
        if (isSettingsOpen && window.electronAPI?.settings) {
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
    }, [isSettingsOpen]);

    const handleSave = () => {
        if (!window.electronAPI?.settings) return;

        window.electronAPI.settings.set('geminiApiKey', keys.geminiApiKey);
        window.electronAPI.settings.set('supabaseUrl', keys.supabaseUrl);
        window.electronAPI.settings.set('supabaseAnonKey', keys.supabaseAnonKey);

        addToast('Settings saved successfully', 'success');
        setSettingsOpen(false);
    };

    if (!isSettingsOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-md glass-panel rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="text-aurora" size={18} />
                        <h2 className="font-bold text-white">System Config</h2>
                    </div>
                    <button onClick={() => setSettingsOpen(false)} className="text-metallic/40 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">

                    {/* Gemini Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-metallic/40 uppercase tracking-widest flex items-center gap-2">
                                <Bot size={14} /> Gemini 2.0 API Profile
                            </label>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-[10px] text-aurora hover:underline flex items-center gap-1">
                                Get Key <ExternalLink size={10} />
                            </a>
                        </div>
                        <div className="relative space-y-2">
                            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs text-metallic/40">
                                <Bot size={14} className="text-aurora" />
                                <span>Model: <span className="text-white font-mono">gemini-2.0-flash</span></span>
                            </div>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-metallic/20" size={16} />
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    className="w-full h-10 bg-white/5 border border-white/5 rounded-xl pl-10 pr-10 text-sm focus:outline-none focus:border-aurora/50 transition-all text-metallic"
                                    placeholder="Paste Gemini API Key..."
                                    value={keys.geminiApiKey}
                                    onChange={(e) => setKeys({ ...keys, geminiApiKey: e.target.value })}
                                />
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-metallic/20 hover:text-metallic transition-colors"
                                >
                                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Supabase Section */}
                    <div className="space-y-4 pt-4 border-t border-white/5">
                        <label className="text-xs font-bold text-metallic/40 uppercase tracking-widest flex items-center gap-2">
                            <Database size={14} /> Knowledge Core (Supabase)
                        </label>
                        <div className="space-y-2">
                            <input
                                type="text"
                                className="w-full h-10 bg-white/5 border border-white/5 rounded-xl px-4 text-sm focus:outline-none focus:border-aurora/50 transition-all text-metallic font-mono"
                                placeholder="Supabase Project URL"
                                value={keys.supabaseUrl}
                                onChange={(e) => setKeys({ ...keys, supabaseUrl: e.target.value })}
                            />
                            <input
                                type="password"
                                className="w-full h-10 bg-white/5 border border-white/5 rounded-xl px-4 text-sm focus:outline-none focus:border-aurora/50 transition-all text-metallic font-mono"
                                placeholder="Supabase Anon Key"
                                value={keys.supabaseAnonKey}
                                onChange={(e) => setKeys({ ...keys, supabaseAnonKey: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-aurora/10 border border-aurora/20 flex items-start gap-3">
                        <AlertTriangle className="text-aurora shrink-0" size={16} />
                        <p className="text-[10px] text-metallic/60 leading-normal">
                            VeriBrowse stores these keys locally using Electron Store. They are never sent to external servers except for direct API calls to Google and Supabase.
                        </p>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 bg-white/5 border-t border-white/5 flex gap-3">
                    <button
                        onClick={() => setSettingsOpen(false)}
                        className="flex-1 h-11 rounded-xl border border-white/5 text-metallic font-medium hover:bg-white/5 transition-all"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 h-11 rounded-xl bg-aurora text-white font-bold flex items-center justify-center gap-2 hover:bg-aurora/80 active:scale-95 transition-all"
                    >
                        <Save size={18} /> Save Core
                    </button>
                </div>

            </div>
        </div>
    );
}
