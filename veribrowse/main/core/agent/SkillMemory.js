/**
 * SkillMemory.js
 *
 * Supabase-backed skill store with fast in-memory LRU cache.
 * Skills are successful action sequences for a domain+goal pair.
 *
 * When the AutonomousLoop completes a task successfully, it saves the
 * executed steps as a skill. Next time a similar task is requested,
 * SkillMemory provides the cached plan so AgentReasoner.planSteps()
 * is NEVER called for known workflows.
 *
 * Architecture:
 *   recall(domain, goal)
 *     → Check LRU in-memory cache
 *     → Check Supabase (semantic search via embeddings)
 *     → Return steps[] or null
 *
 *   save(domain, skillName, goal, steps)
 *     → Write to Supabase
 *     → Write to LRU cache
 */

import * as SupabaseService from '../../services/SupabaseService.js';

// ─── LRU Cache ──────────────────────────────────────────────────────────

const MAX_LRU_SIZE = 100;

class LRUCache {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.cache = new Map(); // insertion order = access order (Map preserves insertion)
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        // Move to end (most recently used) by re-inserting
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry;
    }

    set(key, value) {
        // If already exists, delete first to update position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        // Evict oldest if over capacity
        if (this.cache.size > this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    has(key) {
        return this.cache.has(key);
    }

    get size() {
        return this.cache.size;
    }

    clear() {
        this.cache.clear();
    }
}

const lru = new LRUCache(MAX_LRU_SIZE);

// ─── Key Helpers ────────────────────────────────────────────────────────

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return 'unknown';
    }
}

/**
 * Generate a cache key from domain + goal.
 * We normalize the goal to lowercase for better matching.
 */
function lruKey(domain, goal) {
    return `${domain}::${(goal || '').toLowerCase().trim()}`;
}

/**
 * Derive a human-readable skill name from the goal.
 */
export function deriveSkillName(goal) {
    // Take first 60 chars of the goal, replace non-alphanumeric with dashes
    return (goal || 'unnamed')
        .slice(0, 60)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Recall a skill (cached action plan) for a given domain and goal.
 *
 * @param {string} domain - e.g., "www.google.com"
 * @param {string} goal - The user's task description
 * @returns {Promise<object[]|null>} Array of step objects, or null if no skill found
 */
export async function recall(domain, goal) {
    /*
    const key = lruKey(domain, goal);

    // Tier 1: LRU in-memory
    const cached = lru.get(key);
    if (cached) {
        console.log(`[SkillMemory] LRU HIT for "${goal}" on ${domain}`);
        return cached;
    }

    // Tier 2: Supabase semantic search
    try {
        const steps = await SupabaseService.recallSkill(domain, goal);
        if (steps && Array.isArray(steps) && steps.length > 0) {
            console.log(`[SkillMemory] Supabase HIT for "${goal}" on ${domain} (${steps.length} steps)`);
            // Warm the LRU cache
            lru.set(key, steps);
            return steps;
        }
    } catch (e) {
        console.warn('[SkillMemory] Supabase recall failed:', e.message);
    }

    console.log(`[SkillMemory] MISS for "${goal}" on ${domain}`);
    */
    return null;
}

/**
 * Save a successful execution as a reusable skill.
 *
 * @param {string} domain - e.g., "www.google.com"
 * @param {string} goal - The user's task description
 * @param {object[]} steps - The executed steps (with selectors, goalText, etc.)
 */
export async function save(domain, goal, steps) {
    /*
    if (!steps || steps.length === 0) return;

    const skillName = deriveSkillName(goal);
    const key = lruKey(domain, goal);

    // Strip runtime-only fields before persisting
    const cleanSteps = steps.map(s => ({
        type: s.type,
        selector: s.selector || null,
        goalText: s.goalText || s.description || null,
        text: s.text || null,
        url: s.url || null,
        fallbackText: s.fallbackText || null,
        description: s.description || null,
    }));

    // Write to LRU immediately
    lru.set(key, cleanSteps);

    // Write to Supabase in background (don't block execution)
    try {
        await SupabaseService.saveSkill(domain, skillName, goal, cleanSteps);
        console.log(`[SkillMemory] Saved skill "${skillName}" for ${domain} (${cleanSteps.length} steps)`);
    } catch (e) {
        console.warn('[SkillMemory] Supabase save failed (LRU still cached):', e.message);
    }
    */
}

/**
 * Recall from a URL instead of a raw domain string.
 * Convenience wrapper that extracts the domain.
 */
export async function recallFromUrl(url, goal) {
    return recall(getDomain(url), goal);
}

/**
 * Save using a URL instead of a raw domain string.
 */
export async function saveFromUrl(url, goal, steps) {
    return save(getDomain(url), goal, steps);
}

/**
 * Clear the in-memory LRU (Supabase data persists).
 */
export function clearCache() {
    lru.clear();
    console.log('[SkillMemory] LRU cache cleared');
}

/**
 * Get memory stats for debugging.
 */
export function getStats() {
    return {
        lruSize: lru.size,
        lruMaxSize: MAX_LRU_SIZE,
    };
}
