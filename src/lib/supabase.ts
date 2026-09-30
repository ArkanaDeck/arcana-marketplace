import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// Fail early with a visible log so missing env vars show up in Vercel build/runtime logs.
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are not set.');
}

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
        realtime: {
            params: { eventsPerSecond: 10 },
            timeout: 20000,
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
