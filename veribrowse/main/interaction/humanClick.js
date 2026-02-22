/**
 * humanClick.js
 *
 * Human-like click: cursor travels to element, pauses, then clicks.
 *
 * Full interaction sequence for every click:
 *   1. Resolve element → screen-space coordinates + jitter
 *   2. Move cursor from current position in small incremental steps
 *      (eased-in-out trajectory, micro-randomness per step)
 *   3. hoverPause  — visual confirmation moment
 *   4. mousedown   — Playwright real event
 *   5. mouseup     — after a brief hold
 *   6. Click feedback animation (cursor ripple)
 *   7. actionCooldown — DOM settle time
 *
 * WHY this sequence:
 *   Anti-bot detection systems track event timing, cursor trajectories and
 *   interaction gaps. A zero-latency perfectly-centred click is a bot
 *   fingerprint. Natural off-center landing + velocity ramp avoids this.
 */

import {
    randInt, naturalJitter, hoverPause, hesitation,
    actionCooldown, mouseStepDelay, easeInOut, randomDelay
} from './humanTiming.js';
import { initCursor, updateCursorPosition, showClickFeedback } from './cursorManager.js';

// ─── Internal state: track cursor's last known position ────────────────────
// Allows movement to START from the correct position instead of (0,0) every time.
let _cursorX = 0;
let _cursorY = 0;

/**
 * Move the Playwright virtual mouse (and cursor overlay) from its current
 * position to (targetX, targetY) in a series of small curved steps.
 *
 * Motion profile:
 *   • Path is not a straight line — a slight arc is added via a Bezier-ish
 *     midpoint offset so movement looks natural.
 *   • Speed follows an ease-in-out curve: start slow, peak in the middle,
 *     slow again near landing.
 *   • Per-step micro-jitter keeps the trajectory non-robotic.
 *
 * @param {import('playwright').Page} page
 * @param {number} targetX
 * @param {number} targetY
 * @param {{ steps?: number, fast?: boolean }} [options]
 */
export async function moveCursorTo(page, targetX, targetY, options = {}) {
    const steps = options.fast ? randInt(6, 12) : randInt(18, 32);

    const startX = _cursorX;
    const startY = _cursorY;

    // Bezier midpoint: offset perpendicular to the direct path to create a
    // subtle arc. Humans rarely move in perfectly straight lines.
    const midX = (startX + targetX) / 2 + randInt(-30, 30);
    const midY = (startY + targetY) / 2 + randInt(-20, 20);

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ease = easeInOut(t);

        // Quadratic Bezier: P(t) = (1-t)²·start + 2(1-t)t·mid + t²·target
        const bt = 1 - ease;
        const x = bt * bt * startX + 2 * bt * ease * midX + ease * ease * targetX;
        const y = bt * bt * startY + 2 * bt * ease * midY + ease * ease * targetY;

        // Add per-step micro-jitter — decreases near destination for precise landing
        const jitterScale = 1 - Math.pow(t, 2); // jitter fades as we near target
        const jitter = naturalJitter(2 * jitterScale);

        const px = Math.round(x + jitter.dx);
        const py = Math.round(y + jitter.dy);

        // Move the real Playwright mouse (fires mousemove events into the page)
        await page.mouse.move(px, py);
        // Sync the visual overlay
        await updateCursorPosition(page, px, py);
        // Short delay between steps (pacing)
        await mouseStepDelay();
    }

    // Final precise landing at exact target
    await page.mouse.move(targetX, targetY);
    await updateCursorPosition(page, targetX, targetY);

    _cursorX = targetX;
    _cursorY = targetY;
}

/**
 * Resolve a selector to its viewport-relative center coordinates.
 * Applies a small natural jitter so the landing point is never exactly centred
 * (humans rarely click the geometric centre of buttons).
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @returns {Promise<{ x: number, y: number, found: boolean }>}
 */
export async function resolveElementCenter(page, selector) {
    try {
        const box = await page.locator(selector).first().boundingBox({ timeout: 5000 });
        if (!box) return { x: _cursorX, y: _cursorY, found: false };

        const jitter = naturalJitter(Math.min(box.width * 0.12, 6));
        const x = Math.round(box.x + box.width / 2 + jitter.dx);
        const y = Math.round(box.y + box.height / 2 + jitter.dy);
        return { x, y, found: true };
    } catch {
        return { x: _cursorX, y: _cursorY, found: false };
    }
}

/**
 * Perform a complete human-like click at absolute viewport coordinates.
 * Used when you already know the destination (e.g. from getBoundingClientRect).
 *
 * Sequence: move → hover → [optional hesitation] → down → up → ripple → cooldown
 *
 * @param {import('playwright').Page} page
 * @param {number} x
 * @param {number} y
 * @param {{ important?: boolean, fast?: boolean }} [options]
 *   important — add a 300-800ms hesitation before clicking (use for destructive actions)
 *   fast      — reduced movement steps for non-critical navigation
 */
export async function humanClickAt(page, x, y, options = {}) {
    // Ensure cursor overlay exists on the page
    await initCursor(page);

    // 1. Move cursor to target
    await moveCursorTo(page, x, y, { fast: options.fast });

    // 2. Hover pause — the visual confirmation moment
    await hoverPause();

    // 3. Optional hesitation for important actions (confirms intentionality)
    if (options.important) {
        await hesitation();
    }

    // 4. Realistic click: mousedown → brief hold → mouseup
    await page.mouse.down();
    await randomDelay(40, 110);   // hold duration — humans don't tap instantly
    await page.mouse.up();

    // 5. Visual feedback on the cursor overlay
    await showClickFeedback(page);

    // 6. Update internal position record
    _cursorX = x;
    _cursorY = y;

    // 7. Post-click settle — wait for DOM / potential navigation to begin
    await actionCooldown();
}

/**
 * High-level convenience: locate an element, move to it, and click.
 * Preferred entry point for selector-based clicks.
 *
 * Falls back to Playwright's built-in click() if element resolves but
 * bounding box is unavailable (e.g. zero-size elements, SVG internals).
 *
 * @param {import('playwright').Page} page
 * @param {string} selector     - CSS selector
 * @param {string} [fallbackText] - visible text to use if selector fails
 * @param {{ important?: boolean, fast?: boolean }} [options]
 * @returns {Promise<{ success: boolean, method: string, error?: string }>}
 */
export async function humanClickElement(page, selector, fallbackText, options = {}) {
    // Ensure overlay is ready
    await initCursor(page);

    // ── Strategy 1: CSS selector + human cursor movement ──
    if (selector) {
        try {
            await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
            const { x, y, found } = await resolveElementCenter(page, selector);

            if (found) {
                await humanClickAt(page, x, y, options);
                // Wait for potential navigation after click
                await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
                return { success: true, method: 'selector+human-cursor' };
            }
        } catch (e) {
            console.warn(`[HumanClick] Selector strategy failed: ${e.message}`);
        }
    }

    // ── Strategy 2: Visible text match ──
    if (fallbackText) {
        // Playwright getByText works poorly with multiline/very long strings —
        // extract the longest single-line segment (max 50 chars).
        const cleanFallback = String(fallbackText)
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 3)
            .sort((a, b) => b.length - a.length)[0]
            ?.slice(0, 50) || String(fallbackText).trim().slice(0, 50);

        try {
            const loc = page.getByText(cleanFallback, { exact: false }).first();
            const box = await loc.boundingBox({ timeout: 4000 });

            if (box) {
                const jitter = naturalJitter(4);
                const x = Math.round(box.x + box.width / 2 + jitter.dx);
                const y = Math.round(box.y + box.height / 2 + jitter.dy);
                await humanClickAt(page, x, y, options);
                await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
                return { success: true, method: 'text+human-cursor' };
            }
        } catch (e) {
            console.warn(`[HumanClick] Text strategy failed: ${e.message}`);
        }

        // ── Strategy 3: JavaScript force-click (last resort — no cursor movement) ──
        // Uses string-based page.evaluate() so Babel never polyfills indexOf inside it.
        // Also uses the same cleaned single-line search term.
        const jsCode = `(function() {
            var target = ${JSON.stringify(cleanFallback.toLowerCase())};
            var els = document.querySelectorAll('button,a,div,span,li,[role="button"],[role="option"]');
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                var content = (el.innerText || '').replace(/^\\s+|\\s+$/g,'').toLowerCase();
                if (content.indexOf(target) !== -1) { el.click(); return true; }
            }
            return false;
        })()`;
        const found = await page.evaluate(jsCode);

        if (found) {
            await actionCooldown();
            return { success: true, method: 'js-force' };
        }
    }

    return {
        success: false,
        method: 'none',
        error: `No element matched selector "${selector}" or text "${fallbackText}"`
    };
}

/**
 * Reset cursor position to viewport center (use after a new page loads).
 *
 * @param {import('playwright').Page} page
 */
export async function resetCursorToCenter(page) {
    try {
        const viewport = page.viewportSize();
        if (viewport) {
            _cursorX = viewport.width  / 2;
            _cursorY = viewport.height / 2;
            await page.mouse.move(_cursorX, _cursorY);
            await updateCursorPosition(page, _cursorX, _cursorY);
        }
    } catch { /* silent */ }
}

/** Expose current cursor position for state inspection */
export function getCursorPosition() {
    return { x: _cursorX, y: _cursorY };
}
