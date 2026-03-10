import bus from './EventBus.js';
import * as TaskSnapshot from './TaskSnapshot.js';
import * as PlannerAgent from '../planner/PlannerAgent.js';
import * as CreditGuard from './CreditGuard.js';
import * as IntentDispatcher from './IntentDispatcher.js';
import { Intents } from './IntentDispatcher.js';
import * as AgentRuntime from './agent/AgentRuntime.js';
import UIFeedback from './UIFeedback.js';
import browserManager from './BrowserManager.js';
import { REFINE_PROMPT } from '../constants.js';
import { research as runResearch } from '../agents/ResearchOrchestrator.js';

/**
 * WorkflowEngine
 *
 * The unified orchestrator of VeriBrowse's Hybrid Intent System.
 *
 * Architecture (Fellou.ai model):
 *   1. IntentDispatcher classifies into CHAT / QUICK_ACTION / LONG_HORIZON
 *   2. CHAT → immediate LLM response (no browser)
 *   3. QUICK_ACTION → single-step execute-step dispatch
 *   4. LONG_HORIZON → AgentRuntime autonomous loop (shadow workspace)
 *
 * The old dual-path (DAG task + autonomous) is unified:
 *   - ALL multi-step tasks go through AgentRuntime (plan-once, execute-locally)
 *   - The DAG dispatcher remains as a fallback for externally-injected workflows
 *   - HITL (Human-in-the-Loop) works for both paths via EventBus pause/resume
 */

class WorkflowEngine {
    constructor() {
        this.activeWorkflows = new Map();
        this.isPaused = false;
        this.MAX_REPLAN_ATTEMPTS = 2;
        this.setupListeners();
    }

    setupListeners() {
        // Primary entry point: user submits a goal
        bus.on('workflow:start', async ({ goal, context, mode }) => {
            await this.initWorkflow(goal, context, mode);
        });

        // Tool results from BrowserAgent (for injected DAG workflows + QUICK_ACTION)
        bus.on('step-result', (payload) => {
            this.handleStepResult(payload);
        });

        bus.on('step-error', ({ stepId, workflowId, error }) => {
            this.handleStepResult({
                stepId,
                workflowId,
                result: { success: false, result: null, error },
            });
        });
    }

    // ─── Primary Entry Point ────────────────────────────────────────────

    async initWorkflow(goal, context, mode = 'auto') {
        console.log(`[WorkflowEngine] Goal: "${goal}" (mode: ${mode})`);

        try {
            // ── THINK mode: pure LLM conversation, never touches the browser ──
            if (mode === 'think') {
                UIFeedback.emit('THINKING');
                console.log('[WorkflowEngine] Mode: THINK — forcing CHAT_INTENT');
                return this._handleChat(goal, { response: null });
            }

            // ── REFINE mode: rewrite the prompt first, then dispatch ──
            if (mode === 'refine') {
                UIFeedback.emit('CLASSIFYING');
                console.log('[WorkflowEngine] Mode: REFINE — rewriting prompt');
                let refinedGoal = goal;
                try {
                    refinedGoal = await CreditGuard.generate(
                        `${REFINE_PROMPT}\n\nUser input: ${goal}`
                    );
                    refinedGoal = refinedGoal.trim();
                    console.log(`[WorkflowEngine] Refined goal: "${refinedGoal}"`);
                    bus.emit('agent:chat-response', {
                        goal,
                        response: `✏️ **Refined task:** ${refinedGoal}`,
                    });
                    await new Promise(r => setTimeout(r, 600));
                } catch (e) {
                    console.warn('[WorkflowEngine] Refine LLM failed, using original goal:', e.message);
                    refinedGoal = goal;
                }
                // Use 'auto' so IntentDispatcher decides: knowledge q → chat, browser task → act
                return this.initWorkflow(refinedGoal, context, 'auto');
            }

            // ── Stage 1: Intent Dispatch (auto + act both go through here) ──
            UIFeedback.emit('CLASSIFYING');

            const classification = await IntentDispatcher.dispatch(goal, {
                currentUrl: context?.currentUrl,
                currentTitle: context?.currentTitle,
            });

            const { intent_type, confidence_score, reasoning_summary } = classification;
            console.log(`[WorkflowEngine] Intent: ${intent_type} (${confidence_score}) — ${reasoning_summary}`);

            // Emit intent to UI
            let mappedIntent = 'auto';
            if (intent_type === Intents.CHAT) mappedIntent = 'think';
            else if (intent_type === Intents.QUICK_ACTION) mappedIntent = 'act';
            else if (intent_type === Intents.LONG_HORIZON) mappedIntent = 'deep';

            bus.emit('agent:intent-classified', { intent: mappedIntent });

            // ── DEEP mode: browse + LLM summarize ──
            if (mode === 'deep') {
                console.log('[WorkflowEngine] Mode: DEEP — browse + summarize');
                return this._handleDeep(goal, classification);
            }

            // ── ACT mode: always run as LONG_HORIZON regardless of intent ──
            let effectiveIntent = intent_type;
            if (mode === 'act') {
                effectiveIntent = Intents.LONG_HORIZON;
                console.log('[WorkflowEngine] Mode: ACT — forcing LONG_HORIZON_AUTOMATION');
            }
            // AUTO mode: trust IntentDispatcher (effectiveIntent unchanged)

            // ── Route by intent ──

            // 1. CHAT_INTENT — Conversational reply
            if (effectiveIntent === Intents.CHAT) {
                return this._handleChat(goal, classification);
            }

            // 2. QUICK_ACTION — Single-step fast path
            if (effectiveIntent === Intents.QUICK_ACTION) {
                return this._handleQuickAction(goal, classification);
            }

            // 3. LONG_HORIZON_AUTOMATION — Full autonomous loop
            if (effectiveIntent === Intents.LONG_HORIZON) {
                return this._handleLongHorizon(goal, classification);
            }

            // Fallback
            console.warn(`[WorkflowEngine] Unknown intent '${effectiveIntent}', falling back to LONG_HORIZON`);
            return this._handleLongHorizon(goal, classification);

        } catch (err) {
            console.error('[WorkflowEngine] Init failed:', err.message);
            UIFeedback.emit('FAILED', err.message);
            bus.emit('agent:error', { error: err.message });
        }
    }

    // ─── Intent Handlers ────────────────────────────────────────────────

    /**
     * CHAT_INTENT: Direct conversational response.
     * If IntentDispatcher already has a response, use it. Otherwise generate one.
     */
    async _handleChat(goal, classification) {
        UIFeedback.emit('THINKING');

        let response = classification.response;
        if (!response) {
            // Need a dedicated chat response (IntentDispatcher didn't include one)
            try {
                response = await CreditGuard.generate(
                    `You are VeriBrowse, a helpful AI browser assistant. Answer the user's message conversationally.\n\nUser: ${goal}`
                );
            } catch (e) {
                response = "I'm VeriBrowse AI. I can help you browse the web — try asking me to search for something or navigate to a site!";
            }
        }

        bus.emit('agent:chat-response', { goal, response });
        UIFeedback.emit('CHATTING');
    }

    /**
     * QUICK_ACTION: Single-step execution.
     * Navigate, click, or extract — then done.
     */
    async _handleQuickAction(goal, classification) {
        const url = classification.url || this.extractUrl(goal);

        if (url) {
            UIFeedback.emit('NAVIGATING', url);

            // Emit the step
            const stepId = `quick-nav-${Date.now()}`;
            bus.emit('execute-step', {
                step: {
                    id: stepId,
                    agent: 'browser',
                    tool: 'navigate',
                    description: `Navigate to ${url}`,
                    params: { url },
                    dependsOn: [],
                },
                workflowId: null,
            });

            // Immediate acknowledgement
            bus.emit('agent:chat-response', { goal, response: `📍 Navigating to **${url}**…` });

            // Follow-up once navigation completes
            const followUp = ({ stepId: sid, result }) => {
                if (sid !== stepId) return;
                bus.off('step-result', followUp);
                const title = result?.result?.title || result?.title || '';
                const finalUrl = result?.result?.url || url;
                let siteName;
                try { siteName = title || new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`).hostname.replace('www.', ''); } catch { siteName = url; }
                bus.emit('agent:chat-response', {
                    goal,
                    response: `✅ **${siteName}** has been opened.\n\nWhat would you like me to do here? I can search, click, extract info, fill a form, or run any task on this page.`,
                });
                bus.emit('agent:status', { message: 'Ready', status: 'idle' });
            };
            bus.on('step-result', followUp);

            // Safety: if no step-result within 8s, send the follow-up anyway
            setTimeout(() => {
                bus.off('step-result', followUp);
                let siteName;
                try { siteName = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', ''); } catch { siteName = url; }
                bus.emit('agent:chat-response', {
                    goal,
                    response: `✅ **${siteName}** has been opened.\n\nWhat would you like me to do here? I can search, click, extract info, fill a form, or run any task on this page.`,
                });
                bus.emit('agent:status', { message: 'Ready', status: 'idle' });
            }, 8000);

            return;
        }

        // Non-navigate quick action — delegate to autonomous loop
        console.log('[WorkflowEngine] QUICK_ACTION without URL — delegating to autonomous loop');
        return this._handleLongHorizon(goal, classification);
    }

    /**
     * LONG_HORIZON_AUTOMATION: Full autonomous execution.
     * Uses AgentRuntime which orchestrates AutonomousLoop (plan-once, execute-locally).
     * This is the Z-Axis shadow workspace — execution happens in background.
     */
    async _handleLongHorizon(goal, classification) {
        const page = await this._getPageForTask();
        if (!page) {
            bus.emit('agent:error', { error: 'No browser tab available. Open a tab first.' });
            UIFeedback.emit('FAILED', 'No browser tab');
            return;
        }

        try {
            const { success, result } = await AgentRuntime.start(page, goal);
            if (!success) {
                bus.emit('agent:error', { error: result?.error || 'Autonomous task failed' });
            }
        } catch (err) {
            console.error('[WorkflowEngine] Autonomous runtime failed:', err.message);
            bus.emit('agent:error', { error: err.message });
            UIFeedback.emit('FAILED', err.message);
        }
    }

    /**
     * DEEP mode: Browse + Summarize.
     * For research tasks (compare, find best, research topic), uses multi-tab
     * ResearchOrchestrator. For other tasks, falls back to single-tab autonomous loop.
     * Best for: "find the best X", "compare Y and Z", "research topic T".
     */
    async _handleDeep(goal, classification) {
<<<<<<< Updated upstream
        const page = await this._getPageForTask();
=======
        UIFeedback.emit('PLANNING');

        // Detect if this looks like a research/comparison task
        const researchKeywords = ['research', 'compare', 'find the best', 'find the cheapest', 'summarize', 'analyze', 'report on', 'gather information', 'review', 'investigate'];
        const isResearch = researchKeywords.some(kw => goal.toLowerCase().includes(kw));

        if (isResearch) {
            console.log('[WorkflowEngine] Routing to multi-tab ResearchOrchestrator');
            try {
                const result = await runResearch(goal, { generateDoc: true });
                if (!result.success) {
                    bus.emit('agent:error', { error: 'Research task failed — no sources could be extracted.' });
                }
                bus.emit('agent:autonomous-done', { result: { success: result.success, state: 'DONE' } });
            } catch (err) {
                console.error('[WorkflowEngine] Research orchestrator failed:', err.message);
                bus.emit('agent:error', { error: err.message });
                UIFeedback.emit('FAILED', err.message);
            }
            return;
        }

        // Non-research deep tasks: use single-tab autonomous loop with summary
        const page = browserManager.getActivePage();
>>>>>>> Stashed changes
        if (!page) {
            bus.emit('agent:error', { error: 'No browser tab available. Open a tab first.' });
            UIFeedback.emit('FAILED', 'No browser tab');
            return;
        }

        try {
            const { success, result } = await AgentRuntime.start(page, goal, { deepSummary: true });
            if (!success) {
                bus.emit('agent:error', { error: result?.error || 'Deep research task failed' });
            }
        } catch (err) {
            console.error('[WorkflowEngine] Deep runtime failed:', err.message);
            bus.emit('agent:error', { error: err.message });
            UIFeedback.emit('FAILED', err.message);
        }
    }

    /**
     * Get the page for a new agent task.
     * If the active tab already has content, open a fresh tab so the previous
     * page is not overwritten. Each task runs in its own tab.
     */
    async _getPageForTask() {
        const activePage = browserManager.getActivePage();
        if (!activePage) return null;

        const currentUrl = activePage.url();
        if (!currentUrl || currentUrl === 'about:blank' || currentUrl === 'about:newtab') {
            // Active tab is blank — reuse it
            return activePage;
        }

        // Active tab already has content — create a fresh tab for this task
        const tabId = `user-${Date.now().toString(36)}`;
        console.log(`[WorkflowEngine] Active tab has content (${currentUrl}), opening new tab: ${tabId}`);

        const newPage = await browserManager.createUserTab(tabId);
        browserManager.ensureBrowserView(tabId);
        bus.emit('browser:user-tab-created', {
            id: tabId,
            url: 'about:blank',
            title: 'New Tab',
            favicon: null,
            isLoading: false,
        });
        // Tell the renderer to switch to the new tab
        browserManager.sendToRenderer('browser:user-tab-switched', { tabId });
        return newPage;
    }

    // ─── URL Extraction ─────────────────────────────────────────────────

    extractUrl(input) {
        const lower = input.toLowerCase().trim();
        const cleaned = lower
            .replace(/^(go to|open|visit|navigate to|take me to|show me)\s+/i, '')
            .trim();

        if (cleaned.startsWith('http')) return cleaned;
        if (cleaned.includes('.')) return `https://${cleaned}`;

        const siteMap = {
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
        };

        return siteMap[cleaned] || null;
    }

    // ─── DAG Dispatch (for injected workflows / step-result compat) ─────

    async dispatchReadySteps(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow || workflow.status !== 'running') return;

        const readySteps = workflow.steps.filter(step => {
            if (step.status !== 'pending') return false;
            if (!step.dependsOn || step.dependsOn.length === 0) return true;

            return step.dependsOn.every(depId => {
                const depStep = workflow.steps.find(s => s.id === depId);
                return depStep && depStep.status === 'done';
            });
        });

        if (readySteps.length === 0) {
            // Check if workflow is finished
            this.checkCompletion(workflowId);
            return;
        }

        for (const step of readySteps) {
            step.status = 'executing';

            // Notify Renderer
            bus.emit('workflow:step-updated', { workflowId, stepId: step.id, status: 'executing' });

            // 3. Save snapshot before execution
            TaskSnapshot.save(workflowId, step.id, {
                activeTabs: Array.from(browserManager.userTabs.keys())
            });

            // 4. Dispatch to Agents via EventBus — wrap with workflowId for routing
            bus.emit('execute-step', { step, workflowId });
        }
    }

    async handleStepResult({ stepId, workflowId, result: toolResponse }) {
        // Find which workflow this step belongs to
        let targetWorkflowId = workflowId ?? null;
        let targetStep = null;

        if (targetWorkflowId && this.activeWorkflows.has(targetWorkflowId)) {
            const wf = this.activeWorkflows.get(targetWorkflowId);
            targetStep = wf.steps.find(s => s.id === stepId) ?? null;
        } else {
            // Fallback: scan all workflows (for legacy callers)
            for (const [wfId, wf] of this.activeWorkflows.entries()) {
                const step = wf.steps.find(s => s.id === stepId);
                if (step) {
                    targetWorkflowId = wfId;
                    targetStep = step;
                    break;
                }
            }
        }

        if (!targetStep) return;

        const workflow = this.activeWorkflows.get(targetWorkflowId);

        if (toolResponse.success) {
            // SUCCESS PATH
            targetStep.status = 'done';
            targetStep.result = toolResponse.result;

            // Handle Virtual Vision Tool: Switch from screenshot result to LLM vision call
            if (toolResponse.isVisionData) {
                try {
                    bus.emit('agent:status', { message: 'Analyzing screen...', status: 'thinking' });
                    const visionText = await CreditGuard.vision(targetStep.params.prompt, toolResponse.result);
                    targetStep.result = visionText;
                } catch (err) {
                    targetStep.status = 'failed';
                    targetStep.error = err.message;
                }
            }

            bus.emit('workflow:step-updated', {
                workflowId: targetWorkflowId,
                stepId,
                status: 'done',
                result: targetStep.result
            });

            // CHECK FOR HITL (CAPTCHA detected in navigation result)
            if (toolResponse.result?.needsHuman) {
                workflow.status = 'paused';
                this.isPaused = true;
                bus.emit('workflow:paused', { workflowId: targetWorkflowId, reason: 'hitl' });
                console.log('[WorkflowEngine] HITL pause — waiting for user to resume...');

                // Wait for the user to click "Resume" in HITLCard
                await this.waitForResume();

                // User has handled CAPTCHA — restore and continue
                workflow.status = 'running';
                this.isPaused = false;
                console.log('[WorkflowEngine] Resuming workflow after HITL resolution.');
                bus.emit('workflow:resumed', { workflowId: targetWorkflowId });
                bus.emit('agent:status', { message: 'Resuming task...', status: 'executing' });

                // Re-dispatch any steps that are still pending
                await this.dispatchReadySteps(targetWorkflowId);
                return;
            }

            // Proceed to next steps
            await this.dispatchReadySteps(targetWorkflowId);

        } else {
            // FAILURE PATH: AUTO-REPLAN with cap
            console.warn(`[WorkflowEngine] Step ${stepId} failed: ${toolResponse.error}. Replanning...`);
            bus.emit('agent:status', { message: 'Step failed, replanning...', status: 'replanning' });

            if (workflow.replanAttempts >= this.MAX_REPLAN_ATTEMPTS) {
                console.error(`[WorkflowEngine] Max replan attempts (${this.MAX_REPLAN_ATTEMPTS}) reached. Aborting workflow.`);
                workflow.status = 'failed';
                bus.emit('agent:error', { error: `Max replans reached. Last error: ${toolResponse.error}` });
                bus.emit('workflow:completed', { workflowId: targetWorkflowId });
                return;
            }

            workflow.replanAttempts++;
            console.log(`[WorkflowEngine] Replan attempt ${workflow.replanAttempts}/${this.MAX_REPLAN_ATTEMPTS}`);

            try {
                const tabId = targetStep.params?.tabId || Array.from(browserManager.userTabs.keys())[0];
                const page = browserManager.getPage(tabId);
                let failureShot = null;
                if (page) {
                    failureShot = await page.screenshot({ encoding: 'base64' }).catch(e => {
                        console.warn('[WorkflowEngine] Could not capture failure screenshot:', e.message);
                        return null;
                    });
                }

                const newWorkflow = await PlannerAgent.replan(workflow, targetStep, toolResponse.error, failureShot);

                // Merge: keep completed steps, replace remaining with fresh plan
                // Keep failed step marked so it isn't re-dispatched
                workflow.steps = [
                    ...workflow.steps.filter(s => s.status === 'done'),
                    ...newWorkflow.steps
                        .filter(s => s.id !== targetStep.id)
                        .map(s => ({ ...s, status: 'pending' })),
                    { ...targetStep, status: 'failed' },
                ];

                await this.dispatchReadySteps(targetWorkflowId);
            } catch (err) {
                workflow.status = 'failed';
                bus.emit('workflow:completed', { workflowId: targetWorkflowId });
                bus.emit('agent:error', { error: err.message });
            }
        }
    }

    checkCompletion(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);

        // FIX: A workflow is complete when every step is either 'done' OR 'failed'.
        // Previously checking only 'done' meant a workflow would hang after a replan
        // exhausted its retries, because the failed step's status was never 'done'.
        const allTerminal = workflow.steps.every(
            s => s.status === 'done' || s.status === 'failed'
        );

        if (allTerminal) {
            const succeeded = workflow.steps.every(s => s.status === 'done');
            workflow.status = succeeded ? 'completed' : 'partial';
            console.log(`[WorkflowEngine] Workflow ${workflowId} finished with status: ${workflow.status}`);

            // Clear snapshot
            TaskSnapshot.clear(workflowId);

            // Trigger summary — handled by SummaryAgent, not here
            bus.emit('workflow:summarize', {
                goal: workflow.goal,
                steps: workflow.steps
            });

            bus.emit('workflow:completed', { workflowId });
        }
    }

    /**
     * waitForResume
     * Returns a Promise that resolves once the user clicks "Resume" in HITLCard.
     * Uses bus.once so each HITL pause consumes exactly one resume signal.
     */
    waitForResume() {
        return new Promise((resolve) => {
            bus.once('workflow:resume', () => {
                console.log('[WorkflowEngine] workflow:resume received — unblocking execution.');
                resolve();
            });
        });
    }
}

// Instantiate the singleton engine
const engine = new WorkflowEngine();
export default engine;
