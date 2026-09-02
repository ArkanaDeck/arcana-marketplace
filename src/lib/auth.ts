import { assertSupabaseConfigured, supabase } from './supabase';

export async function signInWithEmail(email: string, password: string) {
    if (!email || !password) {
        throw new Error('Email and password are required.');
    }

    assertSupabaseConfigured();
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });

    if (error) {
        throw new Error(error.message || 'Unable to sign in.');
    }

    return data;
}

export async function signUpWithEmail(email: string, password: string, acceptedTerms = false) {
    if (!email || !password) {
        throw new Error('Email and password are required.');
    }
    if (!acceptedTerms) {
        throw new Error('Accept the Terms & Conditions before creating an account.');
    }

    assertSupabaseConfigured();
    const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: {
            data: { terms_accepted_at: new Date().toISOString() },
            emailRedirectTo: `${window.location.origin}/?auth=confirmed`,
        },
    });

    if (error) {
        throw new Error(error.message || 'Unable to create account.');
    }

    return data;
}

export async function signOut() {
    assertSupabaseConfigured();
    const { error } = await supabase!.auth.signOut();
    if (error) {
        throw new Error(error.message || 'Unable to sign out.');
    }
}
