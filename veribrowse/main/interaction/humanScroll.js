/**
 * humanScroll.js
 *
 * Human-like scrolling: breaks large scroll amounts into small increments
 * with natural easing and randomised pacing.
 *
 * WHY:
 *   `window.scrollTo(0, 9000)` is teleportation — immediately obvious in
 *   any recording. Real scroll wheels fire 15–30 events, each moving 60–120px,
 *   with a characteristic ease-in / gradual-ease-out velocity curve.
 *   This module replicates that profile precisely.
 *
 * Scroll profiles:
 *   'read'   — slow, deliberate (reading content as you scroll)
 *   'skim'   — medium speed (scanning for a target element)
 *   'fast'   — quick navigation to top/bottom
 *
 * Uses Playwright's page.mouse.wheel() which fires native WheelEvents that
 * the page's own JS sees — important for infinite-scroll sites.
 */

import {
    randomDelay, randInt, easeInOut, scrollStepDelay, actionCooldown
} from './humanTiming.js';

// ─── Scroll Profiles ─────────────────────────────────────────────────────

const PROFILES = {
    read: { chunkMin: 50, chunkMax: 100, stepDelayMin: 40, stepDelayMax: 90, pauseChance: 0.20 },
    skim: { chunkMin: 80, chunkMax: 150, stepDelayMin: 25, stepDelayMax: 60, pauseChance: 0.10 },
    fast: { chunkMin: 120, chunkMax: 220, stepDelayMin: 12, stepDelayMax: 30, pauseChance: 0.05 },
};

// ─── Internal helpers ────────────────────────────────────────────────────

/**
 * Get current scroll Y position of the page.
 */
async function getScrollY(page) {
    return await page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0);
}

/**
 * Get the maximum scrollable height of the page.
 */
async function getMaxScroll(page) {
    return await page.evaluate(() =>
        document.documentElement.scrollHeight - document.documentElement.clientHeight
    );
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Scroll the page by `deltaY` pixels using natural, human-like motion.
 *
 * Positive deltaY → scroll down (content moves up).
 * Negative deltaY → scroll up (content moves down).
 *
 * The motion uses an ease-in-out profile: slow start, peak velocity at middle,
 * gradual deceleration at the end — exactly like a real trackpad or scroll wheel.
 *
 * @param {import('playwright').Page} page
 * @param {number} deltaY      - total scroll distance in pixels (may be negative)
 * @param {{ profile?: 'read' | 'skim' | 'fast' }} [options]
 */
export async function humanScroll(page, deltaY, options = {}) {
    const profile = PROFILES[options.profile || 'skim'];
    const direction = deltaY >= 0 ? 1 : -1;
    const totalDistance = Math.abs(deltaY);

    // Decompose total distance into variable-sized chunks
    const chunks = [];
    let remaining = totalDistance;

    while (remaining > 0) {
        // Natural chunk size: mostly moderate, sometimes a big swipe
        const big = Math.random() < 0.15; // 15% chance of a larger flick
        const chunk = big
            ? Math.min(remaining, randInt(profile.chunkMax, profile.chunkMax * 2))
            : Math.min(remaining, randInt(profile.chunkMin, profile.chunkMax));
        chunks.push(chunk);
        remaining -= chunk;
    }

    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
        const t = i / Math.max(totalChunks - 1, 1);

        // Ease-in-out scaling: chunks near start and end move slower
        const speedScale = easeInOut(Math.min(t * 1.5, 1)); // bias toward faster middle
        const scaledChunk = Math.round(chunks[i] * (0.5 + speedScale * 0.7));

        // Fire the actual wheel event  
        await page.mouse.wheel(0, direction * Math.max(scaledChunk, 20));

        // Step delay with natural variance
        const delay = randInt(profile.stepDelayMin, profile.stepDelayMax);
        await randomDelay(delay, delay + 10);

        // Occasional reading pause — simulates pausing to scan content
        if (Math.random() < profile.pauseChance) {
            await randomDelay(120, 350);
        }
    }

    // Final settle: wait for lazy-loaded content, infinite-scroll triggers, etc.
    await actionCooldown();
}

/**
 * Scroll the page down by a relative amount using a named target.
 *
 * Convenience shorthand:
 *   - 'screen'  → scroll by ~viewport height (most common human action)
 *   - 'half'    → scroll half viewport
 *   - 'full'    → jump to very bottom (fast profile)
 *   - 'top'     → jump to very top (fast profile)
 *
 * @param {import('playwright').Page} page
 * @param {'screen' | 'half' | 'full' | 'top' | number} amount
 * @param {'up' | 'down'} [direction]
 * @param {{ profile?: 'read' | 'skim' | 'fast' }} [options]
 */
export async function humanScrollBy(page, amount, direction = 'down', options = {}) {
    const dir = direction === 'up' ? -1 : 1;

    if (amount === 'top') {
        const current = await getScrollY(page);
        await humanScroll(page, -current, { profile: 'fast' });
        return;
    }

    if (amount === 'full') {
        const maxScroll = await getMaxScroll(page);
        const current = await getScrollY(page);
        await humanScroll(page, dir * (maxScroll - current), { profile: 'fast' });
        return;
    }

    // Numeric pixel amount
    if (typeof amount === 'number') {
        await humanScroll(page, dir * amount, options);
        return;
    }

    // Viewport-relative amounts
    const viewportHeight = page.viewportSize()?.height || 768;
    const pixelAmount = amount === 'half'
        ? Math.round(viewportHeight * 0.5)
        : Math.round(viewportHeight * 0.9); // 'screen' default

    await humanScroll(page, dir * pixelAmount, options);
}

/**
 * Scroll a specific ELEMENT (not the whole page) into view, then scroll within it.
 * Used for dropdowns, sidebars, and overflow containers.
 *
 * @param {import('playwright').Page} page
 * @param {string} containerSelector - CSS selector of the scrollable container
 * @param {number} deltaY
 * @param {{ profile?: 'read' | 'skim' | 'fast' }} [options]
 */
export async function humanScrollElement(page, containerSelector, deltaY, options = {}) {
    // First scroll the container into the viewport
    try {
        await page.locator(containerSelector).first().scrollIntoViewIfNeeded();
        await randomDelay(100, 250);
    } catch { /* container may already be in view */ }

    // Click the container to focus scroll context
    try {
        await page.locator(containerSelector).first().hover();
        await randomDelay(60, 140);
    } catch { /* mouse hover optional */ }

    // Use wheel events — they respect the hovered element's scroll context
    await humanScroll(page, deltaY, options);
}
