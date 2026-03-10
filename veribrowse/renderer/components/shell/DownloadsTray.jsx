'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, File, FileCheck, AlertCircle, FolderOpen, Pause, Play } from 'lucide-react';

export default function DownloadsTray() {
    const [downloads, setDownloads] = useState(new Map());

    useEffect(() => {
        if (!window.electronAPI) return;

        const handleProgress = (data) => {
            setDownloads(prev => {
                const next = new Map(prev);
                next.set(data.id, { ...next.get(data.id), ...data, timestamp: Date.now() });
                return next;
            });
        };

        const handleCompleted = (data) => {
            setDownloads(prev => {
                const next = new Map(prev);
                next.set(data.id, { ...next.get(data.id), ...data, timestamp: Date.now() });
                return next;
            });
            // Auto hide after 5 seconds if completed/cancelled
            setTimeout(() => {
                setDownloads(prev => {
                    const next = new Map(prev);
                    next.delete(data.id);
                    return next;
                });
            }, 5000);
        };

        window.electronAPI.on('browser:download-progress', handleProgress);
        window.electronAPI.on('browser:download-completed', handleCompleted);

        return () => {
            window.electronAPI.off('browser:download-progress', handleProgress);
            window.electronAPI.off('browser:download-completed', handleCompleted);
        };
    }, []);

    const activeDownloads = Array.from(downloads.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3); // show max 3 floating at once

    const openFolder = (path) => {
        if (window.electronAPI?.downloads && path) {
            window.electronAPI.downloads.showInFolder(path);
        }
    };

    const handleDismiss = (id) => {
        setDownloads(prev => {
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    };

    if (activeDownloads.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {activeDownloads.map((dl) => {
                    const isCompleted = dl.state === 'completed';
                    const isError = dl.state === 'cancelled' || dl.state === 'interrupted';
                    const isPaused = dl.state === 'paused';

                    let progress = 0;
                    if (dl.totalBytes && dl.receivedBytes) {
                        progress = Math.round((dl.receivedBytes / dl.totalBytes) * 100);
                    }

                    return (
                        <motion.div
                            key={dl.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className="bg-obsidian border border-white/10 shadow-2xl shadow-black rounded-xl p-3 w-80 pointer-events-auto flex gap-3 relative overflow-hidden"
                            layout
                        >
                            {/* Background progress bar */}
                            {!isCompleted && !isError && (
                                <div
                                    className="absolute inset-0 bg-blue-500/10 pointer-events-none transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            )}

                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 z-10">
                                {isCompleted ? (
                                    <FileCheck className="text-emerald-400" size={20} />
                                ) : isError ? (
                                    <AlertCircle className="text-red-400" size={20} />
                                ) : (
                                    <File className="text-blue-400 animate-pulse" size={20} />
                                )}
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-center z-10">
                                <h4 className="text-xs font-semibold text-white truncate" title={dl.fileName}>
                                    {dl.fileName}
                                </h4>
                                <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                                    {isCompleted ? (
                                        <span className="text-emerald-400/80">Completed</span>
                                    ) : isError ? (
                                        <span className="text-red-400/80 capitalize">{dl.state}</span>
                                    ) : isPaused ? (
                                        <span className="text-yellow-400/80">Paused</span>
                                    ) : (
                                        <span className="tabular-nums">
                                            {dl.receivedBytes ? `${(dl.receivedBytes / 1024 / 1024).toFixed(1)} MB` : 'Calculating...'}
                                            {dl.totalBytes ? ` / ${(dl.totalBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-1 z-10">
                                {isCompleted && dl.savePath && (
                                    <button
                                        onClick={() => openFolder(dl.savePath)}
                                        className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors"
                                        title="Show in folder"
                                    >
                                        <FolderOpen size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDismiss(dl.id)}
                                    className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors"
                                    title="Dismiss"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
