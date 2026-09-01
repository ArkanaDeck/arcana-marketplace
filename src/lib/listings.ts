import { getSupabaseSession, supabase } from './supabase';

export type MarketplaceListing = {
    id: string;
    name: string;
    price: number;
    image?: string;
};

function mapListing(listing: { id: string; name: string; price: number | string; image: string | null }): MarketplaceListing {
    return { id: listing.id, name: listing.name, price: Number(listing.price), image: listing.image || undefined };
}

export async function loadListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.from('listings').select('id, name, price, image').order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load listings.');
    return data.map(mapListing);
}

export async function createListing(input: Omit<MarketplaceListing, 'id'>) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in before creating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase
        .from('listings')
        .insert({ seller_id: session.user.id, name: input.name, price: input.price, image: input.image || null })
        .select('id, name, price, image')
        .single();
    if (error || !data) throw new Error(error?.message || 'Unable to create listing.');
    return mapListing(data);
}

export async function deleteListing(listingId: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.from('listings').delete().eq('id', listingId);
    if (error) throw new Error(error.message || 'Unable to delete listing.');
}