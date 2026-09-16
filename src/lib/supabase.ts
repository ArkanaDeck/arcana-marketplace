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

export async function uploadDeckImage(file: File): Promise<string | null> {
    try {
        if (!supabase) throw new Error('Supabase is not configured.');
        if (!(file instanceof File) || !file.type.startsWith('image/')) {
            throw new Error('Choose a valid image file.');
        }

        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const filePath = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage
            .from('deck-images')
            .upload(filePath, file, { contentType: file.type, upsert: false });

        if (error) throw error;

        const { data } = supabase.storage.from('deck-images').getPublicUrl(filePath);
        return data.publicUrl || null;
    } catch (error) {
        console.error('Unable to upload deck image.', error);
        return null;
    }
}
