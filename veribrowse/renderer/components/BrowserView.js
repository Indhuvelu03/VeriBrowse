import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useTabStore } from '../store/tabStore';
import { Logo } from './Logo';
import { browser } from '../lib/ipc';
import { useUIStore } from '../store/uiStore';

const BrowserView = () => {
  const { activeTabId, tabs } = useTabStore();
  const chatOpen = useUIStore((state) => state.chatOpen);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const containerRef = useRef(null);

  // Sync Layout with Electron Main Process
  // We use a ResizeObserver to detect changes in this container's size/position
  useLayoutEffect(() => {
    const updateBounds = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const bounds = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };

        if (rect.width === 0 || rect.height === 0 || !activeTab) {
          browser.hide();
        } else {
          browser.resize(bounds);
        }
      }
    };

    updateBounds();

    const observer = new ResizeObserver(() => {
      updateBounds();
    });

    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', updateBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [activeTab, chatOpen]); // Re-run if active tab or chat panel changes

  // Navigation is handled via store actions (updateTab, addTab)
  // which send IPC view-load-url. We don't need a useEffect here that
  // re-triggers on every URL state change, as that creates loops.

  // Handle Navigation Actions via IPC
  useEffect(() => {
    if (activeTab?.navigationAction) {
      const { type } = activeTab.navigationAction;
      if (type === 'back') browser.goBack();
      if (type === 'forward') browser.goForward();
      if (type === 'reload') browser.refresh();
    }
  }, [activeTab?.navigationAction]);

  // Listen for BrowserView status updates from Main process
  useEffect(() => {
    const unsubscribeStatus = browser.onStatusUpdate((status) => {
      if (activeTabId) {
        useTabStore.getState().syncTab(activeTabId, {
          url: status.url,
          title: status.title,
          canGoBack: status.canGoBack,
          canGoForward: status.canGoForward,
        });
      }
    });

    // Handle remote tab creation (e.g. from Agent)
    const unsubscribeAdd = browser.onAddTab((tab) => {
      console.log('[Renderer] Remote add-tab received:', tab);
      useTabStore.getState().addTab({
        ...tab,
        id: tab.id || `tab-${Date.now()}`,
        isAgent: true
      });
    });

    return () => {
      if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
      if (typeof unsubscribeAdd === 'function') unsubscribeAdd();
    };
  }, [activeTabId]);

  const hasValidUrl = activeTab && activeTab.url && activeTab.url !== 'about:blank';

  return (
    <div className="w-full h-full overflow-hidden bg-obsidian relative">
      {/* 
         This div acts as the placeholder/anchor.
         The actual BrowserView will be painted ON TOP of this area by Electron.
         We can show a loading state 'behind' it (or if view is transparent initially).
      */}
      <div ref={containerRef} className="w-full h-full" />

      {!hasValidUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Background standby state if no URL */}
          <Logo size={40} className="opacity-20 translate-y-[-20px]" />
        </div>
      )}
    </div>
  );
};

export default BrowserView;
