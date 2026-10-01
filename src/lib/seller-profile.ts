import { supabase, getSupabaseSession } from './supabase';
import { mapListing } from './listings';

type PublicSeller = {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    website_url: string | null;
    direct_payment_link: string | null;
};

export async function loadSellerProfile(sellerId: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const [{ data: profile, error: profileError }, { data: listings, error: listingsError }] = await Promise.all([
        supabase.from('public_profiles').select('id, full_name, avatar_url, bio, website_url, direct_payment_link').eq('id', sellerId).maybeSingle(),
        supabase.from('listings').select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, is_ai_authenticated, external_store_url, external_link_active, external_link_expires_at').eq('seller_id', sellerId).eq('is_active', true).eq('review_status', 'approved').neq('status', 'completed').order('created_at', { ascending: false }),
    ]);
    if (profileError) throw new Error(profileError.message || 'Unable to load seller profile.');
    if (listingsError) throw new Error(listingsError.message || 'Unable to load seller listings.');
    if (!profile) throw new Error('Seller profile not found.');
    return { profile: profile as PublicSeller, listings: (listings || []).map(mapListing) };
}

export async function createChatRoom(listingId: string | null, sellerId: string, initialMessage?: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in to message this seller.');
    if (session.user.id === sellerId) throw new Error('You cannot message yourself.');
    const { data, error } = await supabase.from('chats').upsert({ listing_id: listingId, buyer_id: session.user.id, seller_id: sellerId }, { onConflict: 'listing_id,buyer_id,seller_id' }).select('id').single();
    if (error || !data) throw new Error(error?.message || 'Unable to start chat.');
    if (initialMessage?.trim()) {
        const { error: messageError } = await supabase.from('messages').insert({ chat_id: data.id, sender_id: session.user.id, text: initialMessage.trim() });
        if (messageError) throw new Error(messageError.message || 'Unable to send the opening message.');
    }
    return data.id as string;
}
