import { isValidHttpUrl } from './url-validation.js';

const PREMIUM_LINK_DAYS = 30;
const LISTING_COLUMNS = 'id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status, is_ai_authenticated, external_store_url, external_link_active, external_link_expires_at';

function readNumbered(metadata, prefix) {
    return Object.keys(metadata)
        .filter((key) => new RegExp(`^${prefix}_\\d+$`).test(key))
        .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()))
        .map((key) => metadata[key]);
}

// Shared by the Stripe webhook and the client confirm step; premium_stripe_session_id is unique, so both are safe to run.
export async function createPremiumListingFromSession(supabase, session) {
    const { data: existing, error: existingError } = await supabase
        .from('listings')
        .select(LISTING_COLUMNS)
        .eq('premium_stripe_session_id', session.id)
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;

    const metadata = session.metadata || {};
    const description = metadata.description ?? readNumbered(metadata, 'description').join('');
    const numberedImages = readNumbered(metadata, 'image_url');
    const images = numberedImages.length ? numberedImages : (metadata.image_url ? [metadata.image_url] : []);
    const externalStoreUrl = isValidHttpUrl(metadata.direct_payment_link) ? metadata.direct_payment_link : null;

    const { data, error } = await supabase
        .from('listings')
        .insert([{
            seller_id: metadata.seller_id,
            name: metadata.title,
            price: parseFloat(metadata.price || '0'),
            description: description || null,
            condition: metadata.condition || 'good',
            external_store_url: externalStoreUrl,
            external_link_active: Boolean(externalStoreUrl),
            external_link_expires_at: externalStoreUrl ? new Date(Date.now() + PREMIUM_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString() : null,
            image: images[0] || null,
            images,
            listing_type: metadata.listing_type || 'sale',
            is_free_delivery: metadata.free_delivery === 'true',
            is_premium: true,
            // Set only by the server when the seller opted in and the AI check passed.
            authenticated: metadata.ai_authenticated === 'true',
            is_ai_authenticated: metadata.ai_authenticated === 'true',
            review_status: 'approved',
            premium_stripe_session_id: session.id,
        }])
        .select(LISTING_COLUMNS)
        .single();

    if (error?.code === '23505') {
        const { data: raced, error: racedError } = await supabase
            .from('listings')
            .select(LISTING_COLUMNS)
            .eq('premium_stripe_session_id', session.id)
            .single();
        if (racedError) throw racedError;
        return raced;
    }
    if (error) throw error;
    return data;
}
