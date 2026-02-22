/**
 * navigate.js
 * 
 * Navigates a Playwright page to a specific URL.
 * ZERO LLM calls. Implements precise string-based CAPTCHA detection.
 * Also syncs the Electron BrowserView so the user sees the result.
 */

export default async function navigate(page, params) {
    const { url, tabId } = params ?? {};
    try {
        if (!url) throw new Error('No URL provided for navigation.');

        // Normalize URL
        let targetUrl = url.trim();
        if (!targetUrl.startsWith('http')) {
            targetUrl = `https://${targetUrl}`;
        }

        console.log(`[Tool:Navigate] Moving to ${targetUrl}`);

        // Navigate with a 30s timeout — catch timeout but keep going
        let response = null;
        try {
            response = await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
        } catch (navErr) {
            // Navigation timeout is recoverable — page may still be usable
            console.warn('[Tool:Navigate] Navigation did not fully resolve (continuing):', navErr.message);
        }

        // Wait for page to settle before reading title/content
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(500);

        let currentUrl = targetUrl;
        try { currentUrl = page.url(); } catch {}

        let title = targetUrl;
        try { title = await page.title(); } catch {}

        let content = '';
        try { content = (await page.content()).toLowerCase(); } catch {}

        // ── Sync the Electron BrowserView so user sees the navigation ──
        const resolvedTabId = tabId || global.activeTabId || 'user-1';

        // Ensure a BrowserView exists (creates hidden one if needed)
        const view = global.ensureBrowserView?.(resolvedTabId);
        if (view && !view.webContents.isDestroyed()) {
            try {
                await view.webContents.loadURL(currentUrl);
            } catch (e) {
                console.warn('[Tool:Navigate] BrowserView loadURL failed:', e.message);
            }
        }

        // Notify renderer to update the tab bar URL/title + switch to browser view
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            // If this tab isn't registered in the renderer yet, announce it first
            global.mainWindow.webContents.send('browser:user-tab-created', {
                id: resolvedTabId,
                url: currentUrl,
                title,
                favicon: null,
                isLoading: false,
            });
            // Then update it (the store de-dupes — addTab checks for existing id)
            global.mainWindow.webContents.send('browser:user-tab-updated', {
                tabId: resolvedTabId,
                url: currentUrl,
                title,
                isLoading: false,
            });
        }


        // ── Issue 2: Precise CAPTCHA / bot-challenge detection ──
        // Only phrases that appear on actual challenge pages, not on normal sites.
        const captchaKeywords = [
            'captcha',
            'verify you are human',
            'verify you\'re human',
            'recaptcha',
            'are you a robot',
            'cf-challenge',
            'checking your browser',
            'ddos-guard',
            'please enable cookies',
        ];

        const needsHuman = content ? captchaKeywords.some((k) => content.includes(k)) : false;

        return {
            success: true,
            result: {
                url: currentUrl,
                title,
                status: response?.status?.() || 200,
                needsHuman,
            },
            error: null,
        };
    } catch (err) {
        console.error(`[Tool:Navigate] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}

