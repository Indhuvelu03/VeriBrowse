'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Key, Eye, EyeOff, Save, X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useUIStore } from '../../store/uiStore';

export default function VaultPage() {
    const { closeOverlays } = useUIStore();
    const [keys, setKeys] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [showValues, setShowValues] = useState({}); // key -> boolean

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async () => {
        try {
            const list = await window.electronAPI.agent.vault.list();
            setKeys(list || []);
        } catch (err) {
            console.error('[VaultPage] Load failed:', err);
        }
    };

    const handleAdd = async () => {
        if (!newKey || !newValue) return;
        try {
            await window.electronAPI.agent.vault.set(newKey, newValue);
            setNewKey('');
            setNewValue('');
            setIsAdding(false);
            loadKeys();
        } catch (err) {
            console.error('[VaultPage] Save failed:', err);
        }
    };

    const handleDelete = async (key) => {
        if (!confirm(`Are you sure you want to delete "${key}"?`)) return;
        try {
            await window.electronAPI.agent.vault.delete(key);
            loadKeys();
        } catch (err) {
            console.error('[VaultPage] Delete failed:', err);
        }
    };

    const toggleShowValue = async (key) => {
        if (showValues[key]) {
            setShowValues(prev => ({ ...prev, [key]: false }));
        } else {
            try {
                const val = await window.electronAPI.agent.vault.get(key);
                setShowValues(prev => ({ ...prev, [key]: val }));
            } catch (err) {
                console.error('[VaultPage] Get failed:', err);
            }
        }
    };

    const filteredKeys = keys.filter(k => k.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center p-8 pointer-events-none"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={closeOverlays} />

            {/* Modal */}
            <div className="relative w-full max-w-2xl max-h-[80vh] bg-obsidian border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl text-white">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Secure Vault</h2>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">Encrypted Personal Data</p>
                        </div>
                    </div>
                    <button
                        onClick={closeOverlays}
                        className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search & Actions */}
                <div className="p-6 border-b border-white/5 flex gap-4">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-white transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search keys..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                        />
                    </div>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="px-4 py-2 bg-white text-black rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-200 transition-all"
                    >
                        <Plus size={16} />
                        Add New
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                    {isAdding && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-4 mb-6"
                        >
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Identifier (Key)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Full Name"
                                        value={newKey}
                                        onChange={(e) => setNewKey(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Value (Encrypted)</label>
                                    <input
                                        type="password"
                                        placeholder="e.g. John Doe"
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdd}
                                    className="px-6 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all border border-white/5"
                                >
                                    Save to Vault
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {filteredKeys.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-center opacity-20">
                            <Key size={32} className="mb-2" />
                            <p className="text-xs font-bold uppercase tracking-widest">No entries found</p>
                        </div>
                    ) : (
                        filteredKeys.map(key => (
                            <div key={key} className="group bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all p-4 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 bg-white/5 rounded-xl text-gray-400 group-hover:text-white transition-colors">
                                        <Key size={18} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">{key}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-gray-600 font-mono">
                                                {showValues[key] ? showValues[key] : '••••••••••••'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => toggleShowValue(key)}
                                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                                        title={showValues[key] ? "Hide" : "Reveal"}
                                    >
                                        {showValues[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(key)}
                                        className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Message */}
                <div className="p-4 bg-white/[0.01] border-t border-white/5 text-center">
                    <p className="text-[9px] text-gray-600 uppercase tracking-tighter flex items-center justify-center gap-2">
                        <Shield size={10} />
                        All data is encrypted using your OS keychain. VeriBrowse never sees plain-text values.
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
