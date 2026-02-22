'use client';

import React from 'react';
import { useUIStore } from '../store/uiStore';
import {
    X,
    CheckCircle2,
    AlertCircle,
    Info,
    AlertTriangle
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';

export default function ToastNotifications() {
    const { toasts, removeToast } = useUIStore();

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="text-emerald-400" size={18} />;
            case 'error': return <AlertCircle className="text-red-400" size={18} />;
            case 'warning': return <AlertTriangle className="text-amber-400" size={18} />;
            default: return <Info className="text-aurora" size={18} />;
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className="pointer-events-auto"
                    >
                        <div className={clsx(
                            "flex items-center gap-4 px-4 py-3 rounded-2xl glass-panel border border-white/10 shadow-2xl min-w-[280px]"
                        )}>
                            <div className="shrink-0">{getIcon(toast.type)}</div>
                            <p className="text-xs font-semibold text-white/90 flex-1">{toast.message}</p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="p-1 text-metallic/40 hover:text-white rounded-lg hover:bg-white/5"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        {/* Animated Bottom Progress Line */}
                        <motion.div
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: 5, ease: 'linear' }}
                            className="h-[2px] bg-aurora/30 origin-left mt-[-2px] mx-4"
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
