import { createClient } from '@supabase/supabase-js';
import Store from 'electron-store';
import { embed } from './EmbeddingService.js';

const store = new Store();

function getSupabase() {
    const url = store.get('supabaseUrl');
    const key = store.get('supabaseAnonKey');
    if (!url || !key) {
        throw new Error('[SupabaseService] Supabase credentials not found in store.');
    }
    return createClient(url, key);
}

// ─── HISTORY ────────────────────────────────────────────────────────────────

export async function addHistory(url, title, faviconUrl) {
    try {
        const supabase = getSupabase();
        const embedding = await embed(`${title} ${url}`);
        const { error } = await supabase.from('history').insert({
            url,
            title,
            favicon_url: faviconUrl,
            embedding,
        });
        if (error) throw error;
    } catch (err) {
        console.error('[SupabaseService] addHistory failed:', err.message);
    }
}

export async function getHistory(search = '', limit = 50, offset = 0) {
    try {
        const supabase = getSupabase();
        let query = supabase
            .from('history')
            .select('*')
            .order('visited_at', { ascending: false });

        if (search) {
            query = query.or(`title.ilike.%${search}%,url.ilike.%${search}%`);
        }

        const { data, error } = await query.range(offset, offset + limit - 1);
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('[SupabaseService] getHistory failed:', err.message);
        return [];
    }
}

export async function clearHistory() {
    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('history').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        if (error) throw error;
    } catch (err) {
        console.error('[SupabaseService] clearHistory failed:', err.message);
    }
}

// ─── CHAT ───────────────────────────────────────────────────────────────────

export async function addChatMessage(sessionId, role, content, workflowId = null) {
    try {
        const supabase = getSupabase();
        const embedding = await embed(content);
        const { error } = await supabase.from('chat_history').insert({
            session_id: sessionId,
            role,
            content,
            workflow_id: workflowId,
            embedding,
        });
        if (error) throw error;
    } catch (err) {
        console.error('[SupabaseService] addChatMessage failed:', err.message);
    }
}

export async function getChatMessages(sessionId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

// ─── DOWNLOADS ─────────────────────────────────────────────────────────────

export async function addDownload(filename, url, path, size, mime) {
    try {
        const supabase = getSupabase();
        const embedding = await embed(`${filename} ${url}`);
        const { error } = await supabase.from('downloads').insert({
            filename,
            url,
            saved_path: path,
            file_size: size,
            mime_type: mime,
            embedding,
        });
        if (error) throw error;
    } catch (err) {
        console.error('[SupabaseService] addDownload failed:', err.message);
    }
}

export async function getDownloads(limit = 50, offset = 0) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .order('downloaded_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;
    return data;
}

// ─── AGENT SKILLS ───────────────────────────────────────────────────────────

export async function saveSkill(domain, skillName, goal, steps) {
    try {
        const supabase = getSupabase();
        const embedding = await embed(`${skillName} ${goal}`);

        // Use manual check-then-insert/update instead of upsert+onConflict
        // because the UNIQUE(domain, skill_name) constraint may not exist in the
        // live DB yet (needs schema migration). This approach works either way.
        const { data: existing } = await supabase
            .from('agent_skills')
            .select('id')
            .eq('domain', domain)
            .eq('skill_name', skillName)
            .maybeSingle();

        if (existing?.id) {
            // UPDATE existing skill
            const { error } = await supabase
                .from('agent_skills')
                .update({ goal, steps, embedding, updated_at: new Date() })
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            // INSERT new skill
            const { error } = await supabase
                .from('agent_skills')
                .insert({ domain, skill_name: skillName, goal, steps, embedding });
            if (error) throw error;
        }
    } catch (err) {
        console.error('[SupabaseService] saveSkill failed:', err.message);
    }
}


export async function recallSkill(domain, goal) {
    try {
        const supabase = getSupabase();
        const queryEmbedding = await embed(goal);
        const { data, error } = await supabase.rpc('semantic_search', {
            query_embedding: queryEmbedding,
            match_threshold: 0.85,
            match_count: 1
        });
        if (error) throw error;

        // Filter for skills only
        const skillMatch = data.find(item => item.source === 'skill');
        if (skillMatch) {
            const { data: skillData } = await supabase
                .from('agent_skills')
                .select('steps')
                .eq('id', skillMatch.id)
                .single();
            return skillData?.steps || null;
        }
        return null;
    } catch (err) {
        console.error('[SupabaseService] recallSkill failed:', err.message);
        return null;
    }
}

// ─── PROMPT CACHE ──────────────────────────────────────────────────────────

export async function getCachedPrompt(hash) {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('prompt_cache')
            .select('response')
            .eq('prompt_hash', hash)
            .gt('expires_at', new Date().toISOString())
            .single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is single result empty
        return data?.response || null;
    } catch (err) {
        console.error('[SupabaseService] getCachedPrompt failed:', err.message);
        return null;
    }
}

export async function setCachedPrompt(hash, response, model) {
    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('prompt_cache').insert({
            prompt_hash: hash,
            response,
            model,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        if (error) throw error;
    } catch (err) {
        console.error('[SupabaseService] setCachedPrompt failed:', err.message);
    }
}

// ─── SEMANTIC SEARCH ───────────────────────────────────────────────────────

export async function semanticSearch(query) {
    try {
        const supabase = getSupabase();
        const queryEmbedding = await embed(query);
        const { data, error } = await supabase.rpc('semantic_search', {
            query_embedding: queryEmbedding,
            match_threshold: 0.7,
            match_count: 10
        });
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('[SupabaseService] semanticSearch failed:', err.message);
        return [];
    }
}
