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
import * as SkillMemory from './SkillMemory.js';
import bus from '../EventBus.js';
import compactor from '../ContextCompactor.js';
import UIFeedback from '../UIFeedback.js';

// ─── Constants ──────────────────────────────────────────────────────────
const MAX_PLAN_STEPS = 12;   // max steps in a plan
const MAX_STEP_RETRIES = 3;    // retries per step before replan
const MAX_REPLAN_ATTEMPTS = 2;    // max times we ask the LLM to replan
const MAX_TOTAL_ACTIONS = 20;   // absolute safety ceiling

// Common overlay / modal dismiss selectors
const OVERLAY_DISMISS_SELECTORS = [
    "div[role='dialog'] button:has-text('Dismiss')",
    "div[role='dialog'] button:has-text('Close')",
    "div[role='dialog'] button:has-text('No thanks')",
    "div[role='dialog'] button:has-text('Not now')",
    "button[aria-label='Close']",
    "button[aria-label='Dismiss']",
    ".modal button.close",
    ".popup button.close",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('OK')",
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
    return false;
}

function getDomain(url) {
    try { return new URL(url).hostname; } catch { return 'unknown'; }
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
        const screenshot = await page.screenshot({ encoding: 'base64' });
        await unmarkPage(page);

        // Guard: if base64 is suspiciously small it's a blank/invalid frame — skip vision
        if (!screenshot || screenshot.length < 1500) {
            return { screenshot: null, groundingMap: null };
        }

        return { screenshot, groundingMap };
    } catch (e) {
        console.warn('[AutonomousLoop] Visual grounding failed:', e.message);
        await unmarkPage(page).catch(() => { });
        const screenshot = await page.screenshot({ encoding: 'base64' }).catch(() => null);
        // Same size guard on fallback path
        if (!screenshot || screenshot.length < 1500) {
            return { screenshot: null, groundingMap: null };
        }
        return { screenshot, groundingMap: null };
    }
}

/**
 * Convert a plan step into an ACTION_SCHEMA-compatible action object
 * with a resolved selector from LocalSelectorService.
 */
async function resolveStepToAction(step, snapshot, screenshot, groundingMap = null) {
    // Steps that don't need selector resolution
    if (step.type === 'NAVIGATE') {
        return { type: 'NAVIGATE', url: step.url, reasoning: step.description || 'Navigate' };
    }
    // ... (rest same, skipping to selector logic) ...
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
    // If the step explicitly uses a numeric label from visual grounding (e.g. "[5]")
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
        // Grounding lookup missed — fall through to goalText resolution
        console.warn(`[AutonomousLoop] Grounding miss: [${num}] not in current map — using goalText fallback`);
    }

    // Steps that need selector resolution (CLICK, TYPE)
    const goalText = step.goalText || step.description || step.selector || '';

    // If the plan already includes a concrete CSS selector (and NOT a [N] grounding notation), use it directly
    if (step.selector && !isGroundingNotation &&
        (step.selector.startsWith('#') || step.selector.startsWith('.') || step.selector.startsWith('['))) {
        const action = {
            type: step.type,
            selector: step.selector,
            text: step.text || undefined,
            reasoning: step.description || `${step.type} on ${step.selector}`,
        };
        // Also set fallback text for executeAction's multi-strategy click
        if (goalText) action.text = action.text || goalText;
        return action;
    }

    // Use LocalSelectorService to resolve
    const resolved = await LocalSelector.resolve(goalText, snapshot, screenshot);

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
    if (step.type === 'CLICK' && resolved.fallbackText) {
        action.text = resolved.fallbackText;
    }

    return action;
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
    let usedSkillMemory = false;

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

        // Try SkillMemory first (ZERO LLM calls)
        const cachedSkill = await SkillMemory.recall(domain, goal);
        if (cachedSkill && cachedSkill.length > 0) {
            plan = cachedSkill.slice(0, MAX_PLAN_STEPS);
            usedSkillMemory = true;
            // Seed selector cache from skill
            LocalSelector.seedFromSkill(domain, cachedSkill);
            console.log(`[AutonomousLoop] Using cached skill (${plan.length} steps) — ZERO LLM calls!`);
            emitStep({ thought: `Found cached skill with ${plan.length} steps — no AI needed!`, action: 'SKILL_HIT', status: 'success' });
        } else {
            // Call AgentReasoner.planSteps() — the ONE LLM call for this task
            plan = await AgentReasoner.planSteps(goal, snapshot, screenshot);
            plan = plan.slice(0, MAX_PLAN_STEPS);
            llmCalls++;
            console.log(`[AutonomousLoop] LLM generated ${plan.length}-step plan (1 LLM call)`);
            emitStep({ thought: `AI generated a ${plan.length}-step plan`, action: 'PLAN', status: 'success' });
        }

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

            // Handle DONE step
            if (currentStep.type === 'DONE') {
                const result = currentStep.result || 'Task completed';
                emitStep({ thought: currentStep.description || 'Task complete', action: 'DONE', result, status: 'success' });
                executedSteps.push({ ...currentStep, _success: true });
                setState(States.DONE);

                // Save successful execution as a skill for future reuse
                if (!usedSkillMemory && executedSteps.length > 1) {
                    SkillMemory.saveFromUrl(page.url(), goal, executedSteps).catch(e =>
                        console.warn('[AutonomousLoop] Skill save failed:', e.message)
                    );
                }

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

                const screenshotForStep = await page.screenshot({ encoding: 'base64' }).catch(() => null);

                // Resolve plan step → concrete action
                let action;
                try {
                    action = await resolveStepToAction(currentStep, snapshot, screenshotForStep, groundingMap);
                } catch (e) {
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
                } catch (e) {
                    if (e.name === 'AbortError') throw e;
                    console.warn(`[AutonomousLoop] Execute failed: ${e.message}`);
                    emitStep({ thought: `Action failed: ${e.message}`, action: actionLabel, status: 'fail' });

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
                let afterSnapshot;
                try {
                    afterSnapshot = await getDOMSnapshot(page);
                } catch {
                    afterSnapshot = snapshot; // fallback
                }

                const verification = verifyAction(snapshot, afterSnapshot, action);

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
                    // Update page summary if URL changed
                    if (afterSnapshot.url !== snapshot.url) {
                        compactor.addPageSummary(afterSnapshot.url, afterSnapshot.title || '', afterSnapshot.visibleText || '');
                    }
                } else {
                    console.warn(`[AutonomousLoop] Verification failed for step ${stepIndex + 1}`);
                    emitStep({ thought: 'Action had no visible effect', action: actionLabel, status: 'warn', verification });

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
            }

            // ── Step exhausted retries → REPLAN ──
            if (!stepSuccess) {
                if (replanCount < MAX_REPLAN_ATTEMPTS) {
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
                        emitStep({ thought: 'Replanning failed — aborting', action: 'ABORT', status: 'fail' });
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

        // Save skill if completed successfully
        if (executedSteps.length > 0 && !usedSkillMemory) {
            SkillMemory.saveFromUrl(page.url(), goal, executedSteps).catch(e =>
                console.warn('[AutonomousLoop] Skill save failed:', e.message)
            );
        }

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
