'use client';

import React from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import { clsx } from 'clsx';

export default function CreditMeter() {
    const { creditsUsed } = useWorkflowStore();
    const limit = 300;
    const percentage = Math.min((creditsUsed / limit) * 100, 100);

    return (
        <div className="px-4 py-1.5 border-t border-white/5 flex items-center gap-3">
            <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest shrink-0">
                Compute
            </span>
            <div className="flex-1 h-[3px] bg-white/5 rounded-full overflow-hidden">
                <div
                    className={clsx(
                        "h-full transition-all duration-500",
                        percentage > 80 ? "bg-red-400" : percentage > 50 ? "bg-amber-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className={clsx(
                "text-[9px] font-bold tracking-tighter shrink-0",
                percentage > 80 ? "text-red-400" : percentage > 50 ? "text-amber-400" : "text-emerald-400"
            )}>
                {creditsUsed}/{limit}
            </span>
        </div>
    );
}
