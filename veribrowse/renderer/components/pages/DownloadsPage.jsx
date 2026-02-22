'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, File, ArrowRight, Trash2, FolderOpen } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { motion } from 'framer-motion';

export default function DownloadsPage() {
    const { closeOverlays } = useUIStore();
    const [downloads, setDownloads] = useState([]);

    useEffect(() => {
        if (window.electronAPI?.downloads) {
            window.electronAPI.downloads.get().then(setDownloads).catch(() => setDownloads([]));
        }
    }, []);

    const openFolder = (path) => {
        if (window.electronAPI?.downloads) window.electronAPI.downloads.showInFolder(path);
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
                    <Download className="text-gray-400" size={20} />
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">Downloads</h2>
                </div>

                <button
                    onClick={closeOverlays}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
                <div className="space-y-4">
                    {downloads.length > 0 ? downloads.map((item, i) => (
                        <div
                            key={i}
                            className="w-full flex items-center gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5 group transition-all"
                        >
                            <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center shrink-0">
                                <File size={22} className="text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-gray-200 truncate">{item.filename}</h4>
                                <p className="text-xs text-gray-600 truncate mt-0.5">{item.source_url}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => openFolder(item.saved_path)}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                    title="Open Folder"
                                >
                                    <FolderOpen size={18} />
                                </button>
                                <button
                                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-lg transition-all"
                                    title="Remove"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Download size={48} className="mb-4" />
                            <p className="text-sm font-bold uppercase tracking-widest">No downloads found</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
