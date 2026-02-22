/**
 * recallSkill.js
 *
 * Semantic vector search for matching workflow skills in Supabase.
 * If a high-similarity skill is found for a domain+goal, the WorkflowEngine
 * can use those precomputed steps and skip the PlannerAgent LLM call entirely.
 *
 * Non-fatal: on any error, returns { success: false, result: null } so the
 * WorkflowEngine falls through to PlannerAgent.
 *
 * ZERO LLM calls — pure embedding + Supabase vector search.
 */

import * as SupabaseService from '../../services/SupabaseService.js';
import * as EmbeddingService from '../../services/EmbeddingService.js';

export default async function recallSkill(page, { domain, goal }) {
    if (!goal) {
        console.warn('[Tool:RecallSkill] No goal provided. Skipping recall.');
        return { success: false, result: null, error: 'recallSkill requires a goal param' };
    }

    console.log(`[Tool:RecallSkill] Searching skills for: "${goal}" ${domain ? '(domain: ' + domain + ')' : ''}`);

    try {
        // Always call embed explicitly so the search is semantic
        const embedding = await EmbeddingService.embed(goal);

        // SupabaseService.recallSkill does an RPC vector search with threshold 0.85
        const result = await SupabaseService.recallSkill(domain, goal, embedding);

        if (result && result.steps && result.steps.length > 0) {
            console.log(`[Tool:RecallSkill] Skill found: "${result.skill_name}" (similarity: ${result.similarity ?? '?'}, steps: ${result.steps.length})`);
            return {
                success: true,
                result: {
                    skillName: result.skill_name,
                    steps: result.steps,
                    similarity: result.similarity,
                    usedCount: result.used_count ?? 0,
                },
                error: null
            };
        }

        // null result means no match — this is a normal outcome, not an error
        console.log('[Tool:RecallSkill] No matching skill found. Proceeding to PlannerAgent.');
        return { success: true, result: null, error: null };

    } catch (err) {
        // Non-fatal — fall through to PlannerAgent
        console.error('[Tool:RecallSkill] Failed (non-fatal, falling through):', err.message);
        return { success: false, result: null, error: err.message };
    }
}
