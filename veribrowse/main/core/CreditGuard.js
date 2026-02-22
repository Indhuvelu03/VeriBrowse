import Store from 'electron-store';
import crypto from 'crypto';
import * as LLMService from '../services/LLMService.js';
import * as EmbeddingService from '../services/EmbeddingService.js';
import * as SupabaseService from '../services/SupabaseService.js';
import bus from './EventBus.js';

const store = new Store();
const CREDIT_LIMIT = 300;
const WARNING_LIMIT = 250;
const CRITICAL_LIMIT = 290;

/**
 * CreditGuard
 *
 * The central gatekeeper for ALL LLM calls.
 * Ensures we stay within the Gemini free tier (300 calls/day).
 * Implements prompt caching and usage tracking.
 */

// Initialize credit counters from local store
let callsUsed = store.get('credits.callsUsed', 0);
let cacheHits = store.get('credits.cacheHits', 0);

function updateStats(type) {
    if (type === 'call') {
        callsUsed++;
        store.set('credits.callsUsed', callsUsed);

        // Emit updates to renderer
        bus.emit('credit:updated', { callsUsed, callsRemaining: CREDIT_LIMIT - callsUsed });

        if (callsUsed >= CRITICAL_LIMIT) bus.emit('credit:critical', { callsUsed });
        else if (callsUsed >= WARNING_LIMIT) bus.emit('credit:warning', { callsUsed });

        if (callsUsed > CREDIT_LIMIT) {
            throw new Error('[CreditGuard] DAILY CREDIT LIMIT EXHAUSTED (300/300). Update your API key or wait 24h.');
        }
    } else if (type === 'cache') {
        cacheHits++;
        store.set('credits.cacheHits', cacheHits);
    }
}

function getHash(prompt, model = 'gemini-2.0-flash') {
    return crypto.createHash('sha256').update(`${model}::${prompt}`).digest('hex');
}

/**
 * Public API
 */

export async function generate(prompt, options = {}) {
    const hash = getHash(prompt);
    let cached = null;
    try {
        cached = await SupabaseService.getCachedPrompt(hash);
    } catch (e) {
        console.warn('[CreditGuard] Supabase cache unavailable:', e.message);
    }

    if (cached) {
        updateStats('cache');
        console.log('[CreditGuard] Prompt Cache Hit');
        return cached;
    }

    updateStats('call');
    const response = await LLMService.generate(prompt, options);
    try {
        await SupabaseService.setCachedPrompt(hash, response, 'gemini-2.0-flash');
    } catch (e) {
        // Ignore set failure if DB is not ready
    }
    return response;
}

export async function vision(prompt, base64PNG) {
    // Vision is expensive, we track it as a standard call for now
    updateStats('call');
    return await LLMService.vision(prompt, base64PNG);
}

export async function generateJSON(prompt, schema = {}) {
    const hash = getHash(prompt + JSON.stringify(schema));
    let cached = null;
    try {
        cached = await SupabaseService.getCachedPrompt(hash);
    } catch (e) {
        // Ignore
    }

    if (cached) {
        updateStats('cache');
        try {
            return JSON.parse(cached);
        } catch (e) {
            // If cache is corrupted, fall through to live call
        }
    }

    updateStats('call');
    const response = await LLMService.generateJSON(prompt, schema);
    try {
        await SupabaseService.setCachedPrompt(hash, JSON.stringify(response), 'gemini-2.0-flash');
    } catch (e) {
        // Ignore
    }
    return response;
}

export async function embed(text) {
    // Embedding has its own high free tier, we don't count it against the 300 flash calls
    return await EmbeddingService.embed(text);
}

export function getStats() {
    return {
        callsUsed,
        callsRemaining: Math.max(0, CREDIT_LIMIT - callsUsed),
        cacheHits,
        limit: CREDIT_LIMIT
    };
}

// Reset stats (usually called by background.js on a new day)
export function resetDailyStats() {
    callsUsed = 0;
    store.set('credits.callsUsed', 0);
    bus.emit('credit:updated', { callsUsed: 0, callsRemaining: CREDIT_LIMIT });
}
