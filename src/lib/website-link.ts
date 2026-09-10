import { getSupabaseSession, supabase } from './supabase';

export type WebsiteLinkStatus = { websiteUrl: string | null; isActive: boolean; expiresAt: string | null };

export async function getWebsiteLinkStatus(): Promise<WebsiteLinkStatus> {
    const session = await getSupabaseSession();
    if (!session?.user || !supabase) return { websiteUrl: null, isActive: false, expiresAt: null };
    const { data } = await supabase.from('profiles').select('website_url, website_link_active, website_link_expires_at').eq('id', session.user.id).maybeSingle();
    const isActive = Boolean(data?.website_link_active) && Boolean(data?.website_link_expires_at) && new Date(data!.website_link_expires_at as string) > new Date();
    return { websiteUrl: data?.website_url || null, isActive, expiresAt: data?.website_link_expires_at || null };
}

export async function startWebsiteLinkCheckout(websiteUrl: string) {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before linking your website.');

    const response = await fetch('/api/rent-website-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            websiteUrl,
            successUrl: `${window.location.origin}/?website-link=success`,
            cancelUrl: `${window.location.origin}/?website-link=cancelled`,
        }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to start website link checkout.');
    return payload as { url: string };
}
