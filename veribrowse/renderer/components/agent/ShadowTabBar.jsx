'use client';

import { Bot, Globe } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';

export default function ShadowTabBar() {
    const { isRunning, agentStatus } = useWorkflowStore();

    if (!isRunning || agentStatus === 'idle') return null;

    return (
        <div className="px-4 py-2 border-t border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2 mb-2">
                <Bot size={14} className="text-blue-400" />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Agent working in background
                </span>
            </div>

            <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full animate-pulse">
                    <Globe size={10} className="text-blue-400" />
                    <span className="text-[10px] text-blue-400 font-medium truncate max-w-[120px]">
                        Shadow Tab Active
                    </span>
                </div>
            </div>
        </div>
    );
}
