'use client';

/**
 * AuthProvider
 *
 * Wraps the application to:
 *  1. Check Supabase session on first mount
 *  2. Subscribe to auth state changes (login / logout / token refresh)
 *  3. Keep the Zustand authStore in sync
 *
 * This component never touches any existing browser UI or stores.
 */

import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export default function AuthProvider({ children }) {
    const setUser = useAuthStore((s) => s.setUser);
    const setLoading = useAuthStore((s) => s.setLoading);

    useEffect(() => {
        // 1. Get existing session (works even if persisted across restarts)
        const checkSession = async () => {
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                setUser(session?.user ?? null);
            } catch (err) {
                console.error('[AuthProvider] session check failed:', err);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkSession();

        // 2. Listen for auth state changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        // Cleanup on unmount
        return () => {
            subscription?.unsubscribe();
        };
    }, [setUser, setLoading]);

    return <>{children}</>;
}
