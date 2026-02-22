/**
 * waitForSelector.js
 *
 * Waits for a CSS selector or text to appear on the page before proceeding.
 * Essential for reliable multi-step workflows where navigation is async.
 * ZERO LLM calls.
 *
 * params:
 *   selector    {string}  CSS selector to wait for
 *   text        {string}  (alternative) wait until any element contains this text
 *   timeout     {number}  max ms to wait (default 15000)
 *   state       {string}  'visible' | 'hidden' | 'attached' | 'detached' (default 'visible')
 */

export default async function waitForSelector(page, params = {}) {
    const {
        selector,
        text,
        timeout = 15000,
        state = 'visible',
    } = params;

    try {
        if (!selector && !text) {
            throw new Error('waitForSelector requires either a selector or text param.');
        }

        if (selector) {
            console.log(`[Tool:WaitForSelector] Waiting for selector "${selector}" (state: ${state}, timeout: ${timeout}ms)`);

            // For input[name=X] selectors, also try textarea[name=X] first (e.g. Google search)
            const nameMatch = selector.match(/^input\[name=['"](.+)['"]\]$/);
            if (nameMatch) {
                const textareaSelector = `textarea[name='${nameMatch[1]}']`;
                try {
                    await page.waitForSelector(textareaSelector, { state, timeout: timeout / 2 });
                    // textarea found — success
                } catch {
                    // Fall through to original selector
                    await page.waitForSelector(selector, { state, timeout: timeout / 2 });
                }
            } else {
                await page.waitForSelector(selector, { state, timeout });
            }

        } else {
            // Text-based wait — wait until any visible element contains the text
            console.log(`[Tool:WaitForSelector] Waiting for text "${text}" (timeout: ${timeout}ms)`);
            await page.waitForFunction(
                (t) => {
                    // Use indexOf instead of .includes() and avoid .toLowerCase() polyfill
                    var tLow = t.toLowerCase();
                    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                    var node;
                    while ((node = walker.nextNode())) {
                        if (node.textContent.toLowerCase().indexOf(tLow) !== -1) return true;
                    }
                    return false;
                },
                text,
                { timeout }
            );
        }

        return {
            success: true,
            result: { found: true, selector: selector || `[text:${text}]` },
            error: null,
        };
    } catch (err) {
        console.error('[Tool:WaitForSelector] Failed:', err.message);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}
