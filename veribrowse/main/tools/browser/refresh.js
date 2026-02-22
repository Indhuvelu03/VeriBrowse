/**
 * refresh.js
 *
 * Reloads the current Playwright page and notifies
 * the renderer of the loading state transition.
 * ZERO LLM calls.
 */

export default async function refresh(page, params = {}) {
    const { tabId } = params;
    try {
        const resolvedTabId = tabId ?? global.activeTabId ?? 'user-1';

        // Signal loading start to renderer
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('browser:user-tab-updated', {
                tabId: resolvedTabId,
                isLoading: true,
            });
        }

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(500);

        const currentUrl = page.url();
        const title = await page.title().catch(() => currentUrl);

        // Signal loading complete to renderer
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('browser:user-tab-updated', {
                tabId: resolvedTabId,
                url: currentUrl,
                title,
                isLoading: false,
            });
        }

        return { success: true, result: { url: currentUrl, title }, error: null };
    } catch (err) {
        console.error('[Tool:Refresh] Failed:', err.message);
        return { success: false, result: null, error: err.message };
    }
}
