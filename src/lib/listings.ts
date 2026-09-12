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
    reviewStatus: 'approved' | 'pending_review' | 'rejected';
};

function mapListing(listing: { id: string; seller_id: string; name: string; price: number | string; description: string | null; listing_type: 'sale' | 'swap' | 'free'; image: string | null; images: string[] | null; is_free_delivery: boolean; condition: DeckCondition; review_status?: 'approved' | 'pending_review' | 'rejected' }): MarketplaceListing {
    const images = listing.images || (listing.image ? [listing.image] : []);
    return { id: listing.id, sellerId: listing.seller_id, name: listing.name, price: Number(listing.price), description: listing.description || undefined, listingType: listing.listing_type, image: images[0], images, freeDelivery: Boolean(listing.is_free_delivery), condition: listing.condition, reviewStatus: listing.review_status || 'approved' };
}

export async function loadListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.from('listings').select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status').order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load listings.');
    return data.map(mapListing);
}

// Public marketplace feed: only shows paid/authenticated listings (is_active + review_status='approved'),
// with sale listings prioritized to the top, newest-first within each priority group.
export async function loadPublishedListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase
        .from('listings')
        .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status')
        .eq('is_active', true)
        .eq('review_status', 'approved')
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load published listings.');

    // Array is already newest-first from the query above; a stable sort here keeps that order within each group.
    const listingPriority = (listing: { listing_type: string }) => (listing.listing_type === 'sale' ? 0 : 1);
    const prioritized = [...data].sort((a, b) => listingPriority(a) - listingPriority(b));
    return prioritized.map(mapListing);
}

export type CreateListingInput = Omit<MarketplaceListing, 'id' | 'sellerId' | 'image' | 'images' | 'reviewStatus'> & { imageFiles?: File[]; reviewStatus?: MarketplaceListing['reviewStatus']; externalStoreUrl?: string };
export type UpdateListingInput = CreateListingInput & { existingImages: string[] };

// Downscales and re-encodes an image client-side via canvas so uploads stay under the size cap.
async function compressImageFile(file: File, maxDimension = 1280, maxSizeBytes = 1024 * 1024): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process image for upload.');
    context.drawImage(bitmap, 0, 0, width, height);

    const qualitySteps = [0.9, 0.75, 0.6, 0.45, 0.3, 0.15];
    let compressed: Blob | null = null;
    for (const quality of qualitySteps) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        compressed = blob;
        if (blob && blob.size <= maxSizeBytes) break;
    }

    if (!compressed) throw new Error('Unable to compress image for upload.');
    return compressed;
}

async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to encode listing image.'));
        reader.onerror = () => reject(reader.error || new Error('Unable to read listing image.'));
        reader.readAsDataURL(file);
    });
}

export async function createListing(input: CreateListingInput) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in before creating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!input.name.trim() || !Number.isFinite(input.price) || input.price < 0) throw new Error('Provide a valid listing name and price.');
    if (input.name.trim().length > 120) throw new Error('Listing names must be 120 characters or fewer.');
    if ((input.description || '').length > 2000) throw new Error('Descriptions must be 2,000 characters or fewer.');
    if (input.listingType === 'sale' && input.price <= 0) throw new Error('Sale listings must have a price greater than zero.');
    if (input.listingType !== 'sale' && input.price !== 0) throw new Error('Swap and free listings must have a price of 0.00.');
    if (!['new', 'like new', 'good', 'fair', 'poor'].includes(input.condition)) throw new Error('Choose a valid deck condition.');
    if ((input.imageFiles?.length || 0) > 3) throw new Error('You can upload up to three images.');

    const imagePaths: string[] = [];
    const imageUrls: string[] = [];
    try {
        for (const file of (input.imageFiles || []).slice(0, 3)) {
            if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
            const compressed = await compressImageFile(file);
            const path = `${session.user.id}/${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('listing-images').upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
            if (uploadError) throw new Error(uploadError.message || 'Unable to upload listing image.');
            imagePaths.push(path);
            const { data: publicUrl } = supabase.storage.from('listing-images').getPublicUrl(path);
            imageUrls.push(publicUrl.publicUrl);
        }

        const { data, error } = await supabase
            .from('listings')
            .insert({ seller_id: session.user.id, name: input.name, price: input.price, description: input.description || null, listing_type: input.listingType, image: imageUrls[0] || null, images: imageUrls, is_free_delivery: input.listingType !== 'free' && input.freeDelivery, condition: input.condition, review_status: input.reviewStatus || 'approved', external_store_url: input.externalStoreUrl || null })
            .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status')
            .single();
        if (error || !data) throw new Error(error?.message || 'Unable to create listing.');
        return mapListing(data);
    } catch (error) {
        if (imagePaths.length > 0) await supabase.storage.from('listing-images').remove(imagePaths);
        throw error;
    }
}

export async function updateListing(listingId: string, input: UpdateListingInput) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in before updating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!listingId || !input.name.trim() || !Number.isFinite(input.price) || input.price < 0) throw new Error('Provide a valid listing name and price.');
    if (input.name.trim().length > 120) throw new Error('Listing names must be 120 characters or fewer.');
    if ((input.description || '').length > 2000) throw new Error('Descriptions must be 2,000 characters or fewer.');
    if (input.listingType === 'sale' && input.price <= 0) throw new Error('Sale listings must have a price greater than zero.');
    if (input.listingType !== 'sale' && input.price !== 0) throw new Error('Swap and free listings must have a price of 0.00.');
    if (!['new', 'like new', 'good', 'fair', 'poor'].includes(input.condition)) throw new Error('Choose a valid deck condition.');
    if (input.existingImages.length + (input.imageFiles?.length || 0) > 3) throw new Error('You can upload up to three images.');

    const imagePaths: string[] = [];
    const newImageUrls: string[] = [];
    try {
        for (const file of input.imageFiles || []) {
            if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
            const compressed = await compressImageFile(file);
            const path = `${session.user.id}/${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('listing-images').upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
            if (uploadError) throw new Error(uploadError.message || 'Unable to upload listing image.');
            imagePaths.push(path);
            const { data: publicUrl } = supabase.storage.from('listing-images').getPublicUrl(path);
            newImageUrls.push(publicUrl.publicUrl);
        }

        const images = [...input.existingImages, ...newImageUrls];
        const { data, error } = await supabase
            .from('listings')
            .update({ name: input.name, price: input.price, description: input.description || null, listing_type: input.listingType, image: images[0] || null, images, is_free_delivery: input.listingType !== 'free' && input.freeDelivery, condition: input.condition, review_status: input.reviewStatus || 'approved' })
            .eq('id', listingId)
            .eq('seller_id', session.user.id)
            .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status')
            .single();
        if (error || !data) throw new Error(error?.message || 'Unable to update listing.');
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

export type PublishListingBundleResult =
    | { requiresPayment: true; checkoutUrl: string }
    | { requiresPayment: false; listing: MarketplaceListing };

// Unified batch pipeline (new submissions only): uploads images, submits a batch of exactly one
// deck to the same pipeline the multi-deck tarot authentication flow uses, then either returns
// the already-approved listing (fee = 0) or a Stripe Checkout URL for the stacked fee.
export async function publishListingBundle(input: CreateListingInput): Promise<PublishListingBundleResult> {
    const session = await getSupabaseSession();
    if (!session?.user || !session.access_token) throw new Error('Sign in before creating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!input.name.trim() || !Number.isFinite(input.price) || input.price < 0) throw new Error('Provide a valid listing name and price.');
    if (input.name.trim().length > 120) throw new Error('Listing names must be 120 characters or fewer.');
    if ((input.description || '').length > 2000) throw new Error('Descriptions must be 2,000 characters or fewer.');
    if (input.listingType === 'sale' && input.price <= 0) throw new Error('Sale listings must have a price greater than zero.');
    if (input.listingType !== 'sale' && input.price !== 0) throw new Error('Swap and free listings must have a price of 0.00.');
    if (!['new', 'like new', 'good', 'fair', 'poor'].includes(input.condition)) throw new Error('Choose a valid deck condition.');
    if ((input.imageFiles?.length || 0) > 3) throw new Error('You can upload up to three images.');

    const imagePaths: string[] = [];
    const imageUrls: string[] = [];
    const imageBase64: string[] = [];
    try {
        for (const file of (input.imageFiles || []).slice(0, 3)) {
            if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
            imageBase64.push(await fileToDataUrl(file));
            const compressed = await compressImageFile(file);
            const path = `${session.user.id}/${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('listing-images').upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
            if (uploadError) throw new Error(uploadError.message || 'Unable to upload listing image.');
            imagePaths.push(path);
            const { data: publicUrl } = supabase.storage.from('listing-images').getPublicUrl(path);
            imageUrls.push(publicUrl.publicUrl);
        }

        if (input.externalStoreUrl) {
            const premiumResponse = await fetch('/api/listings/create-premium-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    title: input.name.trim(),
                    price: input.price,
                    description: input.description || '',
                    condition: input.condition,
                    direct_payment_link: input.externalStoreUrl.trim(),
                    seller_id: session.user.id,
                    image_url: imageUrls[0] || '',
                    listing_type: input.listingType,
                    free_delivery: input.freeDelivery,
                }),
            });
            const premiumPayload = await premiumResponse.json();
            if (!premiumResponse.ok || !premiumPayload?.url) throw new Error(premiumPayload?.error || 'Unable to start premium listing checkout.');
            return { requiresPayment: true, checkoutUrl: premiumPayload.url };
        }

        const submitResponse = await fetch('/api/tarot?action=submit-listing-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
                decks: [{
                    name: input.name.trim(),
                    price: input.price,
                    description: input.description || undefined,
                    listingType: input.listingType,
                    condition: input.condition,
                    freeDelivery: input.freeDelivery,
                    images: imageUrls,
                    imagesBase64: imageBase64,
                }],
            }),
        });
        const submitPayload = await submitResponse.json();
        if (!submitResponse.ok) throw new Error(submitPayload?.error || 'Unable to submit this listing.');

        if (!submitPayload.requiresPayment) {
            return { requiresPayment: false, listing: mapListing(submitPayload.listings[0]) };
        }

        const checkoutResponse = await fetch('/api/billing?product=listing-batch-fee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ batchId: submitPayload.batchId }),
        });
        const checkoutPayload = await checkoutResponse.json();
        if (!checkoutResponse.ok || !checkoutPayload?.url) throw new Error(checkoutPayload?.error || 'Unable to start listing fee checkout.');
        return { requiresPayment: true, checkoutUrl: checkoutPayload.url };
    } catch (error) {
        if (imagePaths.length > 0) await supabase.storage.from('listing-images').remove(imagePaths);
        throw error;
    }
}