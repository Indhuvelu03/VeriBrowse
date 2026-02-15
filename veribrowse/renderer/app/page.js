'use client';

import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Splash } from '../components/Splash';
import BrowserLayer from '../components/layers/BrowserLayer';
import ChatLayer from '../components/layers/ChatLayer';
import UILayer from '../components/layers/UILayer';

export default function HomePage() {
    const [loading, setLoading] = useState(true);

    return (
        <>
            <AnimatePresence mode="wait">
                {loading && <Splash onComplete={() => setLoading(false)} />}
            </AnimatePresence>

            {!loading && (
                <main className="relative w-screen h-screen overflow-hidden bg-obsidian text-white font-sans antialiased selection:bg-blue-500/30">

                    {/* Layer 1: Browser (Bottom) */}
                    <BrowserLayer />

                    {/* Layer 2: Chat Overlay (Middle) */}
                    <ChatLayer />

                    {/* Layer 3: UI Controls (Top) */}
                    <UILayer />

                </main>
            )}
        </>
    );
}
