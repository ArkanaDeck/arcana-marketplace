import { Capacitor } from '@capacitor/core';
import { assertSupabaseConfigured, supabase } from './supabase';

type NativeAppleResult = { identityToken?: string; fullName?: string; error?: string; cancelled?: boolean };
type AppleWindow = Window & {
    __arkcardsAppleSignInResult?: (result: NativeAppleResult) => void;
    webkit?: { messageHandlers?: { arkCardsAppleSignIn?: { postMessage: (payload: { nonce: string }) => void } } };
};

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return toHex(new Uint8Array(digest));
}

function requestNativeAppleCredential(hashedNonce: string): Promise<NativeAppleResult> {
    const appleWindow = window as AppleWindow;
    const handler = appleWindow.webkit?.messageHandlers?.arkCardsAppleSignIn;
    if (!handler) return Promise.reject(new Error('Sign in with Apple is not available in this build.'));
    return new Promise((resolve) => {
        appleWindow.__arkcardsAppleSignInResult = (result) => {
            delete appleWindow.__arkcardsAppleSignInResult;
            resolve(result);
        };
        handler.postMessage({ nonce: hashedNonce });
    });
}

// Resolves false when the user dismisses the Apple sheet.
export async function signInWithApple(): Promise<boolean> {
    assertSupabaseConfigured();
    if (!Capacitor.isNativePlatform()) {
        const { error } = await supabase!.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: `${window.location.origin}/login` } });
        if (error) throw new Error(error.message || 'Unable to start Sign in with Apple.');
        return true;
    }

    const rawNonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const result = await requestNativeAppleCredential(await sha256Hex(rawNonce));
    if (result.cancelled) return false;
    if (!result.identityToken) throw new Error(result.error || 'Sign in with Apple failed.');

    const { data, error } = await supabase!.auth.signInWithIdToken({ provider: 'apple', token: result.identityToken, nonce: rawNonce });
    if (error || !data.user) throw new Error(error?.message || 'Sign in with Apple failed.');

    // Apple only shares the user's name on the very first authorization.
    if (result.fullName) {
        await supabase!.auth.updateUser({ data: { full_name: result.fullName } });
        await supabase!.from('profiles').update({ full_name: result.fullName }).eq('id', data.user.id).is('full_name', null);
    }
    return true;
}
