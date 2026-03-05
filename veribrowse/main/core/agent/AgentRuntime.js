/**
 * AgentRuntime.js
 *
 * Unified orchestrator for the VeriBrowse agent system.
 * Connects intent classification → autonomous execution → UI events.
 *
 * Responsibilities:
 *   - Receives user goals from IPC
 *   - Routes through IntentClassifier
 *   - For autonomous tasks: launches AutonomousLoop
 *   - Manages AbortController lifecycle
 *   - Emits status events to renderer
 *   - Tracks LLM call metrics
 *
 * This is the ONLY entry point for agent execution from the IPC layer.
 * background.js calls AgentRuntime.start() instead of browserAgentLoop directly.
 */

import autonomousLoop, { States } from './AutonomousLoop.js';
import * as SkillMemory from './SkillMemory.js';
import * as LocalSelector from './LocalSelectorService.js';
import bus from '../EventBus.js';
import UIFeedback from '../UIFeedback.js';
import compactor from '../ContextCompactor.js';
import * as CreditGuard from '../CreditGuard.js';
import { startLivePreview } from '../LivePreview.js';
import { DEEP_SUMMARY_PROMPT } from '../../constants.js';

// ─── Runtime State ──────────────────────────────────────────────────────
let currentAbort = null;    // AbortController for the active task
let currentState = States.IDLE;
let currentGoal = null;
let runStats = { totalRuns: 0, totalLLMCalls: 0, skillHits: 0 };

// ─── Helpers ────────────────────────────────────────────────────────────

function emitStatus(message, status = 'idle') {
    UIFeedback.emit({ message, status });
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Start an autonomous task.
 *
 * @param {import('playwright').Page} page - The Playwright page to automate
 * @param {string} goal - The user's high-level task description
 * @param {object} [options] - Optional flags
 * @param {boolean} [options.deepSummary] - If true, run an LLM summarization pass after completion
 * @returns {Promise<{ success: boolean, result: object }>}
 */
export async function start(page, goal, options = {}) {
    const { deepSummary = false } = options;
    if (currentState !== States.IDLE && currentState !== States.DONE && currentState !== States.ABORTED) {
        throw new Error(`[AgentRuntime] Cannot start — already running (state: ${currentState})`);
    }

    currentGoal = goal;
    currentAbort = new AbortController();
    runStats.totalRuns++;

    emitStatus('Starting autonomous agent…', 'executing');
    console.log(`[AgentRuntime] Starting task: "${goal}"`);
    const stopLivePreview = startLivePreview(page);

    try {
        const result = await autonomousLoop(page, goal, {
            signal: currentAbort.signal,
            onStateChange: (newState) => {
                currentState = newState;
                bus.emit('agent:state-change', { state: newState, goal });
            },
        });

        // Update global metrics
        runStats.totalLLMCalls += result.llmCalls || 0;
        if (result.llmCalls === 0) runStats.skillHits++;

        // Log efficiency metrics
        const efficiency = result.steps?.length > 0
            ? ((result.steps.length - (result.llmCalls || 0)) / result.steps.length * 100).toFixed(0)
            : 0;
        console.log(`[AgentRuntime] Task ${result.success ? 'COMPLETED' : 'FAILED'} — ${result.steps?.length || 0} steps, ${result.llmCalls || 0} LLM calls (${efficiency}% local execution)`);

        emitStatus('Ready', 'idle');
        currentState = result.state || States.DONE;

        // ── Deep Summary: synthesize all findings into a chat answer ──
        if (deepSummary && result.success) {
            try {
                emitStatus('Summarizing findings…', 'thinking');
                console.log('[AgentRuntime] Running deep summary for:', goal);

                // 1. Collected extracted text results (EXTRACT action outputs)
                const extractedTexts = (result.steps || [])
                    .filter(s => (s._success || s.success) && s.result &&
                        typeof s.result === 'string' && s.result.length > 40 &&
                        !s.result.startsWith('Task') && s.result !== 'success')
                    .map(s => s.result)
                    .join('\n\n');

                // 2. Page summaries from the context compactor
                const compactContext = compactor.getCompactContext();
                const pageSummaries = compactContext?.pageSummaries
                    ? compactContext.pageSummaries.map(p => `[${p.title || p.url}]\n${p.text}`).join('\n\n')
                    : '';

                // 3. Step narrative — what the agent actually did (always available)
                const stepNarrative = (result.steps || [])
                    .filter(s => (s._success || s.success) && s.type !== 'DONE')
                    .map((s, i) => {
                        const desc = s.description || s.reasoning || s.thought || '';
                        const url = s.url ? ` (${s.url})` : '';
                        return `${i + 1}. [${s.type || 'ACTION'}]${url} — ${desc}`;
                    })
                    .filter(Boolean)
                    .join('\n');

                // Build context — prioritise rich data, fall back to step narrative
                const researchData = [extractedTexts, pageSummaries, stepNarrative]
                    .filter(Boolean)
                    .join('\n\n---\n\n');

                // Always generate an LLM summary — even if only step narrative is available
                const summaryPrompt = `${DEEP_SUMMARY_PROMPT}\n\n## USER GOAL\n${goal}\n\n## RESEARCH DATA\n${researchData.substring(0, 8000)}`;
                const summary = await CreditGuard.generate(summaryPrompt);
                bus.emit('agent:chat-response', { goal, response: summary });
                console.log('[AgentRuntime] Deep summary emitted.');

                emitStatus('Ready', 'idle');
            } catch (summaryErr) {
                console.warn('[AgentRuntime] Deep summary failed:', summaryErr.message);
                // Graceful fallback: explain what was done without LLM
                const stepCount = result.steps?.filter(s => s._success || s.success).length || 0;
                bus.emit('agent:chat-response', {
                    goal,
                    response: `✅ Task completed in ${stepCount} steps. I browsed, searched, and interacted with the page as requested. Switch to the browser to see the result.`
                });
                emitStatus('Ready', 'idle');
            }
        }

        // ── Non-Deep result: surface the DONE step's result as a chat reply ──
        if (!deepSummary && result.success) {
            const successSteps = result.steps || [];
            const doneStep = successSteps.slice().reverse().find(s => s.type === 'DONE');
            const doneResult = doneStep?.result;

            // Also collect EXTRACT step output — actual page data captured during execution
            const extractResult = successSteps
                .filter(s => s.type === 'EXTRACT' && (s._success || s.success) && s.result &&
                    typeof s.result === 'string' && s.result.length > 40)
                .map(s => s.result)
                .join('\n\n').trim();

            const stepCount = successSteps.filter(s => s._success || s.success).length || 0;
            const GENERIC = /^(Task complete|Finished|Done|Task completed|Finished\.)\.?$/i;

            let chatReply;
            if (doneResult && typeof doneResult === 'string' && doneResult.length > 20 && !GENERIC.test(doneResult)) {
                // Planner provided a meaningful DONE result (e.g. product name + price)
                chatReply = doneResult;
            } else if (extractResult) {
                // Fall back to EXTRACT output — trim to ~800 chars for readability
                chatReply = extractResult.length > 800
                    ? extractResult.slice(0, 800) + '…'
                    : extractResult;
            } else {
                chatReply = `✅ Done in ${stepCount} step${stepCount !== 1 ? 's' : ''}. Check the browser for the result.`;
            }
            bus.emit('agent:chat-response', { goal, response: chatReply });
        }

        // Notify renderer
        const browserManager = (await import('../BrowserManager.js')).default;
        browserManager.sendToRenderer('agent:autonomous-done', {
            result: {
                success: result.success,
                state: result.state,
                stepCount: result.steps?.length || 0,
                llmCalls: result.llmCalls || 0,
                lastStep: result.steps?.[result.steps.length - 1] || null,
            },
        });

        return {
            success: result.success,
            result: {
                state: result.state,
                stepCount: result.steps?.length || 0,
                llmCalls: result.llmCalls || 0,
                steps: result.steps,
            },
        };
    } catch (err) {
        console.error('[AgentRuntime] Unexpected error:', err.message);
        emitStatus('Ready', 'idle');
        currentState = States.ABORTED;
        bus.emit('agent:error', { error: err.message });
        return { success: false, result: { error: err.message } };
    } finally {
        stopLivePreview();
        currentAbort = null;
    }
}

/**
 * Cancel the currently running autonomous task.
 */
export function cancel() {
    if (currentAbort) {
        console.log('[AgentRuntime] Cancelling autonomous task.');
        currentAbort.abort();
    }
}

/**
 * Get the current runtime state.
 */
export function getState() {
    return {
        state: currentState,
        goal: currentGoal,
        isRunning: currentState === States.PLANNING ||
            currentState === States.ACTING ||
            currentState === States.VERIFYING ||
            currentState === States.REPLANNING,
    };
}

/**
 * Get runtime statistics for monitoring/debugging.
 */
export function getStats() {
    return {
        ...runStats,
        selectorCacheStats: LocalSelector.getStats(),
        skillMemoryStats: SkillMemory.getStats(),
        contextCompactorStats: compactor.getStats(),
        currentState,
        currentGoal,
    };
}

/**
 * Reset runtime state (for testing or fresh starts).
 */
export function reset() {
    cancel();
    currentState = States.IDLE;
    currentGoal = null;
    LocalSelector.getStats(); // no-op but validates it exists
    console.log('[AgentRuntime] Runtime reset');
}
