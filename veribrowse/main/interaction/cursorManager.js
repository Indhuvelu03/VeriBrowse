/**
 * cursorManager.js
 *
 * Injects a visible floating cursor overlay into the target Playwright page.
 * The cursor mirrors the actual mouse position produced by Playwright's
 * page.mouse.move() calls so users watching the session see natural movement.
 *
 * WHY a custom cursor:
 *   Playwright's virtual mouse generates real OS-level events, but those
 *   events are invisible on screen recordings unless a cursor overlay exists.
 *   Fellou.ai-style recordings always show a clearly visible cursor moving
 *   with intent. This module provides exactly that.
 *
 * Implementation:
 *   • Cursor is a <div id="__vb_cursor__"> injected into the page's <body>.
 *   • CSS: position:fixed; pointer-events:none; z-index:2147483647 (max).
 *   • Position is updated by calling page.evaluate() after each mouse.move().
 *   • The cursor div uses a CSS transition so fractional position updates
 *     animate smoothly without JS animation loops.
 *   • A "clicking" CSS class briefly scales the cursor down to simulate
 *     the physical click gesture.
 *
 * Page lifecycle:
 *   • init(page)  — inject on each new page / navigation
 *   • updatePosition(page, x, y) — sync to Playwright mouse position
 *   • showClickFeedback(page) — brief scale animation on click
 *   • remove(page) — clean up (optional; page navigation auto-removes it)
 */

// ─── Cursor HTML/CSS injected into the target page ────────────────────────

/**
 * The script string evaluated inside the target page to create and position
 * the cursor element. We keep this as a self-contained IIFE so it survives
 * across page.evaluate() calls with no module scope leakage.
 */
const CURSOR_INJECT_SCRIPT = `
(function () {
    // Guard: body not ready (page still parsing) — abort silently
    if (!document.body) return;

    // Guard: don't inject twice on the same page
    if (document.getElementById('__vb_cursor__')) return;

    var el = document.createElement('div');
    el.id = '__vb_cursor__';

    // ── Laser Cursor (Glowing Red Dot) ──
    el.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 0',
        'height: 0',
        'pointer-events: none',
        'z-index: 2147483647',
        'transform: translate(0px, 0px)',
        // CSS transition handles intra-step smoothness (very short, 8ms)
        // Longer transitions make cursor lag behind actual events — avoid.
        'transition: transform 8ms linear',
        'will-change: transform',
    ].join('; ');

    // Inner dot to denote the "hotspot" of the cursor precisely
    var dot = document.createElement('div');
    dot.id = '__vb_cursor_dot__';
    dot.style.cssText = [
        'position: absolute',
        'top: -3px',
        'left: -3px',
        'width: 6px',
        'height: 6px',
        'border-radius: 50%',
        'background: #ff0000',
        'box-shadow: 0 0 8px rgba(255,0,0,0.9), 0 0 16px rgba(255,0,0,0.5)',
        'pointer-events: none',
    ].join('; ');

    // Click ripple element: expands on click to show visual feedback
    var ripple = document.createElement('div');
    ripple.id = '__vb_cursor_ripple__';
    ripple.style.cssText = [
        'position: absolute',
        'top: -8px',
        'left: -8px',
        'width: 20px',
        'height: 20px',
        'border-radius: 50%',
        'border: 1.5px solid rgba(99, 179, 237, 0.75)',
        'opacity: 0',
        'transform: scale(0.3)',
        'pointer-events: none',
        'transition: transform 200ms ease-out, opacity 200ms ease-out',
    ].join('; ');

    el.appendChild(dot);
    el.appendChild(ripple);
    document.body.appendChild(el);
})();
`;

/**
 * Script to update cursor position inside the page.
 * Called after every incremental page.mouse.move() step.
 */
function buildMoveScript(x, y) {
    return `
(function () {
    var el = document.getElementById('__vb_cursor__');
    if (el) el.style.transform = 'translate(' + ${x} + 'px, ' + ${y} + 'px)';
})();
`;
}

/**
 * Click feedback: ripple expands → fades, cursor dot briefly dims.
 */
const CLICK_FEEDBACK_SCRIPT = `
(function () {
    var ripple = document.getElementById('__vb_cursor_ripple__');
    if (!ripple) return;
    // Reset
    ripple.style.transition = 'none';
    ripple.style.transform   = 'scale(0.3)';
    ripple.style.opacity     = '1';
    // Force reflow
    ripple.offsetWidth;
    // Animate out
    ripple.style.transition  = 'transform 220ms ease-out, opacity 220ms ease-out';
    ripple.style.transform   = 'scale(1.4)';
    ripple.style.opacity     = '0';
})();
`;

/**
<<<<<<< Updated upstream
 * Script to set the cursor transition duration before a movement begins.
 * Called once per moveCursorTo() instead of updating position per-step.
 */
function buildTransitionScript(durationMs) {
    return `
(function () {
    var el = document.getElementById('__vb_cursor__');
    if (el) el.style.transition = 'transform ' + ${durationMs} + 'ms linear';
=======
 * Show a bounding box around the target element.
 */
function buildBoundingBoxScript(x, y, width, height) {
    return `
(function () {
    var id = '__vb_cursor_bbox__';
    var el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        document.body.appendChild(el);
    }
    el.style.cssText = [
        'position: fixed',
        'top: ' + ${y} + 'px',
        'left: ' + ${x} + 'px',
        'width: ' + ${width} + 'px',
        'height: ' + ${height} + 'px',
        'border: 2px solid #ff0000',
        'background: rgba(255, 0, 0, 0.1)',
        'box-shadow: 0 0 10px rgba(255,0,0,0.5)',
        'pointer-events: none',
        'z-index: 2147483646',
        'transition: all 150ms ease-out',
    ].join('; ');
>>>>>>> Stashed changes
})();
`;
}

<<<<<<< Updated upstream
=======
/**
 * Hide the bounding box.
 */
const HIDE_BBOX_SCRIPT = `
(function () {
    var el = document.getElementById('__vb_cursor_bbox__');
    if (el) el.style.opacity = '0';
})();
`;

>>>>>>> Stashed changes
// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Inject the cursor overlay into the page if not already present.
 * Safe to call multiple times — guarded internally.
 *
 * @param {import('playwright').Page} page
 */
export async function initCursor(page) {
    try {
        // Skip blank/unloaded pages (Gemini rejects screenshots of them too)
        const url = page.url();
        if (!url || url === 'about:blank' || url === 'about:newtab') return;

        // Wait for body to exist — Amazon and SPAs can take a while
        await page.waitForSelector('body', { state: 'attached', timeout: 8000 }).catch(() => { });

        await page.evaluate(CURSOR_INJECT_SCRIPT);
    } catch (e) {
        // Non-fatal — page may have CSP restrictions; automation still works
        console.warn('[CursorManager] Could not inject cursor overlay:', e.message);
    }
}

/**
 * Update the cursor overlay's on-screen position.
 * Must be called in sync with page.mouse.move() so the visual matches reality.
 *
 * @param {import('playwright').Page} page
 * @param {number} x - viewport-relative X coordinate
 * @param {number} y - viewport-relative Y coordinate
 */
export async function updateCursorPosition(page, x, y) {
    try {
        await page.evaluate(buildMoveScript(x, y));
    } catch {
        // Silent — cursor overlay is purely cosmetic
    }
}

/**
 * Set the CSS transition duration on the cursor overlay.
 * Call ONCE before starting a movement so the overlay animates smoothly
 * from current position to final position with a single updateCursorPosition
 * call, rather than requiring per-step updates.
 *
 * @param {import('playwright').Page} page
 * @param {number} durationMs - transition duration in milliseconds
 */
export async function setCursorTransitionDuration(page, durationMs) {
    try {
        await page.evaluate(buildTransitionScript(durationMs));
    } catch {
        // Silent — cursor overlay is purely cosmetic
    }
}

/**
 * Trigger the click feedback animation on the cursor overlay.
 * Call immediately after page.mouse.click() or page.mouse.down().
 *
 * @param {import('playwright').Page} page
 */
export async function showClickFeedback(page) {
    try {
        await page.evaluate(CLICK_FEEDBACK_SCRIPT);
    } catch {
        // Silent
    }
}

/**
 * Show a bounding box overlay on the page.
 * @param {import('playwright').Page} page
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
export async function showBoundingBox(page, x, y, width, height) {
    try {
        await page.evaluate(buildBoundingBoxScript(x, y, width, height));
    } catch { } // Silent
}

/**
 * Hide the bounding box overlay.
 * @param {import('playwright').Page} page
 */
export async function hideBoundingBox(page) {
    try {
        await page.evaluate(HIDE_BBOX_SCRIPT);
    } catch { } // Silent
}

/**
 * Remove the cursor overlay from the page.
 * Optional — navigations auto-destroy the injected DOM anyway.
 *
 * @param {import('playwright').Page} page
 */
export async function removeCursor(page) {
    try {
        await page.evaluate(`
            var el = document.getElementById('__vb_cursor__');
            if (el) el.parentNode.removeChild(el);
        `);
    } catch {
        // Silent
    }
}
