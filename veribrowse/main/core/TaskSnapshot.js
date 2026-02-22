/**
 * TaskSnapshot
 * 
 * Manages in-memory state snapshots for workflows.
 * Used to save/restore the execution context before each step,
 * enabling the Engine to resume from the exact same state after a failure or pause.
 */

const snapshots = new Map();

/**
 * Saves a snapshot of the current workflow state.
 * @param {string} workflowId 
 * @param {string} stepId 
 * @param {object} context - Tab URLs, active status, etc.
 */
export function save(workflowId, stepId, agentContext) {
    snapshots.set(workflowId, {
        workflowId,
        stepId,
        agentContext: JSON.parse(JSON.stringify(agentContext)), // deep clone
        savedAt: Date.now()
    });
    console.log(`[TaskSnapshot] Saved snapshot for workflow ${workflowId} at step ${stepId}`);
}

/**
 * Restores the latest snapshot for a workflow.
 */
export function restore(workflowId) {
    const snapshot = snapshots.get(workflowId);
    if (snapshot) {
        console.log(`[TaskSnapshot] Restoring state for workflow ${workflowId}`);
        return snapshot;
    }
    return null;
}

/**
 * Clears the snapshot after workflow completion or abandonment.
 */
export function clear(workflowId) {
    snapshots.delete(workflowId);
    console.log(`[TaskSnapshot] Cleared state for workflow ${workflowId}`);
}
