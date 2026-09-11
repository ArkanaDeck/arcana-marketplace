import { getSupabaseSession, supabase } from './supabase';

// Requirement 2 backend: persists the seller's own external checkout link (Stripe Payment Link,
// PayPal.me, Revolut, etc.) to their profile row.
export async function saveDirectPaymentLink(link: string): Promise<void> {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in before saving your payment link.');
    if (!supabase) throw new Error('Supabase is not configured.');

    const trimmed = link.trim();
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
        throw new Error('Enter a valid link starting with http:// or https://.');
    }

    const { error } = await supabase.from('profiles').update({ direct_payment_link: trimmed || null }).eq('id', session.user.id);
    if (error) throw new Error(error.message || 'Unable to save your payment link.');
}

// Requirement 3 data fetch: batches a lookup of each listed seller's direct payment link.
// Reads from the public_profiles VIEW (not the profiles table directly) because RLS on
// profiles only allows a seller to read their own row — the view is what's safe for buyers to read.
export async function getSellerDirectPaymentLinks(sellerIds: string[]): Promise<Record<string, string | null>> {
    if (!supabase || sellerIds.length === 0) return {};
    const uniqueIds = [...new Set(sellerIds)];
    const { data, error } = await supabase.from('public_profiles').select('id, direct_payment_link').in('id', uniqueIds);
    if (error) throw new Error(error.message || 'Unable to load seller payment links.');

    const linksBySellerId: Record<string, string | null> = {};
    for (const row of data || []) linksBySellerId[row.id] = row.direct_payment_link;
    return linksBySellerId;
}
