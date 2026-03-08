import browserManager from './BrowserManager.js';

function findTabIdForPage(page) {
    for (const [tabId, entry] of browserManager.userTabs.entries()) {
        if (entry?.playwrightPage === page) return tabId;
    }
    for (const [tabId, entry] of browserManager.shadowTabs.entries()) {
        if (entry?.playwrightPage === page) return tabId;
    }
    return null;
}

/**
 * Streams periodic compressed screenshots from a Playwright page to the renderer.
 * Used for live frontend preview while autonomous background actions run.
 */
export function startLivePreview(page, { intervalMs = 700, jpegQuality = 45 } = {}) {
    if (!page || typeof page.screenshot !== 'function') return () => { };

    let stopped = false;
    let inFlight = false;
    let timer = null;

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (timer) clearInterval(timer);
    };

    const emitFrame = async () => {
        if (stopped || inFlight) return;
        if (page.isClosed?.()) {
            stop();
            return;
        }

        const tabId = findTabIdForPage(page);
        if (!tabId) return;

        inFlight = true;
        try {
            const imageBuffer = await page.screenshot({
                type: 'jpeg',
                quality: jpegQuality,
                timeout: 5000,
            }).catch(() => null);

            if (!imageBuffer || stopped) return;

            const url = page.url();
            const title = await page.title().catch(() => url);
            browserManager.sendToRenderer('browser:live-frame', {
                tabId,
                frame: imageBuffer.toString('base64'),
                url,
                title,
                ts: Date.now(),
            });
        } finally {
            inFlight = false;
        }
    };

    emitFrame();
    timer = setInterval(emitFrame, Math.max(250, intervalMs));
    page.once?.('close', stop);

    return stop;
}