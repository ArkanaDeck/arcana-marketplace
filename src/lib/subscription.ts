import { getSupabaseSession, supabase } from './supabase';

export type SubscriptionStatus = 'active' | 'inactive' | 'past_due';

// Pre-listing billing gate: sellers need an active subscription before publishing.
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
    const session = await getSupabaseSession();
    if (!session?.user || !supabase) return 'inactive';
    const { data } = await supabase.from('profiles').select('subscription_status').eq('id', session.user.id).maybeSingle();
    return (data?.subscription_status as SubscriptionStatus) || 'inactive';
}

export async function startSubscriptionCheckout() {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before subscribing to a seller plan.');

    const response = await fetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            successUrl: `${window.location.origin}/?subscription=success`,
            cancelUrl: `${window.location.origin}/?subscription=cancelled`,
        }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to start seller subscription checkout.');
    return payload as { url: string };
}
