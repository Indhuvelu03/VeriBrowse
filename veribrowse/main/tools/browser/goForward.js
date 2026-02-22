/**
 * goForward.js
 *
 * Steps the Playwright page browser history forward one entry
 * and notifies the renderer of the new URL/title.
 * ZERO LLM calls.
 */

export default async function goForward(page, params = {}) {
    const { tabId } = params;
    try {
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);

        const currentUrl = page.url();
        const title = await page.title().catch(() => currentUrl);

        // Notify renderer to update the omnibox / tab title
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            const resolvedTabId = tabId ?? global.activeTabId ?? 'user-1';
            global.mainWindow.webContents.send('browser:user-tab-updated', {
                tabId: resolvedTabId,
                url: currentUrl,
                title,
                isLoading: false,
            });
        }

        return { success: true, result: { url: currentUrl, title }, error: null };
    } catch (err) {
        console.error('[Tool:GoForward] Failed:', err.message);
        return { success: false, result: null, error: err.message };
    }
}
