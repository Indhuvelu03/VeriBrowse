/**
 * authStore — Zustand store for Supabase authentication state.
 *
 * Deliberately isolated from the existing browser stores (tabStore, uiStore,
 * workflowStore) so that adding auth doesn't touch any existing state logic.
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useAuthStore = create((set) => ({
    /** @type {import('@supabase/supabase-js').User | null} */
    user: null,

    /** True while the initial session check is in progress */
    loading: true,

    /** Human-readable auth error (shown on the AuthPage) */
    error: null,

    // ── Setters ────────────────────────────────────────────────────────────
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    // ── Auth actions ───────────────────────────────────────────────────────
    /**
     * Sign in with email + password.
     * Returns { success: boolean }.
     */
    signIn: async (email, password) => {
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
     * Supabase may require email confirmation depending on project settings.
     */
    signUp: async (email, password) => {
        set({ error: null, loading: true });
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) {
            set({ error: error.message, loading: false });
            return { success: false };
        }
        // If email confirmation is required, user will be null until they verify.
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
        set({ loading: true });
        await supabase.auth.signOut();
        set({ user: null, loading: false, error: null });
    },

    /**
     * Send password reset email
     */
    resetPassword: async (email) => {
        set({ error: null, loading: true });
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) {
            set({ error: error.message, loading: false });
            return { success: false };
        }
        set({ loading: false });
        return { success: true };
    },
}));
