import { createClient } from '@supabase/supabase-js';
import Store from 'electron-store';
import { embed } from './EmbeddingService.js';

const store = new Store();
const localStore = new Store({ name: 'local-fallback-db' });

// ─── Memoised Supabase Client ─────────────────────────────────────────────────
// Creating a new client on every call is expensive and causes connection churn.
// We cache the instance and invalidate if credentials change between restarts.
let _cachedClient = null;
let _cachedUrl = null;
let _cachedKey = null;

function getSupabase() {
    const url = store.get('supabaseUrl');
    const key = store.get('supabaseAnonKey');
    if (!url || !key) return null;

    if (_cachedClient && url === _cachedUrl && key === _cachedKey) {
        return _cachedClient;
    }

    _cachedClient = createClient(url, key);
    _cachedUrl = url;
    _cachedKey = key;
    return _cachedClient;
}

// ─── Retry / Backoff Helper ───────────────────────────────────────────────────
/**
 * Wraps a Supabase operation with exponential backoff + jitter (up to 3 attempts).
 *
 * Only retries on transient errors (network timeouts, 5xx-class Supabase codes).
 * Hard failures (bad schema, constraint violations) are re-thrown immediately.
 *
 * @param {() => Promise<any>} fn   - The async operation to attempt.
 * @param {string}             label - Log label for diagnostics.
 * @param {number}             [maxAttempts=3]
 * @returns {Promise<any>}
 */
async function withRetry(fn, label, maxAttempts = 3) {
    const TRANSIENT_CODES = new Set([
        'PGRST301', // connection error
        'PGRST502', // bad gateway
        'EAGAIN',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'UND_ERR_CONNECT_TIMEOUT',
    ]);

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;

            const code = err?.code || err?.message || '';
            const isTransient = (
                TRANSIENT_CODES.has(code) ||
                /network|timeout|EAGAIN|reset|econnreset|ENOTFOUND/i.test(code)
            );

            if (!isTransient || attempt === maxAttempts) {
                throw err;
            }

            // Exponential backoff with ±30% jitter
            const base = Math.min(300 * Math.pow(2, attempt - 1), 3000); // 300ms, 600ms, 1200ms …
            const jitter = base * 0.3 * (Math.random() * 2 - 1);
            const delay = Math.round(base + jitter);
            console.warn(`[SupabaseService] ${label} — attempt ${attempt} failed, retrying in ${delay}ms… (${err.message})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr;
}

// ─── HISTORY ────────────────────────────────────────────────────────────────

export async function addHistory(url, title, faviconUrl) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const history = localStore.get('history', []);
            history.unshift({ url, title, favicon_url: faviconUrl, visited_at: new Date().toISOString() });
            localStore.set('history', history.slice(0, 1000));
            return;
        }

        const embedding = await embed(`${title} ${url}`);
        await withRetry(async () => {
            const { error } = await supabase.from('history').insert({
                url, title, favicon_url: faviconUrl, embedding,
            });
            if (error) throw error;
        }, 'addHistory');

    } catch (err) {
        console.error('[SupabaseService] addHistory failed:', err.message);
    }
}

export async function getHistory(search = '', limit = 50, offset = 0) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            let history = localStore.get('history', []);
            if (search) {
                const s = search.toLowerCase();
                history = history.filter(h => h.title?.toLowerCase().includes(s) || h.url?.toLowerCase().includes(s));
            }
            return history.slice(offset, offset + limit);
        }

        return await withRetry(async () => {
            let query = supabase
                .from('history')
                .select('*')
                .order('visited_at', { ascending: false });

            if (search) query = query.or(`title.ilike.%${search}%,url.ilike.%${search}%`);

            const { data, error } = await query.range(offset, offset + limit - 1);
            if (error) throw error;
            return data;
        }, 'getHistory');

    } catch (err) {
        console.error('[SupabaseService] getHistory failed:', err.message);
        return [];
    }
}

export async function clearHistory() {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            localStore.set('history', []);
            return;
        }
        await withRetry(async () => {
            const { error } = await supabase.from('history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) throw error;
        }, 'clearHistory');
    } catch (err) {
        console.error('[SupabaseService] clearHistory failed:', err.message);
    }
}
// ─── AUTHENTICATION ────────────────────────────────────────────────────────
export async function getAuthState() {
    try {
        const supabase = getSupabase();
        if (!supabase) return null;
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session?.user || null;
    } catch (err) {
        console.error('[SupabaseService] getAuthState failed:', err.message);
        return null;
    }
}

export async function signIn(email, password) {
    try {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.user;
    } catch (err) {
        console.error('[SupabaseService] signIn failed:', err.message);
        throw err;
    }
}

export async function signUp(email, password) {
    try {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data.user;
    } catch (err) {
        console.error('[SupabaseService] signUp failed:', err.message);
        throw err;
    }
}

export async function signOut() {
    try {
        const supabase = getSupabase();
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    } catch (err) {
        console.error('[SupabaseService] signOut failed:', err.message);
        throw err;
    }
}

// ─── CHAT ───────────────────────────────────────────────────────────────────

export async function addChatMessage(sessionId, role, content, workflowId = null) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const chats = localStore.get(`chat_${sessionId}`, []);
            chats.push({ session_id: sessionId, role, content, workflow_id: workflowId, created_at: new Date().toISOString() });
            localStore.set(`chat_${sessionId}`, chats);
            return;
        }

        const embedding = await embed(content);
        await withRetry(async () => {
            const { error } = await supabase.from('chat_history').insert({
                session_id: sessionId, role, content, workflow_id: workflowId, embedding,
            });
            if (error) throw error;
        }, 'addChatMessage');

    } catch (err) {
        console.error('[SupabaseService] addChatMessage failed:', err.message);
    }
}

export async function getChatMessages(sessionId) {
    try {
        const supabase = getSupabase();
        if (!supabase) return localStore.get(`chat_${sessionId}`, []);

        return await withRetry(async () => {
            const { data, error } = await supabase
                .from('chat_history')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data;
        }, 'getChatMessages');

    } catch (err) {
        console.error('[SupabaseService] getChatMessages failed:', err.message);
        return [];
    }
}

// Alias — ServiceHandlers used getChatHistory in older code
export const getChatHistory = getChatMessages;

// ─── DOWNLOADS ─────────────────────────────────────────────────────────────

export async function addDownload(filename, url, path, size, mime) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const downloads = localStore.get('downloads', []);
            downloads.unshift({ filename, url, saved_path: path, file_size: size, mime_type: mime, downloaded_at: new Date().toISOString() });
            localStore.set('downloads', downloads.slice(0, 500));
            return;
        }

        const embedding = await embed(`${filename} ${url}`);
        await withRetry(async () => {
            const { error } = await supabase.from('downloads').insert({
                filename, url, saved_path: path, file_size: size, mime_type: mime, embedding,
            });
            if (error) throw error;
        }, 'addDownload');

    } catch (err) {
        console.error('[SupabaseService] addDownload failed:', err.message);
    }
}

export async function getDownloads(limit = 50, offset = 0) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            return localStore.get('downloads', []).slice(offset, offset + limit);
        }

        return await withRetry(async () => {
            const { data, error } = await supabase
                .from('downloads')
                .select('*')
                .order('downloaded_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return data;
        }, 'getDownloads');

    } catch (err) {
        console.error('[SupabaseService] getDownloads failed:', err.message);
        return [];
    }
}

export async function deleteDownload(id) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const downloads = localStore.get('downloads', []);
            const updated = downloads.filter(d => d.id !== id);
            localStore.set('downloads', updated);
            return true;
        }

        return await withRetry(async () => {
            const { error } = await supabase
                .from('downloads')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        }, 'deleteDownload');

    } catch (err) {
        console.error('[SupabaseService] deleteDownload failed:', err.message);
        return false;
    }
}

// ─── AGENT SKILLS ───────────────────────────────────────────────────────────

export async function saveSkill(domain, skillName, goal, steps) {
    console.warn('[SupabaseService] Skill memory is currently disabled.');
    return;
    /*
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const skills = localStore.get('skills', {});
            if (!skills[domain]) skills[domain] = {};
            skills[domain][skillName] = { goal, steps, updated_at: new Date().toISOString() };
            localStore.set('skills', skills);
            return;
        }

        const embedding = await embed(`${skillName} ${goal}`);
        await withRetry(async () => {
            const { data: existing } = await supabase
                .from('agent_skills')
                .select('id')
                .eq('domain', domain)
                .eq('skill_name', skillName)
                .maybeSingle();

            if (existing?.id) {
                const { error } = await supabase
                    .from('agent_skills')
                    .update({ goal, steps, embedding, updated_at: new Date() })
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('agent_skills')
                    .insert({ domain, skill_name: skillName, goal, steps, embedding });
                if (error) throw error;
            }
        }, 'saveSkill');

    } catch (err) {
        console.error('[SupabaseService] saveSkill failed:', err.message);
    }
    */
}

export async function recallSkill(domain, goal) {
    console.warn('[SupabaseService] Skill memory is currently disabled.');
    return null;
    /*
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const skills = localStore.get('skills', {});
            const domainSkills = skills[domain] || {};
            for (const [, skill] of Object.entries(domainSkills)) {
                if (skill.goal.toLowerCase() === goal.toLowerCase() ||
                    goal.toLowerCase().includes(skill.goal.toLowerCase())) {
                    return skill.steps;
                }
            }
            return null;
        }

        return await withRetry(async () => {
            const queryEmbedding = await embed(goal);
            const { data, error } = await supabase.rpc('semantic_search', {
                query_embedding: queryEmbedding,
                match_threshold: 0.85,
                match_count: 1,
            });
            if (error) throw error;

            const skillMatch = data?.find(item => item.source === 'skill');
            if (skillMatch) {
                const { data: skillData } = await supabase
                    .from('agent_skills')
                    .select('steps')
                    .eq('id', skillMatch.id)
                    .single();
                return skillData?.steps || null;
            }
            return null;
        }, 'recallSkill');

    } catch (err) {
        console.error('[SupabaseService] recallSkill failed:', err.message);
        return null;
    }
    */
}

export async function getAllSkills() {
    console.warn('[SupabaseService] Skill memory is currently disabled.');
    return [];
    /*
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const skillsMap = localStore.get('skills', {});
            const all = [];
            for (const domain in skillsMap) {
                for (const name in skillsMap[domain]) {
                    all.push({ ...skillsMap[domain][name], domain, skill_name: name });
                }
            }
            return all.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        }

        return await withRetry(async () => {
            const { data, error } = await supabase
                .from('agent_skills')
                .select('id, domain, skill_name, goal, steps, created_at, updated_at')
                .order('updated_at', { ascending: false });
            if (error) throw error;
            return data;
        }, 'getAllSkills');

    } catch (err) {
        console.error('[SupabaseService] getAllSkills failed:', err.message);
        return [];
    }
    */
}

export async function deleteSkill(id) {
    console.warn('[SupabaseService] Skill memory is currently disabled.');
    return;
    /*
    try {
        const supabase = getSupabase();
        if (!supabase) {
            // Local fallback for deletion is tricky with IDs, but we can search by name/domain if needed
            // For now, simple return for local
            return;
        }

        await withRetry(async () => {
            const { error } = await supabase
                .from('agent_skills')
                .delete()
                .eq('id', id);
            if (error) throw error;
        }, 'deleteSkill');

    } catch (err) {
        console.error('[SupabaseService] deleteSkill failed:', err.message);
    }
    */
}

// ─── PROMPT CACHE ──────────────────────────────────────────────────────────

export async function getCachedPrompt(hash) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const cache = localStore.get('prompt_cache', {});
            const entry = cache[hash];
            if (entry && new Date(entry.expires_at) > new Date()) return entry.response;
            return null;
        }

        return await withRetry(async () => {
            const { data, error } = await supabase
                .from('prompt_cache')
                .select('response')
                .eq('prompt_hash', hash)
                .gt('expires_at', new Date().toISOString())
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data?.response || null;
        }, 'getCachedPrompt');

    } catch (err) {
        console.error('[SupabaseService] getCachedPrompt failed:', err.message);
        return null;
    }
}

export async function setCachedPrompt(hash, response, model) {
    try {
        const supabase = getSupabase();
        // ── FIX: was missing the null guard — crashed when Supabase not configured ──
        if (!supabase) {
            const cache = localStore.get('prompt_cache', {});
            cache[hash] = {
                response,
                model,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            };
            // Keep cache bounded — evict oldest 20% when over 200 entries
            const keys = Object.keys(cache);
            if (keys.length > 200) {
                keys.slice(0, Math.floor(keys.length * 0.2)).forEach(k => delete cache[k]);
            }
            localStore.set('prompt_cache', cache);
            return;
        }

        await withRetry(async () => {
            const { error } = await supabase.from('prompt_cache').insert({
                prompt_hash: hash,
                response,
                model,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });
            if (error) throw error;
        }, 'setCachedPrompt');

    } catch (err) {
        console.error('[SupabaseService] setCachedPrompt failed:', err.message);
    }
}

// ─── SEMANTIC SEARCH ───────────────────────────────────────────────────────

export async function semanticSearch(query) {
    try {
        const supabase = getSupabase();
        // ── FIX: was missing the null guard — crashed when Supabase not configured ──
        if (!supabase) {
            console.warn('[SupabaseService] semanticSearch skipped — Supabase not configured.');
            return [];
        }

        return await withRetry(async () => {
            const queryEmbedding = await embed(query);
            const { data, error } = await supabase.rpc('semantic_search', {
                query_embedding: queryEmbedding,
                match_threshold: 0.7,
                match_count: 10,
            });
            if (error) throw error;
            return data || [];
        }, 'semanticSearch');

    } catch (err) {
        console.error('[SupabaseService] semanticSearch failed:', err.message);
        return [];
    }
}

// ─── TASK TRACKING / RESUMPTION ───────────────────────────────────────────

export async function saveTaskState(taskId, goal, status) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            const tasks = localStore.get('tasks', {});
            tasks[taskId] = { goal, status, updated_at: new Date().toISOString() };
            localStore.set('tasks', tasks);
            return;
        }

        const embedding = await embed(goal);
        await withRetry(async () => {
            const { data: existing } = await supabase
                .from('tasks')
                .select('id')
                .eq('id', taskId)
                .maybeSingle();

            if (existing?.id) {
                const { error } = await supabase
                    .from('tasks')
                    .update({ status, updated_at: new Date() }) // Usually embedding doesn't change unless goal changes
                    .eq('id', taskId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('tasks')
                    .insert({ id: taskId, goal, status, embedding });
                if (error) throw error;
            }
        }, 'saveTaskState');
    } catch (err) {
        console.error('[SupabaseService] saveTaskState failed:', err.message);
    }
}

export async function searchLeftoverTasks(query) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            console.warn('[SupabaseService] searchLeftoverTasks skipped (no Supabase). Using local fallback.');
            const tasks = localStore.get('tasks', {});
            // Extremely naive local search
            const active = Object.values(tasks).filter(t => t.status === 'left_over' || t.status === 'paused');
            return active.filter(t => t.goal.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
        }

        return await withRetry(async () => {
            const queryEmbedding = await embed(query);
            if (!queryEmbedding) return []; // Fallback if embedding model unavailable

            const { data, error } = await supabase.rpc('match_tasks', {
                query_embedding: queryEmbedding,
                match_threshold: 0.7,
                match_count: 5,
            });
            if (error) throw error;
            // Filter to return only non-completed tasks
            return (data || []).filter(task => task.status === 'left_over' || task.status === 'paused' || task.status === 'running');
        }, 'searchLeftoverTasks');
    } catch (err) {
        console.error('[SupabaseService] searchLeftoverTasks failed:', err.message);
        return [];
    }
}
