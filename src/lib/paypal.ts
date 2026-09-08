import { getSupabaseSession } from './supabase';

export async function connectPayPalAccount() {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before setting up payouts.');

    const response = await fetch('/api/connect/paypal-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Unable to start PayPal onboarding.');
    return payload as { url: string };
}
