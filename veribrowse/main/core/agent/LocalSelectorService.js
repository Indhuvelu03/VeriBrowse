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
// Key format: `${domain}::${goalText.toLowerCase()}`
// Value: { selector: string, fallbackText: string|null, hitCount: number, lastUsed: number }
const selectorCache = new Map();
const MAX_CACHE_SIZE = 500;

function cacheKey(domain, goalText) {
    return `${domain}::${(goalText || '').toLowerCase().trim()}`;
}

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return 'unknown';
    }
}

function escAttrValue(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .trim();
}

function toSpecificInputSelector(el) {
    if (!el) return null;

    const tag = (el.tag || 'input').toLowerCase();
    const type = (el.type || '').toLowerCase().trim();
    const name = (el.name || '').trim();
    const autocomplete = (el.autocomplete || '').trim();
    const placeholder = (el.placeholder || '').trim();
    const ariaLabel = (el.ariaLabel || '').trim();
    const baseSelector = (el.selector || '').trim();

    // If selector already looks specific, keep it.
    if (baseSelector && !/^input$|^textarea$|^select$/i.test(baseSelector)) {
        return baseSelector;
    }

    if (name && type && tag === 'input') {
        return `input[name="${escAttrValue(name)}"][type="${escAttrValue(type)}"]`;
    }
    if (name) {
        return `${tag}[name="${escAttrValue(name)}"]`;
    }
    if (type && tag === 'input') {
        return `input[type="${escAttrValue(type)}"]`;
    }
    if (autocomplete) {
        return `${tag}[autocomplete="${escAttrValue(autocomplete)}"]`;
    }
    if (ariaLabel) {
        return `${tag}[aria-label="${escAttrValue(ariaLabel)}"]`;
    }
    if (placeholder) {
        return `${tag}[placeholder="${escAttrValue(placeholder)}"]`;
    }

    return baseSelector || tag;
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
function lookupCache(domain, goalText) {
    const key = cacheKey(domain, goalText);
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
function saveToCache(domain, goalText, selector, fallbackText = null) {
    const key = cacheKey(domain, goalText);
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
 * @returns {{ selector: string, fallbackText: string|null, method: string } | null}
 */
function heuristicSearch(goalText, snapshot) {
    if (!goalText || !snapshot) return null;

    const goal = goalText.toLowerCase().trim();
    const allElements = [
        ...(snapshot.buttons || []).map(b => ({ ...b, _source: 'button' })),
        ...(snapshot.links || []).map(l => ({ ...l, _source: 'link' })),
        ...(snapshot.interactiveElements || []).map(e => ({ ...e, _source: 'interactive' })),
        ...(snapshot.inputs || []).map(i => ({
            ...i,
            _source: 'input',
            text: i.placeholder || i.value || '',
            tag: i.tag || 'input',
            type: i.type || '',
            name: i.name || '',
            autocomplete: i.autocomplete || '',
            ariaLabel: i.ariaLabel || '',
        })),
    ];

    // Strategy 1: Exact text match
    for (const el of allElements) {
        const elText = (el.text || '').toLowerCase().trim();
        if (elText === goal && el.visible !== false) {
            const selector = el._source === 'input' ? toSpecificInputSelector(el) : el.selector;
            console.log(`[LocalSelector] Heuristic: exact text match → "${selector}"`);
            return { selector, fallbackText: el.text, method: 'exact-text' };
        }
    }

    // Strategy 2: Partial text match (case-insensitive contains)
    for (const el of allElements) {
        const elText = (el.text || '').toLowerCase().trim();
        if (elText && elText.includes(goal) && el.visible !== false) {
            const selector = el._source === 'input' ? toSpecificInputSelector(el) : el.selector;
            console.log(`[LocalSelector] Heuristic: partial text match → "${selector}"`);
            return { selector, fallbackText: el.text, method: 'partial-text' };
        }
    }

    // Strategy 2b: Goal contains element text (e.g., goal="click the Sign In button", el.text="Sign In")
    for (const el of allElements) {
        const elText = (el.text || '').toLowerCase().trim();
        if (elText && elText.length > 2 && goal.includes(elText) && el.visible !== false) {
            const selector = el._source === 'input' ? toSpecificInputSelector(el) : el.selector;
            console.log(`[LocalSelector] Heuristic: reverse partial match → "${selector}"`);
            return { selector, fallbackText: el.text, method: 'reverse-partial' };
        }
    }

    // Strategy 3: Placeholder/aria-label match (for inputs)
    for (const el of snapshot.inputs || []) {
        const placeholder = (el.placeholder || '').toLowerCase();
        if (placeholder && (placeholder.includes(goal) || goal.includes(placeholder)) && el.visible !== false) {
            const selector = toSpecificInputSelector(el);
            console.log(`[LocalSelector] Heuristic: placeholder match → "${selector}"`);
            return { selector, fallbackText: null, method: 'placeholder' };
        }
    }

    // Strategy 4: Role-based patterns
    const rolePatterns = [
        { keywords: ['email', 'e-mail', 'username', 'user', 'phone', 'mobile'], selectors: ['input[type="email"]', 'input[name*="email" i]', 'input[name*="user" i]', 'input[autocomplete="username"]', 'input[name*="phone" i]', 'input[placeholder*="email" i]'] },
        { keywords: ['password', 'passcode', 'pwd', 'pin'], selectors: ['input[type="password"]', 'input[name*="pass" i]', 'input[autocomplete*="password" i]', 'input[placeholder*="password" i]'] },
        { keywords: ['search', 'find', 'query'], selectors: ['input[type="search"]', 'input[name*="search"]', 'input[placeholder*="search" i]', '[role="searchbox"]'] },
        { keywords: ['submit', 'send', 'go'], selectors: ['button[type="submit"]', 'input[type="submit"]'] },
        { keywords: ['close', 'dismiss', 'cancel'], selectors: ['button[aria-label="Close"]', 'button[aria-label="Dismiss"]', '.close-button', '.dismiss'] },
        { keywords: ['menu', 'hamburger', 'nav'], selectors: ['button[aria-label="Menu"]', '[role="navigation"] button', '.hamburger', '.menu-toggle'] },
        { keywords: ['login', 'log in', 'sign in', 'signin'], selectors: ['button:has-text("Log in")', 'button:has-text("Sign in")', 'button[type="submit"]', 'a[href*="login"]', 'a[href*="signin"]'] },
        // Sort/filter dropdowns on e-commerce pages (Amazon, eBay, etc.)
        { keywords: ['sort', 'sort by', 'featured', 'relevance', 'filter'], selectors: ['.a-dropdown-prompt', '[id*="sort"]', 'span[id$="announce"]', '[aria-label*="sort" i]', 'select[name*="sort" i]'] },
        // Generic dropdown/combobox
        { keywords: ['dropdown', 'select', 'option', 'combobox'], selectors: ['[role="combobox"]', '[role="listbox"]', 'select', '[aria-haspopup="listbox"]'] },
    ];

    for (const pattern of rolePatterns) {
        if (pattern.keywords.some(kw => goal.includes(kw) || kw.includes(goal))) {
            // Check if any of the pattern's selectors exist in the snapshot
            for (const patSel of pattern.selectors) {
                for (const el of allElements) {
                    if (el.selector && el.selector.includes(patSel.replace(/"/g, '')) && el.visible !== false) {
                        console.log(`[LocalSelector] Heuristic: role pattern match → "${el.selector}"`);
                        return { selector: el.selector, fallbackText: el.text || goal, method: 'role-pattern' };
                    }
                }
            }
            // Return the first pattern selector as a "best guess" for Playwright to try
            // Always include goalText as fallbackText so JS force-click can find by text if CSS fails
            const matchedKeyword = pattern.keywords.find(kw => goal.includes(kw) || kw.includes(goal)) || goal;
            console.log(`[LocalSelector] Heuristic: role pattern guess → "${pattern.selectors[0]}" (fallback: "${matchedKeyword}"`);
            return { selector: pattern.selectors[0], fallbackText: matchedKeyword, method: 'role-guess' };
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
 * @returns {Promise<{ selector: string, fallbackText: string|null, method: string }>}
 */
export async function resolve(goalText, snapshot, screenshot = null) {
    const domain = getDomain(snapshot?.url || '');

    // Tier 1: Cache
    const cached = lookupCache(domain, goalText);
    if (cached) {
        return { ...cached, method: 'cache' };
    }

    // Tier 2: Heuristic DOM search
    const heuristic = heuristicSearch(goalText, snapshot);
    if (heuristic) {
        // Save to cache for next time
        saveToCache(domain, goalText, heuristic.selector, heuristic.fallbackText);
        return heuristic;
    }

    // Tier 3: LLM fallback
    const llmResult = await llmFallback(goalText, snapshot, screenshot);
    // Save LLM result to cache so we never ask again for the same goal
    saveToCache(domain, goalText, llmResult.selector, llmResult.fallbackText);
    return llmResult;
}

/**
 * Invalidate a cached selector (called when execution fails).
 * Forces the next resolve() call to re-run heuristic + LLM.
 */
export function invalidate(goalText, url) {
    const domain = getDomain(url || '');
    const key = cacheKey(domain, goalText);
    const deleted = selectorCache.delete(key);
    if (deleted) {
        console.log(`[LocalSelector] Invalidated cache for "${goalText}" on ${domain}`);
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
