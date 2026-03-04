/**
 * AgentReasoner.js
 *
 * THE SINGLE AI ENTRY POINT for the entire VeriBrowse agent system.
 * Every LLM call in the autonomous loop MUST go through this file.
 *
 * Core principle: "LLM = Strategist, Code = Executor"
 * - planSteps()       → Called ONCE per task to generate a multi-step plan
 * - repairSelector()  → Called ONLY when a local selector lookup fails
 * - resolveAmbiguity()→ Called ONLY when heuristic can't determine next action
 *
 * ALL calls route through CreditGuard — never directly to LLMService.
 */

import { generateJSON, vision } from '../CreditGuard.js';
import { PLANNER_PROMPT, REPAIR_PROMPT, SYSTEM_PROMPT, ACTION_SCHEMA } from '../../constants.js';
import compactor from '../ContextCompactor.js';
import Store from 'electron-store';

const _store = new Store();

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string returned by vision().
 * Throws on malformed JSON so the caller's try/catch can fall back to generateJSON().
 * Without this guard, a single malformed vision response crashes the whole agent loop.
 */
function safeParseJSON(raw) {
    if (typeof raw !== 'string') return raw; // already an object
    // Strip markdown fences that vision models sometimes wrap around JSON
    const cleaned = raw
        .replace(/^[`~]{3,}(?:json)?\s*/i, '')
        .replace(/\s*[`~]{3,}\s*$/i, '')
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // Attempt truncated JSON array recovery (vision responses can be cut off too)
        const recovered = tryRecoverTruncatedArray(cleaned);
        if (recovered) {
            console.warn('[AgentReasoner:safeParseJSON] Recovered truncated JSON array (' + recovered.length + ' items)');
            return recovered;
        }
        throw new Error(`Vision response is not valid JSON: ${e.message}`);
    }
}

/**
 * Try to recover a truncated JSON array by finding the last complete object.
 */
function tryRecoverTruncatedArray(text) {
    if (!text || !text.startsWith('[')) return null;
    let lastCompleteEnd = -1;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 1 && ch === '}') {
                lastCompleteEnd = i;
            }
        }
    }

    if (lastCompleteEnd <= 0) return null;

    let recovered = text.slice(0, lastCompleteEnd + 1).trimEnd();
    if (recovered.endsWith(',')) recovered = recovered.slice(0, -1);
    recovered += '\n]';

    try {
        const parsed = JSON.parse(recovered);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* recovery failed */ }
    return null;
}

/**
 * Trim the DOM snapshot so we never blow the context window.
 * Keep at most 60 interactive elements and truncate visibleText.
 */
function compactSnapshot(snap) {
    if (!snap) return {};
    return {
        url: snap.url,
        title: snap.title,
        visibleText: (snap.visibleText || '').slice(0, 2000),
        interactiveElements: (snap.interactiveElements || []).slice(0, 60),
        inputs: (snap.inputs || []).slice(0, 20),
        buttons: (snap.buttons || []).slice(0, 30),
        links: (snap.links || []).slice(0, 30),
        overlays: snap.overlays || [],
        scrollPosition: snap.scrollPosition,
    };
}

/**
 * Build a structured page context string from a compact snapshot.
 */
function buildPageContext(compact) {
    return [
        `URL: ${compact.url || 'N/A'}`,
        `Title: ${compact.title || 'N/A'}`,
        `Visible Text (truncated): ${compact.visibleText || ''}`,
        `Interactive Elements:\n${JSON.stringify(compact.interactiveElements, null, 1)}`,
        `Inputs:\n${JSON.stringify(compact.inputs, null, 1)}`,
        `Buttons:\n${JSON.stringify(compact.buttons, null, 1)}`,
        `Overlays:\n${JSON.stringify(compact.overlays, null, 1)}`,
        `Scroll: ${JSON.stringify(compact.scrollPosition)}`,
    ].join('\n\n');
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Generate a full multi-step plan for the given goal.
 * Called ONCE at the start of an autonomous task.
 *
 * Returns an array of step objects:
 * [
 *   { type: "NAVIGATE", url: "https://...", description: "Go to site" },
 *   { type: "CLICK", goalText: "search button", description: "Click the search button" },
 *   { type: "TYPE", goalText: "search input", text: "query", description: "Type search query" },
 *   { type: "DONE", result: "...", description: "Summarize result" }
 * ]
 *
 * @param {string} goal - The user's high-level task
 * @param {object|null} snapshot - Current DOM snapshot (may be null for fresh starts)
 * @param {string|null} screenshot - Base64 PNG screenshot
 * @returns {Promise<object[]>} Array of planned steps
 */
export async function planSteps(goal, snapshot = null, screenshot = null) {
    const compact = compactSnapshot(snapshot);
    const pageContext = snapshot ? buildPageContext(compact) : 'No page loaded yet (about:blank).';
    const historyContext = compactor.getCompactContext();

    // Inject saved user profile so the LLM can fill login/signup forms automatically
    const userProfile = _store.get('userProfile') || {};
    const profileFields = Object.entries(userProfile).filter(([, v]) => v && String(v).trim());
    const profileContext = profileFields.length > 0
        ? `## USER PROFILE (use these credentials when filling login or signup forms)\n${profileFields.map(([k, v]) => `${k}: ${v}`).join('\n')}`
        : null;

    // Inject current date so the LLM can resolve "tomorrow", "next Friday", etc.
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const tomorrowStr = new Date(now.getTime() + 86400000).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dateContext = `## CURRENT DATE\nToday is ${dateStr}. Tomorrow is ${tomorrowStr}.`;

    const userPrompt = [
        `## USER GOAL\n${goal}`,
        dateContext,
        profileContext,
        `## TASK HISTORY\n${historyContext}`,
        `## CURRENT PAGE STATE\n${pageContext}`,
        `## INSTRUCTIONS\n${PLANNER_PROMPT}`,
    ].filter(Boolean).join('\n\n');

    let plan;

    if (screenshot) {
        try {
            const raw = await vision(userPrompt, screenshot);
            plan = typeof raw === 'string' ? safeParseJSON(raw) : raw;
        } catch (e) {
            console.warn('[AgentReasoner:planSteps] Vision failed, falling back to text:', e.message);
            plan = await generateJSON(userPrompt);
        }
    } else {
        plan = await generateJSON(userPrompt);
    }

    // Normalize: ensure we always get an array
    if (plan && plan.steps && Array.isArray(plan.steps)) {
        plan = plan.steps;
    }
    if (!Array.isArray(plan)) {
        console.warn('[AgentReasoner:planSteps] LLM did not return an array. Wrapping:', plan);
        plan = plan && plan.type ? [plan] : [];
    }

    // Validate each step has at minimum { type, description }
    plan = plan.filter(step => step && step.type);

    // De-duplicate consecutive identical steps (e.g., 50x "CLICK Next" from date picker hallucination)
    plan = plan.filter((step, i) => {
        if (i === 0) return true;
        const prev = plan[i - 1];
        return !(step.type === prev.type && step.goalText === prev.goalText && step.type !== 'DONE');
    });

    // Hard cap — never return more than 15 steps regardless of LLM output
    plan = plan.slice(0, 15);

    // Ensure the plan ends with DONE if not already
    if (plan.length > 0 && plan[plan.length - 1].type !== 'DONE') {
        plan.push({ type: 'DONE', description: 'Task complete', result: 'Finished' });
    }

    console.log(`[AgentReasoner:planSteps] Generated ${plan.length}-step plan for: "${goal}"`);
    return plan;
}

/**
 * Repair a broken selector. Called ONLY when LocalSelectorService
 * exhausts its heuristic strategies and needs LLM intelligence.
 *
 * @param {string} failedSelector - The CSS selector that didn't work
 * @param {string} goalDescription - What the user/plan wants to interact with
 * @param {object} snapshot - Current DOM snapshot
 * @param {string|null} screenshot - Base64 PNG for visual grounding
 * @returns {Promise<{selector: string, confidence: number}>}
 */
export async function repairSelector(failedSelector, goalDescription, snapshot, screenshot = null) {
    const compact = compactSnapshot(snapshot);

    const userPrompt = [
        `## FAILED SELECTOR\n${failedSelector}`,
        `## GOAL\nI need to interact with: ${goalDescription}`,
        `## CURRENT PAGE\n${buildPageContext(compact)}`,
        `## INSTRUCTIONS\n${REPAIR_PROMPT}`,
    ].join('\n\n');

    let result;

    if (screenshot) {
        try {
            const raw = await vision(userPrompt, screenshot);
            result = typeof raw === 'string' ? safeParseJSON(raw) : raw;
        } catch (e) {
            console.warn('[AgentReasoner:repairSelector] Vision failed, falling back to text:', e.message);
            result = await generateJSON(userPrompt);
        }
    } else {
        result = await generateJSON(userPrompt);
    }

    if (!result || !result.selector) {
        throw new Error(`[AgentReasoner] Selector repair failed — LLM returned no selector`);
    }

    return {
        selector: result.selector,
        fallbackText: result.fallbackText || null,
        confidence: result.confidence || 0.5,
    };
}

/**
 * Re-plan or decide next action when the local executor gets stuck.
 * This is the "expensive" fallback — called only when:
 *   - Multiple steps in the plan have failed
 *   - The page state diverged from what was expected
 *   - An unexpected modal/overlay appeared that heuristics can't dismiss
 *
 * @param {string} goal - Original user goal
 * @param {object[]} completedSteps - Steps already executed
 * @param {object[]} remainingPlan - Steps not yet executed
 * @param {string} stuckReason - Why the loop is stuck
 * @param {object} snapshot - Current DOM snapshot
 * @param {string|null} screenshot - Base64 PNG
 * @returns {Promise<object[]>} New remaining plan (array of steps)
 */
export async function replan(goal, completedSteps, remainingPlan, stuckReason, snapshot, screenshot = null) {
    const compact = compactSnapshot(snapshot);
    const historyContext = compactor.getCompactContext();

    const userPrompt = [
        `## ORIGINAL GOAL\n${goal}`,
        `## TASK HISTORY\n${historyContext}`,
        `## REMAINING PLAN (stalled)\n${JSON.stringify(remainingPlan, null, 1)}`,
        `## STUCK REASON\n${stuckReason}`,
        `## CURRENT PAGE STATE\n${buildPageContext(compact)}`,
        `## INSTRUCTIONS\n${PLANNER_PROMPT}\n\nIMPORTANT: The previous plan got stuck. Generate a REVISED plan starting from the current page state. Do NOT repeat already-completed steps.`,
    ].join('\n\n');

    let plan;

    if (screenshot) {
        try {
            const raw = await vision(userPrompt, screenshot);
            plan = typeof raw === 'string' ? safeParseJSON(raw) : raw;
        } catch (e) {
            console.warn('[AgentReasoner:replan] Vision failed, falling back to text:', e.message);
            plan = await generateJSON(userPrompt);
        }
    } else {
        plan = await generateJSON(userPrompt);
    }

    // Normalize
    if (plan && plan.steps && Array.isArray(plan.steps)) plan = plan.steps;
    if (!Array.isArray(plan)) plan = plan && plan.type ? [plan] : [];
    plan = plan.filter(step => step && step.type);

    // Hard cap on revised plan too
    plan = plan.slice(0, 8);

    if (plan.length > 0 && plan[plan.length - 1].type !== 'DONE') {
        plan.push({ type: 'DONE', description: 'Task complete', result: 'Finished' });
    }

    console.log(`[AgentReasoner:replan] Generated ${plan.length}-step revised plan`);
    return plan;
}

/**
 * Single-action fallback: when the plan step is too vague for local
 * execution, ask the LLM for one concrete ACTION_SCHEMA action.
 * This is the LAST resort — same interface as the old callLLMForAction
 * but the loop should rarely need it.
 *
 * @param {string} task - What the step is trying to accomplish
 * @param {object} snapshot - Current DOM snapshot
 * @param {string|null} screenshot - Base64 PNG
 * @param {object[]} history - Recent action history (last 8 max)
 * @returns {Promise<object>} Single ACTION_SCHEMA-compliant action
 */
export async function decideSingleAction(task, snapshot, screenshot = null, history = []) {
    const compact = compactSnapshot(snapshot);
    const recentHistory = (history || []).slice(-8).map(h => ({
        type: h.type,
        selector: h.selector,
        text: h.text,
        description: h.description,
        _failed: h._failed || false,
        _error: h._error || null,
    }));

    const userPrompt = [
        `## TASK\n${task}`,
        `## CURRENT PAGE\nURL: ${compact.url}\nTitle: ${compact.title}`,
        `## VISIBLE TEXT (truncated)\n${compact.visibleText}`,
        `## INTERACTIVE ELEMENTS\n${JSON.stringify(compact.interactiveElements, null, 1)}`,
        `## INPUTS\n${JSON.stringify(compact.inputs, null, 1)}`,
        `## BUTTONS\n${JSON.stringify(compact.buttons, null, 1)}`,
        `## OVERLAYS\n${JSON.stringify(compact.overlays, null, 1)}`,
        `## SCROLL POSITION\n${JSON.stringify(compact.scrollPosition)}`,
        `## ACTION HISTORY (last ${recentHistory.length})\n${JSON.stringify(recentHistory, null, 1)}`,
        `## RESPONSE FORMAT\n${ACTION_SCHEMA}`,
    ].join('\n\n');

    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

    let action;

    if (screenshot) {
        try {
            const raw = await vision(fullPrompt, screenshot);
            action = typeof raw === 'string' ? safeParseJSON(raw) : raw;
        } catch (e) {
            console.warn('[AgentReasoner:decideSingleAction] Vision failed, fallback:', e.message);
            action = await generateJSON(fullPrompt);
        }
    } else {
        action = await generateJSON(fullPrompt);
    }

    if (!action || typeof action !== 'object' || !action.type) {
        throw new Error('[AgentReasoner] decideSingleAction: LLM returned invalid action');
    }

    return action;
}
