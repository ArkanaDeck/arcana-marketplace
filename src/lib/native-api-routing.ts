import { Capacitor } from '@capacitor/core';

const NATIVE_API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || 'https://arkcards.com').replace(/\/$/, '');

// The iOS wrapper serves the app from capacitor://localhost, so relative /api calls must target the deployed API.
export function installNativeApiRouting() {
    if (!Capacitor.isNativePlatform()) return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        if (typeof input === 'string' && input.startsWith('/api/')) return nativeFetch(`${NATIVE_API_ORIGIN}${input}`, init);
        if (input instanceof URL && input.origin === window.location.origin && input.pathname.startsWith('/api/')) {
            return nativeFetch(`${NATIVE_API_ORIGIN}${input.pathname}${input.search}`, init);
        }
        return nativeFetch(input, init);
    };
}
