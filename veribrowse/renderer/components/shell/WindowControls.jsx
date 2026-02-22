'use client';

import React, { useState } from 'react';
import { X, Minus, Maximize2 } from 'lucide-react';

export default function WindowControls() {
    const [hover, setHover] = useState(false);

    const handleAction = (action) => {
        console.log(`[WindowControls] Requested action: ${action}`);
        if (!window.electronAPI) {
            console.error('[WindowControls] electronAPI not found on window');
            return;
        }

        switch (action) {
            case 'close': window.electronAPI.window.close(); break;
            case 'minimize': window.electronAPI.window.minimize(); break;
            case 'maximize': window.electronAPI.window.maximize(); break;
        }
    };

    return (
        <div
            className="h-full flex items-center gap-0 pr-2 pointer-events-auto no-drag"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {/* Minimize */}
            <button
                onClick={() => handleAction('minimize')}
                className="w-10 h-10 hover:bg-white/[0.05] flex items-center justify-center transition-colors group"
                title="Minimize"
            >
                <div className="w-3 h-[1px] bg-gray-400 group-hover:bg-white" />
            </button>

            {/* Maximize */}
            <button
                onClick={() => handleAction('maximize')}
                className="w-10 h-10 hover:bg-white/[0.05] flex items-center justify-center transition-colors group"
                title="Toggle Maximize"
            >
                <div className="w-3 h-3 border border-gray-400 group-hover:border-white rounded-[1px]" />
            </button>

            {/* Close */}
            <button
                onClick={() => handleAction('close')}
                className="w-11 h-10 hover:bg-red-500 flex items-center justify-center transition-colors group"
                title="Close"
            >
                <X size={16} className="text-gray-400 group-hover:text-white" />
            </button>
        </div>
    );
}
