import { createClient } from '@supabase/supabase-js';
import Store from 'electron-store';

const store = new Store();

// ─── Supabase Configuration ──────────────────────────────────────────────────
let _supabaseClient = null;

function getSupabase() {
    const url = store.get('supabaseUrl');
    const key = store.get('supabaseAnonKey');
    if (!url || !key) return null;

    if (_supabaseClient) {
        return _supabaseClient;
    }

    _supabaseClient = createClient(url, key);
    return _supabaseClient;
}

// ─── FIREBASE AUTHENTICATION PROXY ──────────────────────────────────────────
// NOTE: Firebase operations are handled in the renderer (Next.js).
// The main process only manages Supabase sync and data persistence.
// Auth state is passed via IPC from renderer to main.

/**
 * Get user profile from Supabase
 */
export async function getUserProfile(uid) {
    try {
        const supabase = getSupabase();
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('uid', uid)
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('[AuthService] Get user profile failed:', err.message);
        return null;
    }
}

/**
 * Create or update user profile in Supabase
 */
export async function syncUserToSupabase(uid, userData) {
    try {
        const supabase = getSupabase();
        if (!supabase) {
            console.warn('[AuthService] Supabase not configured, skipping sync');
            return null;
        }

        const { data, error } = await supabase.from('users').upsert({
            uid,
            ...userData,
            updated_at: new Date().toISOString(),
        }).select().single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('[AuthService] Supabase sync failed:', err.message);
        return null;
    }
}

/**
 * Update last login timestamp
 */
export async function updateUserLastLogin(uid) {
    try {
        const supabase = getSupabase();
        if (!supabase) return;

        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('uid', uid);
    } catch (err) {
        console.warn('[AuthService] Update last login failed:', err.message);
    }
}

/**
 * Update user profile in Supabase
 */
export async function updateUserProfile(uid, updates) {
    try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase not configured');

        const { data, error } = await supabase
            .from('users')
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('uid', uid)
            .select()
            .single();

        if (error) throw error;
        return { success: true, profile: data };
    } catch (err) {
        console.error('[AuthService] Update user profile failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Delete user account and associated data
 */
export async function deleteUserAccount(uid) {
    try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase not configured');

        // Delete all user data
        await supabase.from('users').delete().eq('uid', uid);

        return { success: true };
    } catch (err) {
        console.error('[AuthService] Delete user failed:', err.message);
        return { success: false, error: err.message };
    }
}
