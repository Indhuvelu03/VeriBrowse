import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useTabStore } from '../store/tabStore';
import { Logo } from './Logo';

const BrowserView = () => {
  const { activeTabId, tabs } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const containerRef = useRef(null);

  // Sync Layout with Electron Main Process
  // We use a ResizeObserver to detect changes in this container's size/position
  useLayoutEffect(() => {
    const updateBounds = () => {
      if (containerRef.current && window.ipc) {
        const rect = containerRef.current.getBoundingClientRect();
        // Send bounds to main process
        // Note: rect.x/y are relative to viewport. Electron setBounds expects relative to window client area.
        // Since we are full screen app usually, clientX/Y match window coords mostly.
        const bounds = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };

        // If dimensions are small (hidden/collapsed), ask to hide/resize to 0
        if (rect.width === 0 || rect.height === 0 || !activeTab) {
          window.ipc.send('view-hide');
        } else {
          window.ipc.send('view-resize', bounds);
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
  }, [activeTab]); // Re-run if active tab changes to ensure we show/hide correctly

  // Navigation is handled via store actions (updateTab, addTab)
  // which send IPC view-load-url. We don't need a useEffect here that
  // re-triggers on every URL state change, as that creates loops.

  // Handle Navigation Actions via IPC
  useEffect(() => {
    if (activeTab?.navigationAction && window.ipc) {
      const { type } = activeTab.navigationAction;
      if (type === 'back') window.ipc.send('view-back');
      if (type === 'forward') window.ipc.send('view-forward');
      if (type === 'reload') window.ipc.send('view-reload');
    }
  }, [activeTab?.navigationAction]);

  // Listen for BrowserView status updates from Main process
  useEffect(() => {
    if (window.ipc) {
      const unsubscribe = window.ipc.on('view-status-updated', (status) => {
        if (activeTabId) {
          // Use syncTab to update state WITHOUT re-triggering IPC navigation
          useTabStore.getState().syncTab(activeTabId, {
            url: status.url,
            title: status.title,
            canGoBack: status.canGoBack,
            canGoForward: status.canGoForward,
          });
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
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
