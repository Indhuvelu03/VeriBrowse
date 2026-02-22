/**
 * WorkflowEngine.js
 *
 * Layer 2: DAG Executor.
 *
 * - Receives a Workflow from PlannerAgent
 * - Resolves the DAG (dependsOn) to find runnable steps
 * - Dispatches steps to Agents (BrowserAgent, MemoryAgent) via EventBus
 * - Listens for step-result / step-error events
 * - Takes snapshots before each step (via TaskSnapshot)
 * - On failure: takes screenshot → requests replan from PlannerAgent → resumes
 * - On CAPTCHA: emits 'needs-human' to IPC layer and awaits 'agent-resume'
 * - At the end: calls SummaryAgent to generate the final answer
 *
 * Key constraint: Engine NEVER imports Agents directly.
 * All step execution is via EventBus.emit('execute-step').
 */

import { v4 as uuidv4 } from 'uuid';
import EventBus from '../core/EventBus.js';
import * as TaskSnapshot from '../core/TaskSnapshot.js';
import * as PlannerAgent from '../planner/PlannerAgent.js';
import { summarize } from '../agents/SummaryAgent.js';
import screenshotTool from '../tools/browser/screenshot.js';
import browserAgent from '../agents/BrowserAgent.js';

const MAX_REPLAN_ATTEMPTS = 2;
const STEP_TIMEOUT_MS = 60000; // 60 seconds per step

class WorkflowEngine {
    constructor() {
        this.activeWorkflows = new Map(); // workflowId → workflow
        this._resultListeners = new Set();
        this._humanResumeResolvers = new Map(); // stepId → resolve fn
    }

    /**
     * Execute a workflow from start to finish.
     * @param {object} workflow    The workflow from PlannerAgent
     * @param {Function} onProgress  Called with progress events for IPC relay
     * @returns {Promise<{ success, summary, workflow }>}
     */
    async execute(workflow, onProgress = () => { }) {
        workflow.status = 'running';
        workflow._replanAttempts = 0; // persistent counter — survives recursive _runDAG calls
        this.activeWorkflows.set(workflow.id, workflow);

        console.log(`[WorkflowEngine] Executing workflow ${workflow.id}: "${workflow.goal}"`);

        try {
            await this._runDAG(workflow, onProgress);
        } catch (err) {
            console.error('[WorkflowEngine] DAG execution error:', err.message);
            workflow.status = 'failed';
        }

        // Generate summary regardless of failure (partial results still useful)
        onProgress({ type: 'thinking', message: 'Generating summary...' });
        const summary = await summarize(workflow.goal, workflow.steps).catch((e) => {
            console.error('[WorkflowEngine] Summary failed:', e.message);
            return 'Task completed. Summary generation failed.';
        });

        workflow.status = workflow.steps.every((s) => s.status === 'done' || s.status === 'skipped')
            ? 'complete'
            : 'failed';

        this.activeWorkflows.delete(workflow.id);
        TaskSnapshot.clear(workflow.id);

        return { success: workflow.status === 'complete', summary, workflow };
    }

    /**
     * Run the DAG: find runnable steps → execute → mark done → repeat.
     * Handles failures with replan.
     */
    async _runDAG(workflow, onProgress) {
        while (true) {
            const runnable = this._getRunnableSteps(workflow);

            if (runnable.length === 0) {
                const pending = workflow.steps.filter((s) => s.status === 'pending');
                if (pending.length > 0) {
                    // Steps still pending but nothing is runnable = deadlock (deps failed)
                    pending.forEach((s) => (s.status = 'skipped'));
                    console.warn('[WorkflowEngine] Deadlock detected — skipping remaining steps');
                }
                break; // Done
            }

            // Execute runnable steps (could be parallel if they share no deps)
            const execPromises = runnable.map((step) =>
                this._executeStep(workflow, step, onProgress)
            );

            await Promise.allSettled(execPromises);
        }
    }

    /**
     * Get all steps whose dependencies are all 'done'.
     */
    _getRunnableSteps(workflow) {
        return workflow.steps.filter((step) => {
            if (step.status !== 'pending') return false;
            return step.dependsOn.every((depId) => {
                const dep = workflow.steps.find((s) => s.id === depId);
                return dep?.status === 'done' || dep?.status === 'skipped';
            });
        });
    }

    /**
     * Execute a single step via EventBus.
     */
    async _executeStep(workflow, step, onProgress) {
        step.status = 'running';

        // Snapshot before execution
        const completedIds = workflow.steps.filter((s) => s.status === 'done').map((s) => s.id);
        const agentContext = {
            activeTabId: browserAgent.activeTabId,
            tabUrls: Object.fromEntries([...browserAgent.tabsMap.entries()].map(([id, t]) => [id, t.url])),
            url: browserAgent.getActivePage()?.url() || '',
        };
        TaskSnapshot.save(workflow.id, step.id, completedIds, agentContext);

        onProgress({
            type: 'step_start',
            stepId: step.id,
            tool: step.tool,
            description: step.description,
            message: step.description,
            current: workflow.steps.indexOf(step) + 1,
            total: workflow.steps.length,
        });

        try {
            const result = await this._dispatchAndWait(workflow.id, step);

            if (!result.success) {
                throw new Error(result.error || 'Step returned success: false');
            }

            step.status = 'done';
            step.result = result;

            onProgress({
                type: 'step_done',
                stepId: step.id,
                tool: step.tool,
                description: step.description,
                message: `✓ ${step.description}`,
            });

            return result;
        } catch (err) {
            console.error(`[WorkflowEngine] Step ${step.id} failed:`, err.message);
            step.status = 'failed';
            step.error = err.message;

            onProgress({
                type: 'step_failed',
                stepId: step.id,
                tool: step.tool,
                description: step.description,
                message: `✗ ${step.description}: ${err.message}`,
            });

            // Attempt replan — use workflow._replanAttempts so counter survives recursion
            if (workflow._replanAttempts < MAX_REPLAN_ATTEMPTS) {
                workflow._replanAttempts++;
                console.log(`[WorkflowEngine] Step ${step.id} failed. Replanning... (attempt ${workflow._replanAttempts}/${MAX_REPLAN_ATTEMPTS})`);
                onProgress({ type: 'thinking', message: `Analysing failure, replanning (${workflow._replanAttempts}/${MAX_REPLAN_ATTEMPTS})...` });

                const screenshotData = await this._captureScreenshot().catch(() => null);
                const updatedWorkflow = await PlannerAgent.replan(workflow, step, err.message, screenshotData);

                // Merge updated steps back — but keep the failed step marked so it isn't re-queued
                workflow.steps = updatedWorkflow.steps.map(s =>
                    s.id === step.id ? { ...s, status: 'failed' } : s
                );

                // Resume DAG from updated state
                return this._runDAG(workflow, onProgress);
            }

            // Max replans reached — give up cleanly
            console.error(`[WorkflowEngine] Max replan attempts (${MAX_REPLAN_ATTEMPTS}) reached for step ${step.id}. Giving up.`);
            onProgress({ type: 'step_failed', stepId: step.id, message: `Giving up after ${MAX_REPLAN_ATTEMPTS} replan attempts: ${err.message}` });
            return null;
        }
    }

    /**
     * Dispatch a step via EventBus and wait for result/error with timeout.
     */
    _dispatchAndWait(workflowId, step) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                EventBus.off('step-result', onResult);
                EventBus.off('step-error', onError);
                EventBus.off('needs-human', onHuman);
                reject(new Error(`Step ${step.id} timed out after ${STEP_TIMEOUT_MS}ms`));
            }, STEP_TIMEOUT_MS);

            const cleanup = () => {
                clearTimeout(timeout);
                EventBus.off('step-result', onResult);
                EventBus.off('step-error', onError);
                EventBus.off('needs-human', onHuman);
            };

            const onResult = ({ stepId, workflowId: wid, result }) => {
                if (stepId !== step.id || wid !== workflowId) return;
                cleanup();
                // 'result' is the tool's response object { success, result, error }
                resolve(result ?? { success: false, error: 'Empty result from agent' });
            };

            const onError = ({ stepId, workflowId: wid, error }) => {
                if (stepId !== step.id || wid !== workflowId) return;
                cleanup();
                reject(new Error(error));
            };

            const onHuman = ({ stepId, workflowId: wid, reason, screenshot }) => {
                if (stepId !== step.id || wid !== workflowId) return;
                cleanup();

                // Relay to IPC, then wait for resume
                EventBus.emit('ipc:needs-human', { stepId, workflowId, reason, screenshot });

                const resumeTimeout = setTimeout(() => {
                    resolve({ success: false, result: null, error: 'Human takeover timeout' });
                }, 120000); // 2 min for user to solve CAPTCHA

                EventBus.once('agent-resume', ({ stepId: sid }) => {
                    if (sid !== step.id) return;
                    clearTimeout(resumeTimeout);
                    // Retry the step after human intervention
                    this._dispatchAndWait(workflowId, step).then(resolve).catch(reject);
                });
            };

            EventBus.on('step-result', onResult);
            EventBus.on('step-error', onError);
            EventBus.on('needs-human', onHuman);

            // Dispatch the step
            EventBus.emit('execute-step', { step, workflowId });
        });
    }

    async _captureScreenshot() {
        const page = browserAgent.getActivePage();
        if (!page) return null;
        try {
            const buf = await page.screenshot({ type: 'png', fullPage: false });
            return buf.toString('base64');
        } catch {
            return null;
        }
    }

    /**
     * Resume after human interaction (CAPTCHA solved, login done, etc.)
     */
    resume(stepId) {
        EventBus.emit('agent-resume', { stepId });
    }

    /**
     * Abort the active workflow.
     */
    abort(workflowId) {
        const wf = this.activeWorkflows.get(workflowId);
        if (wf) {
            wf.steps.filter((s) => s.status === 'pending' || s.status === 'running').forEach((s) => {
                s.status = 'failed';
                s.error = 'Aborted by user';
            });
            wf.status = 'failed';
        }
    }
}

// Singleton
const engine = new WorkflowEngine();
export default engine;
