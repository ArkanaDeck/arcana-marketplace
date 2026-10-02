// Only the native iOS wrapper calls the API cross-origin; the website is same-origin and needs no CORS.
export const NATIVE_APP_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost']);

const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Arkana-Native-App, X-Arkana-Platform';

// Returns true when the request was a CORS preflight and has already been answered.
export function handleNativeAppCors(req, res) {
    const origin = req.headers.origin;
    if (origin && NATIVE_APP_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        res.setHeader('Access-Control-Max-Age', '600');
    }
    res.setHeader('Vary', 'Origin');
    if (req.method !== 'OPTIONS') return false;
    res.status(origin && NATIVE_APP_ORIGINS.has(origin) ? 204 : 403).end();
    return true;
}
