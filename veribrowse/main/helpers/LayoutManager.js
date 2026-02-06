export class LayoutManager {
    constructor(mainWindow, tabState) {
        this.mainWindow = mainWindow;
        this.tabState = tabState;
        this.rightSidebarWidth = 0;
        this.layoutMode = 'single';
        this.gridTabIds = [];
        this.bounds = this.calculateBounds();
    }

    calculateBounds() {
        const [width, height] = this.mainWindow.getContentSize();
        return {
            x: 64,
            y: 56,
            width: width - 64 - this.rightSidebarWidth,
            height: height - 56,
        };
    }

    handleResize() {
        this.bounds = this.calculateBounds();
        this.updateActiveViewBounds();
    }

    setRightSidebarWidth(width) {
        this.rightSidebarWidth = width;
        this.bounds = this.calculateBounds();
        this.updateActiveViewBounds();
    }

    setLayoutMode(mode, tabIds = []) {
        this.layoutMode = mode;
        this.gridTabIds = Array.isArray(tabIds) ? tabIds.filter(Boolean) : [];

        if (this.layoutMode === 'grid') {
            this.layoutGridViews();
        } else {
            this.layoutSingleView();
        }
    }

    updateActiveViewBounds() {
        if (this.layoutMode === 'grid') {
            this.layoutGridViews();
            return;
        }

        const activeTabId = this.tabState.getActiveTabId();
        if (activeTabId) {
            const view = this.tabState.tabs.get(activeTabId);
            if (view && this.mainWindow.contentView.children.includes(view)) {
                view.setBounds(this.bounds);
            }
        }
    }

    updateViewVisibility(view, url) {
        if (this.layoutMode === 'grid') {
            return;
        }

        const isHub = !url || url === 'about:blank';
        if (isHub) {
            this.mainWindow.contentView.removeChildView(view);
        } else {
            if (!this.mainWindow.contentView.children.includes(view)) {
                this.mainWindow.contentView.addChildView(view);
            }
            view.setBounds(this.bounds);
        }
    }

    layoutSingleView() {
        const activeTabId = this.tabState.getActiveTabId();
        for (const [tabId, view] of this.tabState.tabs.entries()) {
            if (tabId !== activeTabId && this.mainWindow.contentView.children.includes(view)) {
                this.mainWindow.contentView.removeChildView(view);
            }
        }

        if (activeTabId) {
            const view = this.tabState.tabs.get(activeTabId);
            if (view) {
                this.updateViewVisibility(view, view.webContents.getURL());
            }
        }
    }

    layoutGridViews() {
        const [width, height] = this.mainWindow.getContentSize();
        const gap = 16;
        const padding = 20;
        const availableWidth = Math.max(0, width - 64 - this.rightSidebarWidth - (padding * 2));
        const availableHeight = Math.max(0, height - 56 - (padding * 2));

        const activeTabId = this.tabState.getActiveTabId();
        const tabIds = this.gridTabIds.length ? this.gridTabIds : [activeTabId].filter(Boolean);
        const count = tabIds.length;
        if (!count) return;

        // Smart column/row calculation based on count
        let columns, rows;
        if (count === 1) {
            columns = 1;
            rows = 1;
        } else if (count === 2) {
            columns = 2;
            rows = 1;
        } else if (count <= 4) {
            columns = 2;
            rows = 2;
        } else {
            columns = 3;
            rows = Math.ceil(count / 3);
        }

        const totalGapX = gap * (columns - 1);
        const totalGapY = gap * (rows - 1);
        const tileWidth = Math.floor((availableWidth - totalGapX) / columns);
        const tileHeight = Math.floor((availableHeight - totalGapY) / rows);

        tabIds.forEach((tabId, index) => {
            const view = this.tabState.tabs.get(tabId);
            if (!view) return;

            if (!this.mainWindow.contentView.children.includes(view)) {
                this.mainWindow.contentView.addChildView(view);
            }

            const row = Math.floor(index / columns);
            const col = index % columns;
            const x = 64 + padding + (col * (tileWidth + gap));
            const y = 56 + padding + (row * (tileHeight + gap));

            view.setBounds({
                x,
                y,
                width: tileWidth,
                height: tileHeight,
            });
        });
    }

    handleTabLoadingStart(tabId, view) {
        if (this.layoutMode === 'grid') return;
        if (this.tabState.getActiveTabId() === tabId) {
            this.mainWindow.contentView.removeChildView(view);
        }
    }

    handleTabLoadingStop(tabId, view) {
        if (this.layoutMode === 'grid') {
            this.layoutGridViews();
            return;
        }
        if (this.tabState.getActiveTabId() === tabId) {
            this.updateViewVisibility(view, view.webContents.getURL());
        }
    }

    applyActiveTabChange(prevTabId, nextTabId) {
        if (this.layoutMode === 'grid') {
            this.tabState.setActiveTabId(nextTabId);
            this.layoutGridViews();
            return;
        }

        if (prevTabId) {
            const oldView = this.tabState.tabs.get(prevTabId);
            if (oldView) {
                this.mainWindow.contentView.removeChildView(oldView);
            }
        }

        this.tabState.setActiveTabId(nextTabId);
        const newView = this.tabState.tabs.get(nextTabId);
        if (newView) {
            this.updateViewVisibility(newView, newView.webContents.getURL());
        }
    }

    handleTabClosed(tabId) {
        if (this.layoutMode === 'grid') {
            this.gridTabIds = this.gridTabIds.filter(id => id !== tabId);
        }

        if (this.layoutMode === 'grid') {
            if (this.gridTabIds.length <= 1) {
                const remainingId = this.gridTabIds[0];
                this.layoutMode = 'single';
                this.gridTabIds = [];
                if (!this.tabState.getActiveTabId() && remainingId) {
                    this.tabState.setActiveTabId(remainingId);
                }
                this.layoutSingleView();
            } else {
                this.layoutGridViews();
            }
        }
    }
}

export default LayoutManager;
