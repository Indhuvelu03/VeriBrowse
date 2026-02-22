/**
 * executeAction.js
 *
 * Executes a single atomic action (ACTION_SCHEMA) on the page.
 * Every action includes human-like delays and robust fallback logic.
 * ZERO LLM calls.
 */

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

export default async function executeAction(action, page) {
    switch (action.type) {

        // ── CLICK ──────────────────────────────────────────────────────
        case 'CLICK': {
            // Attempt 1: CSS selector
            let clicked = false;
            if (action.selector) {
                try {
                    // Wait for element to be actionable
                    await page.waitForSelector(action.selector, { state: 'visible', timeout: 5000 });
                    // Human-like: move mouse to element center first
                    const box = await page.locator(action.selector).first().boundingBox();
                    if (box) {
                        const tx = box.x + box.width / 2 + (Math.random() * 6 - 3);
                        const ty = box.y + box.height / 2 + (Math.random() * 6 - 3);
                        await page.mouse.move(tx, ty, { steps: rand(8, 18) });
                        await page.waitForTimeout(rand(120, 350));
                    }
                    await page.click(action.selector, { timeout: 5000 });
                    clicked = true;
                } catch { /* fall through */ }
            }
            // Attempt 2: visible text match
            if (!clicked && action.text) {
                try {
                    const loc = page.getByText(action.text, { exact: false }).first();
                    const box = await loc.boundingBox();
                    if (box) {
                        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: rand(8, 18) });
                        await page.waitForTimeout(rand(120, 350));
                    }
                    await loc.click({ timeout: 5000 });
                    clicked = true;
                } catch { /* fall through */ }
            }
            // Attempt 3: JS force-click by text content
            if (!clicked && action.text) {
                const found = await page.evaluate((t) => {
                    var els = document.querySelectorAll('button, a, div, span, li, [role="button"]');
                    // Use a plain regex trim + toLowerCase equivalent so Babel doesn't polyfill
                    var target = t.replace(/^\s+|\s+$/g, '').toLowerCase();
                    for (var i = 0; i < els.length; i++) {
                        var el = els[i];
                        var content = (el.innerText || '').replace(/^\s+|\s+$/g, '').toLowerCase();
                        if (content.indexOf(target) !== -1) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }, action.text);
                if (!found) throw new Error(`CLICK failed — no element matched selector "${action.selector}" or text "${action.text}"`);
            }
            // Post-click: wait for potential navigation
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => { });
            await page.waitForTimeout(rand(300, 700));
            break;
        }

        // ── TYPE ───────────────────────────────────────────────────────
        case 'TYPE': {
            const sel = action.selector;
            if (sel) {
                await page.waitForSelector(sel, { state: 'visible', timeout: 5000 }).catch(() => { });
                // Focus + clear
                try {
                    await page.click(sel, { timeout: 3000 });
                    await page.fill(sel, '');
                } catch {
                    // Fallback: click first visible input
                    const fb = page.locator('textarea:visible, input:not([type="hidden"]):visible').first();
                    await fb.click({ timeout: 3000 });
                    await fb.fill('');
                }
            }
            // Character-by-character typing
            for (const ch of action.text) {
                await page.keyboard.type(ch, { delay: rand(30, 90) });
            }
            // Post-type wait
            await page.waitForTimeout(rand(400, 800));
            // If text ends with \n, press Enter
            if (action.text.endsWith('\n') || action.pressEnter) {
                await page.keyboard.press('Enter');
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => { });
                await page.waitForTimeout(rand(800, 1500));
            }
            break;
        }

        // ── SCROLL ─────────────────────────────────────────────────────
        case 'SCROLL': {
            const total = action.amount || 500;
            const dir = action.direction === 'up' ? -1 : 1;
            let scrolled = 0;
            while (scrolled < total) {
                const flick = Math.min(total - scrolled, rand(80, 200));
                await page.mouse.wheel(0, flick * dir);
                scrolled += flick;
                await page.waitForTimeout(rand(80, 250));
            }
            await page.waitForTimeout(rand(200, 500));
            break;
        }

        // ── NAVIGATE ───────────────────────────────────────────────────
        case 'NAVIGATE': {
            try {
                await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (e) {
                console.warn('[executeAction:NAVIGATE] Timeout — continuing:', e.message);
            }
            await page.waitForLoadState('domcontentloaded').catch(() => { });
            await page.waitForTimeout(rand(800, 1500));
            break;
        }

        // ── WAIT ───────────────────────────────────────────────────────
        case 'WAIT': {
            await page.waitForTimeout(action.amount || rand(1500, 3000));
            break;
        }

        // ── EXTRACT ────────────────────────────────────────────────────
        case 'EXTRACT': {
            // No-op from execution perspective — loop handles reading snapshot
            break;
        }

        // ── PRESS_ENTER (convenience) ──────────────────────────────────
        case 'PRESS_ENTER': {
            await page.keyboard.press('Enter');
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => { });
            await page.waitForTimeout(rand(500, 1000));
            break;
        }

        // ── Unknown → throw so loop counts it as failure ───────────────
        default:
            if (action.type !== 'DONE') {
                throw new Error(`Unknown action type: ${action.type}`);
            }
    }
}
