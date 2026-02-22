'use client';

import React from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import { clsx } from 'clsx';

export default function CreditMeter() {
    const { creditsUsed } = useWorkflowStore();
    const limit = 300;
    const percentage = Math.min((creditsUsed / limit) * 100, 100);

    return (
        <div className="px-4 py-3 bg-white/[0.02] border-t border-white/5">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 py-0.5 bg-white/5 rounded">
                    Compute Usage
                </span>
                <span className={clsx(
                    "text-[10px] font-bold tracking-tighter",
                    percentage > 80 ? "text-red-400" : percentage > 50 ? "text-amber-400" : "text-emerald-400"
                )}>
                    {creditsUsed} / {limit} Units
                </span>
            </div>

            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                    className={clsx(
                        "h-full transition-all duration-500",
                        percentage > 80 ? "bg-red-400" : percentage > 50 ? "bg-amber-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
