import { createClient } from '@supabase/supabase-js';
import { handleNativeAppCors } from '../server/lib/native-cors.js';
import { logServerError } from '../server/lib/server-logger.js';

const MIN_LISTING_IMAGES = 3;
const MAX_LISTING_IMAGES = 6;
const LISTING_COLUMNS = 'id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, status';

export default async function handler(req, res) {
    if (handleNativeAppCors(req, res)) return;
    const action = req.query?.action;
    if (action === 'authenticate-vision' || action === 'submit-batch') {
        return res.status(410).json({ error: 'AI verification has been removed. Publish through submit-listing-batch instead.' });
    }
    if (req.method === 'GET' && action === 'status') return getBatchStatus(req, res);
    if (req.method === 'POST' && action === 'submit-listing-batch') return submitListingBatch(req, res);
    return res.status(400).json({ error: 'Unknown tarot action.' });
}

async function getAuthenticatedUser(req, res) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        res.status(503).json({ error: 'Listing storage is not configured yet.' });
        return null;
    }
    if (!token) {
        res.status(401).json({ error: 'Sign in first.' });
        return null;
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
        res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        return null;
    }
    return { supabase, user, supabaseUrl };
}

// Retained for purchases created before immediate publication was introduced.
async function getBatchStatus(req, res) {
    const auth = await getAuthenticatedUser(req, res);
    if (!auth) return;
    const { supabase, user } = auth;
    const batchId = req.query?.batchId;
    if (!batchId) return res.status(400).json({ error: 'A batch ID is required.' });
    try {
        const { data: batch, error } = await supabase
            .from('upload_batches')
            .select('id, deck_count, fee_amount, status')
            .eq('id', batchId)
            .eq('seller_id', user.id)
            .maybeSingle();
        if (error) throw error;
        if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
        return res.status(200).json({ status: batch.status, deckCount: batch.deck_count, feeAmount: batch.fee_amount });
    } catch (error) {
        logServerError('tarot:status', error);
        return res.status(500).json({ error: 'Unable to check batch status.' });
    }
}

async function submitListingBatch(req, res) {
    const auth = await getAuthenticatedUser(req, res);
    if (!auth) return;
    const { supabase, user, supabaseUrl } = auth;
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Provide a valid JSON listing submission.' });
    }
    const decks = Array.isArray(body?.decks) ? body.decks : [];
    if (decks.length === 0) return res.status(400).json({ error: 'A batch must contain at least one deck.' });
    const imagePrefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/listing-images/${user.id}/`;

    for (const deck of decks) {
        if (!['sale', 'swap', 'free'].includes(deck?.listingType)) return res.status(400).json({ error: 'Each deck needs a valid listing type.' });
        if (typeof deck.name !== 'string' || !deck.name.trim() || deck.name.trim().length > 120) return res.status(400).json({ error: 'Every deck needs a name of at most 120 characters.' });
        if (deck.description != null && (typeof deck.description !== 'string' || deck.description.length > 2000)) return res.status(400).json({ error: 'Descriptions must be 2,000 characters or fewer.' });
        if (typeof deck.price !== 'number' || !Number.isFinite(deck.price) || deck.price < 0) return res.status(400).json({ error: 'Provide a valid listing price.' });
        if (deck.listingType === 'sale' && deck.price <= 0) return res.status(400).json({ error: 'Sale listings must have a price greater than zero.' });
        if (deck.listingType !== 'sale' && deck.price !== 0) return res.status(400).json({ error: 'Swap and free listings must have a price of 0.00.' });
        if (deck.condition != null && !['new', 'like new', 'good', 'fair', 'poor'].includes(deck.condition)) return res.status(400).json({ error: 'Choose a valid deck condition.' });
        if (!Array.isArray(deck.images) || deck.images.length < MIN_LISTING_IMAGES || deck.images.length > MAX_LISTING_IMAGES) return res.status(400).json({ error: `Every deck needs between ${MIN_LISTING_IMAGES} and ${MAX_LISTING_IMAGES} images already uploaded to storage.` });
        for (const image of deck.images) {
            let url;
            try { url = new URL(image); } catch {
                return res.status(400).json({ error: 'Use images uploaded to your own listing storage.' });
            }
            if (typeof image !== 'string' || url.protocol !== 'https:' || url.username || url.password || !url.href.startsWith(imagePrefix)) {
                return res.status(400).json({ error: 'Use images uploaded to your own listing storage.' });
            }
        }
    }

    try {
        const { data: listings, error } = await supabase
            .from('listings')
            .insert(decks.map((deck) => ({
                seller_id: user.id,
                name: deck.name.trim(),
                price: deck.price,
                description: deck.description || null,
                listing_type: deck.listingType,
                image: deck.images[0],
                images: deck.images,
                is_free_delivery: deck.listingType !== 'free' && Boolean(deck.freeDelivery),
                condition: deck.condition || 'good',
                review_status: 'approved',
                requires_manual_review: false,
                is_active: true,
                status: 'active',
            })))
            .select(LISTING_COLUMNS);
        if (error || !listings?.length) throw error || new Error('No listings were saved.');
        return res.status(200).json({ feePence: 0, requiresPayment: false, listings });
    } catch (error) {
        logServerError('tarot:submit-listing-batch', error, { userId: user.id });
        return res.status(500).json({ error: 'Unable to save your listings. Please try again.' });
    }
}
