import { WebContentsView, Menu, MenuItem, clipboard, BrowserWindow } from 'electron';
import automationService from '../services/AutomationService';
import LayoutManager from './LayoutManager';

export class TabManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.tabs = new Map(); // tabId -> WebContentsView
        this.activeTabId = null;
        this.layoutManager = new LayoutManager(mainWindow, {
            tabs: this.tabs,
            getActiveTabId: () => this.activeTabId,
            setActiveTabId: (tabId) => {
                this.activeTabId = tabId;
            },
        });

        // Listen for resize to update bounds
        this.mainWindow.on('resize', () => {
            this.layoutManager.handleResize();
        });
    }

    setRightSidebarWidth(width) {
        this.layoutManager.setRightSidebarWidth(width);
    }

    setLayoutMode(mode, tabIds = []) {
        this.layoutManager.setLayoutMode(mode, tabIds);
    }

    async createTab(url) {
        const view = new WebContentsView();
        const tabId = Date.now().toString();
        const targetUrl = url || 'about:blank';

        // Set up basic behavior
        view.webContents.on('did-start-loading', () => {
            this.mainWindow.webContents.send('tab:loading-status', { tabId, isLoading: true });
            this.layoutManager.handleTabLoadingStart(tabId, view);
        });

        view.webContents.on('did-stop-loading', () => {
            this.mainWindow.webContents.send('tab:loading-status', { tabId, isLoading: false });
            this.layoutManager.handleTabLoadingStop(tabId, view);
        });

        view.webContents.setWindowOpenHandler(({ url }) => {
            this.createTab(url);
            return { action: 'deny' };
        });

        // Handle Context Menu (Right Click)
        view.webContents.on('context-menu', (event, params) => {
            const menu = new Menu();

            // Image-specific actions
            if (params.mediaType === 'image') {
                menu.append(new MenuItem({
                    label: 'Open Image in New Tab',
                    click: () => this.createTab(params.srcURL)
                }));
                menu.append(new MenuItem({
                    label: 'Open Image in New Window',
                    click: () => {
                        const win = new BrowserWindow({ width: 800, height: 600 });
                        win.loadURL(params.srcURL);
                    }
                }));
                menu.append(new MenuItem({
                    label: 'Save Image As...',
                    click: () => view.webContents.downloadURL(params.srcURL)
                }));
                menu.append(new MenuItem({
                    label: 'Copy Image Address',
                    click: () => clipboard.writeText(params.srcURL)
                }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // Link-specific actions
            if (params.linkURL) {
                menu.append(new MenuItem({
                    label: 'Open Link in New Tab',
                    click: () => this.createTab(params.linkURL)
                }));
                menu.append(new MenuItem({
                    label: 'Copy Link Address',
                    click: () => clipboard.writeText(params.linkURL)
                }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // Standard Browser Actions
            menu.append(new MenuItem({ label: 'Back', click: () => this.goBack(tabId), enabled: view.webContents.canGoBack() }));
            menu.append(new MenuItem({ label: 'Forward', click: () => this.goForward(tabId), enabled: view.webContents.canGoForward() }));
            menu.append(new MenuItem({ label: 'Reload', click: () => this.reloadTab(tabId) }));

            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(new MenuItem({
                label: 'Inspect Element',
                click: () => view.webContents.inspectElement(params.x, params.y)
            }));

            menu.popup({ window: this.mainWindow });
        });

        this.tabs.set(tabId, view);

        // Navigate
        await view.webContents.loadURL(targetUrl);

        // Auto-attach CDP for automation
        try {
            await automationService.attach(view.webContents);
        } catch (e) {
            console.error("CDP Attach failed", e);
        }

        // Switch to this tab
        this.switchTab(tabId);

        return tabId;
    }

    // Method to handle navigation and visibility toggle
    async navigateTab(tabId, url) {
        const view = this.tabs.get(tabId);
        if (!view) return;

        await view.webContents.loadURL(url);

        // If active, re-evaluate visibility
        if (this.activeTabId === tabId) {
            this.layoutManager.updateViewVisibility(view, url);
        }
    }

    switchTab(tabId) {
        if (this.activeTabId === tabId) return;
        const prevTabId = this.activeTabId;
        this.layoutManager.applyActiveTabChange(prevTabId, tabId);
    }

    goBack(tabId) {
        const id = tabId || this.activeTabId;
        const view = this.tabs.get(id);
        if (view && view.webContents.canGoBack()) {
            view.webContents.goBack();
        }
    }

    goForward(tabId) {
        const id = tabId || this.activeTabId;
        const view = this.tabs.get(id);
        if (view && view.webContents.canGoForward()) {
            view.webContents.goForward();
        }
    }

    reloadTab(tabId) {
        const id = tabId || this.activeTabId;
        const view = this.tabs.get(id);
        if (view) {
            view.webContents.reload();
        }
    }

    closeTab(tabId) {
        const view = this.tabs.get(tabId);
        if (!view) return;

        if (this.mainWindow.contentView.children.includes(view)) {
            this.mainWindow.contentView.removeChildView(view);
        }

        if (this.activeTabId === tabId) {
            this.activeTabId = null;
        }

        try {
            automationService.detach(view.webContents);
        } catch (e) { }

        this.tabs.delete(tabId);

        this.layoutManager.handleTabClosed(tabId);
    }

    getActiveTab() {
        return this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    }
}

export default TabManager;
