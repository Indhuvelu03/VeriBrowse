/**
 * authStore — Zustand store for Supabase authentication state.
 *
 * Deliberately isolated from the existing browser stores (tabStore, uiStore,
 * workflowStore) so that adding auth doesn't touch any existing state logic.
 */

import { create } from 'zustand';
import { supabase, initSupabase } from '../lib/supabase';

export const useAuthStore = create((set, get) => ({
    /** @type {import('@supabase/supabase-js').User | null} */
    user: null,

    /** True while the initial session check is in progress */
    loading: true,

    /** True if Supabase URL/Key are configured */
    isConfigured: false,

    /** Human-readable auth error (shown on the AuthPage) */
    error: null,

    // ── Setters ────────────────────────────────────────────────────────────
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),

    // ── Auth actions ───────────────────────────────────────────────────────
    /**
     * Initialize the store by loading settings from the main process.
     */
    initialize: async () => {
        if (!window.electronAPI?.settings) return;

        const url = await window.electronAPI.settings.get('supabaseUrl');
        const key = await window.electronAPI.settings.get('supabaseAnonKey');

        if (url && key) {
            initSupabase(url, key);
            set({ isConfigured: true });

            // Check initial session
            const { data: { session } } = await supabase.auth.getSession();
            set({ user: session?.user ?? null, loading: false });
        } else {
            console.warn('[VeriBrowse Auth] Supabase not configured.');
            set({ isConfigured: false, loading: false });
        }
    },

    /**
     * Sign in with email + password.
     */
    signIn: async (email, password) => {
        if (!get().isConfigured) {
            set({ error: 'Supabase is not configured. Please check Settings.' });
            return { success: false };
        }
        set({ error: null, loading: true });
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            set({ error: error.message, loading: false });
            return { success: false };
        }
        set({ user: data.user, loading: false });
        return { success: true };
    },

    /**
     * Sign up with email + password.
     */
    signUp: async (email, password) => {
        if (!get().isConfigured) {
            set({ error: 'Supabase is not configured. Please check Settings.' });
            return { success: false };
        }
        set({ error: null, loading: true });
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) {
            set({ error: error.message, loading: false });
            return { success: false };
        }
        set({
            user: data.user,
            loading: false,
            error: data.user?.identities?.length === 0
                ? 'An account with this email already exists.'
                : null,
        });
        return { success: true, needsConfirmation: !data.session };
    },

    /**
     * Sign out the current user.
     */
    signOut: async () => {
        if (!get().isConfigured) {
            set({ user: null, loading: false, error: null });
            return;
        }
        set({ loading: true });
        await supabase.auth.signOut();
        set({ user: null, loading: false, error: null });
    },

    /**
     * Send password reset email
     */
    resetPassword: async (email) => {
        if (!get().isConfigured) {
            set({ error: 'Supabase is not configured.' });
            return { success: false };
        }
        set({ error: null, loading: true });
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) {
            set({ error: error.message, loading: false });
            return { success: false };
        }
        set({ loading: false });
        return { success: true };
    },

    /**
     * Continue as a guest (no account).
     */
    continueAsGuest: () => {
        set({
            user: { email: 'Guest User', id: 'guest', isGuest: true },
            loading: false,
            error: null
        });
    },
}));
