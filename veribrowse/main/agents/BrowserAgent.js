import bus from '../core/EventBus.js';
import { attachStateSync } from '../core/StateSync.js';
import navigate from '../tools/browser/navigate.js';
import click from '../tools/browser/click.js';
import type from '../tools/browser/type.js';
import scroll from '../tools/browser/scroll.js';
import extract from '../tools/browser/extract.js';
import screenshot from '../tools/browser/screenshot.js';
import syncSession from '../tools/browser/syncSession.js';
import newTab from '../tools/browser/newTab.js';
import switchTab from '../tools/browser/switchTab.js';
import closeTab from '../tools/browser/closeTab.js';
import getAllTabs from '../tools/browser/getAllTabs.js';
import goBack from '../tools/browser/goBack.js';
import goForward from '../tools/browser/goForward.js';
import refresh from '../tools/browser/refresh.js';
import waitForSelector from '../tools/browser/waitForSelector.js';
import fillForm from '../tools/browser/fillForm.js';

/**
 * BrowserAgent
 * 
 * The primary executor for all browser-based workflow steps.
 * Routes tasks to Playwright-powered tools.
 * 
 * ⚠️ ZERO LLM IMPORTS. This agent is 100% deterministic.
 * Reasoning and planning happen in PlannerAgent/WorkflowEngine.
 */

class BrowserAgent {
    constructor() {
        // Track the currently active tab id
        this.activeTabId = null;
        this.tabsMap = new Map();
        this.setupListeners();
    }

    getActivePage() {
        const tabId = this.activeTabId ?? global.activeTabId;
        const entry = global.userTabsMap?.get(tabId);
        return entry?.playwrightPage ?? null;
    }

    /**
     * Returns a live Playwright page for the given tabId.
     * If the stored page is closed (e.g. user shut the Chromium window),
     * opens a fresh page from the global context and updates the map.
     */
    async _getOrRenewPage(tabId) {
        const isShadow = tabId?.startsWith('shadow-');
        const map = isShadow ? global.shadowTabsMap : global.userTabsMap;
        const entry = map?.get(tabId);

        if (!entry) return null;

        let page = entry.playwrightPage;

        // Playwright's page.isClosed() tells us if the page/context has been destroyed
        if (!page || page.isClosed()) {
            console.warn(`[BrowserAgent] Page for tab "${tabId}" is closed. Recreating...`);

            if (!global.playwrightContext || global.playwrightContext.browser()?.isConnected() === false) {
                throw new Error('Playwright browser context is closed. Cannot recreate page.');
            }

            page = await global.playwrightContext.newPage();
            entry.playwrightPage = page;     // Update the map entry in-place
            entry.url = 'about:blank';
            map.set(tabId, entry);
            attachStateSync(page, tabId);
            console.log(`[BrowserAgent] Recreated page for tab "${tabId}".`);
        }

        return page;
    }

    setupListeners() {
        // FIX: destructure { step, workflowId } — WorkflowEngine wraps the payload
        bus.on('execute-step', async ({ step, workflowId }) => {
            if (!step || step.agent !== 'browser') return;

            console.log(`[BrowserAgent] Executing: ${step.tool} (${step.id})`);

            try {
                // 1. Resolve which page/tab to use
                let tabId = step.params?.tabId ?? global.activeTabId;

                // Fall back to first available user tab
                if (!tabId || !global.userTabsMap.has(tabId)) {
                    tabId = Array.from(global.userTabsMap.keys())[0];
                }

                const needsPage = !['newTab', 'getAllTabs', 'switchTab', 'closeTab'].includes(step.tool);

                // _getOrRenewPage recreates a closed page automatically
                const page = needsPage ? await this._getOrRenewPage(tabId) : null;

                // Ensure state sync is attached even for existing pages
                if (page) attachStateSync(page, tabId);

                if (needsPage && !page) {
                    throw new Error(`No Playwright page available for tab "${tabId}". Is the browser initialized?`);
                }

                let response;
                switch (step.tool) {
                    case 'navigate':
                        response = await navigate(page, step.params);
                        break;
                    case 'click':
                        response = await click(page, step.params);
                        break;
                    case 'type':
                        response = await type(page, step.params);
                        break;
                    case 'scroll':
                        response = await scroll(page, step.params);
                        break;
                    case 'extract':
                        response = await extract(page, step.params);
                        break;
                    case 'screenshot':
                        response = await screenshot(page, step.params);
                        break;
                    case 'syncSession':
                        response = await syncSession(page);
                        break;
                    // Navigation history controls (Bug #5: were missing — IPC registered but no tool)
                    case 'goBack':
                        response = await goBack(page, step.params);
                        break;
                    case 'goForward':
                        response = await goForward(page, step.params);
                        break;
                    case 'refresh':
                        response = await refresh(page, step.params);
                        break;
                    // P1 tools: reliable DOM waiting and form filling
                    case 'waitForSelector':
                        response = await waitForSelector(page, step.params);
                        break;
                    case 'fillForm':
                        response = await fillForm(page, step.params);
                        break;
                    case 'newTab':
                        response = await newTab(global.playwrightContext, step.params);
                        break;
                    case 'switchTab':
                        response = await switchTab(step.params.tabId);
                        break;
                    case 'closeTab':
                        response = await closeTab(step.params.tabId);
                        break;
                    case 'getAllTabs':
                        response = await getAllTabs();
                        break;
                    case 'vision':
                        // Returns screenshot for the engine to pass to CreditGuard.vision()
                        // Keeps BrowserAgent LLM-free.
                        response = await screenshot(page, { fullPage: false });
                        if (response.success) response.isVisionData = true;
                        break;
                    default:
                        throw new Error(`[BrowserAgent] Unknown tool: ${step.tool}`);
                }

                // FIX: emit 'step-result' with correct keys expected by WorkflowEngine._dispatchAndWait
                bus.emit('step-result', {
                    stepId: step.id,
                    workflowId,
                    result: response,
                });

            } catch (err) {
                console.error(`[BrowserAgent] Execution error for ${step.tool}:`, err.message);
                // FIX: use 'step-error' event (not 'step-result') to trigger the reject path
                bus.emit('step-error', {
                    stepId: step.id,
                    workflowId,
                    error: err.message,
                });
            }
        });
    }
}

// Instantiate the agent
const browserAgent = new BrowserAgent();
export default browserAgent;
