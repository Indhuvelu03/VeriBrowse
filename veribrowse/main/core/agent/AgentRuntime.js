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
 * @returns {Promise<{ success: boolean, result: object }>}
 */
export async function start(page, goal) {
    if (currentState !== States.IDLE && currentState !== States.DONE && currentState !== States.ABORTED) {
        throw new Error(`[AgentRuntime] Cannot start — already running (state: ${currentState})`);
    }

    currentGoal = goal;
    currentAbort = new AbortController();
    runStats.totalRuns++;

    emitStatus('Starting autonomous agent…', 'executing');
    console.log(`[AgentRuntime] Starting task: "${goal}"`);

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
