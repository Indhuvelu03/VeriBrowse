/**
 * saveSkill.js
 *
 * Persists a successful workflow as a reusable skill in Supabase.
 * Called automatically after a workflow completes successfully.
 *
 * Non-fatal: skill saving failure logs an error but never throws or
 * blocks the workflow from completing.
 *
 * ZERO LLM calls — pure Supabase insert with embedding.
 */

import * as SupabaseService from '../../services/SupabaseService.js';
import * as EmbeddingService from '../../services/EmbeddingService.js';

export default async function saveSkill(context, { domain, skillName, goal, steps }) {
    // Validate required params — non-fatal on missing fields
    if (!domain || !goal || !steps) {
        console.warn('[Tool:SaveSkill] Missing required params (domain, goal, or steps). Skipping.');
        return {
            success: false,
            result: null,
            error: 'saveSkill requires domain, goal, and steps params'
        };
    }

    const name = skillName || `skill-${Date.now()}`;
    console.log(`[Tool:SaveSkill] Saving skill "${name}" for domain: ${domain}`);

    try {
        // Generate embedding for semantic recall later
        const embedding = await EmbeddingService.embed(`${name} ${goal}`);

        // Upsert to Supabase agent_skills table (domain + skill_name is unique constraint)
        await SupabaseService.saveSkill(domain, name, goal, steps, embedding);

        return {
            success: true,
            result: { domain, skillName: name, stepsCount: steps.length },
            error: null
        };
    } catch (err) {
        // Non-fatal: skill saving failure must not fail the workflow
        console.error('[Tool:SaveSkill] Failed to save skill (non-fatal):', err.message);
        return {
            success: false,
            result: null,
            error: err.message
        };
    }
}
