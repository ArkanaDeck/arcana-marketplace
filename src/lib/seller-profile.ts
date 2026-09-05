import { supabase, getSupabaseSession } from './supabase';
import type { DeckCondition, MarketplaceListing } from './listings';

type PublicSeller = {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
};

export async function loadSellerProfile(sellerId: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const [{ data: profile, error: profileError }, { data: listings, error: listingsError }] = await Promise.all([
        supabase.from('public_profiles').select('id, full_name, avatar_url, bio').eq('id', sellerId).maybeSingle(),
        supabase.from('listings').select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition').eq('seller_id', sellerId).eq('is_active', true).order('created_at', { ascending: false }),
    ]);
    if (profileError) throw new Error(profileError.message || 'Unable to load seller profile.');
    if (listingsError) throw new Error(listingsError.message || 'Unable to load seller listings.');
    if (!profile) throw new Error('Seller profile not found.');
    return { profile: profile as PublicSeller, listings: (listings || []).map(mapPublicListing) };
}

function mapPublicListing(listing: { id: string; seller_id: string; name: string; price: number | string; description: string | null; listing_type: 'sale' | 'swap' | 'free'; image: string | null; images: string[] | null; is_free_delivery: boolean; condition: DeckCondition }): MarketplaceListing {
    const images = listing.images || (listing.image ? [listing.image] : []);
    return { id: listing.id, sellerId: listing.seller_id, name: listing.name, price: Number(listing.price), description: listing.description || undefined, listingType: listing.listing_type, image: images[0], images, freeDelivery: Boolean(listing.is_free_delivery), condition: listing.condition };
}

export async function createChatRoom(listingId: string | null, sellerId: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in to message this seller.');
    if (session.user.id === sellerId) throw new Error('You cannot message yourself.');
    const { data, error } = await supabase.from('chat_rooms').upsert({ listing_id: listingId, buyer_id: session.user.id, seller_id: sellerId }, { onConflict: 'listing_id,buyer_id,seller_id' }).select('id').single();
    if (error || !data) throw new Error(error?.message || 'Unable to start chat.');
    return data.id as string;
}
