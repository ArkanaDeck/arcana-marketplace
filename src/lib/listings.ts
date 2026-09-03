import { getSupabaseSession, supabase } from './supabase';

export type DeckCondition = 'new' | 'like new' | 'good' | 'fair' | 'poor';

export type MarketplaceListing = {
    id: string;
    sellerId: string;
    name: string;
    price: number;
    description?: string;
    listingType: 'sale' | 'swap' | 'free';
    image?: string;
    freeDelivery: boolean;
    condition: DeckCondition;
};

function mapListing(listing: { id: string; seller_id: string; name: string; price: number | string; description: string | null; listing_type: 'sale' | 'swap' | 'free'; image: string | null; is_free_delivery: boolean; condition: DeckCondition }): MarketplaceListing {
    return { id: listing.id, sellerId: listing.seller_id, name: listing.name, price: Number(listing.price), description: listing.description || undefined, listingType: listing.listing_type, image: listing.image || undefined, freeDelivery: Boolean(listing.is_free_delivery), condition: listing.condition };
}

export async function loadListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.from('listings').select('id, seller_id, name, price, description, listing_type, image, is_free_delivery, condition').order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load listings.');
    return data.map(mapListing);
}

export async function createListing(input: Omit<MarketplaceListing, 'id' | 'sellerId'>) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in before creating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!input.name.trim() || !Number.isFinite(input.price) || input.price < 0) throw new Error('Provide a valid listing name and price.');
    if (!['new', 'like new', 'good', 'fair', 'poor'].includes(input.condition)) throw new Error('Choose a valid deck condition.');

    const { data, error } = await supabase
        .from('listings')
        .insert({ seller_id: session.user.id, name: input.name, price: input.price, description: input.description || null, listing_type: input.listingType, image: input.image || null, is_free_delivery: input.listingType !== 'free' && input.freeDelivery, condition: input.condition })
        .select('id, seller_id, name, price, description, listing_type, image, is_free_delivery, condition')
        .single();
    if (error || !data) throw new Error(error?.message || 'Unable to create listing.');
    return mapListing(data);
}

export async function deleteListing(listingId: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.from('listings').delete().eq('id', listingId);
    if (error) throw new Error(error.message || 'Unable to delete listing.');
}