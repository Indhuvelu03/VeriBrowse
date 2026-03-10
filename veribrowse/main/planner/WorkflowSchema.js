/**
 * WorkflowSchema.js
 * 
 * Defines the structure of a Workflow object and provides validation.
 * Used by PlannerAgent to ensure LLM output conforms to the engine's requirements.
 */

export const WORKFLOW_SCHEMA = {
    type: 'object',
    properties: {
        id: { type: 'string', format: 'uuid' },
        goal: { type: 'string' },
        steps: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    agent: { type: 'string', enum: ['browser', 'memory'] },
                    tool: {
                        type: 'string',
                        enum: [
                            'navigate', 'click', 'type', 'scroll', 'extract',
                            'screenshot', 'vision', 'syncSession',
                            'goBack', 'goForward', 'refresh',
                            'waitForSelector', 'fillForm',
                            'newTab', 'switchTab', 'closeTab', 'getAllTabs',
                            'saveSkill', 'recallSkill', 'generateReport', 'accessVault', 'suspend'
                        ]
                    },
                    params: { type: 'object' },
                    dependsOn: { type: 'array', items: { type: 'string' } },
                    description: { type: 'string' },
                    isShadowTab: { type: 'boolean' }
                },
                required: ['id', 'agent', 'tool', 'description']
            }
        }
    },
    required: ['id', 'goal', 'steps']
};

// ── Master allow-list of valid tools per agent ──
const VALID_BROWSER_TOOLS = new Set([
    'navigate', 'click', 'type', 'scroll', 'extract',
    'screenshot', 'vision', 'syncSession',
    'goBack', 'goForward', 'refresh',
    'waitForSelector', 'fillForm',
    'newTab', 'switchTab', 'closeTab', 'getAllTabs', 'generateReport', 'accessVault', 'suspend'
]);
const VALID_MEMORY_TOOLS = new Set(['saveSkill', 'recallSkill']);

// ── Required params per tool (must have at least these keys) ──
const REQUIRED_PARAMS = {
    navigate: ['url'],
    type: ['text'],
    fillForm: ['fields'],
    newTab: ['url'],
    switchTab: ['tabId'],
    closeTab: ['tabId'],
    generateReport: ['topic', 'content'],
    accessVault: ['key'],
    saveSkill: ['domain', 'skillName', 'goal', 'steps'],
    recallSkill: ['domain', 'goal'],
};

/**
 * Validates a workflow object against the schema.
 * Returns { valid: boolean, errors: string[] }
 * For backward compat the bare boolean form still works when called
 * with a single arg — callers that need errors can inspect .errors.
 */
export function validateWorkflow(workflow) {
    const errors = [];

    if (!workflow || typeof workflow !== 'object') {
        errors.push('Workflow is not an object.');
        return _result(false, errors);
    }
    if (!workflow.id) errors.push('Missing workflow.id');
    if (!workflow.goal) errors.push('Missing workflow.goal');
    if (!Array.isArray(workflow.steps)) errors.push('workflow.steps is not an array');

    if (errors.length) return _result(false, errors);

    const stepIds = new Set();

    for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const prefix = `Step[${i}]`;

        // ── Required fields ──
        if (!step.id) errors.push(`${prefix}: Missing id`);
        if (!step.agent) errors.push(`${prefix}: Missing agent`);
        if (!step.tool) errors.push(`${prefix}: Missing tool`);
        if (!step.description) errors.push(`${prefix}: Missing description`);

        // ── Duplicate id check ──
        if (step.id) {
            if (stepIds.has(step.id)) errors.push(`${prefix}: Duplicate id "${step.id}"`);
            stepIds.add(step.id);
        }

        // ── Agent validity ──
        if (step.agent && !['browser', 'memory'].includes(step.agent)) {
            errors.push(`${prefix}: Unknown agent "${step.agent}"`);
        }

        // ── Tool allow-list (catches LLM hallucinated tools) ──
        if (step.tool) {
            const allowed = step.agent === 'memory' ? VALID_MEMORY_TOOLS : VALID_BROWSER_TOOLS;
            if (!allowed.has(step.tool)) {
                errors.push(`${prefix}: Hallucinated tool "${step.tool}" (not in allow-list for agent "${step.agent}")`);
            }
        }

        // ── Required param check per tool ──
        if (step.tool && REQUIRED_PARAMS[step.tool]) {
            const params = step.params || {};
            for (const key of REQUIRED_PARAMS[step.tool]) {
                if (params[key] === undefined || params[key] === null || params[key] === '') {
                    errors.push(`${prefix}: Tool "${step.tool}" requires param "${key}" but it is missing/empty`);
                }
            }
        }

        // ── dependsOn integrity: every referenced id must exist in the workflow ──
        if (Array.isArray(step.dependsOn)) {
            for (const depId of step.dependsOn) {
                const depExists = workflow.steps.some(s => s.id === depId);
                if (!depExists) {
                    errors.push(`${prefix}: dependsOn references unknown step id "${depId}"`);
                }
            }
        }

        // ── navigate: url must look like a URL ──
        if (step.tool === 'navigate' && step.params?.url) {
            const u = step.params.url.trim();
            if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('about:')) {
                errors.push(`${prefix}: navigate url must start with http(s):// — got "${u.slice(0, 60)}"`);
            }
        }
    }

    if (errors.length) {
        console.error('[WorkflowSchema] Validation errors:\n  •', errors.join('\n  • '));
    }
    return _result(errors.length === 0, errors);
}

/** Internal: return value that is truthy/falsy AND carries errors array */
function _result(valid, errors) {
    const r = valid;                       // boolean primitive
    // Attach errors so callers can do: const v = validateWorkflow(w); if (!v) console.log(v.errors)
    // But since a false boolean can't carry props, return an object with valueOf for boolean coercion.
    return {
        valueOf() { return valid; },
        [Symbol.toPrimitive]() { return valid; },
        valid,
        errors,
    };
}

/**
 * Returns a text description of the tools for the LLM prompt.
 */
export function getToolDefinitions() {
    return `
- navigate(url): Navigates to a URL. Always use https://.
- click(selector, text): Clicks an element by CSS selector or visible inner text. For complex dropdowns or date pickers, if a click fails to open it, try using the type tool or fillForm directly on the input.
- type(selector, text, pressEnter): Types text into an input field. Set pressEnter:true to submit. Useful for date fields (e.g., "YYYY-MM-DD") when calendar UI is too complex.
- accessVault(key): Retrieves encrypted personal data (e.g. "Full Name", "Home Address", "Password") from the user's secure vault. Use this BEFORE a 'type' action if you need personal info you don't have.
- suspend(reason): Pauses execution and requests human intervention. Use this for CAPTCHAs, 2FA, or when you are stuck and need the user to make a manual decision in the browser.
- scroll(direction, amount): direction is 'up', 'down', 'top', or 'bottom'.
- extract(includeLinks): Scrapes visible text and links from the current page.
- screenshot(): Captures the current page as a base64 string.
- vision(prompt): Analyzes the current page image using LLM vision. Use sparingly — prefer extract.
- syncSession(): Syncs login cookies from User tab to an Agent shadow tab.
- goBack(): Steps the browser history back one page.
- goForward(): Steps the browser history forward one page.
- refresh(): Reloads the current page.
- waitForSelector(selector, text, timeout, state): Wait for a CSS selector or text to appear before proceeding. Use after navigate for dynamic pages.
- fillForm(formSelector, fields, submit, submitSelector): Fill multiple form fields. fields is [{selector, value}]. If a date picker intercepts clicks, use this to force set the value directly.
- newTab(url, type): type is 'user' (visible) or 'shadow' (background research).
- switchTab(tabId): Changes the active user tab.
- closeTab(tabId): Closes a tab.
- getAllTabs(): Returns metadata for all open tabs.
- generateReport(topic, content): Generates a markdown document summarizing research or findings based on the provided content.
- saveSkill(domain, skillName, goal, steps): Persists a successful workflow for future reuse.
- recallSkill(domain, goal): Finds a matching previously saved workflow.
  `.trim();
}
