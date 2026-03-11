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
    const initialize = useAuthStore((s) => s.initialize);
    const isConfigured = useAuthStore((s) => s.isConfigured);
    const setUser = useAuthStore((s) => s.setUser);

    useEffect(() => {
        // 1. Initialize from electron-store (loads session internally)
        initialize();

        // 2. Listen for auth state changes if configured
        let subscription;
        if (isConfigured) {
            const res = supabase.auth.onAuthStateChange((_event, session) => {
                setUser(session?.user ?? null);
            });
            subscription = res.data.subscription;
        }

        // Cleanup on unmount
        return () => {
            subscription?.unsubscribe();
        };
    }, [initialize, isConfigured, setUser]);

    return <>{children}</>;
}
