/**
 * screenshot.js
 * 
 * Screenshot tool — captures the current visible viewport of a Playwright page.
 * Returns a base64 string for display or vision analysis.
 * ZERO LLM calls.
 */

export default async function screenshot(page, { fullPage = false } = {}) {
    try {
        console.log(`[Tool:Screenshot] Capturing ${fullPage ? 'full' : 'viewport'} screenshot...`);

        // Capture bit-for-bit PNG and convert to base64
        const buffer = await page.screenshot({
            type: 'png',
            fullPage: fullPage,
        });

        const base64 = buffer.toString('base64');

        return {
            success: true,
            result: base64, // Just the raw base64 string
            error: null,
        };
    } catch (err) {
        console.error(`[Tool:Screenshot] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}
