/**
 * humanType.js
 *
 * Character-by-character typing that mimics real keyboard rhythms.
 *
 * WHY:
 *   page.fill() instantly pastes text (detectable, unnatural).
 *   keyboard.type() with a fixed delay looks like a metronome (also detectable).
 *   Real typing has: cluster bursts, brief word-boundary hesitations,
 *   occasional longer pauses mid-word, and consistent WPM range per session.
 *
 * Typing model:
 *   • Base WPM is seeded per-session (50–90 WPM range = 135–270ms per char avg)
 *   • Word boundaries (space, punctuation) add a 40-120ms "hand repositioning" gap
 *   • 1-in-8 chars gets a "thinking pause" (200–500ms)
 *   • All delay values are drawn from a triangular distribution (not uniform)
 *     to model the natural clustering of similar inter-key times
 *
 * Field focus sequence:
 *   1. Move cursor to element (humanClick)
 *   2. Click to focus (triggers focus events properly)
 *   3. Clear existing value if requested
 *   4. Type character by character
 *   5. (Optionally) press Enter and wait for response
 */

import { randInt, randomDelay, charDelay, hesitation, actionCooldown } from './humanTiming.js';
import { humanClickElement } from './humanClick.js';

// ─── Triangular distribution helper ──────────────────────────────────────
// More realistic than uniform — peaks in the middle, tapers at extremes.
function triRand(min, mode, max) {
    const u = Math.random();
    const f = (mode - min) / (max - min);
    if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

// ─── Selector list builder (handles input ↔ textarea duality) ────────────
function buildSelectorList(selector) {
    if (!selector) return [];
    const nameMatch = selector.match(/^input\[name=['"](.*)['"]\]$/);
    if (nameMatch) {
        return [
            `textarea[name='${nameMatch[1]}']`,
            `input[name='${nameMatch[1]}']`
        ];
    }
    return [selector];
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Type `text` into a field using human-like character-by-character rhythm.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector     - CSS selector of the input/textarea
 * @param {string} text         - text to type
 * @param {{
 *   clear?: boolean,             - clear existing content before typing (default true)
 *   pressEnter?: boolean,        - press Enter after typing (default false)
 *   waitAfterEnter?: number,     - ms to wait after Enter (default 1500)
 *   moveCursor?: boolean,        - move visual cursor to element (default true)
 * }} [options]
 */
export async function humanType(page, selector, text, options = {}) {
    const {
        clear = true,
        pressEnter = false,
        waitAfterEnter = 1500,
        moveCursor = true,
    } = options;

    const selectorList = buildSelectorList(selector);

    // ── 1. Find and focus the field ──
    let focused = false;
    let usedSelector = null;

    for (const sel of selectorList) {
        try {
            await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });

            if (moveCursor) {
                // Move cursor to the field (visual) — uses humanClick internals
                const res = await humanClickElement(page, sel, null, { fast: true });
                if (res.success) { focused = true; usedSelector = sel; break; }
            } else {
                await page.click(sel, { timeout: 3000 });
                focused = true;
                usedSelector = sel;
                break;
            }
        } catch { /* try next selector */ }
    }

    // Fallback: first visible input/textarea on the page
    if (!focused) {
        try {
            // Longer timeout for heavy pages like Amazon — wait for actual render
            const fb = page.locator('textarea:visible, input:not([type="hidden"]):visible').first();
            await fb.waitFor({ state: 'visible', timeout: 8000 });
            await fb.click({ timeout: 5000 });
            focused = true;
            usedSelector = 'first-visible-input';
        } catch (e) {
            throw new Error(`[HumanType] Could not focus any input field: ${e.message}`);
        }
    }

    // ── 2. Clear existing content ──
    if (clear) {
        // Select-all + Delete is more reliable than fill('') across all input types
        await page.keyboard.press('Control+a');
        await randomDelay(30, 80);
        await page.keyboard.press('Delete');
        await randomDelay(20, 60);
    }

    // Brief "ready to type" pause — models aligning fingers on keyboard
    await randomDelay(80, 200);

    // ── 3. Type character-by-character ──
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        // Type the character — Playwright fires keydown, keypress, input, keyup
        await page.keyboard.type(ch);

        // Word boundary or punctuation: repositioning delay
        const isWordBoundary = ch === ' ' || ch === ',' || ch === '.' || ch === '-';
        if (isWordBoundary) {
            await randomDelay(40, 120);
        }

        // 1-in-8 chance of a "thinking" gap mid-word
        if (Math.random() < 0.125) {
            await randomDelay(180, 480);
        } else {
            // Normal char delay — triangular distribution for realism
            const delay = Math.round(triRand(30, 70, 160));
            await randomDelay(delay, delay + 10);
        }
    }

    // ── 4. Post-typing pause ──
    // User scans what they typed before submitting
    await randomDelay(200, 500);

    // ── 5. Optionally press Enter ──
    if (pressEnter) {
        // Brief hesitation before submit — "am I sure?"
        if (text.length > 10) await hesitation();

        await page.keyboard.press('Enter');

        // Wait for potential navigation or AJAX response
        await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {});
        await randomDelay(waitAfterEnter * 0.6, waitAfterEnter);
    }

    return { success: true, usedSelector };
}

/**
 * Type into whichever visible input/textarea exists on the page,
 * without needing a specific selector.
 * Used as a fallback or when the planner just knows "there's a search box".
 *
 * @param {import('playwright').Page} page
 * @param {string} text
 * @param {{ pressEnter?: boolean }} [options]
 */
export async function humanTypeAnywhere(page, text, options = {}) {
    const fallbackSelector = 'textarea:visible, input:not([type="hidden"]):visible';
    return humanType(page, fallbackSelector, text, options);
}

/**
 * Clear a field with human-precision: triple-click to select-all, then delete.
 * More reliable than Ctrl+A on some sites.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
export async function humanClearField(page, selector) {
    try {
        // Triple click selects entire field content in most inputs
        await page.click(selector, { clickCount: 3, timeout: 3000 });
        await randomDelay(40, 100);
        await page.keyboard.press('Delete');
        await randomDelay(20, 60);
    } catch (e) {
        console.warn(`[HumanType] clearField fallback: ${e.message}`);
        await page.fill(selector, '').catch(() => {});
    }
}
