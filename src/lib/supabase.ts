import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    })
    : null;

export function assertSupabaseConfigured() {
    if (!supabase) {
        throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before enabling auth.');
    }
}

export async function getSupabaseSession() {
    assertSupabaseConfigured();
    const client = supabase;
    if (!client) {
        throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before enabling auth.');
    }

    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    return session;
}
