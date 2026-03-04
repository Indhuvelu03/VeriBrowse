/**
 * LocalSelectorService.js
 *
 * Resolves CSS selectors for planned actions WITHOUT calling the LLM.
 * Uses a 3-tier resolution strategy:
 *
 *   1. CACHE  → In-memory selector map (domain + goalText → selector)
 *   2. HEURISTIC → Smart DOM search (text match, aria-label, role, placeholder)
 *   3. LLM FALLBACK → AgentReasoner.repairSelector() — LAST RESORT
 *
 * After every successful resolution, the selector is cached so the same
 * action on the same site never needs the LLM again (self-improving).
 *
 * This is the key token-saving mechanism: ~80% of selectors resolve
 * at tier 1 or 2, meaning zero LLM calls for repeated workflows.
 */

import { repairSelector } from './AgentReasoner.js';

// ─── In-memory selector cache ───────────────────────────────────────────
// Key format: `${hostname}${pathname}::${goalText.toLowerCase()}`
// Using hostname+pathname (not just hostname) avoids reusing selectors from
// a different page on the same site — e.g. github.com/ "Sign in" header link
// must NOT be reused on github.com/login where "Sign in" is the submit button.
const selectorCache = new Map();
const MAX_CACHE_SIZE = 500;

function cacheKey(urlKey, goalText) {
    return `${urlKey}::${(goalText || '').toLowerCase().trim()}`;
}

/**
 * Returns hostname + pathname (without query/hash) as the cache scope.
 * Same path across different query params shares cache (same DOM structure).
 * Different paths on the same domain get separate entries (different elements).
 */
function getUrlKey(url) {
    try {
        const u = new URL(url);
        const path = u.pathname.replace(/\/$/, '') || '/'; // normalise trailing slash
        return u.hostname + path;
    } catch {
        return 'unknown';
    }
}

/** Legacy helper — still used by seedFromSkill which operates at domain level */
function getDomain(url) {
    try { return new URL(url).hostname; } catch { return 'unknown'; }
}

/**
 * Evict oldest entries if cache exceeds MAX_CACHE_SIZE.
 */
function evictIfNeeded() {
    if (selectorCache.size <= MAX_CACHE_SIZE) return;
    // Sort by lastUsed ascending, remove oldest 20%
    const entries = [...selectorCache.entries()]
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
        selectorCache.delete(entries[i][0]);
    }
}

// ─── Tier 1: Cache Lookup ───────────────────────────────────────────────

/**
 * Check the in-memory cache for a previously resolved selector.
 * @returns {{ selector: string, fallbackText: string|null } | null}
 */
function lookupCache(urlKey, goalText) {
    const key = cacheKey(urlKey, goalText);
    const entry = selectorCache.get(key);
    if (entry) {
        entry.hitCount++;
        entry.lastUsed = Date.now();
        console.log(`[LocalSelector] Cache HIT for "${goalText}" → ${entry.selector} (hits: ${entry.hitCount})`);
        return { selector: entry.selector, fallbackText: entry.fallbackText };
    }
    return null;
}

/**
 * Save a successful resolution to cache.
 */
function saveToCache(urlKey, goalText, selector, fallbackText = null) {
    const key = cacheKey(urlKey, goalText);
    selectorCache.set(key, {
        selector,
        fallbackText,
        hitCount: 1,
        lastUsed: Date.now(),
    });
    evictIfNeeded();
}

// ─── Tier 2: Heuristic DOM Search ──────────────────────────────────────

/**
 * Search the DOM snapshot for an element matching the goalText
 * using deterministic heuristics (NO LLM).
 *
 * Strategies (in order):
 *   1. Exact text match in buttons/links/interactive elements
 *   2. Partial text match (case-insensitive contains)
 *   3. aria-label or placeholder match
 *   4. Role-based match (e.g., "search" → input[type=search])
 *   5. Common pattern match (e.g., "submit" → button[type=submit])
 *
 * @param {string} goalText - What the user/plan wants to interact with
 * @param {object} snapshot - Current DOM snapshot
 * @param {string|null} actionType - 'TYPE' | 'CLICK' | null — biases element selection
 * @returns {{ selector: string, fallbackText: string|null, method: string } | null}
 */
function heuristicSearch(goalText, snapshot, actionType = null) {
    if (!goalText || !snapshot) return null;

    const goal = goalText.toLowerCase().trim();
    const isTypeAction = actionType === 'TYPE';
    const isSelectAction = actionType === 'SELECT';

    // ── SELECT-specific path: only consider <select> elements ──────────────
    // <select> dropdowns appear in snapshot.inputs with type='select-one' or 'select-multiple'.
    // Match using aria-label, name, id, or placeholder (which getDOMSnapshot populates
    // from the associated <label> text for select elements).
    if (isSelectAction) {
        const inputs = snapshot.inputs || [];
        const selects = inputs.filter(el =>
            el.type === 'select-one' || el.type === 'select-multiple' || el.tagName === 'select'
        );

        // S1: aria-label or placeholder (label text) contains goal
        for (const el of selects) {
            const label = (el.ariaLabel || el.placeholder || el.label || '').toLowerCase();
            if (label && (label.includes(goal) || goal.includes(label))) {
                console.log(`[LocalSelector] SELECT heuristic: label match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: null, method: 'select-label' };
            }
        }

        // S2: name or id contains goal
        for (const el of selects) {
            const nameId = (el.name || el.id || '').toLowerCase();
            if (nameId && (nameId.includes(goal) || goal.includes(nameId))) {
                console.log(`[LocalSelector] SELECT heuristic: name/id match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: null, method: 'select-name' };
            }
        }

        // S3: First visible select as last resort (if only one on page)
        const visibleSelects = selects.filter(el => el.visible !== false);
        if (visibleSelects.length === 1) {
            console.log(`[LocalSelector] SELECT heuristic: only select on page → "${visibleSelects[0].selector}"`);
            return { selector: visibleSelects[0].selector, fallbackText: null, method: 'select-only' };
        }

        // S4: Fall through to general heuristic (may catch aria-label in interactiveElements)
    }

    // ── TYPE-specific path: only consider input/textarea elements ───────────
    // ENHANCED: First check for STOP POINTS (OTP, Payment) before attempting to fill
    if (isTypeAction) {
        const inputs = snapshot.inputs || [];

        // ╔════════════════════════════════════════════════════════════════════╗
        // CRITICAL STOP POINTS - System cannot fill these for security
        // ╚════════════════════════════════════════════════════════════════════╝

        // T0: OTP Detection (MANDATORY STOP BEFORE ATTEMPTING TO FILL)
        if (/otp|code|verification|verify|pin|digit|sms|email code|confirm code|authentication/i.test(goal)) {
            // This is an OTP field - system MUST STOP
            // OTP should be filled by user only for security
            console.log(`[LocalSelector] OTP/Verification field detected - STOPPING: "${goal}"`);
            return {
                selector: null,
                method: 'otp-stop',
                isStopPoint: true,
                message: 'OTP or security verification code detected. This must be filled manually for security.'
            };
        }

        // T0b: Payment Detection (MANDATORY STOP)
        if (/card|payment|cvv|expiry|credit|debit|cash|upi|banking|wallet|pay/i.test(goal)) {
            console.log(`[LocalSelector] Payment field detected - STOPPING: "${goal}"`);
            return {
                selector: null,
                method: 'payment-stop',
                isStopPoint: true,
                message: 'Payment or card details field detected. This must be filled manually for security.'
            };
        }

        // ╔════════════════════════════════════════════════════════════════════╗
        // NORMAL FORM FIELD DETECTION - Proceed with filling
        // ╚════════════════════════════════════════════════════════════════════╝

        // T1: OTP Field Detection (if reached, it wasn't caught above - edge case)
        if (/digit|code/.test(goal)) {
            // Check for digit-by-digit OTP (id="digit1", id="digit2", etc.)
            const digitInputs = inputs.filter(el =>
                el.visible !== false &&
                el.type !== 'hidden' &&
                (el.id && /digit|code/.test(el.id))
            );
            if (digitInputs.length >= 4) {
                const firstEmpty = digitInputs.find(el => !(el.value || '').trim()) || digitInputs[0];
                console.log(`[LocalSelector] OTP digit field → "${firstEmpty.selector}"`);
                return { selector: firstEmpty.selector, fallbackText: null, method: 'type-otp-digit' };
            }

            // Check for single 6-digit OTP field
            const otpSingle = inputs.find(el =>
                el.visible !== false &&
                (el.type === 'text' || el.type === 'tel' || el.type === 'number') &&
                (
                    (el.name && /otp|code|verification|pin/i.test(el.name)) ||
                    (el.placeholder && /otp|code|verification|pin|digit|\d{4}/i.test(el.placeholder))
                )
            );
            if (otpSingle) {
                console.log(`[LocalSelector] OTP single field → "${otpSingle.selector}"`);
                return { selector: otpSingle.selector, fallbackText: null, method: 'type-otp-single' };
            }
        }

        // T2: Placeholder contains goal (visible inputs first)
        for (const el of inputs) {
            const placeholder = (el.placeholder || '').toLowerCase();
            if (placeholder && (placeholder.includes(goal) || goal.includes(placeholder)) && el.visible !== false) {
                console.log(`[LocalSelector] TYPE heuristic: placeholder match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: null, method: 'type-placeholder' };
            }
        }

        // T3: Hidden placeholder match (modals often have visible:false but are actually visible)
        for (const el of inputs) {
            if (el.visible !== false) continue;
            const placeholder = (el.placeholder || '').toLowerCase();
            if (placeholder && (placeholder.includes(goal) || goal.includes(placeholder))) {
                console.log(`[LocalSelector] TYPE heuristic: hidden placeholder match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: null, method: 'type-hidden-placeholder' };
            }
        }

        // T4: Name/ID/Aria-label match
        for (const el of inputs) {
            const name = (el.name || el.id || el.ariaLabel || '').toLowerCase();
            if (name && (name.includes(goal) || goal.includes(name)) && el.visible !== false) {
                console.log(`[LocalSelector] TYPE heuristic: name match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: null, method: 'type-name' };
            }
        }

        // T3: Role-based known patterns for TYPE
        // ENHANCED: Added patterns for OTP, verification codes, phone, date, address, and modern form fields
        const typeRolePatterns = [
            { keywords: ['search', 'find', 'query', 'keyword'], selector: 'textarea[name="q"], input[name="q"]' },
            { keywords: ['email', 'username', 'user name', 'login', 'sign in', 'login id', 'user id'], selector: 'input[name="login"], input[name="username"], input[name="email"], input[name="user_login"], input[name="userId"], input[name="loginId"], input[type="email"][autocomplete="username"], input[type="email"][autocomplete="email"], input[placeholder*="email" i], input[placeholder*="username" i]' },
            { keywords: ['password', 'pass'], selector: 'input[type="password"], input[name*="password"], input[name*="pwd"]' },
            { keywords: ['phone', 'mobile', 'tel', 'telephone', 'contact number'], selector: 'input[type="tel"], input[name*="phone"], input[name*="mobile"], input[name*="contact"], input[placeholder*="phone" i], input[placeholder*="mobile" i]' },
            { keywords: ['name', 'full name', 'first name', 'last name', 'your name'], selector: 'input[name*="name"], input[autocomplete*="name"], input[placeholder*="name" i]' },
            { keywords: ['message', 'comment', 'description', 'body', 'remarks', 'notes'], selector: 'textarea, textarea[name*="message"], textarea[placeholder*="message" i]' },
            // OTP / Verification code inputs - CRITICAL FOR BOOKING/PAYMENT
            { keywords: ['otp', 'verification', 'code', 'verification code', 'confirm code', 'pin', 'security code', 'digit'], selector: 'input[type="text"][maxlength="6"], input[name*="otp"], input[name*="code"], input[name*="verification"], input[name*="pin"], input[name*="digit"], input[placeholder*="otp" i], input[placeholder*="code" i], input[placeholder*="digit" i], input[placeholder*="verification" i]' },
            // Address / City autocomplete
            { keywords: ['address', 'street', 'location', 'city', 'town', 'state'], selector: 'input[name*="address"], input[name*="street"], input[name*="city"], input[placeholder*="address" i], input[placeholder*="street" i], input[placeholder*="city" i], input[placeholder*="location" i]' },
            // Date fields (booking, DOB, etc.)
            { keywords: ['date', 'dob', 'birth', 'when', 'day', 'month', 'year'], selector: 'input[type="date"], input[name*="date"], input[name*="dob"], input[name*="birth"], input[placeholder*="date" i], input[placeholder*="dob" i]' },
            // Google Flights / travel site autocomplete inputs:
            // These sites use custom inputs where user types, look for combobox or focused inputs
            { keywords: ['origin', 'from', 'departure', 'where from', 'source', 'from city', 'departure city'], selector: 'input[aria-label*="here" i], input[aria-label*="from" i], input[placeholder*="From" i], input[aria-expanded="true"], input[role="combobox"]:focus, input[aria-autocomplete="list"]:focus' },
            { keywords: ['destination', 'to', 'arrival', 'where to', 'to city', 'arrival city'], selector: 'input[aria-label*="here" i], input[aria-label*="to" i], input[placeholder*="To" i], input[aria-expanded="true"], input[role="combobox"]:focus, input[aria-autocomplete="list"]:focus' },
        ];
        for (const pattern of typeRolePatterns) {
            if (pattern.keywords.some(kw => goal.includes(kw))) {
                console.log(`[LocalSelector] TYPE heuristic: role guess → "${pattern.selector}"`);
                return { selector: pattern.selector, fallbackText: null, method: 'type-role-guess' };
            }
        }

        // T3b: Google Flights-specific — when typing in their combobox, focus the active input
        // Google Flights opens an overlay with an input when you click the origin/destination display.
        // The input has role="combobox" and aria-expanded="true" when active.
        const isOriginDest = /origin|destination|from|to|city|airport/i.test(goal);
        if (isOriginDest) {
            // Look for currently focused/expanded combobox input
            const comboInputs = inputs.filter(el =>
                el.visible !== false &&
                ((el.role || '').toLowerCase() === 'combobox' ||
                 (el.ariaLabel || '').toLowerCase().includes('where') ||
                 (el.placeholder || '').toLowerCase().includes('enter'))
            );
            if (comboInputs.length > 0) {
                // Prefer empty one (not yet filled)
                const emptyCombo = comboInputs.find(el => !(el.value || '').trim());
                const target = emptyCombo || comboInputs[0];
                console.log(`[LocalSelector] TYPE heuristic: Google Flights combobox → "${target.selector}"`);
                return { selector: target.selector, fallbackText: null, method: 'type-combobox' };
            }
        }

        // T4: First visible input on the page as last-resort for TYPE
        // Prefer EMPTY inputs — the next unfilled field is more likely the target
        // than a field already populated by a previous selection (e.g. FROM vs TO autocomplete)
        const DUMMY_INPUT_RE = /password-autocomplete|autocomplete-disabler|hidden-input|dummy-input|honeypot|trap-field/i;
        const visibleInputs = inputs.filter(el =>
            el.visible !== false && el.type !== 'hidden' &&
            el.type !== 'checkbox' && el.type !== 'radio' &&
            // Skip dummy/honeypot inputs used to prevent browser autocomplete
            !DUMMY_INPUT_RE.test(el.selector || '') &&
            !DUMMY_INPUT_RE.test(el.className || '') &&
            !DUMMY_INPUT_RE.test(el.name || '')
        );
        const firstEmpty = visibleInputs.find(el => !(el.value || '').trim());
        const firstVisible = firstEmpty || visibleInputs[0];
        if (firstVisible) {
            console.log(`[LocalSelector] TYPE heuristic: first visible input → "${firstVisible.selector}"`);
            return { selector: firstVisible.selector, fallbackText: null, method: 'type-first-input' };
        }

        // No input found — let LLM handle it
        return null;
    }

    // ── General path (CLICK and others) ────────────────────────────────────
    const allElements = [
        ...(snapshot.buttons || []).map(b => ({ ...b, _source: 'button' })),
        ...(snapshot.links || []).map(l => ({ ...l, _source: 'link' })),
        ...(snapshot.interactiveElements || []).map(e => ({ ...e, _source: 'interactive' })),
        ...(snapshot.inputs || []).map(i => ({ ...i, _source: 'input', text: i.placeholder || i.value || '' })),
    ];

    // Strategy 0: Autocomplete / dropdown suggestion items (role="option" or role="menuitem")
    // Must run BEFORE general text strategies — static display elements (e.g. .darkGreyText)
    // often share text with suggestion items but are not the correct click target.
    for (const el of allElements) {
        const role = (el.role || '').toLowerCase();
        if (role !== 'option' && role !== 'menuitem') continue;
        const elText = (el.text || '').toLowerCase().trim();
        // Match if goal is contained in the first line of the suggestion text
        // (suggestions often show "BOM\nMumbai, India\n..." — first line is the code, rest is city)
        const firstLine = elText.split(/\n/)[0].trim();
        const secondLine = (elText.split(/\n/)[1] || '').trim();
        if (
            elText === goal ||
            elText.includes(goal) ||
            goal.includes(firstLine) ||
            (secondLine && (secondLine.includes(goal) || goal.includes(secondLine)))
        ) {
            if (el.visible !== false) {
                console.log(`[LocalSelector] Heuristic: role=${role} match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: el.text, method: 'role-option' };
            }
        }

        // Fuzzy word overlap for station/city names with format mismatches:
        // e.g. goal="Katpadi Jn (KPD)" vs el.text="KATPADI JN - KPD (VELLORE)"
        // Split on whitespace + common punctuation, filter short tokens, check overlap ratio.
        if (el.visible !== false && elText) {
            const goalTokens = goal.split(/[\s\-\(\)\/,]+/).filter(w => w.length > 2);
            const elTokens = elText.split(/[\s\-\(\)\/,\n]+/).filter(w => w.length > 2);
            if (goalTokens.length > 0 && elTokens.length > 0) {
                const matchCount = goalTokens.filter(
                    gw => elTokens.some(ew => ew.includes(gw) || gw.includes(ew))
                ).length;
                if (matchCount >= Math.ceil(goalTokens.length * 0.6)) {
                    console.log(`[LocalSelector] Heuristic: role=${role} fuzzy match → "${el.selector}"`);
                    return { selector: el.selector, fallbackText: el.text, method: 'role-option-fuzzy' };
                }
            }
        }
    }

    // Strategy 1: Exact text match
    for (const el of allElements) {
        const elText = (el.text || '').toLowerCase().trim();
        if (elText === goal && el.visible !== false) {
            console.log(`[LocalSelector] Heuristic: exact text match → "${el.selector}"`);
            return { selector: el.selector, fallbackText: el.text, method: 'exact-text' };
        }
    }

    // Strategy 2: Partial text match (case-insensitive contains)
    for (const el of allElements) {
        const elText = (el.text || '').toLowerCase().trim();
        if (elText && elText.includes(goal) && el.visible !== false) {
            console.log(`[LocalSelector] Heuristic: partial text match → "${el.selector}"`);
            return { selector: el.selector, fallbackText: el.text, method: 'partial-text' };
        }
    }

    // Strategy 2b: Goal contains element text (e.g., goal="click the Sign In button", el.text="Sign In")
    for (const el of allElements) {
        const elText = (el.text || '').toLowerCase().trim();
        if (elText && elText.length > 2 && goal.includes(elText) && el.visible !== false) {
            console.log(`[LocalSelector] Heuristic: reverse partial match → "${el.selector}"`);
            return { selector: el.selector, fallbackText: el.text, method: 'reverse-partial' };
        }
    }

    // Strategy 3: Placeholder/aria-label match (for inputs)
    for (const el of snapshot.inputs || []) {
        const placeholder = (el.placeholder || '').toLowerCase();
        if (placeholder && (placeholder.includes(goal) || goal.includes(placeholder)) && el.visible !== false) {
            console.log(`[LocalSelector] Heuristic: placeholder match → "${el.selector}"`);
            return { selector: el.selector, fallbackText: null, method: 'placeholder' };
        }
    }

    // Strategy 3b: id / aria-label match on interactive elements
    // Catches buttons/divs like id="departure" that have no visible text matching the goal.
    for (const el of allElements) {
        if (el.visible === false) continue;
        const idAttr = (el.id || '').toLowerCase();
        const ariaLbl = (el.ariaLabel || '').toLowerCase();

        // Skip ids that contain CSS-invalid characters (ad iframes, Angular component ids, etc.)
        // e.g. "#google_ads_iframe_/37179215/..." — the "/" makes it an invalid CSS selector
        const hasInvalidCssChars = /[/:()\[\]{}|\\]/.test(idAttr);

        if (idAttr && !hasInvalidCssChars) {
            // For short or purely numeric goals (e.g. "15"), only exact match to avoid
            // false positives like "google_ads_iframe_37179215" containing "15".
            const isShortOrNumeric = goal.length <= 3 || /^\d+$/.test(goal);
            const idMatches = idAttr === goal ||
                goal.includes(idAttr) ||
                (!isShortOrNumeric && idAttr.includes(goal));
            if (idMatches) {
                console.log(`[LocalSelector] Heuristic: id match → "${el.selector}"`);
                return { selector: el.selector, fallbackText: el.text || null, method: 'id-match' };
            }
        }

        if (ariaLbl && (ariaLbl === goal || ariaLbl.includes(goal) || goal.includes(ariaLbl))) {
            console.log(`[LocalSelector] Heuristic: aria-label match → "${el.selector}"`);
            return { selector: el.selector, fallbackText: el.text || null, method: 'aria-label-match' };
        }
    }

    // Strategy 4: Role-based patterns
    const rolePatterns = [
        { keywords: ['search', 'find', 'query'], selectors: ['input[type="search"]', 'input[name*="search"]', 'input[placeholder*="search" i]', '[role="searchbox"]'] },
        { keywords: ['submit', 'send', 'go'], selectors: ['button[type="submit"]', 'input[type="submit"]'] },
        { keywords: ['close', 'dismiss', 'cancel'], selectors: ['button[aria-label="Close"]', 'button[aria-label="Dismiss"]', '.close-button', '.dismiss'] },
        { keywords: ['menu', 'hamburger', 'nav'], selectors: ['button[aria-label="Menu"]', '[role="navigation"] button', '.hamburger', '.menu-toggle'] },
        { keywords: ['login', 'sign in', 'signin'], selectors: ['button:has-text("LOGIN")', 'a:has-text("LOGIN")', 'button:has-text("Sign in")', 'button:has-text("Log in")', 'a:has-text("Sign In")', 'a[href*="signin"]', 'a[href*="login"]'] },
    ];

    for (const pattern of rolePatterns) {
        if (pattern.keywords.some(kw => goal.includes(kw))) {
            // Check if any of the pattern's selectors exist in the snapshot
            for (const patSel of pattern.selectors) {
                for (const el of allElements) {
                    if (el.selector && el.selector.includes(patSel.replace(/"/g, '')) && el.visible !== false) {
                        console.log(`[LocalSelector] Heuristic: role pattern match → "${el.selector}"`);
                        return { selector: el.selector, fallbackText: el.text, method: 'role-pattern' };
                    }
                }
            }
            // No element in the snapshot matched any pattern selector.
            // Do NOT return a blind "best guess" — it wastes 5s on a wrong selector
            // and prevents humanClick's text-based fallback from being tried.
            // Fall through to fuzzy word match and LLM fallback instead.
            console.log(`[LocalSelector] Role pattern "${pattern.keywords[0]}" matched keywords but no DOM element found — skipping blind guess`);
        }
    }

    // Strategy 5: Fuzzy word overlap — score elements by word match ratio
    const goalWords = goal.split(/\s+/).filter(w => w.length > 2);
    if (goalWords.length > 0) {
        let bestMatch = null;
        let bestScore = 0;

        for (const el of allElements) {
            const elText = (el.text || '').toLowerCase();
            if (!elText || el.visible === false) continue;
            const matchCount = goalWords.filter(w => elText.includes(w)).length;
            const score = matchCount / goalWords.length;
            if (score > bestScore && score >= 0.5) {
                bestScore = score;
                bestMatch = el;
            }
        }

        if (bestMatch) {
            console.log(`[LocalSelector] Heuristic: fuzzy word match (${(bestScore * 100).toFixed(0)}%) → "${bestMatch.selector}"`);
            return { selector: bestMatch.selector, fallbackText: bestMatch.text, method: 'fuzzy-word' };
        }
    }

    return null;
}

// ─── Tier 3: LLM Fallback ──────────────────────────────────────────────

/**
 * Last resort: call AgentReasoner.repairSelector() to get the LLM
 * to figure out the correct selector from the DOM + screenshot.
 */
async function llmFallback(goalText, snapshot, screenshot) {
    console.log(`[LocalSelector] All heuristics failed for "${goalText}" — calling LLM`);
    const result = await repairSelector('(none — heuristic miss)', goalText, snapshot, screenshot);
    return {
        selector: result.selector,
        fallbackText: result.fallbackText || null,
        method: 'llm-repair',
        confidence: result.confidence,
    };
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Resolve a selector for the given goal text on the current page.
 * Uses the 3-tier strategy: Cache → Heuristic → LLM.
 *
 * @param {string} goalText - Description of the element to find
 * @param {object} snapshot - Current DOM snapshot from getDOMSnapshot
 * @param {string|null} screenshot - Base64 PNG for LLM fallback
 * @param {string|null} actionType - 'TYPE' | 'CLICK' | null — biases element selection
 * @returns {Promise<{ selector: string, fallbackText: string|null, method: string }>}
 */
export async function resolve(goalText, snapshot, screenshot = null, actionType = null) {
    const urlKey = getUrlKey(snapshot?.url || '');

    // Tier 1: Cache
    const cached = lookupCache(urlKey, goalText);
    if (cached) {
        return { ...cached, method: 'cache' };
    }

    // Tier 2: Heuristic DOM search (pass actionType so TYPE searches inputs only)
    const heuristic = heuristicSearch(goalText, snapshot, actionType);
    if (heuristic) {
        // Save to cache for next time
        saveToCache(urlKey, goalText, heuristic.selector, heuristic.fallbackText);
        return heuristic;
    }

    // Tier 3: LLM fallback
    const llmResult = await llmFallback(goalText, snapshot, screenshot);
    // Save LLM result to cache so we never ask again for the same goal
    saveToCache(urlKey, goalText, llmResult.selector, llmResult.fallbackText);
    return llmResult;
}

/**
 * Invalidate a cached selector (called when execution fails).
 * Forces the next resolve() call to re-run heuristic + LLM.
 */
export function invalidate(goalText, url) {
    const urlKey = getUrlKey(url || '');
    const key = cacheKey(urlKey, goalText);
    const deleted = selectorCache.delete(key);
    if (deleted) {
        console.log(`[LocalSelector] Invalidated cache for "${goalText}" on ${urlKey}`);
    }
}

/**
 * Pre-seed the cache from SkillMemory recalled steps.
 * Called when a skill match is found to avoid any LLM calls.
 */
export function seedFromSkill(domain, steps) {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
        if (step.goalText && step.selector) {
            saveToCache(domain, step.goalText, step.selector, step.fallbackText || null);
        }
    }
    console.log(`[LocalSelector] Seeded ${steps.length} selectors from skill memory for ${domain}`);
}

/**
 * Get cache stats for debugging.
 */
export function getStats() {
    return {
        size: selectorCache.size,
        maxSize: MAX_CACHE_SIZE,
        entries: [...selectorCache.entries()].map(([k, v]) => ({
            key: k,
            hitCount: v.hitCount,
            selector: v.selector,
        })),
    };
}
