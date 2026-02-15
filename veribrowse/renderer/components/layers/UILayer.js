'use client';

import React from 'react';
import Siderail from '../Siderail';
import Topbar from '../Topbar';

export default function UILayer() {
    return (
        <div className="absolute inset-0 z-[20] pointer-events-none">

            {/* Siderail - Left edge */}
            <div className="absolute top-0 left-0 bottom-0 w-[80px] pointer-events-auto">
                <Siderail />
            </div>

            {/* Topbar - Top edge */}
            {/* 
         Note: We offset left by 80px to sit next to siderail.
         This keeps the topbar from covering the siderail if siderail has z-index issues, 
         but conceptually siderail is full height.
       */}
            <div className="absolute top-0 left-[80px] right-0 h-[60px] pointer-events-auto">
                <Topbar />
            </div>

        </div>
    );
}
