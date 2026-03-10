import { v4 as uuidv4 } from 'uuid';
import * as CreditGuard from '../core/CreditGuard.js';
import { WORKFLOW_SCHEMA, validateWorkflow, getToolDefinitions } from './WorkflowSchema.js';

/**
 * PlannerAgent
 * 
 * Converts natural language goals into Workflow JSON.
 * Calls CreditGuard (never LLMService directly).
 */

const SYSTEM_PROMPT = `
You are the VeriBrowse Browser Automation Planner.
Your job is to convert a user's goal into a deterministic JSON Workflow.

Available Tools:
${getToolDefinitions()}

Rules:
1. Return ONLY valid JSON — no markdown, no extra keys wrapping the result.
2. The top-level object MUST have exactly these fields: "id" (UUID v4), "goal" (string), "steps" (array).
3. Each step MUST have: "id" (UUID v4), "agent" ("browser" or "memory"), "tool" (from the list above), "description" (plain English summary), and "params" (object, may be empty {}).
4. Use "dependsOn" (array of step ids) to specify ordering. Steps without dependencies can run in parallel.
5. Prefer agent "browser" for most tasks. Use agent "memory" only for saveSkill / recallSkill.
6. Use "isShadowTab: true" for repetitive background research tasks.
7. Use "extract" to read page content before resorting to "vision".
8. If the task involves researching multiple topics or comparing sources, use "newTab" to open them concurrently, and "switchTab" to flip between them.
9. If explicitly asked to create a report or document, aggregate your findings and use the "generateReport" tool as the final step.
10. If the task involves multiple steps on a site, include a "saveSkill" step at the end.

Example output shape:
{
  "id": "<uuid>",
  "goal": "<the user goal>",
  "steps": [
    {
      "id": "<uuid>",
      "agent": "browser",
      "tool": "navigate",
      "description": "Navigate to example.com",
      "params": { "url": "https://example.com" }
    }
  ]
}
`.trim();

/**
 * Plans a new workflow from a user goal.
 */
export async function plan(userGoal, context = {}) {
    console.log(`[PlannerAgent] Planning workflow for: "${userGoal}"`);

    const prompt = `
Goal: ${userGoal}
Context: ${JSON.stringify(context)}

Plan a comprehensive workflow to achieve this goal.
`.trim();

    try {
        let workflow = await CreditGuard.generateJSON(
            `${SYSTEM_PROMPT}\n\n${prompt}`,
            WORKFLOW_SCHEMA
        );

        // Unwrap if LLM returned { workflow: {...} } instead of the flat object
        if (workflow && typeof workflow === 'object' && workflow.workflow && !workflow.steps) {
            console.warn('[PlannerAgent] Detected wrapped workflow envelope — unwrapping.');
            workflow = workflow.workflow;
        }

        // Inject goal if missing (LLM sometimes omits it for simple single-step tasks)
        if (workflow && !workflow.goal) {
            workflow.goal = userGoal;
        }

        // Inject top-level id if missing
        if (workflow && !workflow.id) {
            const { v4: uuidv4Fallback } = await import('uuid');
            workflow.id = uuidv4Fallback();
        }

        // Normalise steps: fill in missing optional fields and map 'parameters' -> 'params'
        if (workflow && Array.isArray(workflow.steps)) {
            workflow.steps = workflow.steps.map(step => {
                const params = step.params ?? step.parameters ?? {};
                const { parameters: _unused, ...rest } = step;
                return {
                    agent: 'browser',       // default agent
                    description: step.tool, // fallback description
                    dependsOn: [],
                    ...rest,
                    params,                 // always 'params', never 'parameters'
                };
            });
        }

        // DEBUG: log parsed workflow so we can spot any missing fields
        console.log('[PlannerAgent] Parsed workflow from LLM:', JSON.stringify(workflow, null, 2));

        const validation = validateWorkflow(workflow);
        if (!validation.valid) {
            console.warn('[PlannerAgent] Validation errors detected — attempting auto-repair:', validation.errors);

            // Auto-repair: strip hallucinated / broken steps and keep good ones
            if (workflow && Array.isArray(workflow.steps)) {
                const VALID_TOOLS = new Set([
                    'navigate', 'click', 'type', 'scroll', 'extract',
                    'screenshot', 'vision', 'syncSession',
                    'goBack', 'goForward', 'refresh',
                    'waitForSelector', 'fillForm',
                    'newTab', 'switchTab', 'closeTab', 'getAllTabs',
                    'saveSkill', 'recallSkill',
                ]);
                const before = workflow.steps.length;
                workflow.steps = workflow.steps.filter(s => {
                    if (!s.id || !s.agent || !s.tool || !s.description) return false;
                    if (!['browser', 'memory'].includes(s.agent)) return false;
                    const allowed = s.agent === 'memory'
                        ? new Set(['saveSkill', 'recallSkill'])
                        : VALID_TOOLS;
                    return allowed.has(s.tool);
                });
                console.log(`[PlannerAgent] Auto-repair: kept ${workflow.steps.length}/${before} steps.`);
            }

            // Re-validate after repair
            const recheck = validateWorkflow(workflow);
            if (!recheck.valid) {
                console.error('[PlannerAgent] Auto-repair failed. Remaining errors:', recheck.errors);
                throw new Error('[PlannerAgent] LLM returned an invalid workflow that could not be repaired.');
            }
            console.log('[PlannerAgent] Auto-repair succeeded — workflow is now valid.');
        }

        return workflow;
    } catch (err) {
        console.error(`[PlannerAgent] Planning failed: ${err.message}`);
        throw err;
    }
}

/**
 * Replans a workflow after a step fails.
 */
export async function replan(workflow, failedStep, error, screenshot = null) {
    console.log(`[PlannerAgent] Replanning after failure in step: ${failedStep.id}`);

    // Build a text-only replan prompt (we don't use vision here because the
    // Gemini API rejects inline_data when using generateContent with schema).
    // The error message + remaining steps gives the LLM enough context to recover.
    const prompt = `
Original Goal: ${workflow.goal}
Failed Step: ${failedStep.description} (tool: ${failedStep.tool})
Error: ${error}

Remaining unfinished steps: ${JSON.stringify(
        workflow.steps.filter(s => s.status !== 'done'),
        null, 2
    )}

IMPORTANT: Do NOT retry the exact same step that failed. Try a different approach.
If the issue is a selector timeout, use a more robust selector or add a waitForSelector before clicking.
If the issue is a navigation failure, try a different URL format.

Provide a NEW set of steps to recover and complete the original goal.
`.trim();

    try {
        const newWorkflow = await CreditGuard.generateJSON(
            `${SYSTEM_PROMPT}\n\n${prompt}`,
            WORKFLOW_SCHEMA
        );
        return newWorkflow;
    } catch (err) {
        console.error(`[PlannerAgent] Replanning failed: ${err.message}`);
        throw err;
    }
}

