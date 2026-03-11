/**
 * Supabase Client
 *
 * Initializes a single Supabase client using environment variables.
 * Only the anon (public) key is used — never the service role key.
 */

import { createClient } from '@supabase/supabase-js';

const getInitialUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const getInitialKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseUrl = getInitialUrl();
let supabaseAnonKey = getInitialKey();

const createSupabaseClient = (url, key) => {
  return createClient(
    url || 'https://placeholder.supabase.co', // Use placeholder to avoid crash during init
    key || 'placeholder',
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  );
};

export let supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

/**
 * Re-initializes the Supabase client with new credentials.
 * This is useful when settings are loaded from electron-store or changed in UI.
 */
export const initSupabase = (url, key) => {
  if (!url || !key) return null;
  supabaseUrl = url;
  supabaseAnonKey = key;
  supabase = createSupabaseClient(url, key);
  return supabase;
};
