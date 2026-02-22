/**
 * scroll.js
 * 
 * Scroll tool — scrolls the page or a specific element.
 * ZERO LLM calls.
 */

export default async function scroll(page, { direction = 'down', amount = 500, selector = null }) {
    try {
        console.log(`[Tool:Scroll] Scrolling ${direction} by ${amount}px`);

        if (selector) {
            // Scroll a specific element
            await page.evaluate(({ sel, dir, amt }) => {
                const el = document.querySelector(sel);
                if (!el) return;
                if (dir === 'down') el.scrollTop += amt;
                else if (dir === 'up') el.scrollTop -= amt;
                else if (dir === 'top') el.scrollTop = 0;
                else if (dir === 'bottom') el.scrollTop = el.scrollHeight;
            }, { sel: selector, dir: direction, amt: amount });
        } else {
            // Scroll the window
            if (direction === 'down') {
                await page.mouse.wheel(0, amount);
            } else if (direction === 'up') {
                await page.mouse.wheel(0, -amount);
            } else if (direction === 'top') {
                await page.evaluate(() => window.scrollTo(0, 0));
            } else if (direction === 'bottom') {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            }
        }

        // Wait for scroll animation/rendering
        await page.waitForTimeout(500);

        return {
            success: true,
            result: `Scrolled ${direction} ${selector ? 'in ' + selector : ''}`,
            error: null,
        };
    } catch (err) {
        console.error(`[Tool:Scroll] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}
