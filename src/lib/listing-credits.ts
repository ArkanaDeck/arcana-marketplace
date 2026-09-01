import { getSupabaseSession } from './supabase';

export async function buyListingCredits() {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before buying listing credits.');

    const response = await fetch('/api/create-listing-credit-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            successUrl: `${window.location.origin}/?listing-credits=success`,
            cancelUrl: `${window.location.origin}/?listing-credits=cancelled`,
        }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to start listing credit checkout.');
    return payload as { url: string; amount: number; credits: number };
}