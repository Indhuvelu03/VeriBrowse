import bus from './EventBus.js';
import * as TaskSnapshot from './TaskSnapshot.js';
import * as PlannerAgent from '../planner/PlannerAgent.js';
import * as CreditGuard from './CreditGuard.js';
import * as IntentClassifier from './IntentClassifier.js';
import * as AgentRuntime from './agent/AgentRuntime.js';

/**
 * WorkflowEngine
 * 
 * The core orchestrator of VeriBrowse.
 * - Executes workflows as a DAG (Directed Acyclic Graph).
 * - Manages state snapshots before every tool call.
 * - Handles auto-replanning on tool failure.
 * - Intercepts CAPTCHA/Login needs (HITL).
 */

class WorkflowEngine {
    constructor() {
        this.activeWorkflows = new Map();
        this.isPaused = false;
        this.MAX_REPLAN_ATTEMPTS = 2;
        this.setupListeners();
    }

    setupListeners() {
        // Listen for new workflow requests from Renderer -> Background -> Bus
        bus.on('workflow:start', async ({ goal, context, mode }) => {
            await this.initWorkflow(goal, context, mode);
        });

        // Listen for successful tool results from Agents
        bus.on('step-result', (payload) => {
            // payload: { stepId, workflowId, result: { success, result, error } }
            this.handleStepResult(payload);
        });

        // Listen for hard errors emitted by BrowserAgent
        bus.on('step-error', ({ stepId, workflowId, error }) => {
            this.handleStepResult({
                stepId,
                workflowId,
                result: { success: false, result: null, error },
            });
        });

        // NOTE: workflow:summarize is handled exclusively by SummaryAgent.js.
        // Registering it here too caused two LLM calls per completed workflow.
        // DO NOT add a workflow:summarize listener in this class.

        // FIX 1: HITL Resume — renderer sends agent:resume -> preload -> ipcMain -> bus.emit('workflow:resume')
        // No handler here; the one-shot Promise inside waitForResume() handles this per-workflow.
    }

    async initWorkflow(goal, context, mode = 'refine') {
        console.log(`[WorkflowEngine] Starting workflow for goal: "${goal}" (mode: ${mode})`);

        try {
            bus.emit('agent:status', { message: 'Classifying intent...', status: 'planning' });

            // Determine intent based on mode or auto-classify
            let intent, response, url;

            if (mode === 'think') {
                // Think mode: force conversational response
                intent = 'chat';
                const result = await IntentClassifier.classify(goal);
                response = result.response;
            } else if (mode === 'act') {
                // Act mode: force task workflow
                intent = 'task';
            } else {
                // Refine mode (default): auto-classify via LLM
                const result = await IntentClassifier.classify(goal);
                intent = result.intent;
                response = result.response;
                url = result.url;
            }

            console.log(`[WorkflowEngine] Intent classified as: ${intent}`);

            // Route based on intent
            if (intent === 'chat') {
                // Direct conversational response — no browser automation
                const chatResponse = response || "I'm VeriBrowse AI. Give me a task like \"Go to Amazon and search for laptops\" and I'll handle it.";
                bus.emit('agent:chat-response', { goal, response: chatResponse });
                bus.emit('agent:status', { message: 'Ready', status: 'idle' });
                return;
            }

            if (intent === 'navigate') {
                // Direct navigation — skip planner, execute navigate tool directly
                const targetUrl = url || this.extractUrl(goal);
                if (targetUrl) {
                    bus.emit('agent:status', { message: `Navigating to ${targetUrl}...`, status: 'executing' });
                    bus.emit('execute-step', {
                        step: {
                            id: 'direct-nav-' + Date.now(),
                            agent: 'browser',
                            tool: 'navigate',
                            description: `Navigate to ${targetUrl}`,
                            params: { url: targetUrl },
                            dependsOn: [],
                        },
                        workflowId: null,
                    });
                    bus.emit('agent:chat-response', { goal, response: `Navigating to ${targetUrl}...` });
                    return;
                }
                // If URL extraction failed, fall through to task
                console.warn('[WorkflowEngine] Navigate intent but no URL found, falling through to task planning');
            }

            // Autonomous intent: hand off to AgentRuntime (plan-once, execute-locally)
            if (intent === 'autonomous') {
                const tabId = global.activeTabId || Array.from(global.userTabsMap.keys())[0];
                const entry = global.userTabsMap?.get(tabId);
                if (!entry?.playwrightPage) {
                    bus.emit('agent:error', { error: 'No browser tab available for autonomous mode.' });
                    return;
                }

                try {
                    const { success, result } = await AgentRuntime.start(entry.playwrightPage, goal);
                    if (!success) {
                        bus.emit('agent:error', { error: result?.error || 'Autonomous task failed' });
                    }
                } catch (loopErr) {
                    console.error('[WorkflowEngine] Autonomous runtime failed:', loopErr.message);
                    bus.emit('agent:error', { error: loopErr.message });
                }
                return;
            }

            // Task intent: full workflow planning via PlannerAgent
            bus.emit('agent:status', { message: 'Planning workflow...', status: 'planning' });

            const workflow = await PlannerAgent.plan(goal, context);

            this.activeWorkflows.set(workflow.id, {
                ...workflow,
                status: 'running',
                startTime: Date.now(),
                replanAttempts: 0,
                steps: workflow.steps.map(s => ({ ...s, status: 'pending', result: null }))
            });

            // Dispatch first set of ready steps
            await this.dispatchReadySteps(workflow.id);

        } catch (err) {
            console.error('[WorkflowEngine] Init failed:', err.message);
            bus.emit('agent:error', { error: err.message });
        }
    }

    /**
     * Attempt to extract a URL from a user command like "go to google" or "open youtube".
     */
    extractUrl(input) {
        const lower = input.toLowerCase().trim();
        // Remove command prefixes
        const cleaned = lower
            .replace(/^(go to|open|visit|navigate to|take me to)\s+/i, '')
            .trim();

        // If it already has a protocol
        if (cleaned.startsWith('http')) return cleaned;

        // If it looks like a domain
        if (cleaned.includes('.')) return `https://${cleaned}`;

        // Common site names
        const siteMap = {
            'google': 'https://www.google.com',
            'youtube': 'https://www.youtube.com',
            'github': 'https://www.github.com',
            'reddit': 'https://www.reddit.com',
            'twitter': 'https://www.twitter.com',
            'x': 'https://www.x.com',
            'facebook': 'https://www.facebook.com',
            'amazon': 'https://www.amazon.com',
            'wikipedia': 'https://www.wikipedia.org',
            'linkedin': 'https://www.linkedin.com',
            'instagram': 'https://www.instagram.com',
            'stackoverflow': 'https://stackoverflow.com',
            'stack overflow': 'https://stackoverflow.com',
        };

        return siteMap[cleaned] || `https://www.${cleaned}.com`;
    }

    async dispatchReadySteps(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow || workflow.status !== 'running') return;

        // Find steps that are 'pending' and have all 'dependsOn' satisfied
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
                activeTabs: Array.from(global.userTabsMap.keys())
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
                const tabId = targetStep.params?.tabId || Array.from(global.userTabsMap.keys())[0];
                const page = global.userTabsMap.get(tabId)?.playwrightPage;
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
