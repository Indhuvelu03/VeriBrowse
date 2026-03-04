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
    actionCooldown, easeInOut, randomDelay
} from './humanTiming.js';
import { initCursor, updateCursorPosition, showClickFeedback, setCursorTransitionDuration } from './cursorManager.js';

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
    const baseSteps = options.fast ? randInt(6, 12) : randInt(18, 28);

    const startX = _cursorX;
    const startY = _cursorY;

    // Scale arc and step count proportionally to traversal distance.
    const dist = Math.round(Math.hypot(targetX - startX, targetY - startY));
    // Short moves (< 80px) use half the steps — still smooth but snappier
    const steps = dist < 80 ? Math.max(6, Math.round(baseSteps * 0.5)) : baseSteps;

    // Bezier midpoint: arc perpendicular to path, scaled to traversal distance.
    // A fixed ±30px looks natural over 400px but wildly exaggerated over 50px
    // (short clicks to nearby inputs/dropdowns). Proportional scaling keeps the
    // path subtly curved regardless of distance.
    const arcMax = Math.min(Math.round(dist * 0.18), 28); // cap at 28px
    const midX = (startX + targetX) / 2 + randInt(-arcMax, arcMax);
    const midY = (startY + targetY) / 2 + randInt(-Math.round(arcMax * 0.65), Math.round(arcMax * 0.65));

    // Total traversal time budget (ms) — matches the old per-step timing of
    // mouseStepDelay (avg ~12ms × steps). Preserved as a POST-burst sleep so
    // the overall action timeline looks identical to a human from the outside.
    const traversalMs = steps * randInt(8, 16);

    // Set the cursor overlay CSS transition to cover the full traversal time.
    // The overlay will glide from its current position to targetX/targetY
    // smoothly using ONE CSS animation — no per-step page.evaluate() calls.
    await setCursorTransitionDuration(page, traversalMs);

    // Fire all intermediate Playwright mouse events in a tight burst.
    // Without per-step delays they complete in ~30-60ms total (one render frame),
    // so CSS :hover state changes on page elements are imperceptible to the user.
    // The full Bezier trajectory IS sent to the page — anti-bot event fidelity
    // is fully preserved; only the visible timing is collapsed.
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ease = easeInOut(t);

        // Quadratic Bezier: P(t) = (1-t)²·start + 2(1-t)t·mid + t²·target
        const bt = 1 - ease;
        const x = bt * bt * startX + 2 * bt * ease * midX + ease * ease * targetX;
        const y = bt * bt * startY + 2 * bt * ease * midY + ease * ease * targetY;

        // Per-step micro-jitter — decreases near destination for precise landing
        const jitterScale = 1 - Math.pow(t, 2);
        const jitter = naturalJitter(2 * jitterScale);

        const px = Math.round(x + jitter.dx);
        const py = Math.round(y + jitter.dy);

        // Move the real Playwright mouse (fires mousemove events into the page).
        // No delay between steps — hover state changes are sub-frame and invisible.
        await page.mouse.move(px, py);
    }

    // Final precise landing
    await page.mouse.move(targetX, targetY);

    // Single cursor overlay update — CSS transition animates the overlay
    // from startX/startY to targetX/targetY over traversalMs milliseconds.
    await updateCursorPosition(page, targetX, targetY);

    // Hold for the natural traversal duration (anti-bot timing realism).
    // The CSS transition finishes at exactly the same time.
    await randomDelay(traversalMs, traversalMs + 20);

    // Reset CSS transition to near-instant for snap updates (e.g. after clicks).
    await setCursorTransitionDuration(page, 8);

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
            // Scroll the element into the viewport before resolving coordinates.
            // Without this, elements below the fold have coordinates outside the visible
            // area and the cursor "clicks" empty space.
            await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
            const { x, y, found } = await resolveElementCenter(page, selector);

            if (found) {
                // Capture pre-click URL so we can detect navigation AFTER the click.
                // Pre-registering waitForNavigation before humanClickAt is unreliable —
                // GitHub (and other SPAs) fire background framenavigated/pushState events
                // that resolve the listener before the actual click fires, causing the
                // post-click getDOMSnapshot to capture a stale page.
                const preClickUrl = page.url();
                await humanClickAt(page, x, y, options);
                // If navigation already completed during humanClickAt's actionCooldown
                // (URL changed), we're done — no extra wait needed on the fast path.
                // If URL is unchanged, give it up to 2s for a navigation that's still
                // in-flight, or 300ms minimum settle time for non-navigating clicks.
                if (page.url() === preClickUrl) {
                    // URL unchanged — navigation may be in-flight or not happening.
                    // Give it up to 2s for a pending nav, or 300ms DOM settle.
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 }).catch(() => null),
                        page.waitForTimeout(300),
                    ]);
                } else {
                    // URL already changed during humanClickAt's actionCooldown.
                    // Ensure the new page has finished parsing before we return —
                    // if domcontentloaded already fired this resolves instantly,
                    // otherwise waits for the parsing to complete.
                    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
                }
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
                const preClickUrl2 = page.url();
                await humanClickAt(page, x, y, options);
                if (page.url() === preClickUrl2) {
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 }).catch(() => null),
                        page.waitForTimeout(300),
                    ]);
                } else {
                    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
                }
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
            var els = document.querySelectorAll('button,a,div,span,li,[role="button"],[role="option"],[role="checkbox"],[role="menuitem"],input[type="checkbox"],input[type="radio"],label');
            var bestEl = null;
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                var content = (el.innerText || el.value || '').replace(/^\\s+|\\s+$/g,'').toLowerCase();
                if (content.indexOf(target) !== -1) {
                    if (!bestEl || bestEl.contains(el)) { bestEl = el; }
                }
            }
            if (bestEl) { bestEl.click(); return true; }
            return false;
        })()`;
        const found = await page.evaluate(jsCode);

        if (found) {
            // Sync cursor position so the next Bezier move starts from the correct
            // location. JS force-click bypasses humanClickAt, so _cursorX/_cursorY
            // would otherwise point to wherever the last animated click landed.
            try {
                const loc = page.getByText(cleanFallback, { exact: false }).first();
                const box2 = await loc.boundingBox({ timeout: 1000 });
                if (box2) {
                    _cursorX = Math.round(box2.x + box2.width / 2);
                    _cursorY = Math.round(box2.y + box2.height / 2);
                    await updateCursorPosition(page, _cursorX, _cursorY).catch(() => {});
                }
            } catch { /* non-fatal — cursor stays at last animated position */ }

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
            _cursorX = viewport.width / 2;
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
