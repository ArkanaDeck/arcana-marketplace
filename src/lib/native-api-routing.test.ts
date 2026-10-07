import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isNativePlatform: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNativePlatform } }));

describe('native API routing', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        vi.resetAllMocks();
        vi.stubEnv('VITE_API_ORIGIN', '');
        mocks.isNativePlatform.mockReturnValue(true);
        vi.stubGlobal('window', {
            fetch: fetchMock,
            location: { origin: 'capacitor://localhost', protocol: 'capacitor:', host: 'localhost' },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('routes publication to the production backend by default and preserves the request', async () => {
        const { installNativeApiRouting } = await import('./native-api-routing');
        const options: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' },
            body: JSON.stringify({ decks: [] }),
        };
        installNativeApiRouting();
        await window.fetch('/api/tarot?action=submit-listing-batch', options);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://arkcards.com/api/tarot?action=submit-listing-batch', options,
        );
    });

    it('uses the configured backend origin without doubling its trailing slash', async () => {
        vi.stubEnv('VITE_API_ORIGIN', 'https://backend.example.com/');
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        await window.fetch('/api/tarot?action=submit-listing-batch');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://backend.example.com/api/tarot?action=submit-listing-batch', undefined,
        );
    });

    it('routes same-origin API URL objects and retains the query string', async () => {
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        await window.fetch(new URL('capacitor://localhost/api/tarot?action=submit-listing-batch'));
        expect(fetchMock).toHaveBeenCalledWith(
            'https://arkcards.com/api/tarot?action=submit-listing-batch', undefined,
        );
    });

    it('leaves external requests unchanged', async () => {
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        const url = new URL('https://example.supabase.co/storage/v1/object/public/image.jpg');
        await window.fetch(url);
        expect(fetchMock).toHaveBeenCalledWith(url, undefined);
    });

    it('leaves non-API paths unchanged', async () => {
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        await window.fetch('/assets/image.jpg');
        expect(fetchMock).toHaveBeenCalledWith('/assets/image.jpg', undefined);
    });

    it('does not redirect API URLs on another native host', async () => {
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        const url = new URL('capacitor://other-host/api/tarot?action=submit-listing-batch');
        await window.fetch(url);
        expect(fetchMock).toHaveBeenCalledWith(url, undefined);
    });

    it('does not redirect API URLs with a different protocol', async () => {
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        const url = new URL('https://localhost/api/tarot?action=submit-listing-batch');
        await window.fetch(url);
        expect(fetchMock).toHaveBeenCalledWith(url, undefined);
    });

    it('keeps browser requests same-origin even when a native backend origin is configured', async () => {
        mocks.isNativePlatform.mockReturnValue(false);
        vi.stubEnv('VITE_API_ORIGIN', 'https://backend.example.com');
        const { installNativeApiRouting } = await import('./native-api-routing');
        installNativeApiRouting();
        expect(window.fetch).toBe(fetchMock);
        await window.fetch('/api/tarot?action=submit-listing-batch');
        expect(fetchMock).toHaveBeenCalledWith('/api/tarot?action=submit-listing-batch');
    });
});
