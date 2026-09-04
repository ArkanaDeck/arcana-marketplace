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
    images: string[];
    freeDelivery: boolean;
    condition: DeckCondition;
};

function mapListing(listing: { id: string; seller_id: string; name: string; price: number | string; description: string | null; listing_type: 'sale' | 'swap' | 'free'; image: string | null; images: string[] | null; is_free_delivery: boolean; condition: DeckCondition }): MarketplaceListing {
    const images = listing.images || (listing.image ? [listing.image] : []);
    return { id: listing.id, sellerId: listing.seller_id, name: listing.name, price: Number(listing.price), description: listing.description || undefined, listingType: listing.listing_type, image: images[0], images, freeDelivery: Boolean(listing.is_free_delivery), condition: listing.condition };
}

export async function loadListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.from('listings').select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition').order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load listings.');
    return data.map(mapListing);
}

export type CreateListingInput = Omit<MarketplaceListing, 'id' | 'sellerId' | 'image' | 'images'> & { imageFiles?: File[] };

export async function createListing(input: CreateListingInput) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in before creating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!input.name.trim() || !Number.isFinite(input.price) || input.price < 0) throw new Error('Provide a valid listing name and price.');
    if (input.listingType === 'sale' && input.price <= 0) throw new Error('Sale listings must have a price greater than zero.');
    if (input.listingType !== 'sale' && input.price !== 0) throw new Error('Swap and free listings must have a price of 0.00.');
    if (!['new', 'like new', 'good', 'fair', 'poor'].includes(input.condition)) throw new Error('Choose a valid deck condition.');
    if ((input.imageFiles?.length || 0) > 3) throw new Error('You can upload up to three images.');

    const imagePaths: string[] = [];
    const imageUrls: string[] = [];
    try {
        for (const file of input.imageFiles || []) {
            if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
            const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
            const { error: uploadError } = await supabase.storage.from('listing-images').upload(path, file, { contentType: file.type, upsert: false });
            if (uploadError) throw new Error(uploadError.message || 'Unable to upload listing image.');
            imagePaths.push(path);
            const { data: publicUrl } = supabase.storage.from('listing-images').getPublicUrl(path);
            imageUrls.push(publicUrl.publicUrl);
        }

        const { data, error } = await supabase
            .from('listings')
            .insert({ seller_id: session.user.id, name: input.name, price: input.price, description: input.description || null, listing_type: input.listingType, image: imageUrls[0] || null, images: imageUrls, is_free_delivery: input.listingType !== 'free' && input.freeDelivery, condition: input.condition })
            .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition')
            .single();
        if (error || !data) throw new Error(error?.message || 'Unable to create listing.');
        return mapListing(data);
    } catch (error) {
        if (imagePaths.length > 0) await supabase.storage.from('listing-images').remove(imagePaths);
        throw error;
    }
}

export async function deleteListing(listingId: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.from('listings').delete().eq('id', listingId);
    if (error) throw new Error(error.message || 'Unable to delete listing.');
}