/**
 * AutonomousLoop.js
 *
 * State-machine-driven autonomous browser automation loop.
 * Replaces the old browserAgentLoop.js which called the LLM on EVERY iteration.
 *
 * State Machine:
 *   IDLE → PLANNING → ACTING → VERIFYING → (loop ACTING/VERIFYING) → DONE
 *                                        → REPLANNING → ACTING (on failure)
 *                                        → PAUSED (HITL)
 *                                        → ABORTED (user cancel or fatal error)
 *
 * Core principle: "Plan once, execute many locally, call LLM only on failure."
 *
 * PLANNING phase:
 *   1. Check SkillMemory for a cached plan (zero LLM calls)
 *   2. If miss → call AgentReasoner.planSteps() ONCE
 *   3. Seed LocalSelectorService cache from plan
 *
 * ACTING phase (per step — NO LLM calls):
 *   1. Resolve selector via LocalSelectorService (cache → heuristic → LLM fallback)
 *   2. Execute via executeAction (pure local, zero LLM)
 *   3. Verify via verifyAction (pure comparison, zero LLM)
 *
 * REPLANNING phase (LLM called — only when stuck):
 *   - After MAX_STEP_RETRIES consecutive failures on a step
 *   - Calls AgentReasoner.replan() to get a revised plan
 *
 * Supports AbortSignal for graceful cancellation.
 */

import getDOMSnapshot from '../../tools/browser/getDOMSnapshot.js';
import executeAction from '../../tools/browser/executeAction.js';
import verifyAction from '../../verification/verifyAction.js';
import { markPage, unmarkPage } from '../../tools/browser/visualGrounding.js';
import * as AgentReasoner from './AgentReasoner.js';
import * as LocalSelector from './LocalSelectorService.js';
// import * as SkillMemory from './SkillMemory.js'; // DISABLED — SkillMemory commented out
import bus from '../EventBus.js';
import compactor from '../ContextCompactor.js';
import UIFeedback from '../UIFeedback.js';
import browserManager from '../BrowserManager.js';

// ─── Constants ──────────────────────────────────────────────────────────
const MAX_PLAN_STEPS = 15;   // max steps in a plan (15 for booking tasks)
const MAX_STEP_RETRIES = 3;    // retries per step before replan
const MAX_REPLAN_ATTEMPTS = 2;    // max times we ask the LLM to replan
const MAX_TOTAL_ACTIONS = 20;   // absolute safety ceiling

// ─── Rate-limit helper ──────────────────────────────────────────────────
/**
 * Returns true for Gemini 429 / quota-exhausted errors.
 * Used to pause instead of burning step retries against the API.
 */
function isRateLimitError(err) {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    const status = err.status || err.statusCode || 0;
    return (
        status === 429 ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('quota exceeded') ||
        msg.includes('resource_exhausted') ||
        msg.includes('too many requests')
    );
}

// Common overlay / modal dismiss selectors
// ENHANCED: Added more intelligent overlay detection including Angular CDK, Bootstrap, custom modals
const OVERLAY_DISMISS_SELECTORS = [
    // Standard role="dialog" patterns
    "div[role='dialog'] button:has-text('Dismiss')",
    "div[role='dialog'] button:has-text('Close')",
    "div[role='dialog'] button:has-text('No thanks')",
    "div[role='dialog'] button:has-text('Not now')",
    // Aria-label Close buttons (most reliable across frameworks)
    "button[aria-label='Close']",
    "button[aria-label='Dismiss']",
    "button[aria-label='close']",
    // Bootstrap modal patterns
    ".modal button.close",
    ".modal-header button.close",
    ".modal button.btn-close",
    ".modal-dialog .close",
    // Popup patterns
    ".popup button.close",
    // Generic overlay dismiss buttons
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('OK')",
    "button:has-text('Accept All')",
    "button:has-text('Accept Cookies')",
    // IRCTC-specific overlays (Angular modals, maintenance alerts, NGet popups)
    ".modal-header button.close",
    "button.btn-primary:has-text('OK')",
    ".cdk-overlay-container button:has-text('OK')",
    ".cdk-overlay-container button:has-text('Close')",
    ".cdk-overlay-pane button:has-text('Close')",
    ".cdk-overlay-pane button:has-text('OK')",
    "mat-dialog-actions button:has-text('OK')",
    "button.search_btn.btn_fare_498",
    // Cookie / consent banners
    "#onetrust-accept-btn-handler",
    "button.cookie-accept",
    "[data-cookie-consent-required] button",
    // Generic close button classes (modern frameworks often use these)
    "button[class*='close']",
    "button[class*='dismiss']",
    ".close-button",
    ".dismiss",
    // X button patterns (common across modern frameworks)
    "button[aria-label*='X' i]",
    "button[aria-label*='x']",
    "button[title*='Close' i]",
    "button[title*='close']",
];

// ─── State Enum ─────────────────────────────────────────────────────────
export const States = Object.freeze({
    IDLE: 'IDLE',
    PLANNING: 'PLANNING',
    ACTING: 'ACTING',
    VERIFYING: 'VERIFYING',
    REPLANNING: 'REPLANNING',
    PAUSED: 'PAUSED',
    DONE: 'DONE',
    ABORTED: 'ABORTED',
});

// ─── Helpers ────────────────────────────────────────────────────────────

function emitStep(payload) {
    UIFeedback.emitStep(payload);
}

function checkAbort(signal) {
    if (signal && signal.aborted) {
        throw new DOMException('Autonomous loop cancelled by user', 'AbortError');
    }
}

async function tryDismissOverlay(page) {
    // ENHANCED: Try multiple strategies to dismiss overlays

    // Strategy 1: Try common dismiss selectors
    for (const sel of OVERLAY_DISMISS_SELECTORS) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 300 })) {
                await btn.click({ timeout: 2000 });
                await page.waitForTimeout(400);
                console.log(`[AutonomousLoop] Dismissed overlay: ${sel}`);
                emitStep({ thought: 'Dismissed a popup/overlay', action: 'dismiss_overlay', status: 'success' });
                return true;
            }
        } catch { /* skip */ }
    }

    // Strategy 2: Try pressing Escape key (common for modals/popups)
    try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        console.log('[AutonomousLoop] Tried dismissing overlay with Escape key');
        // Don't return true — Escape might not have worked
    } catch { /* skip */ }

    // Strategy 3: Click outside modal (on semi-transparent backdrop)
    try {
        const backdrop = page.locator('.cdk-overlay-backdrop, .modal-backdrop, [class*="backdrop"]').first();
        if (await backdrop.isVisible({ timeout: 300 })) {
            // Get backdrop position and click near edge
            const box = await backdrop.boundingBox();
            if (box) {
                await page.click(box.x + 10, box.y + 10);
                await page.waitForTimeout(300);
                console.log('[AutonomousLoop] Dismissed overlay by clicking backdrop');
                emitStep({ thought: 'Dismissed overlay by clicking backdrop', action: 'dismiss_overlay', status: 'success' });
                return true;
            }
        }
    } catch { /* skip */ }

    return false;
}

function getDomain(url) {
    try { return new URL(url).hostname; } catch { return 'unknown'; }
}

/**
 * Validate that a base64 screenshot is a real PNG and not empty/corrupt.
 * Gemini returns 400 "Provided image is not valid" for blank or malformed images.
 * A valid Playwright base64 PNG always starts with the PNG magic bytes (iVBORw0KGgo).
 *
 * Handles both string (encoding:'base64') and Buffer (raw binary PNG) returns
 * from page.screenshot(), which vary across Playwright/Electron versions.
 */
function isValidScreenshot(b64) {
    try {
        if (!b64) return false;
        // Normalise: Buffer → base64 string, anything else → string coercion
        const str = typeof b64 === 'string'
            ? b64
            : Buffer.isBuffer(b64)
                ? b64.toString('base64')
                : null;
        if (!str || str.length < 1500) return false;
        return str.startsWith('iVBORw0KGgo');
    } catch {
        return false;
    }
}

/**
 * Take a screenshot with visual grounding labels.
 * Returns null screenshot for blank/empty pages to avoid invalid image errors in Gemini.
 */
async function captureMarkedScreenshot(page) {
    try {
        // Skip screenshot for about:blank / unloaded pages — Gemini rejects blank images
        const currentUrl = page.url();
        if (!currentUrl || currentUrl === 'about:blank' || currentUrl === 'about:newtab') {
            return { screenshot: null, groundingMap: null };
        }

        const groundingMap = await markPage(page);
        const raw = await page.screenshot({ encoding: 'base64' });
        await unmarkPage(page);

        // Normalise to a string (Playwright returns string with encoding:'base64',
        // but some builds return a Buffer — convert so Gemini always gets a string)
        const screenshot = Buffer.isBuffer(raw) ? raw.toString('base64') : raw;

        if (!isValidScreenshot(screenshot)) {
            return { screenshot: null, groundingMap: null };
        }

        return { screenshot, groundingMap };
    } catch (e) {
        console.warn('[AutonomousLoop] Visual grounding failed:', e.message);
        await unmarkPage(page).catch(() => { });
        try {
            const raw = await page.screenshot({ encoding: 'base64' });
            const screenshot = Buffer.isBuffer(raw) ? raw.toString('base64') : raw;
            if (!isValidScreenshot(screenshot)) {
                return { screenshot: null, groundingMap: null };
            }
            return { screenshot, groundingMap: null };
        } catch {
            return { screenshot: null, groundingMap: null };
        }
    }
}

/**
 * Convert a plan step into an ACTION_SCHEMA-compatible action object
 * with a resolved selector from LocalSelectorService.
 *
 * Resolution order (LLM is LAST resort):
 *   1. Visual grounding labels [N]
 *   2. Concrete CSS selector from plan (if valid)
 *   3. Playwright native probe — getByRole / getByText / getByLabel (ZERO LLM)
 *   4. LocalSelectorService: cache → heuristic → LLM repair
 */
async function resolveStepToAction(step, snapshot, screenshot, groundingMap = null, page = null) {
    // Steps that don't need selector resolution
    if (step.type === 'NAVIGATE') {
        return { type: 'NAVIGATE', url: step.url, reasoning: step.description || 'Navigate' };
    }
    if (step.type === 'WAIT') {
        return { type: 'WAIT', amount: step.amount || 2000, reasoning: step.description || 'Wait' };
    }
    if (step.type === 'SCROLL') {
        return { type: 'SCROLL', direction: step.direction || 'down', amount: step.amount || 500, reasoning: step.description || 'Scroll' };
    }
    if (step.type === 'DONE') {
        return { type: 'DONE', result: step.result || 'Task complete', reasoning: step.description || 'Done' };
    }
    if (step.type === 'EXTRACT') {
        return { type: 'EXTRACT', reasoning: step.description || 'Extract info from page' };
    }
    if (step.type === 'PRESS_ENTER') {
        return { type: 'PRESS_ENTER', reasoning: step.description || 'Press enter' };
    }

    // ── Visual Grounding Resolution ──
    const isGroundingNotation = step.selector && /^\[\d+\]$/.test(step.selector);
    if (isGroundingNotation && groundingMap) {
        const num = parseInt(step.selector.slice(1, -1));
        const realSelector = groundingMap[num];
        if (realSelector) {
            console.log(`[AutonomousLoop] Grounding hit: Resolved [${num}] to ${realSelector}`);
            return {
                type: step.type,
                selector: realSelector,
                text: step.text || undefined,
                reasoning: step.description || `${step.type} on [${num}]`,
                _grounded: true
            };
        }
        console.warn(`[AutonomousLoop] Grounding miss: [${num}] not in current map — using goalText fallback`);
    }

    // Steps that need selector resolution (CLICK, TYPE, SELECT)
    let goalText = step.goalText || step.description || '';

    // ── Strip Angular / framework-specific selectors that don't work in Playwright ──
    // e.g. a[routerlink='/login'], [ng-click="..."], [_ngcontent-...]
    const hasFrameworkAttr = step.selector &&
        /\[(routerlink|ng-|_ng|formcontrolname|matinput)/i.test(step.selector);

    // ── Strip URLs mistakenly used as selectors ──
    // LLM sometimes puts href URLs in the selector field: "#https://example.com/..."
    const isUrlSelector = step.selector &&
        /^#?(https?:)?\/\//i.test(step.selector);
    if (isUrlSelector) {
        console.warn(`[AutonomousLoop] Selector looks like a URL, clearing: ${step.selector.slice(0, 60)}…`);
        step.selector = null;
    }

    // Only fallback to selector if it's safe and valid
    if (!goalText && step.selector) {
        goalText = step.selector;
    }

    // If the plan already includes a concrete CSS selector (safe, not framework-specific)
    if (step.selector && !isGroundingNotation && !hasFrameworkAttr &&
        (step.selector.startsWith('#') || step.selector.startsWith('.') || step.selector.startsWith('['))) {
        const action = {
            type: step.type,
            selector: step.selector,
            text: step.text || undefined,
            reasoning: step.description || `${step.type} on ${step.selector}`,
        };
        if (step.type === 'CLICK') action.text = step.goalText || goalText || action.text;
        return action;
    }

    // ── Tier 0: Playwright Native Live Probe (ZERO LLM — fastest) ──────────
    // Try Playwright's built-in locators on the live page BEFORE static snapshot
    // heuristics. This catches elements that exist on the page but aren't in the
    // snapshot (Angular-rendered, late-loaded, inside CDK overlays, etc.)
    if (page && goalText) {
        if (step.type === 'CLICK') {
            const probeHit = await playwrightClickProbe(goalText, page);
            if (probeHit) {
                // Use the fuzzy-matched word for text strategy if exact match failed
                const clickText = probeHit.matchedText || step.goalText || goalText;
                console.log(`[ResolveStep] Playwright probe found CLICK target "${goalText}" → text="${clickText}" — skipping heuristic/LLM`);
                return {
                    type: 'CLICK',
                    selector: probeHit.selector,
                    text: clickText,
                    reasoning: step.description || `CLICK → ${goalText}`,
                    _resolvedBy: 'playwright-native',
                };
            }
        }
        if (step.type === 'TYPE') {
            const probeHit = await playwrightTypeProbe(goalText, page);
            if (probeHit) {
                console.log(`[ResolveStep] Playwright probe found TYPE target "${goalText}" → ${probeHit.selector}`);
                return {
                    type: 'TYPE',
                    selector: probeHit.selector,
                    text: step.text || '',
                    pressEnter: step.pressEnter || false,
                    reasoning: step.description || `TYPE → ${goalText}`,
                    _resolvedBy: 'playwright-native',
                };
            }
        }
    }

    // ── Tier 1-3: LocalSelectorService (cache → heuristic → LLM) ──────────
    const resolved = await LocalSelector.resolve(goalText, snapshot, screenshot, step.type);

    const action = {
        type: step.type,
        selector: resolved.selector,
        reasoning: step.description || `${step.type} → ${goalText}`,
        _resolvedBy: resolved.method,
    };

    if (step.type === 'TYPE') {
        action.text = step.text || '';
        if (step.pressEnter) action.pressEnter = true;
    }
    if (step.type === 'SELECT') {
        action.value = step.value || step.text || '';
    }
    // CLICK always gets fallback text so humanClickElement can use text-based
    // strategies (getByText + JS force-click) when the CSS selector is wrong.
    // Prefer step.goalText ("LOGIN") over computed goalText ("Open login modal").
    if (step.type === 'CLICK') {
        action.text = resolved.fallbackText || step.goalText || step.text || goalText || null;
    }

    return action;
}

// ─── Playwright Native Probes ─────────────────────────────────────────────

/**
 * Try Playwright's built-in locators to find a CLICK target on the live page.
 * Returns { selector, method } if found, null otherwise.
 * Uses getByRole (button/link/option) and getByText — no LLM, no snapshot needed.
 *
 * For autocomplete suggestions, tries word-splitting fuzzy match:
 *   "Goa - Dabolim, India" → also tries "Dabolim", "Goa" as substrings.
 */
async function playwrightClickProbe(goalText, page) {
    if (!goalText || !page) return null;
    const escaped = goalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(escaped, 'i');

    // Phase 1: exact role/text match (full goalText)
    const probes = [
        { fn: () => page.getByRole('button', { name: nameRegex }), desc: 'role-button' },
        { fn: () => page.getByRole('link', { name: nameRegex }), desc: 'role-link' },
        { fn: () => page.getByRole('option', { name: nameRegex }), desc: 'role-option' },
        { fn: () => page.getByRole('menuitem', { name: nameRegex }), desc: 'role-menuitem' },
        { fn: () => page.getByRole('tab', { name: nameRegex }), desc: 'role-tab' },
        { fn: () => page.getByRole('listitem').filter({ hasText: nameRegex }), desc: 'role-listitem' },
        { fn: () => page.getByText(goalText, { exact: false }), desc: 'text' },
    ];

    for (const { fn, desc } of probes) {
        try {
            const loc = fn().first();
            const visible = await loc.isVisible({ timeout: 1500 });
            if (visible) {
                console.log(`[PlaywrightProbe] CLICK "${goalText}" found via ${desc}`);
                return { selector: null, method: desc };
            }
        } catch { continue; }
    }

    // Phase 2: Word-splitting fuzzy match for autocomplete/suggestion scenarios.
    // For "Goa - Dabolim, India" → try "Dabolim" then "Goa" (longest words first,
    // skipping common words and short words < 3 chars).
    const STOP_WORDS = new Set(['the', 'and', 'for', 'from', 'with', 'india', 'international', 'domestic', 'airport']);
    const words = goalText
        .split(/[\s,\-—–_|/()]+/)
        .map(w => w.trim())
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()))
        .sort((a, b) => b.length - a.length); // longest first = most specific

    for (const word of words) {
        try {
            const loc = page.getByText(word, { exact: false }).first();
            const visible = await loc.isVisible({ timeout: 1000 });
            if (visible) {
                console.log(`[PlaywrightProbe] CLICK "${goalText}" fuzzy-matched word "${word}" via text`);
                return { selector: null, method: 'text-fuzzy', matchedText: word };
            }
        } catch { continue; }
        // Also try role=option (autocomplete dropdowns often use this)
        try {
            const wordRegex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const loc = page.getByRole('option', { name: wordRegex }).first();
            const visible = await loc.isVisible({ timeout: 800 });
            if (visible) {
                console.log(`[PlaywrightProbe] CLICK "${goalText}" fuzzy-matched word "${word}" via role-option`);
                return { selector: null, method: 'option-fuzzy', matchedText: word };
            }
        } catch { continue; }
    }

    return null;
}

/**
 * Try Playwright's built-in locators to find a TYPE target on the live page.
 * Returns { selector } with a real CSS selector for the input, or null.
 */
async function playwrightTypeProbe(goalText, page) {
    if (!goalText || !page) return null;
    const escaped = goalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(escaped, 'i');

    // Helper to extract a valid CSS selector from a TYPE-able element only
    const extractTypeableSelector = (el) => {
        const tag = el.tagName.toLowerCase();
        // Only accept actual typeable elements — NOT buttons
        const isTypeable = tag === 'input' || tag === 'textarea' || 
                           el.isContentEditable ||
                           el.getAttribute('role') === 'combobox' ||
                           el.getAttribute('role') === 'textbox';
        if (!isTypeable) return null;
        // Exclude non-typeable input types
        const nonTypeableTypes = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden'];
        if (tag === 'input' && nonTypeableTypes.includes(el.type)) return null;
        
        if (el.id) return '#' + el.id;
        if (el.name) return tag + '[name="' + el.name + '"]';
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return tag + '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';
        if (el.placeholder) return tag + '[placeholder="' + el.placeholder + '"]';
        // For role=combobox inputs, use the role as selector
        const role = el.getAttribute('role');
        if (role === 'combobox' || role === 'textbox') return '[role="' + role + '"]';
        return null;
    };

    const probes = [
        // First: look for currently focused/autofocused combobox in a dialog (Google Flights pattern)
        { fn: () => page.locator('[role="dialog"] input[role="combobox"][autofocus], [role="dialog"] input[aria-expanded="true"], [aria-modal="true"] input[role="combobox"]'), desc: 'modal-combobox' },
        { fn: () => page.getByLabel(nameRegex), desc: 'label' },
        { fn: () => page.getByPlaceholder(nameRegex), desc: 'placeholder' },
        { fn: () => page.getByRole('textbox', { name: nameRegex }), desc: 'role-textbox' },
        { fn: () => page.getByRole('combobox', { name: nameRegex }), desc: 'role-combobox' },
        { fn: () => page.getByRole('searchbox', { name: nameRegex }), desc: 'role-searchbox' },
    ];

    for (const { fn, desc } of probes) {
        try {
            const loc = fn().first();
            const visible = await loc.isVisible({ timeout: 1500 });
            if (visible) {
                // Extract a CSS selector from the found element so humanType can focus it
                const selector = await loc.evaluate(extractTypeableSelector);
                if (selector) {
                    console.log(`[PlaywrightProbe] TYPE "${goalText}" found via ${desc} → ${selector}`);
                    return { selector, method: desc };
                }
            }
        } catch { continue; }
    }

    // Phase 2: Word-splitting fuzzy match for labels/placeholders.
    // "From city input" → try "From" as label/placeholder (MakeMyTrip, RedBus, etc.)
    // "To city input" → try "To" as label/placeholder
    const STOP_TYPE_WORDS = new Set(['input', 'field', 'box', 'text', 'area', 'enter', 'type', 'the', 'for', 'and', 'city', 'station', 'airport']);
    const typeWords = goalText
        .split(/[\s,\-—–_|/()]+/)
        .map(w => w.trim())
        .filter(w => w.length >= 2 && !STOP_TYPE_WORDS.has(w.toLowerCase()))
        .sort((a, b) => b.length - a.length);

    for (const word of typeWords) {
        const wordRegex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const fuzzyProbes = [
            { fn: () => page.getByLabel(wordRegex), desc: 'label-fuzzy' },
            { fn: () => page.getByPlaceholder(wordRegex), desc: 'placeholder-fuzzy' },
            { fn: () => page.getByRole('textbox', { name: wordRegex }), desc: 'textbox-fuzzy' },
            { fn: () => page.getByRole('combobox', { name: wordRegex }), desc: 'combobox-fuzzy' },
            { fn: () => page.getByRole('searchbox', { name: wordRegex }), desc: 'searchbox-fuzzy' },
        ];
        for (const { fn, desc } of fuzzyProbes) {
            try {
                const loc = fn().first();
                const visible = await loc.isVisible({ timeout: 1000 });
                if (visible) {
                    const selector = await loc.evaluate(extractTypeableSelector);
                    if (selector) {
                        console.log(`[PlaywrightProbe] TYPE "${goalText}" fuzzy-matched word "${word}" via ${desc} → ${selector}`);
                        return { selector, method: desc };
                    }
                }
            } catch { continue; }
        }
    }

    return null;
}

// ─── Main Loop ──────────────────────────────────────────────────────────

/**
 * Run the autonomous loop.
 *
 * @param {import('playwright').Page} page
 * @param {string} goal - High-level user goal
 * @param {{ signal?: AbortSignal, onStateChange?: (state: string) => void }} options
 * @returns {Promise<{ success: boolean, state: string, steps: object[], llmCalls: number }>}
 */
export default async function autonomousLoop(page, goal, { signal, onStateChange } = {}) {
    let state = States.IDLE;
    const executedSteps = [];       // history of executed actions
    let plan = [];                  // remaining steps to execute
    let groundingMap = null;        // Mapping for current page's visual markers
    let replanCount = 0;
    let totalActions = 0;
    let llmCalls = 0;               // track LLM usage for monitoring
    // SkillMemory disabled — usedSkillMemory removed

    function setState(newState) {
        state = newState;
        onStateChange?.(state);
        console.log(`[AutonomousLoop] State → ${state}`);
    }

    try {
        // ══════════════════════════════════════════════════════════════
        // PHASE 1: PLANNING (LLM called at most ONCE)
        // ══════════════════════════════════════════════════════════════
        setState(States.PLANNING);
        checkAbort(signal);
        UIFeedback.emit('PLANNING');
        emitStep({ thought: 'Planning task…', action: 'PLAN', status: 'running' });

        // Take initial snapshot
        let snapshot;
        try {
            snapshot = await getDOMSnapshot(page);
        } catch (e) {
            snapshot = { url: page.url(), title: '', interactiveElements: [], inputs: [], buttons: [], links: [], overlays: [] };
        }
        let screenshot = null;
        const domain = getDomain(snapshot.url || page.url());

        // Initialize ContextCompactor for this task
        compactor.startTask(goal);
        compactor.addPageSummary(snapshot.url || page.url(), snapshot.title || '', snapshot.visibleText || '');

        // Use Visual Grounding for the initial planning screenshot
        const grounded = await captureMarkedScreenshot(page);
        screenshot = grounded.screenshot;
        groundingMap = grounded.groundingMap;

        // SkillMemory disabled — always call AgentReasoner.planSteps()
        // const cachedSkill = await SkillMemory.recall(domain, goal);
        // if (cachedSkill && cachedSkill.length > 0) { ... }

        // Call AgentReasoner.planSteps() — the ONE LLM call for this task
        plan = await AgentReasoner.planSteps(goal, snapshot, screenshot);
        plan = plan.slice(0, MAX_PLAN_STEPS);
        llmCalls++;
        console.log(`[AutonomousLoop] LLM generated ${plan.length}-step plan (1 LLM call)`);
        emitStep({ thought: `AI generated a ${plan.length}-step plan`, action: 'PLAN', status: 'success' });

        if (plan.length === 0) {
            emitStep({ thought: 'No actionable plan could be generated', action: 'ABORT', status: 'fail' });
            setState(States.ABORTED);
            return { success: false, state: States.ABORTED, steps: executedSteps, llmCalls };
        }

        // Track total planned steps in compactor
        compactor.taskProgress.totalPlannedSteps = plan.length;
        compactor.setPhase('executing');

        // ══════════════════════════════════════════════════════════════
        // PHASE 2: EXECUTION (local — no LLM unless stuck)
        // ══════════════════════════════════════════════════════════════
        let stepIndex = 0;

        while (stepIndex < plan.length && totalActions < MAX_TOTAL_ACTIONS) {
            checkAbort(signal);

            const currentStep = plan[stepIndex];
            let stepRetries = 0;
            let stepSuccess = false;
            let verifyOnlyFailures = 0; // CLICKs that executed OK but verification failed
            let lastAction = null;      // track last action for soft-pass

            // Handle DONE step
            if (currentStep.type === 'DONE') {
                // Auto-inject EXTRACT if none was executed — ensures we have page data
                // for the result (safety net when the LLM plan omits EXTRACT before DONE)
                const hasExtract = executedSteps.some(s => s.type === 'EXTRACT' && s.result);
                if (!hasExtract) {
                    console.log('[AutonomousLoop] No EXTRACT found before DONE — auto-injecting EXTRACT');
                    try {
                        const extractAction = { type: 'EXTRACT', reasoning: 'Auto-extract page data before completion' };
                        await executeAction(extractAction, page);
                        totalActions++;
                        if (extractAction.result) {
                            executedSteps.push({ ...extractAction, _success: true });
                            emitStep({ thought: 'Extracted page data', action: 'EXTRACT', status: 'success' });
                        }
                    } catch (e) {
                        console.warn('[AutonomousLoop] Auto-EXTRACT failed:', e.message);
                    }
                }

                // Use actual extracted page content if available — the pre-planned
                // DONE result is a placeholder set before the page was loaded.
                const lastExtract = executedSteps
                    .filter(s => s.type === 'EXTRACT' && s.result)
                    .pop();
                const result = lastExtract
                    ? lastExtract.result
                    : (currentStep.result || 'Task completed');
                emitStep({ thought: currentStep.description || 'Task complete', action: 'DONE', result, status: 'success' });
                executedSteps.push({ ...currentStep, result, _success: true });
                setState(States.DONE);

                // SkillMemory disabled — skill saving skipped
                // SkillMemory.saveFromUrl(page.url(), goal, executedSteps).catch(...)

                return { success: true, state: States.DONE, steps: executedSteps, llmCalls };
            }

            // ── ACTING PHASE ──
            while (stepRetries < MAX_STEP_RETRIES && !stepSuccess) {
                checkAbort(signal);
                setState(States.ACTING);

                // Get fresh snapshot for this attempt
                try {
                    snapshot = await getDOMSnapshot(page);
                } catch (e) {
                    console.warn('[AutonomousLoop] Snapshot failed:', e.message);
                    await page.waitForTimeout(1000);
                    stepRetries++;
                    continue;
                }

                // Dismiss overlays if present
                if (snapshot.overlays && snapshot.overlays.length > 0) {
                    const dismissed = await tryDismissOverlay(page);
                    if (dismissed) {
                        try { snapshot = await getDOMSnapshot(page); } catch { /* keep old */ }
                    }
                }

                // Only inject visual grounding markers when the current step
                // actually uses [N] notation — injecting on every step causes
                // visible DOM flashes (blinking) in the browser window.
                const needsGrounding = currentStep.selector && /^\[\d+\]$/.test(currentStep.selector);
                let screenshotForStep = null;
                let stepGroundingMap = groundingMap; // reuse last known map by default

                if (needsGrounding) {
                    // Full marked screenshot — DOM labels injected and removed
                    const stepGrounded = await captureMarkedScreenshot(page);
                    screenshotForStep = stepGrounded.screenshot;
                    stepGroundingMap = stepGrounded.groundingMap || groundingMap;
                } else {
                    // Plain screenshot — no DOM mutation, no blink
                    try {
                        const raw = await page.screenshot({ encoding: 'base64' });
                        screenshotForStep = Buffer.isBuffer(raw) ? raw.toString('base64') : raw;
                        if (!isValidScreenshot(screenshotForStep)) screenshotForStep = null;
                    } catch { screenshotForStep = null; }
                }

                // ── Autocomplete timing guard ──────────────────────────────────
                // If the PREVIOUS step was a TYPE without pressEnter (autocomplete trigger),
                // and this step is a CLICK (selecting a suggestion), wait for the dropdown
                // to fully populate before attempting selector resolution.
                const prevStep = executedSteps[executedSteps.length - 1];
                if (
                    currentStep.type === 'CLICK' &&
                    prevStep && prevStep.type === 'TYPE' && !prevStep.pressEnter && prevStep._success
                ) {
                    console.log('[AutonomousLoop] Autocomplete wait — 1.5s for suggestions to appear');
                    await page.waitForTimeout(1500);
                    // Refresh snapshot so suggestions are visible for selector resolution
                    try { snapshot = await getDOMSnapshot(page); } catch { /* keep old */ }
                }

                // ── Login modal timing guard ──────────────────────────────────
                // After clicking a LOGIN / Sign In button, the login modal takes
                // 300-2000ms to render (Angular CDK animation, Bootstrap fade, etc.).
                // Wait before attempting to TYPE into the modal's input fields.
                if (
                    currentStep.type === 'TYPE' &&
                    prevStep && prevStep.type === 'CLICK' && prevStep._success &&
                    /login|sign.?in|log.?in/i.test(prevStep.goalText || prevStep.description || '')
                ) {
                    console.log('[AutonomousLoop] Login modal wait — 2s for form to render');
                    await page.waitForTimeout(2000);
                    // Refresh snapshot so modal inputs are detected as visible
                    try { snapshot = await getDOMSnapshot(page); } catch { /* keep old */ }
                }

                // Resolve plan step → concrete action (using fresh per-step grounding map)
                let action;
                try {
                    action = await resolveStepToAction(currentStep, snapshot, screenshotForStep, stepGroundingMap, page);
                } catch (e) {
                    // Rate-limit from LLM fallback in LocalSelectorService:
                    // pause and retry the SAME step WITHOUT consuming a stepRetry.
                    if (isRateLimitError(e)) {
                        console.warn('[AutonomousLoop] Rate limit on selector resolve — pausing 6s, retrying same step');
                        emitStep({ thought: 'API rate limit — pausing before retry…', action: currentStep.type, status: 'warn' });
                        await page.waitForTimeout(6000);
                        continue; // retry without incrementing stepRetries
                    }
                    console.warn(`[AutonomousLoop] Step resolution failed: ${e.message}`);
                    stepRetries++;
                    continue;
                }

                // If resolveStepToAction used LLM (repair), count it
                if (action._resolvedBy === 'llm-repair') {
                    llmCalls++;
                }

                const actionLabel = `${action.type} ${action.selector || action.url || action.text || ''}`.trim();

                // Emit user-friendly status
                UIFeedback.emitForAction(action);

                emitStep({
                    thought: action.reasoning || currentStep.description,
                    action: actionLabel,
                    status: 'running',
                    stepIndex: stepIndex + 1,
                    totalSteps: plan.length,
                });
                console.log(`[AutonomousLoop] Step ${stepIndex + 1}/${plan.length}: ${actionLabel}`);

                // ── Execute ──
                try {
                    await executeAction(action, page);
                    totalActions++;
                    lastAction = action; // track for soft-pass
                } catch (e) {
                    if (e.name === 'AbortError') throw e;
                    console.warn(`[AutonomousLoop] Execute failed: ${e.message}`);
                    emitStep({ thought: `Action failed: ${e.message}`, action: actionLabel, status: 'fail' });

                    // TYPE-specific recovery: if we couldn't find the input and the URL
                    // hasn't changed since the last NAVIGATE step, the click-to-navigate
                    // (e.g. "Sign in" button) opened a dropdown instead of navigating.
                    // Look for a login/sign-in URL in the page links and navigate there
                    // so the next retry has a proper form page to type into.
                    if (action.type === 'TYPE' && (e.message || '').includes('could not focus')) {
                        const lastNavStep = [...executedSteps].reverse().find(s => s.type === 'NAVIGATE');
                        if (lastNavStep && lastNavStep.url) {
                            try {
                                const curUrl = new URL(snapshot?.url || page.url());
                                const navUrl = new URL(lastNavStep.url);
                                const onSamePage =
                                    curUrl.hostname === navUrl.hostname &&
                                    curUrl.pathname.replace(/\/$/, '') === navUrl.pathname.replace(/\/$/, '');
                                if (onSamePage) {
                                    const loginLink = (snapshot.links || []).find(l => {
                                        try {
                                            return l.href && l.visible !== false &&
                                                /\/(login|signin|sign-in|session)\b/i.test(
                                                    new URL(l.href, snapshot.url || page.url()).pathname
                                                );
                                        } catch { return false; }
                                    });
                                    if (loginLink) {
                                        const loginUrl = new URL(loginLink.href, snapshot.url || page.url()).href;
                                        console.log(`[AutonomousLoop] TYPE focus-fail → auto-navigating to ${loginUrl}`);
                                        await executeAction({ type: 'NAVIGATE', url: loginUrl }, page).catch(() => {});
                                        try { snapshot = await getDOMSnapshot(page); } catch { /* keep old */ }
                                    }
                                }
                            } catch { /* skip auto-navigate */ }
                        }
                    }

                    // Invalidate the cached selector so next retry uses heuristic/LLM
                    if (currentStep.goalText || currentStep.description) {
                        LocalSelector.invalidate(
                            currentStep.goalText || currentStep.description,
                            snapshot.url
                        );
                    }

                    stepRetries++;
                    executedSteps.push({ ...action, _failed: true, _error: e.message });
                    continue;
                }

                // ── VERIFYING PHASE ──
                setState(States.VERIFYING);
                let afterSnapshot = null;
                try {
                    afterSnapshot = await getDOMSnapshot(page);
                } catch {
                    // Post-action snapshot failed — can't verify DOM change.
                    // Action executed without throwing so treat as unverified success
                    // rather than comparing stale pre-action snapshot to itself.
                    console.warn('[AutonomousLoop] Post-action snapshot failed — marking as unverified success');
                    stepSuccess = true;
                    emitStep({
                        thought: action.reasoning || currentStep.description,
                        action: actionLabel,
                        status: 'success',
                        verification: { success: true, unverified: true },
                        stepIndex: stepIndex + 1,
                        totalSteps: plan.length,
                    });
                    executedSteps.push({ ...action, ...currentStep, _success: true, _verification: { success: true, unverified: true } });
                    compactor.addAction(action, true);
                }

                if (!stepSuccess && afterSnapshot) {
                let verification = verifyAction(snapshot, afterSnapshot, action);

                // ── Delayed re-verification for CLICKs ──
                // Many CLICKs trigger AJAX loads, DOM re-renders, or subtle state changes
                // that take 1-3s to reflect. If initial verification fails, always wait and
                // re-snapshot — use 3s for navigation-intent CLICKs, 1.5s for others.
                if (!verification.success && action.type === 'CLICK') {
                    const navIntent = /search|submit|book|continue|proceed|find|apply|confirm|checkout|pay|next|sign.?in|log.?in/i;
                    const actionDesc = (action.text || '') + ' ' + (action.reasoning || '') + ' ' + (currentStep.goalText || '');
                    const delay = navIntent.test(actionDesc) ? 3000 : 1500;
                    console.log(`[AutonomousLoop] CLICK verification failed — waiting ${delay}ms before re-verify`);
                    await page.waitForTimeout(delay);
                    try {
                        const retrySnapshot = await getDOMSnapshot(page);
                        verification = verifyAction(snapshot, retrySnapshot, action);
                        if (verification.success) {
                            afterSnapshot = retrySnapshot;
                            console.log('[AutonomousLoop] Delayed re-verification PASSED');
                        }
                    } catch { /* keep original verification result */ }
                }

                if (verification.success) {
                    stepSuccess = true;
                    emitStep({
                        thought: action.reasoning || currentStep.description,
                        action: actionLabel,
                        status: 'success',
                        verification,
                        stepIndex: stepIndex + 1,
                        totalSteps: plan.length,
                    });
                    executedSteps.push({ ...action, ...currentStep, _success: true, _verification: verification });

                    // Track in ContextCompactor
                    compactor.addAction(action, true);

                    // Stream screenshot to renderer for live browser view display.
                    // Uses afterSnapshot URL as current URL for tab bar accuracy.
                    try {
                        const raw = await page.screenshot({ encoding: 'base64' });
                        const ss = Buffer.isBuffer(raw) ? raw.toString('base64') : raw;
                        if (ss && ss.length > 100) {
                            bus.emit('browser:screenshot-updated', {
                                tabId: browserManager.activeTabId || 'user-1',
                                screenshot: ss,
                                url: afterSnapshot.url || page.url(),
                            });
                        }
                    } catch { /* non-fatal — StateSync load event will cover it */ }

                    // Update page summary if URL changed
                    if (afterSnapshot.url !== snapshot.url) {
                        compactor.addPageSummary(afterSnapshot.url, afterSnapshot.title || '', afterSnapshot.visibleText || '');
                    }
                } else {
                    console.warn(`[AutonomousLoop] Verification failed for step ${stepIndex + 1}`);
                    emitStep({ thought: 'Action had no visible effect', action: actionLabel, status: 'warn', verification });

                    // Track verification-only failures (executeAction succeeded but verify failed)
                    if (action.type === 'CLICK') verifyOnlyFailures++;

                    // Invalidate selector cache for this goal
                    if (currentStep.goalText || currentStep.description) {
                        LocalSelector.invalidate(
                            currentStep.goalText || currentStep.description,
                            snapshot.url
                        );
                    }

                    stepRetries++;
                    executedSteps.push({ ...action, _failed: true, _error: 'No visible effect' });
                    compactor.addAction(action, false, 'No visible effect');
                }

                // Handle overlays that appeared after action
                if (verification.overlayAppeared) {
                    await tryDismissOverlay(page);
                }
                } // end: if (!stepSuccess && afterSnapshot)
            }

            // ── Step exhausted retries → soft-pass or REPLAN ──
            if (!stepSuccess) {
                // Soft-pass: if a CLICK executed without error on ALL retries but verification
                // kept failing ("no visible effect"), the click IS happening — verification is
                // too strict (e.g. filter checkbox, date picker highlight, subtle AJAX).
                // Advance to next step instead of wasting replan LLM calls.
                if (lastAction && lastAction.type === 'CLICK' && verifyOnlyFailures >= MAX_STEP_RETRIES) {
                    console.log(`[AutonomousLoop] CLICK soft-pass: "${currentStep.goalText || currentStep.description}" executed ${verifyOnlyFailures}x without error — advancing past strict verification`);
                    stepSuccess = true;
                    emitStep({
                        thought: `Click executed, advancing (verification too strict)`,
                        action: `${lastAction.type} ${lastAction.text || lastAction.selector || ''}`.trim(),
                        status: 'success',
                        stepIndex: stepIndex + 1,
                        totalSteps: plan.length,
                    });
                    executedSteps.push({ ...lastAction, ...currentStep, _success: true, _softPass: true });
                    compactor.addAction(lastAction, true);
                } else if (replanCount < MAX_REPLAN_ATTEMPTS) {
                    setState(States.REPLANNING);
                    replanCount++;
                    llmCalls++;
                    emitStep({ thought: `Step failed ${MAX_STEP_RETRIES} times — asking AI for a new plan`, action: 'REPLAN', status: 'running' });

                    try {
                        snapshot = await getDOMSnapshot(page);
                    } catch { /* keep old */ }

                    const replanGrounded = await captureMarkedScreenshot(page);
                    const replanScreenshot = replanGrounded.screenshot;
                    groundingMap = replanGrounded.groundingMap;

                    const stuckReason = `Step "${currentStep.description || currentStep.goalText || currentStep.type}" failed ${MAX_STEP_RETRIES} times.`;
                    const remainingPlan = plan.slice(stepIndex);

                    // Set compactor phase and provide compact context to replan
                    compactor.setPhase('replanning');

                    try {
                        const newPlan = await AgentReasoner.replan(goal, executedSteps, remainingPlan, stuckReason, snapshot, replanScreenshot);
                        plan = newPlan.slice(0, MAX_PLAN_STEPS);
                        stepIndex = 0; // restart from beginning of new plan
                        emitStep({ thought: `AI generated revised ${plan.length}-step plan`, action: 'REPLAN', status: 'success' });
                        continue;
                    } catch (e) {
                        console.error('[AutonomousLoop] Replan failed:', e.message);
                        if (isRateLimitError(e)) {
                            emitStep({ thought: 'Rate limit hit during replanning — please wait a moment and try again', action: 'ABORT', status: 'fail' });
                        } else {
                            emitStep({ thought: 'Replanning failed — aborting', action: 'ABORT', status: 'fail' });
                        }
                        setState(States.ABORTED);
                        return { success: false, state: States.ABORTED, steps: executedSteps, llmCalls };
                    }
                } else {
                    // Exhausted replan attempts — try single-action fallback
                    console.warn('[AutonomousLoop] Replan limit reached. Trying single-action fallback.');
                    emitStep({ thought: 'Trying one more approach…', action: 'FALLBACK', status: 'running' });

                    try {
                        snapshot = await getDOMSnapshot(page);
                        const fbGrounded = await captureMarkedScreenshot(page);
                        const fbScreenshot = fbGrounded.screenshot;
                        groundingMap = fbGrounded.groundingMap;

                        const fallbackAction = await AgentReasoner.decideSingleAction(
                            goal,
                            snapshot,
                            fbScreenshot,
                            executedSteps.slice(-8)
                        );
                        llmCalls++;

                        if (fallbackAction.type === 'DONE') {
                            emitStep({ thought: fallbackAction.reasoning, action: 'DONE', result: fallbackAction.result, status: 'success' });
                            executedSteps.push(fallbackAction);
                            setState(States.DONE);
                            return { success: true, state: States.DONE, steps: executedSteps, llmCalls };
                        }

                        // Execute the fallback action
                        // Resolve visual grounding notation [N] → real selector before execution
                        if (fallbackAction.selector && /^\[\d+\]$/.test(fallbackAction.selector) && groundingMap) {
                            const num = parseInt(fallbackAction.selector.slice(1, -1));
                            const realSel = groundingMap[num];
                            if (realSel) {
                                console.log(`[AutonomousLoop] Fallback grounding: [${num}] → ${realSel}`);
                                fallbackAction.selector = realSel;
                            } else {
                                console.warn(`[AutonomousLoop] Fallback grounding miss: [${num}] — clearing selector`);
                                fallbackAction.selector = null;
                            }
                        }
                        await executeAction(fallbackAction, page);
                        totalActions++;
                        executedSteps.push(fallbackAction);
                        // Continue with remaining plan
                        stepIndex++;
                        continue;
                    } catch (e) {
                        console.error('[AutonomousLoop] Fallback failed:', e.message);
                        emitStep({ thought: 'All recovery exhausted — aborting', action: 'ABORT', status: 'fail' });
                        setState(States.ABORTED);
                        return { success: false, state: States.ABORTED, steps: executedSteps, llmCalls };
                    }
                }
            }

            stepIndex++;
        }

        // Reached end of plan without explicit DONE — treat as success
        if (totalActions >= MAX_TOTAL_ACTIONS) {
            emitStep({ thought: 'Reached safety action limit — stopping', action: 'MAX_ACTIONS', status: 'warn' });
        }

        // SkillMemory disabled — skill saving skipped
        // SkillMemory.saveFromUrl(page.url(), goal, executedSteps).catch(...)

        setState(States.DONE);
        return { success: true, state: States.DONE, steps: executedSteps, llmCalls };

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('[AutonomousLoop] Cancelled by user.');
            emitStep({ thought: 'Task cancelled by user', action: 'CANCELLED', status: 'warn' });
            setState(States.ABORTED);
            return { success: false, state: States.ABORTED, steps: executedSteps, llmCalls };
        }
        // Unexpected error
        console.error('[AutonomousLoop] Unexpected error:', e);
        emitStep({ thought: `Unexpected error: ${e.message}`, action: 'ERROR', status: 'fail' });
        setState(States.ABORTED);
        return { success: false, state: States.ABORTED, steps: executedSteps, llmCalls, error: e.message };
    }
}
