const PAYPAL_API_URL = process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

export async function getPayPalAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET_KEY;
    if (!clientId || !secret) throw new Error('PayPal is not configured yet.');

    const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
    const data = await response.json();
    return data.access_token;
}

export async function paypalRequest(path, options = {}) {
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${PAYPAL_API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `PayPal request failed (${response.status}).`);
    return data;
}

export function toPayPalAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be positive.');
    return amount.toFixed(2);
}