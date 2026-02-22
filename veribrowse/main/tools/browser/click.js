/**
 * click.js
 * 
 * Click tool with 3-strategy fallback: CSS selector → role-based text match → JavaScript click by text content.
 * ZERO LLM calls.
 */

export default async function click(page, { selector, text }) {
    try {
        console.log(`[Tool:Click] Attempting click on: ${selector || text}`);

        // Strategy 1: Direct CSS Selector (Fastest/Reliable if present)
        if (selector) {
            try {
                await page.click(selector, { timeout: 5000 });
                return { success: true, result: 'Clicked via selector', error: null };
            } catch (err) {
                console.warn(`[Tool:Click] Selector strategy failed: ${err.message}`);
            }
        }

        // Strategy 2: Playwright Role/Text strategy
        if (text) {
            try {
                // Try button role first (better accessibility)
                await page.getByRole('button', { name: text, exact: false }).click({ timeout: 3000 });
                return { success: true, result: 'Clicked via role button', error: null };
            } catch (err) {
                try {
                    // Fallback to searching for the text anywhere
                    await page.getByText(text, { exact: false }).first().click({ timeout: 3000 });
                    return { success: true, result: 'Clicked via raw text', error: null };
                } catch (err2) {
                    console.warn(`[Tool:Click] Text strategy failed: ${err2.message}`);
                }
            }
        }

        // Strategy 3: JavaScript Force Click (Last resort)
        if (text) {
            const found = await page.evaluate((t) => {
                // Use regex-based helpers — Babel polyfills .trim()/.toLowerCase() which breaks eval
                var target = t.replace(/^\s+|\s+$/g, '').toLowerCase();
                var els = document.querySelectorAll('button, a, div, span, li');
                for (var i = 0; i < els.length; i++) {
                    var el = els[i];
                    var content = (el.innerText || '').replace(/^\s+|\s+$/g, '').toLowerCase();
                    if (content.indexOf(target) !== -1) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }, text);

            if (found) {
                return { success: true, result: 'Clicked via JS evaluate', error: null };
            }
        }

        throw new Error(`Could not find clickable element with selector "${selector}" or text "${text}"`);
    } catch (err) {
        console.error(`[Tool:Click] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}
