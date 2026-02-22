'use client';

import React, { useEffect, useRef } from 'react';
import { useTabStore } from '../../store/tabStore';
import { useUIStore } from '../../store/uiStore';

// Must match AgentPanel.jsx's `w-[420px]` width exactly.
// The Electron BrowserView is a NATIVE layer that renders on top of all renderer
// DOM — z-index cannot hide it. The only way to reveal the Agent Panel is to
// shrink the BrowserView's right boundary when the panel is open.
const AGENT_PANEL_WIDTH = 420;

export default function BrowserLayer() {
    const { activeTabId, userTabs } = useTabStore();
    const { agentPanelOpen, activeView } = useUIStore();
    const containerRef = useRef(null);

    // Store agentPanelOpen in a ref so ResizeObserver callback always sees the
    // current value without needing to be re-registered.
    const agentPanelOpenRef = useRef(agentPanelOpen);
    useEffect(() => { agentPanelOpenRef.current = agentPanelOpen; }, [agentPanelOpen]);

    const activeTab = userTabs.find(t => t.id === activeTabId);
    const hasUrl = activeTab && activeTab.url && activeTab.url !== 'about:blank';

    useEffect(() => {
        if (!activeTabId || !window.electronAPI?.browser) return;

        if (!hasUrl || activeView !== 'browser') {
            // Hide the native BrowserView so home page / agent panel / overlays show through
            window.electronAPI.browser.hideViewport(activeTabId);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        const updateBounds = () => {
            const rect = container.getBoundingClientRect();
            // When the Agent Panel is open, subtract its width from the right side
            // so the native BrowserView doesn't cover the panel.
            const panelOffset = agentPanelOpenRef.current ? AGENT_PANEL_WIDTH : 0;
            window.electronAPI.browser.resizeViewport(activeTabId, {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width) - panelOffset,
                height: Math.round(rect.height)
            });
        };

        const observer = new ResizeObserver(updateBounds);
        observer.observe(container);
        updateBounds();

        // Re-run after CSS panel open/close transition completes (300ms)
        const timeout = setTimeout(updateBounds, 350);

        return () => {
            observer.disconnect();
            clearTimeout(timeout);
        };
    }, [activeTabId, agentPanelOpen, activeView, hasUrl]);

    // Only render placeholder div when there is a real URL to display
    if (!hasUrl || activeView !== 'browser') return null;

    return (
        <div
            ref={containerRef}
            id="browser-viewport"
            className="flex-1 w-full h-full relative bg-obsidian"
        />
    );
}

