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
import { humanClickElement, resolveElementCenter } from './humanClick.js';
import { showBoundingBox, hideBoundingBox } from './cursorManager.js';

// ─── Triangular distribution helper ──────────────────────────────────────
// More realistic than uniform — peaks in the middle, tapers at extremes.
function triRand(min, mode, max) {
    const u = Math.random();
    const f = (mode - min) / (max - min);
    if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

// Selector for inputs that can actually receive keyboard text.
// Excludes checkboxes, radios, buttons, file pickers, etc. — these are
// non-typeable and cause focus failures on pages where they appear first
// in the DOM (e.g. PCMag hamburger toggle, cookie banner toggles).
const TYPEABLE_INPUT_SELECTOR =
    'textarea:visible, ' +
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])' +
    ':not([type="submit"]):not([type="button"]):not([type="file"])' +
    ':not([type="image"]):not([type="reset"]):not([type="range"])' +
    ':not([type="color"]):visible';
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

    // Priority 0: Check if there's already a focused input inside a modal/dialog
    // Google Flights and similar sites open dialogs with autofocused inputs.
    // Attempting to click these fails due to pointer-event intercepting overlays,
    // but we can just type directly since the input is already focused.
    try {
        const alreadyFocused = await page.evaluate(() => {
            const active = document.activeElement;
            if (!active) return null;
            const tag = active.tagName.toLowerCase();
            const isTypeable = tag === 'input' || tag === 'textarea' || active.isContentEditable || 
                               active.getAttribute('role') === 'combobox' || 
                               active.getAttribute('role') === 'textbox';
            if (!isTypeable) return null;
            // Check if we're inside a modal/dialog
            const inModal = !!active.closest('[role="dialog"], .modal, [aria-modal="true"]');
            // Return info about the focused element
            return {
                tagName: tag,
                role: active.getAttribute('role') || '',
                ariaLabel: active.getAttribute('aria-label') || '',
                inModal,
                hasAutofocus: active.hasAttribute('autofocus'),
            };
        });
        
        if (alreadyFocused && (alreadyFocused.inModal || alreadyFocused.hasAutofocus)) {
            console.log(`[HumanType] Already-focused input detected (modal: ${alreadyFocused.inModal}, autofocus: ${alreadyFocused.hasAutofocus}) — skipping click`);
            focused = true;
            usedSelector = 'already-focused';
        }
    } catch { /* continue with normal flow */ }

    for (const sel of selectorList) {
        if (focused) break;
        try {
            await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });

            let clickSucceeded = false;
            if (moveCursor) {
                // Move cursor to the field (visual) — uses humanClick internals
                const res = await humanClickElement(page, sel, null, { fast: true });
<<<<<<< Updated upstream
                clickSucceeded = res.success;
=======
                if (res.success) {
                    focused = true;
                    usedSelector = sel;
                    // Visual feedback: show bounding box while typing
                    const { box } = await resolveElementCenter(page, sel);
                    if (box) await showBoundingBox(page, box.x, box.y, box.width, box.height);
                    break;
                }
>>>>>>> Stashed changes
            } else {
                try {
                    await page.click(sel, { timeout: 3000 });
                    clickSucceeded = true;
                } catch { /* fall through to JS focus */ }
            }

            if (clickSucceeded) { focused = true; usedSelector = sel; break; }

            // Click was blocked by a pointer-event-intercepting overlay
            // (e.g. GitHub's ghcc-consent cookie banner, GDPR consent widgets).
            // JS element.focus() bypasses hit-testing entirely — overlays can't block it.
            const jsFocused = await page.evaluate((cssSelector) => {
                const el = document.querySelector(cssSelector);
                if (!el) return false;
                el.focus();
                return !!(document.activeElement && (document.activeElement === el || el.contains(document.activeElement)));
            }, sel.split(',')[0].trim()).catch(() => false);

            if (jsFocused) {
                console.log(`[HumanType] JS focus() bypass succeeded for "${sel.slice(0, 60)}"`);
                focused = true;
                usedSelector = sel;
                break;
            }
        } catch { /* try next selector */ }
    }

    // Fallback: first typeable input/textarea on the page
    if (!focused) {
        // Priority 1: Try login-form-specific selectors before the generic fallback.
        // This prevents accidentally focusing newsletter/hero email inputs
        // (e.g. github.com's #hero_user_email) when the actual login form is
        // on the same page (in a dropdown/modal) or after navigation.
        const LOGIN_FORM_SELECTORS = [
            'input[name="login"]',
            'input[name="username"]',
            'input[id="login_field"]',
            'input[name="user_login"]',
            'input[name="email"]:not([id*="hero"]):not([id*="newsletter"]):not([id*="subscribe"])',
        ].join(', ');
        try {
            const loginEl = page.locator(LOGIN_FORM_SELECTORS).first();
            if (await loginEl.count() > 0) {
                await loginEl.waitFor({ state: 'visible', timeout: 2000 });
                try {
                    await loginEl.click({ timeout: 3000 });
                } catch {
                    // Pointer-event overlay still present — bypass with JS focus
                    await loginEl.evaluate(el => el.focus()).catch(() => {});
                    console.log('[HumanType] JS focus() on login-form-specific input');
                }
                focused = true;
                usedSelector = 'login-form-input';
            }
        } catch { /* fall through to generic */ }

        // Priority 2: Generic first typeable input
        if (!focused) {
            try {
                const fb = page.locator(TYPEABLE_INPUT_SELECTOR).first();
                await fb.waitFor({ state: 'visible', timeout: 8000 });
                await fb.click({ timeout: 5000 });
                focused = true;
                usedSelector = 'first-visible-input';
            } catch (e) {
                throw new Error(`[HumanType] Could not focus any input field: ${e.message}`);
            }
        }
    }

    // ── 2. Clear existing content ──
    if (clear) {
        // Method 1: Triple-click to select all (most reliable for custom widgets
        // like Google Flights autocomplete inputs where Ctrl+A doesn't work)
        try {
            // For already-focused inputs (inside modals), use Ctrl+A since we can't click
            const specialSelectors = ['first-visible-input', 'login-form-input', 'already-focused'];
            if (usedSelector && !specialSelectors.includes(usedSelector)) {
                await page.click(usedSelector, { clickCount: 3, timeout: 1000 });
            } else {
                // Fallback for when we used a locator or already-focused — press Ctrl+A
                await page.keyboard.press('Control+a');
            }
        } catch {
            // If triple-click fails, fall back to Ctrl+A
            await page.keyboard.press('Control+a');
        }
        await randomDelay(30, 80);
        
        // Delete + Backspace combo — some custom inputs only respond to one or the other
        await page.keyboard.press('Delete');
        await randomDelay(20, 40);
        await page.keyboard.press('Backspace');
        await randomDelay(20, 60);
        
        // For stubborn inputs (Google Flights style), clear via JS if element is empty-able
        try {
            await page.evaluate(() => {
                const el = document.activeElement;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                    if ('value' in el) el.value = '';
                    if (el.isContentEditable) el.textContent = '';
                    // Dispatch input event so frameworks detect the change
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        } catch { /* non-fatal — we already pressed Delete/Backspace */ }
        
        await randomDelay(30, 80);
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
        await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => { });
        await randomDelay(waitAfterEnter * 0.6, waitAfterEnter);
    }

    // ── 6. Cleanup visual feedback ──
    if (moveCursor) {
        await hideBoundingBox(page);
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
    return humanType(page, TYPEABLE_INPUT_SELECTOR, text, options);
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
        await page.fill(selector, '').catch(() => { });
    }
}
