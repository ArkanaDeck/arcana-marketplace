import { Capacitor } from '@capacitor/core';
import { acknowledgeDriveTrafficFulfillment, isIosApp } from './app-store-purchase';
import { getSupabaseSession, supabase } from './supabase';

export type DeckCondition = 'new' | 'like new' | 'good' | 'fair' | 'poor';
export type DeckCategory = 'tarot' | 'oracle' | 'lenormand' | 'other';

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
    status: 'active' | 'sold' | 'completed';
    category?: DeckCategory;
    externalStoreUrl?: string;
    isPremium: boolean;
    aiVerified: boolean;
};

export type ListingRow = { id: string; seller_id: string; name: string; price: number | string; description: string | null; listing_type: 'sale' | 'swap' | 'free'; image: string | null; images: string[] | null; is_free_delivery: boolean; condition: DeckCondition; review_status?: 'approved' | 'pending_review' | 'rejected'; status?: 'active' | 'sold' | 'completed'; category?: DeckCategory; external_store_url?: string | null; external_link_active?: boolean | null; external_link_expires_at?: string | null; is_ai_authenticated?: boolean | null };

function activeExternalStoreUrl(listing: ListingRow) {
    const url = listing.external_store_url;
    if (!url || !listing.external_link_active || !/^https:\/\//i.test(url)) return undefined;
    if (listing.external_link_expires_at && new Date(listing.external_link_expires_at).getTime() < Date.now()) return undefined;
    return url;
}

export function mapListing(listing: ListingRow): MarketplaceListing {
    const images = listing.images || (listing.image ? [listing.image] : []);
    const externalStoreUrl = activeExternalStoreUrl(listing);
    // Premium = a paid store link that is still active and unexpired.
    return { id: listing.id, sellerId: listing.seller_id, name: listing.name, price: Number(listing.price), description: listing.description || undefined, listingType: listing.listing_type, image: images[0], images, freeDelivery: Boolean(listing.is_free_delivery), condition: listing.condition, reviewStatus: listing.review_status || 'approved', status: listing.status || 'active', category: listing.category, externalStoreUrl, isPremium: Boolean(externalStoreUrl), aiVerified: Boolean(listing.is_ai_authenticated) };
}

const LINK_COLUMNS = 'external_store_url, external_link_active, external_link_expires_at';
const DECK_DETAIL_COLUMNS = `id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, category, is_ai_authenticated, ${LINK_COLUMNS}`;

// Completed listings stay publicly reachable (is_active is cleared on completion) so search traffic can be redirected.
export async function loadDeckListing(listingId: string): Promise<MarketplaceListing | null> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase
        .from('listings')
        .select(DECK_DETAIL_COLUMNS)
        .eq('id', listingId)
        .eq('review_status', 'approved')
        .or('is_active.eq.true,status.eq.completed')
        .maybeSingle();
    if (error) throw new Error(error.message || 'Unable to load this deck.');
    return data ? mapListing(data) : null;
}

export async function loadSimilarActiveListings(category: DeckCategory, excludeListingId: string, limit = 4): Promise<MarketplaceListing[]> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase
        .from('listings')
        .select(DECK_DETAIL_COLUMNS)
        .eq('category', category)
        .eq('status', 'active')
        .eq('is_active', true)
        .eq('review_status', 'approved')
        .neq('id', excludeListingId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message || 'Unable to load similar decks.');
    return data.map(mapListing);
}

export async function loadListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.from('listings').select(`id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, is_ai_authenticated, ${LINK_COLUMNS}`).neq('status', 'completed').order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load listings.');
    return data.map(mapListing);
}

// Public marketplace feed: only shows paid/authenticated listings (is_active + review_status='approved'),
// with sale listings prioritized to the top, newest-first within each priority group.
export async function loadPublishedListings() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase
        .from('listings')
        .select(`id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, is_ai_authenticated, ${LINK_COLUMNS}`)
        .eq('is_active', true)
        .eq('review_status', 'approved')
        .neq('status', 'completed')
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Unable to load published listings.');

    // Array is already newest-first from the query above; a stable sort here keeps that order within each group.
    const listingPriority = (listing: { listing_type: string }) => (listing.listing_type === 'sale' ? 0 : 1);
    const prioritized = [...data].sort((a, b) => listingPriority(a) - listingPriority(b));
    return prioritized.map(mapListing);
}

export type CreateListingInput = Omit<MarketplaceListing, 'id' | 'sellerId' | 'image' | 'images' | 'reviewStatus' | 'status' | 'aiVerified' | 'isPremium'> & { imageFiles?: File[]; uploadedImageUrl?: string; reviewStatus?: MarketplaceListing['reviewStatus']; externalStoreUrl?: string; wantsAuthentication?: boolean; appStoreTransaction?: string };
export type UpdateListingInput = CreateListingInput & { existingImages: string[] };
export const MIN_LISTING_IMAGES = 3;
export const MAX_LISTING_IMAGES = 6;

function assertListingImageCount(imageCount: number) {
    if (imageCount < MIN_LISTING_IMAGES || imageCount > MAX_LISTING_IMAGES) {
        throw new Error(`Provide between ${MIN_LISTING_IMAGES} and ${MAX_LISTING_IMAGES} images for each listing.`);
    }
}

// Downscales and re-encodes an image client-side before it enters listing form state.
export async function compressImageFile(file: File, maxDimension = 1280, quality = 0.75): Promise<Blob> {
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

    const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

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
    assertListingImageCount(input.imageFiles?.length || 0);

    const imagePaths: string[] = [];
    const imageUrls: string[] = [];
    try {
        for (const file of (input.imageFiles || []).slice(0, MAX_LISTING_IMAGES)) {
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
            .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, is_ai_authenticated')
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
    assertListingImageCount(input.existingImages.length + (input.imageFiles?.length || 0));

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
            .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, is_ai_authenticated')
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

export async function loadBuyerSoldListingIds(): Promise<Set<string>> {
    const session = await getSupabaseSession();
    if (!session?.user || !supabase) return new Set();
    const { data, error } = await supabase
        .from('orders')
        .select('listing_id')
        .eq('buyer_id', session.user.id)
        .in('status', ['paid', 'dispatched', 'delivered']);
    if (error) throw new Error(error.message || 'Unable to load purchased listings.');
    return new Set((data || []).map((order) => order.listing_id).filter(Boolean));
}

export async function confirmOrderAccepted(listingId: string): Promise<void> {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in to confirm this order.');
    const response = await fetch('/api/confirm-order-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to confirm this order.');
}

export type PublishListingBundleResult =
    | { requiresPayment: true; checkoutUrl: string }
    | { requiresPayment: false; listing: MarketplaceListing };

export type PremiumListingDraft = {
    name: string;
    price: number;
    description: string;
    listingType: MarketplaceListing['listingType'];
    condition: DeckCondition;
    freeDelivery: boolean;
    externalStoreUrl: string;
    imageUrls: string[];
};

const PREMIUM_DRAFT_KEY = 'arkana_premium_listing_draft';

function savePremiumDraft(draft: PremiumListingDraft) {
    try {
        localStorage.setItem(PREMIUM_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // Draft restore is a convenience; the paid listing is still created from Stripe metadata.
    }
}

export function readPremiumDraft(): PremiumListingDraft | null {
    try {
        const raw = localStorage.getItem(PREMIUM_DRAFT_KEY);
        return raw ? JSON.parse(raw) as PremiumListingDraft : null;
    } catch {
        return null;
    }
}

export function clearPremiumDraft() {
    try {
        localStorage.removeItem(PREMIUM_DRAFT_KEY);
    } catch {
        // Ignore storage failures in private browsing.
    }
}

export async function confirmPremiumListing(sessionId: string): Promise<MarketplaceListing> {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before creating a listing.');
    const response = await fetch('/api/billing?product=premium-listing-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, 'X-Arkana-Native-App': String(Capacitor.isNativePlatform()) },
        body: JSON.stringify({ sessionId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.listing) throw new Error(payload?.error || 'Unable to publish your paid listing.');
    return mapListing(payload.listing);
}

// Unified batch pipeline (new submissions only): uploads images, submits a batch of exactly one
// deck to the same pipeline the multi-deck tarot authentication flow uses, then either returns
// the already-approved listing (fee = 0) or a Stripe Checkout URL for the stacked fee.
export async function publishListingBundle(input: CreateListingInput): Promise<PublishListingBundleResult> {
    if (isIosApp() && input.externalStoreUrl && !input.appStoreTransaction) {
        throw new Error('Purchase the store link promotion before publishing.');
    }
    const session = await getSupabaseSession();
    if (!session?.user || !session.access_token) throw new Error('Sign in before creating a listing.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!input.name.trim() || !Number.isFinite(input.price) || input.price < 0) throw new Error('Provide a valid listing name and price.');
    if (input.name.trim().length > 120) throw new Error('Listing names must be 120 characters or fewer.');
    if ((input.description || '').length > 2000) throw new Error('Descriptions must be 2,000 characters or fewer.');
    if (input.listingType === 'sale' && input.price <= 0) throw new Error('Sale listings must have a price greater than zero.');
    if (input.listingType !== 'sale' && input.price !== 0) throw new Error('Swap and free listings must have a price of 0.00.');
    if (!['new', 'like new', 'good', 'fair', 'poor'].includes(input.condition)) throw new Error('Choose a valid deck condition.');
    assertListingImageCount(input.imageFiles?.length || 0);

    const imagePaths: string[] = [];
    const imageUrls: string[] = input.uploadedImageUrl ? [input.uploadedImageUrl] : [];
    const imageBase64: string[] = [];
    try {
        const imageFiles = (input.imageFiles || []).slice(0, MAX_LISTING_IMAGES);
        if (input.wantsAuthentication && imageFiles[0]) imageBase64.push(await fileToDataUrl(imageFiles[0]));
        for (const file of imageFiles.slice(input.uploadedImageUrl ? 1 : 0)) {
            if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
            const compressed = await compressImageFile(file);
            const path = `${session.user.id}/${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('listing-images').upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
            if (uploadError) throw new Error(uploadError.message || 'Unable to upload listing image.');
            imagePaths.push(path);
            const { data: publicUrl } = supabase.storage.from('listing-images').getPublicUrl(path);
            imageUrls.push(publicUrl.publicUrl);
        }

        if (input.externalStoreUrl && isIosApp()) {
            const iapResponse = await fetch('/api/billing?product=premium-listing-iap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, 'X-Arkana-Platform': 'ios' },
                body: JSON.stringify({
                    signed_transaction: input.appStoreTransaction,
                    title: input.name.trim(),
                    price: input.price,
                    description: input.description || '',
                    condition: input.condition,
                    direct_payment_link: input.externalStoreUrl.trim(),
                    image_urls: imageUrls,
                    listing_type: input.listingType,
                    free_delivery: input.freeDelivery,
                    wants_authentication: Boolean(input.wantsAuthentication),
                    image_base64: imageBase64[0],
                }),
            });
            const iapPayload = await iapResponse.json();
            if (!iapResponse.ok || !iapPayload?.listing) throw new Error(iapPayload?.error || 'Unable to publish your promoted listing.');
            if (typeof iapPayload.fulfilledTransactionId !== 'string' || !iapPayload.fulfilledTransactionId) {
                throw new Error('The server did not confirm purchase fulfillment. Please retry publishing.');
            }
            acknowledgeDriveTrafficFulfillment(iapPayload.fulfilledTransactionId);
            return { requiresPayment: false, listing: mapListing(iapPayload.listing) };
        }

        if (input.externalStoreUrl) {
            const premiumResponse = await fetch('/api/listings/create-premium-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, 'X-Arkana-Native-App': String(Capacitor.isNativePlatform()) },
                body: JSON.stringify({
                    title: input.name.trim(),
                    price: input.price,
                    description: input.description || '',
                    condition: input.condition,
                    direct_payment_link: input.externalStoreUrl.trim(),
                    seller_id: session.user.id,
                    image_url: imageUrls[0] || '',
                    image_urls: imageUrls,
                    listing_type: input.listingType,
                    free_delivery: input.freeDelivery,
                    wants_authentication: Boolean(input.wantsAuthentication),
                    image_base64: imageBase64[0],
                }),
            });
            const premiumPayload = await premiumResponse.json();
            if (!premiumResponse.ok || !premiumPayload?.url) throw new Error(premiumPayload?.error || 'Unable to start premium listing checkout.');
            savePremiumDraft({
                name: input.name.trim(),
                price: input.price,
                description: input.description || '',
                listingType: input.listingType,
                condition: input.condition,
                freeDelivery: input.freeDelivery,
                externalStoreUrl: input.externalStoreUrl.trim(),
                imageUrls,
            });
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
                    wantsAuthentication: input.wantsAuthentication ?? false,
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
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, 'X-Arkana-Native-App': String(Capacitor.isNativePlatform()) },
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