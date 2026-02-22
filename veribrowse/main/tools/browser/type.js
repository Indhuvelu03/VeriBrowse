/**
 * type.js
 *
 * Type tool — fills input/textarea fields with robust multi-strategy fallback.
 * Handles Google's modern <textarea name="q"> which replaced <input name="q">.
 * ZERO LLM calls.
 */

export default async function type(page, { selector, text, pressEnter = true }) {
    try {
        if (text === undefined || text === null) throw new Error('No text provided to type.');

        console.log(`[Tool:Type] Attempting to type text in: ${selector || 'auto-detecting input'}`);

        // Google and other modern sites replaced <input name="q"> with <textarea name="q">.
        // Promote any input[name=X] selector to try textarea first too.
        const selectorList = buildSelectorList(selector);

        let filled = false;
        let usedSelector = null;

        for (const sel of selectorList) {
            try {
                // Wait for the element to be visible before filling
                await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
                await page.fill(sel, text, { timeout: 5000 });
                usedSelector = sel;
                filled = true;
                break;
            } catch {
                // Try next selector in the list
            }
        }

        if (!filled) {
            // Last resort: first visible input or textarea on the page
            const fallback = page.locator('textarea:visible, input:not([type="hidden"]):visible').first();
            await fallback.fill(text, { timeout: 5000 });
            usedSelector = 'first visible input/textarea';
        }

        if (pressEnter) {
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1500); // wait for navigation/results
        }

        return {
            success: true,
            result: `Typed "${text}" into ${usedSelector}`,
            error: null,
        };
    } catch (err) {
        console.error(`[Tool:Type] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}

/**
 * Build an ordered list of selectors to try, handling the textarea/input duality.
 * e.g. input[name='q'] → [ "textarea[name='q']", "input[name='q']" ]
 */
function buildSelectorList(selector) {
    if (!selector) return [];
    const list = [];

    // If selector targets input[name=X], also try textarea[name=X] first
    const nameMatch = selector.match(/^input\[name=['"](.*)['"]\]$/);
    if (nameMatch) {
        list.push(`textarea[name='${nameMatch[1]}']`);
        list.push(`input[name='${nameMatch[1]}']`);
        return list;
    }

    list.push(selector);
    return list;
}

