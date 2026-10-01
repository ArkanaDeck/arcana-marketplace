import { assertSupabaseConfigured, getSupabaseSession, supabase } from './supabase';

export async function signInWithEmail(email: string, password: string) {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
        throw new Error('Email and password are required.');
    }

    assertSupabaseConfigured();
    const { data, error } = await supabase!.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword });

    if (error) {
        throw new Error(error.message || 'Unable to sign in.');
    }

    return data;
}

export async function signUpWithEmail(email: string, password: string) {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
        throw new Error('Email and password are required.');
    }

    assertSupabaseConfigured();
    const { data, error } = await supabase!.auth.signUp({
        email: normalizedEmail,
        password: normalizedPassword,
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

export async function resendSignupConfirmation(email: string) {
    if (!email) {
        throw new Error('Email is required to resend the confirmation.');
    }

    assertSupabaseConfigured();
    const { error } = await supabase!.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/?auth=confirmed` },
    });
    if (error) {
        throw new Error(error.message || 'Unable to resend the confirmation email.');
    }
}

export async function sendPasswordReset(email: string) {
    if (!email) {
        throw new Error('Enter your email address to reset your password.');
    }

    assertSupabaseConfigured();
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
        throw new Error(error.message || 'Unable to send the password reset email.');
    }
}

export async function updatePassword(newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
        throw new Error('Enter a new password with at least 6 characters.');
    }

    assertSupabaseConfigured();
    const { error } = await supabase!.auth.updateUser({ password: newPassword });
    if (error) {
        throw new Error(error.message || 'Unable to update your password.');
    }
}

export async function signOut() {
    assertSupabaseConfigured();
    const { error } = await supabase!.auth.signOut();
    if (error) {
        throw new Error(error.message || 'Unable to sign out.');
    }
}

// Apple requires in-app account deletion. The RPC deletes only the caller's account data.
export async function deleteOwnAccount() {
    assertSupabaseConfigured();
    const session = await getSupabaseSession();
    if (!session?.user || !supabase) throw new Error('Sign in before deleting your account.');

    for (const bucketName of ['avatars', 'listing-images']) {
        const bucket = supabase.storage.from(bucketName);
        const paths: string[] = [];
        let offset = 0;
        while (true) {
            const { data, error } = await bucket.list(session.user.id, { limit: 1000, offset });
            if (error) throw new Error(error.message || 'Unable to remove uploaded account images.');
            const files = data || [];
            paths.push(...files.filter((file) => file.id).map((file) => `${session.user.id}/${file.name}`));
            if (files.length < 1000) break;
            offset += files.length;
        }
        for (let index = 0; index < paths.length; index += 100) {
            const { error } = await bucket.remove(paths.slice(index, index + 100));
            if (error) throw new Error(error.message || 'Unable to remove uploaded account images.');
        }
    }

    const { error } = await supabase!.rpc('delete_own_account');
    if (error) {
        throw new Error(error.message || 'Unable to delete your account.');
    }
    localStorage.removeItem('arkana_listings');
    await supabase!.auth.signOut({ scope: 'local' });
    (window as Window & {
        webkit?: { messageHandlers?: { cacheSessionToken?: { postMessage: (payload: { action: string }) => void } } };
    }).webkit?.messageHandlers?.cacheSessionToken?.postMessage({ action: 'clearSessionToken' });
}
