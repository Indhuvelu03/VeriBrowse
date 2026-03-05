/**
 * interactionEngine.js
 *
 * The single, authoritative dispatcher for all human-like browser interactions.
 *
 * ─── CONTRACT ─────────────────────────────────────────────────────────────
 *
 *   The planner and agent MUST call:
 *       await InteractionEngine.execute(page, descriptor)
 *
 *   They MUST NOT call raw Playwright click/fill/scroll directly — that
 *   bypasses cursor animation, human timing, and fingerprint evasion.
 *
 * ─── SUPPORTED ACTION TYPES ───────────────────────────────────────────────
 *
 *   type: 'click'
 *     selector?  — CSS selector
 *     text?      — fallback visible text
 *     important? — add hesitation before click (default: false)
 *     fast?      — reduced cursor steps (default: false)
 *
 *   type: 'type'
 *     selector   — CSS selector of the input
 *     text       — string to type
 *     clear?     — clear field first (default: true)
 *     pressEnter?— press Enter after typing (default: false)
 *
 *   type: 'scroll'
 *     direction? — 'up' | 'down' (default: 'down')
 *     amount?    — pixels | 'screen' | 'half' | 'full' | 'top' (default: 'screen')
 *     selector?  — scroll a specific container element
 *     profile?   — 'read' | 'skim' | 'fast' (default: 'skim')
 *
 *   type: 'hover'
 *     selector   — CSS selector to hover
 *
 *   type: 'navigate'
 *     url        — full URL to navigate to
 *
 *   type: 'wait'
 *     amount?    — ms to wait (default: random 500-1200ms)
 *
 * ─── RETURN VALUE ─────────────────────────────────────────────────────────
 *
 *   All `execute()` calls return:
 *   { success: boolean, method?: string, error?: string }
 *
 * ─── LIFECYCLE ────────────────────────────────────────────────────────────
 *
 *   InteractionEngine.prepare(page)   — call once per new page load to inject cursor
 *   InteractionEngine.execute(page, descriptor) — run an action
 *   InteractionEngine.cleanup(page)   — remove cursor overlay
 */

import { initCursor, removeCursor } from './cursorManager.js';
import { humanClickElement, resetCursorToCenter } from './humanClick.js';
import { humanScrollBy, humanScrollElement } from './humanScroll.js';
import { humanType } from './humanType.js';
import { randomDelay, hesitation, pageLoadSettle } from './humanTiming.js';

// ─── Internal state ───────────────────────────────────────────────────────
// Track which pages have had the cursor injected this session
const _initializedPages = new WeakSet();

// ─── Lifecycle ────────────────────────────────────────────────────────────

/**
 * prepare — inject cursor overlay and reset cursor position to page center.
 * Call after every new page load / navigation.
 *
 * @param {import('playwright').Page} page
 */
async function prepare(page) {
    try {
        // Wait for page to be in a stable, interactive state
        // (body must exist + network relatively quiet for cursor inject)
        await page.waitForSelector('body', { state: 'attached', timeout: 5000 }).catch(() => {});

        await initCursor(page);
        if (!_initializedPages.has(page)) {
            await resetCursorToCenter(page);
            _initializedPages.add(page);
        }
    } catch (e) {
        console.warn('[InteractionEngine] prepare failed (non-fatal):', e.message);
    }
}

/**
 * cleanup — remove cursor overlay from page.
 * Optional — navigations auto-destroy it anyway.
 *
 * @param {import('playwright').Page} page
 */
async function cleanup(page) {
    try {
        await removeCursor(page);
        _initializedPages.delete(page);
    } catch { /* silent */ }
}

// ─── Action Handlers (private) ────────────────────────────────────────────

async function _handleClick(page, descriptor) {
    await prepare(page);

    const result = await humanClickElement(
        page,
        descriptor.selector || null,
        descriptor.text     || null,
        {
            important: descriptor.important || false,
            fast:      descriptor.fast      || false,
        }
    );

    if (!result.success) {
        throw new Error(result.error || 'Click failed — no matching element');
    }

    return result;
}

async function _handleType(page, descriptor) {
    await prepare(page);

    // Wait for any input to be visible on the page — SPAs often render inputs late
    try {
        await page.waitForSelector('input:visible, textarea:visible', { timeout: 8000 });
    } catch {
        // Continue — maybe the provided selector will work anyway
    }

    if (!descriptor.text) throw new Error('[InteractionEngine] type: no text provided');

    const result = await humanType(
        page,
        descriptor.selector || null,
        descriptor.text,
        {
            clear:          descriptor.clear       !== false,
            pressEnter:     descriptor.pressEnter  || false,
            waitAfterEnter: descriptor.waitAfter   || 1500,
            moveCursor:     true,
            fieldHint:      descriptor.fieldHint   || null,
        }
    );

    if (result?.usedSelector) {
        console.log(`[InteractionEngine] Type target → ${result.usedSelector}`);
    }

    return result;
}

async function _handleScroll(page, descriptor) {
    await prepare(page);

    if (descriptor.selector) {
        await humanScrollElement(
            page,
            descriptor.selector,
            descriptor.direction === 'up' ? -(descriptor.amount || 300) : (descriptor.amount || 300),
            { profile: descriptor.profile || 'skim' }
        );
    } else {
        await humanScrollBy(
            page,
            descriptor.amount    || 'screen',
            descriptor.direction || 'down',
            { profile: descriptor.profile || 'skim' }
        );
    }

    return { success: true, method: 'human-scroll' };
}

async function _handleHover(page, descriptor) {
    await prepare(page);

    if (!descriptor.selector) throw new Error('[InteractionEngine] hover: selector required');

    try {
        await page.waitForSelector(descriptor.selector, { state: 'visible', timeout: 5000 });
        const box = await page.locator(descriptor.selector).first().boundingBox();
        if (box) {
            const { moveCursorTo } = await import('./humanClick.js');
            const x = Math.round(box.x + box.width / 2);
            const y = Math.round(box.y + box.height / 2);
            await moveCursorTo(page, x, y);
            await randomDelay(200, 500);
        }
        return { success: true, method: 'hover' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function _handleNavigate(page, descriptor) {
    if (!descriptor.url) throw new Error('[InteractionEngine] navigate: url required');

    let url = descriptor.url.trim();
    if (!url.startsWith('http')) url = `https://${url}`;

    try {
        // Use 'load' + extra settle for heavy SPAs like Amazon
        await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (e) {
        // Even partial load is okay — continue
        console.warn('[InteractionEngine] Navigation did not fully settle:', e.message);
    }

    // Wait for page to be truly interactive (body exists + network quiet)
    try {
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForSelector('body', { state: 'attached', timeout: 5000 });
    } catch { /* proceed anyway */ }

    // Allow JS frameworks to render
    await pageLoadSettle();
    await pageLoadSettle(); // double for heavy SPAs

    // After navigation, reinit cursor on the new page content
    if (_initializedPages.has(page)) _initializedPages.delete(page);
    await prepare(page);

    return { success: true, method: 'navigate' };
}

async function _handleWait(page, descriptor) {
    const ms = descriptor.amount || null;
    if (ms) {
        await randomDelay(ms * 0.8, ms * 1.2);
    } else {
        await randomDelay(500, 1200);
    }
    return { success: true, method: 'wait' };
}

// ─── Dispatch Table ───────────────────────────────────────────────────────

const HANDLERS = {
    click:    _handleClick,
    type:     _handleType,
    scroll:   _handleScroll,
    hover:    _handleHover,
    navigate: _handleNavigate,
    wait:     _handleWait,
};

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Execute a single browser interaction with full human-like behaviour.
 *
 * @param {import('playwright').Page} page — Playwright page object
 * @param {{
 *   type: 'click' | 'type' | 'scroll' | 'hover' | 'navigate' | 'wait',
 *   selector?: string,
 *   text?: string,
 *   url?: string,
 *   direction?: 'up' | 'down',
 *   amount?: number | string,
 *   important?: boolean,
 *   fast?: boolean,
 *   clear?: boolean,
 *   pressEnter?: boolean,
 *   profile?: 'read' | 'skim' | 'fast',
 *   waitAfter?: number,
 * }} descriptor
 *
 * @returns {Promise<{ success: boolean, method?: string, error?: string }>}
 */
async function execute(page, descriptor) {
    if (!page || !descriptor || !descriptor.type) {
        throw new Error('[InteractionEngine] execute: page and descriptor.type are required');
    }

    const handler = HANDLERS[descriptor.type.toLowerCase()];
    if (!handler) {
        throw new Error(`[InteractionEngine] Unknown action type: "${descriptor.type}"`);
    }

    try {
        console.log(`[InteractionEngine] ▶ ${descriptor.type.toUpperCase()}${descriptor.selector ? ' → ' + descriptor.selector : ''}${descriptor.text ? ' "' + descriptor.text.slice(0, 30) + '"' : ''}${descriptor.url ? ' → ' + descriptor.url : ''}`);
        const result = await handler(page, descriptor);
        console.log(`[InteractionEngine] ✓ ${descriptor.type} — ${result.method || 'ok'}`);
        return result;
    } catch (err) {
        console.error(`[InteractionEngine] ✗ ${descriptor.type} failed: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// ─── Export as a unified engine object ───────────────────────────────────

const InteractionEngine = {
    /** Inject cursor + reset position after page load */
    prepare,
    /** Run any interaction action */
    execute,
    /** Remove cursor overlay */
    cleanup,
};

export default InteractionEngine;
