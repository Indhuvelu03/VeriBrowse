'use client';

import React, { useEffect, useRef } from 'react';
import { useTabStore } from '../../store/tabStore';
import { useUIStore } from '../../store/uiStore';

// Must match AgentPanel.jsx's `w-[420px]` width exactly.
// The Electron BrowserView is a NATIVE layer that renders on top of all renderer
// DOM — z-index cannot hide it. The only way to reveal the Agent Panel is to
// shrink the BrowserView's right boundary when the panel is open.
const AGENT_PANEL_WIDTH = 420;

// Pages that show as full overlays — native view must be hidden while they're open.
const OVERLAY_PAGES = new Set(['history', 'downloads', 'settings', 'skills']);

export default function BrowserLayer() {
    const { activeTabId, userTabs } = useTabStore();
    const { agentPanelOpen, activeView, currentPage } = useUIStore();
    const containerRef = useRef(null);

    // Any overlay page (history, downloads, settings, skills) must hide the
    // native view — it's an OS-level layer that ignores DOM z-index.
    const overlayOpen = OVERLAY_PAGES.has(currentPage);

    // Store agentPanelOpen in a ref so ResizeObserver callback always sees the
    // current value without needing to be re-registered.
    const agentPanelOpenRef = useRef(agentPanelOpen);
    const prevAgentPanelOpen = useRef(agentPanelOpen);
    useEffect(() => { agentPanelOpenRef.current = agentPanelOpen; }, [agentPanelOpen]);

    const activeTab = userTabs.find(t => t.id === activeTabId);
    const hasUrl = activeTab && activeTab.url && activeTab.url !== 'about:blank';

    useEffect(() => {
        if (!activeTabId || !window.electronAPI?.browser) return;

        if (!hasUrl || activeView !== 'browser' || overlayOpen) {
            // Hide the native BrowserView so home page / overlays / agent panel show through
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

        const panelJustClosed = prevAgentPanelOpen.current && !agentPanelOpen;
        prevAgentPanelOpen.current = agentPanelOpen;

        if (panelJustClosed) {
            // Panel is animating OUT (250ms) — wait until it's fully gone before
            // expanding the native view, otherwise the native layer bleeds through.
            const timeout = setTimeout(updateBounds, 280);
            return () => { observer.disconnect(); clearTimeout(timeout); };
        }

        // Panel opened or unrelated change — resize immediately, then again after
        // any CSS transition settles.
        updateBounds();
        const timeout = setTimeout(updateBounds, 300);

        return () => {
            observer.disconnect();
            clearTimeout(timeout);
        };
    }, [activeTabId, agentPanelOpen, activeView, hasUrl, overlayOpen]);

    // Only render placeholder div when there is a real URL to display
    if (!hasUrl || activeView !== 'browser' || overlayOpen) return null;

    return (
        <div
            ref={containerRef}
            id="browser-viewport"
            className="flex-1 w-full h-full relative bg-obsidian"
        />
    );
}

