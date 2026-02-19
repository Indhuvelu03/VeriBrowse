'use client';

import React from 'react';
import Siderail from '../Siderail';
import Topbar from '../Topbar';
import { useUIStore } from '../../store/uiStore';

export default function UILayer() {
    const sidebarMode = useUIStore((state) => state.sidebarMode);
    const sidebarOpen = sidebarMode !== 'hidden';

    return (
        <div className="absolute inset-0 z-[50] pointer-events-none">

            {/* Siderail - Left edge (Fixed) */}
            <div className="absolute top-0 left-0 bottom-0 w-[80px] pointer-events-auto">
                <Siderail />
            </div>

            {/* Topbar - Top edge (Dynamic) */}
            <div
                className="absolute top-0 left-[80px] h-[60px] pointer-events-auto transition-[right] duration-300 ease-in-out"
                style={{ right: sidebarOpen ? '420px' : '0px' }}
            >
                <Topbar />
            </div>

        </div>
    );
}
