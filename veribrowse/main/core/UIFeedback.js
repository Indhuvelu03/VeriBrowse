/**
 * UIFeedback.js
 *
 * Standardized, user-friendly status messages for the agent UI.
 * Translates internal execution states into lightweight human-readable updates.
 *
 * The Fellou.ai design principle: expose what the agent is DOING,
 * never expose raw internal reasoning or LLM prompts.
 *
 * All emissions go through EventBus → renderer bridge → workflowStore.
 */

import bus from './EventBus.js';
import browserManager from './BrowserManager.js';

// ─── Status Templates ───────────────────────────────────────────────────

const STATUS = Object.freeze({
    // Planning phase
    CLASSIFYING: { message: 'Understanding your request…', status: 'planning' },
    PLANNING: { message: 'Planning steps…', status: 'planning' },
    SKILL_HIT: { message: 'Found a known approach — skipping AI planning', status: 'planning' },

    // Execution phase
    NAVIGATING: (url) => ({ message: `Navigating to ${_domain(url)}…`, status: 'executing' }),
    CLICKING: (target) => ({ message: `Clicking ${target || 'element'}…`, status: 'executing' }),
    TYPING: (target) => ({ message: `Typing in ${target || 'field'}…`, status: 'executing' }),
    SCROLLING: (dir) => ({ message: `Scrolling ${dir || 'down'}…`, status: 'executing' }),
    WAITING: { message: 'Waiting for page to load…', status: 'executing' },
    EXTRACTING: { message: 'Reading page content…', status: 'executing' },
    PRESSING_ENTER: { message: 'Submitting…', status: 'executing' },

    // Verification
    VERIFYING: { message: 'Verifying action…', status: 'verifying' },
    DISMISSING_OVERLAY: { message: 'Dismissing popup…', status: 'executing' },

    // Recovery
    RETRYING: (n) => ({ message: `Retrying (attempt ${n})…`, status: 'executing' }),
    REPLANNING: { message: 'Adjusting approach…', status: 'replanning' },

    // Terminal
    DONE: { message: 'Task complete', status: 'idle' },
    FAILED: (reason) => ({ message: `Task failed: ${(reason || 'Unknown').slice(0, 80)}`, status: 'idle' }),
    CANCELLED: { message: 'Task cancelled', status: 'idle' },
    READY: { message: 'Ready', status: 'idle' },

    // Chat mode
    THINKING: { message: 'Thinking…', status: 'thinking' },
    CHATTING: { message: 'Ready', status: 'idle' },
});

// ─── Emitters ───────────────────────────────────────────────────────────

/**
 * Emit a status update to the renderer.
 * @param {string | { message: string, status: string }} statusOrKey
 * @param {Function | string} [arg] - Argument for template functions
 */
export function emit(statusOrKey, arg) {
    let payload;

    if (typeof statusOrKey === 'string') {
        const template = STATUS[statusOrKey];
        if (!template) {
            payload = { message: statusOrKey, status: 'executing' };
        } else if (typeof template === 'function') {
            payload = template(arg);
        } else {
            payload = template;
        }
    } else {
        payload = statusOrKey;
    }

    bus.emit('agent:status', payload);
}

/**
 * Emit a step-level update for the agent panel's step list.
 * @param {{ thought: string, action: string, status: string, stepIndex?: number, totalSteps?: number, result?: any, verification?: any }} step
 */
export function emitStep(step) {
    bus.emit('agent:execution-step', step);
    // Also send directly to renderer for immediate update
    if (browserManager.mainWindow && !browserManager.mainWindow.isDestroyed()) {
        browserManager.mainWindow.webContents.send('agent:execution-step', step);
    }
}

/**
 * Translate an action type into a user-friendly status emission.
 * Called by AutonomousLoop before executing each action.
 *
 * @param {{ type: string, url?: string, selector?: string, text?: string, goalText?: string, reasoning?: string, direction?: string }} action
 */
export function emitForAction(action) {
    switch (action.type) {
        case 'NAVIGATE':
            emit('NAVIGATING', action.url);
            break;
        case 'CLICK':
            emit('CLICKING', action.reasoning || action.goalText || action.selector);
            break;
        case 'TYPE':
            emit('TYPING', action.reasoning || action.goalText || action.selector);
            break;
        case 'SCROLL':
            emit('SCROLLING', action.direction);
            break;
        case 'WAIT':
            emit('WAITING');
            break;
        case 'EXTRACT':
            emit('EXTRACTING');
            break;
        case 'PRESS_ENTER':
            emit('PRESSING_ENTER');
            break;
        case 'DONE':
            emit('DONE');
            break;
        default:
            emit({ message: `Executing ${action.type.toLowerCase()}…`, status: 'executing' });
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function _domain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url?.slice(0, 40) || 'page';
    }
}

export default { emit, emitStep, emitForAction };
