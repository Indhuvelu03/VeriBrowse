import bus from '../core/EventBus.js';
import saveSkill from '../tools/memory/saveSkill.js';
import recallSkill from '../tools/memory/recallSkill.js';

/**
 * MemoryAgent
 *
 * Routes memory-type workflow steps to their respective tools.
 * Manages learned skills and long-term agent memory via Supabase.
 *
 * ⚠️ ZERO LLM IMPORTS. Pure deterministic routing only.
 *
 * STATE FLOW:
 *   WorkflowEngine emits 'execute-step' → { step, workflowId }
 *   MemoryAgent handles if step.agent === 'memory'
 *   MemoryAgent emits 'step-result' or 'step-error' with { stepId, workflowId, result }
 *   WorkflowEngine routes the result back to the correct workflow
 */

class MemoryAgent {
    constructor() {
        this.setupListeners();
    }

    setupListeners() {
        // FIX: Correctly destructure the bus payload — WorkflowEngine wraps
        // steps as { step, workflowId }. Reading the bundle as `step` means
        // step.agent is always undefined and every memory step silently fails.
        bus.on('execute-step', async ({ step, workflowId }) => {
            if (!step || step.agent !== 'memory') return;

            console.log(`[MemoryAgent] Executing step: ${step.tool} (${step.id})`);

            let response;
            try {
                switch (step.tool) {
                    case 'saveSkill':
                        response = await saveSkill(null, step.params);
                        break;
                    case 'recallSkill':
                        response = await recallSkill(null, step.params);
                        break;
                    default:
                        throw new Error(`[MemoryAgent] Unknown tool: ${step.tool}`);
                }

                // Include workflowId so WorkflowEngine._handleStepResult can
                // route the result to the correct active workflow directly.
                bus.emit('step-result', {
                    stepId: step.id,
                    workflowId,
                    result: response,
                });
            } catch (err) {
                console.error(`[MemoryAgent] Error executing ${step.tool}:`, err.message);
                bus.emit('step-error', {
                    stepId: step.id,
                    workflowId,
                    error: err.message,
                });
            }
        });
    }
}

// Initialize the agent singleton
new MemoryAgent();
export default MemoryAgent;
