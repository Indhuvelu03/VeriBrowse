/**
 * IntentDispatcher.js
 *
 * THE CRITICAL ROUTING LAYER for the Fellou.ai-style Hybrid Intent System.
 *
 * Classifies every user input into one of three intents:
 *
 *   1. CHAT_INTENT       — Conversational replies. No browser automation.
 *   2. QUICK_ACTION       — Single-step: navigate, click, extract. Fast path.
 *   3. LONG_HORIZON_AUTOMATION — Multi-step research/automation in shadow workspace.
 *
 * Every classification includes:
 *   - intent_type:       one of the three intents
 *   - confidence_score:  0.0 – 1.0 from the LLM (or heuristic)
 *   - reasoning_summary: short explanation for debugging / UI
 *   - response:          (CHAT only) the direct answer text
 *   - url:               (QUICK_ACTION navigate) resolved URL
 *   - action:            (QUICK_ACTION non-navigate) action descriptor
 *
 * Two-stage classification:
 *   Stage 1: Heuristic pre-filter (ZERO LLM calls for obvious intents)
 *   Stage 2: LLM classification (one call via CreditGuard)
 *
 * This REPLACES the old IntentClassifier.js which had 4 overlapping intents
 * (chat/navigate/task/autonomous) and no confidence scoring.
 */

import * as CreditGuard from './CreditGuard.js';
import { INTENT_DISPATCHER_PROMPT } from '../constants.js';

// ─── Intent Constants ───────────────────────────────────────────────────
export const Intents = Object.freeze({
    CHAT: 'CHAT_INTENT',
    QUICK_ACTION: 'QUICK_ACTION',
    LONG_HORIZON: 'LONG_HORIZON_AUTOMATION',
});

// ─── Heuristic Pre-Filter ───────────────────────────────────────────────

const GREETING_PATTERNS = /^(hi|hello|hey|hola|yo|what's up|sup|good (morning|afternoon|evening)|thanks|thank you|bye|goodbye|ok|okay|sure|got it|cool)\b/i;
const NAVIGATE_PATTERNS = /^(go to|open|visit|navigate to|take me to|show me)\s+/i;
const URL_PATTERN = /^(https?:\/\/|www\.)/i;
// Covers clean phrasing + common typos (wht, wat, wot, whos, hw, etc.)
const KNOWLEDGE_PATTERNS = /^(wh[aeiout]+'?s?|wh[aeiout]+\s+(is|are|was|were|does|do|did|made|called)|who\s+(is|are|was)|explain|define|how\s+(does|do|did|is|are|was)|when\s+(was|did|is)|where\s+(is|are|was)|tell\s+me\s+about|describe|what\s+is|what\s+are|what'?s)\b/i;

// Research / multi-step task keywords
const LONG_HORIZON_KEYWORDS = [
    'find the cheapest', 'find the best', 'compare', 'search for', 'research',
    'look up', 'book a', 'order', 'buy', 'purchase', 'sign up', 'register',
    'fill out', 'complete the form', 'apply for', 'check prices',
    'summarize the top', 'list all', 'gather information', 'monitor',
    'track', 'analyze', 'download all', 'scrape', 'extract all',
];

// Common site names for quick navigate
const SITE_MAP = {
    google: 'https://www.google.com',
    youtube: 'https://www.youtube.com',
    github: 'https://www.github.com',
    reddit: 'https://www.reddit.com',
    twitter: 'https://www.twitter.com',
    x: 'https://www.x.com',
    facebook: 'https://www.facebook.com',
    amazon: 'https://www.amazon.com',
    wikipedia: 'https://www.wikipedia.org',
    linkedin: 'https://www.linkedin.com',
    instagram: 'https://www.instagram.com',
    stackoverflow: 'https://stackoverflow.com',
    'stack overflow': 'https://stackoverflow.com',
    netflix: 'https://www.netflix.com',
    spotify: 'https://open.spotify.com',
    gmail: 'https://mail.google.com',
};

// Detects multi-step / compound instructions that should NOT be QUICK_ACTION
const MULTI_STEP_PATTERN = /,?\s+(then|and then|after that|next|also|followed by|go back|scroll down|scroll up|click on|search for|apply|filter|fill|type|submit)/i;
const TASK_TAIL_PATTERN = /\b(find|get|search|compare|best|top|under|below|between|show|list|sort|review|rating|price|buy|select|choose)\b/i;
const POLITE_TAIL_PATTERN = /^(please|pls|now|thanks|thank you|site|website)\b[\s.!?]*$/i;

/**
 * Stage 1: Try to classify without an LLM call.
 * Returns a classification object or null if uncertain.
 */
function heuristicClassify(input) {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    // 1. Greeting / small talk
    if (GREETING_PATTERNS.test(lower) && lower.length < 40) {
        return {
            intent_type: Intents.CHAT,
            confidence_score: 0.95,
            reasoning_summary: 'Detected greeting or small talk',
            response: null, // Will be filled by LLM in WorkflowEngine
            url: null,
        };
    }

    // 2. Direct URL (bare URL with no extra instructions)
    if (URL_PATTERN.test(trimmed) && !MULTI_STEP_PATTERN.test(trimmed)) {
        const urlToken = trimmed.split(/[\s,]/)[0]; // grab only the URL token
        return {
            intent_type: Intents.QUICK_ACTION,
            confidence_score: 0.99,
            reasoning_summary: 'Input is a direct URL',
            response: null,
            url: urlToken.startsWith('http') ? urlToken : `https://${urlToken}`,
            action: { type: 'navigate' },
        };
    }

    // 3. Navigation command: "go to X", "open Y" — only for simple single-destination commands
    if (NAVIGATE_PATTERNS.test(lower)) {
        const sitePart = lower.replace(NAVIGATE_PATTERNS, '').trim();
        const { url, remainder } = resolveNavigationWithTail(sitePart);

        // If the remainder contains task intent, route to LONG_HORIZON.
        // Example: "go to flipkart and find best laptop under 30k"
        const hasTaskTail =
            remainder &&
            remainder.length > 0 &&
            !POLITE_TAIL_PATTERN.test(remainder) &&
            (MULTI_STEP_PATTERN.test(` ${remainder}`) || TASK_TAIL_PATTERN.test(remainder) || hasLongHorizonKeyword(remainder));

        if (hasTaskTail) {
            return {
                intent_type: Intents.LONG_HORIZON,
                confidence_score: 0.92,
                reasoning_summary: 'Navigate + task instructions detected',
                response: null,
                url: null,
            };
        }

        if (url) {
            return {
                intent_type: Intents.QUICK_ACTION,
                confidence_score: 0.95,
                reasoning_summary: `Navigate command to ${sitePart}`,
                response: null,
                url,
                action: { type: 'navigate' },
            };
        }
    }

    // 4. Knowledge question (short, answerable from training)
    if (KNOWLEDGE_PATTERNS.test(lower) && lower.length < 200 && !hasLongHorizonKeyword(lower)) {
        return {
            intent_type: Intents.CHAT,
            confidence_score: 0.95, // high confidence — answer from LLM knowledge, no browsing needed
            reasoning_summary: 'Appears to be a knowledge question',
            response: null,
            url: null,
        };
    }

    // 4b. Short question ending with "?" — very likely factual/conversational
    if (lower.endsWith('?') && lower.length < 120 && !hasLongHorizonKeyword(lower)) {
        return {
            intent_type: Intents.CHAT,
            confidence_score: 0.90,
            reasoning_summary: 'Short question — answerable without browsing',
            response: null,
            url: null,
        };
    }

    // 5. Obvious long-horizon automation
    if (hasLongHorizonKeyword(lower)) {
        return {
            intent_type: Intents.LONG_HORIZON,
            confidence_score: 0.85,
            reasoning_summary: 'Contains multi-step research/automation keywords',
            response: null,
            url: null,
        };
    }

    // Uncertain — needs LLM
    return null;
}

function hasLongHorizonKeyword(lower) {
    return LONG_HORIZON_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Resolve navigation target and preserve the remaining text after the destination.
 * This lets heuristics detect compound requests like:
 * "go to amazon and find best mobile under 40k"
 */
function resolveNavigationWithTail(sitePart) {
    const cleaned = String(sitePart || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return { url: null, remainder: '' };

    const parts = cleaned.split(' ');
    const first = parts[0];
    const firstTwo = parts.slice(0, 2).join(' ');

    let consumed = 0;
    let url = null;

    if (first.startsWith('http')) {
        url = first;
        consumed = 1;
    } else if (first.includes('.')) {
        url = `https://${first}`;
        consumed = 1;
    } else if (SITE_MAP[firstTwo]) {
        url = SITE_MAP[firstTwo];
        consumed = 2;
    } else if (SITE_MAP[first]) {
        url = SITE_MAP[first];
        consumed = 1;
    } else if (/^[a-z0-9]+$/i.test(first) && first.length > 2) {
        url = `https://www.${first}.com`;
        consumed = 1;
    }

    const rawRemainder = parts.slice(consumed).join(' ').trim();
    const remainder = rawRemainder.replace(/^(and|to)\s+/, '').trim();
    return { url, remainder };
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Classify user input into one of three intents.
 *
 * Two-stage approach:
 *   1. Heuristic pre-filter (zero LLM, ~65% of inputs)
 *   2. LLM classification (one CreditGuard call)
 *
 * @param {string} userInput - The raw user message
 * @param {{ currentUrl?: string, currentTitle?: string }} context - Optional page context
 * @returns {Promise<{
 *   intent_type: string,
 *   confidence_score: number,
 *   reasoning_summary: string,
 *   response: string | null,
 *   url: string | null,
 *   action: object | null
 * }>}
 */
export async function dispatch(userInput, context = {}) {
    console.log(`[IntentDispatcher] Classifying: "${userInput.slice(0, 80)}…"`);

    // Stage 1: Heuristic (zero LLM)
    const heuristic = heuristicClassify(userInput);
    if (heuristic && heuristic.confidence_score >= 0.90) {
        console.log(`[IntentDispatcher] Heuristic hit: ${heuristic.intent_type} (${heuristic.confidence_score})`);
        return heuristic;
    }

    // Stage 2: LLM classification
    try {
        const prompt = buildClassificationPrompt(userInput, context);
        const result = await CreditGuard.generateJSON(prompt);

        // Validate & normalize the LLM response
        const intentType = normalizeIntent(result?.intent_type || result?.intent);
        const confidence = Math.min(1, Math.max(0, parseFloat(result?.confidence_score) || 0.7));

        const classification = {
            intent_type: intentType,
            confidence_score: confidence,
            reasoning_summary: result?.reasoning_summary || result?.reasoning || 'LLM classification',
            response: result?.response || null,
            url: result?.url || null,
            action: result?.action || null,
        };

        // If LLM said CHAT_INTENT, we also need a response
        // Let it provide one in the same call to avoid a second round-trip
        if (classification.intent_type === Intents.CHAT && !classification.response) {
            // The prompt asks for response in CHAT cases, but if missing, we'll handle it downstream
            classification.response = null;
        }

        // For QUICK_ACTION with URL, resolve if needed
        if (classification.intent_type === Intents.QUICK_ACTION && classification.url) {
            if (!classification.url.startsWith('http')) {
                classification.url = `https://${classification.url}`;
            }
        }

        console.log(`[IntentDispatcher] LLM: ${classification.intent_type} (${classification.confidence_score}) — ${classification.reasoning_summary}`);
        return classification;

    } catch (err) {
        console.error('[IntentDispatcher] LLM classification failed:', err.message);

        // If we have a low-confidence heuristic result, use it as fallback
        if (heuristic) {
            console.log('[IntentDispatcher] Falling back to heuristic');
            return heuristic;
        }

        // Safest default: LONG_HORIZON_AUTOMATION (the loop handles everything)
        return {
            intent_type: Intents.LONG_HORIZON,
            confidence_score: 0.5,
            reasoning_summary: 'Classification failed — defaulting to autonomous',
            response: null,
            url: null,
            action: null,
        };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function buildClassificationPrompt(userInput, context) {
    const contextStr = context.currentUrl
        ? `The user is currently on: ${context.currentUrl} (${context.currentTitle || ''})`
        : 'No page is currently open.';

    return `${INTENT_DISPATCHER_PROMPT}\n\nCurrent context: ${contextStr}\n\nUser message: "${userInput}"`;
}

function normalizeIntent(raw) {
    if (!raw) return Intents.LONG_HORIZON;

    const upper = String(raw).toUpperCase().replace(/[^A-Z_]/g, '');

    if (upper.includes('CHAT')) return Intents.CHAT;
    if (upper.includes('QUICK')) return Intents.QUICK_ACTION;
    if (upper.includes('LONG') || upper.includes('HORIZON') || upper.includes('AUTO')) return Intents.LONG_HORIZON;

    // Legacy 4-intent compat
    if (upper === 'NAVIGATE') return Intents.QUICK_ACTION;
    if (upper === 'TASK') return Intents.LONG_HORIZON;
    if (upper === 'AUTONOMOUS') return Intents.LONG_HORIZON;

    return Intents.LONG_HORIZON; // safest default
}
